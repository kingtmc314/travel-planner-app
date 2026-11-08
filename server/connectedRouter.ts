import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  isIataCode,
  normalizeIataCode,
  getHongKongDateInput,
} from "../shared/flightPassport";
import {
  appendConnectedNote,
  connectedActivityKey,
  connectedAmount,
  connectedCoordinates,
  connectedCurrency,
  connectedDate,
  connectedFlightKey,
  connectedPassportDate,
  connectedSourceMarker,
  connectedText,
  connectedTime,
  hasConnectedSource,
  parseConnectedDuration,
  type ConnectedActivitySnapshot,
  type ConnectedLogisticsResult,
  type ConnectedValidatedImportResult,
} from "../shared/connected";
import type {
  Activity,
  InsertActivity,
  InsertExpense,
  InsertMapPin,
} from "../drizzle/schema";
import { protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

/** Inject existing passport derivation logic without circular imports or modifying its behavior. */
export type ConnectedPassportHelpers = {
  resolveAirportCountry: (
    airport: string | null | undefined,
    supplied?: string | null
  ) => string | null;
  syncPassportCountriesFromFlights: (userId: number) => Promise<unknown>;
};

const tripInput = z.object({ tripId: z.number().int().positive() });
const selectionInput = tripInput.extend({
  activityIds: z.array(z.number().int().positive()).max(1000),
});

// Serialize read/deduplicate/write operations in this server process. No schema or history changes.
const pending = new Map<string, Promise<void>>();
async function serialized<T>(
  key: string,
  operation: () => Promise<T>
): Promise<T> {
  const previous = pending.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  const tail = previous.then(() => gate);
  pending.set(key, tail);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (pending.get(key) === tail) pending.delete(key);
  }
}

async function authorize(tripId: number, userId: number, editor: boolean) {
  if (!(await db.getDb()))
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database not available",
    });
  const membership = await db.getUserMembership(tripId, userId);
  if (
    !membership ||
    (editor && membership.role !== "owner" && membership.role !== "editor")
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: editor
        ? "Only trip owners and editors can import shared data"
        : "Trip membership required",
    });
  }
  const trip = await db.getTripById(tripId, userId);
  if (!trip || trip.id !== tripId)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Trip not found or access denied",
    });
  return trip;
}

function assertTripRecords(records: Array<{ tripId: number }>, tripId: number) {
  if (records.some(record => record.tripId !== tripId)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Source record does not belong to this trip",
    });
  }
}

async function selectedActivities(tripId: number, activityIds: number[]) {
  const records = await db.getTripActivities(tripId);
  assertTripRecords(records, tripId);
  const byId = new Map(records.map(record => [record.id, record]));
  const ids = Array.from(new Set(activityIds));
  // Validate the entire selection before any writes, including mixed valid/foreign IDs.
  if (ids.some(id => !byId.has(id))) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Every selected activity must belong to this trip",
    });
  }
  return ids.map(id => byId.get(id)!);
}

function activitySnapshot(
  activity: Pick<
    Activity,
    "title" | "location" | "startTime" | "endTime" | "category"
  >,
  date: string
): ConnectedActivitySnapshot {
  return {
    date,
    title: activity.title,
    location: activity.location,
    startTime: activity.startTime,
    endTime: activity.endTime,
    category: activity.category,
  };
}

function expenseCategory(
  category: Activity["category"]
): InsertExpense["category"] {
  return category === "hotel" ? "accommodation" : (category ?? "other");
}
function pinCategory(category: Activity["category"]): InsertMapPin["category"] {
  if (category === "food") return "restaurant";
  if (
    category === "hotel" ||
    category === "transport" ||
    category === "attraction"
  )
    return category;
  return "other";
}

function expenseKey(
  expense: Pick<
    InsertExpense,
    "title" | "amount" | "currency" | "category" | "paidBy" | "date"
  >
): string {
  return JSON.stringify([
    connectedText(expense.title),
    connectedAmount(expense.amount),
    connectedCurrency(expense.currency),
    expense.category ?? "other",
    expense.paidBy,
    connectedDate(expense.date),
  ]);
}
function pinKey(pin: Pick<InsertMapPin, "title" | "lat" | "lng">): string {
  const coordinates = connectedCoordinates(pin.lat, pin.lng);
  return JSON.stringify([
    connectedText(pin.title),
    coordinates?.lat,
    coordinates?.lng,
  ]);
}

export function createConnectedRouter(
  passportHelpers: ConnectedPassportHelpers
) {
  return router({
    importFlightsToPassport: protectedProcedure
      .input(tripInput)
      .mutation(({ ctx, input }) =>
        serialized(`passport:${ctx.user.id}`, async () => {
          await authorize(input.tripId, ctx.user.id, false);
          const [flights, existing] = await Promise.all([
            db.getTripFlights(input.tripId),
            db.getPastFlights(ctx.user.id),
          ]);
          assertTripRecords(flights, input.tripId);
          if (existing.some(flight => flight.userId !== ctx.user.id))
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Passport ownership mismatch",
            });
          const keys = new Set(
            existing.flatMap(flight => {
              const date = connectedDate(flight.flightDate);
              return date
                ? [
                    connectedFlightKey(
                      date,
                      flight.departureAirport,
                      flight.arrivalAirport,
                      flight.flightNumber
                    ),
                  ]
                : [];
            })
          );
          const result: ConnectedValidatedImportResult = {
            created: 0,
            skipped: 0,
            invalid: 0,
          };
          const today = getHongKongDateInput();
          for (const flight of flights) {
            const date = connectedDate(flight.date);
            const flightNumber =
              flight.flightNumber?.trim().replace(/\s+/g, "").toUpperCase() ||
              null;
            if (
              !date ||
              !isIataCode(flight.fromCode) ||
              !isIataCode(flight.toCode) ||
              normalizeIataCode(flight.fromCode) ===
                normalizeIataCode(flight.toCode) ||
              (flightNumber !== null && flightNumber.length > 20)
            ) {
              result.invalid++;
              continue;
            }
            if (date > today) {
              result.skipped++;
              continue;
            }
            const marker = connectedSourceMarker(
              "passport",
              input.tripId,
              flight.id
            );
            const key = connectedFlightKey(
              date,
              flight.fromCode,
              flight.toCode,
              flight.flightNumber
            );
            if (
              keys.has(key) ||
              existing.some(record => hasConnectedSource(record.notes, marker))
            ) {
              result.skipped++;
              continue;
            }
            const id = await db.addPastFlight({
              userId: ctx.user.id,
              flightNumber,
              airline: flight.airline,
              airlineCode: null,
              departureAirport: normalizeIataCode(flight.fromCode),
              departureCity: flight.fromCity,
              departureCountry: passportHelpers.resolveAirportCountry(
                flight.fromCode
              ),
              arrivalAirport: normalizeIataCode(flight.toCode),
              arrivalCity: flight.toCity,
              arrivalCountry: passportHelpers.resolveAirportCountry(
                flight.toCode
              ),
              flightDate: connectedPassportDate(date),
              flightYear: Number(date.slice(0, 4)),
              durationMinutes: parseConnectedDuration(flight.duration),
              distanceKm: null,
              seatClass: "economy",
              notes: appendConnectedNote(flight.notes, marker),
            });
            if (!id)
              throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Passport record was not saved",
              });
            keys.add(key);
            result.created++;
          }
          // Also repairs missing countries on an idempotent retry after a prior partial failure.
          await passportHelpers.syncPassportCountriesFromFlights(ctx.user.id);
          return result;
        })
      ),

    syncLogisticsToItinerary: protectedProcedure
      .input(tripInput)
      .mutation(({ ctx, input }) =>
        serialized(`trip:${input.tripId}`, async () => {
          const trip = await authorize(input.tripId, ctx.user.id, true);
          const [flights, hotels, days, records] = await Promise.all([
            db.getTripFlights(input.tripId),
            db.getTripAccommodations(input.tripId),
            db.getItineraryDays(input.tripId),
            db.getTripActivities(input.tripId),
          ]);
          for (const list of [flights, hotels, days, records])
            assertTripRecords(list, input.tripId);
          const dayDates = new Map(
            days.map(day => [day.id, connectedDate(day.date)])
          );
          if (records.some(record => !dayDates.has(record.dayId)))
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "An itinerary activity has no day in this trip",
            });
          const result: ConnectedLogisticsResult = {
            created: 0,
            updated: 0,
            skipped: 0,
            invalid: 0,
          };
          const candidates: Array<{
            snapshot: ConnectedActivitySnapshot;
            marker: string;
            notes: string | null;
          }> = [];
          for (const flight of flights) {
            const date = connectedDate(flight.date);
            if (
              !date ||
              !isIataCode(flight.fromCode) ||
              !isIataCode(flight.toCode) ||
              normalizeIataCode(flight.fromCode) ===
                normalizeIataCode(flight.toCode)
            ) {
              result.invalid++;
              continue;
            }
            const route = `${normalizeIataCode(flight.fromCode)} → ${normalizeIataCode(flight.toCode)}`;
            candidates.push({
              marker: connectedSourceMarker("flight", input.tripId, flight.id),
              notes: flight.notes,
              snapshot: {
                date,
                title: `Flight ${flight.flightNumber?.trim() || route}`.slice(
                  0,
                  255
                ),
                location: route,
                startTime: connectedTime(flight.departTime),
                endTime: connectedTime(flight.arriveTime),
                category: "transport",
              },
            });
            // App-entered clock values are Hong Kong UTC+8; never infer elapsed duration or an arrival date.
            candidates[candidates.length - 1].notes = appendConnectedNote(
              flight.notes,
              ...(flight.arriveTime
                ? [
                    `Arrival time as entered (Hong Kong UTC+8; arrival date not inferred): ${flight.arriveTime}`,
                  ]
                : [])
            );
          }
          for (const hotel of hotels) {
            const checkIn = connectedDate(hotel.checkIn),
              checkOut = connectedDate(hotel.checkOut);
            const reversed = !!checkIn && !!checkOut && checkOut < checkIn;
            for (const event of ["checkin", "checkout"] as const) {
              const date = event === "checkin" ? checkIn : checkOut;
              if (!date || !hotel.name.trim() || reversed) {
                result.invalid++;
                continue;
              }
              candidates.push({
                marker: connectedSourceMarker(
                  event === "checkin" ? "hotel-checkin" : "hotel-checkout",
                  input.tripId,
                  hotel.id
                ),
                notes: hotel.notes,
                snapshot: {
                  date,
                  title:
                    `${event === "checkin" ? "Check in" : "Check out"}: ${hotel.name}`.slice(
                      0,
                      255
                    ),
                  location: hotel.city,
                  startTime: null,
                  endTime: null,
                  category: "hotel",
                },
              });
            }
          }
          async function ensureDay(date: string) {
            const matching = days.find(day => connectedDate(day.date) === date);
            if (matching) return matching.id;
            const start = connectedDate(trip.startDate);
            const offset = start
              ? Math.round(
                  (connectedPassportDate(date).getTime() -
                    connectedPassportDate(start).getTime()) /
                    86400000
                ) + 1
              : 0;
            const next = Math.max(0, ...days.map(day => day.dayNumber)) + 1;
            const dayNumber =
              offset > 0 && !days.some(day => day.dayNumber === offset)
                ? offset
                : next;
            const id = await db.addItineraryDay({
              tripId: input.tripId,
              date,
              dayNumber,
              title: `Day ${dayNumber}`,
            });
            if (!id)
              throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Itinerary day was not saved",
              });
            days.push({
              id,
              tripId: input.tripId,
              date,
              dayNumber,
              title: `Day ${dayNumber}`,
              notes: null,
              createdAt: new Date(),
              activities: [],
            });
            dayDates.set(id, date);
            return id;
          }
          for (const candidate of candidates) {
            const { snapshot, marker } = candidate;
            const linked = records.filter(record =>
              hasConnectedSource(record.notes, marker)
            );
            const natural = connectedActivityKey(snapshot);
            const duplicate = records.some(record => {
              const date = dayDates.get(record.dayId);
              return (
                date &&
                connectedActivityKey(activitySnapshot(record, date)) ===
                  natural &&
                !linked.some(item => item.id === record.id)
              );
            });
            // Insert-only: a stable source marker prevents duplicates even after human/source edits.
            // Existing activities, fields, notes and history are never changed; updated is always zero.
            if (linked.length > 0 || duplicate) {
              result.skipped++;
              continue;
            }
            const dayId = await ensureDay(snapshot.date);
            const data: InsertActivity = {
              tripId: input.tripId,
              dayId,
              title: snapshot.title,
              location: snapshot.location,
              startTime: snapshot.startTime,
              endTime: snapshot.endTime,
              category: snapshot.category as InsertActivity["category"],
              notes: appendConnectedNote(candidate.notes, marker),
              sortOrder:
                Math.max(
                  -1,
                  ...records
                    .filter(record => record.dayId === dayId)
                    .map(record => record.sortOrder ?? 0)
                ) + 1,
            };
            const id = await db.addActivity(data);
            if (!id)
              throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Itinerary activity was not saved",
              });
            records.push({
              ...data,
              id,
              cost: null,
              currency: null,
              lat: null,
              lng: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            } as Activity);
            result.created++;
          }
          return result;
        })
      ),

    importActivityExpenses: protectedProcedure
      .input(selectionInput)
      .mutation(({ ctx, input }) =>
        serialized(`trip:${input.tripId}`, async () => {
          const trip = await authorize(input.tripId, ctx.user.id, true);
          const [selected, days, existing] = await Promise.all([
            selectedActivities(input.tripId, input.activityIds),
            db.getItineraryDays(input.tripId),
            db.getTripExpenses(input.tripId),
          ]);
          assertTripRecords(days, input.tripId);
          assertTripRecords(existing, input.tripId);
          const dayById = new Map(days.map(day => [day.id, day]));
          if (selected.some(activity => !dayById.has(activity.dayId)))
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Selected activity day does not belong to this trip",
            });
          const result = { created: 0, skipped: 0 };
          const keys = new Set(existing.map(expenseKey));
          for (const activity of selected) {
            const marker = connectedSourceMarker(
              "expense",
              input.tripId,
              activity.id
            );
            if (
              existing.some(expense =>
                hasConnectedSource(expense.notes, marker)
              )
            ) {
              result.skipped++;
              continue;
            }
            const amount = connectedAmount(activity.cost);
            const date = connectedDate(dayById.get(activity.dayId)!.date);
            const currency =
              connectedCurrency(activity.currency) ??
              connectedCurrency(trip.baseCurrency);
            if (!amount || !date || !currency || !activity.title.trim()) {
              result.skipped++;
              continue;
            }
            const data: InsertExpense = {
              tripId: input.tripId,
              title: activity.title,
              amount,
              currency,
              date,
              category: expenseCategory(activity.category),
              paidBy: ctx.user.id,
              paidByName: ctx.user.name,
              notes: appendConnectedNote(activity.notes, marker),
            };
            const key = expenseKey(data);
            if (keys.has(key)) {
              result.skipped++;
              continue;
            }
            const id = await db.addExpense(data);
            if (!id)
              throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Expense was not saved",
              });
            keys.add(key);
            result.created++;
          }
          return result;
        })
      ),

    importActivityPins: protectedProcedure
      .input(selectionInput)
      .mutation(({ ctx, input }) =>
        serialized(`trip:${input.tripId}`, async () => {
          await authorize(input.tripId, ctx.user.id, true);
          const [selected, existing] = await Promise.all([
            selectedActivities(input.tripId, input.activityIds),
            db.getMapPins(input.tripId),
          ]);
          assertTripRecords(existing, input.tripId);
          const result: ConnectedValidatedImportResult = {
            created: 0,
            skipped: 0,
            invalid: 0,
          };
          const keys = new Set(existing.map(pinKey));
          for (const activity of selected) {
            const marker = connectedSourceMarker(
              "pin",
              input.tripId,
              activity.id
            );
            if (existing.some(pin => hasConnectedSource(pin.notes, marker))) {
              result.skipped++;
              continue;
            }
            const coordinates = connectedCoordinates(
              activity.lat,
              activity.lng
            );
            if (!coordinates || !activity.title.trim()) {
              result.invalid++;
              continue;
            }
            const data: InsertMapPin = {
              tripId: input.tripId,
              title: activity.title,
              ...coordinates,
              category: pinCategory(activity.category),
              address: activity.location,
              notes: appendConnectedNote(activity.notes, marker),
            };
            const key = pinKey(data);
            if (keys.has(key)) {
              result.skipped++;
              continue;
            }
            const id = await db.addMapPin(data);
            if (!id)
              throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Map pin was not saved",
              });
            keys.add(key);
            result.created++;
          }
          return result;
        })
      ),
  });
}
