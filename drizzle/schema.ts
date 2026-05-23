import {
  pgTable,
  serial,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  pgEnum,
  numeric,
  date,
  jsonb,
} from "drizzle-orm/pg-core";

// ─── Enums ────────────────────────────────────────────────────────────────────
export const roleEnum = pgEnum("role", ["admin", "user"]);
export const memberRoleEnum = pgEnum("member_role", ["owner", "editor", "viewer"]);
export const activityCategoryEnum = pgEnum("activity_category", [
  "transport", "accommodation", "food", "attraction", "shopping", "other",
]);
export const pinTypeEnum = pgEnum("pin_type", [
  "attraction", "hotel", "restaurant", "transport", "other",
]);
export const notificationTypeEnum = pgEnum("notification_type", [
  "expense_added", "itinerary_updated", "member_joined", "member_left", "trip_updated", "general",
]);

// ─── Users ────────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("open_id", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("login_method", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  lastSignedIn: timestamp("last_signed_in").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Trips ────────────────────────────────────────────────────────────────────
export const trips = pgTable("trips", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  destination: text("destination").notNull(),
  description: text("description"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  baseCurrency: varchar("base_currency", { length: 10 }).default("HKD").notNull(),
  coverImage: text("cover_image"),
  isDemoTrip: boolean("is_demo_trip").default(false).notNull(),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Trip = typeof trips.$inferSelect;
export type InsertTrip = typeof trips.$inferInsert;

// ─── Trip Members ─────────────────────────────────────────────────────────────
export const tripMembers = pgTable("trip_members", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id").references(() => trips.id, { onDelete: "cascade" }).notNull(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: varchar("email", { length: 320 }),
  role: memberRoleEnum("role").default("viewer").notNull(),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
});

export type TripMember = typeof tripMembers.$inferSelect;
export type InsertTripMember = typeof tripMembers.$inferInsert;

// ─── Itinerary Days ───────────────────────────────────────────────────────────
export const itineraryDays = pgTable("itinerary_days", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id").references(() => trips.id, { onDelete: "cascade" }).notNull(),
  dayDate: date("day_date").notNull(),
  dayNumber: integer("day_number").notNull(),
  title: text("title"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ItineraryDay = typeof itineraryDays.$inferSelect;
export type InsertItineraryDay = typeof itineraryDays.$inferInsert;

// ─── Itinerary Activities ─────────────────────────────────────────────────────
export const activities = pgTable("activities", {
  id: serial("id").primaryKey(),
  dayId: integer("day_id").references(() => itineraryDays.id, { onDelete: "cascade" }).notNull(),
  tripId: integer("trip_id").references(() => trips.id, { onDelete: "cascade" }).notNull(),
  title: text("title").notNull(),
  location: text("location"),
  startTime: varchar("start_time", { length: 10 }),
  endTime: varchar("end_time", { length: 10 }),
  notes: text("notes"),
  category: activityCategoryEnum("category").default("other").notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  lat: numeric("lat", { precision: 10, scale: 7 }),
  lng: numeric("lng", { precision: 10, scale: 7 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Activity = typeof activities.$inferSelect;
export type InsertActivity = typeof activities.$inferInsert;

// ─── Expenses ─────────────────────────────────────────────────────────────────
export const expenses = pgTable("expenses", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id").references(() => trips.id, { onDelete: "cascade" }).notNull(),
  title: text("title").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).notNull(),
  category: activityCategoryEnum("category").default("other").notNull(),
  paidBy: integer("paid_by").references(() => tripMembers.id),
  paidByName: text("paid_by_name"),
  splitAmong: jsonb("split_among").$type<number[]>().default([]),
  date: date("date").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Expense = typeof expenses.$inferSelect;
export type InsertExpense = typeof expenses.$inferInsert;

// ─── Map Pins ─────────────────────────────────────────────────────────────────
export const mapPins = pgTable("map_pins", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id").references(() => trips.id, { onDelete: "cascade" }).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  lat: numeric("lat", { precision: 10, scale: 7 }).notNull(),
  lng: numeric("lng", { precision: 10, scale: 7 }).notNull(),
  type: pinTypeEnum("type").default("attraction").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type MapPin = typeof mapPins.$inferSelect;
export type InsertMapPin = typeof mapPins.$inferInsert;

// ─── Flights ──────────────────────────────────────────────────────────────────
export const flights = pgTable("flights", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id").references(() => trips.id, { onDelete: "cascade" }).notNull(),
  flightNumber: varchar("flight_number", { length: 20 }),
  airline: text("airline"),
  departureAirport: varchar("departure_airport", { length: 10 }),
  arrivalAirport: varchar("arrival_airport", { length: 10 }),
  departureTime: varchar("departure_time", { length: 10 }),
  arrivalTime: varchar("arrival_time", { length: 10 }),
  departureDate: date("departure_date"),
  arrivalDate: date("arrival_date"),
  type: varchar("type", { length: 20 }).default("outbound").notNull(),
  isReturn: boolean("is_return").default(false).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Flight = typeof flights.$inferSelect;
export type InsertFlight = typeof flights.$inferInsert;

// ─── Accommodations ───────────────────────────────────────────────────────────
export const accommodations = pgTable("accommodations", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id").references(() => trips.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  address: text("address"),
  checkIn: date("check_in"),
  checkOut: date("check_out"),
  confirmationNumber: text("confirmation_number"),
  notes: text("notes"),
  lat: numeric("lat", { precision: 10, scale: 7 }),
  lng: numeric("lng", { precision: 10, scale: 7 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Accommodation = typeof accommodations.$inferSelect;
export type InsertAccommodation = typeof accommodations.$inferInsert;

// ─── Notifications ────────────────────────────────────────────────────────────
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  tripId: integer("trip_id").references(() => trips.id, { onDelete: "cascade" }),
  type: notificationTypeEnum("type").default("general").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  isRead: boolean("is_read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;
