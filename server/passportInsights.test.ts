import { describe, expect, it } from "vitest";
import {
  buildPassportInsights,
  getPassportFlightMetrics,
  getPassportFlightStatus,
  getPassportFlightYear,
} from "../client/src/lib/passportInsights";

const today = "2026-11-08";
const estimate = (dep: string, arr: string) =>
  [dep, arr].sort().join("-") === "HKG-NRT" ? 3000 : 0;
const flight = (id: number, overrides = {}) => ({
  id,
  departureAirport: "HKG",
  arrivalAirport: "NRT",
  airline: "Cathay Pacific",
  flightDate: "2026-01-02",
  flightYear: 2026,
  distanceKm: null,
  durationMinutes: null,
  ...overrides,
});

describe("passport insights", () => {
  it("uses Hong Kong calendar year instead of the UTC or stale stored year", () => {
    const row = flight(1, {
      flightDate: new Date("2025-12-31T16:30:00.000Z"),
      flightYear: 2025,
    });
    expect(getPassportFlightYear(row)).toBe(2026);
    expect(
      buildPassportInsights([row], estimate, "2026", today).totalFlights
    ).toBe(1);
    expect(
      buildPassportInsights([row], estimate, "2025", today).filtered
    ).toHaveLength(0);
  });

  it("separates future and undated records instead of treating them as completed", () => {
    const rows = [
      flight(1),
      flight(2, { flightDate: "2026-11-09" }),
      flight(3, { flightDate: null }),
    ];
    const stats = buildPassportInsights(rows, estimate, "All-Time", today);
    expect(stats.totalFlights).toBe(1);
    expect(stats.planned).toHaveLength(1);
    expect(stats.undated).toHaveLength(1);
    expect(stats.distance.total).toBe(3000);
    expect(stats.trend).toEqual([
      { year: 2026, completed: 1, planned: 1, undated: 1 },
    ]);
  });

  it("keeps same-day flights past-dated and recognizes the UTC+8 midnight boundary", () => {
    expect(
      getPassportFlightStatus(flight(1, { flightDate: "2026-11-08" }), today)
    ).toBe("completed");
    expect(
      getPassportFlightStatus(
        flight(2, { flightDate: "2026-11-08T16:01:00Z" }),
        today
      )
    ).toBe("planned");
    expect(
      getPassportFlightStatus(flight(3, { flightDate: "invalid" }), today)
    ).toBe("undated");
    expect(
      getPassportFlightStatus(flight(4, { flightDate: "2026-02-31" }), today)
    ).toBe("undated");
  });

  it("normalizes airport codes while preserving direction in frequent routes", () => {
    const stats = buildPassportInsights(
      [
        flight(1, { departureAirport: " hkg ", arrivalAirport: "nrt" }),
        flight(2),
        flight(3, { departureAirport: "nrt", arrivalAirport: "HKG" }),
        flight(4, { departureAirport: "HKG", arrivalAirport: "HKG" }),
        flight(5, { departureAirport: "?", arrivalAirport: null }),
      ],
      estimate,
      "All-Time",
      today
    );
    expect(stats.routes.map(row => [row.route, row.count])).toEqual([
      ["HKG → NRT", 2],
      ["NRT → HKG", 1],
    ]);
    expect(stats.airports).toBe(2);
    expect(stats.invalidRoutes).toBe(2);
  });

  it("does not use missing metrics as zero in totals or averages", () => {
    const stats = buildPassportInsights(
      [
        flight(1, { distanceKm: 1000, durationMinutes: 60 }),
        flight(2),
        flight(3, { departureAirport: "ZZZ", arrivalAirport: "YYY" }),
      ],
      estimate,
      "All-Time",
      today
    );
    expect(stats.distance).toEqual({
      total: 4000,
      average: 2000,
      recordedAverage: 1000,
      estimatedAverage: 3000,
      recorded: 1,
      estimated: 1,
      known: 2,
      unknown: 1,
      denominator: 3,
    });
    expect(stats.duration.recorded).toBe(1);
    expect(stats.duration.estimated).toBe(1);
    expect(stats.duration.unknown).toBe(1);
    expect(stats.duration.average).toBe(2.875);
  });

  it("returns null instead of fake zero when no metric values are known", () => {
    const stats = buildPassportInsights(
      [flight(1, { departureAirport: null, arrivalAirport: null })],
      estimate,
      "All-Time",
      today
    );
    expect(stats.distance.total).toBeNull();
    expect(stats.distance.average).toBeNull();
    expect(stats.duration.total).toBeNull();
    expect(stats.distance.unknown).toBe(1);
    expect(stats.longest).toBeNull();
  });

  it("does not claim stored numeric values are verified actual values", () => {
    const metrics = getPassportFlightMetrics(
      flight(1, { distanceKm: 2500, durationMinutes: 180 }),
      estimate
    );
    expect(metrics.distance).toEqual({ value: 2500, source: "recorded" });
    expect(metrics.duration).toEqual({ value: 3, source: "recorded" });
    expect(getPassportFlightMetrics(flight(2), estimate).distance.source).toBe(
      "estimated"
    );
  });

  it("invalid, negative and infinite metrics are absent and can be estimated only on valid routes", () => {
    const metrics = getPassportFlightMetrics(
      flight(1, { distanceKm: -1, durationMinutes: Infinity }),
      estimate
    );
    expect(metrics.distance).toEqual({ value: 3000, source: "estimated" });
    expect(metrics.duration).toEqual({ value: 4.75, source: "estimated" });
    expect(
      getPassportFlightMetrics(
        flight(2, {
          departureAirport: "bad-input",
          arrivalAirport: "NRT",
          distanceKm: 0,
        }),
        estimate
      ).distance.value
    ).toBeNull();
  });

  it("canonicalizes airline whitespace and case; unknown airlines retain the full denominator", () => {
    const stats = buildPassportInsights(
      [
        flight(1, { airline: " Cathay   Pacific " }),
        flight(2, { airline: "cathay pacific" }),
        flight(3, { airline: "  " }),
      ],
      estimate,
      "All-Time",
      today
    );
    expect(stats.airlines).toBe(1);
    expect(stats.airlineDistribution).toEqual([
      { airline: "Cathay Pacific", count: 2 },
    ]);
    expect(stats.unknownAirlines).toBe(1);
    expect(stats.totalFlights).toBe(3);
  });

  it("longest flight excludes future records even if their distance is larger", () => {
    const stats = buildPassportInsights(
      [
        flight(1),
        flight(2, { distanceKm: 9000 }),
        flight(3, { flightDate: "2027-01-01", distanceKm: 20000 }),
      ],
      estimate,
      "All-Time",
      today
    );
    expect(stats.longest?.flight.id).toBe(2);
    expect(stats.longest?.distance.source).toBe("recorded");
    expect(stats.longHaul).toBe(1);
    expect(stats.distance.denominator).toBe(2);
  });

  it("falls back to the stored year only for undated records and reports unknown years", () => {
    const stats = buildPassportInsights(
      [
        flight(1, { flightDate: null, flightYear: 2023 }),
        flight(2, { flightDate: null, flightYear: null }),
      ],
      estimate,
      "All-Time",
      today
    );
    expect(stats.trend).toEqual([
      { year: 2023, completed: 0, planned: 0, undated: 1 },
    ]);
    expect(stats.unknownYear).toBe(1);
    expect(stats.totalFlights).toBe(0);
    expect(stats.distance.total).toBeNull();
  });
});
