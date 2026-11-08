import { beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
const state = vi.hoisted(() => ({ where: vi.fn(), set: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({
  drizzle: () => ({
    update: () => ({
      set: (v: unknown) => {
        state.set(v);
        return { where: async (v: unknown) => state.where(v) };
      },
    }),
  }),
}));
import { markNotificationRead } from "./db";
beforeEach(() => {
  process.env.DATABASE_URL ||= "mysql://qa";
  vi.clearAllMocks();
});
describe("notification persistence ownership", () => {
  it("builds an AND predicate with both record and owner, not record ID alone", async () => {
    await markNotificationRead(55, 7);
    const query = new MySqlDialect().sqlToQuery(state.where.mock.calls[0][0]);
    expect(query.sql).toContain(" and ");
    expect(query.sql).toContain("`notifications`.`userId`");
    expect(query.params).toEqual([55, 7]);
    expect(state.set).toHaveBeenCalledWith({ isRead: true });
  });
});
