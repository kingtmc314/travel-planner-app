import { describe, expect, it } from "vitest";
import { normalizeStoredCalendarDate } from "../shared/legacyDateOnly";
import { connectedDate } from "../shared/connected";
import { normalizeDateOnly } from "../client/src/lib/hongKongDate";

describe("read-only legacy calendar compatibility", () => {
  it("accepts SQL calendar strings without interpreting browser or UTC timezone", () => {
    expect(normalizeStoredCalendarDate("2026-02-15 00:00:00")).toBe("2026-02-15");
    expect(normalizeStoredCalendarDate("2026-02-15 23:59:59.000000")).toBe("2026-02-15");
    expect(normalizeDateOnly("2026-02-15 00:00:00")).toBe("2026-02-15");
    expect(connectedDate("2026-02-15 00:00:00")).toBe("2026-02-15");
  });
  it("rejects ambiguous prefixes, invalid days and invalid wall-clock times", () => {
    for (const value of ["2026-02-30 00:00:00","2026-02-15whatever","2026-02-15 24:00:00","2026-02-15T00:00:00Z"]) expect(normalizeStoredCalendarDate(value)).toBeNull();
  });
  it("keeps real timestamp conversion explicitly Hong Kong in connection helpers", () => {
    expect(connectedDate("2026-02-15T23:00:00Z")).toBe("2026-02-16");
  });
});
