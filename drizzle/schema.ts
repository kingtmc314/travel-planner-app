import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  boolean,
  decimal,
  json,
} from "drizzle-orm/mysql-core";

// ─── Users ───────────────────────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Trips ────────────────────────────────────────────────────────────────────
export const trips = mysqlTable("trips", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  destination: varchar("destination", { length: 500 }).notNull(),
  description: text("description"),
  startDate: varchar("startDate", { length: 20 }).notNull(),
  endDate: varchar("endDate", { length: 20 }).notNull(),
  baseCurrency: varchar("baseCurrency", { length: 10 }).default("HKD").notNull(),
  coverImage: text("coverImage"),
  createdBy: int("createdBy").notNull(),
  isDemoTrip: boolean("isDemoTrip").default(false),
  shareToken: varchar("shareToken", { length: 64 }),
  shareEnabled: boolean("shareEnabled").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Trip = typeof trips.$inferSelect;
export type InsertTrip = typeof trips.$inferInsert;

// ─── Trip Members ─────────────────────────────────────────────────────────────
export const tripMembers = mysqlTable("trip_members", {
  id: int("id").autoincrement().primaryKey(),
  tripId: int("tripId").notNull(),
  userId: int("userId").notNull(),
  role: mysqlEnum("role", ["owner", "editor", "viewer"]).default("viewer").notNull(),
  displayName: varchar("displayName", { length: 255 }),
  email: varchar("email", { length: 320 }),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
});
export type TripMember = typeof tripMembers.$inferSelect;
export type InsertTripMember = typeof tripMembers.$inferInsert;

// ─── Invite Links ────────────────────────────────────────────────────────────
export const inviteLinks = mysqlTable("invite_links", {
  id: int("id").autoincrement().primaryKey(),
  tripId: int("tripId").notNull(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  role: mysqlEnum("role", ["editor", "viewer"]).default("viewer").notNull(),
  createdBy: int("createdBy").notNull(),
  expiresAt: timestamp("expiresAt"),
  usedCount: int("usedCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type InviteLink = typeof inviteLinks.$inferSelect;
export type InsertInviteLink = typeof inviteLinks.$inferInsert;

// ─── Itinerary Days ───────────────────────────────────────────────────────────
export const itineraryDays = mysqlTable("itinerary_days", {
  id: int("id").autoincrement().primaryKey(),
  tripId: int("tripId").notNull(),
  date: varchar("date", { length: 20 }).notNull(),
  dayNumber: int("dayNumber").notNull(),
  title: varchar("title", { length: 255 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ItineraryDay = typeof itineraryDays.$inferSelect;
export type InsertItineraryDay = typeof itineraryDays.$inferInsert;

// ─── Activities ───────────────────────────────────────────────────────────────
export const activities = mysqlTable("itinerary_items", {
  id: int("id").autoincrement().primaryKey(),
  dayId: int("dayId").notNull(),
  tripId: int("tripId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  location: varchar("location", { length: 500 }),
  startTime: varchar("time", { length: 10 }),
  endTime: varchar("endTime", { length: 10 }),
  cost: varchar("cost", { length: 50 }),
  currency: varchar("currency", { length: 10 }),
  category: mysqlEnum("category", ["transport", "food", "attraction", "hotel", "shopping", "other"]).default("other"),
  notes: text("notes"),
  lat: decimal("lat", { precision: 10, scale: 7 }),
  lng: decimal("lng", { precision: 10, scale: 7 }),
  sortOrder: int("orderIndex").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
})
export type Activity = typeof activities.$inferSelect;
export type InsertActivity = typeof activities.$inferInsert;

// ─── Expenses ─────────────────────────────────────────────────────────────────
export const expenses = mysqlTable("expenses", {
  id: int("id").autoincrement().primaryKey(),
  tripId: int("tripId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).notNull(),
  category: mysqlEnum("category", ["transport", "food", "accommodation", "attraction", "shopping", "other"]).default("other"),
  paidBy: int("paidByUserId").notNull(),
  paidByName: varchar("paidByName", { length: 255 }),
  splitAmong: json("splitAmong"),
  date: varchar("date", { length: 20 }).notNull(),
  notes: text("notes"),
  receiptUrl: text("receiptUrl"),
  receiptKey: text("receiptKey"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Expense = typeof expenses.$inferSelect;
export type InsertExpense = typeof expenses.$inferInsert;

// ─── Map Pins ─────────────────────────────────────────────────────────────────
export const mapPins = mysqlTable("map_pins", {
  id: int("id").autoincrement().primaryKey(),
  tripId: int("tripId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  notes: text("notes"),
  lat: decimal("lat", { precision: 10, scale: 7 }).notNull(),
  lng: decimal("lng", { precision: 10, scale: 7 }).notNull(),
  category: mysqlEnum("category", ["attraction", "hotel", "restaurant", "transport", "other"]).default("attraction"),
  address: text("address"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type MapPin = typeof mapPins.$inferSelect;
export type InsertMapPin = typeof mapPins.$inferInsert;

// ─── Flights ──────────────────────────────────────────────────────────────────
export const flights = mysqlTable("flights", {
  id: int("id").autoincrement().primaryKey(),
  tripId: int("tripId").notNull(),
  airline: varchar("airline", { length: 255 }),
  flightNumber: varchar("flightNumber", { length: 50 }),
  date: varchar("date", { length: 30 }),
  fromCode: varchar("fromCode", { length: 10 }),
  fromCity: varchar("fromCity", { length: 255 }),
  toCode: varchar("toCode", { length: 10 }),
  toCity: varchar("toCity", { length: 255 }),
  departTime: varchar("departTime", { length: 30 }),
  arriveTime: varchar("arriveTime", { length: 30 }),
  duration: varchar("duration", { length: 30 }),
  isLayover: boolean("isLayover").default(false),
  layoverDuration: varchar("layoverDuration", { length: 30 }),
  orderIndex: int("orderIndex").default(0),
  type: mysqlEnum("type", ["outbound", "return", "connecting"]).default("outbound"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Flight = typeof flights.$inferSelect;
export type InsertFlight = typeof flights.$inferInsert;

// ─── Accommodations ───────────────────────────────────────────────────────────
export const accommodations = mysqlTable("accommodations", {
  id: int("id").autoincrement().primaryKey(),
  tripId: int("tripId").notNull(),
  city: varchar("city", { length: 255 }),
  name: varchar("hotelName", { length: 255 }).notNull(),
  checkIn: varchar("checkIn", { length: 30 }),
  checkOut: varchar("checkOut", { length: 30 }),
  nights: int("nights"),
  notes: text("notes"),
  orderIndex: int("orderIndex").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Accommodation = typeof accommodations.$inferSelect;
export type InsertAccommodation = typeof accommodations.$inferInsert;

// ─── Notifications ────────────────────────────────────────────────────────────
export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  tripId: int("tripId"),
  userId: int("userId").notNull(),
  type: mysqlEnum("type", ["expense_added", "itinerary_updated", "member_joined", "member_left", "trip_updated", "general"]).default("general"),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message"),
  isRead: boolean("read").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

// ─── Visited Countries (Travel History) ──────────────────────────────────────
export const visitedCountries = mysqlTable("visited_countries", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  countryCode: varchar("countryCode", { length: 3 }).notNull(), // ISO 3166-1 alpha-2
  countryName: varchar("countryName", { length: 255 }).notNull(),
  status: mysqlEnum("status", ["visited", "planned", "wishlist"]).default("visited").notNull(),
  visitedAt: timestamp("visitedAt"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type VisitedCountry = typeof visitedCountries.$inferSelect;
export type InsertVisitedCountry = typeof visitedCountries.$inferInsert;

// ─── Past Flights (Flight Passport) ──────────────────────────────────────────
export const pastFlights = mysqlTable("past_flights", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  flightNumber: varchar("flightNumber", { length: 20 }),
  airline: varchar("airline", { length: 255 }),
  airlineCode: varchar("airlineCode", { length: 10 }),
  departureAirport: varchar("departureAirport", { length: 10 }).notNull(),
  departureCity: varchar("departureCity", { length: 255 }),
  departureCountry: varchar("departureCountry", { length: 255 }),
  departureLat: decimal("departureLat", { precision: 10, scale: 7 }),
  departureLng: decimal("departureLng", { precision: 10, scale: 7 }),
  arrivalAirport: varchar("arrivalAirport", { length: 10 }).notNull(),
  arrivalCity: varchar("arrivalCity", { length: 255 }),
  arrivalCountry: varchar("arrivalCountry", { length: 255 }),
  arrivalLat: decimal("arrivalLat", { precision: 10, scale: 7 }),
  arrivalLng: decimal("arrivalLng", { precision: 10, scale: 7 }),
  flightDate: timestamp("flightDate").notNull(),
  flightYear: int("flightYear").notNull(),
  durationMinutes: int("durationMinutes"),
  distanceKm: int("distanceKm"),
  seatClass: mysqlEnum("seatClass", ["economy", "premium_economy", "business", "first"]).default("economy"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PastFlight = typeof pastFlights.$inferSelect;
export type InsertPastFlight = typeof pastFlights.$inferInsert;
