import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { sql, type SQL } from "drizzle-orm";
import {
  normalizeFlightLookupNumber,
  normalizeFlightLookupStoredDate,
  validFlightLookupDate,
} from "../shared/flightLookup";
import type {
  AirportFlightObservation,
  FlightReference,
  FlightStatusRequest,
  FlightStatusResult,
} from "../shared/flightStatus";
import { getDb } from "./db";

/** The same structural executor works for the database and a transaction. */
export interface FlightSqlExecutor {
  execute(query: SQL): Promise<unknown>;
}
export type AuthorizedFlightSource = {
  reference: FlightReference;
  tripId: number | null;
  request: FlightStatusRequest | null;
};
export type FlightWatch = {
  id: number;
  userId: number;
  sourceKind: FlightReference["kind"];
  sourceId: number;
  enabled: boolean;
  lastSignature: string | null;
  lastObservation: AirportFlightObservation | null;
  lastCheckedAt: number | null;
};
export type FlightWatchState = {
  reference: FlightReference;
  enabled: boolean;
  eligible: boolean;
  lastCheckedAt: number | null;
  lastObservation: AirportFlightObservation | null;
  scheduleActive: boolean;
};

async function storage() {
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Flight status storage is temporarily unavailable.",
    });
  return db;
}

/** mysql2 execute returns [rows, fields]. Do not expose driver metadata. */
async function rows<T>(executor: FlightSqlExecutor, query: SQL): Promise<T[]> {
  const result = await executor.execute(query);
  return Array.isArray(result) && Array.isArray(result[0])
    ? (result[0] as T[])
    : [];
}
const positiveId = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value > 0 &&
  value <= 2147483647;
const airport = (value: unknown) =>
  typeof value === "string" && /^[A-Z]{3}$/.test(value.trim().toUpperCase())
    ? value.trim().toUpperCase()
    : "";
const readableRole = (role: unknown) =>
  role === "owner" || role === "editor" || role === "viewer";

/** Narrow source read, followed by exact membership checks; no notes or booking fields. */
export async function loadAuthorizedFlightSource(
  userId: number,
  reference: FlightReference,
  executor?: FlightSqlExecutor,
  lock = false
): Promise<AuthorizedFlightSource | null> {
  if (!positiveId(userId) || !positiveId(reference.id)) return null;
  const db = executor ?? (await storage());
  const locking = lock ? sql` FOR UPDATE` : sql``;
  let tripId: number | null = null;
  let source:
    | {
        id: number;
        flightNumber: unknown;
        date: unknown;
        fromCode: unknown;
        toCode: unknown;
      }
    | undefined;
  if (reference.kind === "trip") {
    const [flight] = await rows<
      NonNullable<typeof source> & { tripId: number }
    >(
      db,
      sql`
      SELECT id, tripId, flightNumber, date, fromCode, toCode
      FROM flights WHERE id = ${reference.id} LIMIT 1${locking}`
    );
    if (!flight || flight.id !== reference.id || !positiveId(flight.tripId))
      return null;
    const [membership] = await rows<{
      userId: number;
      tripId: number;
      role: unknown;
    }>(
      db,
      sql`
      SELECT userId, tripId, role FROM trip_members
      WHERE userId = ${userId} AND tripId = ${flight.tripId} LIMIT 1${locking}`
    );
    if (
      !membership ||
      membership.userId !== userId ||
      membership.tripId !== flight.tripId ||
      !readableRole(membership.role)
    )
      return null;
    const [trip] = await rows<{ id: number }>(
      db,
      sql`SELECT id FROM trips WHERE id = ${flight.tripId} LIMIT 1${locking}`
    );
    if (!trip || trip.id !== flight.tripId) return null;
    source = flight;
    tripId = flight.tripId;
  } else if (reference.kind === "passport") {
    const [flight] = await rows<
      NonNullable<typeof source> & { userId: number }
    >(
      db,
      sql`
      SELECT id, userId, flightNumber, flightDate AS date,
        departureAirport AS fromCode, arrivalAirport AS toCode
      FROM past_flights WHERE id = ${reference.id} AND userId = ${userId} LIMIT 1${locking}`
    );
    if (!flight || flight.id !== reference.id || flight.userId !== userId)
      return null;
    source = flight;
  } else return null;
  const flightNumber =
    typeof source.flightNumber === "string"
      ? normalizeFlightLookupNumber(source.flightNumber)
      : "";
  const date = normalizeFlightLookupStoredDate(source.date);
  const fromCode = airport(source.fromCode),
    toCode = airport(source.toCode);
  const eligible =
    flightNumber &&
    date &&
    validFlightLookupDate(date) &&
    fromCode &&
    toCode &&
    fromCode !== toCode &&
    (fromCode === "HKG" || toCode === "HKG");
  return {
    reference,
    tripId,
    request: eligible ? { flightNumber, date, fromCode, toCode } : null,
  };
}

export async function requireAuthorizedFlightSource(
  userId: number,
  reference: FlightReference
) {
  const source = await loadAuthorizedFlightSource(userId, reference);
  if (!source)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Saved flight not found or access denied.",
    });
  return source;
}

/** JSON stored by this feature is re-whitelisted even if the DB is malformed. */
export function publicObservation(
  value: unknown
): AirportFlightObservation | null {
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  const statuses = [
    "scheduled",
    "boarding",
    "departed",
    "arrived",
    "delayed",
    "cancelled",
    "unknown",
  ];
  if (
    o.provider !== "hkia" ||
    typeof o.id !== "string" ||
    typeof o.flightNumber !== "string" ||
    typeof o.date !== "string" ||
    !validFlightLookupDate(o.date) ||
    !airport(o.fromCode) ||
    !airport(o.toCode) ||
    !statuses.includes(String(o.status)) ||
    !["arrival", "departure"].includes(String(o.direction)) ||
    typeof o.fetchedAt !== "number" ||
    !Number.isFinite(o.fetchedAt)
  )
    return null;
  const text = (v: unknown, max = 120) =>
    typeof v === "string"
      ? v
          .replace(/[\u0000-\u001f\u007f<>]/g, "")
          .trim()
          .slice(0, max)
      : "";
  const nullable = (v: unknown) =>
    typeof v === "string" && text(v) ? text(v) : null;
  return {
    id: text(o.id),
    provider: "hkia",
    date: o.date,
    flightNumber: text(o.flightNumber, 12),
    fromCode: airport(o.fromCode),
    toCode: airport(o.toCode),
    direction: o.direction as AirportFlightObservation["direction"],
    scheduledTime: nullable(o.scheduledTime),
    status: o.status as AirportFlightObservation["status"],
    statusText: text(o.statusText),
    gate: nullable(o.gate),
    terminal: nullable(o.terminal),
    checkInAisle: nullable(o.checkInAisle),
    baggageBelt: nullable(o.baggageBelt),
    sourceUpdatedAt:
      typeof o.sourceUpdatedAt === "number" &&
      Number.isFinite(o.sourceUpdatedAt)
        ? o.sourceUpdatedAt
        : null,
    fetchedAt: o.fetchedAt,
  };
}
function watchRow(value: FlightWatch): FlightWatch {
  return {
    ...value,
    enabled: value.enabled === true || Number(value.enabled) === 1,
    lastCheckedAt:
      value.lastCheckedAt === null ? null : Number(value.lastCheckedAt),
    lastObservation: publicObservation(value.lastObservation),
  };
}
const watchColumns = sql`id, userId, sourceKind, sourceId, enabled, lastSignature, lastObservation, lastCheckedAt`;
export async function getOwnFlightWatch(
  userId: number,
  reference: FlightReference,
  executor?: FlightSqlExecutor,
  lock = false
): Promise<FlightWatch | null> {
  const db = executor ?? (await storage());
  const [watch] = await rows<FlightWatch>(
    db,
    sql`SELECT ${watchColumns} FROM flight_status_watches
    WHERE userId = ${userId} AND sourceKind = ${reference.kind} AND sourceId = ${reference.id}
    LIMIT 1${lock ? sql` FOR UPDATE` : sql``}`
  );
  if (
    !watch ||
    watch.userId !== userId ||
    watch.sourceKind !== reference.kind ||
    watch.sourceId !== reference.id
  )
    return null;
  return watchRow(watch);
}
export async function listFlightWatches(
  userId: number | undefined,
  limit: number,
  enabledOnly = true
): Promise<FlightWatch[]> {
  const db = await storage();
  const scope = userId === undefined ? sql`1 = 1` : sql`userId = ${userId}`;
  const list = await rows<FlightWatch>(
    db,
    sql`SELECT ${watchColumns} FROM flight_status_watches
    WHERE ${scope} ${enabledOnly ? sql`AND enabled = TRUE` : sql``}
    ORDER BY COALESCE(lastCheckedAt, 0) ASC, id ASC LIMIT ${Math.min(100, Math.max(1, limit))}`
  );
  return list
    .filter(
      w =>
        positiveId(w.userId) &&
        positiveId(w.sourceId) &&
        (w.sourceKind === "trip" || w.sourceKind === "passport") &&
        (userId === undefined || w.userId === userId)
    )
    .map(watchRow);
}
export async function isFlightStatusScheduleActive(): Promise<boolean> {
  const [row] = await rows<{
    enabled: boolean;
    schedule_cron_task_uid: string | null;
  }>(
    await storage(),
    sql`
    SELECT enabled, schedule_cron_task_uid FROM flight_status_schedule WHERE id = 1 LIMIT 1`
  );
  return (
    !!row &&
    (row.enabled === true || Number(row.enabled) === 1) &&
    typeof row.schedule_cron_task_uid === "string" &&
    row.schedule_cron_task_uid.length > 0
  );
}
export async function getFlightStatusScheduleByTaskUid(
  taskUid: string
): Promise<boolean> {
  const [row] = await rows<{
    enabled: boolean;
    schedule_cron_task_uid: string;
  }>(
    await storage(),
    sql`
    SELECT enabled, schedule_cron_task_uid FROM flight_status_schedule
    WHERE id = 1 AND schedule_cron_task_uid = ${taskUid} LIMIT 1`
  );
  return (
    !!row &&
    row.schedule_cron_task_uid === taskUid &&
    (row.enabled === true || Number(row.enabled) === 1)
  );
}
export async function disableFlightWatch(
  userId: number,
  reference: FlightReference,
  executor?: FlightSqlExecutor
) {
  await (executor ?? (await storage())).execute(sql`UPDATE flight_status_watches
    SET enabled = FALSE, lastSignature = NULL, lastObservation = NULL, lastCheckedAt = ${Date.now()}, updatedAt = CURRENT_TIMESTAMP
    WHERE userId = ${userId} AND sourceKind = ${reference.kind} AND sourceId = ${reference.id} LIMIT 1`);
}

export async function setOwnFlightWatch(
  userId: number,
  reference: FlightReference,
  enabled: boolean
): Promise<void> {
  const db = await storage();
  const authorized = await db.transaction(async tx => {
    const source = await loadAuthorizedFlightSource(
      userId,
      reference,
      tx,
      true
    );
    if (!source) {
      await disableFlightWatch(userId, reference, tx);
      return false;
    }
    if (enabled && !source.request)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Watch requires a valid flight number/date and a Hong Kong-linked route.",
      });
    const previous = await getOwnFlightWatch(userId, reference, tx, true);
    // Repeating 'enabled=true' does not discard a baseline. Actual toggles do.
    if (previous?.enabled === enabled) return true;
    await tx.execute(sql`INSERT INTO flight_status_watches (userId, sourceKind, sourceId, enabled)
      VALUES (${userId}, ${reference.kind}, ${reference.id}, ${enabled})
      ON DUPLICATE KEY UPDATE enabled = ${enabled}, lastSignature = NULL,
        lastObservation = NULL, lastCheckedAt = NULL, updatedAt = CURRENT_TIMESTAMP`);
    return true;
  });
  if (!authorized)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Saved flight not found or access denied.",
    });
}

export function hongKongFlightDate(now = Date.now()): string {
  return new Date(now + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
export function withinFlightPollingWindow(
  date: string,
  now = Date.now()
): boolean {
  if (!validFlightLookupDate(date)) return false;
  return (
    Math.abs(
      Date.parse(`${date}T00:00:00Z`) -
        Date.parse(`${hongKongFlightDate(now)}T00:00:00Z`)
    ) <= 86400000
  );
}
const changeFields = [
  "status",
  "statusText",
  "gate",
  "terminal",
  "checkInAisle",
  "baggageBelt",
] as const;
export function flightObservationSignature(
  observation: AirportFlightObservation
): string {
  return createHash("sha256")
    .update(JSON.stringify(changeFields.map(k => observation[k])))
    .digest("hex");
}
function sameRequest(
  a: FlightStatusRequest | null,
  b: FlightStatusRequest | null
): boolean {
  return (
    !!a &&
    !!b &&
    a.flightNumber === b.flightNumber &&
    a.date === b.date &&
    a.fromCode === b.fromCode &&
    a.toCode === b.toCode
  );
}
export function flightObservationMatches(
  observation: AirportFlightObservation,
  request: FlightStatusRequest
): boolean {
  return (
    sameRequest(
      {
        flightNumber: observation.flightNumber,
        date: observation.date,
        fromCode: observation.fromCode,
        toCode: observation.toCode,
      },
      request
    ) &&
    observation.direction ===
      (request.toCode === "HKG" ? "arrival" : "departure")
  );
}
/** Previous-day airport snapshots are historical, regardless of a misleading outcome. */
export function freshFlightObservation(
  result: FlightStatusResult | null,
  request: FlightStatusRequest,
  now: number
): AirportFlightObservation | null {
  const o =
    result?.outcome === "available"
      ? publicObservation(result.observation)
      : null;
  if (
    !o ||
    !flightObservationMatches(o, request) ||
    o.date < hongKongFlightDate(now) ||
    !withinFlightPollingWindow(o.date, now)
  )
    return null;
  if (now - o.fetchedAt > 10 * 60 * 1000 || o.fetchedAt > now + 60 * 1000)
    return null;
  if (
    o.sourceUpdatedAt === null ||
    now - o.sourceUpdatedAt > 15 * 60 * 1000 ||
    o.sourceUpdatedAt > now + 60 * 1000
  )
    return null;
  return o;
}
function notificationMessage(
  previous: AirportFlightObservation,
  current: AirportFlightObservation
): string | null {
  // A missing field is not proof of a gate/status change. Unknown states are not events.
  const labels: Record<(typeof changeFields)[number], string> = {
    status: "狀態 / Status",
    statusText: "機場狀態 / Airport status",
    gate: "閘口 / Gate",
    terminal: "客運大樓 / Terminal",
    checkInAisle: "登機櫃位 / Check-in aisle",
    baggageBelt: "行李輸送帶 / Baggage belt",
  };
  const meaningfulRawStatus = (value: string) =>
    !!value.trim() && !/^(?:\d+|unknown|n\/?a|-)$/i.test(value.trim());
  const changes = changeFields
    .filter(k => {
      if (previous[k] === current[k] || !previous[k] || !current[k])
        return false;
      if (k === "status")
        return previous.status !== "unknown" && current.status !== "unknown";
      if (k === "statusText")
        return (
          meaningfulRawStatus(previous.statusText) &&
          meaningfulRawStatus(current.statusText)
        );
      return true;
    })
    .map(k => `${labels[k]}: ${previous[k]} → ${current[k]}`);
  if (!changes.length) return null;
  return `${current.flightNumber} · ${current.date}\n${changes.join("; ")}\n機場資料可能更改，請向航空公司確認。 / Airport information may change; confirm with your airline.`.slice(
    0,
    1400
  );
}

/** Provider calls happen BEFORE this short transaction. Permissions and source identity
 * are rechecked under locks before the watch and subscriber-only alert commit together.
 * No new schema revision is required: SELECT FOR UPDATE serializes duplicate callbacks. */
export async function commitFlightWatchCheck(
  watch: FlightWatch,
  checkedRequest: FlightStatusRequest | null,
  result: FlightStatusResult | null,
  now = Date.now()
): Promise<{ notificationsCreated: number }> {
  const db = await storage();
  const reference = { kind: watch.sourceKind, id: watch.sourceId };
  return db.transaction(async tx => {
    const source = await loadAuthorizedFlightSource(
      watch.userId,
      reference,
      tx,
      true
    );
    const current = await getOwnFlightWatch(watch.userId, reference, tx, true);
    if (!current || !current.enabled) return { notificationsCreated: 0 };
    if (!source || !source.request) {
      await disableFlightWatch(watch.userId, reference, tx);
      return { notificationsCreated: 0 };
    }
    if (!sameRequest(source.request, checkedRequest)) {
      // Source edited during the network call: never apply data for the old flight.
      await tx.execute(sql`UPDATE flight_status_watches SET lastSignature = NULL, lastObservation = NULL,
        lastCheckedAt = ${now}, updatedAt = CURRENT_TIMESTAMP WHERE id = ${current.id} AND userId = ${watch.userId} LIMIT 1`);
      return { notificationsCreated: 0 };
    }
    const observation = freshFlightObservation(result, source.request, now);
    const previous = current.lastObservation;
    // A delayed concurrent fetch must not roll a newer observation backwards.
    if (
      observation &&
      previous &&
      (observation.fetchedAt < previous.fetchedAt ||
        (observation.sourceUpdatedAt !== null &&
          previous.sourceUpdatedAt !== null &&
          observation.sourceUpdatedAt < previous.sourceUpdatedAt))
    )
      return { notificationsCreated: 0 };
    let notificationsCreated = 0;
    if (observation) {
      const signature = flightObservationSignature(observation);
      const previousIsFresh =
        previous &&
        flightObservationMatches(previous, source.request) &&
        freshFlightObservation(
          {
            outcome: "available",
            observation: previous,
            checkedAt: now,
            message: "",
            sourceUrl: "",
            experimentalRecentData: false,
          },
          source.request,
          now
        );
      const message =
        previousIsFresh &&
        current.lastSignature &&
        current.lastSignature !== signature
          ? notificationMessage(previous, observation)
          : null;
      if (message) {
        await tx.execute(sql`INSERT INTO notifications (userId, tripId, type, title, message, \`read\`)
          VALUES (${watch.userId}, ${source.tripId}, 'general', ${`航班更新 / Flight update · ${observation.flightNumber}`}, ${message}, FALSE)`);
        notificationsCreated = 1;
      }
      await tx.execute(sql`UPDATE flight_status_watches SET lastSignature = ${signature},
        lastObservation = ${JSON.stringify(observation)}, lastCheckedAt = ${now}, updatedAt = CURRENT_TIMESTAMP
        WHERE id = ${current.id} AND userId = ${watch.userId} LIMIT 1`);
    } else {
      await tx.execute(sql`UPDATE flight_status_watches SET lastCheckedAt = ${now}, updatedAt = CURRENT_TIMESTAMP
        WHERE id = ${current.id} AND userId = ${watch.userId} LIMIT 1`);
    }
    return { notificationsCreated };
  });
}
