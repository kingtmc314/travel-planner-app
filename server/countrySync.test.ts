import { describe, expect, it } from "vitest";
import { mergeCountryEvidence, tripCountryStatus, validCalendarDate } from "../shared/countrySync";

describe("non-destructive country evidence", () => {
  it("does not mark future or malformed trip dates visited", () => {
    expect(tripCountryStatus("2027-01-01", "2026-11-08")).toBe("planned");
    expect(tripCountryStatus("bad", "2026-11-08")).toBe("planned");
    expect(tripCountryStatus("2026-11-08", "2026-11-08")).toBe("visited");
    expect(validCalendarDate("2026-02-30")).toBe(false);
    expect(validCalendarDate("2024-02-29")).toBe(true);
  });
  it("preserves manual notes and the existing visit date when new evidence is connected", () => {
    const visitedAt = new Date("2020-01-02T12:00:00+08:00");
    const result = mergeCountryEvidence({countryCode:"TW",countryName:"Taiwan",status:"visited",visitedAt,notes:"My original memory"}, {countryCode:"TW",countryName:"Taiwan",status:"planned",visitedAt:null,notes:"automatic"});
    expect(result.status).toBe("visited");
    expect(result.notes).toBe("My original memory");
    expect(result.visitedAt).toBe(visitedAt);
  });
  it("promotes planned evidence without replacing a manual note", () => {
    const date = new Date("2026-06-19T12:00:00+08:00");
    const result = mergeCountryEvidence({countryCode:"TW",countryName:"Taiwan",status:"planned",notes:"keep"}, {countryCode:"TW",countryName:"Taiwan",status:"visited",visitedAt:date});
    expect(result).toMatchObject({status:"visited",notes:"keep",visitedAt:date});
  });
});
