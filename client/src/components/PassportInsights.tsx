import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowUpRight, Clock, Route, Ruler, TrendingUp } from "lucide-react";
import { useI18n } from "@/hooks/useI18n";
import { formatFlightHours, normalizeIataCode } from "@shared/flightPassport";
import { type PassportInsightsData } from "@/lib/passportInsights";

export default function PassportInsights({
  stats,
  activeYear,
}: {
  stats: PassportInsightsData;
  activeYear: string;
}) {
  const { lang } = useI18n();
  const zh = lang === "zh";
  const count = stats.totalFlights;
  const number = (value: number | null) =>
    value === null
      ? "—"
      : Math.round(value).toLocaleString(lang === "zh" ? "zh-HK" : "en-HK");
  const hours = (value: number | null) =>
    value === null ? "—" : formatFlightHours(value);
  const coverage = (metric: typeof stats.distance) =>
    zh
      ? `${metric.known}/${metric.denominator} 班有數值 · ${metric.recorded} 已記錄 · ${metric.estimated} 估算 · ${metric.unknown} 未知`
      : `${metric.known}/${metric.denominator} flights with values · ${metric.recorded} recorded · ${metric.estimated} estimated · ${metric.unknown} unknown`;
  const longest = stats.longest;
  const maxRouteCount = stats.routes[0]?.count ?? 1;

  return (
    <section
      className="space-y-4"
      aria-label={zh ? "飛行數據分析" : "Flight insights"}
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="voyage-metric rounded-2xl border border-border bg-card p-4 text-card-foreground">
          <Ruler className="mb-3 h-4 w-4 text-primary" />
          <p className="text-xs text-muted-foreground">
            {zh ? "距離合計（記錄＋估算）" : "Distance · recorded + estimated"}
          </p>
          <p className="mt-1 text-xl font-bold tabular-nums">
            {number(stats.distance.total)}{" "}
            <span className="text-xs font-normal">km</span>
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            {coverage(stats.distance)}
          </p>
        </div>
        <div className="voyage-metric rounded-2xl border border-border bg-card p-4 text-card-foreground">
          <Clock className="mb-3 h-4 w-4 text-primary" />
          <p className="text-xs text-muted-foreground">
            {zh ? "時間合計（記錄＋估算）" : "Time · recorded + estimated"}
          </p>
          <p className="mt-1 text-xl font-bold tabular-nums">
            {hours(stats.duration.total)}
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            {coverage(stats.duration)}
          </p>
        </div>
        <div className="voyage-metric rounded-2xl border border-border bg-card p-4 text-card-foreground">
          <Route className="mb-3 h-4 w-4 text-primary" />
          <p className="text-xs text-muted-foreground">
            {zh ? "平均有值距離" : "Average available distance"}
          </p>
          <p className="mt-1 text-xl font-bold tabular-nums">
            {number(stats.distance.average)}{" "}
            <span className="text-xs font-normal">km</span>
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            {zh
              ? `已記錄均值 ${number(stats.distance.recordedAverage)} km（${stats.distance.recorded} 班）；估算均值 ${number(stats.distance.estimatedAverage)} km（${stats.distance.estimated} 班）`
              : `Recorded avg ${number(stats.distance.recordedAverage)} km (${stats.distance.recorded} flights); estimated avg ${number(stats.distance.estimatedAverage)} km (${stats.distance.estimated} flights)`}
          </p>
        </div>
        <div className="voyage-metric rounded-2xl border border-border bg-card p-4 text-card-foreground">
          <TrendingUp className="mb-3 h-4 w-4 text-primary" />
          <p className="text-xs text-muted-foreground">
            {zh ? "平均有值時間" : "Average available time"}
          </p>
          <p className="mt-1 text-xl font-bold tabular-nums">
            {hours(stats.duration.average)}
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            {zh
              ? `已記錄均值 ${hours(stats.duration.recordedAverage)}（${stats.duration.recorded} 班）；估算均值 ${hours(stats.duration.estimatedAverage)}（${stats.duration.estimated} 班）`
              : `Recorded avg ${hours(stats.duration.recordedAverage)} (${stats.duration.recorded} flights); estimated avg ${hours(stats.duration.estimatedAverage)} (${stats.duration.estimated} flights)`}
          </p>
        </div>
      </div>

      <div className="voyage-panel">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="voyage-eyebrow">
              {zh ? "逐年累積的旅程" : "YOUR YEARS IN THE AIR"}
            </p>
            <h2 className="voyage-section-title mt-1">
              {zh ? "年度飛行趨勢" : "Flights through the years"}
            </h2>
          </div>
          <span className="rounded-full bg-accent px-3 py-1 text-xs text-accent-foreground">
            {zh ? "全歷史年度" : "All recorded years"}
          </span>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {zh
            ? "以香港出發日期分組；未來班次獨立列出，沒有日期的紀錄不當作已飛。"
            : "Grouped by Hong Kong departure date. Future flights are separate; undated records are not counted as flown."}
        </p>
        {stats.trend.length ? (
          <>
            <div
              className="mt-4 h-52 w-full"
              role="img"
              aria-label={
                zh
                  ? "年度已過日期、計劃及未定日期航班數量圖"
                  : "Yearly past-dated, planned and undated flight counts"
              }
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={stats.trend}
                  margin={{ top: 8, right: 4, left: -24, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="var(--border)"
                  />
                  <XAxis
                    dataKey="year"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--accent)", opacity: 0.4 }}
                    contentStyle={{
                      borderRadius: 16,
                      border: "1px solid var(--border)",
                      background: "var(--card)",
                      color: "var(--card-foreground)",
                      fontSize: 12,
                    }}
                    labelFormatter={label => (zh ? `${label} 年` : `${label}`)}
                  />
                  <Bar
                    dataKey="completed"
                    name={zh ? "已過日期" : "Past-dated"}
                    fill="var(--primary)"
                    stackId="flights"
                    maxBarSize={42}
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey="planned"
                    name={zh ? "計劃" : "Planned"}
                    fill="var(--chart-2, #9ecdc0)"
                    stackId="flights"
                    maxBarSize={42}
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey="undated"
                    name={zh ? "未定日期" : "Undated"}
                    fill="var(--muted-foreground)"
                    stackId="flights"
                    maxBarSize={42}
                    radius={[5, 5, 0, 0]}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <i className="h-2.5 w-2.5 rounded-sm bg-primary" />
                {zh ? "已過日期" : "Past-dated"}
              </span>
              <span className="flex items-center gap-1.5">
                <i
                  className="h-2.5 w-2.5 rounded-sm"
                  style={{ background: "var(--chart-2, #9ecdc0)" }}
                />
                {zh ? "計劃" : "Planned"}
              </span>
              <span className="flex items-center gap-1.5">
                <i className="h-2.5 w-2.5 rounded-sm bg-muted-foreground" />
                {zh ? "未定日期" : "Undated"}
              </span>
            </div>
            <details className="mt-3 text-xs text-muted-foreground">
              <summary className="cursor-pointer">
                {zh ? "查看年度數值" : "View yearly values"}
              </summary>
              <div className="mt-2 space-y-1">
                {stats.trend.map(row => (
                  <p key={row.year}>
                    {row.year} ·{" "}
                    {zh
                      ? `已過日期 ${row.completed}／計劃 ${row.planned}／未定日期 ${row.undated}`
                      : `Past-dated ${row.completed} / planned ${row.planned} / undated ${row.undated}`}
                  </p>
                ))}
              </div>
            </details>
          </>
        ) : (
          <p className="py-8 text-sm text-muted-foreground">
            {zh
              ? "尚未有可辨識年份的紀錄。"
              : "No records with an identifiable year yet."}
          </p>
        )}
        {stats.unknownYear > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {zh
              ? `${stats.unknownYear} 班沒有可辨識年份，未納入年度圖表。`
              : `${stats.unknownYear} flights have no identifiable year and are excluded from this chart.`}
          </p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="voyage-panel">
          <p className="voyage-eyebrow">
            {activeYear === "All-Time"
              ? zh
                ? "全歷史"
                : "ALL-TIME"
              : activeYear}
          </p>
          <h2 className="voyage-section-title mt-1">
            {zh ? "常飛航線" : "Routes you return to"}
          </h2>
          <p className="mt-2 text-xs text-muted-foreground">
            {zh
              ? `單向航線分開統計 · ${count - stats.invalidRoutes}/${count} 班有效機場配對`
              : `Direction matters · ${count - stats.invalidRoutes}/${count} valid airport pairs`}
          </p>
          <div className="mt-4 space-y-4">
            {stats.routes.slice(0, 5).map((route, index) => (
              <div key={route.route}>
                <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium">
                    <span className="mr-2 text-xs text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {route.route}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {route.count} {zh ? "班" : "flights"}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary/80"
                    style={{ width: `${(route.count / maxRouteCount) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          {!stats.routes.length && (
            <p className="py-6 text-sm text-muted-foreground">
              {zh ? "未有可統計的航線。" : "No valid routes to summarize yet."}
            </p>
          )}
          {stats.invalidRoutes > 0 && (
            <p className="mt-4 text-xs text-muted-foreground">
              {zh
                ? `${stats.invalidRoutes} 班缺少有效機場配對。`
                : `${stats.invalidRoutes} flights have no valid airport pair.`}
            </p>
          )}
        </div>
        <div className="voyage-panel">
          <p className="voyage-eyebrow">
            {zh ? "以已過日期紀錄為分母" : "PAST-DATED RECORDS"}
          </p>
          <h2 className="voyage-section-title mt-1">
            {zh ? "航空公司分佈" : "Your airline mix"}
          </h2>
          <p className="mt-2 text-xs text-muted-foreground">
            {zh
              ? `${stats.airlines} 間航空公司 · ${stats.unknownAirlines}/${count} 班航空公司未知`
              : `${stats.airlines} airlines · ${stats.unknownAirlines}/${count} flights with unknown airline`}
          </p>
          <div className="mt-4 space-y-4">
            {stats.airlineDistribution.slice(0, 5).map(row => (
              <div key={row.airline}>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <p
                    className="min-w-0 truncate text-sm font-medium"
                    title={row.airline}
                  >
                    {row.airline}
                  </p>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {row.count}/{count} ·{" "}
                    {count ? Math.round((row.count / count) * 100) : "—"}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary/60"
                    style={{
                      width: `${count ? (row.count / count) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          {!stats.airlineDistribution.length && (
            <p className="py-6 text-sm text-muted-foreground">
              {zh
                ? "填寫航空公司後即可查看分佈。"
                : "Add airline names to see your distribution."}
            </p>
          )}
          {stats.airlineDistribution.length > 5 && (
            <p className="mt-4 text-xs text-muted-foreground">
              {zh
                ? `另有 ${stats.airlineDistribution.length - 5} 間航空公司；此處顯示首五名。`
                : `${stats.airlineDistribution.length - 5} more airlines; showing the top five.`}
            </p>
          )}
        </div>
      </div>

      <div className="voyage-panel flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="voyage-eyebrow">
            {zh ? "最遠的一段旅程" : "YOUR LONGEST CHAPTER"}
          </p>
          <h2 className="voyage-section-title mt-1">
            {longest
              ? `${normalizeIataCode(longest.flight.departureAirport) || "—"} → ${normalizeIataCode(longest.flight.arrivalAirport) || "—"}`
              : "—"}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {zh
              ? `只比較有距離的 ${stats.distance.known}/${count} 班紀錄`
              : `Compared across ${stats.distance.known}/${count} flights with distance`}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {zh
              ? `${stats.longHaul} 班有值航程超過 6,000 km（或含估算）`
              : `${stats.longHaul} available distances over 6,000 km · may include estimates`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold text-primary">
            {number(longest?.distance.value ?? null)}{" "}
            <span className="text-xs font-normal">km</span>
            <ArrowUpRight className="ml-2 inline h-4 w-4" />
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {longest
              ? longest.distance.source === "estimated"
                ? zh
                  ? "大圓航線估算"
                  : "Great-circle estimate"
                : zh
                  ? "已記錄值（或包含估算）"
                  : "Recorded value · may be estimated"
              : zh
                ? "尚未有距離資料"
                : "No distance available"}
          </p>
        </div>
      </div>
      {stats.distance.total !== null && (
        <p className="px-1 text-xs text-muted-foreground">
          {zh
            ? `距離合計約等於地球周長 ${(stats.distance.total / 40075).toFixed(2)} 圈（已記錄＋估算，只供比較）。`
            : `Total distance is about ${(stats.distance.total / 40075).toFixed(2)} Earth circumferences · recorded + estimated, for perspective only.`}
        </p>
      )}
      <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
        {zh
          ? "數據說明：已過日期並不代表已核實完成；只按香港日期分類。已記錄值可能包含舊有自動估算，並非已核實實際飛行數據。未記錄距離以機場大圓距離估算，時間以距離 ÷ 800 km/h ＋ 1 小時估算。未知值不作零處理，平均值只除以有數值的班次。"
          : "Method: past-dated does not mean verified flown; classification uses Hong Kong dates. Recorded values may include legacy auto-estimates and are not verified actual flight data. Missing distance uses airport great-circle estimates; time uses distance ÷ 800 km/h + 1 hour. Unknown values are excluded, not treated as zero; averages use only flights with values."}
      </p>
    </section>
  );
}
