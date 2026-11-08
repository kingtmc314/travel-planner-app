import { getHongKongDateInput } from "@shared/flightPassport";

export type HistoryStatus = "visited" | "planned" | "wishlist";
export type HistoryCountry = {
  countryCode: string;
  countryName: string;
  status: HistoryStatus;
  visitedAt?: Date | string | null;
  notes?: string | null;
};
export type HistoryCatalogCountry = {
  code: string;
  name: string;
  region: string;
};

/** Date-only values are calendar dates, not instants; never shift them by timezone. */
export function isHistoryDateInput(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000"))
    return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

export function historyDateInput(
  value: Date | string | null | undefined
): string {
  if (!value) return "";
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value))
      return isHistoryDateInput(value) ? value : "";
    // A timezone-less legacy datetime denotes a Hong Kong wall-clock time.
    if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(value)) {
      value = `${value.replace(" ", "T")}+08:00`;
    }
  }
  return getHongKongDateInput(value);
}

export function historyVisitYear(
  value: Date | string | null | undefined
): number | null {
  const date = historyDateInput(value);
  return date ? Number(date.slice(0, 4)) : null;
}

/** Exact dates win; a remembered year uses Jan 1 as an explicitly explained convention. */
export function resolveHistoryVisitDate(
  date: string,
  year: string
): string | undefined {
  const exact = date.trim();
  if (exact) {
    if (!isHistoryDateInput(exact)) throw new Error("Invalid visit date");
    return exact;
  }
  const rememberedYear = year.trim();
  if (!rememberedYear) return undefined;
  if (!/^\d{4}$/.test(rememberedYear) || Number(rememberedYear) < 1000) {
    throw new Error("Invalid visit year");
  }
  return `${rememberedYear}-01-01`;
}

/** DB rows normally have one entry per ISO code. Defensive deduplication counts destinations, not rows. */
export function uniqueHistoryCountries<T extends HistoryCountry>(
  countries: readonly T[]
): T[] {
  const unique = new Map<string, T>();
  for (const country of countries) {
    const code = country.countryCode.trim().toUpperCase();
    if (code) unique.set(code, country);
  }
  return Array.from(unique.values());
}

export function summarizeHistory(
  countries: readonly HistoryCountry[],
  catalog: readonly HistoryCatalogCountry[]
) {
  const unique = uniqueHistoryCountries(countries);
  const catalogByCode = new Map(
    catalog.map(country => [country.code.trim().toUpperCase(), country])
  );
  const counts = { visited: 0, planned: 0, wishlist: 0 };
  const regions = Array.from(
    new Set(catalog.map(country => country.region))
  ).map(region => ({
    region,
    total: Array.from(catalogByCode.values()).filter(
      country => country.region === region
    ).length,
    visited: 0,
    planned: 0,
    wishlist: 0,
  }));
  const yearCounts = new Map<number, number>();
  let catalogVisited = 0;
  let unmappedVisited = 0;
  let unknownVisitYear = 0;

  for (const country of unique) {
    counts[country.status]++;
    const catalogCountry = catalogByCode.get(
      country.countryCode.trim().toUpperCase()
    );
    const region = regions.find(item => item.region === catalogCountry?.region);
    if (region) region[country.status]++;
    if (country.status !== "visited") continue;
    if (catalogCountry) catalogVisited++;
    else unmappedVisited++;
    const year = historyVisitYear(country.visitedAt);
    if (year === null) unknownVisitYear++;
    else yearCounts.set(year, (yearCounts.get(year) ?? 0) + 1);
  }

  return {
    counts,
    trackedCount: unique.length,
    catalogTotal: catalogByCode.size,
    catalogVisited,
    visitedPercentage: catalogByCode.size
      ? (catalogVisited / catalogByCode.size) * 100
      : null,
    regions,
    unmappedVisited,
    unknownVisitYear,
    visitsByYear: Array.from(yearCounts, ([year, count]) => ({
      year,
      count,
    })).sort((a, b) => a.year - b.year),
  };
}

export function filterHistoryCountries<T extends HistoryCountry>(
  countries: readonly T[],
  catalog: readonly HistoryCatalogCountry[],
  filters: { search: string; status: HistoryStatus | "all"; region: string },
  localizedName: (code: string) => string = () => ""
): T[] {
  const query = filters.search.trim().toLocaleLowerCase();
  const catalogByCode = new Map(
    catalog.map(country => [country.code.toUpperCase(), country])
  );
  return uniqueHistoryCountries(countries).filter(country => {
    const code = country.countryCode.trim().toUpperCase();
    const entry = catalogByCode.get(code);
    return (
      (filters.status === "all" || country.status === filters.status) &&
      (filters.region === "__all__" || entry?.region === filters.region) &&
      (!query ||
        [country.countryName, entry?.name, code, localizedName(code)].some(
          value => value?.toLocaleLowerCase().includes(query)
        ))
    );
  });
}
