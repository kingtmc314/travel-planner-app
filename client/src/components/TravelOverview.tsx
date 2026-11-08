import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/hooks/useI18n";
import { trpc } from "@/lib/trpc";
import { TRAVEL_COVER_IMAGE } from "@/lib/design";
import { formatDateOnlyInHongKong } from "@/lib/hongKongDate";
import {
  ArrowUpRight,
  CalendarDays,
  ChartNoAxesCombined,
  Compass,
  Globe2,
  MapPin,
  Receipt,
  Users,
} from "lucide-react";
import { Link } from "wouter";
import type { TravelOverview as OverviewData } from "@shared/analytics";

export function OverviewMetrics({
  data,
  loading,
}: {
  data?: OverviewData;
  loading?: boolean;
}) {
  const { lang } = useI18n();
  const zh = lang === "zh";
  const metrics = [
    {
      icon: Compass,
      label: zh ? "已存旅程" : "Saved trips",
      value: data?.counts.trips,
      note: zh ? "只計你參與的旅程" : "Trips you are a member of",
    },
    {
      icon: CalendarDays,
      label: zh ? "已定日期天數" : "Dated travel days",
      value: data?.counts.datedTravelDays,
      note: zh
        ? "含未來日期・重疊日只計一次"
        : "Includes future days · overlaps counted once",
    },
    {
      icon: Users,
      label: zh ? "不同同行旅伴" : "Fellow travellers",
      value: data?.counts.uniqueCompanions,
      note: zh ? "不包括你・按用戶去重" : "Unique members · excluding you",
    },
    {
      icon: Receipt,
      label: zh ? "支出記錄" : "Expense records",
      value: data?.counts.expenses,
      note: zh
        ? "旅程共用帳目・非個人花費"
        : "Shared trip ledger · not personal spend",
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {metrics.map(metric => (
        <div
          key={metric.label}
          className="voyage-metric min-w-0 rounded-2xl border border-border bg-card p-4 text-card-foreground sm:p-5"
        >
          <div className="mb-4 flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              {metric.label}
            </span>
            <metric.icon className="h-4 w-4 shrink-0 text-primary" />
          </div>
          {loading ? (
            <Skeleton className="mb-2 h-9 w-16" />
          ) : (
            <p className="text-3xl font-semibold tracking-tight">
              {metric.value === undefined
                ? "—"
                : metric.value.toLocaleString(zh ? "zh-HK" : "en-HK")}
            </p>
          )}
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground sm:text-xs">
            {metric.note}
          </p>
        </div>
      ))}
    </div>
  );
}

export default function TravelOverview() {
  const { lang } = useI18n();
  const zh = lang === "zh";
  const overview = trpc.analytics.overview.useQuery(undefined, { retry: 1 });
  const data = overview.data;
  const next = data?.nextTrip;
  return (
    <section
      className="mb-9 space-y-5"
      aria-label={zh ? "旅遊總覽" : "Travel overview"}
    >
      <div className="voyage-hero relative isolate overflow-hidden rounded-[28px] bg-slate-900 p-6 text-white sm:p-8">
        <img
          src={next?.coverImage || TRAVEL_COVER_IMAGE}
          alt=""
          className="absolute inset-0 -z-20 h-full w-full object-cover"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-slate-950/90 via-slate-950/75 to-teal-950/30" />
        <div className="max-w-lg space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[10px] font-semibold tracking-widest text-teal-100">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-200" />
            {zh ? "你的旅遊手記" : "YOUR TRAVEL JOURNAL"}
          </div>
          {overview.isLoading ? (
            <>
              <Skeleton className="h-9 w-3/4 bg-white/20" />
              <Skeleton className="h-5 w-1/2 bg-white/20" />
            </>
          ) : next ? (
            <>
              <p className="text-xs font-medium text-teal-100">
                {next.status === "current"
                  ? zh
                    ? "正在旅途上"
                    : "Currently travelling"
                  : zh
                    ? "下一站，準備出發"
                    : "Your next chapter"}
                {next.isDemoTrip ? (zh ? " · 示範行程" : " · Demo trip") : ""}
              </p>
              <h2 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
                {next.name}
              </h2>
              <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-white/85">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" />
                  {next.destination}
                </span>
                <span>
                  {formatDateOnlyInHongKong(next.startDate, lang, {
                    month: "short",
                    day: "numeric",
                  })}{" "}
                  –{" "}
                  {formatDateOnlyInHongKong(next.endDate, lang, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>
              <p className="text-xs text-white/75">
                {zh
                  ? `已安排活動：${next.scheduledDays} / ${next.datedDays} 天 · ${next.flightCount} 段航班 · ${next.hotelCount} 項住宿`
                  : `${next.scheduledDays} / ${next.datedDays} days with activities · ${next.flightCount} flight legs · ${next.hotelCount} stays`}
              </p>
              <Button
                asChild
                className="bg-white text-slate-900 hover:bg-teal-50"
              >
                <Link href={`/trips/${next.id}/itinerary`}>
                  {zh ? "打開旅程" : "Open itinerary"}
                  <ArrowUpRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </>
          ) : (
            <>
              <h2 className="text-3xl font-bold leading-tight sm:text-4xl">
                {zh ? "讓每趟旅程，留下更多。" : "Make every journey count."}
              </h2>
              <p className="max-w-sm text-sm leading-relaxed text-white/80">
                {overview.isError
                  ? zh
                    ? "旅遊資料暫未能載入。你的已存旅程仍保留在下方。"
                    : "Overview is unavailable. Your saved trips remain below."
                  : zh
                    ? "從行程、帳目到飛行足跡，你的真實記錄，就是最好的旅遊手記。"
                    : "Your itinerary, shared expenses and flight memories, together in one travel journal."}
              </p>
              <Button
                asChild
                className="bg-white text-slate-900 hover:bg-teal-50"
              >
                <Link href="/analytics">
                  {zh ? "探索旅遊分析" : "Explore your insights"}
                  <ArrowUpRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>
      <OverviewMetrics data={data} loading={overview.isLoading} />
      {overview.isError ? (
        <div
          role="alert"
          className="voyage-panel flex flex-wrap items-center justify-between gap-3 text-sm"
        >
          <p className="text-destructive">
            {zh
              ? "未能載入分析，不會以零代替未取得的資料。"
              : "Insights could not load. Missing data is not shown as zero."}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => overview.refetch()}
            disabled={overview.isFetching}
          >
            {zh ? "重試" : "Retry"}
          </Button>
        </div>
      ) : data ? (
        <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <Globe2 className="h-4 w-4 text-primary" />
            {zh
              ? `足跡中標記已到訪 ${data.countries.visited} 國家／地區 · 飛行護照 ${data.passport.flights} 段記錄`
              : `${data.countries.visited} countries / regions marked visited · ${data.passport.flights} passport records`}
          </span>
          <Link
            href="/analytics"
            className="inline-flex min-h-10 items-center gap-1.5 font-semibold text-primary hover:underline"
          >
            <ChartNoAxesCombined className="h-4 w-4" />
            {zh ? "查看完整分析" : "All travel insights"}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : null}
    </section>
  );
}
