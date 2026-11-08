/** Normalize legacy calendar strings for reading only; never rewrite original storage. SQL timestamps in date columns are Hong Kong wall-clock values, not UTC instants. */
export function normalizeStoredCalendarDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  const match = /^(\d{4}-\d{2}-\d{2})(?: ([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,6})?)?$/.exec(text);
  if (!match) return null;
  const calendar = match[1];
  const [year, month, day] = calendar.split("-").map(Number);
  if (year < 1000 || year > 9999) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? calendar : null;
}
