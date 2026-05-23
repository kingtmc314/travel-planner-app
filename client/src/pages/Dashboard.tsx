import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import {
  Calendar,
  Globe,
  MapPin,
  Plus,
  Plane,
  LogOut,
  Bell,
  Sparkles,
  Users,
  Wallet,
  ChevronRight,
  Loader2,
  Edit2,
  Trash2,
  MoreVertical,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import NotificationsPanel from "@/components/NotificationsPanel";

const CURRENCIES = ["HKD", "USD", "EUR", "GBP", "JPY", "CNY", "AUD", "CAD", "SGD", "TWD", "KRW", "THB", "EGP"];

const COVER_IMAGES = [
  "https://images.unsplash.com/photo-1568322445389-f64ac2515020?w=800&q=70",
  "https://images.unsplash.com/photo-1488085061387-422e29b40080?w=800&q=70",
  "https://images.unsplash.com/photo-1530521954074-e64f6810b32d?w=800&q=70",
  "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=800&q=70",
  "https://images.unsplash.com/photo-1500835556837-99ac94a94552?w=800&q=70",
  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=70",
];

function TripCard({ trip, onClick, onEdit, onDelete }: { trip: any; onClick: () => void; onEdit?: () => void; onDelete?: () => void }) {
  const coverImage = trip.coverImage || COVER_IMAGES[trip.id % COVER_IMAGES.length];
  const startDate = new Date(trip.startDate).toLocaleDateString("zh-HK", { month: "short", day: "numeric" });
  const endDate = new Date(trip.endDate).toLocaleDateString("zh-HK", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div
      className="trip-card group cursor-pointer rounded-2xl overflow-hidden border border-border bg-card shadow-sm"
      onClick={onClick}
    >
      <div className="relative h-44 overflow-hidden">
        <img
          src={coverImage}
          alt={trip.name}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
        {trip.isDemoTrip && (
          <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-amber-500/90 text-white text-xs font-medium backdrop-blur-sm">
            示範行程
          </div>
        )}
        {(onEdit || onDelete) && (
          <div className="absolute top-3 right-3" onClick={e => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/60 transition-colors">
                  <MoreVertical className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onEdit && <DropdownMenuItem onClick={onEdit}><Edit2 className="w-4 h-4 mr-2" />編輯行程</DropdownMenuItem>}
                {onDelete && <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive"><Trash2 className="w-4 h-4 mr-2" />刪除行程</DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
        <div className="absolute bottom-3 left-3 right-3">
          <h3 className="text-white font-semibold text-lg leading-tight line-clamp-2">{trip.name}</h3>
        </div>
      </div>
      <div className="p-4">
        <div className="flex items-center gap-1.5 text-muted-foreground text-sm mb-3">
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{trip.destination}</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
            <Calendar className="w-3.5 h-3.5 shrink-0" />
            <span>{startDate} – {endDate}</span>
          </div>
          <div className="flex items-center gap-1 text-primary text-sm font-medium">
            <span>{trip.baseCurrency}</span>
            <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user, loading: authLoading, logout } = useAuth();
  const [currentPath, setLocation] = useLocation();
  const [showCreate, setShowCreate] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [editingTrip, setEditingTrip] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ name: "", destination: "", startDate: "", endDate: "", baseCurrency: "HKD", coverImage: "", description: "" });
  const [form, setForm] = useState({
    name: "",
    destination: "",
    startDate: "",
    endDate: "",
    baseCurrency: "HKD",
    coverImage: "",
    description: "",
  });

  const { data: trips, isLoading: tripsLoading, refetch } = trpc.trips.list.useQuery(undefined, {
    enabled: !!user,
  });
  const { data: unreadCount } = trpc.notifications.unreadCount.useQuery(undefined, {
    enabled: !!user,
    refetchInterval: 30000,
  });
  const importDemo = trpc.trips.importDemo.useMutation({
    onSuccess: (data) => {
      if (!data.alreadyExists) {
        toast.success("已匯入埃及示範行程！");
        refetch();
      }
    },
  });
  const updateTrip = trpc.trips.update.useMutation({
    onSuccess: () => { toast.success("行程已更新"); setEditingTrip(null); refetch(); },
    onError: () => toast.error("更新失敗"),
  });
  const deleteTrip = trpc.trips.delete.useMutation({
    onSuccess: () => { toast.success("行程已刪除"); refetch(); },
    onError: (e) => toast.error(e.message || "刪除失敗"),
  });
  const createTrip = trpc.trips.create.useMutation({
    onSuccess: (data) => {
      toast.success("行程已建立！");
      setShowCreate(false);
      setForm({ name: "", destination: "", startDate: "", endDate: "", baseCurrency: "HKD", coverImage: "", description: "" });
      refetch();
      setLocation(`/trips/${data.tripId}/itinerary`);
    },
    onError: () => toast.error("建立失敗，請重試"),
  });

  // Auto-import demo on first load
  useEffect(() => {
    if (user && trips && trips.length === 0) {
      importDemo.mutate();
    }
  }, [user, trips]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-10 h-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-6 p-8 max-w-sm w-full text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Plane className="w-8 h-8 text-primary rotate-45" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-2">WanderPlan</h1>
            <p className="text-muted-foreground">登入以開始規劃你的旅程</p>
          </div>
          <Button
            size="lg"
            className="w-full"
            onClick={() => window.location.href = getLoginUrl()}
          >
            登入 / 註冊
          </Button>
        </div>
      </div>
    );
  }

  const handleEdit = (trip: any) => {
    setEditingTrip(trip);
    setEditForm({
      name: trip.name,
      destination: trip.destination,
      startDate: trip.startDate ? new Date(trip.startDate).toISOString().split("T")[0] : "",
      endDate: trip.endDate ? new Date(trip.endDate).toISOString().split("T")[0] : "",
      baseCurrency: trip.baseCurrency ?? "HKD",
      coverImage: trip.coverImage ?? "",
      description: trip.description ?? "",
    });
  };

  const handleUpdate = () => {
    if (!editingTrip || !editForm.name || !editForm.destination) { toast.error("請填寫必填欄位"); return; }
    updateTrip.mutate({ tripId: editingTrip.id, ...editForm });
  };

  const handleDelete = (trip: any) => {
    if (!confirm(`確定要刪除「${trip.name}」？此操作不可復原。`)) return;
    deleteTrip.mutate({ tripId: trip.id });
  };

  const handleCreate = () => {
    if (!form.name || !form.destination || !form.startDate || !form.endDate) {
      toast.error("請填寫所有必填欄位");
      return;
    }
    createTrip.mutate(form);
  };

    const navItems = [
    { path: "/dashboard", label: "我的行程", icon: Plane },
    { path: "/travel-history", label: "旅遊足跡", icon: Globe },
    { path: "/flight-passport", label: "飛行護照", icon: Plane },
  ];
  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-56 shrink-0 border-r border-border bg-card/50 sticky top-0 h-screen">
        <div className="flex items-center gap-3 px-5 h-16 border-b border-border">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Plane className="w-4 h-4 text-primary-foreground rotate-45" />
          </div>
          <span className="font-bold text-foreground text-base">WanderPlan</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(item => {
            const Icon = item.icon;
            const active = currentPath === item.path;
            return (
              <button
                key={item.path}
                onClick={() => setLocation(item.path)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                <Icon className={`w-4 h-4 ${item.path === "/dashboard" ? "rotate-45" : ""}`} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="px-3 py-4 border-t border-border space-y-1">
          <button
            onClick={() => setShowNotifications(true)}
            className="relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <Bell className="w-4 h-4" />
            通知
            {unreadCount && unreadCount.count > 0 ? (
              <span className="ml-auto w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center font-bold">
                {unreadCount.count > 9 ? "9+" : unreadCount.count}
              </span>
            ) : null}
          </button>
          <div className="flex items-center gap-3 px-3 py-2.5">
            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs">
              {user.name?.charAt(0).toUpperCase() ?? "U"}
            </div>
            <span className="text-sm text-foreground flex-1 truncate">{user.name ?? "旅人"}</span>
            <button onClick={logout} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-accent transition-colors">
              <LogOut className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
      {/* Mobile Header */}
      <header className="lg:hidden sticky top-0 z-40 glass border-b border-border">
        <div className="px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Plane className="w-4 h-4 text-primary-foreground rotate-45" />
            </div>
            <span className="font-bold text-foreground text-lg">WanderPlan</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowNotifications(true)}
              className="relative w-9 h-9 rounded-lg flex items-center justify-center hover:bg-accent transition-colors"
            >
              <Bell className="w-5 h-5 text-muted-foreground" />
              {unreadCount && unreadCount.count > 0 ? (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-destructive" />
              ) : null}
            </button>
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
              {user.name?.charAt(0).toUpperCase() ?? "U"}
            </div>
            <button
              onClick={logout}
              className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-accent transition-colors"
            >
              <LogOut className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-8">
        {/* Welcome */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-1">
            你好，{user.name?.split(" ")[0] ?? "旅人"} 👋
          </h1>
          <p className="text-muted-foreground">準備好開始你的下一段旅程了嗎？</p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { icon: Globe, label: "行程數量", value: trips?.length ?? 0, color: "text-blue-500 bg-blue-50" },
            { icon: Users, label: "旅行夥伴", value: "∞", color: "text-green-500 bg-green-50" },
            { icon: Wallet, label: "費用追蹤", value: "即時", color: "text-amber-500 bg-amber-50" },
          ].map((stat) => (
            <div key={stat.label} className="bg-card rounded-2xl border border-border p-4 text-center">
              <div className={`w-10 h-10 rounded-xl ${stat.color} flex items-center justify-center mx-auto mb-2`}>
                <stat.icon className="w-5 h-5" />
              </div>
              <div className="text-2xl font-bold text-foreground">{stat.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Trips section */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-semibold text-foreground">我的行程</h2>
          <Button onClick={() => setShowCreate(true)} size="sm" className="gap-1.5">
            <Plus className="w-4 h-4" />
            新增行程
          </Button>
        </div>

        {tripsLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl overflow-hidden border border-border">
                <Skeleton className="h-44 w-full" />
                <div className="p-4 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : trips && trips.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {trips.map((trip) => (
              <TripCard
                key={trip.id}
                trip={trip}
                onClick={() => setLocation(`/trips/${trip.id}/itinerary`)}
                onEdit={() => handleEdit(trip)}
                onDelete={() => handleDelete(trip)}
              />
            ))}
            {/* Add new trip card */}
            <button
              onClick={() => setShowCreate(true)}
              className="rounded-2xl border-2 border-dashed border-border hover:border-primary/50 bg-card hover:bg-accent/30 transition-all duration-200 flex flex-col items-center justify-center gap-3 p-8 min-h-[240px] group"
            >
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <Plus className="w-6 h-6 text-primary" />
              </div>
              <span className="text-muted-foreground group-hover:text-foreground transition-colors font-medium">
                新增行程
              </span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
              <Sparkles className="w-10 h-10 text-primary" />
            </div>
            <h3 className="text-xl font-semibold text-foreground mb-2">正在準備示範行程...</h3>
            <p className="text-muted-foreground mb-6">我們正在為你匯入埃及示範行程</p>
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
        )}
      </main>

      {/* Create Trip Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">建立新行程</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label htmlFor="name">行程名稱 *</Label>
              <Input
                id="name"
                placeholder="例：2026年日本春遊"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="destination">目的地 *</Label>
              <Input
                id="destination"
                placeholder="例：東京 • 京都 • 大阪"
                value={form.destination}
                onChange={(e) => setForm({ ...form, destination: e.target.value })}
                className="mt-1.5"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="startDate">出發日期 *</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="endDate">回程日期 *</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  className="mt-1.5"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="currency">基本貨幣</Label>
              <Select value={form.baseCurrency} onValueChange={(v) => setForm({ ...form, baseCurrency: v })}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="description">行程描述</Label>
              <Input
                id="description"
                placeholder="簡短描述這次旅行..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>封面圖片</Label>
              <div className="grid grid-cols-3 gap-2 mt-1.5">
                {COVER_IMAGES.map((img) => (
                  <button
                    key={img}
                    onClick={() => setForm({ ...form, coverImage: img })}
                    className={`relative h-20 rounded-lg overflow-hidden border-2 transition-all ${
                      form.coverImage === img ? "border-primary" : "border-transparent"
                    }`}
                  >
                    <img src={img} alt="" className="w-full h-full object-cover" />
                    {form.coverImage === img && (
                      <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                        <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                          <span className="text-white text-xs">✓</span>
                        </div>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
            <Button
              onClick={handleCreate}
              className="w-full"
              disabled={createTrip.isPending}
            >
              {createTrip.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              建立行程
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Trip Dialog */}
      <Dialog open={!!editingTrip} onOpenChange={(open) => !open && setEditingTrip(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">編輯行程</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>行程名稱 *</Label>
              <Input placeholder="例：2026年日本春遊" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="mt-1.5" />
            </div>
            <div>
              <Label>目的地 *</Label>
              <Input placeholder="例：東京 • 京都 • 大阪" value={editForm.destination} onChange={(e) => setEditForm({ ...editForm, destination: e.target.value })} className="mt-1.5" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>出發日期 *</Label>
                <Input type="date" value={editForm.startDate} onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })} className="mt-1.5" />
              </div>
              <div>
                <Label>回程日期 *</Label>
                <Input type="date" value={editForm.endDate} onChange={(e) => setEditForm({ ...editForm, endDate: e.target.value })} className="mt-1.5" />
              </div>
            </div>
            <div>
              <Label>基本貨幣</Label>
              <Select value={editForm.baseCurrency} onValueChange={(v) => setEditForm({ ...editForm, baseCurrency: v })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>行程描述</Label>
              <Input placeholder="簡短描述這次旅行..." value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} className="mt-1.5" />
            </div>
            <div>
              <Label>封面圖片</Label>
              <div className="grid grid-cols-3 gap-2 mt-1.5">
                {COVER_IMAGES.map((img) => (
                  <button key={img} onClick={() => setEditForm({ ...editForm, coverImage: img })} className={`relative h-20 rounded-lg overflow-hidden border-2 transition-all ${editForm.coverImage === img ? "border-primary" : "border-transparent"}`}>
                    <img src={img} alt="" className="w-full h-full object-cover" />
                    {editForm.coverImage === img && <div className="absolute inset-0 bg-primary/20 flex items-center justify-center"><div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center"><span className="text-white text-xs">✓</span></div></div>}
                  </button>
                ))}
              </div>
            </div>
            <Button onClick={handleUpdate} className="w-full" disabled={updateTrip.isPending}>
              {updateTrip.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              儲存變更
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Notifications Panel */}
      <NotificationsPanel open={showNotifications} onClose={() => setShowNotifications(false)} />

      {/* Bottom Navigation (mobile) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 glass border-t border-border">
        <div className="flex items-center justify-around h-16">
          <button onClick={() => setLocation("/dashboard")} className="flex flex-col items-center gap-1 px-4 py-2 text-primary">
            <Plane className="w-5 h-5 rotate-45" />
            <span className="text-[10px] font-medium">行程</span>
          </button>
          <button onClick={() => setLocation("/travel-history")} className="flex flex-col items-center gap-1 px-4 py-2 text-muted-foreground hover:text-foreground transition-colors">
            <Globe className="w-5 h-5" />
            <span className="text-[10px] font-medium">旅遊足跡</span>
          </button>
          <button onClick={() => setLocation("/flight-passport")} className="flex flex-col items-center gap-1 px-4 py-2 text-muted-foreground hover:text-foreground transition-colors">
            <Plane className="w-5 h-5" />
            <span className="text-[10px] font-medium">飛行護照</span>
          </button>
          <button onClick={() => setShowNotifications(true)} className="relative flex flex-col items-center gap-1 px-4 py-2 text-muted-foreground hover:text-foreground transition-colors">
            <Bell className="w-5 h-5" />
            {unreadCount && unreadCount.count > 0 ? <span className="absolute top-1 right-3 w-2 h-2 rounded-full bg-destructive" /> : null}
            <span className="text-[10px] font-medium">通知</span>
          </button>
        </div>
      </nav>
      </div>
    </div>
  );
}
