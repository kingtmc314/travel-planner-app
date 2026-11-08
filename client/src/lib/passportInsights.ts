import {
  getHongKongDateInput,
  getHongKongYear,
  isIataCode,
  normalizeIataCode,
  toPositiveFiniteNumber,
  type FlightMetricInput,
} from "@shared/flightPassport";
import { normalizeDateOnly } from "./hongKongDate";

export type InsightFlight = FlightMetricInput & {
  id: number;
  flightDate?: Date | string | null;
  flightYear?: number | null;
  airline?: string | null;
};

export type FlightMetric = {
  value: number | null;
  source: "recorded" | "estimated" | "unknown";
};
export type FlightStatus = "completed" | "planned" | "undated";
type Estimator = (departure: string, arrival: string) => number;

/** Date-only business rules are always based on the Hong Kong calendar, not the device. */
export function getPassportFlightDate(flight: InsightFlight): string {
  if (!flight.flightDate) return "";
  if (
    typeof flight.flightDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(flight.flightDate)
  ) {
    return normalizeDateOnly(flight.flightDate);
  }
  return getHongKongDateInput(flight.flightDate);
}

export function getPassportFlightYear(flight: InsightFlight): number | null {
  const date = getPassportFlightDate(flight);
  if (date) return Number(date.slice(0, 4));
  const year = toPositiveFiniteNumber(flight.flightYear);
  return year !== null && Number.isInteger(year) && year <= 9999 ? year : null;
}

export function getPassportFlightStatus(
  flight: InsightFlight,
  today = getHongKongDateInput()
): FlightStatus {
  const date = getPassportFlightDate(flight);
  return !date ? "undated" : date > today ? "planned" : "completed";
}

/** Stored values are recorded, not necessarily actual: legacy records have no provenance field. */
export function getPassportFlightMetrics(
  flight: InsightFlight,
  estimateDistance: Estimator
) {
  const storedDistance = toPositiveFiniteNumber(flight.distanceKm);
  const departure = normalizeIataCode(flight.departureAirport);
  const arrival = normalizeIataCode(flight.arrivalAirport);
  const routeEstimate =
    isIataCode(departure) && isIataCode(arrival) && departure !== arrival
      ? toPositiveFiniteNumber(estimateDistance(departure, arrival))
      : null;
  const distance: FlightMetric =
    storedDistance !== null
      ? { value: storedDistance, source: "recorded" }
      : routeEstimate !== null
        ? { value: routeEstimate, source: "estimated" }
        : { value: null, source: "unknown" };
  const storedMinutes = toPositiveFiniteNumber(flight.durationMinutes);
  const duration: FlightMetric =
    storedMinutes !== null
      ? { value: storedMinutes / 60, source: "recorded" }
      : distance.value !== null
        ? { value: distance.value / 800 + 1, source: "estimated" }
        : { value: null, source: "unknown" };
  return { distance, duration };
}

function summarizeMetrics(metrics: FlightMetric[]) {
  const usable = metrics.filter(
    (metric): metric is FlightMetric & { value: number } =>
      metric.value !== null
  );
  const recorded = usable.filter(metric => metric.source === "recorded");
  const estimated = usable.filter(metric => metric.source === "estimated");
  const sum = (values: typeof usable) =>
    values.reduce((total, metric) => total + metric.value, 0);
  const total = usable.length ? sum(usable) : null;
  return {
    total,
    average: total !== null ? total / usable.length : null,
    recordedAverage: recorded.length ? sum(recorded) / recorded.length : null,
    estimatedAverage: estimated.length
      ? sum(estimated) / estimated.length
      : null,
    recorded: recorded.length,
    estimated: estimated.length,
    known: usable.length,
    unknown: metrics.length - usable.length,
    denominator: metrics.length,
  };
}

export function buildPassportInsights<T extends InsightFlight>(
  flights: T[],
  estimateDistance: Estimator,
  activeYear = "All-Time",
  today = getHongKongDateInput()
) {
  const filtered = flights.filter(
    flight =>
      activeYear === "All-Time" ||
      String(getPassportFlightYear(flight)) === activeYear
  );
  const completed = filtered.filter(
    flight => getPassportFlightStatus(flight, today) === "completed"
  );
  const planned = filtered.filter(
    flight => getPassportFlightStatus(flight, today) === "planned"
  );
  const undated = filtered.filter(
    flight => getPassportFlightStatus(flight, today) === "undated"
  );
  const measured = completed.map(flight => ({
    flight,
    ...getPassportFlightMetrics(flight, estimateDistance),
  }));
  const airports = new Set<string>();
  const routes = new Map<
    string,
    { route: string; departure: string; arrival: string; count: number }
  >();
  const airlines = new Map<string, { airline: string; count: number }>();
  let invalidRoutes = 0;
  let unknownAirlines = 0;
  completed.forEach(flight => {
    const departure = normalizeIataCode(flight.departureAirport);
    const arrival = normalizeIataCode(flight.arrivalAirport);
    if (isIataCode(departure)) airports.add(departure);
    if (isIataCode(arrival)) airports.add(arrival);
    if (isIataCode(departure) && isIataCode(arrival) && departure !== arrival) {
      // Directed: HKG → NRT and NRT → HKG are distinct routes.
      const route = `${departure} → ${arrival}`;
      const existing = routes.get(route);
      routes.set(route, {
        route,
        departure,
        arrival,
        count: (existing?.count ?? 0) + 1,
      });
    } else invalidRoutes++;
    const airline = flight.airline?.trim().replace(/\s+/g, " ") ?? "";
    if (!airline) {
      unknownAirlines++;
      return;
    }
    const key = airline.toLocaleUpperCase("en");
    const existing = airlines.get(key);
    airlines.set(key, {
      airline: existing?.airline ?? airline,
      count: (existing?.count ?? 0) + 1,
    });
  });
  const yearMap = new Map<
    number,
    { year: number; completed: number; planned: number; undated: number }
  >();
  let unknownYear = 0;
  flights.forEach(flight => {
    const year = getPassportFlightYear(flight);
    if (year === null) {
      unknownYear++;
      return;
    }
    const row = yearMap.get(year) ?? {
      year,
      completed: 0,
      planned: 0,
      undated: 0,
    };
    row[getPassportFlightStatus(flight, today)]++;
    yearMap.set(year, row);
  });
  const longest =
    measured
      .filter(row => row.distance.value !== null)
      .sort(
        (a, b) =>
          (b.distance.value ?? 0) - (a.distance.value ?? 0) ||
          a.flight.id - b.flight.id
      )[0] ?? null;
  const sortByCount = <R extends { count: number }>(rows: R[]) =>
    rows.sort((a, b) => b.count - a.count);
  return {
    filtered: [...filtered].sort(
      (a, b) =>
        getPassportFlightDate(b).localeCompare(getPassportFlightDate(a)) ||
        b.id - a.id
    ),
    completed,
    planned,
    undated,
    totalFlights: completed.length,
    airports: airports.size,
    airlines: airlines.size,
    routes: sortByCount(Array.from(routes.values())),
    airlineDistribution: sortByCount(Array.from(airlines.values())),
    invalidRoutes,
    unknownAirlines,
    distance: summarizeMetrics(measured.map(row => row.distance)),
    duration: summarizeMetrics(measured.map(row => row.duration)),
    longest,
    longHaul: measured.filter(
      row => row.distance.value !== null && row.distance.value > 6000
    ).length,
    trend: Array.from(yearMap.values()).sort((a, b) => a.year - b.year),
    unknownYear,
    today,
    currentYear: getHongKongYear(today),
  };
}

export type PassportInsightsData = ReturnType<typeof buildPassportInsights>;
