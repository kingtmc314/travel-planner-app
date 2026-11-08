import { useAuth } from "@/_core/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import GuestDashboard from "@/components/GuestDashboard";
import GuestMergeBanner from "@/components/GuestMergeBanner";
import { getGuestTrips } from "@/hooks/useGuestTrips";
import {
  Calendar,
  MapPin,
  Plus,
  Sparkles,
  ChevronRight,
  Loader2,
  Edit2,
  Trash2,
  MoreVertical,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useI18n } from "@/hooks/useI18n";
import TripForm, {
  EMPTY_TRIP_FORM,
  TRIP_COVER_IMAGES,
} from "@/components/TripForm";
import { formatDateOnlyInHongKong, isValidDateRange, normalizeDateOnly } from "@/lib/hongKongDate";
import TravelOverview from "@/components/TravelOverview";

function TripCard({
  trip,
  onClick,
  onEdit,
  onDelete,
}: {
  trip: any;
  onClick: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const { t, lang } = useI18n();
  const coverImage =
    trip.coverImage || TRIP_COVER_IMAGES[trip.id % TRIP_COVER_IMAGES.length];
  const startDate = formatDateOnlyInHongKong(trip.startDate, lang, {
    month: "short",
    day: "numeric",
  });
  const endDate = formatDateOnlyInHongKong(trip.endDate, lang, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div
      className="trip-card group cursor-pointer rounded-2xl overflow-hidden border border-border bg-card shadow-sm"
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`${t("itinerary")}: ${trip.name}`}
      onKeyDown={event => {
        if (
          event.target === event.currentTarget &&
          (event.key === "Enter" || event.key === " ")
        ) {
          event.preventDefault();
          onClick();
        }
      }}
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
          <div
            className="absolute top-3 right-3"
            onClick={e => e.stopPropagation()}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label={t("editTrip")}
                  className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/60 transition-colors"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onEdit && (
                  <DropdownMenuItem onClick={onEdit}>
                    <Edit2 className="w-4 h-4 mr-2" />
                    {t("editTrip")}
                  </DropdownMenuItem>
                )}
                {onDelete && (
                  <DropdownMenuItem
                    onClick={onDelete}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    {t("deleteTrip")}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
        <div className="absolute bottom-3 left-3 right-3">
          <h3 className="text-white font-semibold text-lg leading-tight line-clamp-2">
            {trip.name}
          </h3>
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
            <span>
              {startDate} – {endDate}
            </span>
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

  const utils = trpc.useUtils();
  const {
    data: trips,
    isLoading: tripsLoading,
    error: tripsError,
    refetch,
  } = trpc.trips.list.useQuery(undefined, {
    enabled: !!user,
  });
  const updateTrip = trpc.trips.update.useMutation({
    onSuccess: () => {
      toast.success(t("tripUpdated"));
      setEditingTrip(null);
      void utils.invalidate();
    },
    onError: e => toast.error(e.message || t("tripUpdateFailed")),
  });
  const deleteTrip = trpc.trips.delete.useMutation({
    onSuccess: () => {
      toast.success(t("tripDeleted"));
      void utils.invalidate();
    },
    onError: e => toast.error(e.message || t("tripDeleteFailed")),
  });
  const createTrip = trpc.trips.create.useMutation({
    onSuccess: data => {
      toast.success(t("tripCreated"));
      setShowCreate(false);
      setForm({ ...EMPTY_TRIP_FORM });
      void utils.invalidate();
      setLocation(`/trips/${data.tripId}/itinerary`);
    },
    onError: e => toast.error(e.message || t("tripCreateFailed")),
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
      startDate: normalizeDateOnly(trip.startDate),
      endDate: normalizeDateOnly(trip.endDate),
      baseCurrency: trip.baseCurrency ?? "HKD",
      coverImage: trip.coverImage ?? "",
      description: trip.description ?? "",
    });
  };

  const handleUpdate = () => {
    if (updateTrip.isPending) return;
    if (!editingTrip || !editForm.name || !editForm.destination) {
      toast.error(t("fillRequired"));
      return;
    }
    if (!isValidDateRange(editForm.startDate, editForm.endDate)) {
      toast.error(t("dateRangeInvalid"));
      return;
    }
    updateTrip.mutate({ tripId: editingTrip.id, ...editForm });
  };

  const handleDelete = (trip: any) => {
    if (deleteTrip.isPending) return;
    if (!confirm(t("confirmDeleteTrip", trip.name))) return;
    deleteTrip.mutate({ tripId: trip.id });
  };

  const handleCreate = () => {
    if (createTrip.isPending) return;
    if (!form.name || !form.destination || !form.startDate || !form.endDate) {
      toast.error(t("fillRequired"));
      return;
    }
    if (!isValidDateRange(form.startDate, form.endDate)) {
      toast.error(t("dateRangeInvalid"));
      return;
    }
    createTrip.mutate(form);
  };

  return (
    <AppLayout>
      {hasGuestTrips && !mergeDismissed && (
        <GuestMergeBanner
          onDismiss={() => setMergeDismissed(true)}
          onMerged={() => {
            setMergeDismissed(true);
            void utils.invalidate();
          }}
        />
      )}
      <main className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 pb-28 lg:py-8 lg:pb-8">
        {/* Welcome */}
        <div className="mb-6">
          <p className="voyage-eyebrow mb-2">
            {lang === "zh" ? "從這裡，出發" : "THE NEXT CHAPTER STARTS HERE"}
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-1">
            {t(
              "dashboardGreeting",
              user.name?.split(" ")[0] ?? (lang === "zh" ? "旅人" : "Traveller")
            )}
          </h1>
          <p className="text-sm text-muted-foreground">
            {lang === "zh"
              ? "行程、共用帳目與旅遊足跡，在這裡連成一頁手記。"
              : "Your itineraries, shared expenses and travel memories, in one journal."}
          </p>
        </div>

        <TravelOverview />

        {/* Trips section */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="voyage-eyebrow mb-1">
              {lang === "zh" ? "你的旅程收藏" : "YOUR JOURNEY COLLECTION"}
            </p>
            <h2 className="voyage-section-title text-xl text-foreground">
              {t("myTrips")}
            </h2>
          </div>
          <Button
            onClick={() => setShowCreate(true)}
            size="sm"
            className="gap-1.5"
          >
            <Plus className="w-4 h-4" />
            {t("newTrip")}
          </Button>
        </div>

        {tripsLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3].map(i => (
              <div
                key={i}
                className="rounded-2xl overflow-hidden border border-border"
              >
                <Skeleton className="h-44 w-full" />
                <div className="p-4 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : tripsError ? (
          <div role="alert" className="voyage-panel space-y-3">
            <p className="text-sm text-destructive">
              {lang === "zh"
                ? "未能載入旅程，你的資料並未被刪除。"
                : "Trips could not load. Your records have not been deleted."}
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              {lang === "zh" ? "重試" : "Retry"}
            </Button>
          </div>
        ) : trips && trips.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {trips.map(trip => (
              <TripCard
                key={trip.id}
                trip={trip}
                onClick={() => setLocation(`/trips/${trip.id}/itinerary`)}
                onEdit={
                  trip.userRole !== "viewer" && !updateTrip.isPending
                    ? () => handleEdit(trip)
                    : undefined
                }
                onDelete={
                  trip.userRole === "owner" && !deleteTrip.isPending
                    ? () => handleDelete(trip)
                    : undefined
                }
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
            <h3 className="text-xl font-semibold text-foreground mb-2">
              {t("startPlanning")}
            </h3>
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
            <DialogHeader>
              <DialogTitle className="text-xl">
                {t("createTripTitle")}
              </DialogTitle>
            </DialogHeader>
            <TripForm
              value={form}
              onChange={setForm}
              idPrefix="create-trip"
              disabled={createTrip.isPending}
            />
            <div className="sticky bottom-0 -mx-6 px-6 pt-3 pb-2 bg-background border-t border-border">
              <Button
                onClick={handleCreate}
                className="w-full"
                disabled={createTrip.isPending}
              >
                {createTrip.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                {t("createTrip")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog
          open={!!editingTrip}
          onOpenChange={open => !open && setEditingTrip(null)}
        >
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto pb-24 sm:pb-6">
            <DialogHeader>
              <DialogTitle className="text-xl">
                {t("editTripTitle")}
              </DialogTitle>
            </DialogHeader>
            <TripForm
              value={editForm}
              onChange={setEditForm}
              idPrefix="edit-trip"
              disabled={updateTrip.isPending}
            />
            <div className="sticky bottom-0 -mx-6 px-6 pt-3 pb-2 bg-background border-t border-border">
              <Button
                onClick={handleUpdate}
                className="w-full"
                disabled={updateTrip.isPending}
              >
                {updateTrip.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                {t("saveChanges")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </AppLayout>
  );
}
