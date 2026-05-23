import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, and, desc, asc } from "drizzle-orm";
import {
  users, trips, tripMembers, itineraryDays, activities,
  expenses, mapPins, flights, accommodations, notifications,
  InsertUser, InsertTrip, InsertTripMember, InsertItineraryDay,
  InsertActivity, InsertExpense, InsertMapPin, InsertFlight,
  InsertAccommodation, InsertNotification,
} from "../drizzle/schema";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const client = postgres(process.env.DATABASE_URL, {
        ssl: "require",
        max: 10,
        idle_timeout: 20,
        connect_timeout: 10,
      });
      _db = drizzle(client);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────────────
export async function upsertUser(user: InsertUser): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(users)
    .values({ ...user, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: users.openId,
      set: {
        name: user.name,
        email: user.email,
        loginMethod: user.loginMethod,
        lastSignedIn: new Date(),
        updatedAt: new Date(),
      },
    });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

// ─── Trips ────────────────────────────────────────────────────────────────────
export async function getUserTrips(userId: number) {
  const db = await getDb();
  if (!db) return [];
  // Get trips where user is a member
  const memberTrips = await db
    .select({ trip: trips, memberRole: tripMembers.role })
    .from(trips)
    .innerJoin(tripMembers, and(eq(tripMembers.tripId, trips.id), eq(tripMembers.userId, userId)))
    .orderBy(desc(trips.createdAt));
  return memberTrips.map((r) => ({ ...r.trip, memberRole: r.memberRole }));
}

export async function getTripById(tripId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
  return result[0];
}

export async function createTrip(data: InsertTrip) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(trips).values(data).returning({ id: trips.id });
  return result[0];
}

export async function updateTrip(tripId: number, data: Partial<InsertTrip>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(trips).set({ ...data, updatedAt: new Date() }).where(eq(trips.id, tripId));
}

export async function deleteTrip(tripId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(trips).where(eq(trips.id, tripId));
}

export async function hasDemoTrip(userId: number) {
  const db = await getDb();
  if (!db) return false;
  const result = await db
    .select({ id: trips.id })
    .from(trips)
    .innerJoin(tripMembers, and(eq(tripMembers.tripId, trips.id), eq(tripMembers.userId, userId)))
    .where(eq(trips.isDemoTrip, true))
    .limit(1);
  return result.length > 0;
}

// ─── Trip Members ─────────────────────────────────────────────────────────────
export async function getTripMembers(tripId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tripMembers).where(eq(tripMembers.tripId, tripId)).orderBy(asc(tripMembers.joinedAt));
}

export async function addTripMember(data: InsertTripMember) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(tripMembers).values(data).returning({ id: tripMembers.id });
  return result[0];
}

export async function updateTripMember(memberId: number, data: Partial<InsertTripMember>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(tripMembers).set(data).where(eq(tripMembers.id, memberId));
}

export async function removeTripMember(memberId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(tripMembers).where(eq(tripMembers.id, memberId));
}

export async function getUserTripRole(tripId: number, userId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select({ role: tripMembers.role })
    .from(tripMembers)
    .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, userId)))
    .limit(1);
  return result[0]?.role ?? null;
}

// ─── Itinerary ────────────────────────────────────────────────────────────────
export async function getItineraryDays(tripId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(itineraryDays).where(eq(itineraryDays.tripId, tripId)).orderBy(asc(itineraryDays.dayNumber));
}

export async function createItineraryDay(data: InsertItineraryDay) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(itineraryDays).values(data).returning({ id: itineraryDays.id });
  return result[0];
}

export async function updateItineraryDay(dayId: number, data: Partial<InsertItineraryDay>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(itineraryDays).set(data).where(eq(itineraryDays.id, dayId));
}

export async function deleteItineraryDay(dayId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(itineraryDays).where(eq(itineraryDays.id, dayId));
}

export async function getActivitiesByDay(dayId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(activities).where(eq(activities.dayId, dayId)).orderBy(asc(activities.sortOrder));
}

export async function getActivitiesByTrip(tripId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(activities).where(eq(activities.tripId, tripId)).orderBy(asc(activities.sortOrder));
}

export async function createActivity(data: InsertActivity) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(activities).values(data).returning({ id: activities.id });
  return result[0];
}

export async function updateActivity(activityId: number, data: Partial<InsertActivity>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(activities).set({ ...data, updatedAt: new Date() }).where(eq(activities.id, activityId));
}

export async function deleteActivity(activityId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(activities).where(eq(activities.id, activityId));
}

// ─── Expenses ─────────────────────────────────────────────────────────────────
export async function getTripExpenses(tripId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(expenses).where(eq(expenses.tripId, tripId)).orderBy(desc(expenses.date));
}

export async function createExpense(data: InsertExpense) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(expenses).values(data).returning({ id: expenses.id });
  return result[0];
}

export async function updateExpense(expenseId: number, data: Partial<InsertExpense>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(expenses).set(data).where(eq(expenses.id, expenseId));
}

export async function deleteExpense(expenseId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(expenses).where(eq(expenses.id, expenseId));
}

// ─── Map Pins ─────────────────────────────────────────────────────────────────
export async function getMapPins(tripId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(mapPins).where(eq(mapPins.tripId, tripId)).orderBy(asc(mapPins.createdAt));
}

export async function createMapPin(data: InsertMapPin) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(mapPins).values(data).returning({ id: mapPins.id });
  return result[0];
}

export async function updateMapPin(pinId: number, data: Partial<InsertMapPin>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(mapPins).set(data).where(eq(mapPins.id, pinId));
}

export async function deleteMapPin(pinId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(mapPins).where(eq(mapPins.id, pinId));
}

// ─── Flights ──────────────────────────────────────────────────────────────────
export async function getTripFlights(tripId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(flights).where(eq(flights.tripId, tripId)).orderBy(asc(flights.departureTime));
}

export async function createFlight(data: InsertFlight) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(flights).values(data).returning({ id: flights.id });
  return result[0];
}

export async function updateFlight(flightId: number, data: Partial<InsertFlight>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(flights).set(data).where(eq(flights.id, flightId));
}

export async function deleteFlight(flightId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(flights).where(eq(flights.id, flightId));
}

// ─── Accommodations ───────────────────────────────────────────────────────────
export async function getTripAccommodations(tripId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(accommodations).where(eq(accommodations.tripId, tripId)).orderBy(asc(accommodations.checkIn));
}

export async function createAccommodation(data: InsertAccommodation) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(accommodations).values(data).returning({ id: accommodations.id });
  return result[0];
}

export async function updateAccommodation(id: number, data: Partial<InsertAccommodation>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(accommodations).set(data).where(eq(accommodations.id, id));
}

export async function deleteAccommodation(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(accommodations).where(eq(accommodations.id, id));
}

// ─── Notifications ────────────────────────────────────────────────────────────
export async function getUserNotifications(userId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function getUnreadNotificationCount(userId: number) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
  return result.length;
}

export async function createNotification(data: InsertNotification) {
  const db = await getDb();
  if (!db) return;
  await db.insert(notifications).values(data);
}

export async function markNotificationsRead(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(notifications).set({ isRead: true }).where(eq(notifications.userId, userId));
}

export async function notifyTripMembers(
  tripId: number,
  excludeUserId: number | null,
  type: InsertNotification["type"],
  title: string,
  message: string
) {
  const db = await getDb();
  if (!db) return;
  const members = await db
    .select({ userId: tripMembers.userId })
    .from(tripMembers)
    .where(eq(tripMembers.tripId, tripId));
  const toNotify = members
    .map((m) => m.userId)
    .filter((uid): uid is number => uid !== null && uid !== excludeUserId);
  if (toNotify.length === 0) return;
  await db.insert(notifications).values(
    toNotify.map((uid) => ({ userId: uid, tripId, type, title, message }))
  );
}
