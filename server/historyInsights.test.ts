import { describe, expect, it } from "vitest";
import {
  filterHistoryCountries,
  historyDateInput,
  historyVisitYear,
  isHistoryDateInput,
  resolveHistoryVisitDate,
  summarizeHistory,
  uniqueHistoryCountries,
  type HistoryCountry,
} from "../client/src/lib/historyInsights";

const catalog = [
  { code: "JP", name: "Japan", region: "Asia" },
  { code: "HK", name: "Hong Kong", region: "Asia" },
  { code: "FR", name: "France", region: "Europe" },
  { code: "CA", name: "Canada", region: "North America" },
];

const countries: HistoryCountry[] = [
  {
    countryCode: "JP",
    countryName: "Japan",
    status: "visited",
    visitedAt: "2024-04-09",
  },
  {
    countryCode: "HK",
    countryName: "Hong Kong",
    status: "visited",
    visitedAt: null,
  },
  {
    countryCode: "FR",
    countryName: "France",
    status: "planned",
    visitedAt: "2025-01-01",
  },
  { countryCode: "CA", countryName: "Canada", status: "wishlist" },
  {
    countryCode: "ZZ",
    countryName: "Manual destination",
    status: "visited",
    visitedAt: "invalid",
  },
];

describe("history insights use saved country data", () => {
  it("counts real statuses and uses catalog-matched visited countries as the numerator", () => {
    const summary = summarizeHistory(countries, catalog);
    expect(summary.counts).toEqual({ visited: 3, planned: 1, wishlist: 1 });
    expect(summary.catalogTotal).toBe(4);
    expect(summary.catalogVisited).toBe(2);
    expect(summary.visitedPercentage).toBe(50);
    expect(summary.trackedCount).toBe(5);
    expect(summary.unmappedVisited).toBe(1);
  });

  it("uses the existing region mapping and never guesses an unknown country region", () => {
    const summary = summarizeHistory(countries, catalog);
    expect(summary.regions).toEqual([
      { region: "Asia", total: 2, visited: 2, planned: 0, wishlist: 0 },
      { region: "Europe", total: 1, visited: 0, planned: 1, wishlist: 0 },
      {
        region: "North America",
        total: 1,
        visited: 0,
        planned: 0,
        wishlist: 1,
      },
    ]);
    expect(
      summary.regions.reduce((total, region) => total + region.visited, 0)
    ).toBe(2);
  });

  it("keeps unknown years separate and excludes planned dates from visit-year counts", () => {
    const summary = summarizeHistory(countries, catalog);
    expect(summary.visitsByYear).toEqual([{ year: 2024, count: 1 }]);
    expect(summary.unknownVisitYear).toBe(2);
  });

  it("counts each normalized ISO code once, including duplicate catalog codes", () => {
    const duplicated = [
      countries[0],
      { ...countries[0], countryCode: " jp " },
      countries[1],
    ];
    expect(uniqueHistoryCountries(duplicated)).toHaveLength(2);
    const summary = summarizeHistory(duplicated, [...catalog, catalog[0]]);
    expect(summary.catalogTotal).toBe(4);
    expect(summary.counts.visited).toBe(2);
    expect(summary.visitedPercentage).toBe(50);
  });

  it("sorts known years chronologically using Hong Kong year boundaries", () => {
    const summary = summarizeHistory(
      [
        { ...countries[0], visitedAt: "2024-12-31T16:30:00Z" },
        { ...countries[1], visitedAt: "2023-09-01" },
      ],
      catalog
    );
    expect(summary.visitsByYear).toEqual([
      { year: 2023, count: 1 },
      { year: 2025, count: 1 },
    ]);
  });

  it("returns real empty counts and no fabricated percentage when the catalog is absent", () => {
    const summary = summarizeHistory([], []);
    expect(summary.counts).toEqual({ visited: 0, planned: 0, wishlist: 0 });
    expect(summary.visitedPercentage).toBeNull();
    expect(summary.visitsByYear).toEqual([]);
    expect(summary.unknownVisitYear).toBe(0);
  });
});

describe("history country filters", () => {
  it("combines case-insensitive country-name, status and region filters", () => {
    expect(
      filterHistoryCountries(countries, catalog, {
        search: " jApAn ",
        status: "visited",
        region: "Asia",
      })
    ).toEqual([countries[0]]);
    expect(
      filterHistoryCountries(countries, catalog, {
        search: "Japan",
        status: "planned",
        region: "Asia",
      })
    ).toEqual([]);
  });

  it("searches ISO codes and localized names without discarding manual destinations", () => {
    expect(
      filterHistoryCountries(countries, catalog, {
        search: "jp",
        status: "all",
        region: "__all__",
      })
    ).toEqual([countries[0]]);
    expect(
      filterHistoryCountries(
        countries,
        catalog,
        { search: "日本", status: "all", region: "__all__" },
        code => (code === "JP" ? "日本" : "")
      )
    ).toEqual([countries[0]]);
    expect(
      filterHistoryCountries(countries, catalog, {
        search: "manual",
        status: "all",
        region: "__all__",
      })
    ).toEqual([countries[4]]);
  });

  it("a reset returns all saved countries, while mapped-region filters exclude unmapped ones", () => {
    expect(
      filterHistoryCountries(countries, catalog, {
        search: "",
        status: "all",
        region: "__all__",
      })
    ).toEqual(countries);
    expect(
      filterHistoryCountries(countries, catalog, {
        search: "",
        status: "all",
        region: "Asia",
      })
    ).toEqual(countries.slice(0, 2));
  });
});

describe("Hong Kong history dates", () => {
  it("preserves date-only calendar dates exactly", () => {
    expect(historyDateInput("2024-02-29")).toBe("2024-02-29");
    expect(historyDateInput("2025-01-01")).toBe("2025-01-01");
    expect(historyVisitYear("2025-01-01")).toBe(2025);
  });

  it("converts timestamp instants at midnight and new-year boundaries in UTC+8", () => {
    expect(historyDateInput(new Date("2024-12-31T16:00:00Z"))).toBe(
      "2025-01-01"
    );
    expect(historyDateInput("2024-12-31T15:59:59Z")).toBe("2024-12-31");
    expect(historyVisitYear("2024-12-31T16:00:00Z")).toBe(2025);
    expect(historyDateInput("2025-01-01T00:30:00+08:00")).toBe("2025-01-01");
  });

  it("treats timezone-less legacy datetimes as Hong Kong wall-clock time", () => {
    expect(historyDateInput("2024-12-31 23:30:00")).toBe("2024-12-31");
    expect(historyDateInput("2024-12-31T23:30:00")).toBe("2024-12-31");
  });

  it("keeps missing and invalid dates unknown, and validates leap days", () => {
    expect(historyDateInput(null)).toBe("");
    expect(historyDateInput(undefined)).toBe("");
    expect(historyDateInput("2023-02-29")).toBe("");
    expect(historyDateInput(new Date("invalid"))).toBe("");
    expect(historyVisitYear("invalid")).toBeNull();
    expect(isHistoryDateInput("2024-02-29")).toBe(true);
    expect(isHistoryDateInput("2024-02-30")).toBe(false);
    expect(isHistoryDateInput("0000-01-01")).toBe(false);
  });

  it("emits only YYYY-MM-DD for exact dates and remembered years", () => {
    expect(resolveHistoryVisitDate("2024-08-19", "2023")).toBe("2024-08-19");
    expect(resolveHistoryVisitDate("", " 2023 ")).toBe("2023-01-01");
    expect(resolveHistoryVisitDate("", "")).toBeUndefined();
    expect(() => resolveHistoryVisitDate("2023-02-29", "")).toThrow();
    expect(() => resolveHistoryVisitDate("", "2024.5")).toThrow();
    expect(() => resolveHistoryVisitDate("", "24")).toThrow();
    expect(() => resolveHistoryVisitDate("", "0000")).toThrow();
  });
});
