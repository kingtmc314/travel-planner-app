import { getHongKongToday, normalizeDateOnly } from "./hongKongDate";

export type ExpenseInsightRow = {
  id: number;
  amount: string | number;
  currency: string;
  date: string | Date | null;
  category?: string | null;
  paidByName?: string | null;
};
export type ExpenseConversion = {
  convertedAmount: number;
  convertedCurrency: string;
  rateDate: string;
  isFallback: boolean;
  isIdentical: boolean;
};

/** Database precision is DECIMAL(10, 2). Recorded expenses can include signed refunds. */
export function validExpenseAmount(
  value: string | number | null | undefined,
  allowRefunds = false
): number | null {
  if (value == null || String(value).trim() === "") return null;
  if (
    typeof value === "string" &&
    !/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())
  )
    return null;
  const amount = Number(value);
  return Number.isFinite(amount) &&
    (allowRefunds || amount >= 0) &&
    Math.abs(amount) <= 99_999_999.99
    ? amount
    : null;
}

/** Calendar values stay unchanged; instants are displayed in Asia/Hong_Kong. */
export function expenseDate(value: string | Date | null | undefined): string {
  if (typeof value === "string" && normalizeDateOnly(value)) return normalizeDateOnly(value);
  if (typeof value === "string" && !/T/.test(value)) return "";
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(part => part.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

export function defaultExpenseDate(
  start?: string | null,
  end?: string | null,
  today = getHongKongToday()
): string {
  const from = normalizeDateOnly(start);
  const to = normalizeDateOnly(end);
  if (from && to && from > to) return today;
  if (from && today < from) return from;
  if (to && today > to) return to;
  return today;
}

/** Never relabel raw money as a target currency or use the API's static fallback estimates. */
export function resolveExpenseAmount(
  row: Pick<ExpenseInsightRow, "id" | "amount" | "currency">,
  target: string | null,
  conversion?: ExpenseConversion
) {
  const value = validExpenseAmount(row.amount, true);
  const original = {
    value,
    currency: row.currency,
    rateDate: null as string | null,
    isConverted: false,
    isFallback: false,
    unavailable: Boolean(target && target !== row.currency),
  };
  if (!target || target === row.currency || value === null) return original;
  if (
    !conversion ||
    conversion.isFallback ||
    conversion.convertedCurrency !== target ||
    validExpenseAmount(conversion.convertedAmount, true) === null
  )
    return original;
  return {
    value: conversion.convertedAmount,
    currency: target,
    rateDate: conversion.rateDate,
    isConverted: true,
    isFallback: false,
    unavailable: false,
  };
}

export type ResolvedExpenseRow = ExpenseInsightRow & {
  value: number | null;
  resolvedCurrency: string;
};

export function expenseInsights(rows: ResolvedExpenseRow[], currency: string) {
  const byCurrency: Record<string, number> = {};
  const daily: Record<string, { value: number; count: number }> = {};
  const categories: Record<string, number> = {};
  const payers: Record<string, number> = {};
  let invalid = 0;
  let count = 0;
  rows.forEach(row => {
    if (row.value === null || !Number.isFinite(row.value)) {
      invalid++;
      return;
    }
    byCurrency[row.resolvedCurrency] =
      (byCurrency[row.resolvedCurrency] ?? 0) + row.value;
    if (row.resolvedCurrency !== currency) return;
    count++;
    const date = expenseDate(row.date);
    if (date) {
      daily[date] ??= { value: 0, count: 0 };
      daily[date].value += row.value;
      daily[date].count++;
    }
    const category = row.category ?? "other";
    const payer = row.paidByName?.trim() || "__unknown__";
    categories[category] = (categories[category] ?? 0) + row.value;
    payers[payer] = (payers[payer] ?? 0) + row.value;
  });
  const byDay = Object.entries(daily)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({ date, ...data }));
  const total = byCurrency[currency] ?? 0;
  const datedTotal = byDay.reduce((sum, day) => sum + day.value, 0);
  return {
    byCurrency,
    total,
    count,
    invalid,
    byDay,
    averageRecordedDay: byDay.length ? datedTotal / byDay.length : null,
    peakDay: byDay.length
      ? byDay.reduce((peak, day) => (day.value > peak.value ? day : peak))
      : null,
    byCategory: Object.entries(categories)
      .map(([category, value]) => ({ category, value }))
      .sort((a, b) => b.value - a.value),
    byPayer: Object.entries(payers)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value),
  };
}

/** Group original amounts for export; a mixed-currency grand total is deliberately absent. */
export function originalCurrencyTotals(
  rows: Pick<ExpenseInsightRow, "amount" | "currency">[]
) {
  const totals: Record<string, number> = {};
  rows.forEach(row => {
    const amount = validExpenseAmount(row.amount, true);
    if (amount !== null)
      totals[row.currency] = (totals[row.currency] ?? 0) + amount;
  });
  return totals;
}

/** RFC-4180 quoting plus spreadsheet formula-injection protection for user-authored cells. */
export function expenseCsvCell(value: unknown): string {
  const text = String(value ?? "");
  const safe =
    /^\s*[=+@-]/.test(text) && !/^-\d+(?:\.\d+)?$/.test(text)
      ? `'${text}`
      : text;
  return `"${safe.replace(/"/g, '""')}"`;
}
