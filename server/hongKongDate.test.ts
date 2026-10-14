import { describe, expect, it } from "vitest";
import { calculateNights, dateOnlyToHongKongDate, formatDateOnlyInHongKong, isValidDateRange, normalizeDateOnly } from "../client/src/lib/hongKongDate";

describe("Hong Kong date-only helpers", () => {
  it("accepts real calendar dates without browser-local date conversion", () => {
    expect(normalizeDateOnly("2026-02-28")).toBe("2026-02-28");
    expect(normalizeDateOnly("2026-02-30")).toBe("");
    expect(normalizeDateOnly("2026/02/28")).toBe("");
  });
  it("keeps Hong Kong calendar values stable at UTC boundaries", () => {
    const date = dateOnlyToHongKongDate("2026-01-01");
    expect(date?.toISOString()).toBe("2026-01-01T04:00:00.000Z");
    expect(formatDateOnlyInHongKong("2026-01-01", "zh")).toContain("2026");
    expect(formatDateOnlyInHongKong("2026-01-01", "en")).toContain("2026");
  });
  it("validates ranges and derives accommodation nights from date-only values", () => {
    expect(isValidDateRange("2026-06-01", "2026-06-01")).toBe(true);
    expect(isValidDateRange("2026-06-02", "2026-06-01")).toBe(false);
    expect(calculateNights("2026-06-01", "2026-06-04")).toBe(3);
    expect(calculateNights("2026-06-04", "2026-06-01")).toBeNull();
  });
});
