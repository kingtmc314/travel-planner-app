import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type {
  FlightReference,
  FlightStatusResult,
} from "../shared/flightStatus";
import { protectedProcedure, router } from "./_core/trpc";
import {
  disableFlightWatch,
  flightObservationMatches,
  getOwnFlightWatch,
  isFlightStatusScheduleActive,
  listFlightWatches,
  loadAuthorizedFlightSource,
  publicObservation,
  requireAuthorizedFlightSource,
  setOwnFlightWatch,
  type FlightWatchState,
} from "./flightStatusPersistence";
import {
  checkFlightWatches,
  getBoundedFlightStatus,
} from "./flightStatusScheduled";

const referenceSchema = z
  .object({
    kind: z.enum(["trip", "passport"]),
    id: z.number().int().positive().max(2147483647),
  })
  .strict();
const sourceInput = z.object({ reference: referenceSchema }).strict();
// Cron identities are not app subscribers, even if the core protected middleware
// accepts the SDK's synthetic user. No admin/owner bypass is appropriate here.
const subscriberProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (
    !Number.isSafeInteger(ctx.user.id) ||
    ctx.user.id <= 0 ||
    (ctx.user as { isCron?: boolean }).isCron
  )
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Sign in to check your saved flights.",
    });
  return next();
});

async function ownWatchState(
  userId: number,
  reference: FlightReference
): Promise<FlightWatchState> {
  const source = await requireAuthorizedFlightSource(userId, reference);
  const watch = await getOwnFlightWatch(userId, reference);
  const enabled = !!watch?.enabled;
  const lastObservation =
    source.request &&
    watch?.lastObservation &&
    flightObservationMatches(watch.lastObservation, source.request)
      ? watch.lastObservation
      : null;
  return {
    reference,
    enabled,
    eligible: source.request !== null,
    lastCheckedAt: watch?.lastCheckedAt ?? null,
    lastObservation,
    scheduleActive: enabled && (await isFlightStatusScheduleActive()),
  };
}
const unsupported = (): FlightStatusResult => ({
  outcome: "unsupported",
  observation: null,
  checkedAt: Date.now(),
  message:
    "只支援有有效航班編號及日期的香港機場航班。 / A valid number/date and Hong Kong-linked route are required.",
  sourceUrl: "https://www.hongkongairport.com/en/flights/",
  experimentalRecentData: false,
});

export const flightStatusRouter = router({
  status: subscriberProcedure
    .input(sourceInput)
    .query(async ({ ctx, input }): Promise<FlightStatusResult> => {
      const source = await requireAuthorizedFlightSource(
        ctx.user.id,
        input.reference
      );
      if (!source.request) return unsupported();
      let result: FlightStatusResult;
      try {
        result = await getBoundedFlightStatus(source.request);
      } catch {
        result = {
          ...unsupported(),
          outcome: "unavailable",
          message:
            "機場資料暫時無法使用。 / Airport information is temporarily unavailable.",
        };
      }
      // Permission/source edits during a slow provider response must not expose it.
      const latest = await requireAuthorizedFlightSource(
        ctx.user.id,
        input.reference
      );
      if (JSON.stringify(latest.request) !== JSON.stringify(source.request))
        return unsupported();
      return { ...result, observation: publicObservation(result.observation) };
    }),
  watchState: subscriberProcedure
    .input(sourceInput)
    .query(({ ctx, input }) => ownWatchState(ctx.user.id, input.reference)),
  setWatch: subscriberProcedure
    .input(sourceInput.extend({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await setOwnFlightWatch(ctx.user.id, input.reference, input.enabled);
      return ownWatchState(ctx.user.id, input.reference);
    }),
  watches: subscriberProcedure.query(
    async ({
      ctx,
    }): Promise<{ references: FlightReference[]; scheduleActive: boolean }> => {
      const watches = await listFlightWatches(ctx.user.id, 100);
      const references: FlightReference[] = [];
      for (const watch of watches) {
        const reference = { kind: watch.sourceKind, id: watch.sourceId };
        const source = await loadAuthorizedFlightSource(ctx.user.id, reference);
        if (!source || !source.request) {
          await disableFlightWatch(ctx.user.id, reference);
          continue;
        }
        references.push(reference);
      }
      return {
        references,
        scheduleActive:
          references.length > 0 && (await isFlightStatusScheduleActive()),
      };
    }
  ),
  checkWatched: subscriberProcedure.mutation(({ ctx }) =>
    checkFlightWatches({ userId: ctx.user.id })
  ),
});
