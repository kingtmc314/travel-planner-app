import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  availableBudgetCurrencies,
  BUDGET_CURRENCIES,
  budgetAmountMinor,
  budgetConversionCandidates,
  buildBudgetSummary,
  isBudgetWarningPercent,
  isSupportedBudgetCurrency,
  normalizeBudgetAmount,
  type BudgetConfig,
  type BudgetConversion,
  type BudgetExpense,
} from "../shared/budget";
import type { TrpcContext } from "./_core/context";
import { tripBudgets } from "../drizzle/schema";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getTripById: vi.fn(),
  getTripExpenses: vi.fn(),
  getTripBudget: vi.fn(),
  setTripBudget: vi.fn(),
  clearTripBudget: vi.fn(),
  convertExpenseAmounts: vi.fn(),
}));
vi.mock("./db", () => ({
  getDb: mocks.getDb,
  getTripById: mocks.getTripById,
  getTripExpenses: mocks.getTripExpenses,
}));
vi.mock("./budgetPersistence", () => ({
  getTripBudget: mocks.getTripBudget,
  setTripBudget: mocks.setTripBudget,
  clearTripBudget: mocks.clearTripBudget,
}));
vi.mock("./currency_router", () => ({
  convertExpenseAmounts: mocks.convertExpenseAmounts,
}));
import { budgetRouter } from "./budgetRouter";

const config: BudgetConfig = {
  amount: "100.00",
  currency: "HKD",
  warningPercent: 80,
};
const row = (
  amount = "10.00",
  overrides: Partial<BudgetExpense> = {}
): BudgetExpense => ({
  id: 1,
  amount,
  currency: "HKD",
  date: "2026-11-08",
  ...overrides,
});
const converted = (
  id: number,
  convertedAmount: number,
  overrides: Partial<BudgetConversion> = {}
): BudgetConversion => ({
  id,
  convertedAmount,
  convertedCurrency: "HKD",
  isFallback: false,
  ...overrides,
});
const context = {
  user: { id: 7, openId: "budget-test", name: "Budget test", role: "user" },
  req: { headers: {} },
  res: {},
} as unknown as TrpcContext;
const trip = {
  id: 42,
  name: "Tokyo",
  baseCurrency: "HKD",
  userRole: "owner",
  startDate: "2026-11-08 00:00:00",
  endDate: "2026-11-10",
};
const caller = () => budgetRouter.createCaller(context);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getDb.mockResolvedValue({});
  mocks.getTripById.mockResolvedValue(trip);
  mocks.getTripExpenses.mockResolvedValue([]);
  mocks.getTripBudget.mockResolvedValue(config);
  mocks.setTripBudget.mockResolvedValue(undefined);
  mocks.clearTripBudget.mockResolvedValue(undefined);
  mocks.convertExpenseAmounts.mockImplementation(
    async (rows: BudgetExpense[]) =>
      rows.map(expense => converted(expense.id, Number(expense.amount) / 20))
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("budget decimal validation", () => {
  it.each([
    "0",
    "0.00",
    "-1",
    "+1",
    "1e2",
    "NaN",
    "Infinity",
    "1.001",
    "1.",
    ".1",
    "10000000000",
    "9999999999.991",
    "",
    " ",
    "1,000",
    "1 2",
  ])("rejects invalid budget %s", input => {
    expect(normalizeBudgetAmount(input)).toBeNull();
  });
  it.each([
    ["0.01", "0.01"],
    ["001.2", "1.20"],
    [" 100 ", "100.00"],
    ["9999999999.99", "9999999999.99"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeBudgetAmount(input)).toBe(expected);
  });
  it("accepts signed stored refunds but rejects unsafe, malformed and non-string amounts", () => {
    expect(budgetAmountMinor("-10.05", true)).toBe(-1005);
    expect(budgetAmountMinor("-10.05")).toBeNull();
    expect(budgetAmountMinor("9007199254740992", true)).toBeNull();
    expect(budgetAmountMinor(10, true)).toBeNull();
    expect(budgetAmountMinor("1e2", true)).toBeNull();
  });
  it("validates supported currency syntax and threshold bounds", () => {
    expect(isSupportedBudgetCurrency(" chf ")).toBe(true);
    expect(isSupportedBudgetCurrency("XXX")).toBe(false);
    expect(isSupportedBudgetCurrency("US$")).toBe(false);
    for (const value of [1, 80, 100])
      expect(isBudgetWarningPercent(value)).toBe(true);
    for (const value of [0, 101, 80.1, NaN, Infinity])
      expect(isBudgetWarningPercent(value)).toBe(false);
  });
  it("keeps the shared supported choices in parity with the existing converter", () => {
    const source = readFileSync(
      new URL("./currency_router.ts", import.meta.url),
      "utf8"
    );
    const setBody = source.match(
      /FRANKFURTER_SUPPORTED = new Set\(\[([\s\S]*?)\]\)/
    )![1];
    const accepted = Array.from(
      setBody.matchAll(/"([A-Z]{3})"/g),
      match => match[1]
    );
    expect(Array.from(BUDGET_CURRENCIES).sort()).toEqual(accepted.sort());
  });
});

describe("shared ledger budget arithmetic", () => {
  it.each([
    ["79.99", "safe"],
    ["80.00", "near"],
    ["99.99", "near"],
    ["100.00", "over"],
    ["100.01", "over"],
  ])("uses inclusive boundaries at %s", (amount, status) => {
    expect(buildBudgetSummary([row(amount)], "HKD", config).status).toBe(
      status
    );
  });
  it("compares fractional threshold boundaries exactly in cents", () => {
    const small = { ...config, amount: "0.10", warningPercent: 70 };
    expect(buildBudgetSummary([row("0.07")], "HKD", small).status).toBe("near");
    expect(buildBudgetSummary([row("0.06")], "HKD", small).status).toBe("safe");
  });
  it("100% is red even when the warning threshold is 100", () => {
    expect(
      buildBudgetSummary([row("100")], "HKD", {
        ...config,
        warningPercent: 100,
      }).status
    ).toBe("over");
    expect(
      buildBudgetSummary([row("99.99")], "HKD", {
        ...config,
        warningPercent: 100,
      }).status
    ).toBe("safe");
  });
  it("nets refunds once and ignores split/estimate properties instead of personalizing totals", () => {
    const rows = [
      { ...row("100"), paidBy: 999, splitAmong: [1, 2], cost: "999999" },
      row("-20.00", { id: 2 }),
      row("0.10", { id: 3 }),
      row("0.20", { id: 4 }),
    ];
    const result = buildBudgetSummary(rows, "HKD", config);
    expect(result).toMatchObject({
      spent: 80.3,
      knownSpent: 80.3,
      remaining: 19.7,
      status: "near",
      originalTotals: { HKD: 80.3 },
    });
  });
  it("same currency sums money despite invalid dates without requiring any FX", () => {
    const rows = [
      row("0.10", { date: "bad" }),
      row("0.20", { id: 2, date: "2026-02-30", currency: " hkd " }),
    ];
    expect(budgetConversionCandidates(rows, "HKD")).toEqual([]);
    expect(buildBudgetSummary(rows, "HKD", config)).toMatchObject({
      spent: 0.3,
      complete: true,
      unconvertedCount: 0,
      originalTotals: { HKD: 0.3 },
    });
  });
  it("empty ledger is real zero; absent config stays unset with no remaining", () => {
    expect(buildBudgetSummary([], "HKD", config)).toMatchObject({
      spent: 0,
      remaining: 100,
      status: "safe",
      complete: true,
      expenseCount: 0,
    });
    expect(buildBudgetSummary([], "HKD", null)).toMatchObject({
      spent: 0,
      remaining: null,
      utilization: null,
      status: "unset",
    });
  });
  it("negative net spend retains raw negative percent and larger remaining", () => {
    expect(buildBudgetSummary([row("-10")], "HKD", config)).toMatchObject({
      spent: -10,
      remaining: 110,
      utilization: -10,
      status: "safe",
    });
  });
  it("over-budget retains raw percent above 100 and negative remaining", () => {
    expect(buildBudgetSummary([row("150")], "HKD", config)).toMatchObject({
      utilization: 150,
      remaining: -50,
      status: "over",
    });
  });
  it("normalizes valid legacy HK SQL dates on copies and excludes invalid cross-currency rows", () => {
    const sql = row("20", { currency: "jpy", date: "2026-11-08 23:30:00" });
    const bad = row("20", { id: 2, currency: "JPY", date: "2026-02-30" });
    expect(budgetConversionCandidates([sql, bad], "HKD")).toEqual([
      { ...sql, currency: "JPY", date: "2026-11-08" },
    ]);
    expect(sql.date).toBe("2026-11-08 23:30:00");
    expect(
      buildBudgetSummary([bad], "HKD", config, new Map([[2, converted(2, 1)]]))
    ).toMatchObject({
      complete: false,
      status: "incomplete",
      spent: null,
      remaining: null,
      utilization: null,
      unconvertedCount: 1,
      originalTotals: { JPY: 20 },
    });
  });
  it("preserves unknown code subtotals but never treats them as safe or 1:1", () => {
    const rows = [
      row("20"),
      row("9.99", { id: 2, currency: "XXX" }),
      row("3", { id: 3, currency: "USDT" }),
      row("4", { id: 4, currency: "" }),
    ];
    expect(buildBudgetSummary(rows, "HKD", config)).toMatchObject({
      knownSpent: 20,
      spent: null,
      complete: false,
      unconvertedCount: 3,
      remaining: null,
      utilization: null,
      status: "incomplete",
      originalTotals: { HKD: 20, XXX: 9.99, USDT: 3, UNKNOWN: 4 },
    });
    expect(
      buildBudgetSummary([row("20", { currency: "XXX" })], "XXX", {
        ...config,
        currency: "XXX",
      }).status
    ).toBe("incomplete");
  });
  it("accepts truthful historical cross FX including refunds and rejects fallback amounts", () => {
    const rows = [
      row("200", { currency: "JPY" }),
      row("-20", { id: 2, currency: "JPY" }),
      row("10", { id: 3 }),
    ];
    const conversions = new Map([
      [1, converted(1, 10)],
      [2, converted(2, -1)],
    ]);
    expect(buildBudgetSummary(rows, "HKD", config, conversions)).toMatchObject({
      spent: 19,
      remaining: 81,
      complete: true,
      originalTotals: { JPY: 180, HKD: 10 },
    });
    conversions.set(1, converted(1, 10, { isFallback: true }));
    expect(buildBudgetSummary(rows, "HKD", config, conversions)).toMatchObject({
      knownSpent: 9,
      spent: null,
      remaining: null,
      utilization: null,
      complete: false,
      status: "incomplete",
      unconvertedCount: 1,
    });
  });
  it.each([
    converted(1, NaN),
    converted(1, Infinity),
    converted(1, 10, { convertedCurrency: "JPY" }),
    converted(99, 10),
    converted(1, -10),
  ])("rejects invalid conversion metadata %j", conversion => {
    expect(
      buildBudgetSummary(
        [row("200", { currency: "JPY" })],
        "HKD",
        config,
        new Map([[1, conversion]])
      )
    ).toMatchObject({ knownSpent: 0, complete: false, unconvertedCount: 1 });
  });
  it("partial known total can flag over, but never claims remaining or complete utilization", () => {
    const result = buildBudgetSummary(
      [row("100"), row("-999", { id: 2, currency: "XXX" })],
      "HKD",
      config
    );
    expect(result).toMatchObject({
      status: "over",
      knownSpent: 100,
      spent: null,
      utilization: null,
      remaining: null,
      complete: false,
      unconvertedCount: 1,
    });
  });
  it("invalid ledger amounts do not become zero or erase valid subtotals", () => {
    expect(
      buildBudgetSummary([row("25"), row("NaN", { id: 2 })], "HKD", config)
    ).toMatchObject({
      knownSpent: 25,
      status: "incomplete",
      originalTotals: { HKD: 25 },
      expenseCount: 2,
      unconvertedCount: 1,
    });
  });
  it("invalid persisted config is incomplete and does not throw on a malformed threshold", () => {
    expect(
      buildBudgetSummary([], "HKD", { ...config, amount: "0" }).status
    ).toBe("incomplete");
    expect(
      buildBudgetSummary([], "HKD", { ...config, warningPercent: NaN }).status
    ).toBe("incomplete");
  });
  it("includes current, base and legacy original codes in dynamic currency choices", () => {
    const choices = availableBudgetCurrencies(
      " chf ",
      { ...config, currency: "SAR" },
      { USDT: 1, XXX: 2, HKD: 3 }
    );
    expect(choices).toEqual(
      expect.arrayContaining(["CHF", "SAR", "USDT", "XXX", "HKD"])
    );
    expect(choices.filter(code => code === "HKD")).toHaveLength(1);
  });
});

describe("budget API permission and isolated historical conversion", () => {
  it("rejects anonymous callers before any source lookup", async () => {
    await expect(
      budgetRouter.createCaller({ ...context, user: null }).get({ tripId: 42 })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.getTripById).not.toHaveBeenCalled();
    expect(mocks.getTripBudget).not.toHaveBeenCalled();
  });
  it.each(["get", "set", "clear"] as const)(
    "outsider %s leaks no budget or expense source",
    async method => {
      mocks.getTripById.mockResolvedValue(null);
      const input = { tripId: 42, ...config };
      await expect(caller()[method](input)).rejects.toMatchObject({
        code: "FORBIDDEN",
        message: "This trip is not available to you.",
      });
      expect(mocks.getTripById).toHaveBeenCalledWith(42, 7);
      expect(mocks.getTripBudget).not.toHaveBeenCalled();
      expect(mocks.getTripExpenses).not.toHaveBeenCalled();
      expect(mocks.setTripBudget).not.toHaveBeenCalled();
      expect(mocks.clearTripBudget).not.toHaveBeenCalled();
    }
  );
  it("viewers can read but cannot set or clear", async () => {
    mocks.getTripById.mockResolvedValue({ ...trip, userRole: "viewer" });
    expect(await caller().get({ tripId: 42 })).toMatchObject({
      tripId: 42,
      tripName: "Tokyo",
      baseCurrency: "HKD",
      canEdit: false,
      budget: config,
    });
    await expect(caller().set({ tripId: 42, ...config })).rejects.toMatchObject(
      { code: "FORBIDDEN" }
    );
    await expect(caller().clear({ tripId: 42 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocks.setTripBudget).not.toHaveBeenCalled();
    expect(mocks.clearTripBudget).not.toHaveBeenCalled();
  });
  it.each(["owner", "editor"])(
    "%s can durably set a normalized budget and clear only its config",
    async role => {
      mocks.getTripById.mockResolvedValue({ ...trip, userRole: role });
      expect(
        await caller().set({
          tripId: 42,
          amount: " 00100.5 ",
          currency: " chf ",
          warningPercent: 100,
        })
      ).toEqual({ success: true });
      expect(mocks.setTripBudget).toHaveBeenCalledWith(
        42,
        { amount: "100.50", currency: "CHF", warningPercent: 100 },
        7
      );
      expect(await caller().clear({ tripId: 42 })).toEqual({ success: true });
      expect(mocks.clearTripBudget).toHaveBeenCalledWith(42);
      expect(mocks.getTripExpenses).not.toHaveBeenCalled();
    }
  );
  it.each([
    { amount: "0" },
    { amount: "10000000000" },
    { amount: "1.001" },
    { amount: "1e3" },
    { currency: "XXX" },
    { currency: "USDT" },
    { warningPercent: 0 },
    { warningPercent: 101 },
    { warningPercent: 80.5 },
  ])(
    "rejects bad set input %j before any persistence write",
    async override => {
      await expect(
        caller().set({ tripId: 42, ...config, ...override })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(mocks.setTripBudget).not.toHaveBeenCalled();
    }
  );
  it("storage outage is unavailable, not a fabricated unset/zero budget", async () => {
    mocks.getDb.mockResolvedValue(null);
    await expect(caller().get({ tripId: 42 })).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
    });
    expect(mocks.getTripById).not.toHaveBeenCalled();
    expect(mocks.getTripBudget).not.toHaveBeenCalled();
  });
  it("propagates persistence read/write errors instead of pretending a successful save", async () => {
    mocks.getTripBudget.mockRejectedValue(new Error("Missing budget table"));
    await expect(caller().get({ tripId: 42 })).rejects.toThrow(
      "Missing budget table"
    );
    mocks.setTripBudget.mockRejectedValue(new Error("Write unavailable"));
    await expect(caller().set({ tripId: 42, ...config })).rejects.toThrow(
      "Write unavailable"
    );
    mocks.clearTripBudget.mockRejectedValue(new Error("Delete unavailable"));
    await expect(caller().clear({ tripId: 42 })).rejects.toThrow(
      "Delete unavailable"
    );
  });
  it("returns unset with base-currency ledger totals when no budget is stored", async () => {
    mocks.getTripBudget.mockResolvedValue(null);
    mocks.getTripExpenses.mockResolvedValue([row("20")]);
    expect(await caller().get({ tripId: 42 })).toMatchObject({
      budget: null,
      canEdit: true,
      summary: { status: "unset", spent: 20, remaining: null, expenseCount: 1 },
    });
  });
  it("does not fetch FX until a budget exists; keeps original mixed-currency subtotals", async () => {
    mocks.getTripBudget.mockResolvedValue(null);
    mocks.getTripExpenses.mockResolvedValue([
      row("20"),
      row("200", { id: 2, currency: "JPY" }),
    ]);
    expect(await caller().get({ tripId: 42 })).toMatchObject({
      budget: null,
      summary: {
        status: "unset",
        spent: null,
        knownSpent: 20,
        remaining: null,
        complete: false,
        unconvertedCount: 1,
        originalTotals: { HKD: 20, JPY: 200 },
      },
    });
    expect(mocks.convertExpenseAmounts).not.toHaveBeenCalled();
  });
  it("FX uses each expense's HK date and allows refunds; same currency bypasses date checking", async () => {
    mocks.getTripExpenses.mockResolvedValue([
      row("20", { date: "invalid" }),
      row("200", { id: 2, currency: "JPY", date: "2026-11-08 23:30:00" }),
      row("-20", { id: 3, currency: "JPY", date: "2026-11-09" }),
    ]);
    const result = await caller().get({ tripId: 42 });
    expect(result.summary).toMatchObject({
      spent: 29,
      complete: true,
      originalTotals: { HKD: 20, JPY: 180 },
    });
    expect(mocks.convertExpenseAmounts).toHaveBeenCalledTimes(2);
    expect(mocks.convertExpenseAmounts).toHaveBeenCalledWith(
      [row("200", { id: 2, currency: "JPY", date: "2026-11-08" })],
      "HKD",
      { allowRefunds: true }
    );
    expect(mocks.convertExpenseAmounts).toHaveBeenCalledWith(
      [row("-20", { id: 3, currency: "JPY", date: "2026-11-09" })],
      "HKD",
      { allowRefunds: true }
    );
  });
  it("unknown, invalid, failed and fallback rows do not poison usable FX or produce safe status", async () => {
    mocks.getTripExpenses.mockResolvedValue([
      row("20"),
      row("200", { id: 2, currency: "JPY" }),
      row("200", { id: 3, currency: "JPY" }),
      row("200", { id: 4, currency: "JPY" }),
      row("1", { id: 5, currency: "XXX" }),
      row("1", { id: 6, currency: "USD", date: "bad" }),
    ]);
    mocks.convertExpenseAmounts.mockImplementation(
      async ([expense]: BudgetExpense[]) => {
        if (expense.id === 3) throw new Error("No quote available");
        return [converted(expense.id, 10, { isFallback: expense.id === 4 })];
      }
    );
    const result = await caller().get({ tripId: 42 });
    expect(result.summary).toMatchObject({
      knownSpent: 30,
      spent: null,
      remaining: null,
      utilization: null,
      status: "incomplete",
      unconvertedCount: 4,
      originalTotals: { HKD: 20, JPY: 600, XXX: 1, USD: 1 },
    });
    expect(mocks.convertExpenseAmounts).toHaveBeenCalledTimes(3);
  });
  it("bounds conversion worker concurrency to four", async () => {
    let active = 0;
    let peak = 0;
    mocks.getTripExpenses.mockResolvedValue(
      Array.from({ length: 13 }, (_, index) =>
        row("20", { id: index + 1, currency: "JPY" })
      )
    );
    mocks.convertExpenseAmounts.mockImplementation(
      async ([expense]: BudgetExpense[]) => {
        active++;
        peak = Math.max(active, peak);
        await new Promise(resolve => setTimeout(resolve, 2));
        active--;
        return [converted(expense.id, 1)];
      }
    );
    expect((await caller().get({ tripId: 42 })).summary.spent).toBe(13);
    expect(peak).toBe(4);
  });
});

describe("isolated durable budget persistence (mock database only)", () => {
  it("reads only config columns for one trip with an explicit limit", async () => {
    const from = vi.fn();
    const where = vi.fn();
    const limit = vi.fn().mockResolvedValue([config]);
    const query = { from, where, limit };
    from.mockReturnValue(query);
    where.mockReturnValue(query);
    const select = vi.fn().mockReturnValue(query);
    mocks.getDb.mockResolvedValue({ select });
    const persistence = await vi.importActual<
      typeof import("./budgetPersistence")
    >("./budgetPersistence");
    expect(await persistence.getTripBudget(42)).toEqual(config);
    expect(select).toHaveBeenCalledWith({
      amount: tripBudgets.amount,
      currency: tripBudgets.currency,
      warningPercent: tripBudgets.warningPercent,
    });
    expect(from).toHaveBeenCalledWith(tripBudgets);
    expect(where).toHaveBeenCalledOnce();
    expect(limit).toHaveBeenCalledWith(1);
  });
  it("returns null when no config exists", async () => {
    const query: any = {
      from: () => query,
      where: () => query,
      limit: async () => [],
    };
    mocks.getDb.mockResolvedValue({ select: () => query });
    const persistence = await vi.importActual<
      typeof import("./budgetPersistence")
    >("./budgetPersistence");
    expect(await persistence.getTripBudget(42)).toBeNull();
  });
  it("uses the primary key atomic upsert to persist the shared trip config", async () => {
    const onDuplicateKeyUpdate = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn().mockReturnValue({ onDuplicateKeyUpdate });
    const insert = vi.fn().mockReturnValue({ values });
    mocks.getDb.mockResolvedValue({ insert });
    const persistence = await vi.importActual<
      typeof import("./budgetPersistence")
    >("./budgetPersistence");
    await persistence.setTripBudget(42, config, 7);
    expect(insert).toHaveBeenCalledWith(tripBudgets);
    expect(values).toHaveBeenCalledWith({
      tripId: 42,
      ...config,
      updatedBy: 7,
    });
    expect(onDuplicateKeyUpdate).toHaveBeenCalledWith({
      set: { ...config, updatedBy: 7 },
    });
  });
  it("clear issues a scoped delete against trip_budgets only", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const remove = vi.fn().mockReturnValue({ where });
    mocks.getDb.mockResolvedValue({ delete: remove });
    const persistence = await vi.importActual<
      typeof import("./budgetPersistence")
    >("./budgetPersistence");
    await persistence.clearTripBudget(42);
    expect(remove).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith(tripBudgets);
    expect(where).toHaveBeenCalledOnce();
  });
  it("all persistence operations reject unavailable storage", async () => {
    mocks.getDb.mockResolvedValue(null);
    const persistence = await vi.importActual<
      typeof import("./budgetPersistence")
    >("./budgetPersistence");
    await expect(persistence.getTripBudget(42)).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
    });
    await expect(
      persistence.setTripBudget(42, config, 7)
    ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    await expect(persistence.clearTripBudget(42)).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
    });
  });
  it("migration is additive MySQL/TiDB, one PK config, no FKs or data writes", () => {
    const sql = readFileSync(
      new URL("../drizzle/migrations/0002_trip_budgets.sql", import.meta.url),
      "utf8"
    );
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS `trip_budgets`/);
    expect(sql).toMatch(/DECIMAL\(12,2\)/);
    expect(sql).toMatch(/PRIMARY KEY \(`tripId`\)/);
    expect(sql).toMatch(/ON UPDATE CURRENT_TIMESTAMP/);
    expect(sql).not.toMatch(
      /\b(?:ALTER|INSERT|UPDATE\s+`|DELETE|DROP|FOREIGN KEY)\b/i
    );
  });
});

describe("budget panel accessibility and cache contract", () => {
  it("uses server-backed budgets, bilingual status labels, safe progress bounds and global invalidation", () => {
    const source = readFileSync(
      new URL("../client/src/components/TripBudgetPanel.tsx", import.meta.url),
      "utf8"
    );
    expect(source).toContain("useI18n");
    expect(source).toContain("trpc.budgets.get.useQuery");
    expect(source).toContain("await utils.invalidate()");
    expect(source).toContain("refetchOnWindowFocus: true");
    expect(source).not.toContain("refetchInterval");
    expect(source).toContain('role="progressbar"');
    expect(source).toContain("aria-valuemin={0}");
    expect(source).toContain("aria-valuemax={100}");
    expect(source).toContain("Math.max(0, Math.min(100, rawPercent))");
    expect(source).toContain("aria-valuetext");
    expect(source).toContain("data.canEdit");
    expect(source).not.toContain("localStorage");
    expect(source).toContain("bg-emerald-500");
    expect(source).toContain("bg-red-500");
    expect(source).toContain("bg-amber-500");
  });
});
