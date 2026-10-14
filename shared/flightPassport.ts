export type FlightMetricInput = {
  departureAirport?: string | null;
  arrivalAirport?: string | null;
  distanceKm?: number | string | null;
  durationMinutes?: number | string | null;
};

/** Normalise user-entered IATA codes before lookup, comparison, or persistence. */
export function normalizeIataCode(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

export function isIataCode(value: string | null | undefined): boolean {
  return /^[A-Z]{3}$/.test(normalizeIataCode(value));
}

/** Returns a positive finite value, treating invalid, zero, and negative values as absent. */
export function toPositiveFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

export function parsePositiveWholeNumber(value: string): number | null {
  const numeric = toPositiveFiniteNumber(value.trim());
  return numeric !== null && Number.isInteger(numeric) ? numeric : null;
}

export function resolveFlightDistanceKm(
  flight: FlightMetricInput,
  estimateDistance: (departureAirport: string, arrivalAirport: string) => number,
): number {
  return toPositiveFiniteNumber(flight.distanceKm)
    ?? Math.max(0, estimateDistance(normalizeIataCode(flight.departureAirport), normalizeIataCode(flight.arrivalAirport)) || 0);
}

export function resolveFlightHours(
  flight: FlightMetricInput,
  estimateDistance: (departureAirport: string, arrivalAirport: string) => number,
  estimateHours: (distanceKm: number) => number,
): number {
  const durationMinutes = toPositiveFiniteNumber(flight.durationMinutes);
  if (durationMinutes !== null) return durationMinutes / 60;

  const estimatedHours = estimateHours(resolveFlightDistanceKm(flight, estimateDistance));
  return Number.isFinite(estimatedHours) && estimatedHours > 0 ? estimatedHours : 0;
}

/** Formats rounded total minutes to avoid invalid values such as "3h 60m". */
export function formatFlightHours(hours: number): string {
  const totalMinutes = Number.isFinite(hours) && hours > 0 ? Math.round(hours * 60) : 0;
  const days = Math.floor(totalMinutes / (24 * 60));
  const hoursPart = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutesPart = totalMinutes % 60;

  if (days > 0) return `${days}d ${hoursPart}h`;
  return `${hoursPart}h ${minutesPart}m`;
}

/** Produces the calendar date in Hong Kong for date inputs and date-based rules. */
export function getHongKongDateInput(value: Date | string = new Date()): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const getPart = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? "";
  return `${getPart("year")}-${getPart("month")}-${getPart("day")}`;
}

export function getHongKongYear(value: Date | string): number | null {
  const date = getHongKongDateInput(value);
  const year = Number(date.slice(0, 4));
  return Number.isInteger(year) && year > 0 ? year : null;
}

export function formatFlightDateInHongKong(value: Date | string, language: "zh" | "en"): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(language === "zh" ? "zh-HK" : "en-HK", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
