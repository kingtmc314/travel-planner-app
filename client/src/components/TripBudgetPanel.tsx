import React, { useEffect, useId, useMemo, useState } from "react";
import { AlertCircle, Loader2, Pencil, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/hooks/useI18n";
import { trpc } from "@/lib/trpc";
import {
  availableBudgetCurrencies,
  isBudgetWarningPercent,
  isSupportedBudgetCurrency,
  normalizeBudgetAmount,
  normalizeBudgetCurrency,
} from "@shared/budget";

export function TripBudgetPanel({
  tripId,
  compact = false,
}: {
  tripId: number;
  compact?: boolean;
}) {
  const { isZh: zh } = useI18n();
  const id = useId();
  const utils = trpc.useUtils();
  const queryInput = useMemo(() => ({ tripId }), [tripId]);
  // Focus / mutation invalidation refresh the selected trip without a timed FX polling loop.
  const query = trpc.budgets.get.useQuery(queryInput, {
    retry: 1,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const [editing, setEditing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("HKD");
  const [warning, setWarning] = useState("80");
  const [formError, setFormError] = useState("");
  const saved = trpc.budgets.set.useMutation({
    onSuccess: async () => {
      // Global invalidation refreshes this panel AND analytics / other mounted trip consumers.
      await utils.invalidate();
      setEditing(false);
      toast.success(zh ? "旅程共用預算已儲存" : "Shared trip budget saved");
    },
  });
  const cleared = trpc.budgets.clear.useMutation({
    onSuccess: async () => {
      await utils.invalidate();
      setConfirmClear(false);
      setEditing(false);
      toast.success(
        zh
          ? "已清除預算，支出記錄保留不變"
          : "Budget cleared; expense records are unchanged"
      );
    },
  });
  const pending = saved.isPending || cleared.isPending;
  useEffect(() => {
    setEditing(false);
    setConfirmClear(false);
    setFormError("");
  }, [tripId]);
  const data = query.data;
  const choices = availableBudgetCurrencies(
    data?.baseCurrency ?? "HKD",
    data?.budget ?? null,
    data?.summary.originalTotals ?? {}
  );
  const money = (value: number | null, code: string) =>
    value === null || !Number.isFinite(value)
      ? "—"
      : `${code} ${value.toLocaleString(zh ? "zh-HK" : "en-HK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const openForm = () => {
    if (!data) return;
    setAmount(data.budget?.amount ?? "");
    const preferred = normalizeBudgetCurrency(
      data.budget?.currency ?? data.baseCurrency
    );
    setCurrency(preferred || "HKD");
    setWarning(String(data.budget?.warningPercent ?? 80));
    setFormError("");
    saved.reset();
    cleared.reset();
    setConfirmClear(false);
    setEditing(true);
  };
  const sectionClass = `voyage-panel space-y-4 ${compact ? "!p-4" : ""}`;
  const title = zh ? "旅程共用預算" : "Shared trip budget";
  if (query.isLoading)
    return (
      <section className={sectionClass} aria-label={title} aria-busy="true">
        <p
          className="flex items-center gap-2 text-sm text-muted-foreground"
          role="status"
        >
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {zh ? "正在載入預算…" : "Loading budget…"}
        </p>
      </section>
    );
  // Never render a stale cached amount as current when a refresh fails.
  if (query.isError || !data)
    return (
      <section className={sectionClass} aria-label={title}>
        <div
          role="alert"
          className="flex items-start gap-2 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            {zh
              ? "未能載入預算資料；不會將未知支出當作零。"
              : "Budget data could not load; unknown spending is not treated as zero."}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
        >
          {zh ? "重試" : "Retry"}
        </Button>
      </section>
    );
  const { budget, summary } = data;
  const target = normalizeBudgetCurrency(budget?.currency ?? data.baseCurrency);
  const statusLabel = {
    unset: zh ? "未設定" : "Not set",
    safe: zh ? "預算內" : "Within budget",
    near: zh ? "接近預算" : "Near budget",
    over: summary.complete
      ? zh
        ? "已達／超出預算"
        : "At / over budget"
      : zh
        ? "已知支出已達預算・資料不完整"
        : "Known spending at / over budget · incomplete",
    incomplete: zh ? "資料不完整" : "Incomplete data",
  }[summary.status];
  const color =
    summary.status === "safe"
      ? "text-emerald-700 dark:text-emerald-400"
      : summary.status === "over"
        ? "text-red-700 dark:text-red-400"
        : summary.status === "near" || summary.status === "incomplete"
          ? "text-amber-700 dark:text-amber-400"
          : "text-muted-foreground";
  const barColor =
    summary.status === "safe"
      ? "bg-emerald-500"
      : summary.status === "over"
        ? "bg-red-500"
        : "bg-amber-500";
  const rawPercent = budget
    ? (summary.utilization ??
      (summary.knownSpent / Number(budget.amount)) * 100)
    : null;
  const visiblePercent =
    rawPercent !== null && Number.isFinite(rawPercent)
      ? Math.max(0, Math.min(100, rawPercent))
      : 0;
  const percentText =
    rawPercent !== null && Number.isFinite(rawPercent)
      ? `${rawPercent.toLocaleString(zh ? "zh-HK" : "en-HK", { maximumFractionDigits: 2 })}%`
      : "—";
  const mutationError = saved.error || cleared.error;
  return (
    <section
      className={sectionClass}
      aria-labelledby={`${id}-title`}
      aria-busy={pending}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id={`${id}-title`}
            className="flex items-center gap-2 text-base font-semibold"
          >
            <Wallet
              className="h-5 w-5 shrink-0 text-primary"
              aria-hidden="true"
            />
            {title}
          </h2>
          <p className="mt-1 break-words text-xs text-muted-foreground">
            {data.tripName} ·{" "}
            {zh
              ? `${summary.expenseCount} 項支出記錄`
              : `${summary.expenseCount} expense records`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => query.refetch()}
            disabled={query.isFetching || pending}
            aria-label={zh ? "重新整理預算支出" : "Refresh budget spending"}
          >
            {query.isFetching && (
              <Loader2
                className="mr-1.5 h-3.5 w-3.5 animate-spin"
                aria-hidden="true"
              />
            )}
            {zh ? "重新整理" : "Refresh"}
          </Button>
          {data.canEdit && !editing && (
            <Button
              variant="outline"
              size="sm"
              onClick={openForm}
              disabled={pending}
            >
              <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {budget ? (zh ? "編輯" : "Edit") : zh ? "設定預算" : "Set budget"}
            </Button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`text-sm font-semibold ${color}`} role="status">
          {statusLabel}
        </span>
        {budget && (
          <span className="text-xs text-muted-foreground">
            {zh ? "提醒門檻" : "Warning at"} {budget.warningPercent}%
          </span>
        )}
      </div>
      {!budget && (
        <p className="text-sm text-muted-foreground">
          {zh
            ? "尚未設定共用預算。設定後可追蹤整個旅程的帳目。"
            : "No shared budget yet. Set one to track the whole trip ledger."}
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-3">
        <div className="voyage-metric !p-3">
          <p className="text-xs text-muted-foreground">
            {summary.complete
              ? zh
                ? "淨支出"
                : "Net spending"
              : zh
                ? "已知淨支出（部分）"
                : "Known net spending (partial)"}
          </p>
          <p className="mt-2 break-words text-lg font-semibold tabular-nums">
            {money(
              summary.complete ? summary.spent : summary.knownSpent,
              target
            )}
          </p>
        </div>
        <div className="voyage-metric !p-3">
          <p className="text-xs text-muted-foreground">
            {zh ? "預算" : "Budget"}
          </p>
          <p className="mt-2 break-words text-lg font-semibold tabular-nums">
            {budget ? money(Number(budget.amount), target) : "—"}
          </p>
        </div>
        <div className="voyage-metric !p-3">
          <p className="text-xs text-muted-foreground">
            {summary.remaining !== null && summary.remaining < 0
              ? zh
                ? "超出金額"
                : "Over by"
              : zh
                ? "餘額"
                : "Remaining"}
          </p>
          <p
            className={`mt-2 break-words text-lg font-semibold tabular-nums ${summary.remaining !== null && summary.remaining < 0 ? color : ""}`}
          >
            {money(
              summary.remaining === null ? null : Math.abs(summary.remaining),
              target
            )}
          </p>
          {!summary.complete && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {zh ? "未能確定" : "Cannot determine"}
            </p>
          )}
        </div>
      </div>
      {budget && rawPercent !== null && Number.isFinite(rawPercent) && (
        <div className="space-y-2">
          <div className="flex flex-wrap justify-between gap-2 text-xs">
            <span>
              {summary.complete
                ? zh
                  ? "預算使用率"
                  : "Budget used"
                : zh
                  ? "僅已知記錄的比例"
                  : "Known rows only"}
            </span>
            <span className={`font-semibold tabular-nums ${color}`}>
              {percentText}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label={
              summary.complete
                ? zh
                  ? "預算使用率"
                  : "Budget used"
                : zh
                  ? "僅已知記錄；資料不完整"
                  : "Known rows only; incomplete data"
            }
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={visiblePercent}
            aria-valuetext={`${statusLabel}: ${percentText}`}
            className="h-2.5 overflow-hidden rounded-full bg-muted"
          >
            <div
              className={`h-full rounded-full ${barColor}`}
              style={{ width: `${visiblePercent}%` }}
            />
          </div>
        </div>
      )}
      {!summary.complete && (
        <div
          role="note"
          className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-800 dark:text-amber-300"
        >
          <p className="font-semibold">
            {zh
              ? `${summary.unconvertedCount} 項尚未可靠換算；不顯示可用餘額或「預算內」。`
              : `${summary.unconvertedCount} rows have not been reliably converted; no available balance or “within budget” claim.`}
          </p>
          <p className="mt-1">
            {!budget
              ? zh
                ? "設定預算後才會取得歷史匯率。原幣小計保留在下方。"
                : "Historical FX is requested only after setting a budget. Original currency subtotals remain below."
              : zh
                ? "未知幣別、無效日期或估算匯率不計入已知支出。"
                : "Unknown codes, invalid dates and fallback rates are excluded from known spending."}{" "}
            {zh
              ? "缺少的記錄可能包括退款，因此部分金額並非支出的下限。"
              : "Missing rows may include refunds, so the partial amount is not a lower bound."}
          </p>
        </div>
      )}
      <details className="text-xs">
        <summary className="min-h-9 cursor-pointer py-2 font-medium text-muted-foreground">
          {zh ? "原幣小計與計算方式" : "Original subtotals & calculation"}
        </summary>
        <div className="space-y-2 pt-2">
          <div className="flex flex-wrap gap-2">
            {Object.entries(summary.originalTotals).map(([code, total]) => (
              <span
                key={code}
                className="rounded-md bg-muted px-2 py-1 text-foreground"
              >
                {money(total, code)}
                {!isSupportedBudgetCurrency(code) && (
                  <span className="ml-1 text-amber-700 dark:text-amber-400">
                    {zh ? "（不支援）" : "(unsupported)"}
                  </span>
                )}
              </span>
            ))}
            {!Object.keys(summary.originalTotals).length && (
              <span className="text-muted-foreground">
                {zh ? "尚無有效金額" : "No valid amounts yet"}
              </span>
            )}
          </div>
          <p className="leading-relaxed text-muted-foreground">
            {zh
              ? "只計旅程共用支出帳目，非個人分帳；退款按淨額扣減。不包括未記入帳目的活動估算或預訂費用。跨幣別使用每項支出日期的非備用歷史匯率（假期可用前一交易日）；日期按香港日曆讀取。同幣別加總不要求有效日期。"
              : "Shared trip expense ledger, not your personal split; refunds net subtract. Activity estimates and booking costs are excluded unless recorded in the ledger. Cross-currency rows use nonfallback historical rates for each expense date (a prior trading day may apply on holidays); dates follow the Hong Kong calendar. Same-currency totals do not require valid dates."}
          </p>
        </div>
      </details>
      {!data.canEdit && (
        <p className="text-xs text-muted-foreground">
          {zh
            ? "唯讀；只有旅程擁有者或編輯者可更改共用預算。"
            : "Read only; only trip owners and editors can change the shared budget."}
        </p>
      )}
      {mutationError && (
        <p role="alert" className="text-sm text-destructive">
          {zh
            ? "未能儲存更改，請重試。"
            : "Changes could not be saved. Please retry."}{" "}
          <span className="break-words text-xs">{mutationError.message}</span>
        </p>
      )}
      {editing && data.canEdit && (
        <form
          onSubmit={event => {
            event.preventDefault();
            const normalized = normalizeBudgetAmount(amount);
            if (!normalized) {
              setFormError(
                zh
                  ? "金額必須大於零，最多兩位小數，上限 9999999999.99。"
                  : "Amount must be positive, up to two decimals, maximum 9999999999.99."
              );
              return;
            }
            if (!isSupportedBudgetCurrency(currency)) {
              setFormError(
                zh
                  ? "請選擇支援的幣別。"
                  : "Please choose a supported currency."
              );
              return;
            }
            if (
              !/^\d{1,3}$/.test(warning) ||
              !isBudgetWarningPercent(Number(warning))
            ) {
              setFormError(
                zh
                  ? "提醒門檻必須為 1 至 100 的整數。"
                  : "Warning must be an integer from 1 to 100."
              );
              return;
            }
            setFormError("");
            saved.mutate({
              tripId,
              amount: normalized,
              currency,
              warningPercent: Number(warning),
            });
          }}
          className="space-y-3 border-t border-border pt-4"
        >
          <fieldset disabled={pending} className="space-y-3">
            <legend className="mb-3 text-sm font-semibold">
              {budget
                ? zh
                  ? "編輯共用預算"
                  : "Edit shared budget"
                : zh
                  ? "設定共用預算"
                  : "Set shared budget"}
            </legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-amount`}>
                  {zh ? "預算金額" : "Budget amount"}
                </Label>
                <Input
                  id={`${id}-amount`}
                  value={amount}
                  onChange={event => setAmount(event.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                  maxLength={32}
                  required
                  aria-describedby={`${id}-help`}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-currency`}>
                  {zh ? "預算幣別" : "Budget currency"}
                </Label>
                <select
                  id={`${id}-currency`}
                  value={currency}
                  onChange={event => setCurrency(event.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  required
                >
                  {choices.map(code => (
                    <option
                      key={code}
                      value={code}
                      disabled={!isSupportedBudgetCurrency(code)}
                    >
                      {code}
                      {!isSupportedBudgetCurrency(code)
                        ? zh
                          ? "（不支援）"
                          : " (unsupported)"
                        : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-warning`}>
                  {zh ? "提醒門檻 (%)" : "Warning threshold (%)"}
                </Label>
                <Input
                  id={`${id}-warning`}
                  value={warning}
                  onChange={event => setWarning(event.target.value)}
                  inputMode="numeric"
                  maxLength={3}
                  required
                />
              </div>
            </div>
            <p id={`${id}-help`} className="text-xs text-muted-foreground">
              {zh
                ? "金額須大於零，最多兩位小數。門檻為 1–100%；達到 100% 一律標示紅色。"
                : "Positive amount, up to two decimals. Threshold: 1–100%; reaching 100% is always red."}
            </p>
            {formError && (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={pending}>
                {saved.isPending && (
                  <Loader2
                    className="mr-2 h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                )}
                {zh ? "儲存預算" : "Save budget"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditing(false);
                  setConfirmClear(false);
                }}
                disabled={pending}
              >
                {zh ? "取消" : "Cancel"}
              </Button>
              {budget && (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => {
                    setConfirmClear(true);
                    cleared.reset();
                  }}
                  disabled={pending}
                >
                  {zh ? "清除預算" : "Clear budget"}
                </Button>
              )}
            </div>
            {confirmClear && (
              <div
                role="group"
                aria-label={zh ? "確認清除預算" : "Confirm clearing budget"}
                className="rounded-lg border border-border p-3"
              >
                <p className="mb-3 text-sm">
                  {zh
                    ? "清除整個旅程的共用預算？所有支出記錄會保留。"
                    : "Clear the shared budget for this trip? All expense records will remain."}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => cleared.mutate({ tripId })}
                    disabled={pending}
                  >
                    {cleared.isPending && (
                      <Loader2
                        className="mr-2 h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                    )}
                    {zh ? "確認清除" : "Confirm clear"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmClear(false)}
                    disabled={pending}
                  >
                    {zh ? "保留預算" : "Keep budget"}
                  </Button>
                </div>
              </div>
            )}
          </fieldset>
        </form>
      )}
    </section>
  );
}

export default TripBudgetPanel;
