import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>>, insert: vi.fn(), update: vi.fn(), selected: vi.fn(), patch: {} as Record<string, unknown> }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: () => ({
  select: () => { const query: any = { from: () => query, where: () => query, orderBy: () => query, limit: async () => { mock.selected(); return mock.rows.map(row => ({id:row.id})).slice(0,1); } }; return query; },
  insert: () => ({ values: async (data: Record<string, unknown>) => { mock.insert(data); mock.rows.push({id:mock.rows.length+1,...data}); } }),
  update: () => ({ set: (data: Record<string, unknown>) => ({ where: async () => { mock.update(data); Object.assign(mock.rows[0],data); } }) }),
}) }));
import { upsertVisitedCountry } from "./db";

beforeEach(() => { process.env.DATABASE_URL ||= "mysql://qa"; mock.rows=[]; mock.insert.mockClear(); mock.update.mockClear(); mock.selected.mockClear(); });
describe("legacy country persistence without a unique constraint", () => {
  it("updates an existing row without creating or deleting a row", async () => {
    mock.rows=[{id:1,countryCode:"TW",notes:"keep",status:"planned"}];
    await upsertVisitedCountry({userId:1,countryCode:"TW",countryName:"Taiwan",status:"visited"});
    expect(mock.insert).not.toHaveBeenCalled();
    expect(mock.rows).toHaveLength(1);
    expect(mock.rows[0]).toMatchObject({notes:"keep",status:"visited"});
    expect(mock.update).toHaveBeenCalledWith({status:"visited"});
  });
  it("serializes repeated writes without requiring a schema migration", async () => {
    await Promise.all([upsertVisitedCountry({userId:1,countryCode:"TW",countryName:"Taiwan",status:"visited"}),upsertVisitedCountry({userId:1,countryCode:"TW",countryName:"Taiwan",status:"visited"})]);
    expect(mock.insert).toHaveBeenCalledTimes(1);
    expect(mock.update).toHaveBeenCalledTimes(1);
    expect(mock.rows).toHaveLength(1);
  });
});
