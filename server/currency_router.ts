import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FrankfurterRateRow {
  date: string;
  base: string;
  quote: string;
  rate: number;
}

// ─── Fallback rates (HKD-based, approximate 2025-2026) ───────────────────────
// Used when the API is unavailable. Values = how many X per 1 HKD.
const FALLBACK_RATES: Record<string, number> = {
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
};

// Currencies supported by frankfurter.dev (subset we care about)
const FRANKFURTER_SUPPORTED = new Set([
  "USD","EUR","GBP","JPY","CNY","HKD","SGD","AUD","CAD","KRW",
  "TWD","THB","EGP","MYR","IDR","PHP","VND","CHF","SEK","NOK",
  "DKK","NZD","ZAR","BRL","MXN","INR","RUB","TRY","PLN","CZK",
  "HUF","RON","BGN","HRK","ISK","ILS","AED","SAR","QAR","KWD",
]);

// ─── In-memory cache: { "YYYY-MM-DD:TARGET" → { rate, fetchedAt } } ──────────
// Keyed by "date:quoteCurrency" with HKD as the implicit base.
const rateCache = new Map<string, { rate: number; fetchedAt: number }>();

// Latest-rates cache (for "today" fallback)
let latestRatesCache: { rates: Record<string, number>; fetchedAt: number } | null = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format a Date as YYYY-MM-DD */
function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

/** Step back one calendar day */
function prevDay(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return toDateStr(d);
}

/**
 * Fetch the HKD→target rate for a specific date from frankfurter.dev v2.
 * The API automatically returns the last available trading day if the requested
 * date is a weekend or holiday (it returns the actual date used in the response).
 * Returns null if the API call fails.
 */
async function fetchHistoricalRate(
  dateStr: string,
  targetCurrency: string
): Promise<{ rate: number; actualDate: string } | null> {
  if (!FRANKFURTER_SUPPORTED.has(targetCurrency)) return null;
  if (targetCurrency === "HKD") return { rate: 1, actualDate: dateStr };

  const cacheKey = `${dateStr}:${targetCurrency}`;
  const cached = rateCache.get(cacheKey);
  // Cache historical rates for 24 hours (they don't change)
  if (cached && Date.now() - cached.fetchedAt < 24 * 60 * 60 * 1000) {
    return { rate: cached.rate, actualDate: dateStr };
  }

  try {
    const url = `https://api.frankfurter.dev/v2/rates?date=${dateStr}&base=HKD&quotes=${targetCurrency}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      if (res.status === 404 || res.status === 422) return null;
      throw new Error(`HTTP ${res.status}`);
    }
    const rows = await res.json() as FrankfurterRateRow[];
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const row = rows[0];
    const rate = row.rate;
    const actualDate = row.date; // API returns the actual trading day used
    rateCache.set(cacheKey, { rate, fetchedAt: Date.now() });
    // Also cache under the actual date returned (in case it differs from requested)
    if (actualDate !== dateStr) {
      rateCache.set(`${actualDate}:${targetCurrency}`, { rate, fetchedAt: Date.now() });
    }
    return { rate, actualDate };
  } catch {
    return null;
  }
}

/**
 * Get the HKD→target rate for a given date.
 * Strategy:
 *   1. Try the exact date (frankfurter auto-returns last trading day for weekends/holidays)
 *   2. If API fails, try up to 5 previous calendar days
 *   3. If all fail, return the fallback hardcoded rate
 */
export async function getHistoricalRate(
  dateStr: string,
  targetCurrency: string
): Promise<{ rate: number; rateDate: string; isFallback: boolean }> {
  if (targetCurrency === "HKD") {
    return { rate: 1, rateDate: dateStr, isFallback: false };
  }

  // Try the requested date first (API handles weekends automatically)
  const result = await fetchHistoricalRate(dateStr, targetCurrency);
  if (result) {
    return { rate: result.rate, rateDate: result.actualDate, isFallback: false };
  }

  // If the first call failed (network error), try up to 5 previous days
  let tryDate = prevDay(dateStr);
  for (let i = 0; i < 5; i++) {
    const r = await fetchHistoricalRate(tryDate, targetCurrency);
    if (r) {
      return { rate: r.rate, rateDate: r.actualDate, isFallback: false };
    }
    tryDate = prevDay(tryDate);
  }

  // Final fallback: hardcoded approximate rate
  const fallbackRate = FALLBACK_RATES[targetCurrency] ?? 1;
  return { rate: fallbackRate, rateDate: dateStr, isFallback: true };
}

/**
 * Fetch latest rates for all supported currencies (used for the summary totals).
 * Falls back to hardcoded rates if the API is unavailable.
 */
export async function getLatestRates(): Promise<{
  rates: Record<string, number>;
  fetchedAt: number;
  isFallback: boolean;
}> {
  const now = Date.now();
  if (latestRatesCache && now - latestRatesCache.fetchedAt < 60 * 60 * 1000) {
    return { ...latestRatesCache, isFallback: false };
  }

  try {
    const quotes = Object.keys(FALLBACK_RATES).filter(c => c !== "HKD").join(",");
    const url = `https://api.frankfurter.dev/v2/rates?base=HKD&quotes=${quotes}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = await res.json() as FrankfurterRateRow[];
    if (!Array.isArray(rows)) throw new Error("Unexpected response");
    const rates: Record<string, number> = { HKD: 1 };
    for (const row of rows) {
      rates[row.quote] = row.rate;
    }
    latestRatesCache = { rates, fetchedAt: now };
    return { rates, fetchedAt: now, isFallback: false };
  } catch {
    latestRatesCache = { rates: FALLBACK_RATES, fetchedAt: now };
    return { rates: FALLBACK_RATES, fetchedAt: now, isFallback: true };
  }
}

// ─── tRPC Router ──────────────────────────────────────────────────────────────

export const currencyRouter = router({
  /**
   * Get the latest exchange rates (for display/summary).
   * Returns rates as: how many [quote] per 1 HKD.
   */
  getRates: protectedProcedure
    .input(z.object({ base: z.string().default("HKD") }))
    .query(async ({ input }) => {
      const { rates, fetchedAt, isFallback } = await getLatestRates();
      return { base: input.base, rates, fetchedAt, isFallback };
    }),

  /**
   * Convert a list of expense amounts using historical rates.
   * Each item uses the rate on its own payment date.
   * Returns the converted amounts plus the rate and actual rate date used.
   */
  convertExpenses: protectedProcedure
    .input(z.object({
      targetCurrency: z.string(),
      expenses: z.array(z.object({
        id: z.number(),
        amount: z.string(),          // stored as string in DB
        currency: z.string(),
        date: z.string(),            // YYYY-MM-DD
      })),
    }))
    .query(async ({ input }) => {
      const { targetCurrency, expenses } = input;

      // Deduplicate (date, fromCurrency, toCurrency) combos to minimise API calls
      const pairs = new Map<string, { fromCurrency: string; date: string }>();
      for (const e of expenses) {
        if (e.currency === targetCurrency) continue;
        const key = `${e.date}:${e.currency}:${targetCurrency}`;
        if (!pairs.has(key)) {
          pairs.set(key, { fromCurrency: e.currency, date: e.date });
        }
      }

      // Fetch all unique rates in parallel (caching prevents duplicate HTTP calls)
      const rateMap = new Map<string, { fromRate: number; toRate: number; rateDate: string; isFallback: boolean }>();

      await Promise.all(
        Array.from(pairs.entries()).map(async ([key, { fromCurrency, date }]) => {
          // We need: amount_in_fromCurrency → HKD → targetCurrency
          // fromRate = HKD per 1 fromCurrency = 1 / (fromCurrency per 1 HKD)
          // toRate   = targetCurrency per 1 HKD
          let fromRate = 1;
          let fromRateDate = date;
          let fromIsFallback = false;

          if (fromCurrency !== "HKD") {
            const r = await getHistoricalRate(date, fromCurrency);
            // r.rate = fromCurrency per 1 HKD, so HKD per 1 fromCurrency = 1/r.rate
            fromRate = r.rate;
            fromRateDate = r.rateDate;
            fromIsFallback = r.isFallback;
          }

          let toRate = 1;
          let toRateDate = date;
          let toIsFallback = false;

          if (targetCurrency !== "HKD") {
            const r = await getHistoricalRate(date, targetCurrency);
            toRate = r.rate;
            toRateDate = r.rateDate;
            toIsFallback = r.isFallback;
          }

          // Use the earlier of the two rate dates (most conservative)
          const rateDate = fromRateDate < toRateDate ? fromRateDate : toRateDate;
          rateMap.set(key, {
            fromRate,
            toRate,
            rateDate,
            isFallback: fromIsFallback || toIsFallback,
          });
        })
      );

      // Build per-expense results
      const results = expenses.map(e => {
        const rawAmount = parseFloat(e.amount);
        if (e.currency === targetCurrency) {
          return {
            id: e.id,
            convertedAmount: rawAmount,
            convertedCurrency: targetCurrency,
            rateDate: e.date,
            isFallback: false,
            isIdentical: true,
          };
        }

        const key = `${e.date}:${e.currency}:${targetCurrency}`;
        const rateInfo = rateMap.get(key);
        if (!rateInfo) {
          // Shouldn't happen, but handle gracefully
          return {
            id: e.id,
            convertedAmount: rawAmount,
            convertedCurrency: e.currency,
            rateDate: e.date,
            isFallback: true,
            isIdentical: false,
          };
        }

        const { fromRate, toRate, rateDate, isFallback } = rateInfo;
        // fromRate = fromCurrency per 1 HKD
        // toRate   = targetCurrency per 1 HKD
        // converted = amount / fromRate * toRate
        const converted = (rawAmount / fromRate) * toRate;

        return {
          id: e.id,
          convertedAmount: Math.round(converted * 100) / 100,
          convertedCurrency: targetCurrency,
          rateDate,
          isFallback,
          isIdentical: false,
        };
      });

      return { targetCurrency, results };
    }),
});
