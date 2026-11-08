import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { connectedTime, parseConnectedDuration } from "../shared/connected";
import {
  normalizeFlightLookupNumber,
  normalizeFlightLookupStoredDate,
  validFlightLookupDate,
  type FlightLookupCandidate,
  type FlightLookupResult,
} from "../shared/flightLookup";
import { protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

const inputSchema = z.object({
  flightNumber: z
    .string()
    .max(128)
    .transform(normalizeFlightLookupNumber)
    .refine(
      value => value.length > 0 && value.length <= 12,
      "Invalid flight number"
    ),
  date: z.string().refine(validFlightLookupDate, "Use a valid YYYY-MM-DD date"),
  tripId: z.number().int().positive().max(2147483647).optional(),
});

const text = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";
const airport = (value: unknown): string => {
  const code = text(value).toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : "";
};
const metric = (value: unknown): number | null => {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^\d+(?:\.\d+)?$/.test(value.trim()))
    return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 && number <= 2147483647
    ? number
    : null;
};
const duration = (value: unknown): number | null => {
  const number = metric(value);
  return number !== null && Number.isInteger(number) ? number : null;
};
const positiveId = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const readableRole = (value: unknown): boolean =>
  value === "owner" || value === "editor" || value === "viewer";

/** Never trust a trip-list join or an unexpected membership fixture alone. */
async function authorizedTrip(
  tripId: number,
  userId: number,
  required: boolean
) {
  const membership = await db.getUserMembership(tripId, userId);
  if (
    !membership ||
    membership.userId !== userId ||
    membership.tripId !== tripId ||
    !readableRole(membership.role)
  ) {
    if (!required) return null;
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Trip membership required",
    });
  }
  const trip = await db.getTripById(tripId, userId);
  if (!trip || trip.id !== tripId) {
    if (!required) return null;
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Trip not found or access denied",
    });
  }
  return trip;
}

function completeness(candidate: FlightLookupCandidate): number {
  return [
    candidate.airline,
    candidate.fromCity,
    candidate.toCity,
    candidate.departTime,
    candidate.arriveTime,
    candidate.durationMinutes,
    candidate.distanceKm,
  ].filter(value => value !== "" && value !== null).length;
}

/** Missing details can duplicate a fuller saved copy, but never invent/merge
 * fields or collapse conflicting routes, clocks, elapsed times or distances.
 * Equal completeness preserves source order (the explicit trip is preferred).
 */
function deduplicate(
  candidates: FlightLookupCandidate[]
): FlightLookupCandidate[] {
  const sorted = candidates
    .map((candidate, index) => ({ candidate, index }))
    .sort(
      (a, b) =>
        completeness(b.candidate) - completeness(a.candidate) ||
        a.index - b.index
    );
  const unique: FlightLookupCandidate[] = [];
  for (const { candidate } of sorted) {
    const duplicate = unique.some(
      existing =>
        existing.flightNumber === candidate.flightNumber &&
        existing.date === candidate.date &&
        existing.fromCode === candidate.fromCode &&
        existing.toCode === candidate.toCode &&
        (
          ["departTime", "arriveTime", "durationMinutes", "distanceKm"] as const
        ).every(
          key =>
            existing[key] === candidate[key] ||
            candidate[key] === "" ||
            candidate[key] === null
        )
    );
    if (!duplicate) unique.push(candidate);
  }
  return unique.slice(0, 100);
}

export const flightLookupRouter = router({
  byNumber: protectedProcedure
    .input(inputSchema)
    .query(async ({ ctx, input }): Promise<FlightLookupResult> => {
      // Existing read helpers return [] when no DB exists. Fail explicitly rather
      // than falsely claiming there were no saved flights. Never configure a provider.
      if (!(await db.getDb()))
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      const userId = ctx.user.id;
      // Scope authorization is deliberately before ANY passport/list/flight source.
      const scopeTrip =
        input.tripId === undefined
          ? null
          : await authorizedTrip(input.tripId, userId, true);
      const passportRows = await db.getPastFlights(userId);
      const listedTrips = await db.getUserTrips(userId);
      const candidates: FlightLookupCandidate[] = [];
      const { flightNumber, date } = input;
      const matches = (number: unknown, storedDate: unknown) =>
        typeof number === "string" &&
        normalizeFlightLookupNumber(number) === flightNumber &&
        normalizeFlightLookupStoredDate(storedDate) === date;

      // The requested trip is preferred when equally complete, but lookup also
      // includes the caller's invited trips. Shared itinerary logistics are readable
      // by viewers; this endpoint performs no editing and reads no other passports.
      const tripsToRead = new Map<
        number,
        Awaited<ReturnType<typeof db.getTripById>>
      >();
      if (scopeTrip) tripsToRead.set(scopeTrip.id, scopeTrip);
      for (const listed of listedTrips) {
        if (!positiveId(listed.id) || tripsToRead.has(listed.id)) continue;
        const trip = await authorizedTrip(listed.id, userId, false);
        if (trip) tripsToRead.set(trip.id, trip);
      }
      for (const [tripId, trip] of Array.from(tripsToRead.entries())) {
        if (!trip) continue;
        const rows = await db.getTripFlights(tripId);
        for (const row of rows) {
          if (
            row.tripId !== tripId ||
            !positiveId(row.id) ||
            !matches(row.flightNumber, row.date)
          )
            continue;
          const fromCode = airport(row.fromCode),
            toCode = airport(row.toCode);
          if (!fromCode || !toCode || fromCode === toCode) continue;
          // Explicit whitelist: no notes, booking references, payment or seat fields.
          candidates.push({
            id: `trip:${tripId}:flight:${row.id}`,
            flightNumber,
            date,
            airline: text(row.airline),
            fromCode,
            fromCity: text(row.fromCity),
            toCode,
            toCity: text(row.toCity),
            departTime: connectedTime(row.departTime) ?? "",
            arriveTime: connectedTime(row.arriveTime) ?? "",
            durationMinutes: parseConnectedDuration(row.duration),
            distanceKm: null,
            source: "trip",
            sourceLabel: text(trip.name) || "Saved trip",
          });
        }
      }
      for (const row of passportRows) {
        // Defence in depth: a broken DB helper/fixture must never leak another user.
        if (
          row.userId !== userId ||
          !positiveId(row.id) ||
          !matches(row.flightNumber, row.flightDate)
        )
          continue;
        const fromCode = airport(row.departureAirport),
          toCode = airport(row.arrivalAirport);
        if (!fromCode || !toCode || fromCode === toCode) continue;
        candidates.push({
          id: `passport:${userId}:flight:${row.id}`,
          flightNumber,
          date,
          airline: text(row.airline),
          fromCode,
          fromCity: text(row.departureCity),
          toCode,
          toCity: text(row.arrivalCity),
          // The passport schema stores no local departure/arrival clock.
          departTime: "",
          arriveTime: "",
          durationMinutes: duration(row.durationMinutes),
          distanceKm: metric(row.distanceKm),
          source: "passport",
          sourceLabel: "Your flight passport",
        });
      }
      const uniqueCandidates = deduplicate(candidates);
      return {
        flightNumber,
        date,
        candidates: uniqueCandidates,
        providerConfigured: false,
        onlineStatus: "not_configured",
        status:
          uniqueCandidates.length === 0
            ? "not_found"
            : uniqueCandidates.length === 1
              ? "matched"
              : "ambiguous",
        warnings: [],
      };
    }),
});
