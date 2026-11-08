import { getHongKongDateInput } from "./flightPassport";
import { normalizeStoredCalendarDate } from "./legacyDateOnly";

export type FlightLookupCandidate = {
  id: string;
  flightNumber: string;
  date: string;
  airline: string;
  fromCode: string;
  fromCity: string;
  toCode: string;
  toCity: string;
  /** Saved local airport clocks, never inferred from elapsed duration. */
  departTime: string;
  arriveTime: string;
  durationMinutes: number | null;
  distanceKm: number | null;
  source: "passport" | "trip";
  sourceLabel: string;
};

export type FlightLookupResult = {
  flightNumber: string;
  date: string;
  candidates: FlightLookupCandidate[];
  providerConfigured: false;
  onlineStatus: "not_configured";
  status: "matched" | "ambiguous" | "not_found";
  warnings: string[];
};

export type LookupResponse = FlightLookupResult;

/** ICAO (three letters) or IATA (two alphanumerics, including a letter),
 * followed by 1–4 digits and an optional operational letter suffix.
 * Preserve leading zeros; do not translate ICAO/IATA or guess an airline/route.
 */
export function normalizeFlightLookupNumber(value: string): string {
  if (typeof value !== "string") return "";
  const normalized = value.replace(/\s+/g, "").toUpperCase();
  return normalized.length <= 12 &&
    /^(?:[A-Z]{3}|[A-Z][A-Z0-9]|[0-9][A-Z])\d{1,4}[A-Z]?$/.test(normalized)
    ? normalized
    : "";
}

/** Strict positive Gregorian year (0001–9999), without Date.UTC's 0–99 remapping. */
export function validFlightLookupDate(value: string): boolean {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1)
    return false;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** Calendar strings/legacy SQL wall-clock dates stay unchanged. Only actual
 * instants with an explicit timezone (or Date objects) use Hong Kong conversion.
 */
export function normalizeFlightLookupStoredDate(value: unknown): string | null {
  if (value instanceof Date) {
    const instant = value.getTime();
    if (
      !Number.isFinite(instant) ||
      instant < new Date("0001-01-01T00:00:00+08:00").getTime() ||
      instant > new Date("9999-12-31T23:59:59.999+08:00").getTime()
    )
      return null;
    const [year, month, day] = getHongKongDateInput(value).split("-");
    const calendar = `${year.padStart(4, "0")}-${month}-${day}`;
    return validFlightLookupDate(calendar) ? calendar : null;
  }
  if (typeof value !== "string") return null;
  const text = value.trim();
  const stored = normalizeStoredCalendarDate(text);
  if (stored) return stored;
  // The existing helper accepts years >=1000; retain the same wall-clock rules
  // for valid positive four-digit years below that boundary too.
  const calendar =
    /^(\d{4}-\d{2}-\d{2})(?: ([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,6})?)?$/.exec(
      text
    );
  if (calendar) return validFlightLookupDate(calendar[1]) ? calendar[1] : null;
  const iso =
    /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/i.exec(
      text
    );
  if (!iso || !validFlightLookupDate(iso[1])) return null;
  if (iso[5].toUpperCase() !== "Z") {
    const [hours, minutes] = iso[5].slice(1).split(":").map(Number);
    if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0))
      return null;
  }
  return normalizeFlightLookupStoredDate(new Date(text));
}
