import { normalizeStoredCalendarDate } from "./legacyDateOnly";

/** Mirrors the currencies accepted by currency_router's historical converter.
 * These are supported codes, not a promise that a historical quote is available. */
export const BUDGET_CURRENCIES = Object.freeze([
  "HKD",
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CNY",
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
] as const);
const supported = new Set<string>(BUDGET_CURRENCIES);
export function normalizeBudgetCurrency(value: string): string {
  return value.trim().toUpperCase();
}
export function isSupportedBudgetCurrency(value: string): boolean {
  const code = normalizeBudgetCurrency(value);
  return /^[A-Z]{3}$/.test(code) && supported.has(code);
}

/** Integer cents avoid 0.1 + 0.2 drift; stored ledger refunds are explicitly signed. */
export function budgetAmountMinor(
  value: unknown,
  allowRefunds = false
): number | null {
  if (typeof value !== "string" || value.length > 32) return null;
  const text = value.trim();
  if (
    !(allowRefunds ? /^-?\d+(?:\.\d{1,2})?$/ : /^\d+(?:\.\d{1,2})?$/).test(text)
  )
    return null;
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = (negative ? text.slice(1) : text).split(".");
  const cents = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(negative ? -cents : cents);
}
export function normalizeBudgetAmount(value: string): string | null {
  const cents = budgetAmountMinor(value);
  // DECIMAL(12,2), positive, with at most two fractional digits.
  if (cents === null || cents <= 0 || cents > 999999999999) return null;
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}
export function isBudgetWarningPercent(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 100;
}
export type BudgetConfig = {
  amount: string;
  currency: string;
  warningPercent: number;
};
export type BudgetExpense = {
  id: number;
  amount: string;
  currency: string;
  date: string;
};
export type BudgetConversion = {
  id: number;
  convertedAmount: number;
  convertedCurrency: string;
  isFallback: boolean;
};
export type BudgetStatus = "unset" | "safe" | "near" | "over" | "incomplete";
export type BudgetSummary = {
  spent: number | null;
  knownSpent: number;
  remaining: number | null;
  utilization: number | null;
  status: BudgetStatus;
  complete: boolean;
  unconvertedCount: number;
  expenseCount: number;
  originalTotals: Record<string, number>;
};
export type TripBudgetEntry = {
  tripId: number;
  tripName: string;
  baseCurrency: string;
  canEdit: boolean;
  budget: BudgetConfig | null;
  summary: BudgetSummary;
};

/** Unknown stored codes remain visible, but cannot become selectable supported currencies. */
export function availableBudgetCurrencies(
  baseCurrency: string,
  budget: BudgetConfig | null,
  originalTotals: Record<string, number>
): string[] {
  return Array.from(
    new Set<string>(
      [
        ...BUDGET_CURRENCIES,
        baseCurrency,
        ...(budget ? [budget.currency] : []),
        ...Object.keys(originalTotals),
      ]
        .map(normalizeBudgetCurrency)
        .filter(Boolean)
    )
  ).sort();
}

export function budgetConversionCandidates(
  expenses: BudgetExpense[],
  targetCurrency: string
): BudgetExpense[] {
  const target = normalizeBudgetCurrency(targetCurrency);
  if (!isSupportedBudgetCurrency(target)) return [];
  return expenses.flatMap(expense => {
    const currency = normalizeBudgetCurrency(expense.currency);
    const date = normalizeStoredCalendarDate(expense.date);
    return currency !== target &&
      isSupportedBudgetCurrency(currency) &&
      date &&
      budgetAmountMinor(expense.amount, true) !== null
      ? [{ ...expense, currency, date }]
      : [];
  });
}

/** Only shared expense-ledger rows belong here, never split shares or booking estimates.
 * A partial known net amount is NOT a lower bound: missing rows may be refunds. */
export function buildBudgetSummary(
  expenses: BudgetExpense[],
  targetCurrency: string,
  budget: BudgetConfig | null,
  conversions: ReadonlyMap<number, BudgetConversion> = new Map()
): BudgetSummary {
  const target = normalizeBudgetCurrency(targetCurrency);
  const originalCents = new Map<string, number>();
  let knownCents = 0;
  let unconvertedCount = 0;
  for (const expense of expenses) {
    const currency = normalizeBudgetCurrency(expense.currency) || "UNKNOWN";
    const cents = budgetAmountMinor(expense.amount, true);
    // Preserve each original code, including unsupported legacy codes, without a fabricated rate.
    if (cents !== null)
      originalCents.set(currency, (originalCents.get(currency) ?? 0) + cents);
    let convertedCents: number | null = null;
    if (
      cents !== null &&
      isSupportedBudgetCurrency(target) &&
      isSupportedBudgetCurrency(currency)
    ) {
      if (currency === target)
        convertedCents = cents; // Date is irrelevant to identical-currency money.
      else if (normalizeStoredCalendarDate(expense.date)) {
        const conversion = conversions.get(expense.id);
        if (
          conversion &&
          conversion.id === expense.id &&
          conversion.isFallback === false &&
          normalizeBudgetCurrency(conversion.convertedCurrency) === target &&
          Number.isFinite(conversion.convertedAmount) &&
          (cents === 0
            ? conversion.convertedAmount === 0
            : Math.sign(conversion.convertedAmount) === Math.sign(cents) ||
              conversion.convertedAmount === 0)
        ) {
          const rounded = Math.round(conversion.convertedAmount * 100);
          if (Number.isSafeInteger(rounded)) convertedCents = rounded;
        }
      }
    }
    if (
      convertedCents === null ||
      !Number.isSafeInteger(knownCents + convertedCents)
    )
      unconvertedCount++;
    else knownCents += convertedCents;
  }
  const budgetCents = budget ? budgetAmountMinor(budget.amount) : null;
  const validBudget =
    !budget ||
    (budgetCents !== null &&
      budgetCents > 0 &&
      normalizeBudgetAmount(budget.amount) !== null &&
      isSupportedBudgetCurrency(budget.currency) &&
      normalizeBudgetCurrency(budget.currency) === target &&
      isBudgetWarningPercent(budget.warningPercent));
  const complete =
    unconvertedCount === 0 && isSupportedBudgetCurrency(target) && validBudget;
  const knownSpent = knownCents / 100;
  // Raw utilization is intentionally not clamped. Only the visual progress bar is clamped.
  const ratio =
    budgetCents !== null && budgetCents > 0
      ? (knownCents / budgetCents) * 100
      : null;
  const atWarning =
    validBudget &&
    budgetCents !== null &&
    budget &&
    BigInt(knownCents) * BigInt(100) >=
      BigInt(budgetCents) * BigInt(budget.warningPercent);
  const status: BudgetStatus = !budget
    ? "unset"
    : validBudget && budgetCents !== null && knownCents >= budgetCents
      ? "over"
      : !complete
        ? "incomplete"
        : atWarning
          ? "near"
          : "safe";
  return {
    spent: complete ? knownSpent : null,
    knownSpent,
    remaining:
      complete && budgetCents !== null
        ? (budgetCents - knownCents) / 100
        : null,
    utilization: complete ? ratio : null,
    status,
    complete,
    unconvertedCount,
    expenseCount: expenses.length,
    originalTotals: Object.fromEntries(
      Array.from(originalCents, ([code, cents]) => [code, cents / 100])
    ),
  };
}
