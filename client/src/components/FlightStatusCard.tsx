import React, { useId, useMemo, useRef, useState } from "react";
import {
  Activity,
  ChevronDown,
  ExternalLink,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  useFlightDocumentVisible,
  FLIGHT_REFRESH_INTERVAL,
} from "./FlightWatchRefresh";
import type { FlightReference, FlightStatusResult } from "@shared/flightStatus";
import {
  normalizeFlightLookupNumber,
  validFlightLookupDate,
} from "@shared/flightLookup";

const SOURCE_URL = "https://data.gov.hk/en-data/dataset/aahk-team1-flight-info";

export type FlightStatusCardProps = {
  reference: FlightReference;
  flightNumber: string | null | undefined;
  date: string;
  fromCode: string | null | undefined;
  toCode: string | null | undefined;
  /** Authenticated and authorized to read this saved record; not booking-edit permission. */
  authorized: boolean;
  lang: "zh" | "en";
};

export function flightStatusEligibility(
  props: Pick<
    FlightStatusCardProps,
    "flightNumber" | "date" | "fromCode" | "toCode"
  >
): "eligible" | "unsupported" | "incomplete" {
  const from = props.fromCode?.trim().toUpperCase() ?? "";
  const to = props.toCode?.trim().toUpperCase() ?? "";
  if (from !== "HKG" && to !== "HKG") return "unsupported";
  const number = normalizeFlightLookupNumber(props.flightNumber ?? "");
  if (
    !number ||
    !validFlightLookupDate(props.date) ||
    !/^[A-Z]{3}$/.test(from) ||
    !/^[A-Z]{3}$/.test(to) ||
    from === to
  )
    return "incomplete";
  return "eligible";
}

export function formatFlightSourceTimestamp(
  value: number | null | undefined,
  lang: "zh" | "en"
) {
  if (
    value == null ||
    !Number.isFinite(value) ||
    !Number.isFinite(new Date(value).getTime())
  )
    return null;
  return new Intl.DateTimeFormat(lang === "zh" ? "zh-HK" : "en-GB", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

function sourceLink(url: string | undefined) {
  if (!url) return SOURCE_URL;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" &&
      (parsed.hostname === "data.gov.hk" ||
        parsed.hostname === "hongkongairport.com" ||
        parsed.hostname.endsWith(".hongkongairport.com"))
      ? parsed.href
      : SOURCE_URL;
  } catch {
    return SOURCE_URL;
  }
}

export function FlightSourceDisclosure({
  lang,
  sourceUrl,
}: {
  lang: "zh" | "en";
  sourceUrl?: string;
}) {
  const zh = lang === "zh";
  return (
    <div className="space-y-2 text-[11px] leading-relaxed text-muted-foreground">
      <p>
        {zh
          ? "實驗性近期機場資料：官方文件只保證前一日資料；僅支援香港國際機場 HKG 及來源實際回傳的日期，並非全球航班資料。免費來源不需 API 金鑰。"
          : "Experimental recent airport data: official documentation only guarantees the previous day; coverage is HKG and dates actually returned by the source, not worldwide flight data. This free source needs no API key."}
      </p>
      <a
        href={sourceLink(sourceUrl)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-primary underline underline-offset-2 break-words"
      >
        {zh
          ? "資料來源：香港機場管理局 · DATA.GOV.HK"
          : "Source: Airport Authority Hong Kong · DATA.GOV.HK"}
        <ExternalLink aria-hidden="true" className="h-3 w-3 shrink-0" />
      </a>
      <p>
        {zh
          ? "機場狀態與預訂／手動紀錄分開，不會覆蓋時間、筆記或航班資料。請向航空公司核實旅程安排。"
          : "Airport status is separate from your booking / manual record. It never overwrites times, notes or flight details. Confirm travel arrangements with your airline."}
      </p>
    </div>
  );
}

export function FlightWatchDisclosure({
  lang,
  scheduleActive,
}: {
  lang: "zh" | "en";
  scheduleActive: boolean;
}) {
  return (
    <p className="text-[11px] leading-relaxed text-muted-foreground">
      {lang === "zh"
        ? "App 可見時每 5 分鐘檢查；只提供 App 內通知。"
        : "5 min checks while the app is visible; in-app notifications only."}{" "}
      {!scheduleActive &&
        (lang === "zh"
          ? "背景檢查尚未啟用，須先發佈處理程式並配置排程；關閉 App 可能錯過變更。"
          : "Background checks are not activated until a published handler / scheduler is configured; closing the app may miss changes.")}
    </p>
  );
}

type StatusViewProps = {
  lang: "zh" | "en";
  result?: FlightStatusResult;
  loading?: boolean;
  error?: boolean;
  refreshing?: boolean;
  onRefresh: () => void;
};

/** Pure source-result view; renders only actual observations, never synthetic status. */
export function FlightStatusResultView({
  lang,
  result,
  loading,
  error,
  refreshing,
  onRefresh,
}: StatusViewProps) {
  const copy = (zh: string, en: string) => (lang === "zh" ? zh : en);
  const fallback: Record<FlightStatusResult["outcome"], string> = {
    available: copy("機場已發佈資料", "Airport-published information"),
    not_found: copy(
      "來源未回傳相符航班；不代表已抵達或取消。",
      "No matching flight returned by the source; this does not mean landed or cancelled."
    ),
    unsupported: copy(
      "此航班或日期不在來源支援範圍內。",
      "This flight or date is outside source coverage."
    ),
    unavailable: copy(
      "機場資料暫時無法取得。",
      "Airport data is temporarily unavailable."
    ),
    ambiguous: copy(
      "來源有多個相符項目，無法確定此航段；不會猜測狀態。",
      "Multiple source records match; this segment cannot be identified. No status is guessed."
    ),
    stale: copy(
      "資料已過期；以下僅為上次已知資訊，並非目前狀態。",
      "Stale data: any observation below is last-known information, not current status."
    ),
  };
  const observation =
    !error && (result?.outcome === "available" || result?.outcome === "stale")
      ? result.observation
      : null;
  const published = formatFlightSourceTimestamp(
    observation?.sourceUpdatedAt,
    lang
  );
  const fetched = formatFlightSourceTimestamp(observation?.fetchedAt, lang);
  const checked = formatFlightSourceTimestamp(result?.checkedAt, lang);
  const details = observation
    ? [
        [
          copy("機場發佈時刻", "Airport-published clock"),
          observation.scheduledTime
            ? `${observation.date} ${observation.scheduledTime}`
            : null,
        ],
        [copy("閘口", "Gate"), observation.gate],
        [copy("客運大樓", "Terminal"), observation.terminal],
        [copy("登記行段", "Check-in aisle"), observation.checkInAisle],
        [copy("行李輸送帶", "Baggage belt"), observation.baggageBelt],
      ]
    : [];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p
          className="text-xs font-medium"
          role={error ? "alert" : "status"}
          aria-live="polite"
        >
          {loading
            ? copy("正在查詢機場來源…", "Checking the airport source…")
            : error
              ? copy(
                  "機場資料暫時無法取得；你的手動紀錄維持不變。",
                  "Airport data is temporarily unavailable; your manual record is unchanged."
                )
              : result
                ? fallback[result.outcome]
                : copy(
                    "尚未取得機場狀態。",
                    "No airport status has been retrieved."
                  )}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-auto min-h-9 gap-1.5 whitespace-normal shrink-0"
          disabled={Boolean(loading || refreshing)}
          onClick={onRefresh}
        >
          {loading || refreshing ? (
            <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
          )}
          {copy("重新整理", "Refresh")}
        </Button>
      </div>
      {observation && (
        <div
          className={`rounded-xl border p-3 ${result?.outcome === "stale" ? "border-border bg-muted/40" : "border-primary/20 bg-primary/5"}`}
        >
          <p className="text-sm font-semibold break-words">
            {observation.statusText ||
              copy(
                "來源未發佈狀態文字",
                "Status text not published by the source"
              )}
          </p>
          <p className="mt-1 text-xs text-muted-foreground break-words">
            {observation.flightNumber} · {observation.fromCode} →{" "}
            {observation.toCode}
          </p>
          <dl className="mt-3 grid grid-cols-1 min-[420px]:grid-cols-2 gap-x-4 gap-y-2 text-xs">
            {details
              .filter(([, value]) => Boolean(value))
              .map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="mt-0.5 font-medium break-words">{value}</dd>
                </div>
              ))}
          </dl>
          <p className="mt-3 text-[11px] text-muted-foreground">
            {copy("機場時刻：香港時間", "Airport clocks: Hong Kong time")} ·
            Asia/Hong_Kong (UTC+8)
          </p>
          {published && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {copy("來源更新：", "Source updated: ")}
              {published} · Asia/Hong_Kong
            </p>
          )}
          {fetched && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {copy("資料取得：", "Data fetched: ")}
              {fetched} · Asia/Hong_Kong
            </p>
          )}
        </div>
      )}
      {checked && !error && (
        <p className="text-[11px] text-muted-foreground">
          {copy("已檢查：", "Checked: ")}
          {checked} · Asia/Hong_Kong (UTC+8)
        </p>
      )}
      <FlightSourceDisclosure lang={lang} sourceUrl={result?.sourceUrl} />
    </div>
  );
}

function ExpandedFlightStatus({
  reference,
  lang,
}: Pick<FlightStatusCardProps, "reference" | "lang">) {
  const visible = useFlightDocumentVisible();
  const utils = trpc.useUtils();
  const input = useMemo(
    () => ({ reference: { kind: reference.kind, id: reference.id } }),
    [reference.kind, reference.id]
  );
  const queryOptions = {
    enabled: visible,
    retry: false as const,
    refetchOnWindowFocus: false,
    refetchIntervalInBackground: false,
    refetchInterval: visible ? FLIGHT_REFRESH_INTERVAL : (false as const),
    staleTime: FLIGHT_REFRESH_INTERVAL,
  };
  const status = trpc.flightStatus.status.useQuery(input, queryOptions);
  const watch = trpc.flightStatus.watchState.useQuery(input, queryOptions);
  const writeLock = useRef(false);
  const setWatch = trpc.flightStatus.setWatch.useMutation({
    onSuccess: () => {
      void utils.flightStatus.watchState.invalidate(input);
      void utils.flightStatus.watches.invalidate();
    },
    onSettled: () => {
      writeLock.current = false;
    },
  });
  const watchReady = Boolean(watch.data) && !watch.isError && !watch.isFetching;
  return (
    <div className="space-y-4">
      <FlightStatusResultView
        lang={lang}
        result={status.data}
        loading={status.isLoading}
        error={status.isError}
        refreshing={status.isFetching}
        onRefresh={() => {
          if (visible && !status.isFetching) void status.refetch();
        }}
      />
      <div className="space-y-2 border-t border-border pt-3">
        <label className="flex items-center justify-between gap-3 text-xs font-medium">
          <span>
            {lang === "zh"
              ? "為我追蹤此航班變更（自願加入）"
              : "Watch this flight for me (opt-in)"}
          </span>
          <Switch
            checked={watch.data?.enabled ?? false}
            disabled={!watchReady || setWatch.isPending}
            onCheckedChange={enabled => {
              if (!watchReady || setWatch.isPending || writeLock.current)
                return;
              writeLock.current = true;
              setWatch.mutate({ reference: input.reference, enabled });
            }}
            aria-label={
              lang === "zh"
                ? "只為我追蹤此航班"
                : "Watch this flight only for me"
            }
          />
        </label>
        <FlightWatchDisclosure
          lang={lang}
          scheduleActive={watch.data?.scheduleActive === true}
        />
        {(watch.isError || setWatch.isError) && (
          <p role="alert" className="text-xs text-destructive">
            {lang === "zh"
              ? "未能更新或載入追蹤設定，請重試。"
              : "Could not load or update your watch preference. Please retry."}
          </p>
        )}
      </div>
    </div>
  );
}

export default function FlightStatusCard(props: FlightStatusCardProps) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const contentId = useId();
  const identity = `${props.reference.kind}:${props.reference.id}:${props.flightNumber}:${props.date}:${props.fromCode}:${props.toCode}`;
  const expanded = expandedKey === identity;
  const eligibility = flightStatusEligibility(props);
  return (
    <section
      className="mt-3 min-w-0 border-t border-border pt-3"
      aria-label={
        props.lang === "zh" ? "機場航班狀態" : "Airport flight status"
      }
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpandedKey(expanded ? null : identity)}
        className="h-auto min-h-9 max-w-full gap-2 whitespace-normal rounded-xl px-2 text-xs text-primary"
      >
        <Activity aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
        {props.lang === "zh"
          ? "機場航班狀態 · 免費 HKG 來源"
          : "Airport status · Free HKG source"}
        <ChevronDown
          aria-hidden="true"
          className={`h-3.5 w-3.5 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </Button>
      {expanded && (
        <div
          id={contentId}
          className="mt-3 min-w-0 rounded-xl border border-border bg-card p-3 text-card-foreground sm:p-4"
        >
          {!props.authorized ? (
            <p className="text-xs text-muted-foreground">
              {props.lang === "zh"
                ? "請登入並使用你有權查看的已儲存航班；訪客不會查詢或建立追蹤。"
                : "Sign in and use a saved flight you are authorized to read. Guests do not query status or create watches."}
            </p>
          ) : eligibility === "eligible" ? (
            <ExpandedFlightStatus
              key={identity}
              reference={props.reference}
              lang={props.lang}
            />
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {eligibility === "unsupported"
                  ? props.lang === "zh"
                    ? "免費來源僅支援涉及香港國際機場 HKG 的航班；此航線不支援，手動紀錄維持不變。"
                    : "The free source only supports flights involving HKG. This route is unsupported; your manual record is unchanged."
                  : props.lang === "zh"
                    ? "需要完整航班號碼、有效香港日期及不同的 IATA 機場代碼。手動紀錄維持不變。"
                    : "A complete flight number, valid Hong Kong date and distinct IATA airport codes are required. Your manual record is unchanged."}
              </p>
              <FlightSourceDisclosure lang={props.lang} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
