import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getHongKongDateInput } from "@shared/flightPassport";
import { normalizeStoredCalendarDate } from "@shared/legacyDateOnly";
import { protectedProcedure, router } from "./_core/trpc";

// Approximate rates only: quote currency per 1 HKD, not historical market data.
const FALLBACK_RATES: Readonly<Record<string, number>> = Object.freeze({
  HKD: 1,
  JPY: 19.8,
  TWD: 4.2,
  EGP: 6.5,
  USD: 0.128,
  EUR: 0.118,
  CNY: 0.93,
  SGD: 0.172,
  GBP: 0.101,
  AUD: 0.197,
  CAD: 0.178,
  KRW: 175,
  THB: 4.45,
  MYR: 0.6,
  IDR: 2050,
  PHP: 7.3,
  VND: 3280,
});
const FRANKFURTER_SUPPORTED = new Set([
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CNY",
  "HKD",
  "SGD",
  "AUD",
  "CAD",
  "KRW",
  "TWD",
  "THB",
  "EGP",
  "MYR",
  "IDR",
  "PHP",
  "VND",
  "CHF",
  "SEK",
  "NOK",
  "DKK",
  "NZD",
  "ZAR",
  "BRL",
  "MXN",
  "INR",
  "RUB",
  "TRY",
  "PLN",
  "CZK",
  "HUF",
  "RON",
  "BGN",
  "HRK",
  "ISK",
  "ILS",
  "AED",
  "SAR",
  "QAR",
  "KWD",
]);
const DAY_MS = 24 * 60 * 60 * 1000;
const FALLBACK_TTL_MS = 60_000;
const MAX_CONCURRENT_REQUESTS = 6;

/** A calendar date is kept verbatim; never round-trip it through a UTC timestamp. */
export function isValidCurrencyDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000"))
    return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}
const dateSchema = z
  .string()
  .refine(isValidCurrencyDate, "Date must be a valid YYYY-MM-DD calendar date");
const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Currency must be a three-letter code");
const decimalPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
function validAmount(value: string, allowRefunds = false): boolean {
  return (
    decimalPattern.test(value.trim()) &&
    Number.isFinite(Number(value)) &&
    (allowRefunds || Number(value) >= 0)
  );
}
const amountSchema = z
  .string()
  .refine(
    value => validAmount(value),
    "Amount must be a finite nonnegative decimal"
  );

function requireCurrency(value: string): string {
  const currency = currencySchema.parse(value);
  if (
    !FRANKFURTER_SUPPORTED.has(currency) &&
    !Object.hasOwn(FALLBACK_RATES, currency)
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Unsupported currency ${currency}; no supported fallback rate is available`,
    });
  }
  return currency;
}
function requireRate(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error("Exchange rate must be finite and positive");
  }
  return value;
}
function previousDay(date: string): string {
  const parsed = new Date(`${date}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() - 1);
  return parsed.toISOString().slice(0, 10);
}

export interface HistoricalRate {
  rate: number;
  rateDate: string;
  isFallback: boolean;
}
interface CachedRate extends HistoricalRate {
  fetchedAt: number;
}
const rateCache = new Map<string, CachedRate>();
const historicalInFlight = new Map<string, Promise<HistoricalRate>>();
const requestInFlight = new Map<string, Promise<HistoricalRate | null>>();
const MAX_CACHE_ENTRIES = 10_000;
function cacheRate(key: string, value: CachedRate): void {
  // Bound process memory only; this never changes persisted application data.
  if (!rateCache.has(key) && rateCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = rateCache.keys().next().value;
    if (oldest !== undefined) rateCache.delete(oldest);
  }
  rateCache.set(key, value);
}
function cachedRate(key: string): HistoricalRate | null {
  const cached = rateCache.get(key);
  if (
    !cached ||
    Date.now() - cached.fetchedAt >=
      (cached.isFallback ? FALLBACK_TTL_MS : DAY_MS)
  )
    return null;
  return {
    rate: cached.rate,
    rateDate: cached.rateDate,
    isFallback: cached.isFallback,
  };
}

// This semaphore applies across simultaneous callers, not merely within one batch.
let activeRequests = 0;
const requestQueue: Array<() => void> = [];
async function limitedFetch(url: string): Promise<unknown> {
  await new Promise<void>(resolve => {
    const enter = () => {
      activeRequests++;
      resolve();
    };
    if (activeRequests < MAX_CONCURRENT_REQUESTS) enter();
    else requestQueue.push(enter);
  });
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok)
      throw new Error(`Exchange-rate API returned HTTP ${response.status}`);
    return await response.json();
  } finally {
    activeRequests--;
    requestQueue.shift()?.();
  }
}

const apiRowSchema = z.object({
  date: dateSchema,
  base: z.literal("HKD"),
  quote: z.string().regex(/^[A-Z]{3}$/),
  rate: z.number().finite().positive(),
});
async function fetchHistoricalRate(
  date: string,
  currency: string
): Promise<HistoricalRate | null> {
  const key = `${date}:${currency}`;
  const cached = cachedRate(key);
  if (cached && !cached.isFallback) return cached;
  const pending = requestInFlight.get(key);
  if (pending) return pending;
  const request = (async () => {
    try {
      const data = await limitedFetch(
        `https://api.frankfurter.dev/v2/rates?date=${date}&base=HKD&quotes=${currency}`
      );
      const rows = z.array(apiRowSchema).min(1).parse(data);
      const row = rows.find(row => row.quote === currency && row.date <= date);
      if (!row) return null;
      const result = { rate: row.rate, rateDate: row.date, isFallback: false };
      const cached = { ...result, fetchedAt: Date.now() };
      cacheRate(key, cached);
      cacheRate(`${row.date}:${currency}`, cached);
      return result;
    } catch {
      return null;
    }
  })();
  requestInFlight.set(key, request);
  try {
    return await request;
  } finally {
    requestInFlight.delete(key);
  }
}

/** HKD-to-quote historical rate; an unavailable unsupported fallback is an error, never 1:1. */
export async function getHistoricalRate(
  date: string,
  targetCurrency: string
): Promise<HistoricalRate> {
  dateSchema.parse(date);
  const currency = requireCurrency(targetCurrency);
  if (currency === "HKD") return { rate: 1, rateDate: date, isFallback: false };
  const key = `${date}:${currency}`;
  const cached = cachedRate(key);
  if (cached) return cached;
  const pending = historicalInFlight.get(key);
  if (pending) return pending;
  const lookup = (async () => {
    let candidate = date;
    for (let i = 0; i <= 5; i++) {
      if (!isValidCurrencyDate(candidate)) break;
      const result = await fetchHistoricalRate(candidate, currency);
      if (result) {
        cacheRate(key, { ...result, fetchedAt: Date.now() });
        return result;
      }
      candidate = previousDay(candidate);
    }
    const rate = FALLBACK_RATES[currency];
    if (rate === undefined) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: `Exchange rate for ${currency} is unavailable; no supported fallback rate is available`,
      });
    }
    const result = {
      rate: requireRate(rate),
      rateDate: date,
      isFallback: true,
    };
    cacheRate(key, { ...result, fetchedAt: Date.now() });
    return result;
  })();
  historicalInFlight.set(key, lookup);
  try {
    return await lookup;
  } finally {
    historicalInFlight.delete(key);
  }
}

interface LatestRates {
  rates: Record<string, number>;
  fetchedAt: number;
  isFallback: boolean;
  rateDate: string | null;
}
let latestRatesCache: LatestRates | null = null;
let latestInFlight: Promise<LatestRates> | null = null;
function copyLatest(result: LatestRates): LatestRates {
  return { ...result, rates: { ...result.rates } };
}
export async function getLatestRates(): Promise<LatestRates> {
  const cached = latestRatesCache;
  if (
    cached &&
    Date.now() - cached.fetchedAt <
      (cached.isFallback ? FALLBACK_TTL_MS : 60 * 60 * 1000)
  ) {
    return copyLatest(cached);
  }
  if (latestInFlight) return copyLatest(await latestInFlight);
  latestInFlight = (async () => {
    try {
      const quotes = Object.keys(FALLBACK_RATES).filter(
        currency => currency !== "HKD"
      );
      const data = await limitedFetch(
        `https://api.frankfurter.dev/v2/rates?base=HKD&quotes=${quotes.join(",")}`
      );
      const rows = z.array(apiRowSchema).min(1).parse(data);
      const rates: Record<string, number> = { HKD: 1 };
      for (const row of rows) {
        if (!quotes.includes(row.quote) || row.date > getHongKongDateInput())
          throw new Error("Unexpected currency or rate date");
        rates[row.quote] = row.rate;
      }
      if (quotes.some(quote => rates[quote] === undefined))
        throw new Error("Incomplete exchange-rate response");
      latestRatesCache = {
        rates,
        fetchedAt: Date.now(),
        isFallback: false,
        rateDate: rows.map(row => row.date).sort()[0],
      };
    } catch {
      latestRatesCache = {
        rates: { ...FALLBACK_RATES },
        fetchedAt: Date.now(),
        isFallback: true,
        rateDate: null,
      };
    }
    return latestRatesCache;
  })();
  try {
    return copyLatest(await latestInFlight);
  } finally {
    latestInFlight = null;
  }
}

export interface ExpenseConversionInput {
  id: number;
  amount: string;
  currency: string;
  date: string;
}
export interface ExpenseConversion {
  id: number;
  convertedAmount: number;
  convertedCurrency: string;
  rateDate: string;
  fromRateDate: string;
  toRateDate: string;
  isFallback: boolean;
  isEstimated: boolean;
  isIdentical: boolean;
}

/** Shared by the expense conversion endpoint and split summaries, one historical date per expense. */
export async function convertExpenseAmounts(
  expenses: ExpenseConversionInput[],
  targetCurrency: string,
  options: { allowRefunds?: boolean } = {}
): Promise<ExpenseConversion[]> {
  const target = requireCurrency(targetCurrency);
  // Validate the entire batch before fetching; signed stored refunds remain supported explicitly.
  const validated = expenses.map(expense => {
    // Database date columns can contain legacy HK wall-clock SQL strings.
    // Normalize copies only; public procedure inputs still use strict dateSchema.
    const date = normalizeStoredCalendarDate(expense.date);
    if (!date) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Expense ${expense.id} has an invalid calendar date`,
      });
    }
    dateSchema.parse(date);
    if (!validAmount(expense.amount, options.allowRefunds)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Expense ${expense.id} has an invalid amount`,
      });
    }
    return { ...expense, date, currency: requireCurrency(expense.currency) };
  });
  const results: ExpenseConversion[] = new Array(validated.length);
  let cursor = 0;
  await Promise.all(
    Array.from(
      { length: Math.min(MAX_CONCURRENT_REQUESTS, validated.length) },
      async () => {
        while (cursor < validated.length) {
          const index = cursor++;
          const expense = validated[index];
          const isIdentical = expense.currency === target;
          const [from, to] = isIdentical
            ? [
                { rate: 1, rateDate: expense.date, isFallback: false },
                { rate: 1, rateDate: expense.date, isFallback: false },
              ]
            : await Promise.all([
                getHistoricalRate(expense.date, expense.currency),
                getHistoricalRate(expense.date, target),
              ]);
          const converted =
            (Number(expense.amount) / requireRate(from.rate)) *
            requireRate(to.rate);
          const rounded = Math.round(converted * 100) / 100;
          if (!Number.isFinite(converted) || !Number.isFinite(rounded)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Expense ${expense.id} conversion exceeds the supported amount range`,
            });
          }
          const isFallback = from.isFallback || to.isFallback;
          results[index] = {
            id: expense.id,
            convertedAmount: isIdentical ? Number(expense.amount) : rounded,
            convertedCurrency: target,
            rateDate: from.rateDate < to.rateDate ? from.rateDate : to.rateDate,
            fromRateDate: from.rateDate,
            toRateDate: to.rateDate,
            isFallback,
            isEstimated:
              isFallback ||
              from.rateDate !== expense.date ||
              to.rateDate !== expense.date,
            isIdentical,
          };
        }
      }
    )
  );
  return results;
}

export const currencyRouter = router({
  getRates: protectedProcedure
    .input(z.object({ base: currencySchema.default("HKD") }))
    .query(async ({ input }) => {
      const base = requireCurrency(input.base);
      const latest = await getLatestRates();
      if (latest.rates[base] === undefined) {
        const baseRate = await getHistoricalRate(
          latest.rateDate ?? getHongKongDateInput(),
          base
        );
        latest.rates[base] = baseRate.rate;
        latest.isFallback ||= baseRate.isFallback;
        if (latest.rateDate && baseRate.rateDate < latest.rateDate)
          latest.rateDate = baseRate.rateDate;
      }
      const denominator = requireRate(latest.rates[base]);
      const rates: Record<string, number> = {};
      for (const [quote, rate] of Object.entries(latest.rates))
        rates[quote] = requireRate(requireRate(rate) / denominator);
      rates[base] = 1;
      return { ...latest, base, rates };
    }),
  convertExpenses: protectedProcedure
    .input(
      z.object({
        targetCurrency: currencySchema,
        expenses: z
          .array(
            z.object({
              id: z.number().int(),
              amount: amountSchema,
              currency: currencySchema,
              date: dateSchema,
            })
          )
          .max(1000),
      })
    )
    .query(async ({ input }) => ({
      targetCurrency: input.targetCurrency,
      results: await convertExpenseAmounts(
        input.expenses,
        input.targetCurrency
      ),
    })),
});
