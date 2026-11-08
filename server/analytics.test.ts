import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  analyticsAmountMinor,
  analyticsDateOnly,
  analyticsDateRange,
  analyticsTripStatus,
  buildTravelOverview,
  summarizeExpenses,
  unionTravelDays,
  type AnalyticsBundle,
} from "../shared/analytics";
import { analyticsRouter } from "./analyticsRouter";
import * as db from "./db";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", () => ({
  getDb: vi.fn(),
  getUserTrips: vi.fn(),
  getPastFlights: vi.fn(),
  getVisitedCountries: vi.fn(),
  getItineraryDays: vi.fn(),
  getTripActivities: vi.fn(),
  getTripExpenses: vi.fn(),
  getTripFlights: vi.fn(),
  getTripAccommodations: vi.fn(),
  getTripMembers: vi.fn(),
  getMapPins: vi.fn(),
}));
const NOW = new Date("2026-11-07T16:01:00Z"); // Already 8 November in Hong Kong.
const bundle = (overrides: Partial<AnalyticsBundle> = {}): AnalyticsBundle => ({
  trip: {
    id: 1,
    name: "Tokyo",
    destination: "Japan",
    startDate: "2026-11-08",
    endDate: "2026-11-10",
    baseCurrency: "HKD",
    userRole: "owner",
  },
  days: [],
  activities: [],
  expenses: [],
  flights: [],
  hotels: [],
  members: [{ userId: 1 }],
  pins: [],
  ...overrides,
});
const overview = (
  bundles: AnalyticsBundle[] = [],
  rest: Partial<Parameters<typeof buildTravelOverview>[0]> = {}
) =>
  buildTravelOverview({
    userId: 1,
    bundles,
    countries: [],
    passport: [],
    now: NOW,
    ...rest,
  });

describe("analytics metrics", () => {
  it("keeps mixed currencies separate, exact decimals and estimates apart", () => {
    const result = overview([
      bundle({
        expenses: [
          {
            amount: "0.10",
            currency: "hkd",
            date: "2026-11-08",
            category: "food",
          },
          {
            amount: "0.20",
            currency: "HKD",
            date: "2026-11-08",
            category: "food",
          },
          {
            amount: "500",
            currency: "JPY",
            date: "2026-11-09",
            category: "transport",
          },
        ],
        activities: [
          { dayId: 1, cost: "100", currency: "USD" },
          { dayId: 1, cost: "20", currency: null },
        ],
      }),
    ]);
    expect(
      result.actualExpenses.currencies.map(row => [row.currency, row.total])
    ).toEqual([
      ["HKD", 0.3],
      ["JPY", 500],
    ]);
    expect(result.actualExpenses.currencies[0]).toMatchObject({
      recordCount: 2,
      recordedDays: 1,
      averagePerExpense: 0.15,
      averagePerRecordedDay: 0.3,
    });
    expect(
      result.activityEstimates.currencies.map(row => [row.currency, row.total])
    ).toEqual([
      ["HKD", 20],
      ["USD", 100],
    ]);
  });
  it("rejects impossible dates and does not fabricate undated averages", () => {
    expect(analyticsDateOnly("2026-02-29")).toBeNull();
    expect(analyticsDateOnly("2024-02-29")).toBe("2024-02-29");
    expect(analyticsDateOnly("2026-11-08T00:00:00Z")).toBeNull();
    expect(analyticsTripStatus("2026-12-01", "2026-11-01", "2026-11-08")).toBe(
      "undated"
    );
    const result = summarizeExpenses([
      { amount: "10", currency: "HKD", date: "invalid" },
    ]);
    expect(result.currencies[0]).toMatchObject({
      total: 10,
      datedTotal: 0,
      recordedDays: 0,
      averagePerRecordedDay: null,
    });
    expect(result.invalidDateRecords).toBe(1);
  });
  it("normalizes known SQL calendar strings while rejecting invalid dates and arbitrary suffixes", () => {
    expect(analyticsDateOnly("2026-02-15 00:00:00")).toBe("2026-02-15");
    expect(analyticsDateOnly("2024-02-29 23:59:59.123456")).toBe("2024-02-29");
    for (const value of [
      "2026-02-29 00:00:00",
      "2026-02-15 24:00:00",
      "2026-02-15 00:60:00",
      "2026-02-15 00:00:00 trailing",
      "2026-02-15T00:00:00+08:00",
      "2026-02-15 arbitrary",
    ])
      expect(analyticsDateOnly(value)).toBeNull();
    expect(
      analyticsDateRange("2026-02-15 23:59:59", "2026-02-15")
    ).not.toBeNull();
    expect(
      analyticsTripStatus("2026-02-15 23:59:59", "2026-02-15", "2026-02-15")
    ).toBe("current");
    expect(
      analyticsTripStatus(
        "2026-02-15",
        "2026-02-15 23:59:59",
        "2026-02-16 00:00:00"
      )
    ).toBe("past");
    expect(
      analyticsDateRange("2026-02-16 00:00:00", "2026-02-15 23:59:59")
    ).toBeNull();
  });
  it("counts all four date-only and legacy trip ranges as 43 union calendar days without mutating records", () => {
    const ranges = [
      ["2026-11-08", "2026-11-10"],
      ["2026-02-15 00:00:00", "2026-02-25 00:00:00"],
      ["2025-12-19 00:00:00", "2026-01-04 00:00:00"],
      ["2026-03-27 00:00:00", "2026-04-07 00:00:00"],
    ];
    const bundles = ranges.map(([startDate, endDate], index) =>
      bundle({
        trip: { ...bundle().trip, id: index + 1, startDate, endDate },
      })
    );
    const original = structuredClone(bundles);
    const result = overview(bundles);
    expect(result.counts).toMatchObject({
      trips: 4,
      validDatedTrips: 4,
      undatedTrips: 0,
      datedTravelDays: 43,
      pastTrips: 3,
      currentTrips: 1,
    });
    expect(
      bundles.map(
        (_, index) =>
          result.trips.find(trip => trip.id === index + 1)?.datedDays
      )
    ).toEqual([3, 11, 17, 12]);
    expect(result.trips.map(trip => [trip.startDate, trip.endDate])).toEqual([
      ["2025-12-19", "2026-01-04"],
      ["2026-02-15", "2026-02-25"],
      ["2026-03-27", "2026-04-07"],
      ["2026-11-08", "2026-11-10"],
    ]);
    expect(result.availableYears).toEqual([2026, 2025]);
    expect(result.annualTrend).toEqual([
      { year: 2025, trips: 1, tripFlights: 0, passportFlights: 0 },
      { year: 2026, trips: 3, tripFlights: 0, passportFlights: 0 },
    ]);
    expect(bundles).toEqual(original);
  });
  it("normalizes same-day slots, hotel dates, and expense recording days before comparison and grouping", () => {
    const stored = bundle({
      trip: {
        ...bundle().trip,
        startDate: "2026-11-08 18:00:00",
        endDate: "2026-11-08",
      },
      days: [
        { id: 1, date: "2026-11-08" },
        { id: 2, date: "2026-11-08 23:59:59.1" },
        { id: 3, date: "2026-11-07 23:59:59" },
        { id: 4, date: "2026-11-09 00:00:00" },
        { id: 5, date: "2026-11-08 invalid" },
      ],
      activities: [{ dayId: 1 }, { dayId: 2 }, { dayId: 3 }],
      flights: [{ date: "2026-11-08 00:00:00" }],
      hotels: [
        { checkIn: "2026-11-08 18:00:00", checkOut: "2026-11-09 09:00:00" },
      ],
      expenses: [
        { amount: "10", currency: "HKD", date: "2026-11-08" },
        { amount: "20", currency: "HKD", date: "2026-11-08 23:59:59" },
      ],
    });
    const original = structuredClone(stored);
    const result = overview([stored]);
    expect(result.trips[0]).toMatchObject({
      startDate: "2026-11-08",
      endDate: "2026-11-08",
      status: "current",
      datedDays: 1,
      daySlots: 1,
      scheduledDays: 1,
      invalidItineraryDates: 3,
      invalidFlightDates: 0,
      recordedHotelNights: 1,
      hotelsWithValidDates: 1,
    });
    expect(result.actualExpenses.invalidDateRecords).toBe(0);
    expect(result.actualExpenses.currencies[0]).toMatchObject({
      total: 30,
      recordedDays: 1,
      datedRecordCount: 2,
      averagePerRecordedDay: 30,
    });
    expect(result.annualTrend[0].tripFlights).toBe(1);
    expect(stored).toEqual(original);
  });
  it("keeps annual expense scope tied to trip departure year even for cross-year stored payment dates", () => {
    const stored = bundle({
      trip: {
        ...bundle().trip,
        startDate: "2025-12-19 00:00:00",
        endDate: "2026-01-04 00:00:00",
      },
      expenses: [
        { amount: "10", currency: "HKD", date: "2025-12-31 00:00:00" },
        { amount: "20", currency: "HKD", date: "2026-01-01 00:00:00" },
      ],
    });
    expect(
      overview([stored], { year: 2025 }).actualExpenses.currencies[0]
    ).toMatchObject({
      total: 30,
      recordCount: 2,
      recordedDays: 2,
    });
    expect(
      overview([stored], { year: 2026 }).actualExpenses.currencies
    ).toEqual([]);
    expect(overview([stored], { year: 2026 }).counts.trips).toBe(0);
  });
  it("uses only dated expense money in the per-recorded-day numerator", () => {
    const result = summarizeExpenses([
      { amount: "10", currency: "HKD", date: "2026-11-08" },
      { amount: "90", currency: "HKD", date: "bad" },
    ]);
    expect(result.currencies[0]).toMatchObject({
      total: 100,
      datedTotal: 10,
      averagePerRecordedDay: 10,
      datedRecordCount: 1,
    });
  });
  it("ignores invalid numeric/currency values, preserves refunds and recorded zero", () => {
    expect(analyticsAmountMinor("HK$200")).toBeNull();
    expect(analyticsAmountMinor("1,200")).toBeNull();
    expect(analyticsAmountMinor("1e3")).toBeNull();
    expect(analyticsAmountMinor("0.00")).toBe(0);
    const result = summarizeExpenses([
      { amount: "100", currency: "HKD", date: "2026-11-08" },
      { amount: "-20", currency: "HKD", date: "2026-11-08" },
      { amount: "Infinity", currency: "USD", date: "bad" },
      { amount: "200", currency: "", date: "2026-11-08" },
    ]);
    expect(result.currencies[0].total).toBe(80);
    expect(result.invalidMoneyRecords).toBe(2);
  });
  it("unions overlaps instead of double-counting travel days and excludes self from companions", () => {
    const a = bundle({
      members: [{ userId: 1 }, { userId: 2 }, { userId: 2 }],
    });
    const b = bundle({
      trip: {
        ...a.trip,
        id: 2,
        startDate: "2026-11-09",
        endDate: "2026-11-12",
      },
      members: [{ userId: 1 }, { userId: 2 }, { userId: 3 }],
    });
    const result = overview([a, a, b]);
    expect(result.counts).toMatchObject({
      trips: 2,
      datedTravelDays: 5,
      elapsedCalendarDays: 1,
      uniqueCompanions: 2,
      currentTrips: 1,
      upcomingTrips: 1,
    });
    expect(
      unionTravelDays([
        [1, 3],
        [3, 5],
        [10, 10],
      ])
    ).toBe(6);
  });
  it("counts scheduled in-range dates, not empty day slots, and never infers visited countries", () => {
    const result = overview([
      bundle({
        days: [
          { id: 1, date: "2026-11-08" },
          { id: 2, date: "2026-11-09" },
          { id: 3, date: "2026-11-20" },
          { id: 4, date: "2026-11-08" },
        ],
        activities: [{ dayId: 1 }, { dayId: 3 }, { dayId: 4 }],
      }),
    ]);
    expect(result.trips[0]).toMatchObject({
      daySlots: 2,
      scheduledDays: 1,
      datedDays: 3,
      invalidItineraryDates: 1,
    });
    expect(result.countries.visited).toBe(0);
  });
  it("uses HK today/year, retains separate trip-flight and personal-passport series", () => {
    const result = overview(
      [bundle({ flights: [{ date: "2026-11-08" }, { date: "bad" }] })],
      {
        passport: [
          {
            flightDate: "2025-12-31T16:30:00Z",
            departureAirport: "hkg",
            arrivalAirport: "NRT",
            durationMinutes: 240,
            distanceKm: null,
          },
        ],
        year: 2026,
      }
    );
    expect(result.today).toBe("2026-11-08");
    expect(result.trips[0].status).toBe("current");
    expect(result.annualTrend).toEqual([
      { year: 2026, trips: 1, tripFlights: 1, passportFlights: 1 },
    ]);
    expect(result.passport).toMatchObject({
      flights: 1,
      airports: 2,
      recordedDurationMinutes: 240,
      durationRecordCount: 1,
      distanceRecordCount: 0,
    });
  });
  it("filters trips by departure year; country statuses remain lifetime personal records", () => {
    const current = bundle();
    const old = bundle({
      trip: {
        ...current.trip,
        id: 2,
        startDate: "2025-12-30",
        endDate: "2026-01-02",
      },
    });
    const invalid = bundle({
      trip: {
        ...current.trip,
        id: 3,
        startDate: "invalid",
        endDate: "invalid",
      },
    });
    const result = overview([current, old, invalid], {
      year: 2026,
      countries: [
        { countryCode: "jp", status: "visited" },
        { countryCode: "JP", status: "visited" },
        { countryCode: "FR", status: "planned" },
      ],
    });
    expect(result.counts.trips).toBe(1);
    expect(result.countries).toEqual({ visited: 1, planned: 1, wishlist: 0 });
    expect(overview([invalid]).counts).toMatchObject({
      validDatedTrips: 0,
      undatedTrips: 1,
      datedTravelDays: 0,
      pastTrips: 0,
    });
  });
  it("returns truthful empty aggregates without monetary currency buckets or fake next trip", () => {
    const result = overview();
    expect(result.counts.trips).toBe(0);
    expect(result.actualExpenses.currencies).toEqual([]);
    expect(result.nextTrip).toBeNull();
    expect(result.annualTrend).toEqual([]);
    expect(result.passport.durationRecordCount).toBe(0);
  });
});

const context = (userId: number | null): TrpcContext => ({
  user:
    userId === null
      ? null
      : {
          id: userId,
          openId: "member",
          name: "Member",
          email: null,
          role: "user",
          loginMethod: "manus",
          createdAt: NOW,
          updatedAt: NOW,
          lastSignedIn: NOW,
        },
  req: {} as TrpcContext["req"],
  res: {} as TrpcContext["res"],
});
describe("analytics.overview authorization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(db.getDb).mockResolvedValue(
      {} as Awaited<ReturnType<typeof db.getDb>>
    );
    vi.mocked(db.getUserTrips).mockResolvedValue([]);
    vi.mocked(db.getPastFlights).mockResolvedValue([]);
    vi.mocked(db.getVisitedCountries).mockResolvedValue([]);
    for (const helper of [
      db.getItineraryDays,
      db.getTripActivities,
      db.getTripExpenses,
      db.getTripFlights,
      db.getTripAccommodations,
      db.getTripMembers,
      db.getMapPins,
    ])
      vi.mocked(helper).mockResolvedValue([]);
  });
  it("rejects guests before reading records", async () => {
    await expect(
      analyticsRouter.createCaller(context(null)).overview()
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(db.getUserTrips).not.toHaveBeenCalled();
  });
  it("loads only caller membership trip IDs and caller-owned passport/countries", async () => {
    vi.mocked(db.getUserTrips).mockResolvedValue([
      { ...bundle().trip, id: 42 },
    ] as Awaited<ReturnType<typeof db.getUserTrips>>);
    const result = await analyticsRouter.createCaller(context(7)).overview();
    expect(db.getUserTrips).toHaveBeenCalledWith(7);
    expect(db.getPastFlights).toHaveBeenCalledWith(7);
    expect(db.getVisitedCountries).toHaveBeenCalledWith(7);
    for (const helper of [
      db.getItineraryDays,
      db.getTripActivities,
      db.getTripExpenses,
      db.getTripFlights,
      db.getTripAccommodations,
      db.getTripMembers,
      db.getMapPins,
    ]) {
      expect(helper).toHaveBeenCalledTimes(1);
      expect(helper).toHaveBeenCalledWith(42);
    }
    expect(result.trips.map(trip => trip.id)).toEqual([42]);
  });
  it("surfaces unavailable storage rather than zero analytics", async () => {
    vi.mocked(db.getDb).mockResolvedValue(null);
    await expect(
      analyticsRouter.createCaller(context(7)).overview()
    ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(db.getUserTrips).not.toHaveBeenCalled();
  });
});
