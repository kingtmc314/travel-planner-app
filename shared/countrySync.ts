import { normalizeStoredCalendarDate } from "./legacyDateOnly";
export type CountryStatus = "visited" | "planned" | "wishlist";
export type CountryRecord = { countryCode: string; countryName: string; status: CountryStatus; visitedAt?: Date | null; notes?: string | null };

export function validCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00+08:00`);
  if (!Number.isFinite(date.getTime())) return false;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit" }).format(date) === value;
}

export function tripCountryStatus(startDate: string, today: string): "visited" | "planned" {
  const date = normalizeStoredCalendarDate(startDate);
  return date && date <= today ? "visited" : "planned";
}

/** Automatic connections may fill missing evidence; they never erase manual notes or downgrade a visited record. */
export function mergeCountryEvidence(existing: CountryRecord | undefined, candidate: CountryRecord): CountryRecord {
  if (!existing) return candidate;
  const status = existing.status === "visited" || candidate.status === "visited" ? "visited" : existing.status === "planned" || candidate.status === "planned" ? "planned" : "wishlist";
  return { countryCode: existing.countryCode, countryName: existing.countryName, status, visitedAt: existing.visitedAt ?? (status === "visited" ? candidate.visitedAt ?? null : null), notes: existing.notes ?? null };
}
