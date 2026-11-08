import { describe, expect, it } from "vitest";
import {
  buildLogisticsInsights,
  deriveHotelNights,
  hotelNightInfo,
  normalizeIata,
  normalizeLogisticsDate,
  returnFlightDefaults,
  validateFlightRoute,
  validateHotelDates,
} from "../client/src/lib/logisticsInsights";

describe("logistics insights", () => {
  it("preserves date-only DB values and converts timestamp dates in Hong Kong", () => {
    expect(normalizeLogisticsDate("2026-11-08")).toBe("2026-11-08");
    expect(normalizeLogisticsDate(" 2026-11-08 ")).toBe("2026-11-08");
    expect(normalizeLogisticsDate("2026-11-08 00:00:00")).toBe("2026-11-08");
    expect(normalizeLogisticsDate("2026-11-07T16:30:00Z")).toBe("2026-11-08");
    expect(normalizeLogisticsDate(new Date("2026-11-07T16:00:00Z"))).toBe(
      "2026-11-08"
    );
    expect(normalizeLogisticsDate("2026-11-08T00:00:00+08:00")).toBe(
      "2026-11-08"
    );
    expect(normalizeLogisticsDate("2026-02-30")).toBe("");
    expect(normalizeLogisticsDate("2026-02-30T00:00:00Z")).toBe("");
    expect(normalizeLogisticsDate(new Date("invalid"))).toBe("");
    expect(normalizeLogisticsDate("not a date")).toBe("");
  });

  it("normalizes IATA case/spacing while rejecting invalid or identical routes", () => {
    expect(normalizeIata(" h k g ")).toBe("HKG");
    expect(validateFlightRoute(" hkg ", "nrt")).toBeNull();
    expect(validateFlightRoute("hkg", "HKG")).toBe("sameAirport");
    expect(validateFlightRoute("HKG1", "NRT")).toBe("invalidIata");
    expect(validateFlightRoute("", "NRT")).toBe("invalidIata");
  });

  it("derives nights from valid dates, never trusting stale manual nights", () => {
    expect(deriveHotelNights("2026-02-27", "2026-03-02")).toBe(3);
    expect(deriveHotelNights("2024-02-28", "2024-03-01")).toBe(2);
    expect(
      hotelNightInfo({
        checkIn: "2026-06-01",
        checkOut: "2026-06-04",
        nights: 99,
      })
    ).toEqual({ nights: 3, source: "dates" });
    expect(hotelNightInfo({ nights: 4 })).toEqual({
      nights: 4,
      source: "manual",
    });
    expect(
      hotelNightInfo({
        checkIn: "2026-06-04",
        checkOut: "2026-06-01",
        nights: 5,
      })
    ).toEqual({ nights: null, source: "unknown" });
    expect(
      hotelNightInfo({ checkIn: "bad", checkOut: "bad", nights: 5 }).nights
    ).toBeNull();
    expect(hotelNightInfo({ nights: -1 }).nights).toBeNull();
    expect(validateHotelDates("2026-06-01", "2026-06-01")).toBe("invalidRange");
    expect(validateHotelDates("2026-06-04", "2026-06-01")).toBe("invalidRange");
    expect(validateHotelDates("2026-02-30", "")).toBe("invalidDate");
    expect(validateHotelDates("2026-06-01", "")).toBeNull();
  });

  it("builds real summaries and keeps today's/future flights out of past-flight candidates", () => {
    const summary = buildLogisticsInsights(
      [
        {
          fromCode: "hkg",
          toCode: "NRT",
          airline: " Cathay Pacific ",
          date: "2026-11-07",
        },
        {
          fromCode: "NRT",
          toCode: "HKG",
          airline: "cathay pacific",
          date: "2026-11-08",
        },
        {
          fromCode: "HKG",
          toCode: "SIN",
          airline: "Singapore Airlines",
          date: "2026-11-10",
        },
        { fromCode: "HKG", toCode: "HKG", date: "2026-11-01" },
        { fromCode: "HKG", toCode: "LHR", date: "invalid" },
      ],
      [
        { checkIn: "2026-11-01", checkOut: "2026-11-04", nights: 99 },
        { nights: 7 },
        { checkIn: "2026-11-04", checkOut: "2026-11-01", nights: 99 },
      ],
      "2026-11-08"
    );
    expect(summary).toMatchObject({
      flightSegments: 5,
      completedFlights: 1,
      upcomingFlights: 2,
      incompleteFlights: 2,
      hotelNights: 3,
      datedHotels: 1,
      incompleteHotels: 2,
    });
    expect(summary.airlines).toHaveLength(2);
  });

  it("returns zero only for loaded empty lists", () => {
    expect(buildLogisticsInsights([], [], "2026-11-08")).toMatchObject({
      flightSegments: 0,
      airlines: [],
      hotelNights: 0,
    });
  });

  it("swaps a return route and uses the trip end date without guessing times", () => {
    expect(
      returnFlightDefaults(
        {
          fromCode: "hkg",
          fromCity: "Hong Kong",
          toCode: "nrt",
          toCity: "Tokyo",
          airline: "Cathay",
        },
        "2026-11-12"
      )
    ).toEqual({
      fromCode: "NRT",
      fromCity: "Tokyo",
      toCode: "HKG",
      toCity: "Hong Kong",
      airline: "Cathay",
      date: "2026-11-12",
      type: "return",
    });
    expect(returnFlightDefaults({}, "invalid").date).toBe("");
  });
});
