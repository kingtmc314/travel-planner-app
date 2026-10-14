import type { Lang } from "@/lib/i18n";

export type DateOnly = `${number}-${string}-${string}`;

/** Keeps business dates as YYYY-MM-DD calendar values without browser-local drift. */
export function normalizeDateOnly(value: string | null | undefined): string {
  const date = (value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const [year, month, day] = date.split("-").map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day ? date : "";
}

export function isValidDateRange(startDate: string, endDate: string): boolean {
  const start = normalizeDateOnly(startDate);
  const end = normalizeDateOnly(endDate);
  return Boolean(start && end && start <= end);
}

export function getHongKongToday(): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

/** Converts a calendar date to a safe midday instant inside Hong Kong. */
export function dateOnlyToHongKongDate(value: string): Date | null {
  const normalized = normalizeDateOnly(value);
  return normalized ? new Date(`${normalized}T12:00:00+08:00`) : null;
}

export function formatDateOnlyInHongKong(value: string | null | undefined, lang: Lang, options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }): string {
  const date = dateOnlyToHongKongDate(value ?? "");
  if (!date) return "";
  return new Intl.DateTimeFormat(lang === "zh" ? "zh-HK" : "en-HK", { timeZone: "Asia/Hong_Kong", ...options }).format(date);
}

export function calculateNights(checkIn: string, checkOut: string): number | null {
  const start = dateOnlyToHongKongDate(checkIn);
  const end = dateOnlyToHongKongDate(checkOut);
  if (!start || !end) return null;
  const nights = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  return nights > 0 ? nights : null;
}
