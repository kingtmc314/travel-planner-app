import { useI18n } from "@/hooks/useI18n";
import { useState, useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  RefreshCw, CheckCircle2, AlertCircle, Loader2,
  Plane, MapPin, Receipt, Hotel, Globe, Map, Activity, Database, Zap, Sparkles, ChevronDown, ChevronUp,
} from "lucide-react";

type SyncStatus = "idle" | "syncing" | "done" | "error";

const getCategoryLabels = (lang: string): Record<string, string> => lang === "zh" ? {
  transport: "交通",
  food: "餐飲",
  accommodation: "住宿",
  attraction: "景點",
  shopping: "購物",
  other: "其他",
} : {
  transport: "Transport",
  food: "Food",
  accommodation: "Accommodation",
  attraction: "Attraction",
  shopping: "Shopping",
  other: "Other",
};

const CATEGORY_COLORS: Record<string, string> = {
  transport: "bg-blue-100 text-blue-700",
  food: "bg-orange-100 text-orange-700",
  accommodation: "bg-purple-100 text-purple-700",
  attraction: "bg-green-100 text-green-700",
  shopping: "bg-pink-100 text-pink-700",
  other: "bg-slate-100 text-slate-600",
};

interface SyncCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  count?: number;
  countLabel?: string;
  status: SyncStatus;
  onSync: () => void;
  result?: string;
}

function SyncCard({ icon, title, description, count, countLabel, status, onSync, result }: SyncCardProps) {
  const { t, lang } = useI18n();
  return (
    <Card className={`transition-all duration-300 ${status === "done" ? "border-green-300 bg-green-50/50 dark:bg-green-950/20" : status === "error" ? "border-destructive/30 bg-destructive/5" : ""}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              status === "done" ? "bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400" :
              status === "error" ? "bg-destructive/10 text-destructive" :
              "bg-primary/10 text-primary"
            }`}>
              {status === "syncing" ? <Loader2 className="w-5 h-5 animate-spin" /> :
               status === "done" ? <CheckCircle2 className="w-5 h-5" /> :
               status === "error" ? <AlertCircle className="w-5 h-5" /> :
               icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-foreground text-sm">{title}</h3>
                {count !== undefined && (
                  <Badge variant="secondary" className="text-xs font-mono">
                    {count} {countLabel ?? t("syncItems")}
                  </Badge>
                )}
                {status === "done" && (
                  <Badge className="text-xs bg-green-100 text-green-700 border-green-200 dark:bg-green-900/40 dark:text-green-400">{t("syncDone")}</Badge>
                )}
                {status === "error" && (
                  <Badge variant="destructive" className="text-xs">{t("syncFailed")}</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
              {result && (
                <p className={`text-xs mt-1.5 font-medium ${status === "done" ? "text-green-600" : "text-destructive"}`}>
                  {result}
                </p>
              )}
            </div>
          </div>
          <Button
            size="sm"
            variant={status === "done" ? "outline" : "default"}
            onClick={onSync}
            disabled={status === "syncing"}
            className="shrink-0"
          >
            {status === "syncing" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            <span className="ml-1.5 hidden sm:inline">{status === "done" ? lang === "zh" ? "重新同步" : "Resync" : t("syncNow")}</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── AI Auto-Classify Card ────────────────────────────────────────────────────
type ClassifyPhase = "idle" | "selecting-trip" | "classifying" | "reviewing" | "applying" | "done";

type Suggestion = {
  id: number;
  title: string;
  suggestedCategory: "transport" | "food" | "accommodation" | "attraction" | "shopping" | "other";
};

function AiClassifyCard({ trips, uncategorisedCount }: { trips: Array<{ id: number; name: string }>; uncategorisedCount?: number }) {
  const { t, lang } = useI18n();
  const [phase, setPhase] = useState<ClassifyPhase>("idle");
  const [selectedTripId, setSelectedTripId] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [overrides, setOverrides] = useState<Record<number, string>>({});
  const [expanded, setExpanded] = useState(false);
  const [applyResult, setApplyResult] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const autoClassify = trpc.expenses.autoClassify.useQuery(
    { tripId: selectedTripId ?? 0 },
    {
      enabled: false, // manually triggered
      retry: false,
    }
  );

  const applyClassification = trpc.expenses.applyClassification.useMutation({
    onSuccess: (data) => {
      setApplyResult(lang === "zh" ? `已成功更新 ${data.updated} 筆費用的分類` : `Successfully updated ${data.updated} expense categories`);
      setPhase("done");
      toast.success(lang === "zh" ? `AI 分類完成：${data.updated} 筆費用已更新` : `AI classification done: ${data.updated} expenses updated`);
      utils.expenses.list.invalidate();
    },
    onError: (e) => {
      toast.error(lang === "zh" ? `套用失敗：${e.message}` : `Apply failed: ${e.message}`);
      setPhase("reviewing");
    },
  });

  const handleStartClassify = async () => {
    if (!selectedTripId) {
      toast.error(lang === "zh" ? "請先選擇行程" : "Please select a trip first");
      return;
    }
    setPhase("classifying");
    setSuggestions([]);
    setOverrides({});
    setApplyResult(null);
    try {
      const result = await utils.expenses.autoClassify.fetch({ tripId: selectedTripId });
      if (result.suggestions.length === 0) {
        toast.info(lang === "zh" ? "此行程沒有未分類的費用" : "No uncategorised expenses in this trip");
        setPhase("done");
        setApplyResult(lang === "zh" ? "此行程所有費用已有分類，無需更新。" : "All expenses already categorised.");
        return;
      }
      setSuggestions(result.suggestions);
      setPhase("reviewing");
      setExpanded(true);
    } catch (e: any) {
      toast.error(lang === "zh" ? `AI 分類失敗：${e.message}` : `AI classification failed: ${e.message}`);
      setPhase("idle");
    }
  };

  const handleApply = () => {
    if (!selectedTripId) return;
    setPhase("applying");
    const classifications = suggestions.map(s => ({
      id: s.id,
      category: (overrides[s.id] ?? s.suggestedCategory) as Suggestion["suggestedCategory"],
    }));
    applyClassification.mutate({ tripId: selectedTripId, classifications });
  };

  const handleReset = () => {
    setPhase("idle");
    setSuggestions([]);
    setOverrides({});
    setApplyResult(null);
    setExpanded(false);
  };

  const isClassifying = phase === "classifying";
  const isApplying = phase === "applying";
  const isDone = phase === "done";

  return (
    <Card className={`transition-all duration-300 ${isDone ? "border-green-300 bg-green-50/50 dark:bg-green-950/20" : "border-primary/20"}`}>
      <CardContent className="p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              isDone ? "bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400" :
              isClassifying || isApplying ? "bg-primary/10 text-primary" :
              "bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400"
            }`}>
              {isClassifying || isApplying
                ? <Loader2 className="w-5 h-5 animate-spin" />
                : isDone
                  ? <CheckCircle2 className="w-5 h-5" />
                  : <Sparkles className="w-5 h-5" />
              }
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-foreground text-sm">{lang === "zh" ? "AI 自動分類費用" : "AI Auto-Classify Expenses"}</h3>
                <Badge className="text-xs bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-400">AI</Badge>
                {uncategorisedCount !== undefined && uncategorisedCount > 0 && phase === "idle" && (
                  <Badge variant="secondary" className="text-xs font-mono">{uncategorisedCount} {lang === "zh" ? "筆未分類" : "uncategorised"}</Badge>
                )}
                {suggestions.length > 0 && phase === "reviewing" && (
                  <Badge variant="secondary" className="text-xs font-mono">{suggestions.length} {lang === "zh" ? "筆待確認" : "to review"}</Badge>
                )}
                {isDone && (
                  <Badge className="text-xs bg-green-100 text-green-700 border-green-200 dark:bg-green-900/40 dark:text-green-400">{t("syncDone")}</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {lang === "zh" ? "使用 AI 分析費用名稱，自動將「其他」類別歸類為餐飲、交通、購物等正確分類" : "Use AI to analyse expense names and auto-categorise them into food, transport, shopping, etc."}
              </p>
              {applyResult && (
                <p className={`text-xs mt-1.5 font-medium ${isDone ? "text-green-600" : "text-muted-foreground"}`}>
                  {applyResult}
                </p>
              )}
            </div>
          </div>

          {/* Action button */}
          {phase === "idle" || phase === "selecting-trip" ? (
            <Button
              size="sm"
              variant="default"
              className="shrink-0 bg-violet-600 hover:bg-violet-700 text-white"
              onClick={() => setPhase("selecting-trip")}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="ml-1.5 hidden sm:inline">{lang === "zh" ? "開始分類" : "Start"}</span>
            </Button>
          ) : isDone ? (
            <Button size="sm" variant="outline" onClick={handleReset} className="shrink-0">
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="ml-1.5 hidden sm:inline">{lang === "zh" ? "重新分類" : "Retry"}</span>
            </Button>
          ) : null}
        </div>

        {/* Trip selector */}
        {(phase === "selecting-trip" || phase === "classifying" || phase === "reviewing" || phase === "applying") && (
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <Select
              value={selectedTripId ? String(selectedTripId) : ""}
              onValueChange={v => setSelectedTripId(Number(v))}
              disabled={isClassifying || isApplying}
            >
              <SelectTrigger className="flex-1 min-w-0 h-8 text-sm">
                <SelectValue placeholder={lang === "zh" ? "選擇行程…" : "Select trip…"} />
              </SelectTrigger>
              <SelectContent>
                {trips.map(t => (
                  <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {phase === "selecting-trip" && (
              <Button
                size="sm"
                className="shrink-0 bg-violet-600 hover:bg-violet-700 text-white"
                onClick={handleStartClassify}
                disabled={!selectedTripId}
              >
                {isClassifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                <span className="ml-1.5">{lang === "zh" ? "分析" : "Analyse"}</span>
              </Button>
            )}
            {isClassifying && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                {lang === "zh" ? "AI 分析中，請稍候…" : "AI analysing, please wait…"}
              </div>
            )}
          </div>
        )}

        {/* Preview table */}
        {phase === "reviewing" && suggestions.length > 0 && (
          <div className="mt-4">
            <button
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground mb-2 transition-colors"
              onClick={() => setExpanded(v => !v)}
            >
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {expanded ? (lang === "zh" ? "收起" : "Collapse") : (lang === "zh" ? "展開" : "Expand")} {lang === "zh" ? "AI 建議" : "AI suggestions"} ({suggestions.length})
            </button>

            {expanded && (
              <div className="border border-border rounded-xl overflow-hidden">
                <div className="grid grid-cols-[1fr_auto] text-[10px] font-semibold text-muted-foreground uppercase tracking-wide bg-muted/50 px-3 py-2 gap-3">
                  <span>{lang === "zh" ? "費用名稱" : "Expense"}</span>
                  <span className="text-right">{lang === "zh" ? "AI 建議分類" : "AI Category"}</span>
                </div>
                <div className="divide-y divide-border max-h-64 overflow-y-auto">
                  {suggestions.map(s => {
                    const effective = (overrides[s.id] ?? s.suggestedCategory) as string;
                    return (
                      <div key={s.id} className="grid grid-cols-[1fr_auto] items-center px-3 py-2 gap-3 hover:bg-muted/30 transition-colors">
                        <span className="text-sm text-foreground truncate">{s.title}</span>
                        <Select
                          value={effective}
                          onValueChange={v => setOverrides(prev => ({ ...prev, [s.id]: v }))}
                        >
                          <SelectTrigger className="h-7 text-xs w-28 shrink-0">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${CATEGORY_COLORS[effective] ?? ""}`}>
                              {getCategoryLabels(lang)[effective] ?? effective}
                            </span>
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(getCategoryLabels(lang)).map(([val, label]) => (
                              <SelectItem key={val} value={val}>
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${CATEGORY_COLORS[val]}`}>{label}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 mt-3">
              <Button
                size="sm"
                className="bg-violet-600 hover:bg-violet-700 text-white"
                onClick={handleApply}
                disabled={isApplying}
              >
                {isApplying ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />}
                {lang === "zh" ? `確認套用 ${suggestions.length} 筆分類` : `Apply ${suggestions.length} classifications`}
              </Button>
              <Button size="sm" variant="ghost" onClick={handleReset} disabled={isApplying} className="text-muted-foreground">
                {lang === "zh" ? "取消" : "Cancel"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SyncPage() {
  const { t, lang } = useI18n();
  const { data: summary, refetch: refetchSummary, isLoading } = trpc.sync.getSummary.useQuery();
  const { data: tripsData } = trpc.trips.list.useQuery();

  const trips = useMemo(() =>
    (tripsData ?? []).map(t => ({ id: t.id, name: t.name })),
    [tripsData]
  );

  const [statuses, setStatuses] = useState<Record<string, SyncStatus>>({});
  const [results, setResults] = useState<Record<string, string>>({});
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncAllLog, setSyncAllLog] = useState<string[]>([]);

  const setStatus = (key: string, s: SyncStatus) => setStatuses(p => ({ ...p, [key]: s }));
  const setResult = (key: string, r: string) => setResults(p => ({ ...p, [key]: r }));

  const syncCountriesFromFlights = trpc.sync.syncCountriesFromFlights.useMutation({
    onSuccess: (data) => {
      setStatus("flights2countries", "done");
      setResult("flights2countries", lang === "zh" ? `已從 ${data.total} 個航班同步 ${data.synced} 個國家` : `Synced ${data.synced} countries from ${data.total} flights`);
      toast.success(lang === "zh" ? `飛行護照 → 旅遊足跡：同步 ${data.synced} 個國家` : `Flight Passport → Travel History: synced ${data.synced} countries`);
      refetchSummary();
    },
    onError: (e) => { setStatus("flights2countries", "error"); setResult("flights2countries", e.message); },
  });

  const syncCountriesFromTrips = trpc.sync.syncCountriesFromTrips.useMutation({
    onSuccess: (data) => {
      setStatus("trips2countries", "done");
      setResult("trips2countries", lang === "zh" ? `已從 ${data.total} 個行程同步 ${data.synced} 個國家` : `Synced ${data.synced} countries from ${data.total} trips`);
      toast.success(lang === "zh" ? `行程目的地 → 旅遊足跡：同步 ${data.synced} 個國家` : `Trip destinations → Travel History: synced ${data.synced} countries`);
      refetchSummary();
    },
    onError: (e) => { setStatus("trips2countries", "error"); setResult("trips2countries", e.message); },
  });

  const syncDataIntegrity = trpc.sync.syncDataIntegrity.useMutation({
    onSuccess: (data) => {
      setStatus("integrity", "done");
      setResult("integrity", data.message);
      toast.success(data.message);
    },
    onError: (e) => { setStatus("integrity", "error"); setResult("integrity", e.message); },
  });

  const syncAll = trpc.sync.syncAll.useMutation({
    onSuccess: (data) => {
      setIsSyncingAll(false);
      const log = data.results.map(r => `✓ ${r.label}: ${r.synced}`);
      setSyncAllLog(log);
      setStatuses({
        flights2countries: "done",
        trips2countries: "done",
        integrity: "done",
      });
      toast.success(lang === "zh" ? `全部同步完成！共 ${data.results.length} 項操作` : `All synced! ${data.results.length} operations completed`);
      refetchSummary();
    },
    onError: (e) => {
      setIsSyncingAll(false);
      toast.error(lang === "zh" ? `同步失敗：${e.message}` : `Sync failed: ${e.message}`);
    },
  });

  const handleSyncAll = () => {
    setIsSyncingAll(true);
    setSyncAllLog([]);
    setStatuses({
      flights2countries: "syncing",
      trips2countries: "syncing",
      integrity: "syncing",
    });
    syncAll.mutate();
  };

  const syncCards = [
    {
      key: "flights2countries",
      icon: <Plane className="w-5 h-5" />,
      title: lang === "zh" ? "飛行護照 → 旅遊足跡" : "Flight Passport → Travel History",
      description: lang === "zh" ? "從所有歷史航班記錄中提取到訪國家，自動更新旅遊足跡地圖" : "Extract visited countries from flight records and update travel map",
      count: summary?.pastFlights,
      countLabel: lang === "zh" ? "個航班" : "flights",
      onSync: () => {
        setStatus("flights2countries", "syncing");
        syncCountriesFromFlights.mutate();
      },
    },
    {
      key: "trips2countries",
      icon: <Globe className="w-5 h-5" />,
      title: lang === "zh" ? "行程目的地 → 旅遊足跡" : "Trip Destinations → Travel History",
      description: lang === "zh" ? "從所有旅程的目的地自動識別國家，標記為已到訪" : "Auto-detect countries from trip destinations and mark as visited",
      count: summary?.trips,
      countLabel: lang === "zh" ? "個行程" : "trips",
      onSync: () => {
        setStatus("trips2countries", "syncing");
        syncCountriesFromTrips.mutate();
      },
    },
    {
      key: "integrity",
      icon: <Database className="w-5 h-5" />,
      title: lang === "zh" ? "資料完整性檢查" : "Data Integrity Check",
      description: lang === "zh" ? "驗證所有行程、費用、航班、住宿資料的關聯完整性" : "Verify relational integrity of all trips, expenses, flights, and hotels",
      count: summary?.trips,
      countLabel: lang === "zh" ? "個行程" : "trips",
      onSync: () => {
        setStatus("integrity", "syncing");
        syncDataIntegrity.mutate();
      },
    },
  ];

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <RefreshCw className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{t("syncCenterTitle")}</h1>
              <p className="text-sm text-muted-foreground">{lang === "zh" ? "同步、驗證並智能整理所有旅行資料" : "Sync, verify, and intelligently organise all travel data"}</p>
            </div>
          </div>
        </div>

        {/* Data Summary */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              {lang === "zh" ? "資料總覽" : "Data Summary"}
            </CardTitle>
            <CardDescription className="text-xs">{lang === "zh" ? "目前資料庫中的所有記錄" : "All records in the database"}</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="grid grid-cols-4 gap-3">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="h-14 bg-muted rounded-lg animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { icon: <Plane className="w-4 h-4" />, label: lang === "zh" ? "行程" : "Trips", value: summary?.trips ?? 0 },
                  { icon: <Receipt className="w-4 h-4" />, label: lang === "zh" ? "費用" : "Expenses", value: summary?.expenses ?? 0 },
                  { icon: <Plane className="w-4 h-4 rotate-45" />, label: lang === "zh" ? "行程航班" : "Trip Flights", value: summary?.tripFlights ?? 0 },
                  { icon: <Hotel className="w-4 h-4" />, label: lang === "zh" ? "住宿" : "Hotels", value: summary?.hotels ?? 0 },
                  { icon: <Map className="w-4 h-4" />, label: lang === "zh" ? "地圖標記" : "Map Pins", value: summary?.mapPins ?? 0 },
                  { icon: <Plane className="w-4 h-4" />, label: lang === "zh" ? "歷史航班" : "Past Flights", value: summary?.pastFlights ?? 0 },
                  { icon: <Globe className="w-4 h-4" />, label: lang === "zh" ? "到訪國家" : "Countries", value: summary?.visitedCountries ?? 0 },
                  { icon: <Activity className="w-4 h-4" />, label: lang === "zh" ? "行程活動" : "Activities", value: summary?.activities ?? 0 },
                ].map((item, i) => (
                  <div key={i} className="flex flex-col items-center justify-center p-3 rounded-xl bg-muted/50 gap-1">
                    <div className="text-muted-foreground">{item.icon}</div>
                    <div className="text-xl font-bold text-foreground tabular-nums">{item.value}</div>
                    <div className="text-[10px] text-muted-foreground">{item.label}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sync All Button */}
        <div className="mb-6">
          <Button
            size="lg"
            className="w-full gap-2 h-12 text-base font-semibold"
            onClick={handleSyncAll}
            disabled={isSyncingAll}
          >
            {isSyncingAll ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Zap className="w-5 h-5" />
            )}
            {isSyncingAll ? t("syncing") : (lang === "zh" ? "一鍵全部同步" : "Sync All")}
          </Button>

          {syncAllLog.length > 0 && (
            <div className="mt-3 p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
              <p className="text-xs font-semibold text-green-700 dark:text-green-400 mb-1.5">{lang === "zh" ? "同步完成" : "Sync Complete"}</p>
              {syncAllLog.map((line, i) => (
                <p key={i} className="text-xs text-green-600 dark:text-green-500">{line}</p>
              ))}
            </div>
          )}
        </div>

        <Separator className="mb-6" />

        {/* AI Section */}
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            {lang === "zh" ? "AI 智能功能" : "AI Features"}
          </h2>
          <AiClassifyCard trips={trips} uncategorisedCount={summary?.uncategorisedExpenses} />
        </div>

        <Separator className="mb-6" />

        {/* Individual Sync Cards */}
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            {lang === "zh" ? "分項同步操作" : "Individual Sync Operations"}
          </h2>
          <div className="space-y-3">
            {syncCards.map(card => (
              <SyncCard
                key={card.key}
                icon={card.icon}
                title={card.title}
                description={card.description}
                count={card.count}
                countLabel={card.countLabel}
                status={statuses[card.key] ?? "idle"}
                onSync={card.onSync}
                result={results[card.key]}
              />
            ))}
          </div>
        </div>

        {/* Info section */}
        <Card className="mt-6 bg-muted/30 border-dashed">
          <CardContent className="p-4">
            <div className="flex gap-3">
              <AlertCircle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-foreground mb-1">{lang === "zh" ? "關於同步" : "About Sync"}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {lang === "zh" ? "同步操作會自動更新各模組之間的關聯資料。AI 自動分類功能會分析費用名稱並建議適合的分類，你可以在套用前逐一確認或修改每筆建議。所有操作均為安全的 upsert 操作，不會刪除現有資料。" : "Sync operations automatically update cross-module data. AI auto-classify analyses expense names and suggests categories — you can review and edit each suggestion before applying. All operations are safe upserts and will not delete existing data."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
