import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
const state = vi.hoisted(() => ({ available: true }));
vi.mock("./db", () => ({
  getDb: vi.fn(async () => state.available ? {} : null),
  getUserTrips: vi.fn(async () => [{id:1},{id:1}]),
  getTripExpenses: vi.fn(async () => [{amount:"100",currency:"HKD",category:"food"},{amount:"400",currency:"TWD",category:"food"},{amount:"-10",currency:"HKD",category:"other"}]),
  getTripFlights: vi.fn(async () => []), getTripAccommodations: vi.fn(async () => []),
  getItineraryDays: vi.fn(async () => [{activities:[{id:1},{id:2}]}]), getMapPins: vi.fn(async () => []),
  getPastFlights: vi.fn(async () => []), getVisitedCountries: vi.fn(async () => []),
}));
import { appRouter } from "./routers";
const ctx = { user: {id:1,name:"QA",openId:"qa",role:"user"}, req:{headers:{}}, res:{} } as TrpcContext;
beforeEach(() => {state.available=true;});
describe("non-destructive data snapshot API", () => {
  it("deduplicates trips and counts real nested activities", async () => {
    const result = await appRouter.createCaller(ctx).sync.getSummary();
    expect(result.trips).toBe(1); expect(result.expenses).toBe(3); expect(result.activities).toBe(2);
  });
  it("returns separate original currency subtotals rather than a mixed grand total", async () => {
    const result = await appRouter.createCaller(ctx).sync.syncDataIntegrity();
    expect(result.expenseTotal).toBeNull(); expect(result.expenseCurrency).toBeNull();
    expect(result.expenseTotals).toEqual({HKD:90,TWD:400}); expect(result.totalActivities).toBe(2);
  });
  it("does not replace unavailable storage with zero records", async () => {
    state.available=false;
    await expect(appRouter.createCaller(ctx).sync.getSummary()).rejects.toMatchObject({code:"SERVICE_UNAVAILABLE"});
    await expect(appRouter.createCaller(ctx).sync.syncDataIntegrity()).rejects.toMatchObject({code:"SERVICE_UNAVAILABLE"});
  });
});
