import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  RefreshCw, CheckCircle2, AlertCircle, Loader2,
  Plane, MapPin, Receipt, Hotel, Globe, Map, Activity, Database, Zap,
} from "lucide-react";

type SyncStatus = "idle" | "syncing" | "done" | "error";

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
  return (
    <Card className={`transition-all duration-300 ${status === "done" ? "border-green-300 bg-green-50/50" : status === "error" ? "border-destructive/30 bg-destructive/5" : ""}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              status === "done" ? "bg-green-100 text-green-600" :
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
                    {count} {countLabel ?? "筆"}
                  </Badge>
                )}
                {status === "done" && (
                  <Badge className="text-xs bg-green-100 text-green-700 border-green-200">已同步</Badge>
                )}
                {status === "error" && (
                  <Badge variant="destructive" className="text-xs">失敗</Badge>
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
            <span className="ml-1.5 hidden sm:inline">{status === "done" ? "重新同步" : "同步"}</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SyncPage() {
  const { data: summary, refetch: refetchSummary, isLoading } = trpc.sync.getSummary.useQuery();

  const [statuses, setStatuses] = useState<Record<string, SyncStatus>>({});
  const [results, setResults] = useState<Record<string, string>>({});
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncAllLog, setSyncAllLog] = useState<string[]>([]);

  const setStatus = (key: string, s: SyncStatus) => setStatuses(p => ({ ...p, [key]: s }));
  const setResult = (key: string, r: string) => setResults(p => ({ ...p, [key]: r }));

  const syncCountriesFromFlights = trpc.sync.syncCountriesFromFlights.useMutation({
    onSuccess: (data) => {
      setStatus("flights2countries", "done");
      setResult("flights2countries", `已從 ${data.total} 個航班同步 ${data.synced} 個國家`);
      toast.success(`飛行護照 → 旅遊足跡：同步 ${data.synced} 個國家`);
      refetchSummary();
    },
    onError: (e) => { setStatus("flights2countries", "error"); setResult("flights2countries", e.message); },
  });

  const syncCountriesFromTrips = trpc.sync.syncCountriesFromTrips.useMutation({
    onSuccess: (data) => {
      setStatus("trips2countries", "done");
      setResult("trips2countries", `已從 ${data.total} 個行程同步 ${data.synced} 個國家`);
      toast.success(`行程目的地 → 旅遊足跡：同步 ${data.synced} 個國家`);
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
      const log = data.results.map(r => `✓ ${r.label}：${r.synced} 筆`);
      setSyncAllLog(log);
      // Mark all as done
      setStatuses({
        flights2countries: "done",
        trips2countries: "done",
        integrity: "done",
      });
      toast.success(`全部同步完成！共 ${data.results.length} 項操作`);
      refetchSummary();
    },
    onError: (e) => {
      setIsSyncingAll(false);
      toast.error(`同步失敗：${e.message}`);
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
      title: "飛行護照 → 旅遊足跡",
      description: "從所有歷史航班記錄中提取到訪國家，自動更新旅遊足跡地圖",
      count: summary?.pastFlights,
      countLabel: "個航班",
      onSync: () => {
        setStatus("flights2countries", "syncing");
        syncCountriesFromFlights.mutate();
      },
    },
    {
      key: "trips2countries",
      icon: <Globe className="w-5 h-5" />,
      title: "行程目的地 → 旅遊足跡",
      description: "從所有旅程的目的地自動識別國家，標記為已到訪",
      count: summary?.trips,
      countLabel: "個行程",
      onSync: () => {
        setStatus("trips2countries", "syncing");
        syncCountriesFromTrips.mutate();
      },
    },
    {
      key: "integrity",
      icon: <Database className="w-5 h-5" />,
      title: "資料完整性檢查",
      description: "驗證所有行程、費用、航班、住宿資料的關聯完整性",
      count: summary?.trips,
      countLabel: "個行程",
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
              <h1 className="text-2xl font-bold text-foreground">同步中心</h1>
              <p className="text-sm text-muted-foreground">同步並驗證所有旅行資料</p>
            </div>
          </div>
        </div>

        {/* Data Summary */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              資料總覽
            </CardTitle>
            <CardDescription className="text-xs">目前資料庫中的所有記錄</CardDescription>
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
                  { icon: <Plane className="w-4 h-4" />, label: "行程", value: summary?.trips ?? 0 },
                  { icon: <Receipt className="w-4 h-4" />, label: "費用", value: summary?.expenses ?? 0 },
                  { icon: <Plane className="w-4 h-4 rotate-45" />, label: "行程航班", value: summary?.tripFlights ?? 0 },
                  { icon: <Hotel className="w-4 h-4" />, label: "住宿", value: summary?.hotels ?? 0 },
                  { icon: <Map className="w-4 h-4" />, label: "地圖標記", value: summary?.mapPins ?? 0 },
                  { icon: <Plane className="w-4 h-4" />, label: "歷史航班", value: summary?.pastFlights ?? 0 },
                  { icon: <Globe className="w-4 h-4" />, label: "到訪國家", value: summary?.visitedCountries ?? 0 },
                  { icon: <Activity className="w-4 h-4" />, label: "行程活動", value: summary?.activities ?? 0 },
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
            {isSyncingAll ? "同步中..." : "一鍵全部同步"}
          </Button>

          {/* Sync log */}
          {syncAllLog.length > 0 && (
            <div className="mt-3 p-3 rounded-lg bg-green-50 border border-green-200">
              <p className="text-xs font-semibold text-green-700 mb-1.5">同步完成</p>
              {syncAllLog.map((line, i) => (
                <p key={i} className="text-xs text-green-600">{line}</p>
              ))}
            </div>
          )}
        </div>

        <Separator className="mb-6" />

        {/* Individual Sync Cards */}
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            分項同步操作
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
                <p className="text-xs font-medium text-foreground mb-1">關於同步</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  同步操作會自動更新各模組之間的關聯資料。例如，當你新增歷史航班後，
                  可以執行「飛行護照 → 旅遊足跡」同步，讓地圖自動標記到訪國家。
                  所有同步操作均為安全的 upsert 操作，不會刪除現有資料。
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
