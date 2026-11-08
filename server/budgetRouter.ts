import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  budgetConversionCandidates,
  buildBudgetSummary,
  isSupportedBudgetCurrency,
  normalizeBudgetAmount,
  normalizeBudgetCurrency,
  type BudgetConversion,
  type BudgetExpense,
  type TripBudgetEntry,
} from "../shared/budget";
import { protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";
import * as persistence from "./budgetPersistence";
import { convertExpenseAmounts } from "./currency_router";

const tripInput = z.object({ tripId: z.number().int().positive() });
const setInput = tripInput.extend({
  amount: z
    .string()
    .max(32)
    .refine(
      value => normalizeBudgetAmount(value) !== null,
      "Budget must be a positive decimal, at most 9999999999.99, with up to two decimal places"
    ),
  currency: z
    .string()
    .max(10)
    .transform(normalizeBudgetCurrency)
    .refine(
      isSupportedBudgetCurrency,
      "Choose a supported three-letter currency code"
    ),
  warningPercent: z.number().int().min(1).max(100),
});

async function authorize(tripId: number, userId: number, edit = false) {
  if (!(await db.getDb()))
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Budget data is temporarily unavailable.",
    });
  // Joining membership first prevents exposing trip, budget, or expense data to outsiders.
  const trip = await db.getTripById(tripId, userId);
  if (!trip || !["owner", "editor", "viewer"].includes(trip.userRole))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This trip is not available to you.",
    });
  if (edit && trip.userRole !== "owner" && trip.userRole !== "editor")
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only trip owners and editors can change the shared budget.",
    });
  return trip;
}

async function readBudget(
  trip: NonNullable<Awaited<ReturnType<typeof db.getTripById>>>
): Promise<TripBudgetEntry> {
  const [budget, expenses] = await Promise.all([
    persistence.getTripBudget(trip.id),
    db.getTripExpenses(trip.id),
  ]);
  const target = budget?.currency ?? trip.baseCurrency;
  // An unset budget discloses original totals but does not request paid/time-consuming FX.
  const candidates = budget ? budgetConversionCandidates(expenses, target) : [];
  const conversions = new Map<number, BudgetConversion>();
  // Isolate each expense so one legacy invalid row or unavailable quote cannot poison others.
  // Four workers bound logical conversion concurrency; currency_router also bounds HTTP globally.
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, candidates.length) }, async () => {
      while (cursor < candidates.length) {
        const expense: BudgetExpense = candidates[cursor++];
        try {
          const [converted] = await convertExpenseAmounts([expense], target, {
            allowRefunds: true,
          });
          if (converted) conversions.set(expense.id, converted);
        } catch {
          // No invented latest/fallback rate: absent conversion is disclosed as incomplete.
        }
      }
    })
  );
  return {
    tripId: trip.id,
    tripName: trip.name,
    baseCurrency: trip.baseCurrency,
    canEdit: trip.userRole === "owner" || trip.userRole === "editor",
    budget,
    summary: buildBudgetSummary(expenses, target, budget, conversions),
  };
}

/** Register as appRouter.budgets after applying 0002_trip_budgets.sql. */
export const budgetRouter = router({
  get: protectedProcedure.input(tripInput).query(async ({ ctx, input }) => {
    return readBudget(await authorize(input.tripId, ctx.user.id));
  }),
  set: protectedProcedure.input(setInput).mutation(async ({ ctx, input }) => {
    await authorize(input.tripId, ctx.user.id, true);
    await persistence.setTripBudget(
      input.tripId,
      {
        amount: normalizeBudgetAmount(input.amount)!,
        currency: input.currency,
        warningPercent: input.warningPercent,
      },
      ctx.user.id
    );
    return { success: true } as const;
  }),
  clear: protectedProcedure
    .input(tripInput)
    .mutation(async ({ ctx, input }) => {
      await authorize(input.tripId, ctx.user.id, true);
      await persistence.clearTripBudget(input.tripId);
      return { success: true } as const;
    }),
});
