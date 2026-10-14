import { useAuth } from "@/_core/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
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
import TripForm, { EMPTY_TRIP_FORM, TRIP_COVER_IMAGES } from "@/components/TripForm";
import { formatDateOnlyInHongKong, isValidDateRange } from "@/lib/hongKongDate";

function TripCard({ trip, onClick, onEdit, onDelete }: { trip: any; onClick: () => void; onEdit?: () => void; onDelete?: () => void }) {
  const { t, lang } = useI18n();
  const coverImage = trip.coverImage || TRIP_COVER_IMAGES[trip.id % TRIP_COVER_IMAGES.length];
  const startDate = formatDateOnlyInHongKong(trip.startDate, lang, { month: "short", day: "numeric" });
  const endDate = formatDateOnlyInHongKong(trip.endDate, lang, { month: "short", day: "numeric", year: "numeric" });

  return (
    <div
      className="trip-card group cursor-pointer rounded-2xl overflow-hidden border border-border bg-card shadow-sm"
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`${t("itinerary")}: ${trip.name}`}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onClick(); } }}
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
                <button aria-label={t("editTrip")} className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/60 transition-colors">
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
  const [editForm, setEditForm] = useState({ ...EMPTY_TRIP_FORM });
  const [mergeDismissed, setMergeDismissed] = useState(false);
  const hasGuestTrips = getGuestTrips().length > 0;
  const [form, setForm] = useState({ ...EMPTY_TRIP_FORM });

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
      setForm({ ...EMPTY_TRIP_FORM });
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
      startDate: trip.startDate ?? "",
      endDate: trip.endDate ?? "",
      baseCurrency: trip.baseCurrency ?? "HKD",
      coverImage: trip.coverImage ?? "",
      description: trip.description ?? "",
    });
  };

  const handleUpdate = () => {
    if (!editingTrip || !editForm.name || !editForm.destination) { toast.error(t("fillRequired")); return; }
    if (!isValidDateRange(editForm.startDate, editForm.endDate)) { toast.error(t("dateRangeInvalid")); return; }
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
    if (!isValidDateRange(form.startDate, form.endDate)) { toast.error(t("dateRangeInvalid")); return; }
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
        <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-8">
          {[
            { icon: Globe, label: t("tripCount", trips?.length ?? 0), value: trips?.length ?? 0, color: "text-blue-500 bg-blue-50" },
            { icon: Users, label: t("tripPartners"), value: "∞", color: "text-green-500 bg-green-50" },
            { icon: Wallet, label: t("expenseTracking"), value: t("statsRealtime"), color: "text-amber-500 bg-amber-50" },
          ].map((stat) => (
            <div key={stat.label} className="bg-card rounded-2xl border border-border p-2.5 sm:p-4 text-center min-w-0">
              <div className={`w-10 h-10 rounded-xl ${stat.color} flex items-center justify-center mx-auto mb-2`}>
                <stat.icon className="w-5 h-5" />
              </div>
              <div className="text-2xl font-bold text-foreground">{stat.value}</div>
              <div className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 break-words">{stat.label}</div>
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
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto pb-24 sm:pb-6">
            <DialogHeader><DialogTitle className="text-xl">{t("createTripTitle")}</DialogTitle></DialogHeader>
            <TripForm value={form} onChange={setForm} idPrefix="create-trip" disabled={createTrip.isPending} />
            <div className="sticky bottom-0 -mx-6 px-6 pt-3 pb-2 bg-background border-t border-border">
              <Button onClick={handleCreate} className="w-full" disabled={createTrip.isPending}>{createTrip.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}{t("createTrip")}</Button>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog open={!!editingTrip} onOpenChange={(open) => !open && setEditingTrip(null)}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto pb-24 sm:pb-6">
            <DialogHeader><DialogTitle className="text-xl">{t("editTripTitle")}</DialogTitle></DialogHeader>
            <TripForm value={editForm} onChange={setEditForm} idPrefix="edit-trip" disabled={updateTrip.isPending} />
            <div className="sticky bottom-0 -mx-6 px-6 pt-3 pb-2 bg-background border-t border-border">
              <Button onClick={handleUpdate} className="w-full" disabled={updateTrip.isPending}>{updateTrip.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}{t("saveChanges")}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </AppLayout>
  );
}
