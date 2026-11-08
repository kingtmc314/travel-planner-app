import { describe, expect, it } from "vitest";
import {
  addItineraryCalendarDays,
  escapeItineraryHtml,
  getActivityFieldsFromPin,
  getItineraryInsights,
  getNextItineraryDay,
  getPlannedCosts,
  itineraryDateOnly,
  parsePlannedCost,
  UNSPECIFIED_CURRENCY,
} from "../client/src/lib/itineraryInsights";

describe("itinerary Hong Kong calendar dates", () => {
  it("preserves date-only values and converts timestamps across the HK midnight boundary", () => {
    expect(itineraryDateOnly("2026-12-31")).toBe("2026-12-31");
    expect(itineraryDateOnly("2026-12-31T16:05:00Z")).toBe("2027-01-01");
    expect(itineraryDateOnly(new Date("2026-12-31T15:59:00Z"))).toBe(
      "2026-12-31"
    );
    expect(itineraryDateOnly("2026-04-31")).toBe("");
    expect(itineraryDateOnly("2026-01-01T09:00:00")).toBe("");
  });
  it("adds calendar days without browser timezone or DST drift", () => {
    expect(addItineraryCalendarDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addItineraryCalendarDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addItineraryCalendarDays("bad", 1)).toBe("");
  });
  it("appends after the latest existing date and highest day number even with gaps", () => {
    expect(
      getNextItineraryDay(
        [
          { date: "2026-03-10", dayNumber: 1 },
          { date: "2026-03-15", dayNumber: 5 },
        ],
        "2026-03-10"
      )
    ).toEqual({ date: "2026-03-16", dayNumber: 6 });
    expect(
      getNextItineraryDay([], null, new Date("2026-03-10T17:00:00Z"))
    ).toEqual({ date: "2026-03-11", dayNumber: 1 });
  });
});

describe("itinerary real-data insights", () => {
  it("keeps money separate per currency and never guesses missing currency", () => {
    expect(
      getPlannedCosts([
        { cost: "1,200", currency: "JPY" },
        { cost: "25.50", currency: "HKD" },
        { cost: "0.10", currency: "hkd" },
        { cost: "0.20", currency: "HKD" },
        { cost: "8", currency: null },
        { cost: "invalid", currency: "JPY" },
      ])
    ).toEqual([
      { currency: "HKD", amount: 25.8, activityCount: 3 },
      { currency: "JPY", amount: 1200, activityCount: 1 },
      { currency: UNSPECIFIED_CURRENCY, amount: 8, activityCount: 1 },
    ]);
  });
  it("distinguishes explicitly entered zero from unknown or invalid prices", () => {
    expect(parsePlannedCost("0")).toBe(0);
    for (const value of [
      null,
      "",
      " ",
      "NaN",
      "-20",
      "1,2",
      "¥100",
      "10.123",
    ]) {
      expect(parsePlannedCost(value)).toBeNull();
    }
    expect(getPlannedCosts([{ cost: null }])).toEqual([]);
  });
  it("counts scheduled days, activities and unique non-empty locations from real rows", () => {
    const summary = getItineraryInsights([
      {
        activities: [
          { location: " Tokyo Station ", cost: "0", currency: "JPY" },
          { location: "tokyo   station", cost: null },
        ],
      },
      { activities: [] },
      { activities: [{ location: "Kyoto", cost: "10", currency: "HKD" }] },
    ]);
    expect(summary).toMatchObject({
      dayCount: 3,
      scheduledDayCount: 2,
      activityCount: 3,
      locationCount: 2,
      unpricedActivityCount: 1,
    });
    expect(getItineraryInsights([])).toMatchObject({
      dayCount: 0,
      activityCount: 0,
      plannedCosts: [],
    });
  });
});

describe("itinerary reusable entry fields and safe exports", () => {
  it("reuses pin title, address, notes and category without typing them again", () => {
    expect(
      getActivityFieldsFromPin({
        title: "Cafe",
        address: "Central",
        notes: "Book a table",
        category: "restaurant",
      })
    ).toEqual({
      title: "Cafe",
      location: "Central",
      notes: "Book a table",
      category: "food",
    });
  });
  it("escapes existing user data when rendering the PDF print view", () => {
    expect(escapeItineraryHtml('<script>"Tom & Jane"</script>')).toBe(
      "&lt;script&gt;&quot;Tom &amp; Jane&quot;&lt;/script&gt;"
    );
  });
});
