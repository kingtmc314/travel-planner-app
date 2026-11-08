import { describe, expect, it } from "vitest";
import {
  defaultExpenseDate,
  expenseCsvCell,
  expenseDate,
  expenseInsights,
  originalCurrencyTotals,
  resolveExpenseAmount,
  validExpenseAmount,
  type ResolvedExpenseRow,
} from "../client/src/lib/expenseInsights";

const row = (
  id: number,
  amount: string,
  currency: string,
  date = "2026-11-08",
  category = "food",
  paidByName = "Alice"
): ResolvedExpenseRow => ({
  id,
  amount,
  currency,
  date,
  category,
  paidByName,
  value: validExpenseAmount(amount),
  resolvedCurrency: currency,
});

describe("expense amount validation", () => {
  it("rejects empty, partial, non-finite, negative and overflowing input", () => {
    [
      "",
      " ",
      "12 HKD",
      "Infinity",
      Infinity,
      NaN,
      "-0.01",
      "100000000",
      "0x10",
      "1e3",
      undefined,
      null,
    ].forEach(input => expect(validExpenseAmount(input)).toBeNull());
  });
  it("allows zero and valid database-precision amounts", () => {
    expect(validExpenseAmount("0")).toBe(0);
    expect(validExpenseAmount("1234.56")).toBe(1234.56);
    expect(validExpenseAmount("99999999.99")).toBe(99999999.99);
  });
});

describe("Hong Kong expense dates", () => {
  it("keeps date-only business dates unchanged and rejects impossible dates", () => {
    expect(expenseDate("2026-11-08")).toBe("2026-11-08");
    expect(expenseDate("2026-02-30")).toBe("");
    expect(expenseDate("invalid")).toBe("");
    expect(expenseDate(null)).toBe("");
  });
  it("renders UTC instants at the Hong Kong midnight boundary", () => {
    expect(expenseDate(new Date("2026-11-07T15:59:59Z"))).toBe("2026-11-07");
    expect(expenseDate(new Date("2026-11-07T16:00:00Z"))).toBe("2026-11-08");
    expect(expenseDate("2026-11-07T18:00:00Z")).toBe("2026-11-08");
  });
  it("clamps Hong Kong today to the trip calendar range", () => {
    expect(defaultExpenseDate("2026-11-10", "2026-11-15", "2026-11-08")).toBe(
      "2026-11-10"
    );
    expect(defaultExpenseDate("2026-11-01", "2026-11-05", "2026-11-08")).toBe(
      "2026-11-05"
    );
    expect(defaultExpenseDate("2026-11-01", "2026-11-15", "2026-11-08")).toBe(
      "2026-11-08"
    );
    expect(defaultExpenseDate("2026-11-15", "2026-11-01", "2026-11-08")).toBe(
      "2026-11-08"
    );
  });
});

describe("currency-safe display", () => {
  const expense = { id: 1, amount: "100", currency: "USD" };
  const conversion = {
    convertedAmount: 780,
    convertedCurrency: "HKD",
    rateDate: "2026-11-06",
    isFallback: false,
    isIdentical: false,
  };
  it("never relabels a raw amount when conversion data is missing", () => {
    expect(resolveExpenseAmount(expense, "HKD")).toMatchObject({
      value: 100,
      currency: "USD",
      unavailable: true,
      isConverted: false,
    });
  });
  it("keeps original values when conversion currency is wrong or amounts are non-finite", () => {
    expect(
      resolveExpenseAmount(expense, "HKD", {
        ...conversion,
        convertedCurrency: "EUR",
      }).currency
    ).toBe("USD");
    expect(
      resolveExpenseAmount(expense, "HKD", {
        ...conversion,
        convertedAmount: Infinity,
      }).currency
    ).toBe("USD");
  });
  it("does not use static fallback rates in actual spending analysis", () => {
    expect(
      resolveExpenseAmount(expense, "HKD", { ...conversion, isFallback: true })
    ).toMatchObject({ value: 100, currency: "USD", unavailable: true });
  });
  it("uses a verified conversion and retains its rate date", () => {
    expect(resolveExpenseAmount(expense, "HKD", conversion)).toMatchObject({
      value: 780,
      currency: "HKD",
      rateDate: "2026-11-06",
      isConverted: true,
      unavailable: false,
    });
  });
  it("returns same-currency originals without a conversion query", () => {
    expect(resolveExpenseAmount(expense, "USD")).toMatchObject({
      value: 100,
      currency: "USD",
      unavailable: false,
    });
  });
});

describe("real expense insights", () => {
  const rows = [
    row(1, "100", "HKD", "2026-11-08"),
    row(2, "60", "HKD", "2026-11-08", "transport", "Bob"),
    row(3, "40", "HKD", "2026-11-09"),
    row(4, "1000", "JPY", "2026-11-09", "shopping", "Carol"),
  ];
  it("keeps subtotals separate and charts only the selected currency", () => {
    const insights = expenseInsights(rows, "HKD");
    expect(insights.byCurrency).toEqual({ HKD: 200, JPY: 1000 });
    expect(insights.total).toBe(200);
    expect(insights.count).toBe(3);
    expect(insights.byCategory).toEqual([
      { category: "food", value: 140 },
      { category: "transport", value: 60 },
    ]);
    expect(insights.byPayer).toEqual([
      { name: "Alice", value: 140 },
      { name: "Bob", value: 60 },
    ]);
  });
  it("uses recorded days only for daily average and sorts dates chronologically", () => {
    const insights = expenseInsights(rows.slice().reverse(), "HKD");
    expect(insights.byDay).toEqual([
      { date: "2026-11-08", value: 160, count: 2 },
      { date: "2026-11-09", value: 40, count: 1 },
    ]);
    expect(insights.averageRecordedDay).toBe(100);
    expect(insights.peakDay?.date).toBe("2026-11-08");
  });
  it("does not invent zeros or today for missing dated data", () => {
    const insights = expenseInsights([row(1, "100", "HKD", "")], "HKD");
    expect(insights.total).toBe(100);
    expect(insights.byDay).toEqual([]);
    expect(insights.averageRecordedDay).toBeNull();
    expect(insights.peakDay).toBeNull();
  });
  it("excludes invalid money and identifies unnamed payers", () => {
    const insights = expenseInsights(
      [
        row(1, "not a number", "HKD"),
        row(2, "25", "HKD", "2026-11-08", "food", " "),
      ],
      "HKD"
    );
    expect(insights.invalid).toBe(1);
    expect(insights.total).toBe(25);
    expect(insights.byPayer).toEqual([{ name: "__unknown__", value: 25 }]);
  });
  it("exports original per-currency subtotals, never a mixed raw total", () => {
    expect(
      originalCurrencyTotals([...rows, row(5, "Infinity", "USD")])
    ).toEqual({ HKD: 200, JPY: 1000 });
  });
  it("preserves finite signed refunds in totals and daily net spending", () => {
    expect(validExpenseAmount("-20", true)).toBe(-20);
    const refund = { ...row(5, "20", "HKD"), amount: "-20", value: -20 };
    const insights = expenseInsights([...rows, refund], "HKD");
    expect(insights.total).toBe(180);
    expect(insights.byDay[0].value).toBe(140);
    expect(insights.averageRecordedDay).toBe(90);
    expect(originalCurrencyTotals([...rows, refund])).toEqual({
      HKD: 180,
      JPY: 1000,
    });
    expect(resolveExpenseAmount(refund, null)).toMatchObject({
      value: -20,
      currency: "HKD",
    });
  });
});

describe("expense CSV cells", () => {
  it("quotes delimiters, embedded quotes and newlines", () => {
    expect(expenseCsvCell('Lunch, "Central"\nHK')).toBe(
      '"Lunch, ""Central""\nHK"'
    );
    expect(expenseCsvCell(null)).toBe('""');
  });
  it("neutralizes spreadsheet formulas while retaining ordinary amount cells", () => {
    expect(expenseCsvCell("=HYPERLINK(url)")).toBe('"\'=HYPERLINK(url)"');
    expect(expenseCsvCell("  @SUM(A1)")).toBe('"\'  @SUM(A1)"');
    expect(expenseCsvCell("125.50")).toBe('"125.50"');
    expect(expenseCsvCell("-20.50")).toBe('"-20.50"');
  });
});
