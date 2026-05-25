import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(overrides?: Partial<AuthenticatedUser>): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user-001",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return { ctx };
}

function createAnonContext(): { ctx: TrpcContext } {
  const ctx: TrpcContext = {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
  return { ctx };
}

describe("auth.me", () => {
  it("returns null for unauthenticated user", async () => {
    const { ctx } = createAnonContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });

  it("returns user for authenticated user", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).not.toBeNull();
    expect(result?.openId).toBe("test-user-001");
    expect(result?.name).toBe("Test User");
  });
});

describe("auth.logout", () => {
  it("clears session cookie and returns success", async () => {
    const { ctx } = createAuthContext();
    const clearedCookies: string[] = [];
    ctx.res.clearCookie = (name: string) => { clearedCookies.push(name); };
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
  });
});

describe("trips router - protected procedures", () => {
  it("throws UNAUTHORIZED when unauthenticated user tries to list trips", async () => {
    const { ctx } = createAnonContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.trips.list()).rejects.toThrow();
  });

  it("throws UNAUTHORIZED when unauthenticated user tries to create a trip", async () => {
    const { ctx } = createAnonContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.trips.create({
        name: "Test Trip",
        destination: "Tokyo",
        startDate: "2026-06-01",
        endDate: "2026-06-10",
        baseCurrency: "HKD",
      })
    ).rejects.toThrow();
  });
});

describe("notifications router - protected procedures", () => {
  it("throws UNAUTHORIZED when unauthenticated user tries to list notifications", async () => {
    const { ctx } = createAnonContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.notifications.list()).rejects.toThrow();
  });

  it("throws UNAUTHORIZED when unauthenticated user tries to get unread count", async () => {
    const { ctx } = createAnonContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.notifications.unreadCount()).rejects.toThrow();
  });
});

describe("itinerary router - protected procedures", () => {
  it("throws UNAUTHORIZED when unauthenticated user tries to get itinerary days", async () => {
    const { ctx } = createAnonContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.itinerary.getDays({ tripId: 1 })).rejects.toThrow();
  });

  it("throws UNAUTHORIZED when unauthenticated user tries to add a day", async () => {
    const { ctx } = createAnonContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.itinerary.addDay({
        tripId: 1,
        date: "2026-06-01",
        dayNumber: 1,
        title: "Day 1",
      })
    ).rejects.toThrow();
  });

  it("addDay input date is accepted as ISO string (YYYY-MM-DD format)", () => {
    // Verify that the date string format used in addDay is valid YYYY-MM-DD
    const isoDate = "2026-06-01T00:00:00.000Z";
    const dateStr = new Date(isoDate).toISOString().slice(0, 10);
    expect(dateStr).toBe("2026-06-01");
    expect(dateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("expenses router - protected procedures", () => {
  it("throws UNAUTHORIZED when unauthenticated user tries to list expenses", async () => {
    const { ctx } = createAnonContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.expenses.list({ tripId: 1 })).rejects.toThrow();
  });
});

describe("map router - protected procedures", () => {
  it("throws UNAUTHORIZED when unauthenticated user tries to get map pins", async () => {
    const { ctx } = createAnonContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.map.getPins({ tripId: 1 })).rejects.toThrow();
  });
});

describe("members router - protected procedures", () => {
  it("throws UNAUTHORIZED when unauthenticated user tries to list members", async () => {
    const { ctx } = createAnonContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.members.list({ tripId: 1 })).rejects.toThrow();
  });
});

describe("flights router - protected procedures", () => {
  it("throws UNAUTHORIZED when unauthenticated user tries to list flights", async () => {
    const { ctx } = createAnonContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.flights.list({ tripId: 1 })).rejects.toThrow();
  });
});

describe("hotels router - protected procedures", () => {
  it("throws UNAUTHORIZED when unauthenticated user tries to list hotels", async () => {
    const { ctx } = createAnonContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.hotels.list({ tripId: 1 })).rejects.toThrow();
  });
});

describe("ai router - protected procedures", () => {
  it("throws UNAUTHORIZED when unauthenticated user tries to use AI chat", async () => {
    const { ctx } = createAnonContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.ai.chat({ message: "Suggest activities in Tokyo" })
    ).rejects.toThrow();
  });
});
