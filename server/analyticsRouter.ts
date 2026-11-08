import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { buildTravelOverview, type AnalyticsBundle } from "../shared/analytics";

/** The only trip source is getUserTrips, whose SQL requires the caller's membership. */
export const analyticsRouter = router({
  overview: protectedProcedure
    .input(
      z
        .object({ year: z.number().int().min(1000).max(9999).optional() })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      // db helpers normally return []; do not disguise unavailable storage as real zero data.
      if (!(await db.getDb()))
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message: "Travel analytics data is temporarily unavailable.",
        });
      const [memberTrips, passport, countries] = await Promise.all([
        db.getUserTrips(ctx.user.id),
        db.getPastFlights(ctx.user.id),
        db.getVisitedCountries(ctx.user.id),
      ]);
      const uniqueTrips = Array.from(
        new Map(memberTrips.map(trip => [trip.id, trip])).values()
      );
      const bundles: AnalyticsBundle[] = [];
      // Bounded batches avoid opening a query fan-out for every historical trip at once.
      for (let offset = 0; offset < uniqueTrips.length; offset += 4) {
        const batch = await Promise.all(
          uniqueTrips.slice(offset, offset + 4).map(async trip => {
            const [days, activities, expenses, flights, hotels, members, pins] =
              await Promise.all([
                db.getItineraryDays(trip.id),
                db.getTripActivities(trip.id),
                db.getTripExpenses(trip.id),
                db.getTripFlights(trip.id),
                db.getTripAccommodations(trip.id),
                db.getTripMembers(trip.id),
                db.getMapPins(trip.id),
              ]);
            return {
              trip,
              days,
              activities,
              expenses,
              flights,
              hotels,
              members: members.map(row => ({ userId: row.member.userId })),
              pins,
            } satisfies AnalyticsBundle;
          })
        );
        bundles.push(...batch);
      }
      return buildTravelOverview({
        userId: ctx.user.id,
        bundles,
        passport,
        countries,
        year: input?.year,
      });
    }),
});
