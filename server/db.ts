import { drizzle } from "drizzle-orm/mysql2";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import {
  users, trips, tripMembers, itineraryDays, activities,
  expenses, mapPins, flights, accommodations, notifications,
  visitedCountries, pastFlights,
  InsertUser, InsertTrip, InsertTripMember, InsertItineraryDay,
  InsertActivity, InsertExpense, InsertMapPin, InsertFlight,
  InsertAccommodation, InsertNotification, InsertVisitedCountry, InsertPastFlight,
} from "../drizzle/schema";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────────────
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    for (const field of textFields) {
      const value = user[field];
      if (value !== undefined) { values[field] = value ?? null; updateSet[field] = value ?? null; }
    }
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Trips ────────────────────────────────────────────────────────────────────
export async function getUserTrips(userId: number) {
  const db = await getDb();
  if (!db) return [];
  // Get trips where user is a member
  const memberTrips = await db
    .select({ trip: trips, memberRole: tripMembers.role })
    .from(tripMembers)
    .innerJoin(trips, eq(tripMembers.tripId, trips.id))
    .where(eq(tripMembers.userId, userId))
    .orderBy(desc(trips.createdAt));
  return memberTrips.map(r => ({ ...r.trip, userRole: r.memberRole }));
}

export async function getTripById(tripId: number, userId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select({ trip: trips, memberRole: tripMembers.role })
    .from(trips)
    .innerJoin(tripMembers, and(eq(tripMembers.tripId, trips.id), eq(tripMembers.userId, userId)))
    .where(eq(trips.id, tripId))
    .limit(1);
  return result.length > 0 ? { ...result[0].trip, userRole: result[0].memberRole } : null;
}

export async function createTrip(data: InsertTrip, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(trips).values(data);
  const tripId = (result as any).insertId as number;
  // Add creator as owner
  await db.insert(tripMembers).values({ tripId, userId, role: "owner" });
  return tripId;
}

export async function updateTrip(tripId: number, data: Partial<InsertTrip>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(trips).set(data).where(eq(trips.id, tripId));
}

export async function deleteTrip(tripId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(tripMembers).where(eq(tripMembers.tripId, tripId));
  await db.delete(itineraryDays).where(eq(itineraryDays.tripId, tripId));
  await db.delete(activities).where(eq(activities.tripId, tripId));
  await db.delete(expenses).where(eq(expenses.tripId, tripId));
  await db.delete(mapPins).where(eq(mapPins.tripId, tripId));
  await db.delete(flights).where(eq(flights.tripId, tripId));
  await db.delete(accommodations).where(eq(accommodations.tripId, tripId));
  await db.delete(trips).where(eq(trips.id, tripId));
}

export async function hasDemoTrip(userId: number) {
  const db = await getDb();
  if (!db) return false;
  const result = await db
    .select({ id: trips.id })
    .from(trips)
    .innerJoin(tripMembers, eq(tripMembers.tripId, trips.id))
    .where(and(eq(tripMembers.userId, userId), eq(trips.isDemoTrip, true)))
    .limit(1);
  return result.length > 0;
}

// ─── Members ──────────────────────────────────────────────────────────────────
export async function getTripMembers(tripId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ member: tripMembers, user: users })
    .from(tripMembers)
    .leftJoin(users, eq(tripMembers.userId, users.id))
    .where(eq(tripMembers.tripId, tripId))
    .orderBy(asc(tripMembers.joinedAt));
}

export async function addTripMember(data: InsertTripMember) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(tripMembers).values(data);
  return (result as any).insertId as number;
}

export async function updateMemberRole(memberId: number, role: "owner" | "editor" | "viewer") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(tripMembers).set({ role }).where(eq(tripMembers.id, memberId));
}

export async function removeTripMember(memberId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(tripMembers).where(eq(tripMembers.id, memberId));
}

export async function getUserMembership(tripId: number, userId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select()
    .from(tripMembers)
    .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, userId)))
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

// ─── Itinerary ────────────────────────────────────────────────────────────────
export async function getItineraryDays(tripId: number) {
  const db = await getDb();
  if (!db) return [];
  const days = await db.select().from(itineraryDays).where(eq(itineraryDays.tripId, tripId)).orderBy(asc(itineraryDays.dayNumber));
  const acts = await db.select().from(activities).where(eq(activities.tripId, tripId)).orderBy(asc(activities.sortOrder), asc(activities.startTime));
  return days.map(day => ({
    ...day,
    activities: acts.filter(a => a.dayId === day.id),
  }));
}

export async function addItineraryDay(data: InsertItineraryDay) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(itineraryDays).values(data);
  return (result as any).insertId as number;
}

export async function addActivity(data: InsertActivity) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(activities).values(data);
  return (result as any).insertId as number;
}

export async function updateActivity(activityId: number, data: Partial<InsertActivity>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(activities).set(data).where(eq(activities.id, activityId));
}

export async function deleteActivity(activityId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(activities).where(eq(activities.id, activityId));
}

export async function deleteItineraryDay(dayId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(activities).where(eq(activities.dayId, dayId));
  await db.delete(itineraryDays).where(eq(itineraryDays.id, dayId));
}

// ─── Expenses ─────────────────────────────────────────────────────────────────
export async function getTripExpenses(tripId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(expenses).where(eq(expenses.tripId, tripId)).orderBy(desc(expenses.date));
}

export async function addExpense(data: InsertExpense) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(expenses).values(data);
  return (result as any).insertId as number;
}

export async function updateExpense(expenseId: number, data: Partial<InsertExpense>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(expenses).set(data).where(eq(expenses.id, expenseId));
}

export async function deleteExpense(expenseId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(expenses).where(eq(expenses.id, expenseId));
}

// ─── Map Pins ─────────────────────────────────────────────────────────────────
export async function getMapPins(tripId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(mapPins).where(eq(mapPins.tripId, tripId)).orderBy(asc(mapPins.createdAt));
}

export async function addMapPin(data: InsertMapPin) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(mapPins).values(data);
  return (result as any).insertId as number;
}

export async function updateMapPin(pinId: number, data: Partial<InsertMapPin>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(mapPins).set(data).where(eq(mapPins.id, pinId));
}

export async function deleteMapPin(pinId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(mapPins).where(eq(mapPins.id, pinId));
}

// ─── Flights ──────────────────────────────────────────────────────────────────
export async function getTripFlights(tripId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(flights).where(eq(flights.tripId, tripId)).orderBy(asc(flights.orderIndex), asc(flights.date));
}

export async function addFlight(data: InsertFlight) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(flights).values(data);
  return (result as any).insertId as number;
}

export async function updateFlight(flightId: number, data: Partial<InsertFlight>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(flights).set(data).where(eq(flights.id, flightId));
}

export async function deleteFlight(flightId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(flights).where(eq(flights.id, flightId));
}

// ─── Accommodations ───────────────────────────────────────────────────────────
export async function getTripAccommodations(tripId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(accommodations).where(eq(accommodations.tripId, tripId)).orderBy(asc(accommodations.orderIndex));
}

export async function addAccommodation(data: InsertAccommodation) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(accommodations).values(data);
  return (result as any).insertId as number;
}

export async function updateAccommodation(accId: number, data: Partial<InsertAccommodation>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(accommodations).set(data).where(eq(accommodations.id, accId));
}

export async function deleteAccommodation(accId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(accommodations).where(eq(accommodations.id, accId));
}

// ─── Notifications ────────────────────────────────────────────────────────────
export async function getUserNotifications(userId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(limit);
}

export async function getUnreadCount(userId: number) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ count: sql<number>`COUNT(*)` }).from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
  return Number(result[0]?.count ?? 0);
}

export async function addNotification(data: InsertNotification) {
  const db = await getDb();
  if (!db) return;
  await db.insert(notifications).values(data);
}

export async function markNotificationRead(notifId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, notifId));
}

export async function markAllNotificationsRead(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(notifications).set({ isRead: true }).where(eq(notifications.userId, userId));
}

// ─── Visited Countries ────────────────────────────────────────────────────────
export async function getVisitedCountries(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(visitedCountries).where(eq(visitedCountries.userId, userId)).orderBy(asc(visitedCountries.countryCode));
}

export async function upsertVisitedCountry(data: InsertVisitedCountry) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(visitedCountries).values(data).onDuplicateKeyUpdate({ set: { status: data.status, visitedAt: data.visitedAt, notes: data.notes } });
}

export async function removeVisitedCountry(userId: number, countryCode: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(visitedCountries).where(and(eq(visitedCountries.userId, userId), eq(visitedCountries.countryCode, countryCode)));
}

// ─── Past Flights (Passport) ──────────────────────────────────────────────────
export async function getPastFlights(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(pastFlights).where(eq(pastFlights.userId, userId)).orderBy(desc(pastFlights.flightDate));
}

export async function addPastFlight(data: InsertPastFlight) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(pastFlights).values(data);
  return (result as any).insertId as number;
}

export async function updatePastFlight(flightId: number, data: Partial<InsertPastFlight>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(pastFlights).set(data).where(eq(pastFlights.id, flightId));
}

export async function deletePastFlight(flightId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(pastFlights).where(eq(pastFlights.id, flightId));
}
