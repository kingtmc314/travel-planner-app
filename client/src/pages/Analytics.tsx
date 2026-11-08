import { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { OverviewMetrics } from "@/components/TravelOverview";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/hooks/useI18n";
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
  const query = trpc.analytics.overview.useQuery(
    year === "all" ? undefined : { year: Number(year) },
    { enabled: !!user, retry: 1 }
  );
  const data = query.data;
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
  const categoryNames: Record<string, string> = {
    transport: zh ? "交通" : "Transport",
    food: zh ? "餐飲" : "Food",
    accommodation: zh ? "住宿" : "Accommodation",
    attraction: zh ? "景點" : "Attractions",
    shopping: zh ? "購物" : "Shopping",
    other: zh ? "其他" : "Other",
  };
  const spendingChart =
    selectedCurrency?.categories.map(row => ({
      ...row,
      name: categoryNames[row.category] ?? row.category,
    })) ?? [];
  const statusChart = data
    ? [
        { name: zh ? "日期已過" : "Past", count: data.counts.pastTrips },
        { name: zh ? "旅程期間" : "Current", count: data.counts.currentTrips },
        {
          name: zh ? "即將出發" : "Upcoming",
          count: data.counts.upcomingTrips,
        },
        {
          name: zh ? "未有有效日期" : "Undated",
          count: data.counts.undatedTrips,
        },
      ]
    : [];

  return (
    <AppLayout>
      <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 pb-28 sm:px-6 lg:py-8 lg:pb-10">
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
                className={`mr-2 h-3.5 w-3.5 ${query.isFetching ? "animate-spin" : ""}`}
              />
              {zh ? "更新分析" : "Refresh"}
            </Button>
          )}
        </header>
        {authLoading ? (
          <Skeleton className="h-40 rounded-2xl" />
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
            <OverviewMetrics data={data} loading={query.isLoading} />
            {query.isLoading ? (
              <div className="grid gap-5 lg:grid-cols-2">
                <Skeleton className="h-72 rounded-2xl" />
                <Skeleton className="h-72 rounded-2xl" />
                <Skeleton className="h-72 rounded-2xl" />
                <Skeleton className="h-72 rounded-2xl" />
              </div>
            ) : data ? (
              <>
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
                          role="img"
                          aria-label={
                            zh
                              ? `${selectedCurrency.currency} 分類支出圖`
                              : `${selectedCurrency.currency} spending by category`
                          }
                        >
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={spendingChart}
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
                                formatter={(value: number) => [
                                  `${selectedCurrency.currency} ${formatMoney(value)}`,
                                  zh ? "已記錄支出" : "Recorded expenses",
                                ]}
                                contentStyle={{
                                  borderRadius: 14,
                                  fontSize: 12,
                                }}
                              />
                              <Bar
                                dataKey="total"
                                fill="#0d766e"
                                radius={[5, 5, 0, 0]}
                                maxBarSize={48}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
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
                              />
                              <Bar
                                dataKey="count"
                                fill="#163c4f"
                                radius={[0, 5, 5, 0]}
                                maxBarSize={20}
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
                        role="img"
                        aria-label={
                          zh
                            ? "年度旅程及航班趨勢圖"
                            : "Annual trip and flight trends"
                        }
                      >
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart
                            data={data.annualTrend}
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
                              contentStyle={{ borderRadius: 14, fontSize: 12 }}
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
                            />
                            <Line
                              type="monotone"
                              dataKey="tripFlights"
                              name={zh ? "旅程航班記錄" : "Trip flight records"}
                              stroke="#163c4f"
                              strokeWidth={2}
                              dot={{ r: 3 }}
                            />
                            <Line
                              type="monotone"
                              dataKey="passportFlights"
                              name={zh ? "個人飛行護照" : "Personal passport"}
                              stroke="#bd8736"
                              strokeWidth={2}
                              strokeDasharray="5 4"
                              dot={{ r: 3 }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                      <details className="mt-4 text-xs text-muted-foreground">
                        <summary className="cursor-pointer py-2">
                          {zh ? "查看圖表數據" : "View chart data"}
                        </summary>
                        <div className="overflow-x-auto">
                          <table className="mt-2 w-full text-left">
                            <thead>
                              <tr className="border-b border-border">
                                <th className="py-2">{zh ? "年份" : "Year"}</th>
                                <th>{zh ? "旅程" : "Trips"}</th>
                                <th>{zh ? "旅程航班" : "Trip flights"}</th>
                                <th>{zh ? "護照" : "Passport"}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {data.annualTrend.map(row => (
                                <tr
                                  key={row.year}
                                  className="border-b border-border/50"
                                >
                                  <td className="py-2">{row.year}</td>
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
