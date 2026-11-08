import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { OverviewMetrics } from "@/components/TravelOverview";
import { TripBudgetPanel } from "@/components/TripBudgetPanel";
import {
  InsightChartTooltip,
  categorySharePercentage,
  formatChartPercentage,
} from "@/components/InsightChartTooltip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/hooks/useI18n";
import {
  useChartMotion,
  getChartAnimationKey,
  CHART_ANIMATION_DURATION,
  CHART_TOOLTIP_ANIMATION_DURATION,
  CHART_ANIMATION_EASING,
} from "@/hooks/useChartMotion";
import { trpc } from "@/lib/trpc";
import { formatDateOnlyInHongKong } from "@/lib/hongKongDate";
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  Compass,
  Globe2,
  Info,
  Plane,
  Receipt,
  RefreshCw,
  Wallet,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TravelOverviewTrip } from "@shared/analytics";

function ChartLoadingSkeleton({
  kind,
  zh,
  reducedMotion,
}: {
  kind: "category" | "annual";
  zh: boolean;
  reducedMotion: boolean;
}) {
  const label =
    kind === "category"
      ? zh
        ? "正在載入分類支出圖…"
        : "Loading spending categories…"
      : zh
        ? "正在載入年度趨勢圖…"
        : "Loading annual trends…";
  return (
    <section className="voyage-panel min-w-0" aria-busy="true">
      <p role="status" className="text-sm font-medium text-muted-foreground">
        {label}
      </p>
      <div
        aria-hidden="true"
        className="relative mt-5 h-52 overflow-hidden rounded-xl bg-muted/30"
      >
        <svg
          viewBox="0 0 320 180"
          preserveAspectRatio="none"
          className="h-full w-full text-primary/15"
        >
          <path
            d="M20 25H305 M20 75H305 M20 125H305 M20 160H305"
            stroke="var(--border)"
            fill="none"
          />
          {kind === "category" ? (
            <g fill="currentColor">
              <rect x="40" y="90" width="30" height="70" rx="4" />
              <rect x="95" y="45" width="30" height="115" rx="4" />
              <rect x="150" y="75" width="30" height="85" rx="4" />
              <rect x="205" y="110" width="30" height="50" rx="4" />
              <rect x="260" y="65" width="30" height="95" rx="4" />
            </g>
          ) : (
            <g
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
              fill="none"
            >
              <path d="M25 135L85 105L145 120L205 65L300 40" />
              <path
                d="M25 150L85 130L145 135L205 110L300 80"
                strokeDasharray="6 5"
              />
            </g>
          )}
        </svg>
        <div
          className="analytics-chart-shimmer pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-card/70 to-transparent"
          style={{
            animation: reducedMotion
              ? "none"
              : "analytics-chart-shimmer 1200ms linear infinite",
          }}
        />
      </div>
    </section>
  );
}

function TripProgress({ trip }: { trip: TravelOverviewTrip }) {
  const { lang } = useI18n();
  const zh = lang === "zh";
  const status = {
    past: zh ? "日期已過" : "Past dates",
    current: zh ? "旅程期間" : "Current dates",
    upcoming: zh ? "即將出發" : "Upcoming",
    undated: zh ? "日期需修正" : "Dates need attention",
  };
  const progress = trip.datedDays
    ? Math.min(100, (trip.scheduledDays / trip.datedDays) * 100)
    : 0;
  const missing = [
    {
      show: trip.datedDays === null,
      label: zh ? "修正旅程日期" : "Review trip dates",
      href: "/dashboard",
    },
    {
      show: trip.datedDays !== null && trip.scheduledDays < trip.datedDays,
      label: zh ? "安排每日活動" : "Plan remaining days",
      href: `/trips/${trip.id}/itinerary`,
    },
    {
      show: trip.expenseCount === 0,
      label: zh ? "加入帳目" : "Record expenses",
      href: `/trips/${trip.id}/expenses`,
    },
    {
      show: trip.flightCount === 0 || trip.hotelCount === 0,
      label: zh ? "查看交通／住宿" : "Review flights / stays",
      href: `/trips/${trip.id}/flights`,
    },
    {
      show: trip.pinCount === 0,
      label: zh ? "加入地圖收藏" : "Add map pins",
      href: `/trips/${trip.id}/map`,
    },
  ].filter(item => item.show);
  return (
    <article className="rounded-2xl border border-border bg-card p-4 text-card-foreground sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-foreground">{trip.name}</h3>
            {trip.isDemoTrip && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800">
                {zh ? "示範" : "Demo"}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{trip.destination}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium ${trip.status === "current" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
        >
          {status[trip.status]}
        </span>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {formatDateOnlyInHongKong(trip.startDate, lang) || "—"} –{" "}
        {formatDateOnlyInHongKong(trip.endDate, lang) || "—"}
      </p>
      <div className="mt-4 flex items-center justify-between gap-3 text-xs">
        <span className="font-medium">
          {zh ? "已有活動的日子" : "Days with activities"}
        </span>
        <span>
          {trip.scheduledDays} / {trip.datedDays ?? "—"}
        </span>
      </div>
      {trip.datedDays !== null && (
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label={zh ? "已安排活動天數" : "Scheduled activity days"}
          aria-valuemin={0}
          aria-valuemax={trip.datedDays}
          aria-valuenow={trip.scheduledDays}
        >
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
        <span>
          {trip.activityCount} {zh ? "項活動" : "activities"}
        </span>
        <span>
          {trip.expenseCount} {zh ? "項支出" : "expenses"}
        </span>
        <span>
          {trip.flightCount} {zh ? "段航班" : "flight legs"}
        </span>
        <span>
          {trip.hotelCount} {zh ? "項住宿" : "stays"}
        </span>
        <span>
          {trip.memberCount} {zh ? "位成員" : "members"}
        </span>
        <span>
          {trip.pinCount} {zh ? "個收藏" : "pins"}
        </span>
      </div>
      <div className="mt-3 space-y-1 text-xs">
        {trip.actualExpenses.currencies.length > 0 ? (
          <p className="text-foreground">
            {zh ? "已記錄支出" : "Recorded expenses"}:{" "}
            {trip.actualExpenses.currencies
              .map(
                row =>
                  `${row.currency} ${row.total.toLocaleString(zh ? "zh-HK" : "en-HK", { maximumFractionDigits: 2 })}`
              )
              .join(" · ")}
          </p>
        ) : (
          <p className="text-muted-foreground">
            {zh ? "未有支出記錄" : "No expense records"}
          </p>
        )}
        {trip.activityEstimates.currencies.length > 0 && (
          <p className="text-muted-foreground">
            {zh
              ? "活動費用估算（非額外支出）"
              : "Activity estimates (not additional spend)"}
            :{" "}
            {trip.activityEstimates.currencies
              .map(
                row =>
                  `${row.currency} ${row.total.toLocaleString(zh ? "zh-HK" : "en-HK", { maximumFractionDigits: 2 })}`
              )
              .join(" · ")}
          </p>
        )}
      </div>
      {(trip.invalidItineraryDates > 0 ||
        trip.invalidFlightDates > 0 ||
        trip.actualExpenses.invalidMoneyRecords > 0) && (
        <p className="mt-3 text-xs text-amber-700">
          {zh
            ? `需檢查：${trip.invalidItineraryDates} 個日子／${trip.invalidFlightDates} 段航班日期／${trip.actualExpenses.invalidMoneyRecords} 項金額記錄`
            : `Review: ${trip.invalidItineraryDates} itinerary dates / ${trip.invalidFlightDates} flight dates / ${trip.actualExpenses.invalidMoneyRecords} monetary records`}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
        {missing.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className="inline-flex min-h-9 items-center gap-1 rounded-full bg-primary/5 px-3 text-[11px] font-medium text-primary hover:bg-primary/10"
          >
            {item.label}
            <ChevronRight className="h-3 w-3" />
          </Link>
        ))}
        {missing.length === 0 && (
          <span className="inline-flex items-center gap-1.5 text-xs text-primary">
            <Check className="h-3.5 w-3.5" />
            {zh
              ? "每日均有活動與基本記錄"
              : "Each day has activities and basic records"}
          </span>
        )}
        <Link
          href={`/trips/${trip.id}/itinerary`}
          className="ml-auto inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-primary"
        >
          {zh ? "打開" : "Open"}
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </article>
  );
}

export default function Analytics() {
  const { user, loading: authLoading } = useAuth();
  const { lang } = useI18n();
  const zh = lang === "zh";
  const [year, setYear] = useState("all");
  const [currency, setCurrency] = useState("HKD");
  const [budgetTripId, setBudgetTripId] = useState<number | null>(null);
  const reducedMotion = useChartMotion();
  // Recharts hover mode supports dragging; click mode keeps a touch tap visible.
  const [chartTrigger, setChartTrigger] = useState<"hover" | "click">("hover");
  const chartPointerHandlers = {
    onPointerDownCapture: (event: React.PointerEvent<HTMLDivElement>) =>
      setChartTrigger(event.pointerType === "mouse" ? "hover" : "click"),
    onPointerMoveCapture: (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "mouse") setChartTrigger("hover");
    },
    onKeyDownCapture: () => setChartTrigger("hover"),
  };
  const query = trpc.analytics.overview.useQuery(
    year === "all" ? undefined : { year: Number(year) },
    { enabled: !!user, retry: 1 }
  );
  const data = query.data;
  // Never carry an inaccessible/out-of-filter trip into the budget query.
  const budgetTrip = data?.trips.find(trip => trip.id === budgetTripId) ?? data?.trips[0];
  const currencyOptions = data?.actualExpenses.currencies ?? [];
  const selectedCurrency =
    currencyOptions.find(item => item.currency === currency) ??
    currencyOptions.find(item => item.currency === "HKD") ??
    currencyOptions[0];
  const formatMoney = (amount: number | null | undefined) =>
    amount === null || amount === undefined
      ? "—"
      : amount.toLocaleString(zh ? "zh-HK" : "en-HK", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
  const spendingChart = useMemo(() => {
    const categoryNames: Record<string, string> = {
      transport: zh ? "交通" : "Transport",
      food: zh ? "餐飲" : "Food",
      accommodation: zh ? "住宿" : "Accommodation",
      attraction: zh ? "景點" : "Attractions",
      shopping: zh ? "購物" : "Shopping",
      other: zh ? "其他" : "Other",
    };
    return (
      selectedCurrency?.categories.map(row => ({
        ...row,
        name: categoryNames[row.category] ?? row.category,
      })) ?? []
    );
  }, [selectedCurrency?.categories, zh]);
  const spendingChartKey = getChartAnimationKey(
    `categories:${year}:${selectedCurrency?.currency ?? "none"}`,
    selectedCurrency?.categories ?? []
  );
  const annualChartKey = getChartAnimationKey(
    `annual:${year}`,
    data?.annualTrend ?? []
  );
  const counts = data?.counts;
  const statusChart = useMemo(
    () =>
      counts
        ? [
            { name: zh ? "日期已過" : "Past", count: counts.pastTrips },
            { name: zh ? "旅程期間" : "Current", count: counts.currentTrips },
            { name: zh ? "即將出發" : "Upcoming", count: counts.upcomingTrips },
            {
              name: zh ? "未有有效日期" : "Undated",
              count: counts.undatedTrips,
            },
          ]
        : [],
    [counts, zh]
  );

  return (
    <AppLayout>
      <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 pb-28 sm:px-6 lg:py-8 lg:pb-10">
        <style>{`
          @keyframes analytics-chart-shimmer {
            from { transform: translateX(0); }
            to { transform: translateX(300%); }
          }
          @media (prefers-reduced-motion: reduce) {
            .analytics-chart-shimmer { animation: none !important; }
          }
        `}</style>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="voyage-eyebrow mb-2">
              {zh ? "真實記錄 · 旅遊洞察" : "YOUR RECORDS · TRAVEL INSIGHTS"}
            </p>
            <h1 className="text-3xl font-bold tracking-tight">
              {zh ? "回望旅程，發現更多。" : "Your journeys, in perspective."}
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
              {zh
                ? "只使用你參與的旅程與個人足跡；不換算幣別，也不把計劃當成已到訪。"
                : "Your member trips and personal records only. No currency conversion, and plans are never counted as places visited."}
            </p>
          </div>
          {user && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => query.refetch()}
              disabled={query.isFetching}
            >
              <RefreshCw
                className={`mr-2 h-3.5 w-3.5 ${query.isFetching && !reducedMotion ? "animate-spin motion-reduce:animate-none" : ""}`}
              />
              {query.isFetching
                ? zh
                  ? "更新中…"
                  : "Refreshing…"
                : zh
                  ? "更新分析"
                  : "Refresh"}
            </Button>
          )}
        </header>
        {authLoading ? (
          <Skeleton className="h-40 rounded-2xl motion-reduce:animate-none" />
        ) : !user ? (
          <section className="voyage-panel py-10">
            <Compass className="mb-4 h-8 w-8 text-primary" />
            <h2 className="text-xl font-semibold">
              {zh
                ? "登入後查看你的旅遊記錄"
                : "Sign in to explore your travel records"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {zh
                ? "訪客行程不會混入個人分析；你仍可在首頁繼續規劃。"
                : "Guest plans are not mixed into personal insights. You can continue planning on the dashboard."}
            </p>
            <Button asChild className="mt-5">
              <Link href="/dashboard">
                {zh ? "前往首頁" : "Go to dashboard"}
                <ArrowUpRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </section>
        ) : (
          <>
            <section className="voyage-panel flex flex-wrap items-center gap-3">
              <label htmlFor="analytics-year" className="text-sm font-medium">
                {zh ? "旅程出發年份" : "Trip departure year"}
              </label>
              <select
                id="analytics-year"
                className="h-10 rounded-xl border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                value={year}
                onChange={event => setYear(event.target.value)}
              >
                <option value="all">{zh ? "全部年份" : "All years"}</option>
                {data?.availableYears.map(value => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
              <span className="ml-auto text-[11px] text-muted-foreground">
                {zh
                  ? `香港時間 · ${data?.today ?? "—"} · UTC+8`
                  : `Hong Kong · ${data?.today ?? "—"} · UTC+8`}
              </span>
            </section>
            {query.isError && (
              <div role="alert" className="voyage-panel border-destructive/30">
                <p className="font-semibold text-destructive">
                  {zh
                    ? "暫時未能取得旅遊分析"
                    : "Travel insights are unavailable"}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {zh
                    ? "資料沒有被改動；未取得的統計會保留「—」，不會顯示虛假的零。"
                    : "Your records are unchanged. Unavailable statistics remain — rather than false zeros."}
                </p>
                <Button
                  className="mt-4"
                  onClick={() => query.refetch()}
                  disabled={query.isFetching}
                >
                  {zh ? "重新載入" : "Try again"}
                </Button>
              </div>
            )}
            <div
              role="status"
              aria-live="polite"
              className={
                query.isFetching && data
                  ? "text-xs text-muted-foreground"
                  : "sr-only"
              }
            >
              {query.isFetching && data
                ? zh
                  ? "正在更新分析；下方保留上次載入的記錄。"
                  : "Refreshing insights; previously loaded records remain visible below."
                : ""}
            </div>
            <OverviewMetrics data={data} loading={query.isLoading && !data} />
            {query.isLoading && !data ? (
              <div className="grid gap-5 lg:grid-cols-2">
                <ChartLoadingSkeleton
                  kind="category"
                  zh={zh}
                  reducedMotion={reducedMotion}
                />
                <ChartLoadingSkeleton
                  kind="annual"
                  zh={zh}
                  reducedMotion={reducedMotion}
                />
                <Skeleton className="h-72 rounded-2xl motion-reduce:animate-none" />
                <Skeleton className="h-72 rounded-2xl motion-reduce:animate-none" />
              </div>
            ) : data ? (
              <>
                <section className="space-y-3" aria-label={zh ? "旅程預算追蹤" : "Trip budget tracking"}>
                  <div className="voyage-panel flex flex-wrap items-center gap-3">
                    <label htmlFor="analytics-budget-trip" className="text-sm font-medium">{zh ? "預算追蹤行程" : "Track a trip budget"}</label>
                    <select id="analytics-budget-trip" value={budgetTrip?.id ?? "none"} disabled={!data.trips.length} onChange={event => setBudgetTripId(Number(event.target.value))} className="h-10 min-w-0 max-w-full flex-1 rounded-xl border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                      {data.trips.length ? data.trips.map(trip => <option key={trip.id} value={trip.id}>{trip.name}</option>) : <option value="none">{zh ? "此年份未有行程" : "No trips for this year"}</option>}
                    </select>
                    <p className="w-full text-xs leading-relaxed text-muted-foreground">{zh ? "與費用頁共用同一預算，毋須再次輸入。只計已記帳支出；可在此設定門檻，達到門檻以琥珀色提示，達到或超過總預算以紅色提示。" : "Uses the same budget as the expense page, with no re-entry. Only ledger expenses count. Amber warns at your threshold; red indicates the total budget has been reached or exceeded."}</p>
                  </div>
                  {budgetTrip && <TripBudgetPanel key={budgetTrip.id} tripId={budgetTrip.id} />}
                </section>
                <section className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
                  <div className="voyage-panel min-w-0">
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div>
                        <p className="voyage-eyebrow mb-1">
                          {zh ? "帳目，而非預算" : "LEDGER, NOT BUDGET"}
                        </p>
                        <h2 className="voyage-section-title">
                          {zh ? "已記錄支出" : "Recorded expenses"}
                        </h2>
                      </div>
                      <Wallet className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label
                        htmlFor="analytics-currency"
                        className="text-xs text-muted-foreground"
                      >
                        {zh ? "分開查看幣別" : "View one currency"}
                      </label>
                      <select
                        id="analytics-currency"
                        disabled={currencyOptions.length === 0}
                        className="h-9 rounded-xl border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        value={selectedCurrency?.currency ?? "none"}
                        onChange={event => setCurrency(event.target.value)}
                      >
                        {currencyOptions.length ? (
                          currencyOptions.map(row => (
                            <option key={row.currency} value={row.currency}>
                              {row.currency}
                            </option>
                          ))
                        ) : (
                          <option value="none">
                            {zh ? "未有記錄" : "No records"}
                          </option>
                        )}
                      </select>
                    </div>
                    {selectedCurrency ? (
                      <>
                        <div className="mt-5 flex items-end gap-2">
                          <span className="mb-1 text-sm font-medium text-primary">
                            {selectedCurrency.currency}
                          </span>
                          <p className="text-3xl font-semibold tracking-tight sm:text-4xl">
                            {formatMoney(selectedCurrency.total)}
                          </p>
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                          {zh
                            ? `${selectedCurrency.recordCount} 項有效金額記錄，包含共用帳目；不是你的個人應付額。退款以負數計。`
                            : `${selectedCurrency.recordCount} valid monetary records from the shared ledger, not your personal share. Refunds reduce totals.`}
                        </p>
                        <div className="mt-5 grid grid-cols-2 gap-4 border-y border-border py-4">
                          <div>
                            <p className="text-xs text-muted-foreground">
                              {zh ? "平均每項記錄" : "Per recorded expense"}
                            </p>
                            <p className="mt-1 text-lg font-semibold">
                              {formatMoney(selectedCurrency.averagePerExpense)}
                            </p>
                            <p className="mt-1 text-[10px] text-muted-foreground">
                              {zh
                                ? `總额 ÷ ${selectedCurrency.recordCount} 項`
                                : `Total ÷ ${selectedCurrency.recordCount} records`}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">
                              {zh
                                ? "平均每個有帳目日期"
                                : "Per day with records"}
                            </p>
                            <p className="mt-1 text-lg font-semibold">
                              {formatMoney(
                                selectedCurrency.averagePerRecordedDay
                              )}
                            </p>
                            <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                              {zh
                                ? `有效日期金額 ${formatMoney(selectedCurrency.datedTotal)} ÷ ${selectedCurrency.recordedDays} 個日期`
                                : `Dated amount ${formatMoney(selectedCurrency.datedTotal)} ÷ ${selectedCurrency.recordedDays} dates`}
                            </p>
                          </div>
                        </div>
                        <div
                          className="mt-5 h-56"
                          role="group"
                          aria-busy={query.isFetching}
                          aria-describedby="analytics-category-help"
                          {...chartPointerHandlers}
                          aria-label={
                            zh
                              ? `${selectedCurrency.currency} 分類支出圖`
                              : `${selectedCurrency.currency} spending by category`
                          }
                        >
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              key={spendingChartKey}
                              data={spendingChart}
                              accessibilityLayer
                              margin={{
                                top: 8,
                                right: 4,
                                left: -12,
                                bottom: 4,
                              }}
                            >
                              <CartesianGrid
                                strokeDasharray="3 3"
                                vertical={false}
                                stroke="var(--border)"
                              />
                              <XAxis
                                dataKey="name"
                                tick={{ fontSize: 10 }}
                                axisLine={false}
                                tickLine={false}
                                interval={0}
                              />
                              <YAxis
                                tick={{ fontSize: 10 }}
                                axisLine={false}
                                tickLine={false}
                              />
                              <Tooltip
                                trigger={chartTrigger}
                                content={
                                  <InsightChartTooltip
                                    kind="category"
                                    lang={lang}
                                    currency={selectedCurrency.currency}
                                    total={selectedCurrency.total}
                                    categories={spendingChart}
                                  />
                                }
                                cursor={{
                                  fill: "var(--primary)",
                                  fillOpacity: 0.06,
                                }}
                                isAnimationActive={!reducedMotion}
                                animationDuration={
                                  CHART_TOOLTIP_ANIMATION_DURATION
                                }
                                animationEasing={CHART_ANIMATION_EASING}
                                allowEscapeViewBox={{ x: false, y: false }}
                                wrapperStyle={{
                                  outline: "none",
                                  maxWidth: "calc(100vw - 3rem)",
                                  zIndex: 10,
                                }}
                              />
                              <Bar
                                dataKey="total"
                                fill="#0d766e"
                                radius={[5, 5, 0, 0]}
                                maxBarSize={48}
                                activeBar={{
                                  fill: "#145b50",
                                  stroke: "var(--primary)",
                                  strokeWidth: 2,
                                }}
                                isAnimationActive={!reducedMotion}
                                animationBegin={0}
                                animationDuration={CHART_ANIMATION_DURATION}
                                animationEasing={CHART_ANIMATION_EASING}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                        <p
                          id="analytics-category-help"
                          className="mt-2 text-[11px] text-muted-foreground"
                        >
                          {zh
                            ? "懸停或輕觸查看詳情；也可用下方數據表查看。"
                            : "Hover or tap for details, or use the data table below."}
                        </p>
                        <details className="mt-2 text-xs text-muted-foreground">
                          <summary className="min-h-11 cursor-pointer rounded-lg py-3 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            {zh
                              ? "查看分類圖表數據"
                              : "View category chart data"}
                          </summary>
                          <div
                            tabIndex={0}
                            role="region"
                            aria-label={
                              zh ? "分類支出數據" : "Category spending data"
                            }
                            className="overflow-x-auto rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <table className="mt-2 w-full text-left text-card-foreground">
                              <caption className="pb-2 text-left text-[11px] text-muted-foreground">
                                {zh
                                  ? `${selectedCurrency.currency} 原始幣別淨額 · 所選旅程年份`
                                  : `${selectedCurrency.currency} original-currency net amounts · selected trip year`}
                              </caption>
                              <thead>
                                <tr className="border-b border-border">
                                  <th scope="col" className="py-2 pr-3">
                                    {zh ? "分類" : "Category"}
                                  </th>
                                  <th
                                    scope="col"
                                    className="py-2 pr-3 text-right"
                                  >
                                    {zh ? "金額" : "Amount"} (
                                    {selectedCurrency.currency})
                                  </th>
                                  <th
                                    scope="col"
                                    className="py-2 pr-3 text-right"
                                  >
                                    {zh ? "支出記錄數" : "Expense count"}
                                  </th>
                                  <th scope="col" className="py-2 text-right">
                                    {zh ? "佔淨額" : "Share of net total"}
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {spendingChart.map(row => {
                                  const share = categorySharePercentage(
                                    row.total,
                                    selectedCurrency.total,
                                    spendingChart
                                  );
                                  return (
                                    <tr
                                      key={row.category}
                                      className="border-b border-border/50"
                                    >
                                      <th
                                        scope="row"
                                        className="py-2 pr-3 font-medium"
                                      >
                                        {row.name}
                                      </th>
                                      <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums">
                                        {formatMoney(row.total)}
                                      </td>
                                      <td className="py-2 pr-3 text-right tabular-nums">
                                        {row.recordCount.toLocaleString(
                                          zh ? "zh-HK" : "en-HK"
                                        )}
                                      </td>
                                      <td className="py-2 text-right tabular-nums">
                                        {share === null
                                          ? "—"
                                          : formatChartPercentage(share, lang)}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                          <p className="mt-2 text-[11px] leading-relaxed">
                            {zh
                              ? "佔比只在同幣別總額為正數、所有分類淨額非負數時顯示；否則為 —。退款以負數計。"
                              : "Shares appear only for a positive same-currency total with no negative category net amounts; otherwise —. Refunds reduce totals."}
                          </p>
                        </details>
                      </>
                    ) : (
                      <div className="my-10 rounded-2xl bg-muted/60 p-6 text-center">
                        <Receipt className="mx-auto mb-3 h-8 w-8 text-primary" />
                        <p className="text-sm font-medium">
                          {zh
                            ? "尚未有有效帳目可分析"
                            : "No valid expense records yet"}
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {zh
                            ? "在旅程中加入支出，即可查看分類與平均。"
                            : "Add expenses to a trip to see categories and averages."}
                        </p>
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {currencyOptions.map(row => (
                        <button
                          key={row.currency}
                          onClick={() => setCurrency(row.currency)}
                          className={`rounded-full border px-3 py-2 text-[11px] ${row.currency === selectedCurrency?.currency ? "border-primary/25 bg-primary/5 text-primary" : "border-border text-muted-foreground"}`}
                        >
                          {row.currency} {formatMoney(row.total)}
                        </button>
                      ))}
                    </div>
                    <div className="mt-4 rounded-xl bg-muted/50 p-3 text-[11px] leading-relaxed text-muted-foreground">
                      <Info className="mb-1 h-3.5 w-3.5" />
                      {zh
                        ? "不同幣別不相加。年度篩選按旅程出發年份，帳目包含該旅程所有已記錄日期。每日期平均不包含無效日期帳目。"
                        : "Currencies are never added together. The year filter selects trips by departure year and includes all their ledger dates. Per-day averages exclude invalid dates."}
                      {data.actualExpenses.invalidMoneyRecords > 0 ||
                      data.actualExpenses.invalidDateRecords > 0 ? (
                        <p className="mt-1 text-amber-700">
                          {zh
                            ? `有 ${data.actualExpenses.invalidMoneyRecords} 項無效金額／幣別、${data.actualExpenses.invalidDateRecords} 項無效日期，已從相應計算排除。`
                            : `${data.actualExpenses.invalidMoneyRecords} invalid amount / currency records and ${data.actualExpenses.invalidDateRecords} invalid dates are excluded from the respective calculations.`}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="space-y-5">
                    <div className="voyage-panel">
                      <div className="mb-4 flex items-center justify-between">
                        <h2 className="voyage-section-title">
                          {zh ? "旅程日期狀態" : "Trip date status"}
                        </h2>
                        <CalendarDays className="h-5 w-5 text-primary" />
                      </div>
                      {data.counts.trips ? (
                        <div
                          className="h-44"
                          role="img"
                          aria-label={
                            zh ? "旅程日期狀態分佈" : "Trip status distribution"
                          }
                        >
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={statusChart}
                              layout="vertical"
                              margin={{ top: 4, right: 18, left: 6, bottom: 0 }}
                            >
                              <XAxis
                                type="number"
                                allowDecimals={false}
                                tick={{ fontSize: 10 }}
                                axisLine={false}
                                tickLine={false}
                              />
                              <YAxis
                                type="category"
                                dataKey="name"
                                width={zh ? 92 : 68}
                                tick={{ fontSize: 11 }}
                                axisLine={false}
                                tickLine={false}
                              />
                              <Tooltip
                                formatter={(value: number) => [
                                  value,
                                  zh ? "旅程" : "Trips",
                                ]}
                                contentStyle={{
                                  borderRadius: 14,
                                  fontSize: 12,
                                }}
                                isAnimationActive={!reducedMotion}
                                animationDuration={
                                  CHART_TOOLTIP_ANIMATION_DURATION
                                }
                                animationEasing={CHART_ANIMATION_EASING}
                              />
                              <Bar
                                dataKey="count"
                                fill="#163c4f"
                                radius={[0, 5, 5, 0]}
                                maxBarSize={20}
                                isAnimationActive={!reducedMotion}
                                animationDuration={CHART_ANIMATION_DURATION}
                                animationEasing={CHART_ANIMATION_EASING}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <p className="py-8 text-sm text-muted-foreground">
                          {zh ? "此範圍未有旅程。" : "No trips in this period."}
                        </p>
                      )}
                      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                        {zh
                          ? "依香港今天及有效起迄日期判斷；日期已過不代表實際到訪。"
                          : "Based on valid dates and today in Hong Kong. Past dates do not confirm a visit."}
                      </p>
                    </div>
                    <div className="voyage-panel">
                      <p className="voyage-eyebrow mb-1">
                        {zh
                          ? "計劃費用 · 獨立呈現"
                          : "PLANNED COSTS · SEPARATE"}
                      </p>
                      <h2 className="voyage-section-title">
                        {zh ? "活動費用估算" : "Activity cost estimates"}
                      </h2>
                      {data.activityEstimates.currencies.length ? (
                        <div className="mt-4 space-y-3">
                          {data.activityEstimates.currencies.map(row => (
                            <div
                              key={row.currency}
                              className="flex items-center justify-between gap-3"
                            >
                              <span className="text-sm font-medium">
                                {row.currency}
                              </span>
                              <div className="text-right">
                                <p className="text-lg font-semibold">
                                  {formatMoney(row.total)}
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                  {row.recordCount}{" "}
                                  {zh ? "項已填費用活動" : "costed activities"}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-4 text-sm text-muted-foreground">
                          {zh
                            ? "活動尚未填寫可計算費用。"
                            : "No numeric activity cost estimates yet."}
                        </p>
                      )}
                      <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
                        {zh
                          ? "來自活動費用欄，並非已支付金額或完整預算；不與帳目相加。未填幣別時使用該旅程基礎幣別。"
                          : "From activity cost fields, not payments or a complete budget. Never added to ledger totals. Missing currency uses the trip base currency."}
                      </p>
                      {data.activityEstimates.invalidRecords > 0 && (
                        <p className="mt-2 text-xs text-amber-700">
                          {zh
                            ? `排除 ${data.activityEstimates.invalidRecords} 項文字／無效費用。`
                            : `${data.activityEstimates.invalidRecords} text / invalid costs excluded.`}
                        </p>
                      )}
                    </div>
                  </div>
                </section>
                <section className="voyage-panel min-w-0">
                  <div className="mb-5">
                    <p className="voyage-eyebrow mb-1">
                      {zh ? "所有已記錄年份" : "ALL RECORDED YEARS"}
                    </p>
                    <h2 className="voyage-section-title">
                      {zh ? "年度旅遊足跡" : "Travel through the years"}
                    </h2>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      {zh
                        ? "旅程按出發年；旅程航班按航班日期；護照按香港飛行日期。兩種航班記錄可重疊，不相加。"
                        : "Trips use departure year; trip flights use flight date; passport records use Hong Kong flight date. Flight series can overlap and are not added together."}
                    </p>
                  </div>
                  {data.annualTrend.length ? (
                    <>
                      <div
                        className="h-64 sm:h-72"
                        role="group"
                        aria-busy={query.isFetching}
                        aria-describedby="analytics-annual-help"
                        {...chartPointerHandlers}
                        aria-label={
                          zh
                            ? "年度旅程及航班趨勢圖"
                            : "Annual trip and flight trends"
                        }
                      >
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart
                            key={annualChartKey}
                            data={data.annualTrend}
                            accessibilityLayer
                            margin={{ top: 8, right: 15, left: -18, bottom: 4 }}
                          >
                            <CartesianGrid
                              strokeDasharray="3 3"
                              vertical={false}
                              stroke="var(--border)"
                            />
                            <XAxis
                              dataKey="year"
                              tick={{ fontSize: 11 }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <YAxis
                              allowDecimals={false}
                              tick={{ fontSize: 10 }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <Tooltip
                              trigger={chartTrigger}
                              content={
                                <InsightChartTooltip
                                  kind="annual"
                                  lang={lang}
                                />
                              }
                              cursor={{
                                stroke: "var(--primary)",
                                strokeOpacity: 0.3,
                                strokeDasharray: "4 4",
                              }}
                              isAnimationActive={!reducedMotion}
                              animationDuration={
                                CHART_TOOLTIP_ANIMATION_DURATION
                              }
                              animationEasing={CHART_ANIMATION_EASING}
                              allowEscapeViewBox={{ x: false, y: false }}
                              wrapperStyle={{
                                outline: "none",
                                maxWidth: "calc(100vw - 3rem)",
                                zIndex: 10,
                              }}
                            />
                            <Legend
                              wrapperStyle={{ fontSize: 11, paddingTop: 12 }}
                            />
                            <Line
                              type="monotone"
                              dataKey="trips"
                              name={zh ? "旅程" : "Trips"}
                              stroke="#0d766e"
                              strokeWidth={2.5}
                              dot={{ r: 4 }}
                              activeDot={{
                                r: 6,
                                fill: "#0d766e",
                                stroke: "var(--card)",
                                strokeWidth: 2,
                              }}
                              isAnimationActive={!reducedMotion}
                              animationBegin={0}
                              animationDuration={CHART_ANIMATION_DURATION}
                              animationEasing={CHART_ANIMATION_EASING}
                            />
                            <Line
                              type="monotone"
                              dataKey="tripFlights"
                              name={zh ? "旅程航班記錄" : "Trip flight records"}
                              stroke="#163c4f"
                              strokeWidth={2}
                              dot={{ r: 3 }}
                              activeDot={{
                                r: 5,
                                fill: "#163c4f",
                                stroke: "var(--card)",
                                strokeWidth: 2,
                              }}
                              isAnimationActive={!reducedMotion}
                              animationBegin={0}
                              animationDuration={CHART_ANIMATION_DURATION}
                              animationEasing={CHART_ANIMATION_EASING}
                            />
                            <Line
                              type="monotone"
                              dataKey="passportFlights"
                              name={zh ? "個人飛行護照" : "Personal passport"}
                              stroke="#bd8736"
                              strokeWidth={2}
                              strokeDasharray="5 4"
                              dot={{ r: 3 }}
                              activeDot={{
                                r: 5,
                                fill: "#bd8736",
                                stroke: "var(--card)",
                                strokeWidth: 2,
                              }}
                              isAnimationActive={!reducedMotion}
                              animationBegin={0}
                              animationDuration={CHART_ANIMATION_DURATION}
                              animationEasing={CHART_ANIMATION_EASING}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                      <p
                        id="analytics-annual-help"
                        className="mt-2 text-[11px] text-muted-foreground"
                      >
                        {zh
                          ? "懸停或輕觸年份查看三組記錄；也可用方向鍵或下方數據表查看。"
                          : "Hover or tap a year for all three series; arrow keys and the table below also work."}
                      </p>
                      <details className="mt-4 text-xs text-muted-foreground">
                        <summary className="min-h-11 cursor-pointer rounded-lg py-3 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          {zh ? "查看圖表數據" : "View chart data"}
                        </summary>
                        <div
                          tabIndex={0}
                          role="region"
                          aria-label={
                            zh ? "年度旅遊數據" : "Annual travel data"
                          }
                          className="overflow-x-auto rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <table className="mt-2 w-full text-left">
                            <caption className="sr-only">
                              {zh
                                ? "所有年份的旅程及航班記錄數；航班記錄可能重疊，不相加。"
                                : "Trip and flight record counts for all years; flight series may overlap and are not added together."}
                            </caption>
                            <thead>
                              <tr className="border-b border-border">
                                <th scope="col" className="py-2">
                                  {zh ? "年份" : "Year"}
                                </th>
                                <th scope="col">{zh ? "旅程" : "Trips"}</th>
                                <th scope="col">
                                  {zh ? "旅程航班" : "Trip flights"}
                                </th>
                                <th scope="col">{zh ? "護照" : "Passport"}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {data.annualTrend.map(row => (
                                <tr
                                  key={row.year}
                                  className="border-b border-border/50"
                                >
                                  <th scope="row" className="py-2 font-medium">
                                    {row.year}
                                  </th>
                                  <td>{row.trips}</td>
                                  <td>{row.tripFlights}</td>
                                  <td>{row.passportFlights}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    </>
                  ) : (
                    <p className="py-10 text-center text-sm text-muted-foreground">
                      {zh
                        ? "加入有效日期的旅程或飛行記錄，年度圖便會出現。"
                        : "Add trips or flights with valid dates to build your annual timeline."}
                    </p>
                  )}
                </section>
                <section className="grid gap-5 md:grid-cols-2">
                  <div className="voyage-panel">
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <p className="voyage-eyebrow mb-1">
                          {zh
                            ? "個人護照 · 所選年份"
                            : "PERSONAL PASSPORT · SELECTED YEAR"}
                        </p>
                        <h2 className="voyage-section-title">
                          {zh ? "飛行記錄" : "Flight records"}
                        </h2>
                      </div>
                      <Plane className="h-5 w-5 text-primary" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-2xl font-semibold">
                          {data.passport.flights}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {zh ? "護照記錄" : "Passport records"}
                        </p>
                      </div>
                      <div>
                        <p className="text-2xl font-semibold">
                          {data.passport.airports}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {zh ? "不同機場代碼" : "Unique airport codes"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xl font-semibold">
                          {data.passport.distanceRecordCount
                            ? data.passport.recordedDistanceKm.toLocaleString()
                            : "—"}{" "}
                          <span className="text-xs font-normal text-muted-foreground">
                            km
                          </span>
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {zh
                            ? `已存距離 · ${data.passport.distanceRecordCount} 段有值`
                            : `Stored distance · ${data.passport.distanceRecordCount} valued records`}
                        </p>
                      </div>
                      <div>
                        <p className="text-xl font-semibold">
                          {data.passport.durationRecordCount
                            ? (
                                data.passport.recordedDurationMinutes / 60
                              ).toLocaleString(zh ? "zh-HK" : "en-HK", {
                                maximumFractionDigits: 1,
                              })
                            : "—"}{" "}
                          <span className="text-xs font-normal text-muted-foreground">
                            {zh ? "小時" : "hours"}
                          </span>
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {zh
                            ? `已存時長 · ${data.passport.durationRecordCount} 段有值`
                            : `Stored duration · ${data.passport.durationRecordCount} valued records`}
                        </p>
                      </div>
                    </div>
                    <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
                      {zh
                        ? "只合計護照中已有的數值，不另作距離／時長估算；已存數值可能是手填或先前估算，並非核實的實際飛行資料。"
                        : "Only stored passport values are totalled; no new distance or duration estimates. Stored values may be manual or previously estimated, not verified flight measurements."}
                    </p>
                    <Link
                      href="/flight-passport"
                      className="mt-3 inline-flex min-h-10 items-center gap-1 text-xs font-semibold text-primary"
                    >
                      {zh ? "整理我的飛行護照" : "Manage flight passport"}
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                  <div className="voyage-panel">
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <p className="voyage-eyebrow mb-1">
                          {zh
                            ? "個人足跡 · 全部年份"
                            : "PERSONAL FOOTPRINT · ALL TIME"}
                        </p>
                        <h2 className="voyage-section-title">
                          {zh ? "國家／地區收藏" : "Countries & regions"}
                        </h2>
                      </div>
                      <Globe2 className="h-5 w-5 text-primary" />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        {
                          label: zh ? "已到訪" : "Visited",
                          count: data.countries.visited,
                        },
                        {
                          label: zh ? "已計劃" : "Planned",
                          count: data.countries.planned,
                        },
                        {
                          label: zh ? "願望清單" : "Wishlist",
                          count: data.countries.wishlist,
                        },
                      ].map(item => (
                        <div
                          key={item.label}
                          className="rounded-xl bg-primary/5 p-3 text-center"
                        >
                          <p className="text-2xl font-semibold text-primary">
                            {item.count}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.label}
                          </p>
                        </div>
                      ))}
                    </div>
                    <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
                      {zh
                        ? "來自個人足跡中已儲存的狀態，按國家代碼去重（可能含既有同步記錄）；本分析不從旅程目的地推測到訪。"
                        : "From saved personal footprint statuses, deduplicated by country code (may include prior synced records). This overview never infers visits from trip destinations."}
                    </p>
                    <div className="mt-4 rounded-xl border border-border p-3 text-xs text-muted-foreground">
                      {zh
                        ? `住宿記錄 ${data.counts.hotels} 項；其中 ${data.counts.hotelsWithValidDates} 項有有效起迄日期，共 ${data.counts.hotelNights} 個房晚（可能重疊）。`
                        : `${data.counts.hotels} stay records; ${data.counts.hotelsWithValidDates} have valid date ranges, totalling ${data.counts.hotelNights} room-nights (may overlap).`}
                    </div>
                    <Link
                      href="/travel-history"
                      className="mt-3 inline-flex min-h-10 items-center gap-1 text-xs font-semibold text-primary"
                    >
                      {zh ? "更新我的旅遊足跡" : "Update your footprint"}
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </section>
                <section>
                  <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <p className="voyage-eyebrow mb-1">
                        {zh
                          ? "記錄完整度 · 不設虛構評分"
                          : "RECORD COVERAGE · NO FICTIONAL SCORE"}
                      </p>
                      <h2 className="voyage-section-title">
                        {zh
                          ? "逐程整理，一次輸入。"
                          : "One trip at a time. One source of truth."}
                      </h2>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {zh
                          ? "以有活動的日期計算安排進度；未有航班或住宿也可能是本地／即日旅程，按需要補充。"
                          : "Progress counts dates with activities. Local or day trips may not need flights or stays—add only what applies."}
                      </p>
                    </div>
                    <Link
                      href="/dashboard"
                      className="inline-flex min-h-10 items-center gap-1 text-xs font-semibold text-primary"
                    >
                      {zh ? "管理旅程" : "Manage trips"}
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                  {data.trips.length ? (
                    <div className="grid gap-4 lg:grid-cols-2">
                      {data.trips.map(trip => (
                        <TripProgress key={trip.id} trip={trip} />
                      ))}
                    </div>
                  ) : (
                    <div className="voyage-panel py-10 text-center">
                      <Compass className="mx-auto mb-4 h-9 w-9 text-primary" />
                      <p className="font-semibold">
                        {zh ? "此範圍未有旅程記錄" : "No trips in this period"}
                      </p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {zh
                          ? "試試全部年份，或建立你的下一趟旅程。"
                          : "Try all years, or create your next journey."}
                      </p>
                      <Button asChild className="mt-5">
                        <Link href="/dashboard">
                          {zh ? "前往我的旅程" : "Go to my trips"}
                        </Link>
                      </Button>
                    </div>
                  )}
                </section>
                <footer className="text-[11px] leading-relaxed text-muted-foreground">
                  {zh
                    ? `本範圍 ${data.counts.validDatedTrips} 趟有有效起迄日期；已經過的日期聯集為 ${data.counts.elapsedCalendarDays} 天（包含今天，不代表實際到訪）。示範行程若仍儲存在帳戶中，會標示並計入記錄。`
                    : `${data.counts.validDatedTrips} trips have valid date ranges; ${data.counts.elapsedCalendarDays} elapsed calendar days including today (not proof of travel). Saved demo trips are labelled and included as records.`}
                </footer>
              </>
            ) : null}
          </>
        )}
      </main>
    </AppLayout>
  );
}
