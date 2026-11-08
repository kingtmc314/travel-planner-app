import { beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import type { SQL } from "drizzle-orm";
import type {
  AirportFlightObservation,
  FlightStatusResult,
} from "../shared/flightStatus";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  provider: vi.fn(),
  authenticate: vi.fn(),
}));
vi.mock("./db", () => ({ getDb: mocks.getDb }));
vi.mock("./hkiaFlightStatus", () => ({ getHkiaFlightStatus: mocks.provider }));
vi.mock("./_core/sdk", () => ({
  sdk: { authenticateRequest: mocks.authenticate },
}));
import { flightStatusRouter } from "./flightStatusRouter";
import {
  checkFlightWatches,
  handleFlightStatusScheduled,
} from "./flightStatusScheduled";
import {
  commitFlightWatchCheck,
  flightObservationSignature,
  freshFlightObservation,
  getOwnFlightWatch,
  hongKongFlightDate,
  loadAuthorizedFlightSource,
  setOwnFlightWatch,
  type FlightWatch,
} from "./flightStatusPersistence";

const NOW = Date.parse("2026-11-08T17:00:00Z"); // November 9 in Hong Kong
const date = "2026-11-09";
const ref = { kind: "trip" as const, id: 7 };
const request = { flightNumber: "CX123", date, fromCode: "HKG", toCode: "NRT" };
const dialect = new MySqlDialect();
function observation(
  overrides: Partial<AirportFlightObservation> = {}
): AirportFlightObservation {
  return {
    id: "hkia:cx123",
    provider: "hkia",
    ...request,
    direction: "departure",
    scheduledTime: "09:00",
    status: "scheduled",
    statusText: "Scheduled",
    gate: "10",
    terminal: "1",
    checkInAisle: "A",
    baggageBelt: null,
    sourceUpdatedAt: NOW,
    fetchedAt: NOW,
    ...overrides,
  };
}
function available(
  overrides: Partial<AirportFlightObservation> = {}
): FlightStatusResult {
  return {
    outcome: "available",
    observation: observation(overrides),
    checkedAt: NOW,
    message: "airport information",
    sourceUrl: "https://www.hongkongairport.com/en/flights/",
    experimentalRecentData: true,
  };
}
function watch(
  userId = 1,
  sourceKind: "trip" | "passport" = "trip",
  sourceId = 7,
  id = 1
): FlightWatch {
  return {
    id,
    userId,
    sourceKind,
    sourceId,
    enabled: true,
    lastSignature: null,
    lastObservation: null,
    lastCheckedAt: null,
  };
}
function context(userId = 1): TrpcContext {
  return {
    user: {
      id: userId,
      openId: `user-${userId}`,
      role: "user",
      name: null,
      email: null,
      loginMethod: null,
      createdAt: new Date(NOW),
      updatedAt: new Date(NOW),
      lastSignedIn: new Date(NOW),
    },
    req: { headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

/** In-memory SQL executor: no real connection, migration, schedule or provider call.
 * Transaction mutex models FOR UPDATE and rollback; SQL scope/locks are also asserted.
 */
class MockFlightDatabase {
  flights = [{ id: 7, tripId: 3, ...request, notes: "private booking note" }];
  memberships: Array<{ userId: number; tripId: number; role: string }> = [
    { userId: 1, tripId: 3, role: "viewer" },
  ];
  trips = [{ id: 3 }];
  passport = [
    {
      id: 8,
      userId: 1,
      flightNumber: "CX123",
      date,
      fromCode: "HKG",
      toCode: "NRT",
      notes: "SECRET PASSPORT",
    },
  ];
  watches: FlightWatch[] = [];
  schedule: { enabled: boolean; schedule_cron_task_uid: string } | null = null;
  notifications: Array<{
    userId: number;
    tripId: number | null;
    title: string;
    message: string;
  }> = [];
  queries: Array<{ sql: string; params: unknown[] }> = [];
  tail: Promise<unknown> = Promise.resolve();
  async transaction<T>(
    callback: (tx: MockFlightDatabase) => Promise<T>
  ): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>(resolve => {
      release = resolve;
    });
    await previous;
    const snapshot = structuredClone({
      watches: this.watches,
      notifications: this.notifications,
    });
    try {
      return await callback(this);
    } catch (error) {
      this.watches = snapshot.watches;
      this.notifications = snapshot.notifications;
      throw error;
    } finally {
      release();
    }
  }
  async execute(query: SQL): Promise<unknown> {
    const { sql: raw, params } = dialect.sqlToQuery(query);
    const q = raw.replace(/\s+/g, " ").trim();
    this.queries.push({ sql: q, params });
    const result = (values: unknown[]) => [structuredClone(values), []];
    if (q.startsWith("SELECT")) {
      expect(q).toContain("LIMIT");
      expect(q).not.toMatch(/SELECT \*/i);
      expect(q).not.toMatch(/\bnotes\b|\bemail\b|payment/i);
      if (q.includes("FROM flights "))
        return result(this.flights.filter(f => f.id === params[0]));
      if (q.includes("FROM trip_members "))
        return result(
          this.memberships.filter(
            m => m.userId === params[0] && m.tripId === params[1]
          )
        );
      if (q.includes("FROM trips "))
        return result(this.trips.filter(t => t.id === params[0]));
      if (q.includes("FROM past_flights "))
        return result(
          this.passport.filter(
            p => p.id === params[0] && p.userId === params[1]
          )
        );
      if (q.includes("FROM flight_status_schedule"))
        return result(
          this.schedule &&
            (!q.includes("AND schedule_cron_task_uid") ||
              this.schedule.schedule_cron_task_uid === params[0])
            ? [this.schedule]
            : []
        );
      if (q.includes("FROM flight_status_watches")) {
        if (q.includes("AND sourceKind"))
          return result(
            this.watches.filter(
              w =>
                w.userId === params[0] &&
                w.sourceKind === params[1] &&
                w.sourceId === params[2]
            )
          );
        const scoped = q.includes("WHERE userId");
        const limit = Number(params.at(-1));
        return result(
          this.watches
            .filter(
              w =>
                (!scoped || w.userId === params[0]) &&
                (!q.includes("AND enabled = TRUE") || w.enabled)
            )
            .sort(
              (a, b) =>
                (a.lastCheckedAt ?? 0) - (b.lastCheckedAt ?? 0) || a.id - b.id
            )
            .slice(0, limit)
        );
      }
    }
    if (q.startsWith("INSERT INTO notifications")) {
      this.notifications.push({
        userId: params[0] as number,
        tripId: params[1] as number | null,
        title: params[2] as string,
        message: params[3] as string,
      });
      return [{ affectedRows: 1 }, []];
    }
    if (q.startsWith("INSERT INTO flight_status_watches")) {
      const existing = this.watches.find(
        w =>
          w.userId === params[0] &&
          w.sourceKind === params[1] &&
          w.sourceId === params[2]
      );
      if (existing)
        Object.assign(existing, {
          enabled: params[3],
          lastSignature: null,
          lastObservation: null,
          lastCheckedAt: null,
        });
      else
        this.watches.push({
          ...watch(
            params[0] as number,
            params[1] as "trip" | "passport",
            params[2] as number,
            this.watches.length + 1
          ),
          enabled: params[3] as boolean,
        });
      return [{ affectedRows: 1 }, []];
    }
    if (q.startsWith("UPDATE flight_status_watches")) {
      let target: FlightWatch | undefined;
      if (q.includes("WHERE userId")) {
        target = this.watches.find(
          w =>
            w.userId === params[1] &&
            w.sourceKind === params[2] &&
            w.sourceId === params[3]
        );
        if (target)
          Object.assign(target, {
            enabled: false,
            lastSignature: null,
            lastObservation: null,
            lastCheckedAt: params[0],
          });
      } else if (q.includes("SET lastSignature = NULL")) {
        target = this.watches.find(
          w => w.id === params[1] && w.userId === params[2]
        );
        if (target)
          Object.assign(target, {
            lastSignature: null,
            lastObservation: null,
            lastCheckedAt: params[0],
          });
      } else if (q.includes("SET lastSignature = ?")) {
        target = this.watches.find(
          w => w.id === params[3] && w.userId === params[4]
        );
        if (target)
          Object.assign(target, {
            lastSignature: params[0],
            lastObservation: JSON.parse(params[1] as string),
            lastCheckedAt: params[2],
          });
      } else {
        target = this.watches.find(
          w => w.id === params[1] && w.userId === params[2]
        );
        if (target) target.lastCheckedAt = params[0] as number;
      }
      return [{ affectedRows: target ? 1 : 0 }, []];
    }
    throw new Error(`Unrecognized mocked SQL: ${q}`);
  }
}
let db: MockFlightDatabase;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  db = new MockFlightDatabase();
  mocks.getDb.mockResolvedValue(db);
  mocks.provider.mockResolvedValue(available());
});

describe("flight status authenticated source scope", () => {
  it("authenticates all procedures before DB/provider access", async () => {
    const caller = flightStatusRouter.createCaller({
      ...context(),
      user: null,
    });
    for (const invoke of [
      () => caller.status({ reference: ref }),
      () => caller.watchState({ reference: ref }),
      () => caller.setWatch({ reference: ref, enabled: true }),
      () => caller.watches(),
      () => caller.checkWatched(),
    ])
      await expect(invoke()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.provider).not.toHaveBeenCalled();
  });
  it("denies another user's passport before any status API or private watch read", async () => {
    const caller = flightStatusRouter.createCaller(context(2));
    const reference = { kind: "passport" as const, id: 8 };
    await expect(caller.status({ reference })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(caller.watchState({ reference })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(mocks.provider).not.toHaveBeenCalled();
    expect(
      db.queries.some(
        q =>
          q.sql.startsWith("SELECT") && q.sql.includes("flight_status_watches")
      )
    ).toBe(false);
  });
  it.each(["invalid-role", "wrong-user", "wrong-trip", "deleted-trip"])(
    "rejects actual membership failure: %s",
    async scenario => {
      if (scenario === "invalid-role") db.memberships[0].role = "admin";
      if (scenario === "wrong-user") db.memberships[0].userId = 2;
      if (scenario === "wrong-trip") db.memberships[0].tripId = 4;
      if (scenario === "deleted-trip") db.trips = [];
      await expect(
        flightStatusRouter.createCaller(context()).status({ reference: ref })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(mocks.provider).not.toHaveBeenCalled();
    }
  );
  it("viewer can watch for self; other members never receive their preferences", async () => {
    db.memberships.push({ userId: 2, tripId: 3, role: "editor" });
    const caller = flightStatusRouter.createCaller(context());
    expect(
      await caller.setWatch({ reference: ref, enabled: true })
    ).toMatchObject({ enabled: true, scheduleActive: false });
    expect(await caller.watches()).toEqual({
      references: [ref],
      scheduleActive: false,
    });
    const second = flightStatusRouter.createCaller(context(2));
    expect(await second.watchState({ reference: ref })).toMatchObject({
      enabled: false,
      lastObservation: null,
      scheduleActive: false,
    });
    expect(await second.watches()).toEqual({
      references: [],
      scheduleActive: false,
    });
    expect(db.schedule).toBeNull();
  });
  it("only valid HKG-linked routes enable; source notes and bookings remain untouched", async () => {
    const before = structuredClone(db.flights);
    db.flights[0].fromCode = "LHR";
    await expect(setOwnFlightWatch(1, ref, true)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    db.flights = before;
    await setOwnFlightWatch(1, ref, true);
    await flightStatusRouter.createCaller(context()).status({ reference: ref });
    expect(db.flights).toEqual(before);
    expect(
      JSON.stringify(await flightStatusRouter.createCaller(context()).watches())
    ).not.toContain("private booking");
  });
  it("permission revocation during provider response denies result and creates no event", async () => {
    mocks.provider.mockImplementation(async () => {
      db.memberships = [];
      return available();
    });
    await expect(
      flightStatusRouter.createCaller(context()).status({ reference: ref })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.notifications).toHaveLength(0);
  });
  it("never reveals global schedule activity without an enabled own watch", async () => {
    db.schedule = { enabled: true, schedule_cron_task_uid: "active" };
    expect(
      await flightStatusRouter
        .createCaller(context())
        .watchState({ reference: ref })
    ).toMatchObject({ scheduleActive: false });
    expect(
      await flightStatusRouter.createCaller(context()).checkWatched()
    ).toMatchObject({ scheduleActive: false });
  });
});

describe("durable baseline and atomic deduplication", () => {
  beforeEach(() => {
    db.watches = [watch()];
  });
  it("first fresh observation creates a baseline, never a new-arrival alert", async () => {
    await commitFlightWatchCheck(
      watch(),
      request,
      available({ status: "arrived", statusText: "Arrived" }),
      NOW
    );
    expect(db.notifications).toHaveLength(0);
    expect(db.watches[0].lastSignature).toHaveLength(64);
    expect(
      db.queries.some(
        q =>
          q.sql.includes("flight_status_watches") &&
          q.sql.includes("FOR UPDATE")
      )
    ).toBe(true);
  });
  it("concurrent refreshes atomically create one notification for one real change", async () => {
    await commitFlightWatchCheck(watch(), request, available(), NOW);
    const changed = available({
      gate: "22",
      fetchedAt: NOW + 1000,
      sourceUpdatedAt: NOW + 1000,
    });
    await Promise.all(
      Array.from({ length: 8 }, () =>
        commitFlightWatchCheck(watch(), request, changed, NOW + 1000)
      )
    );
    expect(db.notifications).toHaveLength(1);
    expect(db.notifications[0]).toMatchObject({ userId: 1, tripId: 3 });
    expect(db.notifications[0].message).toContain("Gate: 10 → 22");
    expect(db.notifications[0].message).not.toContain("private booking");
  });
  it("metadata clock changes do not produce alerts", async () => {
    await commitFlightWatchCheck(watch(), request, available(), NOW);
    await commitFlightWatchCheck(
      watch(),
      request,
      available({
        fetchedAt: NOW + 2000,
        sourceUpdatedAt: NOW + 2000,
        scheduledTime: "09:10",
      }),
      NOW + 2000
    );
    expect(db.notifications).toHaveLength(0);
    expect(flightObservationSignature(observation())).toBe(
      flightObservationSignature(
        observation({ fetchedAt: NOW + 2000, sourceUpdatedAt: null })
      )
    );
  });
  it.each([
    "stale",
    "unavailable",
    "not_found",
    "ambiguous",
    "unsupported",
  ] as const)(
    "%s results never create cancellation/arrival alerts",
    async outcome => {
      await commitFlightWatchCheck(watch(), request, available(), NOW);
      const signature = db.watches[0].lastSignature;
      await commitFlightWatchCheck(
        watch(),
        request,
        {
          ...available({ status: "cancelled", statusText: "Cancelled" }),
          outcome,
        },
        NOW
      );
      expect(db.notifications).toHaveLength(0);
      expect(db.watches[0].lastSignature).toBe(signature);
    }
  );
  it("historical day-old and time-stale available observations cannot become fresh", async () => {
    expect(hongKongFlightDate(NOW)).toBe(date);
    for (const result of [
      available({ date: "2026-11-08", status: "arrived" }),
      available({ fetchedAt: NOW - 86400000, status: "arrived" }),
      available({ sourceUpdatedAt: NOW - 86400000, status: "cancelled" }),
    ]) {
      expect(
        freshFlightObservation(
          result,
          { ...request, date: result.observation!.date },
          NOW
        )
      ).toBeNull();
    }
    db.flights[0].date = "2026-11-08";
    await commitFlightWatchCheck(
      watch(),
      { ...request, date: "2026-11-08" },
      available({ date: "2026-11-08", status: "arrived" }),
      NOW
    );
    expect(db.watches[0].lastSignature).toBeNull();
    expect(db.notifications).toHaveLength(0);
  });
  it("unknown/raw 0 is not inferred as a new arrival", async () => {
    await commitFlightWatchCheck(
      watch(),
      request,
      available({ status: "unknown", statusText: "0" }),
      NOW
    );
    await commitFlightWatchCheck(
      watch(),
      request,
      available({
        status: "arrived",
        statusText: "Arrived",
        fetchedAt: NOW + 1000,
      }),
      NOW + 1000
    );
    expect(db.notifications).toHaveLength(0);
  });
  it("meaningful verbatim status changes alert without inventing an arrival classification", async () => {
    await commitFlightWatchCheck(
      watch(),
      request,
      available({ status: "unknown", statusText: "Gate Closed" }),
      NOW
    );
    await commitFlightWatchCheck(
      watch(),
      request,
      available({ status: "unknown", statusText: "Final Call" }),
      NOW
    );
    expect(db.notifications).toHaveLength(1);
    expect(db.notifications[0].message).toContain(
      "Airport status: Gate Closed → Final Call"
    );
    expect(db.notifications[0].message).not.toContain("Arrived");
  });
  it.each(["terminal", "checkInAisle", "baggageBelt"] as const)(
    "explicit %s changes are real subscriber events",
    async key => {
      await commitFlightWatchCheck(
        watch(),
        request,
        available({ [key]: "A" }),
        NOW
      );
      await commitFlightWatchCheck(
        watch(),
        request,
        available({ [key]: "B" }),
        NOW
      );
      expect(db.notifications).toHaveLength(1);
      expect(db.notifications[0].message).toContain("A → B");
    }
  );
  it("missing gate fields are not invented real changes", async () => {
    await commitFlightWatchCheck(watch(), request, available(), NOW);
    await commitFlightWatchCheck(
      watch(),
      request,
      available({ gate: null }),
      NOW
    );
    expect(db.notifications).toHaveLength(0);
  });
  it("disabled-then-enabled resets baseline; repeated enabled does not", async () => {
    await commitFlightWatchCheck(watch(), request, available(), NOW);
    const signature = db.watches[0].lastSignature;
    await setOwnFlightWatch(1, ref, true);
    expect(db.watches[0].lastSignature).toBe(signature);
    await setOwnFlightWatch(1, ref, false);
    await setOwnFlightWatch(1, ref, true);
    expect(db.watches[0].lastSignature).toBeNull();
    await commitFlightWatchCheck(
      watch(),
      request,
      available({ gate: "99" }),
      NOW
    );
    expect(db.notifications).toHaveLength(0);
  });
  it("revoked/deleted sources clear and disable subscriptions before notifications", async () => {
    await commitFlightWatchCheck(watch(), request, available(), NOW);
    db.memberships = [];
    await commitFlightWatchCheck(
      watch(),
      request,
      available({ status: "cancelled" }),
      NOW
    );
    expect(db.watches[0]).toMatchObject({
      enabled: false,
      lastSignature: null,
      lastObservation: null,
    });
    expect(db.notifications).toHaveLength(0);
  });
  it("flight source edits during refresh reset baseline without applying old flight", async () => {
    await commitFlightWatchCheck(watch(), request, available(), NOW);
    db.flights[0].flightNumber = "CX999";
    await commitFlightWatchCheck(
      watch(),
      request,
      available({ gate: "99" }),
      NOW
    );
    expect(db.watches[0].lastSignature).toBeNull();
    expect(db.notifications).toHaveLength(0);
  });
  it("edited source watchState hides old identity; first fresh new-flight reading is baseline-only", async () => {
    await commitFlightWatchCheck(watch(), request, available(), NOW);
    db.flights[0].flightNumber = "CX999";
    expect(
      await flightStatusRouter
        .createCaller(context())
        .watchState({ reference: ref })
    ).toMatchObject({ enabled: true, lastObservation: null });
    await commitFlightWatchCheck(
      watch(),
      { ...request, flightNumber: "CX999" },
      available({ flightNumber: "CX999", gate: "99" }),
      NOW
    );
    expect(db.watches[0].lastObservation?.flightNumber).toBe("CX999");
    expect(db.notifications).toHaveLength(0);
  });
  it("invalid new source identity never exposes cached prior flight observation", async () => {
    await commitFlightWatchCheck(watch(), request, available(), NOW);
    db.flights[0].flightNumber = "";
    expect(
      await flightStatusRouter
        .createCaller(context())
        .watchState({ reference: ref })
    ).toMatchObject({ eligible: false, lastObservation: null });
  });
  it("late older observations cannot undo a newer committed change", async () => {
    await commitFlightWatchCheck(watch(), request, available(), NOW);
    await commitFlightWatchCheck(
      watch(),
      request,
      available({
        gate: "22",
        fetchedAt: NOW + 2000,
        sourceUpdatedAt: NOW + 2000,
      }),
      NOW + 2000
    );
    await commitFlightWatchCheck(
      watch(),
      request,
      available({
        gate: "10",
        fetchedAt: NOW + 1000,
        sourceUpdatedAt: NOW + 1000,
      }),
      NOW + 2000
    );
    expect(db.notifications).toHaveLength(1);
    expect(db.watches[0].lastObservation?.gate).toBe("22");
  });
  it("notification failure rolls back signature so retries can deliver once", async () => {
    await commitFlightWatchCheck(watch(), request, available(), NOW);
    const original = db.execute.bind(db);
    let fail = true;
    vi.spyOn(db, "execute").mockImplementation(async q => {
      if (
        fail &&
        dialect.sqlToQuery(q).sql.includes("INSERT INTO notifications")
      )
        throw new Error("mocked insert failure");
      return original(q);
    });
    await expect(
      commitFlightWatchCheck(watch(), request, available({ gate: "22" }), NOW)
    ).rejects.toThrow("mocked insert failure");
    expect(db.watches[0].lastObservation?.gate).toBe("10");
    fail = false;
    await commitFlightWatchCheck(
      watch(),
      request,
      available({ gate: "22" }),
      NOW
    );
    expect(db.notifications).toHaveLength(1);
  });
  it("passport updates create only subscriber notifications with no trip linkage", async () => {
    db.watches = [watch(1, "passport", 8)];
    await commitFlightWatchCheck(db.watches[0], request, available(), NOW);
    await commitFlightWatchCheck(
      db.watches[0],
      request,
      available({ gate: "22" }),
      NOW
    );
    expect(db.notifications).toHaveLength(1);
    expect(db.notifications[0]).toMatchObject({ userId: 1, tripId: null });
    expect(JSON.stringify(db.notifications)).not.toContain("SECRET PASSPORT");
  });
});

function response() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}
const req = (body: unknown = {}) =>
  ({ headers: { cookie: "private-token" }, body }) as Parameters<
    typeof handleFlightStatusScheduled
  >[0];
describe("bounded app refresh and scheduled callback security", () => {
  it("foreground checks current user's watches only", async () => {
    db.memberships.push({ userId: 2, tripId: 3, role: "owner" });
    db.watches = [watch(1), watch(2, "trip", 7, 2)];
    const result = await checkFlightWatches({ userId: 1 });
    expect(result).toEqual({
      checked: 1,
      notificationsCreated: 0,
      scheduleActive: false,
    });
    expect(db.watches[1].lastCheckedAt).toBeNull();
    expect(mocks.provider).toHaveBeenCalledTimes(1);
  });
  it.each([
    { userId: 1, cap: 25 },
    { userId: undefined, cap: 50 },
  ])(
    "enforces oldest-first watch cap $cap for user $userId",
    async ({ userId, cap }) => {
      db.flights = Array.from({ length: 60 }, (_, i) => ({
        ...db.flights[0],
        id: i + 10,
      }));
      db.watches = Array.from({ length: 60 }, (_, i) => ({
        ...watch(1, "trip", i + 10, i + 1),
        lastCheckedAt: i,
      }));
      const result = await checkFlightWatches({ userId });
      expect(result.checked).toBe(cap);
      expect(mocks.provider).toHaveBeenCalledTimes(cap);
      expect(db.watches[cap - 1].lastCheckedAt).toBe(NOW);
      expect(db.watches[cap].lastCheckedAt).toBe(cap);
    }
  );
  it("stops before the two-minute platform limit even with more watches pending", async () => {
    db.flights.push({ ...db.flights[0], id: 8 });
    db.watches = [watch(), watch(1, "trip", 8, 2)];
    mocks.provider.mockImplementation(async () => {
      vi.setSystemTime(NOW + 110001);
      return available();
    });
    const result = await checkFlightWatches({ userId: 1 });
    expect(result.checked).toBe(1);
    expect(mocks.provider).toHaveBeenCalledTimes(1);
    expect(db.watches[1].lastCheckedAt).toBeNull();
  });
  it("network failure updates check time but keeps baseline and creates no event", async () => {
    db.watches = [watch()];
    await commitFlightWatchCheck(watch(), request, available(), NOW);
    const signature = db.watches[0].lastSignature;
    mocks.provider.mockRejectedValue(new Error("private external error"));
    expect(await checkFlightWatches({ userId: 1 })).toMatchObject({
      checked: 1,
      notificationsCreated: 0,
    });
    expect(db.watches[0].lastSignature).toBe(signature);
  });
  it("permission revocation in background network call disables and clears without an alert", async () => {
    db.watches = [watch()];
    await commitFlightWatchCheck(watch(), request, available(), NOW);
    mocks.provider.mockImplementation(async () => {
      db.memberships = [];
      return available({ status: "cancelled", statusText: "Cancelled" });
    });
    await checkFlightWatches({ userId: 1 });
    expect(db.notifications).toHaveLength(0);
    expect(db.watches[0]).toMatchObject({
      enabled: false,
      lastSignature: null,
      lastObservation: null,
    });
  });
  it("out-of-window watched dates skip the provider and revoked watchers disable", async () => {
    db.flights[0].date = "2026-10-01";
    db.watches = [watch()];
    expect(await checkFlightWatches({ userId: 1 })).toMatchObject({
      checked: 1,
      notificationsCreated: 0,
    });
    expect(mocks.provider).not.toHaveBeenCalled();
    db.memberships = [];
    await checkFlightWatches({ userId: 1 });
    expect(db.watches[0].enabled).toBe(false);
  });
  it.each([
    { id: 1 },
    { id: -1, isCron: true },
    { id: -1, isCron: false, taskUid: "good" },
  ])(
    "rejects non-cron/missing task identity %j, ignoring body",
    async identity => {
      mocks.authenticate.mockResolvedValue(identity);
      const res = response();
      await handleFlightStatusScheduled(
        req({ taskUid: "good", userId: 1 }),
        res as unknown as Parameters<typeof handleFlightStatusScheduled>[1]
      );
      expect(res.status).toHaveBeenCalledWith(403);
      expect(mocks.getDb).not.toHaveBeenCalled();
      expect(mocks.provider).not.toHaveBeenCalled();
    }
  );
  it("uses verified taskUid, never attacker-controlled body config or scope", async () => {
    mocks.authenticate.mockResolvedValue({
      id: -1,
      isCron: true,
      taskUid: "verified",
    });
    db.schedule = { enabled: true, schedule_cron_task_uid: "verified" };
    db.watches = [watch()];
    const res = response();
    await handleFlightStatusScheduled(
      req({
        taskUid: "attacker",
        userId: 999,
        references: [{ kind: "passport", id: 8 }],
      }),
      res as unknown as Parameters<typeof handleFlightStatusScheduled>[1]
    );
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      checked: 1,
      notificationsCreated: 0,
      scheduleActive: true,
    });
    expect(mocks.provider).toHaveBeenCalledWith(request);
    expect(
      db.queries
        .filter(q => q.sql.includes("schedule_cron_task_uid ="))
        .every(q => q.params[0] === "verified")
    ).toBe(true);
  });
  it.each(["empty", "wrong-uid", "disabled"])(
    "inactive/orphan %s configs never refresh",
    async scenario => {
      mocks.authenticate.mockResolvedValue({
        id: -1,
        isCron: true,
        taskUid: "verified",
      });
      if (scenario !== "empty")
        db.schedule = {
          enabled: scenario !== "disabled",
          schedule_cron_task_uid:
            scenario === "wrong-uid" ? "other" : "verified",
        };
      const res = response();
      await handleFlightStatusScheduled(
        req({ enabled: true, taskUid: "verified" }),
        res as unknown as Parameters<typeof handleFlightStatusScheduled>[1]
      );
      expect(res.json).toHaveBeenCalledWith({
        ok: true,
        skipped: "inactive-or-orphan",
      });
      expect(mocks.provider).not.toHaveBeenCalled();
    }
  );
  it("returns safe JSON with no stack/body/token on storage failure", async () => {
    mocks.authenticate.mockResolvedValue({
      id: -1,
      isCron: true,
      taskUid: "verified",
    });
    mocks.getDb.mockRejectedValue(
      new Error("private-token SECRET PASSPORT stack")
    );
    const res = response();
    await handleFlightStatusScheduled(
      req(),
      res as unknown as Parameters<typeof handleFlightStatusScheduled>[1]
    );
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: "flight-status-check-failed",
    });
  });
  it("raw SQL scope defense rejects a deliberately broken foreign watch fixture", async () => {
    const original = db.execute.bind(db);
    vi.spyOn(db, "execute").mockImplementation(async query => {
      if (dialect.sqlToQuery(query).sql.includes("FROM flight_status_watches"))
        return [[watch(2)], []];
      return original(query);
    });
    expect(await getOwnFlightWatch(1, ref)).toBeNull();
    expect(await flightStatusRouter.createCaller(context()).watches()).toEqual({
      references: [],
      scheduleActive: false,
    });
  });
  it("narrow exact passport scope rejects malformed helper results", async () => {
    const original = db.execute.bind(db);
    vi.spyOn(db, "execute").mockImplementation(async query => {
      if (dialect.sqlToQuery(query).sql.includes("FROM past_flights"))
        return [[{ ...db.passport[0], userId: 2 }], []];
      return original(query);
    });
    expect(
      await loadAuthorizedFlightSource(1, { kind: "passport", id: 8 })
    ).toBeNull();
  });
});
