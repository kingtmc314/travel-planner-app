import { normalizeDateOnly } from "./hongKongDate";

export const ITINERARY_TIME_ZONE = "Asia/Hong_Kong";
export const UNSPECIFIED_CURRENCY = "UNSPECIFIED";

/** Calendar values stay date-only; timestamp values are explicitly converted to HK. */
export function itineraryDateOnly(
  value: string | Date | null | undefined
): string {
  if (!value) return "";
  if (typeof value === "string") {
    const calendar = normalizeDateOnly(value);
    if (calendar) return calendar;
    // Never interpret a timezone-less timestamp in the browser's timezone.
    if (!/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) return "";
  }
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ITINERARY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(part => part.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

export function addItineraryCalendarDays(value: string, count: number): string {
  const normalized = normalizeDateOnly(value);
  if (!normalized || !Number.isInteger(count)) return "";
  const [year, month, day] = normalized.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + count));
  return date.toISOString().slice(0, 10);
}

export interface InsightActivity {
  location?: string | null;
  cost?: string | number | null;
  currency?: string | null;
}

export interface InsightDay {
  date?: string | null;
  dayNumber?: number;
  activities?: InsightActivity[];
}

/** Only valid, non-negative entered amounts; missing cost is not a made-up zero. */
export function parsePlannedCost(
  value: string | number | null | undefined
): number | null {
  if (value == null || (typeof value === "string" && !value.trim()))
    return null;
  const text = String(value).trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(text)) return null;
  const amount = Number(text.replaceAll(",", ""));
  return Number.isFinite(amount) &&
    Number.isSafeInteger(Math.round(amount * 100))
    ? amount
    : null;
}

export function getPlannedCosts(
  activities: InsightActivity[]
): { currency: string; amount: number; activityCount: number }[] {
  const groups = new Map<string, { cents: number; activityCount: number }>();
  for (const activity of activities) {
    const amount = parsePlannedCost(activity.cost);
    if (amount == null) continue;
    const currency =
      activity.currency?.trim().toUpperCase() || UNSPECIFIED_CURRENCY;
    const previous = groups.get(currency) ?? { cents: 0, activityCount: 0 };
    groups.set(currency, {
      cents: previous.cents + Math.round(amount * 100),
      activityCount: previous.activityCount + 1,
    });
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, group]) => ({
      currency,
      amount: group.cents / 100,
      activityCount: group.activityCount,
    }));
}

export function getItineraryInsights(days: InsightDay[]) {
  const activities = days.flatMap(day => day.activities ?? []);
  const locations = new Set(
    activities
      .map(activity =>
        activity.location?.trim().replace(/\s+/g, " ").toLocaleLowerCase()
      )
      .filter(Boolean)
  );
  return {
    dayCount: days.length,
    scheduledDayCount: days.filter(day => (day.activities?.length ?? 0) > 0)
      .length,
    activityCount: activities.length,
    locationCount: locations.size,
    plannedCosts: getPlannedCosts(activities),
    unpricedActivityCount: activities.filter(
      activity => parsePlannedCost(activity.cost) == null
    ).length,
  };
}

/** Append after the latest real day, not trip start + count (which duplicates gaps). */
export function getNextItineraryDay(
  days: InsightDay[],
  startDate: string | null | undefined,
  now = new Date()
) {
  const validDates = days
    .map(day => itineraryDateOnly(day.date))
    .filter(Boolean)
    .sort();
  const latest = validDates.at(-1);
  const date = latest
    ? addItineraryCalendarDays(latest, 1)
    : itineraryDateOnly(startDate) || itineraryDateOnly(now);
  const dayNumber = Math.max(0, ...days.map(day => day.dayNumber ?? 0)) + 1;
  return { date, dayNumber };
}

export function getActivityFieldsFromPin(pin: {
  title: string;
  address?: string | null;
  notes?: string | null;
  category?: string | null;
}) {
  const categories: Record<string, string> = {
    attraction: "attraction",
    hotel: "hotel",
    restaurant: "food",
    transport: "transport",
    other: "other",
  };
  return {
    title: pin.title,
    location: pin.address ?? "",
    notes: pin.notes ?? "",
    category: categories[pin.category ?? "other"] ?? "other",
  };
}

export function escapeItineraryHtml(value: unknown): string {
  return String(value ?? "").replace(
    /[&<>"']/g,
    character =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!
  );
}
