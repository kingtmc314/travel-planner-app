import { getHongKongDateInput, normalizeIataCode } from "./flightPassport";
import { normalizeStoredCalendarDate } from "./legacyDateOnly";

export type ConnectedImportResult = { created: number; skipped: number };
export type ConnectedValidatedImportResult = ConnectedImportResult & {
  invalid: number;
};
export type ConnectedLogisticsResult = ConnectedValidatedImportResult & {
  updated: number;
};
export type ConnectedSource =
  | "passport"
  | "flight"
  | "hotel-checkin"
  | "hotel-checkout"
  | "expense"
  | "pin";

/** Stable across source edits; scoped to the trip to avoid cross-trip collisions. */
export function connectedSourceMarker(
  source: ConnectedSource,
  tripId: number,
  sourceId: number
): string {
  return `[voyageai:connected:v1:${source}:trip:${tripId}:source:${sourceId}]`;
}

export function hasConnectedSource(
  notes: string | null | undefined,
  marker: string
): boolean {
  return (notes ?? "").split(/\r?\n/).some(line => line.trim() === marker);
}

export function appendConnectedNote(
  notes: string | null | undefined,
  ...lines: string[]
): string {
  return [notes || "", ...lines].filter(Boolean).join("\n");
}

function validCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1000 || year > 9999) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** Date-only values remain calendar strings; instants require an explicit timezone. */
export function connectedDate(value: unknown): string | null {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return null;
    const date = getHongKongDateInput(value);
    return validCalendarDate(date) ? date : null;
  }
  if (typeof value !== "string") return null;
  const text = value.trim();
  const storedCalendar = normalizeStoredCalendarDate(text);
  if (storedCalendar) return storedCalendar;
  const instant =
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/i.exec(
      text
    );
  if (
    !instant ||
    !validCalendarDate(instant[1]) ||
    Number(instant[2]) > 23 ||
    Number(instant[3]) > 59 ||
    Number(instant[4] ?? 0) > 59
  )
    return null;
  if (instant[5].toUpperCase() !== "Z") {
    const [hours, minutes] = instant[5].slice(1).split(":").map(Number);
    if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0))
      return null;
  }
  return connectedDate(new Date(text));
}

/** Noon Hong Kong avoids midnight date drift when serialized or displayed. */
export function connectedPassportDate(date: string): Date {
  if (!validCalendarDate(date))
    throw new Error("Invalid Hong Kong calendar date");
  return new Date(`${date}T12:00:00+08:00`);
}

/** Parse only explicitly supplied elapsed duration, never subtract local airport times. */
export function parseConnectedDuration(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const text = value.trim().toLowerCase();
  let minutes: number | null = null;
  const clock = /^(\d{1,4}):([0-5]\d)$/.exec(text);
  const units =
    /^(?:(\d+(?:\.\d+)?)\s*(?:h(?:ours?|rs?)?|小時)\s*)?(?:(\d+)\s*(?:m(?:in(?:ute)?s?)?|分鐘|分))?$/.exec(
      text
    );
  if (clock) minutes = Number(clock[1]) * 60 + Number(clock[2]);
  else if (units && (units[1] || units[2]))
    minutes = Number(units[1] ?? 0) * 60 + Number(units[2] ?? 0);
  else {
    const iso = /^pt(?:(\d+)h)?(?:(\d+)m)?$/i.exec(text);
    if (iso && (iso[1] || iso[2]))
      minutes = Number(iso[1] ?? 0) * 60 + Number(iso[2] ?? 0);
  }
  return minutes !== null &&
    Number.isSafeInteger(minutes) &&
    minutes > 0 &&
    minutes <= 2147483647
    ? minutes
    : null;
}

export function connectedTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  return match ? match[0] : null;
}

const currencyCodes = new Set<string>(Intl.supportedValuesOf("currency"));
currencyCodes.add("TWD");
/** Reject made-up three-letter codes; prefer activity currency, then trip base. */
export function connectedCurrency(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) && currencyCodes.has(code) ? code : null;
}

/** Decimal(10,2) bounds and rounding are checked before any write. */
export function connectedAmount(value: unknown): string | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 99999999.99)
    return null;
  const rounded = amount.toFixed(2);
  return Number(rounded) > 0 && Number(rounded) <= 99999999.99 ? rounded : null;
}

export function connectedCoordinates(
  lat: unknown,
  lng: unknown
): { lat: string; lng: string } | null {
  const numeric = (value: unknown): number | null => {
    if (
      (typeof value !== "number" && typeof value !== "string") ||
      (typeof value === "string" && !value.trim())
    )
      return null;
    const result = Number(value);
    return Number.isFinite(result) ? result : null;
  };
  const latitude = numeric(lat),
    longitude = numeric(lng);
  if (
    latitude === null ||
    longitude === null ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  )
    return null;
  return { lat: latitude.toFixed(7), lng: longitude.toFixed(7) };
}

export function connectedText(value: unknown): string {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").toLowerCase()
    : "";
}

export function connectedFlightKey(
  date: string,
  from: string | null,
  to: string | null,
  flightNumber: string | null
): string {
  return JSON.stringify([
    date,
    normalizeIataCode(from),
    normalizeIataCode(to),
    (flightNumber ?? "").replace(/\s+/g, "").toUpperCase(),
  ]);
}

export type ConnectedActivitySnapshot = {
  date: string;
  title: string;
  location: string | null;
  startTime: string | null;
  endTime: string | null;
  category: string | null;
};
export function connectedActivityKey(
  snapshot: ConnectedActivitySnapshot
): string {
  return JSON.stringify([
    snapshot.date,
    connectedText(snapshot.title),
    connectedText(snapshot.location),
    snapshot.startTime ?? "",
    snapshot.endTime ?? "",
    snapshot.category ?? "other",
  ]);
}
