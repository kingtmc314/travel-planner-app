import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import * as db from "./db";
import type { TrpcContext } from "./_core/context";
import {
  connectedAmount,
  connectedCoordinates,
  connectedCurrency,
  connectedDate,
  connectedPassportDate,
  connectedSourceMarker,
  parseConnectedDuration,
} from "../shared/connected";

vi.mock("./db");

const mock = vi.mocked(db);
const tripId = 10;
let store: {
  flights: any[];
  hotels: any[];
  days: any[];
  activities: any[];
  expenses: any[];
  pins: any[];
  passport: any[];
  countries: any[];
};
let trip: any;
let role: "owner" | "editor" | "viewer";
let nextId: number;
const clone = <T>(value: T): T => structuredClone(value);

function context(userId: number | null = 7): TrpcContext {
  return {
    user:
      userId === null
        ? null
        : {
            id: userId,
            openId: `test-${userId}`,
            name: "Current Payer",
            email: "payer@example.com",
            loginMethod: "test",
            role: "user",
            createdAt: new Date(),
            updatedAt: new Date(),
            lastSignedIn: new Date(),
          },
    req: { headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}
const caller = (userId: number | null = 7) =>
  appRouter.createCaller(context(userId)).connected;
function flight(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    tripId,
    date: "2026-06-19",
    flightNumber: " cx 123 ",
    airline: "Cathay",
    fromCode: " hkg ",
    toCode: "nrt",
    fromCity: "Hong Kong",
    toCity: "Tokyo",
    departTime: "23:00",
    arriveTime: "07:00",
    duration: "3h 45m",
    notes: "Original flight notes",
    ...overrides,
  };
}
function activity(overrides: Record<string, unknown> = {}) {
  return {
    id: 20,
    tripId,
    dayId: 100,
    title: "Hotel",
    location: "Tokyo",
    startTime: "15:00",
    endTime: null,
    category: "hotel",
    cost: "125.50",
    currency: "jpy",
    notes: "Keep these notes",
    lat: "35.6800000",
    lng: "139.7600000",
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  // UTC is still June 18; Hong Kong is already June 19.
  vi.setSystemTime(new Date("2026-06-18T16:30:00Z"));
  role = "editor";
  nextId = 1000;
  trip = {
    id: tripId,
    name: "Tokyo",
    baseCurrency: "HKD",
    startDate: "2026-06-19",
    endDate: "2026-06-21",
    userRole: role,
  };
  store = {
    flights: [],
    hotels: [],
    days: [
      {
        id: 100,
        tripId,
        date: "2026-06-19",
        dayNumber: 1,
        title: "Manual day",
        notes: "Keep day notes",
        activities: [],
        createdAt: new Date(),
      },
    ],
    activities: [],
    expenses: [],
    pins: [],
    passport: [],
    countries: [],
  };
  mock.getDb.mockResolvedValue({} as any);
  mock.getUserMembership.mockImplementation(async (id, userId) =>
    id === tripId
      ? {
          id: 1,
          tripId,
          userId,
          role,
          joinedAt: new Date(),
          displayName: null,
          email: null,
        }
      : null
  );
  mock.getTripById.mockImplementation(async id =>
    id === tripId ? clone(trip) : null
  );
  mock.getTripFlights.mockImplementation(async () => clone(store.flights));
  mock.getTripAccommodations.mockImplementation(async () =>
    clone(store.hotels)
  );
  mock.getItineraryDays.mockImplementation(async () => clone(store.days));
  mock.getTripActivities.mockImplementation(async () =>
    clone(store.activities)
  );
  mock.getTripExpenses.mockImplementation(async () => clone(store.expenses));
  mock.getMapPins.mockImplementation(async () => clone(store.pins));
  mock.getPastFlights.mockImplementation(async userId =>
    clone(store.passport.filter(f => f.userId === userId))
  );
  mock.getVisitedCountries.mockImplementation(async userId =>
    clone(store.countries.filter(c => c.userId === userId))
  );
  mock.addPastFlight.mockImplementation(async data => {
    const id = nextId++;
    store.passport.push({ ...data, id });
    return id;
  });
  mock.upsertVisitedCountry.mockImplementation(async data => {
    store.countries.push({ ...data, id: nextId++ });
  });
  mock.addItineraryDay.mockImplementation(async data => {
    const id = nextId++;
    store.days.push({ ...data, id, activities: [] });
    return id;
  });
  mock.addActivity.mockImplementation(async data => {
    const id = nextId++;
    store.activities.push(
      activity({
        ...data,
        id,
        cost: null,
        currency: null,
        lat: null,
        lng: null,
      })
    );
    return id;
  });
  mock.updateActivity.mockImplementation(async (id, data) => {
    Object.assign(
      store.activities.find(a => a.id === id),
      data
    );
  });
  mock.addExpense.mockImplementation(async data => {
    const id = nextId++;
    store.expenses.push({ ...data, id });
    return id;
  });
  mock.addMapPin.mockImplementation(async data => {
    const id = nextId++;
    store.pins.push({ ...data, id });
    return id;
  });
});
afterEach(() => {
  // This holds for successful imports, skipped imports, and failures alike.
  for (const fn of [
    mock.deleteTrip,
    mock.deleteItineraryDay,
    mock.deleteActivity,
    mock.deleteExpense,
    mock.deleteMapPin,
    mock.deletePastFlight,
    mock.deleteFlight,
    mock.deleteAccommodation,
    mock.removeVisitedCountry,
  ])
    expect(fn).not.toHaveBeenCalled();
  for (const fn of [
    mock.updateActivity,
    mock.updateExpense,
    mock.updateMapPin,
    mock.updateTrip,
    mock.updateFlight,
    mock.updateAccommodation,
  ])
    expect(fn).not.toHaveBeenCalled();
  vi.useRealTimers();
});

const endpoints = [
  "importFlightsToPassport",
  "syncLogisticsToItinerary",
  "importActivityExpenses",
  "importActivityPins",
] as const;
describe("connected authorization and failure semantics", () => {
  it.each(endpoints)("requires authentication for %s", async endpoint => {
    await expect(
      (caller(null)[endpoint] as any)({ tripId, activityIds: [] })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mock.getDb).not.toHaveBeenCalled();
  });
  it.each(endpoints)(
    "requires trip membership for %s before reads or writes",
    async endpoint => {
      mock.getUserMembership.mockResolvedValue(null);
      await expect(
        (caller()[endpoint] as any)({ tripId, activityIds: [] })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(mock.getTripFlights).not.toHaveBeenCalled();
      expect(mock.addExpense).not.toHaveBeenCalled();
    }
  );
  it.each(endpoints)(
    "throws when the database is unavailable for %s",
    async endpoint => {
      mock.getDb.mockResolvedValue(null);
      await expect(
        (caller()[endpoint] as any)({ tripId, activityIds: [] })
      ).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
        message: "Database not available",
      });
      expect(mock.getUserMembership).not.toHaveBeenCalled();
    }
  );
  it.each([
    "syncLogisticsToItinerary",
    "importActivityExpenses",
    "importActivityPins",
  ] as const)("rejects viewers for shared writes: %s", async endpoint => {
    role = "viewer";
    await expect(
      (caller()[endpoint] as any)({ tripId, activityIds: [] })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("rejects a missing trip even if membership exists", async () => {
    mock.getTripById.mockResolvedValue(null);
    await expect(
      caller().syncLogisticsToItinerary({ tripId })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mock.addActivity).not.toHaveBeenCalled();
  });
  it("propagates real DB read errors instead of reporting an empty success", async () => {
    mock.getTripFlights.mockRejectedValue(new Error("Connection refused"));
    await expect(caller().importFlightsToPassport({ tripId })).rejects.toThrow(
      "Connection refused"
    );
  });
  it("validates all explicitly selected IDs before any expense writes", async () => {
    store.activities = [activity()];
    await expect(
      caller().importActivityExpenses({ tripId, activityIds: [20, 999] })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mock.addExpense).not.toHaveBeenCalled();
  });
  it("rejects a mixed cross-trip pin selection without any writes", async () => {
    store.activities = [activity(), activity({ id: 21, tripId: 999 })];
    await expect(
      caller().importActivityPins({ tripId, activityIds: [20, 21] })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mock.addMapPin).not.toHaveBeenCalled();
  });
  it("rejects activities whose expense day is not owned by this trip", async () => {
    store.activities = [activity({ dayId: 999 })];
    await expect(
      caller().importActivityExpenses({ tripId, activityIds: [20] })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mock.addExpense).not.toHaveBeenCalled();
  });
  it("rejects source flights with a mismatched trip before writes", async () => {
    store.flights = [flight({ tripId: 999 })];
    await expect(
      caller().importFlightsToPassport({ tripId })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mock.addPastFlight).not.toHaveBeenCalled();
  });
});

describe("connected.importFlightsToPassport", () => {
  it("allows viewers to import personal completed flights at HK today and syncs missing countries", async () => {
    role = "viewer";
    store.flights = [flight()];
    expect(await caller().importFlightsToPassport({ tripId })).toEqual({
      created: 1,
      skipped: 0,
      invalid: 0,
    });
    expect(store.passport[0]).toMatchObject({
      userId: 7,
      departureAirport: "HKG",
      arrivalAirport: "NRT",
      flightNumber: "CX123",
      durationMinutes: 225,
      flightYear: 2026,
      departureCountry: "Hong Kong",
      arrivalCountry: "Japan",
    });
    expect(connectedDate(store.passport[0].flightDate)).toBe("2026-06-19");
    expect(store.passport[0].notes).toContain("Original flight notes");
    expect(store.countries).toHaveLength(1);
    expect(store.countries[0].countryCode).toBe("JP");
    expect(connectedDate(store.countries[0].visitedAt)).toBe("2026-06-19");
    expect(await caller().importFlightsToPassport({ tripId })).toEqual({
      created: 0,
      skipped: 1,
      invalid: 0,
    });
    expect(mock.addPastFlight).toHaveBeenCalledTimes(1);
    expect(mock.upsertVisitedCountry).toHaveBeenCalledTimes(1);
    expect(store.countries).toHaveLength(1);
  });
  it("skips future flights and counts malformed calendar dates and routes as invalid", async () => {
    store.flights = [
      flight({ id: 1, date: "2026-06-20" }),
      flight({ id: 2, date: "2026-02-30" }),
      flight({ id: 3, fromCode: "HK" }),
      flight({ id: 4, fromCode: "NRT" }),
      flight({ id: 5, date: null }),
    ];
    expect(await caller().importFlightsToPassport({ tripId })).toEqual({
      created: 0,
      skipped: 1,
      invalid: 4,
    });
    expect(mock.addPastFlight).not.toHaveBeenCalled();
  });
  it("deduplicates against existing manual passport date/route/flight number", async () => {
    store.flights = [flight()];
    store.passport = [
      {
        id: 80,
        userId: 7,
        flightDate: connectedPassportDate("2026-06-19"),
        departureAirport: "hkg",
        arrivalAirport: "nrt",
        flightNumber: "CX 123",
        notes: "Manual passport",
        departureCountry: "Hong Kong",
        arrivalCountry: "Japan",
      },
    ];
    const original = clone(store.passport[0]);
    expect(await caller().importFlightsToPassport({ tripId })).toEqual({
      created: 0,
      skipped: 1,
      invalid: 0,
    });
    expect(store.passport[0]).toEqual(original);
    expect(mock.updatePastFlight).not.toHaveBeenCalled();
  });
  it("uses stable provenance when either the source or imported passport was edited", async () => {
    store.flights = [flight()];
    await caller().importFlightsToPassport({ tripId });
    store.flights[0].flightNumber = "CX999";
    store.passport[0].arrivalCity = "My manual edit";
    expect(await caller().importFlightsToPassport({ tripId })).toEqual({
      created: 0,
      skipped: 1,
      invalid: 0,
    });
    expect(store.passport[0].arrivalCity).toBe("My manual edit");
  });
  it("does not infer elapsed duration from airport wall clocks", async () => {
    store.flights = [flight({ duration: "unknown" })];
    await caller().importFlightsToPassport({ tripId });
    expect(store.passport[0].durationMinutes).toBeNull();
    expect(store.passport[0].distanceKm).toBeNull();
  });
  it("preserves manual country status, date and notes", async () => {
    store.flights = [flight()];
    store.countries = [
      {
        userId: 7,
        countryCode: "JP",
        countryName: "Japan",
        status: "visited",
        visitedAt: connectedPassportDate("2020-04-03"),
        notes: "Manual country notes",
      },
    ];
    const original = clone(store.countries);
    await caller().importFlightsToPassport({ tripId });
    expect(store.countries).toEqual(original);
    expect(mock.upsertVisitedCountry).not.toHaveBeenCalled();
  });
  it("does not import another member's passport records", async () => {
    store.flights = [flight()];
    await caller(8).importFlightsToPassport({ tripId });
    expect(store.passport[0].userId).toBe(8);
    await caller(7).importFlightsToPassport({ tripId });
    expect(store.passport).toHaveLength(2);
  });
  it("serializes simultaneous duplicate requests in the same process", async () => {
    store.flights = [flight()];
    const results = await Promise.all([
      caller().importFlightsToPassport({ tripId }),
      caller().importFlightsToPassport({ tripId }),
    ]);
    expect(results.map(r => r.created)).toEqual([1, 0]);
    expect(store.passport).toHaveLength(1);
  });
  it("propagates save errors and never reports success", async () => {
    store.flights = [flight()];
    mock.addPastFlight.mockRejectedValue(new Error("Write failed"));
    await expect(caller().importFlightsToPassport({ tripId })).rejects.toThrow(
      "Write failed"
    );
  });
  it("rejects overlong flight numbers instead of silently truncating identity", async () => {
    store.flights = [flight({ flightNumber: "CX12345678901234567890123" })];
    expect(await caller().importFlightsToPassport({ tripId })).toEqual({
      created: 0,
      skipped: 0,
      invalid: 1,
    });
    expect(mock.addPastFlight).not.toHaveBeenCalled();
  });
  it("propagates country-sync failures and supports an idempotent retry of a partial import", async () => {
    store.flights = [flight()];
    mock.getVisitedCountries.mockRejectedValueOnce(
      new Error("Country read failed")
    );
    await expect(caller().importFlightsToPassport({ tripId })).rejects.toThrow(
      "Country read failed"
    );
    expect(store.passport).toHaveLength(1);
    expect(await caller().importFlightsToPassport({ tripId })).toEqual({
      created: 0,
      skipped: 1,
      invalid: 0,
    });
    expect(store.countries).toHaveLength(1);
    expect(mock.addPastFlight).toHaveBeenCalledTimes(1);
  });
});

describe("connected.syncLogisticsToItinerary", () => {
  it("imports flights and hotel events onto exact string dates without guessing hotel times", async () => {
    store.flights = [flight()];
    store.hotels = [
      {
        id: 50,
        tripId,
        name: "Hotel One",
        city: "Tokyo",
        checkIn: "2026-06-19",
        checkOut: "2026-06-21",
        notes: "Hotel source notes",
      },
    ];
    expect(await caller().syncLogisticsToItinerary({ tripId })).toEqual({
      created: 3,
      updated: 0,
      skipped: 0,
      invalid: 0,
    });
    expect(store.days.map(day => day.date)).toEqual([
      "2026-06-19",
      "2026-06-21",
    ]);
    expect(mock.addItineraryDay.mock.calls[0][0].date).toBe("2026-06-21");
    expect(store.days[0].notes).toBe("Keep day notes");
    expect(store.activities[0]).toMatchObject({
      dayId: 100,
      category: "transport",
      startTime: "23:00",
      endTime: "07:00",
    });
    expect(store.activities[0].notes).toContain(
      "Arrival time as entered (Hong Kong UTC+8; arrival date not inferred): 07:00"
    );
    expect(store.activities[1]).toMatchObject({
      startTime: null,
      endTime: null,
      category: "hotel",
    });
    expect(await caller().syncLogisticsToItinerary({ tripId })).toEqual({
      created: 0,
      updated: 0,
      skipped: 3,
      invalid: 0,
    });
  });
  it("never updates linked entries after source changes, preserving notes, cost and unrelated manual entries", async () => {
    store.flights = [flight()];
    await caller().syncLogisticsToItinerary({ tripId });
    store.activities[0].notes += "\nMy extra notes";
    store.activities[0].cost = "199";
    store.activities.push(activity({ id: 33, title: "Manual sightseeing" }));
    const original = clone(store.activities);
    store.flights[0].date = "2026-06-20";
    store.flights[0].departTime = "10:00";
    expect(await caller().syncLogisticsToItinerary({ tripId })).toEqual({
      created: 0,
      updated: 0,
      skipped: 1,
      invalid: 0,
    });
    expect(store.activities[0].startTime).toBe("23:00");
    expect(store.activities[0].notes).toContain("My extra notes");
    expect(store.activities[0].notes).toContain("Original flight notes");
    expect(store.activities[0].cost).toBe("199");
    expect(store.activities).toEqual(original);
    expect(store.days).toHaveLength(1);
    expect(mock.updateActivity).not.toHaveBeenCalled();
  });
  it.each(["title", "location", "startTime", "category"])(
    "skips a linked human edit to %s without any overwrite",
    async field => {
      store.flights = [flight()];
      await caller().syncLogisticsToItinerary({ tripId });
      store.activities[0][field] =
        field === "category" ? "other" : "Human edit";
      const original = clone(store.activities[0]);
      store.flights[0].departTime = "10:00";
      expect(await caller().syncLogisticsToItinerary({ tripId })).toEqual({
        created: 0,
        updated: 0,
        skipped: 1,
        invalid: 0,
      });
      expect(store.activities[0]).toEqual(original);
      expect(mock.updateActivity).not.toHaveBeenCalled();
    }
  );
  it("skips a linked entry moved manually to a different day", async () => {
    store.flights = [flight()];
    await caller().syncLogisticsToItinerary({ tripId });
    store.days.push({ id: 101, tripId, date: "2026-06-21", dayNumber: 3 });
    store.activities[0].dayId = 101;
    store.flights[0].departTime = "10:00";
    expect((await caller().syncLogisticsToItinerary({ tripId })).skipped).toBe(
      1
    );
    expect(mock.updateActivity).not.toHaveBeenCalled();
  });
  it("skips old linked entries without a trustworthy machine snapshot", async () => {
    store.flights = [flight()];
    store.activities = [
      activity({ notes: connectedSourceMarker("flight", tripId, 1) }),
    ];
    expect((await caller().syncLogisticsToItinerary({ tripId })).skipped).toBe(
      1
    );
    expect(mock.updateActivity).not.toHaveBeenCalled();
  });
  it("natural-key matches existing manual entries without attaching source markers or altering them", async () => {
    store.flights = [flight()];
    store.activities = [
      activity({
        title: "Flight cx 123",
        location: "HKG → NRT",
        startTime: "23:00",
        endTime: "07:00",
        category: "transport",
      }),
    ];
    const original = clone(store.activities[0]);
    expect((await caller().syncLogisticsToItinerary({ tripId })).skipped).toBe(
      1
    );
    expect(store.activities[0]).toEqual(original);
  });
  it("counts impossible dates and reversed hotel stays as invalid without creating days", async () => {
    store.flights = [flight({ date: "2026-02-30" })];
    store.hotels = [
      {
        id: 50,
        tripId,
        name: "Hotel",
        checkIn: "2026-06-22",
        checkOut: "2026-06-20",
      },
    ];
    expect(await caller().syncLogisticsToItinerary({ tripId })).toEqual({
      created: 0,
      updated: 0,
      skipped: 0,
      invalid: 3,
    });
    expect(mock.addItineraryDay).not.toHaveBeenCalled();
  });
  it("never deletes entries or days after their source records disappear", async () => {
    store.flights = [flight()];
    await caller().syncLogisticsToItinerary({ tripId });
    const original = clone(store.activities);
    store.flights = [];
    expect(await caller().syncLogisticsToItinerary({ tripId })).toEqual({
      created: 0,
      updated: 0,
      skipped: 0,
      invalid: 0,
    });
    expect(store.activities).toEqual(original);
  });
});

describe("connected.importActivityExpenses", () => {
  it("imports only explicit selections with day date, category mapping, current payer and provenance", async () => {
    store.activities = [
      activity(),
      activity({ id: 21, title: "Not selected" }),
    ];
    expect(
      await caller().importActivityExpenses({ tripId, activityIds: [20, 20] })
    ).toEqual({ created: 1, skipped: 0 });
    expect(store.expenses[0]).toMatchObject({
      title: "Hotel",
      amount: "125.50",
      category: "accommodation",
      currency: "JPY",
      date: "2026-06-19",
      paidBy: 7,
      paidByName: "Current Payer",
    });
    expect(store.expenses[0].notes).toContain("Keep these notes");
    expect(
      await caller().importActivityExpenses({ tripId, activityIds: [20] })
    ).toEqual({ created: 0, skipped: 1 });
    store.expenses[0].amount = "88.00";
    store.activities[0].cost = "300";
    expect(
      await caller().importActivityExpenses({ tripId, activityIds: [20] })
    ).toEqual({ created: 0, skipped: 1 });
    expect(store.expenses[0].amount).toBe("88.00");
    expect(mock.updateExpense).not.toHaveBeenCalled();
  });
  it("falls back from invalid activity currency to a validated trip base", async () => {
    store.activities = [activity({ currency: "XXX" })];
    trip.baseCurrency = " usd ";
    await caller().importActivityExpenses({ tripId, activityIds: [20] });
    expect(store.expenses[0].currency).toBe("USD");
  });
  it("skips invalid currency without inventing a fallback", async () => {
    store.activities = [activity({ currency: "NOT MONEY" })];
    trip.baseCurrency = "ABC";
    expect(
      await caller().importActivityExpenses({ tripId, activityIds: [20] })
    ).toEqual({ created: 0, skipped: 1 });
  });
  it.each(["0", "-1", "NaN", "Infinity", "", null, "100000000", "0.001"])(
    "skips a non-persistable cost %s",
    async cost => {
      store.activities = [activity({ cost })];
      expect(
        await caller().importActivityExpenses({ tripId, activityIds: [20] })
      ).toEqual({ created: 0, skipped: 1 });
      expect(mock.addExpense).not.toHaveBeenCalled();
    }
  );
  it("skips invalid day dates and never substitutes today's date", async () => {
    store.activities = [activity()];
    store.days[0].date = "2026-02-30";
    expect(
      await caller().importActivityExpenses({ tripId, activityIds: [20] })
    ).toEqual({ created: 0, skipped: 1 });
  });
  it("deduplicates against an equivalent manual expense without changing its notes", async () => {
    store.activities = [activity()];
    store.expenses = [
      {
        id: 70,
        tripId,
        title: "Hotel",
        amount: "125.50",
        currency: "JPY",
        category: "accommodation",
        date: "2026-06-19",
        paidBy: 7,
        notes: "Manual expense",
      },
    ];
    const original = clone(store.expenses);
    expect(
      await caller().importActivityExpenses({ tripId, activityIds: [20] })
    ).toEqual({ created: 0, skipped: 1 });
    expect(store.expenses).toEqual(original);
  });
  it("empty selections never import every activity", async () => {
    store.activities = [activity()];
    expect(
      await caller().importActivityExpenses({ tripId, activityIds: [] })
    ).toEqual({ created: 0, skipped: 0 });
  });
  it("throws on expense write failure", async () => {
    store.activities = [activity()];
    mock.addExpense.mockRejectedValue(new Error("Database offline"));
    await expect(
      caller().importActivityExpenses({ tripId, activityIds: [20] })
    ).rejects.toThrow("Database offline");
  });
});

describe("connected.importActivityPins", () => {
  it("imports only explicit selected coordinates and preserves provenance on repeat and source edits", async () => {
    store.activities = [
      activity({ category: "food" }),
      activity({ id: 21, title: "Not selected" }),
    ];
    expect(
      await caller().importActivityPins({ tripId, activityIds: [20, 20] })
    ).toEqual({ created: 1, skipped: 0, invalid: 0 });
    expect(store.pins[0]).toMatchObject({
      category: "restaurant",
      lat: "35.6800000",
      lng: "139.7600000",
      address: "Tokyo",
    });
    expect(store.pins[0].notes).toContain("Keep these notes");
    store.activities[0].title = "Changed source";
    store.pins[0].notes += "\nMy note";
    expect(
      await caller().importActivityPins({ tripId, activityIds: [20] })
    ).toEqual({ created: 0, skipped: 1, invalid: 0 });
    expect(store.pins[0].title).toBe("Hotel");
    expect(store.pins[0].notes).toContain("My note");
    expect(mock.updateMapPin).not.toHaveBeenCalled();
  });
  it.each([
    [null, "139"],
    ["", "139"],
    ["NaN", "0"],
    ["Infinity", "0"],
    ["90.01", "0"],
    ["0", "180.01"],
    ["0", "-181"],
  ])("counts invalid coordinates %s,%s without geocoding", async (lat, lng) => {
    store.activities = [activity({ lat, lng })];
    expect(
      await caller().importActivityPins({ tripId, activityIds: [20] })
    ).toEqual({ created: 0, skipped: 0, invalid: 1 });
    expect(mock.addMapPin).not.toHaveBeenCalled();
  });
  it("accepts zero coordinates and range endpoints", async () => {
    store.activities = [
      activity({ lat: "0", lng: "0" }),
      activity({ id: 21, title: "Boundary", lat: "-90", lng: "180" }),
    ];
    expect(
      await caller().importActivityPins({ tripId, activityIds: [20, 21] })
    ).toEqual({ created: 2, skipped: 0, invalid: 0 });
  });
  it("natural-key deduplicates against a manual pin", async () => {
    store.activities = [activity()];
    store.pins = [
      {
        id: 77,
        tripId,
        title: " Hotel ",
        lat: "35.68",
        lng: "139.76",
        notes: "Manual",
      },
    ];
    const original = clone(store.pins);
    expect(
      await caller().importActivityPins({ tripId, activityIds: [20] })
    ).toEqual({ created: 0, skipped: 1, invalid: 0 });
    expect(store.pins).toEqual(original);
  });
  it("empty selections do not import everything", async () => {
    store.activities = [activity()];
    expect(
      await caller().importActivityPins({ tripId, activityIds: [] })
    ).toEqual({ created: 0, skipped: 0, invalid: 0 });
  });
});

describe("shared connected validation", () => {
  it.each([
    ["3h 45m", 225],
    ["3 hours 45 minutes", 225],
    ["3小時45分鐘", 225],
    ["03:45", 225],
    ["PT3H45M", 225],
    ["1.5h", 90],
    ["90 min", 90],
    ["", null],
    ["3:75", null],
    ["90", null],
    ["unknown", null],
    ["0m", null],
    ["-1h", null],
  ])("parses only explicit valid durations %s", (value, expected) => {
    expect(parseConnectedDuration(value)).toBe(expected);
  });
  it("validates calendar dates and requires timezone for timestamps", () => {
    expect(connectedDate("2026-06-19")).toBe("2026-06-19");
    expect(connectedDate("2026-06-18T16:30:00Z")).toBe("2026-06-19");
    expect(connectedDate("2026-06-19T00:30:00+08:00")).toBe("2026-06-19");
    for (const value of [
      "2026-02-30",
      "2025-02-29",
      "2026-13-01",
      "2026-06-19T12:00:00",
      "2026-02-30T12:00:00Z",
      "2026-06-19T25:00:00Z",
      "19/06/2026",
    ])
      expect(connectedDate(value)).toBeNull();
    expect(connectedDate("2024-02-29")).toBe("2024-02-29");
  });
  it("validates currency, finite positive amounts and finite ranged coordinates", () => {
    expect(connectedCurrency(" hkd ")).toBe("HKD");
    expect(connectedCurrency("ABC")).toBeNull();
    expect(connectedAmount("22.5")).toBe("22.50");
    expect(connectedAmount(Infinity)).toBeNull();
    expect(connectedCoordinates("0", "0")).toEqual({
      lat: "0.0000000",
      lng: "0.0000000",
    });
    expect(connectedCoordinates(null, null)).toBeNull();
  });
});
