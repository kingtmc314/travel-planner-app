import { calculateNights, normalizeDateOnly } from "./hongKongDate";

export type LogisticsDate = string | Date | null | undefined;

/** Date-only values stay calendar dates; timestamp values are displayed in Hong Kong. */
export function normalizeLogisticsDate(value: LogisticsDate): string {
  if (!value) return "";
  if (typeof value === "string") {
    const text = value.trim();
    const dateOnly = normalizeDateOnly(text);
    if (dateOnly) return dateOnly;
    // Legacy DB datetime strings with no offset represent a Hong Kong calendar date.
    const local =
      /^(\d{4}-\d{2}-\d{2})[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.exec(text);
    if (local) return normalizeDateOnly(local[1]);
    if (
      !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(text) ||
      !normalizeDateOnly(text.slice(0, 10))
    )
      return "";
    value = new Date(text);
  }
  if (Number.isNaN(value.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(part => part.type === type)?.value ?? "";
  return normalizeDateOnly(`${pick("year")}-${pick("month")}-${pick("day")}`);
}

/** Normalize case/whitespace without guessing an airport from a city name. */
export function normalizeIata(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, "").toUpperCase();
}

export function validateFlightRoute(
  from: string,
  to: string
): "invalidIata" | "sameAirport" | null {
  const fromCode = normalizeIata(from);
  const toCode = normalizeIata(to);
  if (!/^[A-Z]{3}$/.test(fromCode) || !/^[A-Z]{3}$/.test(toCode))
    return "invalidIata";
  return fromCode === toCode ? "sameAirport" : null;
}

export function deriveHotelNights(
  checkIn: LogisticsDate,
  checkOut: LogisticsDate
): number | null {
  return calculateNights(
    normalizeLogisticsDate(checkIn),
    normalizeLogisticsDate(checkOut)
  );
}

export function validateHotelDates(
  checkIn: string,
  checkOut: string
): "invalidDate" | "invalidRange" | null {
  if (
    (checkIn && !normalizeDateOnly(checkIn)) ||
    (checkOut && !normalizeDateOnly(checkOut))
  )
    return "invalidDate";
  return checkIn && checkOut && checkOut <= checkIn ? "invalidRange" : null;
}

/** Manual nights are a fallback only when at least one date is absent, never for bad ranges. */
export function hotelNightInfo(hotel: {
  checkIn?: LogisticsDate;
  checkOut?: LogisticsDate;
  nights?: number | null;
}) {
  const derived = deriveHotelNights(hotel.checkIn, hotel.checkOut);
  if (derived !== null) return { nights: derived, source: "dates" as const };
  if (!hotel.checkIn || !hotel.checkOut) {
    if (
      typeof hotel.nights === "number" &&
      Number.isInteger(hotel.nights) &&
      hotel.nights > 0
    ) {
      return { nights: hotel.nights, source: "manual" as const };
    }
  }
  return { nights: null, source: "unknown" as const };
}

type FlightRecord = {
  fromCode?: string | null;
  toCode?: string | null;
  airline?: string | null;
  date?: LogisticsDate;
};
type HotelRecord = {
  checkIn?: LogisticsDate;
  checkOut?: LogisticsDate;
  nights?: number | null;
};

/** All aggregates come from stored records. Nights deliberately exclude manual estimates. */
export function buildLogisticsInsights(
  flights: FlightRecord[],
  hotels: HotelRecord[],
  today: string
) {
  const normalizedToday = normalizeLogisticsDate(today);
  const airlineMap = new Map<string, string>();
  let completedFlights = 0;
  let upcomingFlights = 0;
  let incompleteFlights = 0;
  for (const flight of flights) {
    const airline = flight.airline?.trim().replace(/\s+/g, " ");
    if (airline) airlineMap.set(airline.toLocaleLowerCase("en"), airline);
    const date = normalizeLogisticsDate(flight.date);
    if (
      validateFlightRoute(flight.fromCode ?? "", flight.toCode ?? "") ||
      !date ||
      !normalizedToday
    )
      incompleteFlights++;
    else if (date < normalizedToday) completedFlights++;
    else upcomingFlights++;
  }
  const datedHotels = hotels.map(hotel =>
    deriveHotelNights(hotel.checkIn, hotel.checkOut)
  );
  return {
    flightSegments: flights.length,
    airlines: Array.from(airlineMap.values()).sort((a, b) =>
      a.localeCompare(b)
    ),
    completedFlights,
    upcomingFlights,
    incompleteFlights,
    hotelNights: datedHotels.reduce<number>(
      (sum, nights) => sum + (nights ?? 0),
      0
    ),
    datedHotels: datedHotels.filter(nights => nights !== null).length,
    incompleteHotels: datedHotels.filter(nights => nights === null).length,
  };
}

export function returnFlightDefaults(
  flight: {
    fromCode?: string | null;
    fromCity?: string | null;
    toCode?: string | null;
    toCity?: string | null;
    airline?: string | null;
  },
  tripEndDate: LogisticsDate
) {
  return {
    fromCode: normalizeIata(flight.toCode),
    fromCity: flight.toCity ?? "",
    toCode: normalizeIata(flight.fromCode),
    toCity: flight.fromCity ?? "",
    airline: flight.airline ?? "",
    date: normalizeLogisticsDate(tripEndDate),
    type: "return" as const,
  };
}
