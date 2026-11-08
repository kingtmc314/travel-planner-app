import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const db = vi.hoisted(() => ({
  getUserMembership: vi.fn(),
  getTripExpenses: vi.fn(),
  getTripMembers: vi.fn(),
}));
vi.mock("./db", () => db);

const fetchMock = vi.fn();
const context = {
  user: {
    id: 1,
    openId: "currency-test",
    name: "Alice",
    email: null,
    loginMethod: "test",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  },
  req: { protocol: "https", headers: {} },
  res: { clearCookie: vi.fn() },
} as unknown as TrpcContext;
const expense = { id: 1, amount: "100", currency: "JPY", date: "2026-06-19" };
const quotes = [
  "JPY",
  "TWD",
  "EGP",
  "USD",
  "EUR",
  "CNY",
  "SGD",
  "GBP",
  "AUD",
  "CAD",
  "KRW",
  "THB",
  "MYR",
  "IDR",
  "PHP",
  "VND",
];
function response(rows: unknown) {
  return { ok: true, json: async () => rows } as Response;
}
function row(
  quote = "JPY",
  rate: unknown = 20,
  date = expense.date,
  base = "HKD"
) {
  return { quote, rate, date, base };
}
async function currency() {
  return import("./currency_router");
}
async function currencyCaller() {
  return (await currency()).currencyRouter.createCaller(context);
}
async function splitCaller() {
  const { appRouter } = await import("./routers");
  return appRouter.createCaller(context);
}
function storedExpense(overrides: Record<string, unknown> = {}) {
  return {
    ...expense,
    tripId: 42,
    title: "Dinner",
    paidBy: 1,
    splitAmong: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetModules();
  fetchMock
    .mockReset()
    .mockRejectedValue(new Error("Mocked rate service outage"));
  vi.stubGlobal("fetch", fetchMock);
  db.getUserMembership.mockReset().mockResolvedValue({ id: 1, role: "owner" });
  db.getTripExpenses.mockReset().mockResolvedValue([]);
  db.getTripMembers.mockReset().mockResolvedValue([
    { member: { userId: 1, displayName: "Alice" }, user: null },
    { member: { userId: 2, displayName: "Bob" }, user: null },
  ]);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("historical currency rates", () => {
  it("rejects an unknown currency instead of silently returning 1:1", async () => {
    await expect(
      (await currency()).getHistoricalRate(expense.date, "XXX")
    ).rejects.toThrow(/no supported fallback/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses an explicitly labelled approximation for a known fallback currency", async () => {
    const { getHistoricalRate } = await currency();
    const first = await getHistoricalRate(expense.date, "JPY");
    expect(first).toEqual({
      rate: 19.8,
      rateDate: expense.date,
      isFallback: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(await getHistoricalRate(expense.date, "JPY")).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("fails for API-supported currencies without an available fallback", async () => {
    await expect(
      (await currency()).getHistoricalRate(expense.date, "CHF")
    ).rejects.toThrow(/unavailable.*no supported fallback/i);
  });

  it("preserves the actual weekend/holiday rate date in both cache keys", async () => {
    fetchMock.mockResolvedValue(response([row("JPY", 20, "2026-06-19")]));
    const { getHistoricalRate } = await currency();
    const first = await getHistoricalRate("2026-06-21", "JPY");
    expect(first).toEqual({
      rate: 20,
      rateDate: "2026-06-19",
      isFallback: false,
    });
    expect(await getHistoricalRate("2026-06-21", "JPY")).toEqual(first);
    expect(await getHistoricalRate("2026-06-19", "JPY")).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("caches a previous-day retry under the requested day with truthful metadata", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("outage"))
      .mockResolvedValue(response([row("JPY", 21, "2026-06-18")]));
    const { getHistoricalRate } = await currency();
    const first = await getHistoricalRate("2026-06-19", "JPY");
    expect(first).toEqual({
      rate: 21,
      rateDate: "2026-06-18",
      isFallback: false,
    });
    expect(await getHistoricalRate("2026-06-19", "JPY")).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, "20"])(
    "does not trust invalid API rate %s",
    async invalidRate => {
      fetchMock.mockResolvedValue(response([row("JPY", invalidRate)]));
      const rate = await (
        await currency()
      ).getHistoricalRate(expense.date, "JPY");
      expect(rate.rate).toBe(19.8);
      expect(rate.isFallback).toBe(true);
    }
  );

  it.each([
    row("USD", 20),
    row("JPY", 20, expense.date, "USD"),
    row("JPY", 20, "2026-02-30"),
    row("JPY", 20, "2026-06-20"),
  ])("does not use a mismatched or invalid response row", async badRow => {
    fetchMock.mockResolvedValue(response([badRow]));
    expect(
      (await (await currency()).getHistoricalRate(expense.date, "JPY"))
        .isFallback
    ).toBe(true);
  });

  it("deduplicates concurrent historical requests", async () => {
    fetchMock.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 2));
      return response([row()]);
    });
    const { getHistoricalRate } = await currency();
    const rates = await Promise.all(
      Array.from({ length: 30 }, () => getHistoricalRate(expense.date, "JPY"))
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(rates.every(rate => rate.rate === 20)).toBe(true);
  });

  it("bounds HTTP concurrency across independent callers", async () => {
    let active = 0;
    let peak = 0;
    fetchMock.mockImplementation(async (url: string) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 2));
      active--;
      const parsed = new URL(url);
      return response([row("JPY", 20, parsed.searchParams.get("date")!)]);
    });
    const { getHistoricalRate } = await currency();
    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        getHistoricalRate(
          `2026-06-${String(index + 1).padStart(2, "0")}`,
          "JPY"
        )
      )
    );
    expect(fetchMock).toHaveBeenCalledTimes(20);
    expect(peak).toBeLessThanOrEqual(6);
  });
});

describe("latest rates and rebasing", () => {
  it("keeps isFallback true on the latest-rates cache hit", async () => {
    const { getLatestRates } = await currency();
    const first = await getLatestRates();
    expect(first).toMatchObject({ isFallback: true, rateDate: null });
    expect(await getLatestRates()).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rebases the values rather than just relabelling HKD rates", async () => {
    fetchMock.mockResolvedValue(
      response(quotes.map(quote => row(quote, quote === "USD" ? 0.125 : 20)))
    );
    const caller = await currencyCaller();
    const result = await caller.getRates({ base: "usd" });
    expect(result.base).toBe("USD");
    expect(result.rates.USD).toBe(1);
    expect(result.rates.HKD).toBe(8);
    expect(result.rates.JPY).toBe(160);
    expect(result.isFallback).toBe(false);
    const hkd = await caller.getRates({ base: "HKD" });
    expect(hkd.rates.USD).toBe(0.125);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("correctly rebases approximate fallback values", async () => {
    const result = await (await currencyCaller()).getRates({ base: "USD" });
    expect(result.rates.USD).toBe(1);
    expect(result.rates.HKD).toBeCloseTo(1 / 0.128);
    expect(result.rates.JPY).toBeCloseTo(19.8 / 0.128);
    expect(result.isFallback).toBe(true);
  });

  it("fetches an additional live base on the latest table's actual trading day", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const parsed = new URL(url);
      if (parsed.searchParams.get("quotes") === "CHF") {
        expect(parsed.searchParams.get("date")).toBe(expense.date);
        return response([row("CHF", 0.1)]);
      }
      return response(
        quotes.map(quote => row(quote, quote === "USD" ? 0.125 : 20))
      );
    });
    const result = await (await currencyCaller()).getRates({ base: "CHF" });
    expect(result.rates.CHF).toBe(1);
    expect(result.rates.HKD).toBe(10);
    expect(result.rates.USD).toBe(1.25);
    expect(result.isFallback).toBe(false);
  });

  it("rejects unknown bases and unavailable base rates", async () => {
    const caller = await currencyCaller();
    await expect(caller.getRates({ base: "XXX" })).rejects.toThrow(
      /no supported fallback/i
    );
    await expect(caller.getRates({ base: "CHF" })).rejects.toThrow(
      /no supported fallback/i
    );
  });

  it.each([
    [],
    [row("USD", 0.125)],
    [row("USD", -1)],
    [row("USD", Number.NaN)],
  ])("rejects empty, incomplete or invalid latest responses", async rows => {
    fetchMock.mockResolvedValue(response(rows));
    expect((await (await currency()).getLatestRates()).isFallback).toBe(true);
  });
});

describe("expense conversion input and results", () => {
  it.each([
    "NaN",
    "Infinity",
    "-1",
    "",
    "  ",
    "12abc",
    "1,000",
    "0x10",
    "1e309",
  ])("rejects invalid or negative amount %s before fetching", async amount => {
    const caller = await currencyCaller();
    await expect(
      caller.convertExpenses({
        targetCurrency: "HKD",
        expenses: [{ ...expense, amount }],
      })
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    "2026-02-30",
    "2025-02-29",
    "2026-13-01",
    "0000-01-01",
    "2026-6-19",
    "2026-06-19T00:00:00+08:00",
    "2026-06-19 00:00:00",
    "2026-06-19 23:59:59.123456",
    "not-a-date",
  ])("rejects invalid or timestamp date %s", async date => {
    await expect(
      (await currencyCaller()).convertExpenses({
        targetCurrency: "HKD",
        expenses: [{ ...expense, date }],
      })
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts a real leap day and zero without any conversion fetch", async () => {
    const result = await (
      await currencyCaller()
    ).convertExpenses({
      targetCurrency: "HKD",
      expenses: [
        { ...expense, amount: "0", currency: "HKD", date: "2024-02-29" },
      ],
    });
    expect(result.results[0]).toMatchObject({
      convertedAmount: 0,
      rateDate: "2024-02-29",
      isFallback: false,
      isIdentical: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the Hong Kong payment calendar day unchanged", async () => {
    fetchMock.mockResolvedValue(response([row("JPY", 20, "2026-01-01")]));
    const result = await (
      await currencyCaller()
    ).convertExpenses({
      targetCurrency: "HKD",
      expenses: [{ ...expense, date: "2026-01-01" }],
    });
    expect(result.results[0]).toMatchObject({
      rateDate: "2026-01-01",
      convertedAmount: 5,
    });
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get("date")).toBe(
      "2026-01-01"
    );
  });

  it("converts each expense with its own historical rate and deduplicates identical days", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const date = new URL(url).searchParams.get("date")!;
      return response([row("JPY", date === "2026-06-19" ? 20 : 10, date)]);
    });
    const result = await (
      await currencyCaller()
    ).convertExpenses({
      targetCurrency: "HKD",
      expenses: [
        expense,
        { ...expense, id: 2, date: "2026-06-20" },
        { ...expense, id: 3 },
      ],
    });
    expect(result.results.map(result => result.convertedAmount)).toEqual([
      5, 10, 5,
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("provides separate source/target dates and a warning flag for earlier trading days", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const quote = new URL(url).searchParams.get("quotes")!;
      return response([
        row(
          quote,
          quote === "JPY" ? 20 : 0.125,
          quote === "JPY" ? "2026-06-18" : "2026-06-19"
        ),
      ]);
    });
    const result = await (
      await currencyCaller()
    ).convertExpenses({ targetCurrency: "USD", expenses: [expense] });
    expect(result.results[0]).toMatchObject({
      convertedAmount: 0.63,
      fromRateDate: "2026-06-18",
      toRateDate: "2026-06-19",
      rateDate: "2026-06-18",
      isFallback: false,
      isEstimated: true,
    });
  });

  it("never returns an unconverted amount labelled as target on failure", async () => {
    const caller = await currencyCaller();
    await expect(
      caller.convertExpenses({
        targetCurrency: "HKD",
        expenses: [{ ...expense, currency: "CHF" }],
      })
    ).rejects.toThrow(/unavailable/i);
    await expect(
      caller.convertExpenses({
        targetCurrency: "HKD",
        expenses: [{ ...expense, currency: "XXX" }],
      })
    ).rejects.toThrow(/unsupported/i);
  });

  it("labels known-currency fallback conversions as estimated", async () => {
    const result = await (
      await currencyCaller()
    ).convertExpenses({ targetCurrency: "HKD", expenses: [expense] });
    expect(result.results[0]).toMatchObject({
      convertedCurrency: "HKD",
      convertedAmount: 5.05,
      isFallback: true,
      isEstimated: true,
    });
  });

  it("rejects overflow instead of returning infinite converted totals", async () => {
    fetchMock.mockResolvedValue(response([row("JPY", Number.MIN_VALUE)]));
    await expect(
      (await currencyCaller()).convertExpenses({
        targetCurrency: "HKD",
        expenses: [expense],
      })
    ).rejects.toThrow(/supported amount range/i);
  });

  it("caps a client conversion batch at 1000 expenses", async () => {
    const caller = await currencyCaller();
    await expect(
      caller.convertExpenses({
        targetCurrency: "HKD",
        expenses: Array.from({ length: 1001 }, (_, id) => ({
          ...expense,
          id,
          currency: "HKD",
        })),
      })
    ).rejects.toThrow();
    const result = await caller.convertExpenses({
      targetCurrency: "HKD",
      expenses: Array.from({ length: 1000 }, (_, id) => ({
        ...expense,
        id,
        currency: "HKD",
      })),
    });
    expect(result.results).toHaveLength(1000);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("stored expense calendar date conversion", () => {
  it("normalizes date-only and known SQL values before historical lookup without changing stored rows", async () => {
    const stored = [
      { ...expense, date: "2026-06-19 00:00:00" },
      { ...expense, id: 2, date: "2026-06-19 23:59:59.123456" },
      { ...expense, id: 3, date: "2026-06-20" },
    ];
    const original = structuredClone(stored);
    fetchMock.mockImplementation(async (url: string) => {
      const date = new URL(url).searchParams.get("date")!;
      return response([row("JPY", date === "2026-06-19" ? 20 : 10, date)]);
    });
    const results = await (
      await currency()
    ).convertExpenseAmounts(stored, "HKD");
    expect(results.map(result => result.convertedAmount)).toEqual([5, 5, 10]);
    expect(results.map(result => result.rateDate)).toEqual([
      "2026-06-19",
      "2026-06-19",
      "2026-06-20",
    ]);
    expect(
      results.every(result => !result.isEstimated && !result.isFallback)
    ).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      fetchMock.mock.calls
        .map(([url]) => new URL(url).searchParams.get("date"))
        .sort()
    ).toEqual(["2026-06-19", "2026-06-20"]);
    expect(stored).toEqual(original);
  });

  it("normalizes same-currency stored refunds without rate requests", async () => {
    const stored = [
      {
        ...expense,
        amount: "-20.00",
        currency: "HKD",
        date: "2024-02-29 23:59:59.1",
      },
    ];
    const original = structuredClone(stored);
    const results = await (
      await currency()
    ).convertExpenseAmounts(stored, "HKD", { allowRefunds: true });
    expect(results[0]).toMatchObject({
      convertedAmount: -20,
      rateDate: "2024-02-29",
      fromRateDate: "2024-02-29",
      toRateDate: "2024-02-29",
      isEstimated: false,
      isIdentical: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(stored).toEqual(original);
  });

  it.each([
    "2026-02-29 00:00:00",
    "2026-06-19 24:00:00",
    "2026-06-19 00:60:00",
    "2026-06-19 00:00:60",
    "2026-06-19 00:00:00 suffix",
    "2026-06-19 00:00:00Z",
    "2026-06-19T00:00:00+08:00",
  ])(
    "rejects invalid or ambiguous stored date %s for the entire batch before fetching",
    async date => {
      await expect(
        (await currency()).convertExpenseAmounts(
          [expense, { ...expense, id: 2, date }],
          "HKD"
        )
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );
});

describe("split-summary historical conversion (mocked database only)", () => {
  it("uses the payment date of every expense in balances, settlements and totals", async () => {
    db.getTripExpenses.mockResolvedValue([
      storedExpense(),
      storedExpense({ id: 2, date: "2026-06-20" }),
    ]);
    fetchMock.mockImplementation(async (url: string) => {
      const date = new URL(url).searchParams.get("date")!;
      return response([row("JPY", date === "2026-06-19" ? 20 : 10, date)]);
    });
    const result = await (
      await splitCaller()
    ).expenses.getSplitSummary({ tripId: 42, baseCurrency: "HKD" });
    expect(result.totalExpenses).toBe(15);
    expect(result.members.find(member => member.userId === 1)).toMatchObject({
      net: 7.5,
      paidTotal: 15,
      owedTotal: 7.5,
    });
    expect(result.members.find(member => member.userId === 2)).toMatchObject({
      net: -7.5,
    });
    expect(result.settlements).toEqual([
      { from: "Bob", fromId: 2, to: "Alice", toId: 1, amount: 7.5 },
    ]);
    expect(result.isFallback).toBe(false);
    expect(result.rateMetadata.map(metadata => metadata.rateDate)).toEqual([
      "2026-06-19",
      "2026-06-20",
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reads legacy SQL payment dates as HK calendar dates without rewriting database records", async () => {
    const stored = [
      storedExpense({ date: "2026-06-19 23:59:59.123456" }),
      storedExpense({ id: 2, date: "2026-06-20 00:00:00" }),
    ];
    const original = structuredClone(stored);
    db.getTripExpenses.mockResolvedValue(stored);
    fetchMock.mockImplementation(async (url: string) => {
      const date = new URL(url).searchParams.get("date")!;
      return response([row("JPY", date === "2026-06-19" ? 20 : 10, date)]);
    });
    const result = await (
      await splitCaller()
    ).expenses.getSplitSummary({ tripId: 42, baseCurrency: "HKD" });
    expect(result.totalExpenses).toBe(15);
    expect(result.rateMetadata.map(metadata => metadata.rateDate)).toEqual([
      "2026-06-19",
      "2026-06-20",
    ]);
    expect(result.isEstimated).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(db.getTripExpenses).toHaveBeenCalledTimes(1);
    expect(stored).toEqual(original);
  });

  it("returns fallback warning metadata without silently using 1:1", async () => {
    db.getTripExpenses.mockResolvedValue([storedExpense()]);
    const result = await (
      await splitCaller()
    ).expenses.getSplitSummary({ tripId: 42, baseCurrency: "HKD" });
    expect(result.totalExpenses).toBe(5.05);
    expect(result).toMatchObject({
      isFallback: true,
      isEstimated: true,
      fallbackExpenseCount: 1,
      estimatedExpenseCount: 1,
    });
    expect(result.rateMetadata[0].isFallback).toBe(true);
  });

  it("does not fabricate a split total when a currency cannot be converted", async () => {
    db.getTripExpenses.mockResolvedValue([storedExpense({ currency: "CHF" })]);
    await expect(
      (await splitCaller()).expenses.getSplitSummary({
        tripId: 42,
        baseCurrency: "HKD",
      })
    ).rejects.toThrow(/unavailable/i);
  });

  it("preserves existing signed decimal refund rows without changing stored data", async () => {
    db.getTripExpenses.mockResolvedValue([
      storedExpense({ currency: "HKD" }),
      storedExpense({ id: 2, currency: "HKD", amount: "-20.00" }),
    ]);
    const result = await (
      await splitCaller()
    ).expenses.getSplitSummary({ tripId: 42, baseCurrency: "HKD" });
    expect(result.totalExpenses).toBe(80);
    expect(result.members.find(member => member.userId === 1)?.net).toBe(40);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.getTripExpenses).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed stored amounts instead of treating a numeric prefix as money", async () => {
    db.getTripExpenses.mockResolvedValue([storedExpense({ amount: "100bad" })]);
    await expect(
      (await splitCaller()).expenses.getSplitSummary({
        tripId: 42,
        baseCurrency: "HKD",
      })
    ).rejects.toThrow(/invalid amount/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("checks membership before fetching expenses or exchange rates", async () => {
    db.getUserMembership.mockResolvedValue(null);
    await expect(
      (await splitCaller()).expenses.getSplitSummary({
        tripId: 42,
        baseCurrency: "HKD",
      })
    ).rejects.toThrow(/access denied/i);
    expect(db.getTripExpenses).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
