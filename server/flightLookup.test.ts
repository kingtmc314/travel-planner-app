import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flightLookupRouter } from "./flightLookupRouter";
import * as db from "./db";
import type { TrpcContext } from "./_core/context";
import {
  normalizeFlightLookupNumber,
  normalizeFlightLookupStoredDate,
  validFlightLookupDate,
} from "../shared/flightLookup";

vi.mock("./db");
const mock = vi.mocked(db);
const request = { flightNumber: " cx 123 ", date: "2026-06-19" };
let passport: any[];
let tripFlights: Record<number, any[]>;
let trips: any[];
let memberships: Record<number, any>;
let network: ReturnType<typeof vi.fn>;

function context(userId: number | null = 7): TrpcContext {
  return {
    user:
      userId === null
        ? null
        : {
            id: userId,
            openId: `user-${userId}`,
            name: "Current User",
            email: "user@example.com",
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
  flightLookupRouter.createCaller(context(userId));
function flight(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    tripId: 10,
    flightNumber: "CX123",
    date: "2026-06-19",
    airline: "Cathay Pacific",
    fromCode: " hkg ",
    fromCity: "Hong Kong",
    toCode: "nrt",
    toCity: "Tokyo",
    departTime: "23:00",
    arriveTime: "07:00",
    duration: "3h 45m",
    notes: "private notes",
    bookingReference: "PRIVATE-PNR",
    seatClass: "business",
    seatNumber: "1A",
    payment: { card: "secret" },
    ...overrides,
  };
}
function pastFlight(overrides: Record<string, unknown> = {}) {
  return {
    id: 20,
    userId: 7,
    flightNumber: "CX123",
    flightDate: new Date("2026-06-19T12:00:00+08:00"),
    airline: "Cathay Pacific",
    departureAirport: "HKG",
    departureCity: "Hong Kong",
    arrivalAirport: "NRT",
    arrivalCity: "Tokyo",
    durationMinutes: 225,
    distanceKm: 2900,
    seatClass: "first",
    notes: "personal notes",
    bookingReference: "PERSONAL-PRIVATE",
    ...overrides,
  };
}
function addTrip(
  id = 10,
  role: "owner" | "editor" | "viewer" = "editor",
  userId = 7
) {
  const trip = { id, name: `Trip ${id}`, userRole: role, createdBy: userId };
  trips.push(trip);
  memberships[id] = {
    id,
    tripId: id,
    userId,
    role,
    joinedAt: new Date(),
    email: null,
    displayName: null,
  };
  return trip;
}

beforeEach(() => {
  vi.resetAllMocks();
  passport = [];
  tripFlights = {};
  trips = [];
  memberships = {};
  network = vi.fn(() => {
    throw new Error("Network calls forbidden");
  });
  vi.stubGlobal("fetch", network);
  mock.getDb.mockResolvedValue({} as any);
  mock.getPastFlights.mockImplementation(async () => structuredClone(passport));
  mock.getUserTrips.mockImplementation(async () => structuredClone(trips));
  mock.getUserMembership.mockImplementation(async (tripId, userId) =>
    memberships[tripId]?.userId === userId
      ? structuredClone(memberships[tripId])
      : null
  );
  mock.getTripById.mockImplementation(async (tripId, userId) =>
    memberships[tripId]?.userId === userId
      ? structuredClone(trips.find(trip => trip.id === tripId) ?? null)
      : null
  );
  mock.getTripFlights.mockImplementation(async tripId =>
    structuredClone(tripFlights[tripId] ?? [])
  );
});
afterEach(() => {
  expect(network).not.toHaveBeenCalled();
  // Every exercised path is strictly read-only, including error paths.
  for (const [name, fn] of Object.entries(mock)) {
    if (
      /^(add|create|update|delete|remove|upsert|mark)/.test(name) &&
      vi.isMockFunction(fn)
    )
      expect(fn, `${name} must never write`).not.toHaveBeenCalled();
  }
  vi.unstubAllGlobals();
});

describe("shared flight number canonicalization", () => {
  it.each([
    [" cx 123 ", "CX123"],
    ["c\tx\n123a", "CX123A"],
    ["hke001", "HKE001"],
    ["UO 882", "UO882"],
    ["U2 1234", "U21234"],
    ["3u8633", "3U8633"],
    ["5j9a", "5J9A"],
    ["AA0001", "AA0001"],
    ["BA1", "BA1"],
    ["C1 23", "C123"],
  ])("normalizes %s to %s without guesses", (input, expected) => {
    expect(normalizeFlightLookupNumber(input)).toBe(expected);
  });
  it.each([
    "CX%123",
    "https://example.com/CX123",
    "CX-123",
    "CX_123",
    "CX123?date=2026-06-19",
    "CX",
    "C1",
    "1234",
    "ABCD123",
    "CX12345",
    "CX123AB",
    "CX１２３",
    "12",
    "",
  ])("rejects malformed or URL-like %s", input =>
    expect(normalizeFlightLookupNumber(input)).toBe("")
  );
});

describe("exact calendar date handling", () => {
  it.each([
    "0001-01-01",
    "0099-12-31",
    "0999-06-19",
    "2024-02-29",
    "2026-06-19",
    "9999-12-31",
  ])("accepts a positive actual calendar date %s", date =>
    expect(validFlightLookupDate(date)).toBe(true)
  );
  it.each([
    "0000-01-01",
    "10000-01-01",
    "2026-02-29",
    "2026-02-30",
    "2026-00-01",
    "2026-13-01",
    "2026-01-00",
    "2026-04-31",
    " 2026-06-19",
    "2026-6-19",
    "2026-06-19T00:00:00Z",
    "",
  ])("rejects non-calendar date %s", date =>
    expect(validFlightLookupDate(date)).toBe(false)
  );
  it.each([
    "2026-06-19",
    "2026-06-19 00:00:00",
    "2026-06-19 23:59:59.123456",
    "0099-01-01 00:00:00",
  ])("preserves stored calendar/SQL wall-clock date %s", value => {
    expect(normalizeFlightLookupStoredDate(value)).toBe(value.slice(0, 10));
  });
  it("uses Hong Kong date only for actual timezone-aware instants", () => {
    expect(
      normalizeFlightLookupStoredDate(new Date("2026-06-18T16:30:00Z"))
    ).toBe("2026-06-19");
    expect(normalizeFlightLookupStoredDate("2026-06-18T16:30:00Z")).toBe(
      "2026-06-19"
    );
    expect(normalizeFlightLookupStoredDate("2026-06-19T00:30:00+08:00")).toBe(
      "2026-06-19"
    );
    expect(normalizeFlightLookupStoredDate("2026-06-19 23:59:59")).toBe(
      "2026-06-19"
    );
  });
  it.each([
    null,
    undefined,
    123,
    new Date("invalid"),
    "2026-02-30 00:00:00",
    "2026-06-19 24:00:00",
    "2026-06-19T00:00:00",
    "2026-06-19T00:00:00+15:00",
    "2026-06-19T00:00:00+14:01",
    "2026-06-19T00:00:00+08:60",
    "2026-02-30T00:00:00Z",
    "0000-01-01",
    "10000-01-01",
  ])("rejects unsafe stored date %s", value =>
    expect(normalizeFlightLookupStoredDate(value)).toBeNull()
  );
});

describe("authenticated scope and privacy", () => {
  it("requires authentication before any data access", async () => {
    await expect(caller(null).byNumber(request)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(mock.getDb).not.toHaveBeenCalled();
  });
  it.each([0, -1, 1.5, 2147483648, Number.MAX_SAFE_INTEGER, Infinity, NaN])(
    "rejects invalid trip ID %s",
    async tripId => {
      await expect(
        caller().byNumber({ ...request, tripId })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(mock.getDb).not.toHaveBeenCalled();
    }
  );
  it.each(["CX%123", "https://flight.com", "CX12345", "A".repeat(129)])(
    "validates number %s before source reads",
    async flightNumber => {
      await expect(
        caller().byNumber({ ...request, flightNumber })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(mock.getPastFlights).not.toHaveBeenCalled();
    }
  );
  it("validates strict input date without accepting a SQL timestamp", async () => {
    await expect(
      caller().byNumber({ ...request, date: "2026-06-19 00:00:00" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mock.getDb).not.toHaveBeenCalled();
  });
  it("authorizes requested scope before all source reads", async () => {
    passport = [pastFlight()];
    await expect(
      caller().byNumber({ ...request, tripId: 999 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mock.getUserMembership).toHaveBeenCalledWith(999, 7);
    expect(mock.getPastFlights).not.toHaveBeenCalled();
    expect(mock.getUserTrips).not.toHaveBeenCalled();
    expect(mock.getTripFlights).not.toHaveBeenCalled();
    expect(mock.getTripById).not.toHaveBeenCalled();
  });
  it.each(["owner", "editor", "viewer"] as const)(
    "permits authenticated %s to read logistics, without editing",
    async role => {
      addTrip(10, role);
      tripFlights[10] = [flight()];
      expect((await caller().byNumber({ ...request, tripId: 10 })).status).toBe(
        "matched"
      );
      expect(mock.getTripById).toHaveBeenCalledWith(10, 7);
      expect(mock.getUserMembership.mock.invocationCallOrder[0]).toBeLessThan(
        mock.getPastFlights.mock.invocationCallOrder[0]
      );
      expect(mock.getTripById.mock.invocationCallOrder[0]).toBeLessThan(
        mock.getTripFlights.mock.invocationCallOrder[0]
      );
    }
  );
  it.each([{ userId: 8 }, { tripId: 11 }, { role: "admin" }])(
    "rejects falsely returned membership %j",
    async invalid => {
      addTrip();
      mock.getUserMembership.mockResolvedValue({
        ...memberships[10],
        ...invalid,
      });
      await expect(
        caller().byNumber({ ...request, tripId: 10 })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(mock.getPastFlights).not.toHaveBeenCalled();
      expect(mock.getTripFlights).not.toHaveBeenCalled();
    }
  );
  it("verifies the scoped trip still exists", async () => {
    addTrip();
    mock.getTripById.mockResolvedValue(null);
    await expect(
      caller().byNumber({ ...request, tripId: 10 })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mock.getPastFlights).not.toHaveBeenCalled();
  });
  it("rejects a falsely returned scoped trip ID", async () => {
    addTrip();
    mock.getTripById.mockResolvedValue({ ...trips[0], id: 999 });
    await expect(
      caller().byNumber({ ...request, tripId: 10 })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mock.getPastFlights).not.toHaveBeenCalled();
  });
  it("only requests and returns the current user's personal passport", async () => {
    passport = [pastFlight({ userId: 8, id: 80 }), pastFlight()];
    const result = await caller().byNumber(request);
    expect(mock.getPastFlights.mock.calls).toEqual([[7]]);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].id).toBe("passport:7:flight:20");
    const other = await caller(8).byNumber(request);
    expect(other.candidates).toHaveLength(1);
    expect(other.candidates[0].id).toBe("passport:8:flight:80");
    expect(mock.getPastFlights.mock.calls).toEqual([[7], [8]]);
  });
  it("checks actual user membership before reading every owned or invited trip", async () => {
    addTrip(10, "owner");
    addTrip(11, "viewer");
    addTrip(12, "owner", 8);
    tripFlights[10] = [flight()];
    tripFlights[11] = [
      flight({ id: 2, tripId: 11, fromCode: "LHR", toCode: "JFK" }),
    ];
    tripFlights[12] = [flight({ id: 3, tripId: 12, toCode: "SECRET" })];
    const result = await caller().byNumber(request);
    expect(result.candidates).toHaveLength(2);
    expect(mock.getUserTrips.mock.calls).toEqual([[7]]);
    expect(mock.getUserMembership.mock.calls).toEqual([
      [10, 7],
      [11, 7],
      [12, 7],
    ]);
    expect(mock.getTripFlights.mock.calls).toEqual([[10], [11]]);
    expect(mock.getUserMembership.mock.invocationCallOrder[1]).toBeLessThan(
      mock.getTripFlights.mock.invocationCallOrder[1]
    );
  });
  it("includes invited trip logistics even with an explicit valid requested scope", async () => {
    addTrip(10, "editor");
    addTrip(11, "viewer");
    tripFlights[11] = [flight({ id: 2, tripId: 11 })];
    const result = await caller().byNumber({ ...request, tripId: 10 });
    expect(result.candidates[0].sourceLabel).toBe("Trip 11");
    expect(mock.getUserMembership.mock.calls).toEqual([
      [10, 7],
      [11, 7],
    ]);
  });
  it("ignores deleted, stale or falsely returned trips before reading flights", async () => {
    addTrip(10);
    addTrip(11);
    addTrip(12);
    mock.getTripById.mockImplementation(async id =>
      id === 10 ? trips[0] : id === 11 ? null : { ...trips[2], id: 999 }
    );
    await caller().byNumber(request);
    expect(mock.getTripFlights.mock.calls).toEqual([[10]]);
  });
  it("filters unexpected cross-trip rows returned by a scoped helper", async () => {
    addTrip();
    tripFlights[10] = [flight({ tripId: 11 }), flight()];
    const result = await caller().byNumber(request);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].id).toBe("trip:10:flight:1");
  });
  it("returns only the explicit safe candidate whitelist from either source", async () => {
    addTrip();
    tripFlights[10] = [flight()];
    passport = [pastFlight({ arrivalAirport: "LHR" })];
    const result = await caller().byNumber(request);
    const keys = [
      "id",
      "flightNumber",
      "date",
      "airline",
      "fromCode",
      "fromCity",
      "toCode",
      "toCity",
      "departTime",
      "arriveTime",
      "durationMinutes",
      "distanceKm",
      "source",
      "sourceLabel",
    ].sort();
    expect(result.candidates).toHaveLength(2);
    for (const candidate of result.candidates)
      expect(Object.keys(candidate).sort()).toEqual(keys);
    expect(JSON.stringify(result)).not.toMatch(
      /PRIVATE|notes|seatClass|seatNumber|payment|bookingReference/
    );
  });
});

describe("exact matching, safe fields and candidate selection", () => {
  it("has an honest empty no-provider response without guesses", async () => {
    expect(await caller().byNumber(request)).toEqual({
      flightNumber: "CX123",
      date: request.date,
      candidates: [],
      status: "not_found",
      providerConfigured: false,
      onlineStatus: "not_configured",
      warnings: [],
    });
  });
  it("matches only the exact canonical number and date, including legacy SQL", async () => {
    addTrip();
    tripFlights[10] = [
      flight({
        id: 1,
        flightNumber: " c x 1 2 3 ",
        date: "2026-06-19 00:00:00",
      }),
      flight({ id: 2, date: "2026-06-18" }),
      flight({ id: 3, date: "2026-06-20" }),
      flight({ id: 4, flightNumber: "CX124" }),
      flight({ id: 5, flightNumber: "CPA123" }),
      flight({ id: 6, flightNumber: "CX0123" }),
      flight({ id: 7, date: "2026-02-30" }),
    ];
    const result = await caller().byNumber(request);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      flightNumber: "CX123",
      date: "2026-06-19",
      fromCode: "HKG",
      toCode: "NRT",
      durationMinutes: 225,
    });
  });
  it("matches passport instants by their Hong Kong date, not server UTC date", async () => {
    passport = [pastFlight({ flightDate: new Date("2026-06-18T16:30:00Z") })];
    expect((await caller().byNumber(request)).status).toBe("matched");
    expect(
      (await caller().byNumber({ ...request, date: "2026-06-18" })).status
    ).toBe("not_found");
  });
  it("matches a legacy passport SQL date without adding eight hours", async () => {
    passport = [pastFlight({ flightDate: "2026-06-19 23:59:59.123456" })];
    expect((await caller().byNumber(request)).status).toBe("matched");
    expect(
      (await caller().byNumber({ ...request, date: "2026-06-20" })).status
    ).toBe("not_found");
  });
  it.each([
    { fromCode: "HG" },
    { toCode: "XXXX" },
    { fromCode: "HK1" },
    { toCode: "HKG" },
    { fromCode: null },
  ])("rejects incomplete, invalid or identical airports %j", async changes => {
    addTrip();
    tripFlights[10] = [flight(changes)];
    expect((await caller().byNumber(request)).candidates).toEqual([]);
  });
  it("validates passport airports too", async () => {
    passport = [
      pastFlight({ departureAirport: "X" }),
      pastFlight({ id: 21, arrivalAirport: "hkg" }),
    ];
    expect((await caller().byNumber(request)).status).toBe("not_found");
  });
  it.each([
    NaN,
    Infinity,
    -1,
    0,
    "garbage",
    "",
    "  ",
    true,
    {},
    [],
    "1e3",
    "0x20",
    2147483648,
  ])(
    "turns malformed passport metrics %s into null without inference",
    async value => {
      passport = [pastFlight({ durationMinutes: value, distanceKm: value })];
      const candidate = (await caller().byNumber(request)).candidates[0];
      expect(candidate.durationMinutes).toBeNull();
      expect(candidate.distanceKm).toBeNull();
      expect(candidate.departTime).toBe("");
      expect(candidate.arriveTime).toBe("");
    }
  );
  it("accepts positive numeric saved metrics but rejects fractional elapsed minutes", async () => {
    passport = [pastFlight({ durationMinutes: "225", distanceKm: "2900.5" })];
    expect((await caller().byNumber(request)).candidates[0]).toMatchObject({
      durationMinutes: 225,
      distanceKm: 2900.5,
    });
    passport = [pastFlight({ durationMinutes: 1.5, distanceKm: 12.5 })];
    expect((await caller().byNumber(request)).candidates[0]).toMatchObject({
      durationMinutes: null,
      distanceKm: 12.5,
    });
  });
  it("only parses explicitly saved trip duration; never subtracts clocks or estimates distance", async () => {
    addTrip();
    tripFlights[10] = [
      flight({ departTime: "23:00", arriveTime: "02:00", duration: "unknown" }),
    ];
    expect((await caller().byNumber(request)).candidates[0]).toMatchObject({
      departTime: "23:00",
      arriveTime: "02:00",
      durationMinutes: null,
      distanceKm: null,
    });
  });
  it("drops malformed clocks rather than guessing", async () => {
    addTrip();
    tripFlights[10] = [flight({ departTime: "24:00", arriveTime: "07:60" })];
    expect((await caller().byNumber(request)).candidates[0]).toMatchObject({
      departTime: "",
      arriveTime: "",
    });
  });
  it("deduplicates identical saved copies and keeps the most complete candidate", async () => {
    addTrip();
    tripFlights[10] = [
      flight({ id: 1, airline: null, fromCity: null, departTime: null }),
      flight({ id: 2 }),
      flight({ id: 3 }),
    ];
    const result = await caller().byNumber(request);
    expect(result.status).toBe("matched");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].id).toBe("trip:10:flight:2");
  });
  it("deduplicates compatible passport copies without returning raw data or merging fields", async () => {
    passport = [
      pastFlight({
        id: 20,
        airline: null,
        departureCity: null,
        durationMinutes: null,
      }),
      pastFlight({ id: 21 }),
    ];
    const result = await caller().byNumber(request);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].id).toBe("passport:7:flight:21");
  });
  it("prefers a scoped trip among equally complete duplicate trip copies", async () => {
    addTrip(11);
    addTrip(10);
    tripFlights[11] = [flight({ tripId: 11 })];
    tripFlights[10] = [flight()];
    expect(
      (await caller().byNumber({ ...request, tripId: 10 })).candidates[0]
        .sourceLabel
    ).toBe("Trip 10");
  });
  it("collapses a less complete passport copy of a saved trip when details are a subset", async () => {
    addTrip();
    tripFlights[10] = [flight()];
    passport = [pastFlight({ distanceKm: null })];
    expect((await caller().byNumber(request)).candidates).toHaveLength(1);
  });
  it.each([
    { toCode: "LHR" },
    { departTime: "22:00" },
    { arriveTime: "08:00" },
    { duration: "4h" },
  ])(
    "keeps conflicting actual route/clock/duration %j ambiguous",
    async changes => {
      addTrip();
      tripFlights[10] = [flight(), flight({ id: 2, ...changes })];
      const result = await caller().byNumber(request);
      expect(result.status).toBe("ambiguous");
      expect(result.candidates).toHaveLength(2);
      expect(
        new Set(result.candidates.map(candidate => candidate.id)).size
      ).toBe(2);
    }
  );
  it("keeps conflicting saved distances ambiguous", async () => {
    passport = [pastFlight(), pastFlight({ id: 21, distanceKm: 3000 })];
    expect((await caller().byNumber(request)).status).toBe("ambiguous");
  });
  it("does not let a metadata-rich but clockless row swallow distinct clocks", async () => {
    addTrip();
    tripFlights[10] = [
      flight({ id: 1, departTime: "", arriveTime: "" }),
      flight({
        id: 2,
        airline: "",
        fromCity: "",
        toCity: "",
        departTime: "23:00",
        arriveTime: "07:00",
      }),
      flight({
        id: 3,
        airline: "",
        fromCity: "",
        toCity: "",
        departTime: "22:00",
        arriveTime: "06:00",
      }),
    ];
    const result = await caller().byNumber(request);
    expect(result.status).toBe("ambiguous");
    expect(
      result.candidates.filter(candidate => candidate.departTime)
    ).toHaveLength(2);
  });
  it("caps distinct candidates at 100 after deduplicating", async () => {
    addTrip();
    tripFlights[10] = Array.from({ length: 150 }, (_, index) =>
      flight({ id: index + 1, duration: `${index + 1}h` })
    );
    const result = await caller().byNumber(request);
    expect(result.status).toBe("ambiguous");
    expect(result.candidates).toHaveLength(100);
    expect(new Set(result.candidates.map(candidate => candidate.id)).size).toBe(
      100
    );
  });
});

describe("no false empty result on data-read failure", () => {
  it("rejects database unavailability before any source read", async () => {
    mock.getDb.mockResolvedValue(null);
    await expect(caller().byNumber(request)).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database not available",
    });
    expect(mock.getUserMembership).not.toHaveBeenCalled();
    expect(mock.getPastFlights).not.toHaveBeenCalled();
  });
  it.each([
    "getDb",
    "getPastFlights",
    "getUserTrips",
    "getUserMembership",
    "getTripById",
    "getTripFlights",
  ] as const)(
    "propagates %s read failure, never returns not_found",
    async helper => {
      addTrip();
      mock[helper].mockRejectedValue(new Error(`Read failed: ${helper}`));
      await expect(
        caller().byNumber({ ...request, tripId: 10 })
      ).rejects.toThrow(`Read failed: ${helper}`);
    }
  );
});
