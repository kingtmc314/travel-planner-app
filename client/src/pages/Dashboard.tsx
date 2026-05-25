import { useAuth } from "@/_core/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import AppLogo from "@/components/AppLogo";
import GuestDashboard from "@/components/GuestDashboard";
import GuestMergeBanner from "@/components/GuestMergeBanner";
import { getGuestTrips } from "@/hooks/useGuestTrips";
import {
  Calendar,
  Globe,
  MapPin,
  Plus,
  Plane,
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
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useI18n } from "@/hooks/useI18n";

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
  const { t, lang } = useI18n();
  const coverImage = trip.coverImage || COVER_IMAGES[trip.id % COVER_IMAGES.length];
  const locale = lang === "zh" ? "zh-HK" : "en-US";
  const startDate = new Date(trip.startDate).toLocaleDateString(locale, { month: "short", day: "numeric" });
  const endDate = new Date(trip.endDate).toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });

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
            {lang === "zh" ? "示範行程" : "Demo"}
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
                {onEdit && <DropdownMenuItem onClick={onEdit}><Edit2 className="w-4 h-4 mr-2" />{t("editTrip")}</DropdownMenuItem>}
                {onDelete && <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive"><Trash2 className="w-4 h-4 mr-2" />{t("deleteTrip")}</DropdownMenuItem>}
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
  const { t, lang } = useI18n();
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [showCreate, setShowCreate] = useState(false);
  const [editingTrip, setEditingTrip] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ name: "", destination: "", startDate: "", endDate: "", baseCurrency: "HKD", coverImage: "", description: "" });
  const [mergeDismissed, setMergeDismissed] = useState(false);
  const hasGuestTrips = getGuestTrips().length > 0;
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
  const updateTrip = trpc.trips.update.useMutation({
    onSuccess: () => { toast.success(t("tripUpdated")); setEditingTrip(null); refetch(); },
    onError: () => toast.error(t("tripUpdateFailed")),
  });
  const deleteTrip = trpc.trips.delete.useMutation({
    onSuccess: () => { toast.success(t("tripDeleted")); refetch(); },
    onError: (e) => toast.error(e.message || t("tripDeleteFailed")),
  });
  const createTrip = trpc.trips.create.useMutation({
    onSuccess: (data) => {
      toast.success(t("tripCreated"));
      setShowCreate(false);
      setForm({ name: "", destination: "", startDate: "", endDate: "", baseCurrency: "HKD", coverImage: "", description: "" });
      refetch();
      setLocation(`/trips/${data.tripId}/itinerary`);
    },
    onError: () => toast.error(t("tripCreateFailed")),
  });

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-10 h-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <AppLayout>
        <GuestDashboard />
      </AppLayout>
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
    if (!editingTrip || !editForm.name || !editForm.destination) { toast.error(t("fillRequired")); return; }
    updateTrip.mutate({ tripId: editingTrip.id, ...editForm });
  };

  const handleDelete = (trip: any) => {
    if (!confirm(t("confirmDeleteTrip", trip.name))) return;
    deleteTrip.mutate({ tripId: trip.id });
  };

  const handleCreate = () => {
    if (!form.name || !form.destination || !form.startDate || !form.endDate) {
      toast.error(t("fillRequired"));
      return;
    }
    createTrip.mutate(form);
  };

  return (
    <AppLayout>
      {hasGuestTrips && !mergeDismissed && (
        <GuestMergeBanner
          onDismiss={() => setMergeDismissed(true)}
          onMerged={() => { setMergeDismissed(true); refetch(); }}
        />
      )}
      <main className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-8 pb-24 lg:pb-8">
        {/* Welcome */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-1">
            {t("dashboardGreeting", user.name?.split(" ")[0] ?? (lang === "zh" ? "旅人" : "Traveller"))}
          </h1>
          <p className="text-muted-foreground">{t("dashboardSubtitle")}</p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { icon: Globe, label: t("tripCount", trips?.length ?? 0), value: trips?.length ?? 0, color: "text-blue-500 bg-blue-50" },
            { icon: Users, label: t("tripPartners"), value: "∞", color: "text-green-500 bg-green-50" },
            { icon: Wallet, label: t("expenseTracking"), value: t("statsRealtime"), color: "text-amber-500 bg-amber-50" },
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
          <h2 className="text-xl font-semibold text-foreground">{t("myTrips")}</h2>
          <Button onClick={() => setShowCreate(true)} size="sm" className="gap-1.5">
            <Plus className="w-4 h-4" />
            {t("newTrip")}
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
                {t("newTrip")}
              </span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
              <Sparkles className="w-10 h-10 text-primary" />
            </div>
            <h3 className="text-xl font-semibold text-foreground mb-2">{t("startPlanning")}</h3>
            <p className="text-muted-foreground mb-6">{t("clickNewTrip")}</p>
            <Button onClick={() => setShowCreate(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              {t("newTrip")}
            </Button>
          </div>
        )}

        {/* Create Trip Dialog */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl">{t("createTripTitle")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <Label htmlFor="name">{t("tripNameLabel")} *</Label>
                <Input
                  id="name"
                  placeholder={t("tripNamePlaceholder")}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="destination">{t("destination")} *</Label>
                <Input
                  id="destination"
                  placeholder={t("destinationPlaceholder")}
                  value={form.destination}
                  onChange={(e) => setForm({ ...form, destination: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="startDate">{t("startDate")} *</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="endDate">{t("endDate")} *</Label>
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
                <Label htmlFor="currency">{t("baseCurrency")}</Label>
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
                <Label htmlFor="description">{t("description")}</Label>
                <Input
                  id="description"
                  placeholder={t("descriptionPlaceholder")}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>{t("coverImage")}</Label>
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
                {t("createTrip")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Trip Dialog */}
        <Dialog open={!!editingTrip} onOpenChange={(open) => !open && setEditingTrip(null)}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl">{t("editTripTitle")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <Label>{t("tripNameLabel")} *</Label>
                <Input placeholder={t("tripNamePlaceholder")} value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="mt-1.5" />
              </div>
              <div>
                <Label>{t("destination")} *</Label>
                <Input placeholder={t("destinationPlaceholder")} value={editForm.destination} onChange={(e) => setEditForm({ ...editForm, destination: e.target.value })} className="mt-1.5" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{t("startDate")} *</Label>
                  <Input type="date" value={editForm.startDate} onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })} className="mt-1.5" />
                </div>
                <div>
                  <Label>{t("endDate")} *</Label>
                  <Input type="date" value={editForm.endDate} onChange={(e) => setEditForm({ ...editForm, endDate: e.target.value })} className="mt-1.5" />
                </div>
              </div>
              <div>
                <Label>{t("baseCurrency")}</Label>
                <Select value={editForm.baseCurrency} onValueChange={(v) => setEditForm({ ...editForm, baseCurrency: v })}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("description")}</Label>
                <Input placeholder={t("descriptionPlaceholder")} value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} className="mt-1.5" />
              </div>
              <div>
                <Label>{t("coverImage")}</Label>
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
                {t("saveChanges")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </AppLayout>
  );
}
