import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { tripBudgets } from "../drizzle/schema";
import type { BudgetConfig } from "../shared/budget";
import { getDb } from "./db";

async function requireBudgetDb() {
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Budget storage is temporarily unavailable.",
    });
  return db;
}

/** Call only after the router has verified membership; no unscoped lookup is exposed. */
export async function getTripBudget(
  tripId: number
): Promise<BudgetConfig | null> {
  const db = await requireBudgetDb();
  const [row] = await db
    .select({
      amount: tripBudgets.amount,
      currency: tripBudgets.currency,
      warningPercent: tripBudgets.warningPercent,
    })
    .from(tripBudgets)
    .where(eq(tripBudgets.tripId, tripId))
    .limit(1);
  return row ?? null;
}

/** The trip primary key makes concurrent edits an atomic upsert of ONE shared config. */
export async function setTripBudget(
  tripId: number,
  config: BudgetConfig,
  updatedBy: number
): Promise<void> {
  const db = await requireBudgetDb();
  await db
    .insert(tripBudgets)
    .values({ tripId, ...config, updatedBy })
    .onDuplicateKeyUpdate({
      set: { ...config, updatedBy },
    });
}

/** This intentionally deletes only the budget row, never a ledger expense or a trip. */
export async function clearTripBudget(tripId: number): Promise<void> {
  const db = await requireBudgetDb();
  await db.delete(tripBudgets).where(eq(tripBudgets.tripId, tripId));
}
