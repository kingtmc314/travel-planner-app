import { getHongKongDateInput } from "./flightPassport";
import { normalizeStoredCalendarDate } from "./legacyDateOnly";

export type AnalyticsTripInput = {
  id: number;
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  baseCurrency: string;
  coverImage?: string | null;
  userRole?: string;
  isDemoTrip?: boolean | null;
};
export type AnalyticsExpenseInput = {
  amount: string | number;
  currency: string;
  category?: string | null;
  date: string;
};
export type AnalyticsActivityInput = {
  dayId: number;
  cost?: string | null;
  currency?: string | null;
};
export type AnalyticsDayInput = { id: number; date: string };
export type AnalyticsBundle = {
  trip: AnalyticsTripInput;
  days: AnalyticsDayInput[];
  activities: AnalyticsActivityInput[];
  expenses: AnalyticsExpenseInput[];
  flights: { date?: string | null }[];
  hotels: { checkIn?: string | null; checkOut?: string | null }[];
  members: { userId: number }[];
  pins: { id: number }[];
};
export type AnalyticsPassportInput = {
  flightDate: Date | string;
  durationMinutes?: number | null;
  distanceKm?: number | null;
  departureAirport: string;
  arrivalAirport: string;
};
export type AnalyticsCountryInput = {
  countryCode: string;
  status: "visited" | "planned" | "wishlist";
};
export type TripStatus = "past" | "current" | "upcoming" | "undated";
const DAY_MS = 86_400_000;

/** Read stored HK calendar dates, including legacy SQL strings, without rewriting data. */
export function analyticsDateOnly(value: unknown): string | null {
  return normalizeStoredCalendarDate(value);
}
function dayIndex(value: string): number {
  return Date.parse(`${value}T00:00:00Z`) / DAY_MS;
}
export function analyticsDateRange(
  start: string,
  end: string
): [number, number] | null {
  const startDate = analyticsDateOnly(start);
  const endDate = analyticsDateOnly(end);
  return startDate && endDate && startDate <= endDate
    ? [dayIndex(startDate), dayIndex(endDate)]
    : null;
}
export function analyticsTripStatus(
  start: string,
  end: string,
  today: string
): TripStatus {
  const range = analyticsDateRange(start, end);
  const todayDate = analyticsDateOnly(today);
  if (!range || !todayDate) return "undated";
  const currentDay = dayIndex(todayDate);
  return range[1] < currentDay
    ? "past"
    : range[0] > currentDay
      ? "upcoming"
      : "current";
}
/** Inclusive union of intervals; overlapping trips do not double-count calendar days. */
export function unionTravelDays(ranges: Array<[number, number]>): number {
  const sorted = ranges
    .filter(
      ([start, end]) =>
        Number.isFinite(start) && Number.isFinite(end) && start <= end
    )
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let active: [number, number] | null = null;
  for (const [start, end] of sorted) {
    if (!active) active = [start, end];
    else if (start <= active[1] + 1) active[1] = Math.max(active[1], end);
    else {
      total += active[1] - active[0] + 1;
      active = [start, end];
    }
  }
  return total + (active ? active[1] - active[0] + 1 : 0);
}
export function normalizeAnalyticsCurrency(
  value: string | null | undefined
): string | null {
  const code = value?.trim().toUpperCase() ?? "";
  return /^[A-Z]{3}$/.test(code) ? code : null;
}
/** Decimal parsing in minor units avoids 0.1 + 0.2 errors; rejects ambiguous text. */
export function analyticsAmountMinor(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) return null;
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = text.replace(/^-/, "").split(".");
  const minor =
    Number(whole) * 100 +
    Number((fraction + "00").slice(0, 2)) +
    (Number(fraction[2] ?? 0) >= 5 ? 1 : 0);
  return Number.isSafeInteger(minor) ? (negative ? -minor : minor) : null;
}
const money = (minor: number) => minor / 100;

export function summarizeExpenses(expenses: AnalyticsExpenseInput[]) {
  const groups = new Map<
    string,
    {
      minor: number;
      datedMinor: number;
      count: number;
      datedCount: number;
      days: Set<string>;
      categories: Map<string, { minor: number; count: number }>;
    }
  >();
  let invalidMoneyRecords = 0;
  let invalidDateRecords = 0;
  for (const expense of expenses) {
    const currency = normalizeAnalyticsCurrency(expense.currency);
    const amount = analyticsAmountMinor(expense.amount);
    const date = analyticsDateOnly(expense.date);
    if (!date) invalidDateRecords++;
    if (!currency || amount === null) {
      invalidMoneyRecords++;
      continue;
    }
    const group = groups.get(currency) ?? {
      minor: 0,
      datedMinor: 0,
      count: 0,
      datedCount: 0,
      days: new Set<string>(),
      categories: new Map(),
    };
    group.minor += amount;
    group.count++;
    if (date) {
      group.days.add(date);
      group.datedMinor += amount;
      group.datedCount++;
    }
    const category = expense.category || "other";
    const bucket = group.categories.get(category) ?? { minor: 0, count: 0 };
    bucket.minor += amount;
    bucket.count++;
    group.categories.set(category, bucket);
    groups.set(currency, group);
  }
  return {
    invalidMoneyRecords,
    invalidDateRecords,
    currencies: Array.from(groups, ([currency, group]) => ({
      currency,
      total: money(group.minor),
      recordCount: group.count,
      datedTotal: money(group.datedMinor),
      datedRecordCount: group.datedCount,
      recordedDays: group.days.size,
      averagePerExpense: money(group.minor) / group.count,
      averagePerRecordedDay: group.days.size
        ? money(group.datedMinor) / group.days.size
        : null,
      categories: Array.from(group.categories, ([category, bucket]) => ({
        category,
        total: money(bucket.minor),
        recordCount: bucket.count,
      })).sort((a, b) => b.total - a.total),
    })).sort((a, b) => a.currency.localeCompare(b.currency)),
  };
}
function summarizeEstimates(
  activities: AnalyticsActivityInput[],
  baseCurrency: string
) {
  const groups = new Map<string, { minor: number; count: number }>();
  let invalidRecords = 0;
  for (const activity of activities) {
    if (
      activity.cost === null ||
      activity.cost === undefined ||
      activity.cost.trim() === ""
    )
      continue;
    const amount = analyticsAmountMinor(activity.cost);
    const currency = normalizeAnalyticsCurrency(
      activity.currency || baseCurrency
    );
    if (amount === null || amount < 0 || !currency) {
      invalidRecords++;
      continue;
    }
    const group = groups.get(currency) ?? { minor: 0, count: 0 };
    group.minor += amount;
    group.count++;
    groups.set(currency, group);
  }
  return {
    invalidRecords,
    currencies: Array.from(groups, ([currency, group]) => ({
      currency,
      total: money(group.minor),
      recordCount: group.count,
    })).sort((a, b) => a.currency.localeCompare(b.currency)),
  };
}
function passportDate(value: Date | string): string | null {
  if (typeof value === "string") {
    const calendarDate = analyticsDateOnly(value);
    if (calendarDate) return calendarDate;
    // Invalid calendar-only strings must not silently roll into another month.
    if (/^\d{4}-\d{2}-\d{2}(?: |$)/.test(value.trim())) return null;
  }
  if (!(value instanceof Date) && typeof value !== "string") return null;
  return analyticsDateOnly(getHongKongDateInput(value));
}

/** Pure aggregator. The server supplies only member-authorized bundles and personal records. */
export function buildTravelOverview(input: {
  userId: number;
  bundles: AnalyticsBundle[];
  passport: AnalyticsPassportInput[];
  countries: AnalyticsCountryInput[];
  now?: Date;
  year?: number;
}) {
  const today = getHongKongDateInput(input.now ?? new Date());
  const uniqueBundles = Array.from(
    new Map(input.bundles.map(bundle => [bundle.trip.id, bundle])).values()
  );
  const yearMatches = (date: string | null) =>
    input.year === undefined ||
    (date !== null && Number(date.slice(0, 4)) === input.year);
  const selected = uniqueBundles.filter(bundle =>
    yearMatches(analyticsDateOnly(bundle.trip.startDate))
  );
  const selectedPassport = input.passport.filter(flight =>
    yearMatches(passportDate(flight.flightDate))
  );
  const trend = new Map<
    number,
    {
      year: number;
      trips: number;
      tripFlights: number;
      passportFlights: number;
    }
  >();
  const annual = (
    date: string | null,
    metric: "trips" | "tripFlights" | "passportFlights"
  ) => {
    if (!date) return;
    const year = Number(date.slice(0, 4));
    const bucket = trend.get(year) ?? {
      year,
      trips: 0,
      tripFlights: 0,
      passportFlights: 0,
    };
    bucket[metric]++;
    trend.set(year, bucket);
  };
  for (const bundle of uniqueBundles) {
    if (analyticsDateRange(bundle.trip.startDate, bundle.trip.endDate))
      annual(analyticsDateOnly(bundle.trip.startDate), "trips");
    for (const flight of bundle.flights)
      annual(analyticsDateOnly(flight.date), "tripFlights");
  }
  for (const flight of input.passport)
    annual(passportDate(flight.flightDate), "passportFlights");

  const trips = selected
    .map(bundle => {
      const {
        trip,
        days,
        activities,
        expenses,
        flights,
        hotels,
        members,
        pins,
      } = bundle;
      const range = analyticsDateRange(trip.startDate, trip.endDate);
      const startDate = analyticsDateOnly(trip.startDate);
      const endDate = analyticsDateOnly(trip.endDate);
      const normalizedDays = days.map(day => ({
        ...day,
        date: analyticsDateOnly(day.date),
      }));
      const activeDayIds = new Set(activities.map(activity => activity.dayId));
      const dateSlots = new Set<string>();
      const scheduled = new Set<string>();
      for (const day of normalizedDays) {
        const date = day.date;
        if (
          date &&
          range &&
          startDate &&
          endDate &&
          date >= startDate &&
          date <= endDate
        ) {
          dateSlots.add(date);
          if (activeDayIds.has(day.id)) scheduled.add(date);
        }
      }
      const stayRanges = hotels
        .map(hotel =>
          analyticsDateRange(hotel.checkIn ?? "", hotel.checkOut ?? "")
        )
        .filter(
          (stay): stay is [number, number] => stay !== null && stay[1] > stay[0]
        );
      return {
        id: trip.id,
        name: trip.name,
        destination: trip.destination,
        // Consumers receive calendar dates only; invalid stored values stay undated.
        startDate: startDate ?? "",
        endDate: endDate ?? "",
        baseCurrency: trip.baseCurrency,
        coverImage: trip.coverImage ?? null,
        userRole: trip.userRole ?? "viewer",
        isDemoTrip: Boolean(trip.isDemoTrip),
        status: analyticsTripStatus(trip.startDate, trip.endDate, today),
        datedDays: range ? range[1] - range[0] + 1 : null,
        daySlots: dateSlots.size,
        scheduledDays: scheduled.size,
        itineraryDayCount: days.length,
        activityCount: activities.length,
        expenseCount: expenses.length,
        flightCount: flights.length,
        hotelCount: hotels.length,
        memberCount: new Set(members.map(member => member.userId)).size,
        pinCount: pins.length,
        recordedHotelNights: stayRanges.reduce(
          (sum, stay) => sum + stay[1] - stay[0],
          0
        ),
        hotelsWithValidDates: stayRanges.length,
        actualExpenses: summarizeExpenses(expenses),
        activityEstimates: summarizeEstimates(activities, trip.baseCurrency),
        invalidItineraryDates: normalizedDays.filter(
          day =>
            !day.date ||
            !range ||
            !startDate ||
            !endDate ||
            day.date < startDate ||
            day.date > endDate
        ).length,
        invalidFlightDates: flights.filter(
          flight => !analyticsDateOnly(flight.date)
        ).length,
      };
    })
    .sort((a, b) =>
      (analyticsDateOnly(a.startDate) ?? "9999-99-99").localeCompare(
        analyticsDateOnly(b.startDate) ?? "9999-99-99"
      )
    );
  const ranges = selected
    .map(bundle =>
      analyticsDateRange(bundle.trip.startDate, bundle.trip.endDate)
    )
    .filter((range): range is [number, number] => range !== null);
  const elapsedRanges = ranges
    .filter(range => range[0] <= dayIndex(today))
    .map(([start, end]): [number, number] => [
      start,
      Math.min(end, dayIndex(today)),
    ]);
  const companions = new Set(
    selected
      .flatMap(bundle => bundle.members.map(member => member.userId))
      .filter(id => id !== input.userId)
  );
  const totals = trips.reduce(
    (sum, trip) => ({
      itineraryDays: sum.itineraryDays + trip.itineraryDayCount,
      scheduledDays: sum.scheduledDays + trip.scheduledDays,
      activities: sum.activities + trip.activityCount,
      expenses: sum.expenses + trip.expenseCount,
      flights: sum.flights + trip.flightCount,
      hotels: sum.hotels + trip.hotelCount,
      memberRecords: sum.memberRecords + trip.memberCount,
      pins: sum.pins + trip.pinCount,
      hotelNights: sum.hotelNights + trip.recordedHotelNights,
      hotelsWithValidDates:
        sum.hotelsWithValidDates + trip.hotelsWithValidDates,
    }),
    {
      itineraryDays: 0,
      scheduledDays: 0,
      activities: 0,
      expenses: 0,
      flights: 0,
      hotels: 0,
      memberRecords: 0,
      pins: 0,
      hotelNights: 0,
      hotelsWithValidDates: 0,
    }
  );
  const countries = {
    visited: new Set<string>(),
    planned: new Set<string>(),
    wishlist: new Set<string>(),
  };
  for (const country of input.countries) {
    const code = country.countryCode.trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(code)) countries[country.status].add(code);
  }
  const airports = new Set(
    selectedPassport
      .flatMap(flight => [flight.departureAirport, flight.arrivalAirport])
      .map(code => code.trim().toUpperCase())
      .filter(code => /^[A-Z]{3}$/.test(code))
  );
  const durations = selectedPassport
    .map(flight => flight.durationMinutes)
    .filter(
      (n): n is number => typeof n === "number" && Number.isFinite(n) && n > 0
    );
  const distances = selectedPassport
    .map(flight => flight.distanceKm)
    .filter(
      (n): n is number => typeof n === "number" && Number.isFinite(n) && n > 0
    );
  const annualTrend = Array.from(trend.values()).sort(
    (a, b) => a.year - b.year
  );
  return {
    today,
    timezone: "Asia/Hong_Kong" as const,
    selectedYear: input.year ?? null,
    availableYears: Array.from(
      new Set([
        ...annualTrend.map(row => row.year),
        ...uniqueBundles
          .map(bundle =>
            Number(analyticsDateOnly(bundle.trip.startDate)?.slice(0, 4))
          )
          .filter(year => year > 0),
      ])
    ).sort((a, b) => b - a),
    counts: {
      trips: trips.length,
      validDatedTrips: ranges.length,
      undatedTrips: trips.filter(trip => trip.status === "undated").length,
      pastTrips: trips.filter(trip => trip.status === "past").length,
      currentTrips: trips.filter(trip => trip.status === "current").length,
      upcomingTrips: trips.filter(trip => trip.status === "upcoming").length,
      uniqueCompanions: companions.size,
      datedTravelDays: unionTravelDays(ranges),
      elapsedCalendarDays: unionTravelDays(elapsedRanges),
      ...totals,
    },
    actualExpenses: summarizeExpenses(
      selected.flatMap(bundle => bundle.expenses)
    ),
    activityEstimates: (() => {
      // Retain each trip's base-currency fallback before combining estimates.
      const estimateRecords = selected.flatMap(bundle =>
        bundle.activities.map(activity => ({
          ...activity,
          currency: activity.currency || bundle.trip.baseCurrency,
        }))
      );
      return summarizeEstimates(estimateRecords, "HKD");
    })(),
    passport: {
      flights: selectedPassport.length,
      validDateFlights: selectedPassport.filter(flight =>
        passportDate(flight.flightDate)
      ).length,
      airports: airports.size,
      recordedDurationMinutes: durations.reduce((sum, n) => sum + n, 0),
      durationRecordCount: durations.length,
      recordedDistanceKm: distances.reduce((sum, n) => sum + n, 0),
      distanceRecordCount: distances.length,
    },
    countries: {
      visited: countries.visited.size,
      planned: countries.planned.size,
      wishlist: countries.wishlist.size,
    },
    annualTrend,
    trips,
    nextTrip:
      trips.find(trip => trip.status === "current") ??
      trips.find(trip => trip.status === "upcoming") ??
      null,
  };
}
export type TravelOverview = ReturnType<typeof buildTravelOverview>;
export type TravelOverviewTrip = TravelOverview["trips"][number];
