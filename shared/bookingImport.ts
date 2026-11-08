import { z } from "zod";
import { connectedDate, connectedFlightKey, connectedText } from "./connected";

export const BOOKING_MAX_BYTES = 3 * 1024 * 1024;
export const BOOKING_MAX_TEXT = 50000;
const text = (max: number) => z.string().trim().max(max).default("");
const airport = text(10).transform(value => value.toUpperCase());
export const bookingFlightSchema = z
  .object({
    airline: text(255),
    flightNumber: text(50).transform(value =>
      value.replace(/\s+/g, "").toUpperCase()
    ),
    date: text(10),
    fromCode: airport,
    fromCity: text(255),
    toCode: airport,
    toCity: text(255),
    departTime: text(5),
    arriveTime: text(5),
    duration: text(30),
    type: z.enum(["outbound", "return", "connecting"]).default("connecting"),
    notes: text(2000),
    bookingReference: text(100),
  })
  .strict();
export const bookingHotelSchema = z
  .object({
    name: text(255),
    city: text(255),
    checkIn: text(10),
    checkOut: text(10),
    notes: text(2000),
    bookingReference: text(100),
  })
  .strict();
export type BookingFlight = z.infer<typeof bookingFlightSchema>;
export type BookingHotel = z.infer<typeof bookingHotelSchema>;
export function isBookingDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && connectedDate(value) === value;
}
export function bookingNights(
  checkIn: string,
  checkOut: string
): number | null {
  if (!isBookingDate(checkIn) || !isBookingDate(checkOut)) return null;
  const days =
    (Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) /
    86400000;
  return days > 0 && Number.isInteger(days) ? days : null;
}
export const bookingFlightImportSchema = bookingFlightSchema.superRefine(
  (flight, ctx) => {
    if (!isBookingDate(flight.date))
      ctx.addIssue({
        code: "custom",
        path: ["date"],
        message: "Valid departure date required",
      });
    for (const field of ["fromCode", "toCode"] as const) {
      if (!/^[A-Z]{3}$/.test(flight[field]))
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: "Three-letter airport code required",
        });
    }
    if (flight.fromCode === flight.toCode)
      ctx.addIssue({
        code: "custom",
        path: ["toCode"],
        message: "Airports must differ",
      });
    for (const field of ["departTime", "arriveTime"] as const) {
      if (flight[field] && !/^([01]\d|2[0-3]):[0-5]\d$/.test(flight[field]))
        ctx.addIssue({ code: "custom", path: [field], message: "Use HH:mm" });
    }
  }
);
export const bookingHotelImportSchema = bookingHotelSchema.superRefine(
  (hotel, ctx) => {
    if (!hotel.name)
      ctx.addIssue({
        code: "custom",
        path: ["name"],
        message: "Hotel name required",
      });
    if (!isBookingDate(hotel.checkIn))
      ctx.addIssue({
        code: "custom",
        path: ["checkIn"],
        message: "Valid check-in required",
      });
    if (!isBookingDate(hotel.checkOut))
      ctx.addIssue({
        code: "custom",
        path: ["checkOut"],
        message: "Valid check-out required",
      });
    if (bookingNights(hotel.checkIn, hotel.checkOut) === null)
      ctx.addIssue({
        code: "custom",
        path: ["checkOut"],
        message: "Check-out must follow check-in",
      });
  }
);
export const bookingExtractionSchema = z
  .object({
    flights: z.array(bookingFlightSchema).max(100),
    hotels: z.array(bookingHotelSchema).max(100),
    warnings: z.array(z.string().max(500)).max(30),
  })
  .strict();
export const bookingAnalyzeInput = z
  .object({
    tripId: z.number().int().positive(),
    kind: z.enum(["pdf", "email", "eml"]),
    content: z.string().max(Math.ceil(BOOKING_MAX_BYTES / 3) * 4 + 40),
    filename: z.string().max(255).optional(),
  })
  .strict();
export const bookingImportInput = z
  .object({
    tripId: z.number().int().positive(),
    previewToken: z.string().min(1).max(1000),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    flights: z.array(bookingFlightImportSchema).max(100),
    hotels: z.array(bookingHotelImportSchema).max(100),
  })
  .strict()
  .refine(
    value => value.flights.length + value.hotels.length > 0,
    "Select at least one booking"
  );

export type BookingFlightLike = {
  date?: unknown;
  fromCode?: string | null;
  toCode?: string | null;
  flightNumber?: string | null;
  departTime?: string | null;
  arriveTime?: string | null;
  airline?: string | null;
};
export function bookingFlightKey(value: BookingFlightLike): string | null {
  const date = connectedDate(value.date);
  const from = value.fromCode?.trim().toUpperCase() ?? "",
    to = value.toCode?.trim().toUpperCase() ?? "";
  if (!date || !/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) return null;
  const number = value.flightNumber?.replace(/\s+/g, "").toUpperCase() ?? "";
  const base = connectedFlightKey(date, from, to, number);
  // Numbered flights use the existing connected natural key. Unnumbered flights require
  // an explicit departure clock; missing clocks must not collapse distinct services.
  if (number) return base;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value.departTime ?? "")) return null;
  return JSON.stringify([
    base,
    value.departTime,
    value.arriveTime ?? "",
    connectedText(value.airline),
  ]);
}
export type BookingHotelLike = {
  name?: string | null;
  city?: string | null;
  checkIn?: unknown;
  checkOut?: unknown;
};
export function bookingHotelKey(value: BookingHotelLike): string | null {
  const checkIn = connectedDate(value.checkIn),
    checkOut = connectedDate(value.checkOut);
  if (!value.name?.trim() || !checkIn || !checkOut) return null;
  return JSON.stringify([
    connectedText(value.name),
    connectedText(value.city),
    checkIn,
    checkOut,
  ]);
}

/** Defense in depth for notes; the model is instructed never to extract personal data. */
export function redactBookingNotes(value: string): string {
  return value
    .split(/\r?\n/)
    .filter(
      line =>
        !/\b(?:passenger|travell?er|guest name|passport|cardholder|credit card|payment card|cvv|cvc|iban|account number|date of birth|dob)\b|旅客|乘客|護照|信用卡|持卡|出生日期/i.test(
          line
        )
    )
    .join("\n")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted email]")
    .replace(/(?:\d[ -]?){13,19}/g, "[redacted number]")
    .replace(/https?:\/\/\S+/gi, "[link omitted]")
    .replace(/\[voyageai:[^\]]*\]/gi, "")
    .slice(0, 2000)
    .trim();
}
