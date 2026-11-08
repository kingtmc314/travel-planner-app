import React, { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import {
  type FlightLookupCandidate,
  type FlightLookupResult,
} from "@shared/flightLookup";
import {
  candidateMatchesFlight,
  flightLookupInput,
} from "@/hooks/useFlightAutofill";

export type FlightLookupPanelProps = {
  flightNumber: string;
  date: string;
  tripId?: number;
  sessionKey: string;
  open: boolean;
  authorized: boolean;
  disabled?: boolean;
  lang: "zh" | "en";
  onApply: (candidate: FlightLookupCandidate) => void;
};

export type FlightLookupPanelViewProps = {
  lang: "zh" | "en";
  valid: boolean;
  loading?: boolean;
  error?: string;
  result?: FlightLookupResult;
  appliedId?: string;
  disabled?: boolean;
  onRefresh: () => void;
  onApply: (candidate: FlightLookupCandidate) => void;
};

/** Presentational export lets SSR tests cover the UI without an RPC provider or network. */
export function FlightLookupPanelView({
  lang,
  valid,
  loading,
  error,
  result,
  appliedId,
  disabled,
  onRefresh,
  onApply,
}: FlightLookupPanelViewProps) {
  const copy = (zh: string, en: string) => (lang === "zh" ? zh : en);
  return (
    <section
      className="min-w-0 space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-foreground"
      aria-label={copy(
        "航班號碼及日期自動填寫",
        "Flight number and date autofill"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Search
            className="h-4 w-4 shrink-0 text-primary"
            aria-hidden="true"
          />
          {copy("航班資料自動填寫", "Autofill flight details")}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-auto min-h-8 gap-1.5 whitespace-normal bg-card px-2 py-1 text-xs"
          disabled={!valid || loading || disabled}
          onClick={onRefresh}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5 shrink-0" />
          )}
          {copy("重新查找", "Refresh")}
        </Button>
      </div>
      <p className="break-words text-xs leading-relaxed text-muted-foreground">
        {copy(
          "輸入航班號碼及日期，450 毫秒後查找你自己的護照／有權存取行程內相同號碼及日期的紀錄。只填空白或未被你修改的自動欄位；儲存前不會寫入。",
          "Enter a flight number and date to search your passport and accessible trips after 450 ms. Only blank or unedited autofilled fields are filled; nothing is written until you save."
        )}
      </p>
      <p className="break-words rounded-lg bg-card/80 p-2 text-[11px] leading-relaxed text-muted-foreground">
        {copy(
          "尚未設定航空資料 API。現時僅使用已儲存紀錄，並非即時資料；權威線上航班時刻、閘口及延誤資料須經授權接駁 API。",
          "No aviation data API is configured. Saved records only, not live data. Authoritative online schedules, gates and delays require an authorized API connection."
        )}
      </p>
      <div aria-live="polite" className="space-y-2 text-xs leading-relaxed">
        {!valid && (
          <p className="text-muted-foreground">
            {copy(
              "先填寫有效航班號碼（例如 CX543）及日期；仍可手動輸入。",
              "Enter a valid flight number (e.g. CX543) and date first; manual entry is always available."
            )}
          </p>
        )}
        {valid && loading && (
          <p role="status">
            {copy(
              "正在查找已儲存的相同航班…",
              "Looking up exact saved matches…"
            )}
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="flex items-start gap-1.5 break-words text-destructive"
          >
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {copy(
              "未能查找航班，請重新查找或手動填寫。",
              "Lookup failed. Refresh or enter details manually."
            )}{" "}
            <span className="break-all">{error}</span>
          </p>
        )}
        {!loading && !error && result?.status === "not_found" && (
          <p>
            {copy(
              "找不到相同號碼及日期的已儲存紀錄；不會用其他日期或猜測航線。請手動填寫。",
              "No saved record matches this number and date. Other dates and guessed routes are never used. Enter details manually."
            )}
          </p>
        )}
        {!loading && !error && result && result.candidates.length > 1 && (
          <p className="font-medium">
            {copy(
              "找到多個精確配對，請選擇一項；不會自動決定。",
              "Multiple exact matches found. Choose one explicitly; none is selected automatically."
            )}
          </p>
        )}
        {!loading &&
          !error &&
          result?.candidates.map(candidate => (
            <div
              key={candidate.id}
              className="min-w-0 rounded-lg border border-border bg-card p-2.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 break-words font-medium">
                  {candidate.flightNumber} · {candidate.fromCode || "—"} →{" "}
                  {candidate.toCode || "—"}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-auto min-h-8 max-w-full gap-1.5 whitespace-normal px-2 py-1 text-xs"
                  disabled={disabled}
                  onClick={() => onApply(candidate)}
                >
                  {appliedId === candidate.id && (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  )}
                  {appliedId === candidate.id
                    ? copy("再次填入可用欄位", "Fill available fields again")
                    : copy("選擇並填入", "Choose & fill")}
                </Button>
              </div>
              <p className="mt-1 break-words text-muted-foreground">
                {candidate.date} ·{" "}
                {candidate.airline ||
                  copy("航空公司未填", "Airline not recorded")}
                {candidate.departTime
                  ? ` · ${candidate.departTime} → ${candidate.arriveTime || "—"}`
                  : ""}
              </p>
              <p className="mt-1 break-words text-[11px] text-muted-foreground">
                {candidate.source === "passport"
                  ? copy("個人護照紀錄", "Personal passport record")
                  : copy("有權存取的行程紀錄", "Accessible trip record")}{" "}
                · {candidate.sourceLabel} · {copy("非即時", "not live")}
              </p>
            </div>
          ))}
        {appliedId && !loading && !error && (
          <p className="text-primary">
            {copy(
              "已嘗試填入可用欄位；既有及手動修改內容保持不變。請核對後按儲存。",
              "Available fields filled where permitted. Existing and manually edited values are unchanged. Review before saving."
            )}
          </p>
        )}
      </div>
    </section>
  );
}

function ActiveFlightLookupPanel(props: FlightLookupPanelProps) {
  const input = useMemo(
    () => flightLookupInput(props.flightNumber, props.date),
    [props.flightNumber, props.date]
  );
  const requestIdentity = input
    ? `${input.flightNumber}|${input.date}|${props.tripId ?? "passport"}`
    : "";
  const [debounced, setDebounced] = useState("");
  const [appliedId, setAppliedId] = useState<string>();
  const attempted = useRef(new Set<string>());
  const latest = useRef(props);
  latest.current = props;
  useEffect(() => {
    setDebounced("");
    setAppliedId(undefined);
    if (!requestIdentity) return;
    const timer = window.setTimeout(() => setDebounced(requestIdentity), 450);
    return () => window.clearTimeout(timer);
  }, [requestIdentity]);
  const enabled = Boolean(
    input &&
      debounced === requestIdentity &&
      props.open &&
      props.authorized &&
      !props.disabled
  );
  const queryInput = useMemo(
    () => ({
      flightNumber: input?.flightNumber ?? "",
      date: input?.date ?? "",
      ...(props.tripId === undefined ? {} : { tripId: props.tripId }),
    }),
    [input?.flightNumber, input?.date, props.tripId]
  );
  const query = trpc.flightLookup.byNumber.useQuery(queryInput, {
    enabled,
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    trpc: { abortOnUnmount: true },
  });
  const result =
    enabled &&
    query.data &&
    query.data.flightNumber === input?.flightNumber &&
    query.data.date === input?.date
      ? query.data
      : undefined;
  const apply = (candidate: FlightLookupCandidate) => {
    const active = latest.current;
    if (
      !active.open ||
      !active.authorized ||
      active.disabled ||
      active.sessionKey !== props.sessionKey ||
      !candidateMatchesFlight(candidate, active.flightNumber, active.date)
    )
      return;
    active.onApply(candidate);
    setAppliedId(candidate.id);
  };
  useEffect(() => {
    if (
      !result ||
      query.isFetching ||
      result.status !== "matched" ||
      result.candidates.length !== 1 ||
      attempted.current.has(requestIdentity)
    )
      return;
    attempted.current.add(requestIdentity);
    apply(result.candidates[0]);
  }, [result, query.isFetching, requestIdentity]);
  return (
    <FlightLookupPanelView
      lang={props.lang}
      valid={Boolean(input)}
      loading={
        Boolean(input) && !props.disabled && (!enabled || query.isFetching)
      }
      error={enabled && query.isError ? query.error.message : undefined}
      result={result}
      appliedId={appliedId}
      disabled={props.disabled}
      onRefresh={() => {
        if (enabled && !query.isFetching) void query.refetch();
      }}
      onApply={apply}
    />
  );
}

/** Unmount the query observer on close/reset so old requests cannot fill a new dialog. */
export default function FlightLookupPanel(props: FlightLookupPanelProps) {
  if (!props.open || !props.authorized) return null;
  return (
    <ActiveFlightLookupPanel
      key={`${props.sessionKey}:${props.tripId ?? "passport"}`}
      {...props}
    />
  );
}
