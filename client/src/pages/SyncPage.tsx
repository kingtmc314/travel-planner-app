import { useI18n } from "@/hooks/useI18n";
import React, { useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { formatDateOnlyInHongKong } from "@/lib/hongKongDate";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  ArrowDown,
  Plane,
  MapPin,
  Receipt,
  Hotel,
  Globe,
  CalendarDays,
  Activity,
  ShieldCheck,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Layers3,
} from "lucide-react";

const getCategoryLabels = (lang: string): Record<string, string> =>
  lang === "zh"
    ? {
        transport: "交通",
        food: "餐飲",
        accommodation: "住宿",
        attraction: "景點",
        shopping: "購物",
        other: "其他",
      }
    : {
        transport: "Transport",
        food: "Food",
        accommodation: "Accommodation",
        attraction: "Attraction",
        shopping: "Shopping",
        other: "Other",
      };

const CATEGORY_COLORS: Record<string, string> = {
  transport: "bg-sky-100 text-sky-800",
  food: "bg-orange-100 text-orange-800",
  accommodation: "bg-violet-100 text-violet-800",
  attraction: "bg-emerald-100 text-emerald-800",
  shopping: "bg-pink-100 text-pink-800",
  other: "bg-slate-100 text-slate-700",
};

type Suggestion = {
  id: number;
  title: string;
  suggestedCategory:
    | "transport"
    | "food"
    | "accommodation"
    | "attraction"
    | "shopping"
    | "other";
};

type ActionResult = {
  title: string;
  tripName?: string;
  created?: number;
  updated?: number;
  skipped?: number;
  invalid?: number;
  details?: string[];
};

function AiClassifyCard({
  trips,
  uncategorisedCount,
  disabled,
  onBusyChange,
}: {
  trips: Array<{ id: number; name: string; userRole: string }>;
  uncategorisedCount?: number;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const { lang } = useI18n();
  const utils = trpc.useUtils();
  const [phase, setPhase] = useState<
    "idle" | "selecting" | "analysing" | "reviewing" | "applying" | "done"
  >("idle");
  const [selectedTripId, setSelectedTripId] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [overrides, setOverrides] = useState<
    Record<number, Suggestion["suggestedCategory"]>
  >({});
  const [expanded, setExpanded] = useState(true);
  const [applyCount, setApplyCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const operationLock = useRef(false);
  const editableTrips = trips.filter(
    trip => trip.userRole === "owner" || trip.userRole === "editor"
  );
  const isBusy = phase === "analysing" || phase === "applying";

  const applyClassification = trpc.expenses.applyClassification.useMutation({
    onSuccess: async data => {
      setApplyCount(data.updated);
      setPhase("done");
      toast.success(
        lang === "zh"
          ? `已更新 ${data.updated} 筆費用分類`
          : `Updated ${data.updated} expense categories`
      );
      await utils.invalidate();
    },
    onError: e => {
      setError(e.message);
      setPhase("reviewing");
      toast.error(
        lang === "zh" ? `套用失敗：${e.message}` : `Apply failed: ${e.message}`
      );
    },
    onSettled: () => {
      operationLock.current = false;
      onBusyChange(false);
    },
  });

  const reset = () => {
    if (operationLock.current) return;
    setPhase("idle");
    setSuggestions([]);
    setOverrides({});
    setApplyCount(null);
    setError(null);
  };

  const analyse = async () => {
    if (!selectedTripId || operationLock.current || disabled) return;
    operationLock.current = true;
    onBusyChange(true);
    setPhase("analysing");
    setSuggestions([]);
    setOverrides({});
    setApplyCount(null);
    setError(null);
    try {
      const result = await utils.expenses.autoClassify.fetch({
        tripId: selectedTripId,
      });
      setSuggestions(result.suggestions);
      setExpanded(true);
      setPhase(result.suggestions.length ? "reviewing" : "done");
      if (!result.suggestions.length) setApplyCount(0);
    } catch (e: unknown) {
      const message =
        e instanceof Error
          ? e.message
          : lang === "zh"
            ? "分析失敗，請重試"
            : "Analysis failed. Please retry.";
      setError(message);
      setPhase("selecting");
      toast.error(message);
    } finally {
      operationLock.current = false;
      onBusyChange(false);
    }
  };

  const apply = () => {
    if (
      !selectedTripId ||
      !suggestions.length ||
      operationLock.current ||
      disabled
    )
      return;
    operationLock.current = true;
    onBusyChange(true);
    setError(null);
    setPhase("applying");
    applyClassification.mutate({
      tripId: selectedTripId,
      classifications: suggestions.map(s => ({
        id: s.id,
        category: overrides[s.id] ?? s.suggestedCategory,
      })),
    });
  };

  return (
    <section
      className="voyage-panel space-y-4"
      aria-labelledby="classification-title"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Sparkles className="size-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 id="classification-title" className="font-semibold">
                {lang === "zh" ? "AI 費用分類助手" : "AI expense organiser"}
              </h3>
              {uncategorisedCount !== undefined && (
                <Badge variant="secondary">
                  {uncategorisedCount}{" "}
                  {lang === "zh" ? "筆其他／未分類" : "other / unclassified"}
                </Badge>
              )}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {lang === "zh"
                ? "先分析現有費用，再逐筆確認或修改分類；不會新增費用或更改金額。"
                : "Analyse existing expenses, then review each suggested category. No new expenses or amount changes."}
            </p>
          </div>
        </div>
        {(phase === "idle" || phase === "done") && (
          <Button
            className="h-auto min-h-10 rounded-xl whitespace-normal sm:shrink-0"
            variant="outline"
            disabled={disabled || !editableTrips.length}
            onClick={() => {
              reset();
              setPhase("selecting");
            }}
          >
            <Sparkles />
            {lang === "zh"
              ? phase === "done"
                ? "再次分類"
                : "開始分類"
              : phase === "done"
                ? "Classify again"
                : "Start classification"}
          </Button>
        )}
      </div>
      {phase !== "idle" && phase !== "done" && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select
            value={selectedTripId ? String(selectedTripId) : ""}
            disabled={disabled || isBusy}
            onValueChange={value => {
              setSelectedTripId(Number(value));
              setSuggestions([]);
              setOverrides({});
              setError(null);
              setPhase("selecting");
            }}
          >
            <SelectTrigger
              className="w-full min-w-0 flex-1 rounded-xl [&>span]:truncate"
              aria-label={
                lang === "zh" ? "選擇要分類的行程" : "Choose trip to classify"
              }
            >
              <SelectValue
                placeholder={lang === "zh" ? "選擇行程…" : "Select a trip…"}
              />
            </SelectTrigger>
            <SelectContent className="max-w-[calc(100vw-2rem)]">
              {editableTrips.map(trip => (
                <SelectItem
                  key={trip.id}
                  value={String(trip.id)}
                  className="break-words"
                >
                  {trip.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {phase === "selecting" && (
            <Button
              className="min-h-10 rounded-xl"
              onClick={analyse}
              disabled={!selectedTripId || disabled}
            >
              <Sparkles />
              {lang === "zh" ? "分析費用" : "Analyse expenses"}
            </Button>
          )}
          {isBusy && (
            <p
              className="flex items-center gap-2 text-sm text-muted-foreground"
              role="status"
            >
              <Loader2 className="size-4 animate-spin" />
              {lang === "zh"
                ? phase === "analysing"
                  ? "正在分析…"
                  : "正在套用…"
                : phase === "analysing"
                  ? "Analysing…"
                  : "Applying…"}
            </p>
          )}
        </div>
      )}
      {phase === "reviewing" && suggestions.length > 0 && (
        <div>
          <button
            className="mb-3 flex min-h-10 items-center gap-2 text-sm font-medium text-primary focus-visible:outline focus-visible:outline-2"
            aria-expanded={expanded}
            onClick={() => setExpanded(v => !v)}
          >
            {expanded ? (
              <ChevronUp className="size-4" />
            ) : (
              <ChevronDown className="size-4" />
            )}
            {lang === "zh"
              ? `確認 ${suggestions.length} 筆建議`
              : `Review ${suggestions.length} suggestions`}
          </button>
          {expanded && (
            <div className="max-h-72 overflow-y-auto rounded-2xl border border-border divide-y divide-border">
              {suggestions.map(s => {
                const category = overrides[s.id] ?? s.suggestedCategory;
                return (
                  <div
                    key={s.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 p-3"
                  >
                    <p className="break-words text-sm">{s.title}</p>
                    <Select
                      value={category}
                      disabled={disabled || isBusy}
                      onValueChange={value =>
                        setOverrides(prev => ({
                          ...prev,
                          [s.id]: value as Suggestion["suggestedCategory"],
                        }))
                      }
                    >
                      <SelectTrigger
                        className="h-10 w-28 rounded-xl text-xs"
                        aria-label={
                          lang === "zh"
                            ? `${s.title} 的分類`
                            : `Category for ${s.title}`
                        }
                      >
                        <span
                          className={`rounded-md px-1.5 py-1 ${CATEGORY_COLORS[category]}`}
                        >
                          {getCategoryLabels(lang)[category]}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(getCategoryLabels(lang)).map(
                          ([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Button
              className="min-h-10 rounded-xl whitespace-normal"
              onClick={apply}
              disabled={disabled || isBusy}
            >
              <CheckCircle2 />
              {lang === "zh"
                ? `確認套用 ${suggestions.length} 筆分類`
                : `Apply ${suggestions.length} categories`}
            </Button>
            <Button
              className="min-h-10 rounded-xl"
              variant="ghost"
              onClick={reset}
              disabled={disabled || isBusy}
            >
              {lang === "zh" ? "取消" : "Cancel"}
            </Button>
          </div>
        </div>
      )}
      {phase === "done" && (
        <p
          className="rounded-xl bg-primary/5 p-3 text-sm text-primary"
          role="status"
        >
          {lang === "zh"
            ? applyCount === 0
              ? "沒有需要更新的分類。"
              : `已更新 ${applyCount} 筆分類。`
            : applyCount === 0
              ? "No categories need updating."
              : `Updated ${applyCount} categories.`}
        </p>
      )}
      {error && (
        <p
          className="break-words rounded-xl bg-destructive/5 p-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}
      {!editableTrips.length && (
        <p className="text-xs text-muted-foreground">
          {lang === "zh"
            ? "需要可編輯的行程，才能套用分類。"
            : "An editable trip is required to apply categories."}
        </p>
      )}
    </section>
  );
}

export default function SyncPage() {
  const { t, lang } = useI18n();
  const utils = trpc.useUtils();
  const auth = trpc.auth.me.useQuery(undefined, { retry: false });
  const summaryQuery = trpc.sync.getSummary.useQuery(undefined, {
    enabled: !!auth.data,
  });
  const tripsQuery = trpc.trips.list.useQuery(undefined, {
    enabled: !!auth.data,
  });
  const summary = summaryQuery.data;
  const trips = tripsQuery.data ?? [];
  const [selectedTripId, setSelectedTripId] = useState<number | null>(null);
  const [classifyBusy, setClassifyBusy] = useState(false);
  const [lastResult, setLastResult] = useState<ActionResult | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const mutationLock = useRef(false);
  const selectedTrip = trips.find(trip => trip.id === selectedTripId);
  const canEdit =
    selectedTrip?.userRole === "owner" || selectedTrip?.userRole === "editor";
  const tripInput = useMemo(
    () => ({ tripId: selectedTripId ?? 0 }),
    [selectedTripId]
  );
  const flightsQuery = trpc.flights.list.useQuery(tripInput, {
    enabled: !!auth.data && !!selectedTrip,
  });
  const hotelsQuery = trpc.hotels.list.useQuery(tripInput, {
    enabled: !!auth.data && !!selectedTrip,
  });
  const daysQuery = trpc.itinerary.getDays.useQuery(tripInput, {
    enabled: !!auth.data && !!selectedTrip,
  });

  const reportError = (e: { message: string }) => {
    setLastError(e.message);
    toast.error(
      lang === "zh" ? `操作失敗：${e.message}` : `Action failed: ${e.message}`
    );
  };
  const complete = async (result: ActionResult) => {
    setLastResult(result);
    toast.success(
      lang === "zh"
        ? "操作完成，已更新相關頁面"
        : "Action complete. Related pages refreshed."
    );
    await utils.invalidate();
  };
  const release = () => {
    mutationLock.current = false;
  };

  const importFlights = trpc.connected.importFlightsToPassport.useMutation({
    onSuccess: data =>
      complete({
        title:
          lang === "zh"
            ? "行程航班 → 飛行護照"
            : "Trip flights → flight passport",
        tripName: selectedTrip?.name,
        ...data,
      }),
    onError: reportError,
    onSettled: release,
  });
  const syncLogistics = trpc.connected.syncLogisticsToItinerary.useMutation({
    onSuccess: data =>
      complete({
        title:
          lang === "zh"
            ? "航班與住宿 → 每日行程"
            : "Flights & stays → itinerary",
        tripName: selectedTrip?.name,
        ...data,
      }),
    onError: reportError,
    onSettled: release,
  });
  const syncCountriesFromFlights =
    trpc.sync.syncCountriesFromFlights.useMutation({
      onSuccess: data =>
        complete({
          title:
            lang === "zh"
              ? "飛行護照 → 國家足跡"
              : "Flight passport → country history",
          details: [
            lang === "zh"
              ? `已處理 ${data.total} 個航班；同步 ${data.synced} 個國家。`
              : `Processed ${data.total} flights; synced ${data.synced} countries.`,
          ],
        }),
      onError: reportError,
      onSettled: release,
    });
  const syncCountriesFromTrips = trpc.sync.syncCountriesFromTrips.useMutation({
    onSuccess: data =>
      complete({
        title:
          lang === "zh"
            ? "行程目的地 → 國家足跡"
            : "Trip destinations → country history",
        details: [
          lang === "zh"
            ? `已處理 ${data.total} 個行程；同步 ${data.synced} 筆國家資料。`
            : `Processed ${data.total} trips; synced ${data.synced} country records.`,
        ],
      }),
    onError: reportError,
    onSettled: release,
  });
  const syncDataIntegrity = trpc.sync.syncDataIntegrity.useMutation({
    onSuccess: data =>
      complete({
        title: lang === "zh" ? "記錄關聯檢查" : "Record relationship check",
        details: [
          lang === "zh"
            ? `已檢查 ${data.validTrips} 個行程、${data.totalExpenses} 筆費用、${data.totalFlights} 個航班、${data.totalHotels} 筆住宿記錄。`
            : `Checked ${data.validTrips} trips, ${data.totalExpenses} expenses, ${data.totalFlights} flights and ${data.totalHotels} stays.`,
          ...(data.issues.length
            ? [
                lang === "zh"
                  ? "部分行程或費用資料尚未建立；不會刪除任何記錄。"
                  : "Some trip or expense records have not been added. No records are deleted.",
              ]
            : []),
        ],
      }),
    onError: reportError,
    onSettled: release,
  });
  const syncAll = trpc.sync.syncAll.useMutation({
    onSuccess: data =>
      complete({
        title:
          lang === "zh"
            ? "國家同步與記錄驗證"
            : "Country sync & record verification",
        details: data.results.map((result, index) => {
          const labels =
            lang === "zh"
              ? [
                  "護照國家同步",
                  "目的地國家同步",
                  "費用記錄驗證",
                  "航班記錄驗證",
                  "住宿記錄驗證",
                  "國家記錄總計",
                ]
              : [
                  "Passport country sync",
                  "Destination country sync",
                  "Expense verification",
                  "Flight verification",
                  "Stay verification",
                  "Country record total",
                ];
          return `${labels[index] ?? (lang === "zh" ? "操作" : "Operation")}: ${result.synced}`;
        }),
      }),
    onError: reportError,
    onSettled: release,
  });

  const isPending =
    importFlights.isPending ||
    syncLogistics.isPending ||
    syncCountriesFromFlights.isPending ||
    syncCountriesFromTrips.isPending ||
    syncDataIntegrity.isPending ||
    syncAll.isPending;
  const busy = isPending || classifyBusy;
  const run = (action: () => void) => {
    if (mutationLock.current || busy || !auth.data) return;
    mutationLock.current = true;
    setLastError(null);
    setLastResult(null);
    action();
  };
  const numberFormat = new Intl.NumberFormat(lang === "zh" ? "zh-HK" : "en-HK");
  const snapshotTime = summaryQuery.dataUpdatedAt
    ? new Intl.DateTimeFormat(lang === "zh" ? "zh-HK" : "en-HK", {
        timeZone: "Asia/Hong_Kong",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(summaryQuery.dataUpdatedAt)
    : null;
  const metrics = [
    {
      Icon: Layers3,
      label: lang === "zh" ? "行程" : "Trips",
      value: summary?.trips,
    },
    {
      Icon: Activity,
      label: lang === "zh" ? "行程活動" : "Activities",
      value: summary?.activities,
    },
    {
      Icon: Receipt,
      label: lang === "zh" ? "費用記錄" : "Expense records",
      value: summary?.expenses,
    },
    {
      Icon: MapPin,
      label: lang === "zh" ? "地圖標記" : "Map pins",
      value: summary?.mapPins,
    },
    {
      Icon: Plane,
      label: lang === "zh" ? "行程航班" : "Trip flights",
      value: summary?.tripFlights,
    },
    {
      Icon: Hotel,
      label: lang === "zh" ? "住宿記錄" : "Stays",
      value: summary?.hotels,
    },
    {
      Icon: Plane,
      label: lang === "zh" ? "護照航班" : "Passport flights",
      value: summary?.pastFlights,
    },
    {
      Icon: Globe,
      label: lang === "zh" ? "國家記錄" : "Country records",
      value: summary?.visitedCountries,
    },
  ];

  return (
    <AppLayout>
      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
        <header className="voyage-hero relative overflow-hidden">
          <div
            className="pointer-events-none absolute -right-10 -top-12 size-48 rounded-full border border-white/10"
            aria-hidden="true"
          />
          <div className="relative max-w-2xl">
            <p className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-100">
              <Layers3 className="size-4" />
              {lang === "zh"
                ? "你的旅行資料，彼此連接"
                : "A connected travel journal"}
            </p>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              {t("syncCenterTitle")}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/80">
              {lang === "zh"
                ? "輸入一次，按需要連接。將航班、住宿與每日行程串連，再由你確認費用和地圖標記。"
                : "Enter once. Connect intentionally. Bring flights, stays and daily plans together, then choose the expenses and map pins to import."}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs">
                <ShieldCheck className="size-3.5" />
                {lang === "zh" ? "保留手動記錄" : "Manual records retained"}
              </span>
              <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs">
                {lang === "zh"
                  ? "由你決定何時匯入"
                  : "You choose when to import"}
              </span>
            </div>
          </div>
        </header>

        {!auth.isLoading && !auth.data ? (
          <section className="voyage-panel space-y-3">
            <h2 className="voyage-section-title">
              {lang === "zh"
                ? "登入後連接你的旅行資料"
                : "Sign in to connect your travel records"}
            </h2>
            <p
              className="text-sm text-muted-foreground"
              role={auth.error ? "alert" : undefined}
            >
              {auth.error
                ? lang === "zh"
                  ? `無法確認登入狀態：${auth.error.message}`
                  : `Could not confirm sign-in: ${auth.error.message}`
                : lang === "zh"
                  ? "同步中心只會讀取你有權限查看的行程。"
                  : "The hub only reads trips you are authorised to access."}
            </p>
            <Button asChild className="rounded-xl">
              <Link href="/dashboard">
                {lang === "zh" ? "返回我的行程" : "Go to my trips"}
                <ArrowRight />
              </Link>
            </Button>
            {auth.error && (
              <Button
                variant="outline"
                className="ml-2 rounded-xl"
                onClick={() => void auth.refetch()}
              >
                {lang === "zh" ? "重試" : "Retry"}
              </Button>
            )}
          </section>
        ) : (
          <>
            <section aria-labelledby="summary-title" className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className="voyage-eyebrow">
                    {lang === "zh" ? "真實資料快照" : "Your record snapshot"}
                  </p>
                  <h2 id="summary-title" className="voyage-section-title mt-1">
                    {lang === "zh" ? "旅行資料總覽" : "Your travel records"}
                  </h2>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {summaryQuery.isFetching
                    ? lang === "zh"
                      ? "更新中…"
                      : "Refreshing…"
                    : snapshotTime
                      ? lang === "zh"
                        ? `快照更新 ${snapshotTime} · 香港時間 UTC+8`
                        : `Refreshed ${snapshotTime} · Hong Kong UTC+8`
                      : "—"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {lang === "zh"
                  ? "以下為你可查看行程的現有記錄數，並非已同步或已完成的旅行數。國家記錄可包含計劃到訪。"
                  : "Existing records from accessible trips, not counts of synced or completed journeys. Country records may include planned visits."}
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {metrics.map(({ Icon, label, value }) => (
                  <div key={label} className="voyage-metric min-w-0">
                    <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                      <Icon className="size-4 shrink-0 text-primary" />
                      <p className="text-xs">{label}</p>
                    </div>
                    {auth.isLoading || (summaryQuery.isLoading && !summary) ? (
                      <div
                        className="h-8 w-16 animate-pulse rounded-lg bg-muted"
                        aria-label={lang === "zh" ? "載入中" : "Loading"}
                      />
                    ) : (
                      <p className="text-3xl font-semibold tabular-nums tracking-tight">
                        {value === undefined ? "—" : numberFormat.format(value)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              {summaryQuery.error && (
                <div
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive"
                  role="alert"
                >
                  <AlertCircle className="size-4" />
                  <span className="min-w-0 flex-1 break-words">
                    {lang === "zh"
                      ? "資料總覽載入失敗："
                      : "Could not load summary: "}
                    {summaryQuery.error.message}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={summaryQuery.isFetching}
                    onClick={() => void summaryQuery.refetch()}
                  >
                    {lang === "zh" ? "重試" : "Retry"}
                  </Button>
                </div>
              )}
            </section>

            <section
              className="voyage-panel space-y-5"
              aria-labelledby="connection-title"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-xl">
                  <p className="voyage-eyebrow">
                    {lang === "zh"
                      ? "01 / 選擇資料來源"
                      : "01 / Choose your source"}
                  </p>
                  <h2
                    id="connection-title"
                    className="voyage-section-title mt-1"
                  >
                    {lang === "zh" ? "連接這趟旅程" : "Connect this journey"}
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {lang === "zh"
                      ? "先選擇行程，再按下需要的匯入操作；不會在背景自動匯入。"
                      : "Select a trip and run only the imports you need. Nothing is imported automatically in the background."}
                  </p>
                </div>
                <div className="w-full space-y-2 lg:max-w-xs">
                  <label
                    htmlFor="connection-trip"
                    className="text-xs font-semibold"
                  >
                    {lang === "zh" ? "來源行程" : "Source trip"}
                  </label>
                  <Select
                    value={selectedTripId ? String(selectedTripId) : ""}
                    disabled={
                      busy ||
                      !trips.length ||
                      tripsQuery.isLoading ||
                      auth.isLoading
                    }
                    onValueChange={value => {
                      setSelectedTripId(Number(value));
                      setLastError(null);
                      setLastResult(null);
                    }}
                  >
                    <SelectTrigger
                      id="connection-trip"
                      className="min-h-11 w-full min-w-0 rounded-xl [&>span]:truncate"
                    >
                      <SelectValue
                        placeholder={
                          tripsQuery.isLoading || auth.isLoading
                            ? lang === "zh"
                              ? "載入行程…"
                              : "Loading trips…"
                            : lang === "zh"
                              ? "選擇一個行程"
                              : "Choose a trip"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent className="max-w-[calc(100vw-2rem)]">
                      {trips.map(trip => (
                        <SelectItem
                          key={trip.id}
                          value={String(trip.id)}
                          className="break-words"
                        >
                          {trip.name}
                          {trip.userRole === "viewer"
                            ? lang === "zh"
                              ? "（唯讀）"
                              : " (view only)"
                            : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {tripsQuery.error && (
                    <p
                      className="break-words text-xs text-destructive"
                      role="alert"
                    >
                      {tripsQuery.error.message}
                      <button
                        className="ml-2 underline"
                        onClick={() => void tripsQuery.refetch()}
                      >
                        {lang === "zh" ? "重試" : "Retry"}
                      </button>
                    </p>
                  )}
                </div>
              </div>
              {selectedTrip ? (
                <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4">
                  <p className="break-words font-semibold text-primary">
                    {selectedTrip.name}
                  </p>
                  <p className="mt-1 break-words text-xs text-muted-foreground">
                    {selectedTrip.destination} ·{" "}
                    {formatDateOnlyInHongKong(selectedTrip.startDate, lang) ||
                      "—"}{" "}
                    —{" "}
                    {formatDateOnlyInHongKong(selectedTrip.endDate, lang) ||
                      "—"}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-lg bg-card px-2.5 py-1.5 text-card-foreground">
                      {lang === "zh" ? "航班" : "Flights"} ·{" "}
                      {flightsQuery.data
                        ? numberFormat.format(flightsQuery.data.length)
                        : "—"}
                    </span>
                    <span className="rounded-lg bg-card px-2.5 py-1.5 text-card-foreground">
                      {lang === "zh" ? "住宿" : "Stays"} ·{" "}
                      {hotelsQuery.data
                        ? numberFormat.format(hotelsQuery.data.length)
                        : "—"}
                    </span>
                    <span className="rounded-lg bg-card px-2.5 py-1.5 text-card-foreground">
                      {lang === "zh" ? "活動" : "Activities"} ·{" "}
                      {daysQuery.data
                        ? numberFormat.format(
                            daysQuery.data.reduce(
                              (count, day) => count + day.activities.length,
                              0
                            )
                          )
                        : "—"}
                    </span>
                  </div>
                  {(flightsQuery.isLoading ||
                    hotelsQuery.isLoading ||
                    daysQuery.isLoading) && (
                    <p
                      className="mt-2 text-xs text-muted-foreground"
                      role="status"
                    >
                      {lang === "zh"
                        ? "正在讀取來源記錄…"
                        : "Reading source records…"}
                    </p>
                  )}
                  {(flightsQuery.error ||
                    hotelsQuery.error ||
                    daysQuery.error) && (
                    <p
                      className="mt-2 break-words text-xs text-destructive"
                      role="alert"
                    >
                      {lang === "zh"
                        ? "部分來源資料未能載入："
                        : "Some sources could not be loaded: "}
                      {flightsQuery.error?.message ??
                        hotelsQuery.error?.message ??
                        daysQuery.error?.message}
                      <button
                        className="ml-2 underline"
                        onClick={() => {
                          void flightsQuery.refetch();
                          void hotelsQuery.refetch();
                          void daysQuery.refetch();
                        }}
                      >
                        {lang === "zh" ? "重試" : "Retry"}
                      </button>
                    </p>
                  )}
                  {!canEdit && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {lang === "zh"
                        ? "此行程為唯讀：可匯入自己的飛行護照，但修改共用行程、費用或地圖需要擁有者或編輯者權限。"
                        : "This trip is view-only. You can import to your own passport; changing shared itinerary, expenses or map data requires owner or editor access."}
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex items-start gap-3 rounded-2xl border border-dashed border-primary/25 bg-primary/5 p-4">
                  <Layers3 className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-medium">
                      {!tripsQuery.isLoading &&
                      !!auth.data &&
                      !trips.length &&
                      !tripsQuery.error
                        ? lang === "zh"
                          ? "先建立你的第一個行程"
                          : "Create your first trip"
                        : lang === "zh"
                          ? "選擇行程以開始連接"
                          : "Choose a trip to begin"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {lang === "zh"
                        ? "所有匯入均以所選行程為來源。手動新增方式仍然保留。"
                        : "Imports use the selected trip as their source. Manual entry remains available."}
                    </p>
                    <Link
                      href="/dashboard"
                      className="mt-2 inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-primary"
                    >
                      {lang === "zh" ? "查看我的行程" : "View my trips"}
                      <ArrowRight className="size-3.5" />
                    </Link>
                  </div>
                </div>
              )}

              <div className="grid gap-4 lg:grid-cols-2">
                <article className="flex flex-col rounded-2xl border border-border bg-card p-4 text-card-foreground sm:p-5">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-primary">
                    <Plane className="size-4" />
                    {lang === "zh" ? "行程航班" : "Trip flights"}
                    <ArrowRight className="size-3" />
                    {lang === "zh" ? "飛行護照" : "Flight passport"}
                  </div>
                  <h3 className="mt-3 text-lg font-semibold">
                    {lang === "zh"
                      ? "留住每一次飛行"
                      : "Keep every flight in your journal"}
                  </h3>
                  <p className="mt-2 flex-1 text-xs leading-relaxed text-muted-foreground">
                    {lang === "zh"
                      ? "匯入香港今天或之前的有效航班至自己的護照，並更新護照國家足跡。未來或重複航班會略過；日期或機場資料不完整的記錄列為無效。"
                      : "Import valid flights dated today or earlier in Hong Kong to your own passport, updating passport country history too. Future or duplicate flights are skipped; incomplete dates or airports are invalid."}
                  </p>
                  <Button
                    className="mt-4 h-auto min-h-11 w-full rounded-xl whitespace-normal"
                    disabled={
                      !selectedTrip ||
                      busy ||
                      flightsQuery.isLoading ||
                      !!flightsQuery.error ||
                      !flightsQuery.data?.length
                    }
                    onClick={() => {
                      if (selectedTripId)
                        run(() =>
                          importFlights.mutate({ tripId: selectedTripId })
                        );
                    }}
                  >
                    {importFlights.isPending ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Plane />
                    )}
                    {importFlights.isPending
                      ? lang === "zh"
                        ? "匯入中…"
                        : "Importing…"
                      : lang === "zh"
                        ? "匯入飛行護照"
                        : "Import to flight passport"}
                  </Button>
                  <Link
                    href="/flight-passport"
                    className="mt-2 inline-flex min-h-10 items-center justify-center gap-1 text-xs font-medium text-primary"
                  >
                    {lang === "zh"
                      ? "查看護照／手動新增"
                      : "View passport / add manually"}
                    <ArrowRight className="size-3.5" />
                  </Link>
                </article>
                <article className="flex flex-col rounded-2xl border border-border bg-card p-4 text-card-foreground sm:p-5">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-primary">
                    <Hotel className="size-4" />
                    {lang === "zh" ? "航班與住宿" : "Flights & stays"}
                    <ArrowRight className="size-3" />
                    {lang === "zh" ? "每日行程" : "Daily itinerary"}
                  </div>
                  <h3 className="mt-3 text-lg font-semibold">
                    {lang === "zh"
                      ? "把旅程骨架排好"
                      : "Give your days a structure"}
                  </h3>
                  <p className="mt-2 flex-1 text-xs leading-relaxed text-muted-foreground">
                    {lang === "zh"
                      ? "將航班及住宿入住／退房連接至行程。再次執行會識別來源，不重複新增；手動活動保留。"
                      : "Connect flights and stay check-in / check-out to the itinerary. Source-aware repeat runs avoid duplicate entries; manual activities remain."}
                  </p>
                  <Button
                    className="mt-4 h-auto min-h-11 w-full rounded-xl whitespace-normal"
                    disabled={
                      !canEdit ||
                      busy ||
                      flightsQuery.isLoading ||
                      hotelsQuery.isLoading ||
                      !!flightsQuery.error ||
                      !!hotelsQuery.error ||
                      (!flightsQuery.data?.length && !hotelsQuery.data?.length)
                    }
                    onClick={() => {
                      if (selectedTripId)
                        run(() =>
                          syncLogistics.mutate({ tripId: selectedTripId })
                        );
                    }}
                  >
                    {syncLogistics.isPending ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <CalendarDays />
                    )}
                    {syncLogistics.isPending
                      ? lang === "zh"
                        ? "連接中…"
                        : "Connecting…"
                      : lang === "zh"
                        ? "連接至每日行程"
                        : "Connect to daily itinerary"}
                  </Button>
                  {selectedTripId ? (
                    <Link
                      href={`/trips/${selectedTripId}/itinerary`}
                      className="mt-2 inline-flex min-h-10 items-center justify-center gap-1 text-xs font-medium text-primary"
                    >
                      {lang === "zh"
                        ? "查看行程／手動編輯"
                        : "View itinerary / edit manually"}
                      <ArrowRight className="size-3.5" />
                    </Link>
                  ) : (
                    <p className="mt-2 py-3 text-center text-xs text-muted-foreground">
                      {lang === "zh"
                        ? "選擇行程後可查看"
                        : "Choose a trip to view"}
                    </p>
                  )}
                </article>
              </div>
              <div className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                <p>
                  {lang === "zh"
                    ? "匯入只新增缺少的紀錄，已連接項目會略過，不會覆寫手動修改或刪除資料。這並非雙向同步；來源日後修改時，請在目標頁面確認。"
                    : "Imports only add missing records. Linked entries are skipped; manual edits are not overwritten and nothing is deleted. This is not two-way sync: review later source changes on the destination page."}
                </p>
              </div>
            </section>

            <section className="space-y-3" aria-labelledby="preview-title">
              <div>
                <p className="voyage-eyebrow">
                  {lang === "zh"
                    ? "02 / 先預覽，再選擇"
                    : "02 / Preview, then choose"}
                </p>
                <h2 id="preview-title" className="voyage-section-title mt-1">
                  {lang === "zh"
                    ? "費用與地點，由你確認"
                    : "You decide what becomes a record"}
                </h2>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {[
                  {
                    Icon: Receipt,
                    path: "expenses",
                    title:
                      lang === "zh"
                        ? "行程活動 → 費用記錄"
                        : "Activities → expense records",
                    text:
                      lang === "zh"
                        ? "活動費用可能只是預算估算。前往費用頁預覽並選取要匯入的項目，確認金額、幣別和付款人；估算不代表實際已支付。"
                        : "Activity costs may be budget estimates. Preview and select items in Expenses, checking amount, currency and payer. An estimate is not proof of payment.",
                    action:
                      lang === "zh"
                        ? "預覽並選擇費用"
                        : "Preview & select expenses",
                  },
                  {
                    Icon: MapPin,
                    path: "map",
                    title:
                      lang === "zh"
                        ? "行程活動 → 地圖標記"
                        : "Activities → map pins",
                    text:
                      lang === "zh"
                        ? "只匯入你選取並具有效座標的活動。前往地圖頁先查看候選地點；不會自動猜測地址或新增所有標記。"
                        : "Import only selected activities with valid coordinates. Review candidate locations in Map; addresses are not guessed and pins are not added blindly.",
                    action:
                      lang === "zh"
                        ? "預覽並選擇地點"
                        : "Preview & select locations",
                  },
                ].map(({ Icon, path, title, text, action }) => (
                  <article key={path} className="voyage-panel flex flex-col">
                    <div className="flex items-center gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <Icon className="size-5" />
                      </span>
                      <h3 className="font-semibold">{title}</h3>
                    </div>
                    <p className="mt-3 flex-1 text-xs leading-relaxed text-muted-foreground">
                      {text}
                    </p>
                    {selectedTripId ? (
                      <Button
                        variant="outline"
                        className="mt-4 h-auto min-h-11 w-full rounded-xl whitespace-normal"
                        asChild
                      >
                        <Link href={`/trips/${selectedTripId}/${path}`}>
                          <Icon />
                          {action}
                          <ArrowRight />
                        </Link>
                      </Button>
                    ) : (
                      <p className="mt-4 rounded-xl bg-muted/50 p-3 text-center text-xs text-muted-foreground">
                        {lang === "zh"
                          ? "先在上方選擇行程"
                          : "Choose a trip above first"}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </section>

            {(lastResult || lastError || isPending) && (
              <section
                className={`voyage-panel ${lastError ? "border-destructive/30" : "border-primary/25"}`}
                aria-live="polite"
                aria-atomic="true"
              >
                {isPending && (
                  <p
                    className="flex items-center gap-2 text-sm font-medium text-primary"
                    role="status"
                  >
                    <Loader2 className="size-4 animate-spin" />
                    {lang === "zh"
                      ? "正在處理，請勿重複按下…"
                      : "Working. Please do not run this again yet…"}
                  </p>
                )}
                {lastError && (
                  <div role="alert">
                    <p className="flex items-center gap-2 font-semibold text-destructive">
                      <AlertCircle className="size-4" />
                      {lang === "zh"
                        ? "未能完成操作"
                        : "Action could not be completed"}
                    </p>
                    <p className="mt-2 break-words text-sm text-destructive">
                      {lastError}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {lang === "zh"
                        ? "請檢查權限及來源資料後重試。若操作部分完成，重複匯入會略過已建立項目。"
                        : "Check your access and source data, then retry. If an import partially completed, existing items are skipped on repeat."}
                    </p>
                  </div>
                )}
                {lastResult && (
                  <div>
                    <p className="flex items-center gap-2 font-semibold text-primary">
                      <CheckCircle2 className="size-4" />
                      {lastResult.title}
                    </p>
                    {lastResult.tripName && (
                      <p className="mt-1 break-words text-xs text-muted-foreground">
                        {lastResult.tripName}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {[
                        {
                          label: lang === "zh" ? "已新增" : "Created",
                          count: lastResult.created,
                        },
                        {
                          label: lang === "zh" ? "已更新" : "Updated",
                          count: lastResult.updated,
                        },
                        {
                          label: lang === "zh" ? "已略過" : "Skipped",
                          count: lastResult.skipped,
                        },
                        {
                          label: lang === "zh" ? "資料無效" : "Invalid",
                          count: lastResult.invalid,
                        },
                      ]
                        .filter(item => item.count !== undefined)
                        .map(item => (
                          <span
                            key={item.label}
                            className="rounded-xl bg-primary/5 px-3 py-2 text-xs text-primary"
                          >
                            {item.label}{" "}
                            <strong className="ml-1 tabular-nums">
                              {numberFormat.format(item.count!)}
                            </strong>
                          </span>
                        ))}
                    </div>
                    {lastResult.details && (
                      <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                        {lastResult.details.map((detail, index) => (
                          <li key={index} className="break-words">
                            {detail}
                          </li>
                        ))}
                      </ul>
                    )}
                    {!!lastResult.invalid && (
                      <p className="mt-3 text-xs text-muted-foreground">
                        {lang === "zh"
                          ? "請在來源頁補全日期、機場或其他必要資料後重試。"
                          : "Complete dates, airports or other required source fields before retrying."}
                      </p>
                    )}
                  </div>
                )}
              </section>
            )}

            <section
              className="voyage-panel space-y-4"
              aria-labelledby="countries-title"
            >
              <div>
                <p className="voyage-eyebrow">
                  {lang === "zh"
                    ? "03 / 串連旅行足跡"
                    : "03 / Connect your travel history"}
                </p>
                <h2 id="countries-title" className="voyage-section-title mt-1">
                  {lang === "zh"
                    ? "目的地，化成你的國家足跡"
                    : "Turn destinations into country history"}
                </h2>
              </div>
              <div className="flex flex-col items-stretch gap-2 rounded-2xl bg-primary/5 p-4 text-sm font-medium sm:flex-row sm:items-center sm:justify-center">
                <span className="flex items-center justify-center gap-2">
                  <Plane className="size-4 text-primary" />
                  {lang === "zh"
                    ? "行程 → 飛行護照"
                    : "Trips → flight passport"}
                </span>
                <ArrowDown className="mx-auto size-4 text-primary sm:hidden" />
                <ArrowRight className="hidden size-4 text-primary sm:block" />
                <span className="flex items-center justify-center gap-2">
                  <Globe className="size-4 text-primary" />
                  {lang === "zh" ? "國家足跡" : "Country history"}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {lang === "zh"
                  ? "以下操作使用你可查看的全部行程／護照記錄，不限上方所選行程。未來旅程標為計劃到訪，已到訪的手動標記會保留；不會自動匯入費用或地圖標記。"
                  : "These actions use all accessible trip / passport records, not just the selected trip above. Future journeys are planned visits; manually visited countries are retained. Expenses and map pins are not auto-imported."}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  variant="outline"
                  className="h-auto min-h-11 rounded-xl whitespace-normal"
                  disabled={busy || !auth.data}
                  onClick={() => run(() => syncCountriesFromFlights.mutate())}
                >
                  {syncCountriesFromFlights.isPending ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Plane />
                  )}
                  {lang === "zh"
                    ? "護照航班 → 國家足跡"
                    : "Passport flights → countries"}
                </Button>
                <Button
                  variant="outline"
                  className="h-auto min-h-11 rounded-xl whitespace-normal"
                  disabled={busy || !auth.data}
                  onClick={() => run(() => syncCountriesFromTrips.mutate())}
                >
                  {syncCountriesFromTrips.isPending ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Globe />
                  )}
                  {lang === "zh"
                    ? "行程目的地 → 國家足跡"
                    : "Trip destinations → countries"}
                </Button>
              </div>
              <Link
                href="/travel-history"
                className="inline-flex min-h-10 items-center gap-1 text-xs font-semibold text-primary"
              >
                {lang === "zh"
                  ? "查看國家足跡／手動標記"
                  : "View country history / mark manually"}
                <ArrowRight className="size-3.5" />
              </Link>
            </section>

            <AiClassifyCard
              trips={trips}
              uncategorisedCount={summary?.uncategorisedExpenses}
              disabled={busy || !auth.data}
              onBusyChange={setClassifyBusy}
            />

            <section
              className="voyage-panel space-y-3"
              aria-labelledby="verification-title"
            >
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
                <div>
                  <h2 id="verification-title" className="font-semibold">
                    {lang === "zh"
                      ? "記錄驗證與傳統同步"
                      : "Record checks & existing sync"}
                  </h2>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {lang === "zh"
                      ? "關聯檢查只驗證及統計記錄，不清理、不刪除。整合同步只處理國家足跡及記錄驗證；上方的航班、行程、費用和地圖匯入仍需分別確認。"
                      : "Relationship checks verify and count records, without cleanup or deletion. Combined sync handles country history and record verification only; flight, itinerary, expense and map imports above remain separate explicit actions."}
                  </p>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  variant="outline"
                  className="h-auto min-h-11 rounded-xl whitespace-normal"
                  disabled={busy || !auth.data}
                  onClick={() => run(() => syncDataIntegrity.mutate())}
                >
                  {syncDataIntegrity.isPending ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <ShieldCheck />
                  )}
                  {lang === "zh"
                    ? "檢查記錄關聯（不刪除）"
                    : "Check relationships (no deletion)"}
                </Button>
                <Button
                  variant="outline"
                  className="h-auto min-h-11 rounded-xl whitespace-normal"
                  disabled={busy || !auth.data}
                  onClick={() => run(() => syncAll.mutate())}
                >
                  {syncAll.isPending ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <RefreshCw />
                  )}
                  {lang === "zh"
                    ? "同步國家並驗證記錄"
                    : "Sync countries & verify records"}
                </Button>
              </div>
            </section>
          </>
        )}
      </div>
    </AppLayout>
  );
}
