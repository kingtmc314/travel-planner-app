// Guest mode dashboard — shows localStorage trips and prompts login to sync
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, LogIn, MapPin, Calendar, Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { getLoginUrl } from "@/const";
import { useGuestTrips, type GuestTrip } from "@/hooks/useGuestTrips";
import { useI18n } from "@/hooks/useI18n";

const COVER_COLORS = [
  "from-violet-500 to-purple-700",
  "from-blue-500 to-cyan-600",
  "from-emerald-500 to-teal-600",
  "from-amber-500 to-orange-600",
  "from-rose-500 to-pink-600",
];

function GuestTripCard({ trip, onDelete }: { trip: GuestTrip; onDelete: () => void }) {
  const nights = Math.max(
    0,
    Math.round((new Date(trip.endDate).getTime() - new Date(trip.startDate).getTime()) / 86400000)
  );
  return (
    <div className="rounded-2xl overflow-hidden border border-border bg-card shadow-sm hover:shadow-md transition-shadow">
      <div className={`h-32 bg-gradient-to-br ${trip.coverColor} flex items-end p-4`}>
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-white/80" />
          <span className="text-white/90 text-sm font-medium truncate">{trip.destination}</span>
        </div>
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-foreground mb-1 truncate">{trip.name}</h3>
        <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-3">
          <Calendar className="w-3.5 h-3.5" />
          <span>{trip.startDate} — {trip.endDate}</span>
          <span className="ml-1">({nights} 晚)</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-3 py-2 mb-3">
          <Sparkles className="w-3.5 h-3.5 shrink-0" />
          <span>訪客模式 — 登入後可同步至雲端</span>
        </div>
        <button
          onClick={onDelete}
          className="flex items-center gap-1.5 text-xs text-destructive hover:text-destructive/80 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          刪除
        </button>
      </div>
    </div>
  );
}

export default function GuestDashboard() {
  const { trips, addTrip, deleteTrip } = useGuestTrips();
  const { t } = useI18n();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: "",
    destination: "",
    startDate: "",
    endDate: "",
    baseCurrency: "HKD",
  });

  const handleCreate = () => {
    if (!form.name.trim() || !form.destination.trim()) {
      toast.error("請填寫行程名稱和目的地");
      return;
    }
    if (!form.startDate || !form.endDate) {
      toast.error("請選擇出發和回程日期");
      return;
    }
    if (new Date(form.startDate) > new Date(form.endDate)) {
      toast.error("出發日期不能晚於回程日期");
      return;
    }
    const colorIndex = trips.length % COVER_COLORS.length;
    addTrip({ ...form, coverColor: COVER_COLORS[colorIndex] });
    toast.success("行程已建立（訪客模式）");
    setShowCreate(false);
    setForm({ name: "", destination: "", startDate: "", endDate: "", baseCurrency: "HKD" });
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* Guest banner */}
      <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex-1">
          <p className="font-semibold text-amber-800 dark:text-amber-300 text-sm">你正在使用訪客模式</p>
          <p className="text-amber-700/70 dark:text-amber-400/70 text-xs mt-0.5">
            行程資料暫存於本機。登入後可將本機行程同步至雲端，並解鎖多人協作、費用分帳等功能。
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => window.location.href = getLoginUrl()}
          className="shrink-0 gap-2"
          style={{ background: "linear-gradient(135deg, #7c3aed, #2563eb)", color: "white" }}
        >
          <LogIn className="w-4 h-4" />
          {t("loginRegister")}
        </Button>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("myTrips")}</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{t("guestModeDesc")}</p>
        </div>
        <Button onClick={() => setShowCreate(true)} size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" />
          {t("newTrip")}
        </Button>
      </div>

      {/* Trip grid */}
      {trips.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
            <Sparkles className="w-10 h-10 text-primary" />
          </div>
          <h3 className="text-xl font-semibold text-foreground mb-2">{t("noTrips")}</h3>
          <p className="text-muted-foreground mb-6">{t("noTripsDesc")}</p>
          <Button onClick={() => setShowCreate(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            {t("newTrip")}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {trips.map(trip => (
            <GuestTripCard
              key={trip.id}
              trip={trip}
              onDelete={() => {
                if (confirm(`確定要刪除「${trip.name}」？`)) deleteTrip(trip.id);
              }}
            />
          ))}
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-2xl border-2 border-dashed border-border hover:border-primary/50 bg-card hover:bg-accent/30 transition-all duration-200 flex flex-col items-center justify-center gap-3 p-8 min-h-[240px] group"
          >
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
              <Plus className="w-6 h-6 text-primary" />
            </div>
            <span className="text-muted-foreground group-hover:text-foreground transition-colors font-medium">
              {t("newTrip")}
            </span>
          </button>
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>建立新行程（訪客模式）</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>行程名稱 *</Label>
              <Input
                placeholder="例：2026年日本春遊"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>目的地 *</Label>
              <Input
                placeholder="例：東京 • 京都 • 大阪"
                value={form.destination}
                onChange={e => setForm({ ...form, destination: e.target.value })}
                className="mt-1.5"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>出發日期 *</Label>
                <Input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} className="mt-1.5" />
              </div>
              <div>
                <Label>回程日期 *</Label>
                <Input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} className="mt-1.5" />
              </div>
            </div>
            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-700 dark:text-amber-400">
              訪客模式下行程只儲存在本機。登入後可一鍵同步至雲端。
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowCreate(false)}>取消</Button>
              <Button className="flex-1" onClick={handleCreate}>建立行程</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
