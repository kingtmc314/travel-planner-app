import { useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Calculator,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useI18n } from "@/hooks/useI18n";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CURRENCIES = [
  "HKD",
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CNY",
  "TWD",
  "SGD",
  "AUD",
  "CAD",
  "KRW",
  "THB",
  "EGP",
  "MYR",
  "IDR",
  "PHP",
  "VND",
];
const NO_DECIMALS = new Set(["JPY", "KRW", "IDR", "VND"]);
function formatAmount(amount: number, currency: string): string {
  return amount.toLocaleString(undefined, {
    minimumFractionDigits: NO_DECIMALS.has(currency) ? 0 : 2,
    maximumFractionDigits: NO_DECIMALS.has(currency) ? 0 : 2,
  });
}

export function SplitSummaryPanel({
  tripId,
  baseCurrency,
}: {
  tripId: number;
  baseCurrency: string;
}) {
  const { lang } = useI18n();
  const [splitCurrency, setSplitCurrency] = useState(baseCurrency);
  const queryInput = useMemo(
    () => ({ tripId, baseCurrency: splitCurrency }),
    [tripId, splitCurrency]
  );
  const { data, isLoading, isFetching, error, refetch } =
    trpc.expenses.getSplitSummary.useQuery(queryInput, { staleTime: 60_000 });
  const currencies = useMemo(
    () => Array.from(new Set([baseCurrency, ...CURRENCIES])),
    [baseCurrency]
  );
  // Never display cached balances alongside a failed recalculation as if they were current.
  const summary = !error && !isLoading ? data : undefined;
  const displayCurrency = summary?.baseCurrency ?? splitCurrency;

  return (
    <section
      aria-label={lang === "zh" ? "分帳計算" : "Split calculator"}
      className="mb-6 overflow-hidden rounded-2xl border border-violet-200 bg-card text-card-foreground dark:border-violet-800"
    >
      <div className="flex items-center justify-between gap-3 border-b border-violet-200 bg-violet-50 px-4 py-3 dark:border-violet-800 dark:bg-violet-950/40">
        <div className="flex items-center gap-2">
          <Calculator
            className="h-4 w-4 text-violet-600 dark:text-violet-400"
            aria-hidden="true"
          />
          <h3 className="text-sm font-semibold text-violet-900 dark:text-violet-200">
            {lang === "zh" ? "分帳計算" : "Split Calculator"}
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">
            {lang === "zh" ? "換算為" : "Convert to"}
          </span>
          <Select value={splitCurrency} onValueChange={setSplitCurrency}>
            <SelectTrigger
              className="h-8 w-24 text-xs"
              aria-label={lang === "zh" ? "分帳貨幣" : "Settlement currency"}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currencies.map(currency => (
                <SelectItem key={currency} value={currency}>
                  {currency}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {isLoading && (
        <div
          role="status"
          className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          {lang === "zh" ? "計算中…" : "Calculating…"}
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="space-y-2 px-4 py-4 text-sm text-destructive"
        >
          <p className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {lang === "zh"
              ? "無法可靠換算，未顯示分帳金額。請檢查費用貨幣、金額及日期，或稍後再試。"
              : "Reliable conversion is unavailable, so balances are not shown. Check expense currencies, amounts and dates, or try again later."}
          </p>
          <button
            type="button"
            disabled={isFetching}
            onClick={() => void refetch()}
            className="rounded underline underline-offset-4 focus-visible:outline focus-visible:outline-2"
          >
            {lang === "zh" ? "重試計算" : "Retry calculation"}
          </button>
        </div>
      )}
      {summary && (
        <div className="space-y-4 p-4">
          {summary.isFallback ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
            >
              <AlertCircle
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              <p>
                {lang === "zh"
                  ? `${summary.fallbackExpenseCount} 筆費用未能取得歷史匯率，已使用概算備用匯率。以下結餘及轉帳金額僅供估算，轉帳前請核對實際匯率。`
                  : `Historical rates were unavailable for ${summary.fallbackExpenseCount} expense(s). Approximate fallback rates were used. Balances and transfers are estimates; verify actual rates before settling.`}
              </p>
            </div>
          ) : summary.isEstimated ? (
            <p
              role="status"
              className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
            >
              {lang === "zh"
                ? "部分費用使用付款日前最近可取得的交易日匯率（如週末或假期），金額僅供參考。"
                : "Some expenses use the nearest available earlier trading-day rate (such as weekends or holidays). Amounts are indicative."}
            </p>
          ) : null}
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {lang === "zh" ? "各人結餘" : "Balances"}
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {summary.members.map(member => {
                const settled = Math.abs(member.net) < 0.01;
                const positive = member.net > 0;
                return (
                  <div
                    key={member.userId}
                    className={`rounded-xl border px-3 py-2.5 text-sm ${settled ? "border-border bg-muted/40" : positive ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30" : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30"}`}
                  >
                    <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                      <span className="truncate font-semibold text-foreground">
                        {member.name}
                      </span>
                      <span
                        className={`font-bold ${settled ? "text-muted-foreground" : positive ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                      >
                        {settled
                          ? lang === "zh"
                            ? "已結清"
                            : "Settled"
                          : `${positive ? (lang === "zh" ? "應收 +" : "Owed +") : lang === "zh" ? "應付 " : "Owes "}${formatAmount(Math.abs(member.net), displayCurrency)} ${displayCurrency}`}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                      <span>
                        {lang === "zh" ? "已付" : "Paid"}{" "}
                        <span className="font-medium text-foreground">
                          {formatAmount(member.paidTotal, displayCurrency)}
                        </span>
                      </span>
                      <span>
                        {lang === "zh" ? "應付份額" : "Share"}{" "}
                        <span className="font-medium text-foreground">
                          {formatAmount(member.owedTotal, displayCurrency)}
                        </span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {summary.settlements.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {lang === "zh" ? "轉帳建議" : "Suggested Transfers"}
              </p>
              <div className="space-y-2">
                {summary.settlements.map((settlement, index) => (
                  <div
                    key={`${settlement.fromId}-${settlement.toId}-${index}`}
                    className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm"
                  >
                    <span className="font-medium">{settlement.from}</span>
                    <ArrowRight
                      aria-hidden="true"
                      className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                    />
                    <span className="font-medium">{settlement.to}</span>
                    <span className="ml-auto shrink-0 font-semibold">
                      {formatAmount(settlement.amount, displayCurrency)}{" "}
                      {displayCurrency}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {lang === "zh" ? "目前無需轉帳。" : "No transfers needed."}
            </p>
          )}
          <p className="text-[11px] text-muted-foreground">
            {lang === "zh"
              ? `按各筆費用付款日期換算為 ${displayCurrency}；如該日無報價則使用較早可取得的匯率。`
              : `Each expense is converted to ${displayCurrency} using its own payment date, or an available earlier trading-day rate.`}
          </p>
        </div>
      )}
    </section>
  );
}

export default SplitSummaryPanel;
