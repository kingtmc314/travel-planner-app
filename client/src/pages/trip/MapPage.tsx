import { trpc } from "@/lib/trpc";
import { useI18n } from "@/hooks/useI18n";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MapView, type LeafletMap } from "@/components/Map";
import ActivityPinImport, {
  summarizeItineraryLocations,
  mapNotesForDisplay,
  preserveMapNoteProvenance,
} from "@/components/ActivityPinImport";
import { connectedCoordinates } from "@shared/connected";
import {
  Plus,
  Trash2,
  Loader2,
  MapPin,
  Hotel,
  Utensils,
  Car,
  MoreHorizontal,
  Edit2,
  Search,
  Map as MapIcon,
  List,
  LocateFixed,
  ArrowUpRight,
  AlertCircle,
  X,
} from "lucide-react";
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import type { MapPin as SavedMapPin } from "../../../../drizzle/schema";
import { toast } from "sonner";
import L from "leaflet";

const PIN_TYPES = [
  {
    value: "attraction",
    label: "catAttraction",
    icon: MapPin,
    color: "#12796c",
  },
  { value: "hotel", label: "catHotel", icon: Hotel, color: "#7861a4" },
  {
    value: "restaurant",
    label: "catRestaurant",
    icon: Utensils,
    color: "#c4803a",
  },
  { value: "transport", label: "catTransport", icon: Car, color: "#477c9b" },
  { value: "other", label: "catOther", icon: MoreHorizontal, color: "#7b8b97" },
] as const;
type PinCategory = (typeof PIN_TYPES)[number]["value"];
const defaultForm = {
  title: "",
  notes: "",
  lat: "",
  lng: "",
  category: "attraction" as PinCategory,
  address: "",
};

function createColoredIcon(color: string) {
  return L.divIcon({
    html: `<div style="width:22px;height:22px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 3px 10px rgba(15,45,48,0.25)"></div>`,
    className: "",
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -15],
  });
}

export default function MapPage({ tripId }: { tripId: number }) {
  const { t, lang } = useI18n();
  const utils = trpc.useUtils();
  const pinsQuery = trpc.map.getPins.useQuery({ tripId });
  const daysQuery = trpc.itinerary.getDays.useQuery({ tripId });
  const { data: trip } = trpc.trips.get.useQuery({ tripId });
  const canEdit = trip?.userRole === "owner" || trip?.userRole === "editor";
  const [showAdd, setShowAdd] = useState(false);
  const [editingPin, setEditingPin] = useState<SavedMapPin | null>(null);
  const [selectedPinId, setSelectedPinId] = useState<number | null>(null);
  const [deletingPin, setDeletingPin] = useState<SavedMapPin | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [mobileView, setMobileView] = useState<"map" | "list">("map");
  const [importPending, setImportPending] = useState(false);
  const [map, setMap] = useState<LeafletMap | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Record<number, L.Marker>>({});
  const canEditRef = useRef(canEdit);
  const busyRef = useRef(false);
  canEditRef.current = canEdit;

  const addPin = trpc.map.addPin.useMutation({
    onSuccess: async () => {
      setShowAdd(false);
      setForm(defaultForm);
      toast.success(t("pinAdded"));
      await utils.invalidate();
    },
    onError: error => toast.error(error.message || t("pinAddFailed")),
  });
  const updatePin = trpc.map.updatePin.useMutation({
    onSuccess: async () => {
      setEditingPin(null);
      toast.success(t("pinUpdated"));
      await utils.invalidate();
    },
    onError: error => toast.error(error.message || t("pinUpdateFailed")),
  });
  const deletePin = trpc.map.deletePin.useMutation({
    onSuccess: async () => {
      setDeletingPin(null);
      setSelectedPinId(null);
      toast.success(t("pinDeleted"));
      await utils.invalidate();
    },
    onError: error =>
      toast.error(
        error.message ||
          (lang === "zh" ? "刪除地點失敗" : "Could not delete the place")
      ),
  });
  const geocodePlace = trpc.map.geocodePlace.useMutation({
    onSuccess: data => {
      setForm(previous => ({
        ...previous,
        lat: data.lat,
        lng: data.lng,
        address: data.address,
        title: previous.title || data.name,
      }));
      toast.success(
        lang === "zh"
          ? "已自動填入座標和地址"
          : "Coordinates and address filled in"
      );
    },
    onError: error =>
      toast.error(
        error.message || (lang === "zh" ? "找不到該地點" : "Place not found")
      ),
  });
  const busy =
    addPin.isPending ||
    updatePin.isPending ||
    deletePin.isPending ||
    geocodePlace.isPending ||
    importPending;
  busyRef.current = busy;

  const filteredPins = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return (pinsQuery.data ?? []).filter(
      pin =>
        (category === "all" || pin.category === category) &&
        (!query ||
          `${pin.title} ${pin.address ?? ""} ${mapNotesForDisplay(pin.notes)}`
            .toLocaleLowerCase()
            .includes(query))
    );
  }, [pinsQuery.data, search, category]);
  const validPins = useMemo(
    () =>
      (pinsQuery.data ?? []).filter(pin =>
        connectedCoordinates(pin.lat, pin.lng)
      ),
    [pinsQuery.data]
  );
  const validPinIds = useMemo(
    () => new Set(validPins.map(pin => pin.id)),
    [validPins]
  );
  const selectedPin = pinsQuery.data?.find(pin => pin.id === selectedPinId);
  const categoryCounts = PIN_TYPES.map(type => ({
    ...type,
    count: (pinsQuery.data ?? []).filter(pin => pin.category === type.value)
      .length,
  }));
  const itineraryCoverage = useMemo(() => {
    const activities = (daysQuery.data ?? []).flatMap(day => day.activities);
    return summarizeItineraryLocations(activities);
  }, [daysQuery.data]);
  const pinsReady = pinsQuery.data !== undefined && !pinsQuery.isError;
  const itineraryReady = daysQuery.data !== undefined && !daysQuery.isError;
  const coverage =
    itineraryCoverage.total > 0
      ? Math.round((itineraryCoverage.mapped / itineraryCoverage.total) * 100)
      : null;
  const firstPin = validPins[0];

  const handleMapReady = useCallback((readyMap: LeafletMap) => {
    setMap(readyMap);
    readyMap.on("click", (event: L.LeafletMouseEvent) => {
      if (!canEditRef.current || busyRef.current) return;
      setForm({
        ...defaultForm,
        lat: event.latlng.lat.toFixed(7),
        lng: event.latlng.lng.toFixed(7),
      });
      setShowAdd(true);
    });
  }, []);

  useEffect(() => {
    if (!map) return;
    const markers: Record<number, L.Marker> = {};
    const points: L.LatLng[] = [];
    filteredPins.forEach(pin => {
      if (!validPinIds.has(pin.id)) return;
      const type =
        PIN_TYPES.find(candidate => candidate.value === pin.category) ??
        PIN_TYPES[4];
      // DOM text nodes keep saved titles/notes out of executable popup HTML.
      const popup = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = pin.title;
      popup.appendChild(title);
      if (pin.address || pin.notes) {
        const detail = document.createElement("p");
        detail.textContent = [pin.address, mapNotesForDisplay(pin.notes)]
          .filter(Boolean)
          .join(" · ");
        detail.style.cssText =
          "font-size:12px;color:#56706c;margin-top:4px;max-width:240px";
        popup.appendChild(detail);
      }
      const position = L.latLng(Number(pin.lat), Number(pin.lng));
      const marker = L.marker(position, {
        icon: createColoredIcon(type.color),
        title: pin.title,
      })
        .addTo(map)
        .bindPopup(popup);
      marker.on("click", () => setSelectedPinId(pin.id));
      markers[pin.id] = marker;
      points.push(position);
    });
    markersRef.current = markers;
    if (points.length > 0)
      map.fitBounds(L.latLngBounds(points), { padding: [35, 35], maxZoom: 14 });
    return () => {
      Object.values(markers).forEach(marker => marker.remove());
      markersRef.current = {};
    };
  }, [map, filteredPins, validPinIds]);

  useEffect(() => {
    if (!map) return;
    const timeout = window.setTimeout(() => map.invalidateSize(), 60);
    const observer = new ResizeObserver(() => map.invalidateSize());
    if (mapContainerRef.current) observer.observe(mapContainerRef.current);
    return () => {
      window.clearTimeout(timeout);
      observer.disconnect();
    };
  }, [map, mobileView]);

  const focusPin = (pin: SavedMapPin) => {
    setSelectedPinId(pin.id);
    setMobileView("map");
    if (!filteredPins.some(candidate => candidate.id === pin.id)) {
      setSearch("");
      setCategory("all");
    }
    if (map && validPinIds.has(pin.id)) {
      window.setTimeout(() => {
        map.invalidateSize();
        map.setView(
          [Number(pin.lat), Number(pin.lng)],
          Math.max(map.getZoom(), 13)
        );
        markersRef.current[pin.id]?.openPopup();
      }, 80);
    }
  };
  const openEdit = (pin: SavedMapPin) => {
    if (!canEdit || busy) return;
    setEditingPin(pin);
    setForm({
      title: pin.title,
      notes: mapNotesForDisplay(pin.notes),
      lat: String(pin.lat),
      lng: String(pin.lng),
      category: pin.category ?? "other",
      address: pin.address ?? "",
    });
  };
  const handleSave = () => {
    if (!canEdit || busy) return;
    if (!form.title.trim()) {
      toast.error(
        lang === "zh" ? "請填寫地點名稱" : "Please enter a place name"
      );
      return;
    }
    if (editingPin) {
      updatePin.mutate({
        pinId: editingPin.id,
        tripId,
        title: form.title.trim(),
        notes: preserveMapNoteProvenance(form.notes, editingPin.notes),
        category: form.category,
        address: form.address,
      });
      return;
    }
    const lat = Number(form.lat);
    const lng = Number(form.lng);
    if (
      !form.lat.trim() ||
      !form.lng.trim() ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      toast.error(
        lang === "zh"
          ? "請提供有效座標：緯度 -90 至 90，經度 -180 至 180。可搜尋地點或點擊地圖。"
          : "Enter valid coordinates: latitude −90 to 90, longitude −180 to 180. Search a place or click the map."
      );
      return;
    }
    addPin.mutate({
      tripId,
      title: form.title.trim(),
      notes: form.notes,
      lat: String(lat),
      lng: String(lng),
      category: form.category,
      address: form.address,
    });
  };
  const handleGeocode = () => {
    if (!canEdit || busy || editingPin) return;
    if (!form.title.trim()) {
      toast.error(
        lang === "zh" ? "請先輸入地點名稱" : "Please enter a place name first"
      );
      return;
    }
    geocodePlace.mutate({ query: form.title.trim() });
  };

  const renderPinFormFields = (showCoords: boolean) => (
    <div className="mt-2 space-y-4">
      <div>
        <Label htmlFor="map-pin-name">{t("pinName")} *</Label>
        <div className="mt-1.5 flex gap-2">
          <Input
            id="map-pin-name"
            className="min-w-0 flex-1"
            placeholder={
              lang === "zh"
                ? "例如：你想去的博物館"
                : "e.g. a museum you want to visit"
            }
            value={form.title}
            disabled={busy}
            onChange={event => setForm({ ...form, title: event.target.value })}
            onKeyDown={event => {
              if (event.key === "Enter" && showCoords) {
                event.preventDefault();
                handleGeocode();
              }
            }}
          />
          {showCoords && (
            <Button
              type="button"
              variant="outline"
              onClick={handleGeocode}
              disabled={busy}
              className="shrink-0 gap-1.5 px-3"
            >
              {geocodePlace.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              {t("mapSearch")}
            </Button>
          )}
        </div>
        {showCoords && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            {lang === "zh"
              ? "Google Places 搜尋可自動填入真實座標和地址；亦可直接輸入。"
              : "Google Places search fills real coordinates and addresses. Manual entry is also available."}
          </p>
        )}
      </div>
      <div>
        <Label htmlFor="map-pin-category">{t("pinCategory")}</Label>
        <Select
          value={form.category}
          disabled={busy}
          onValueChange={value =>
            setForm({ ...form, category: value as PinCategory })
          }
        >
          <SelectTrigger id="map-pin-category" className="mt-1.5">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PIN_TYPES.map(type => (
              <SelectItem key={type.value} value={type.value}>
                {t(type.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="map-pin-notes">{t("pinNotes")}</Label>
        <Input
          id="map-pin-notes"
          className="mt-1.5"
          disabled={busy}
          placeholder={
            lang === "zh" ? "值得記下的小細節…" : "A detail worth remembering…"
          }
          value={form.notes}
          onChange={event => setForm({ ...form, notes: event.target.value })}
        />
      </div>
      <div>
        <Label htmlFor="map-pin-address">
          {lang === "zh" ? "地址" : "Address"}
        </Label>
        <Input
          id="map-pin-address"
          className="mt-1.5"
          disabled={busy}
          value={form.address}
          onChange={event => setForm({ ...form, address: event.target.value })}
        />
      </div>
      {showCoords && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="map-pin-lat">
                {lang === "zh" ? "緯度 *" : "Latitude *"}
              </Label>
              <Input
                id="map-pin-lat"
                className="mt-1.5"
                inputMode="decimal"
                disabled={busy}
                placeholder="−90 … 90"
                value={form.lat}
                onChange={event =>
                  setForm({ ...form, lat: event.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor="map-pin-lng">
                {lang === "zh" ? "經度 *" : "Longitude *"}
              </Label>
              <Input
                id="map-pin-lng"
                className="mt-1.5"
                inputMode="decimal"
                disabled={busy}
                placeholder="−180 … 180"
                value={form.lng}
                onChange={event =>
                  setForm({ ...form, lng: event.target.value })
                }
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {lang === "zh"
              ? "搜尋地點名稱或直接在地圖上點擊，即可填入座標。"
              : "Search a place or click directly on the map to fill coordinates."}
          </p>
        </>
      )}
    </div>
  );

  return (
    <div className="space-y-5 p-4 pb-24 sm:p-6 lg:p-8">
      <header className="voyage-hero">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/65">
          {lang === "zh" ? "旅程地點誌" : "YOUR PLACE JOURNAL"}
        </p>
        <div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div className="max-w-lg">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {t("mapTitle")}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-white/75">
              {lang === "zh"
                ? "把想去的地方串起來。地圖、行程與地點清單，只需輸入一次。"
                : "Connect the places you want to go. Your map, itinerary and place list—entered once."}
            </p>
          </div>
          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              <ActivityPinImport
                tripId={tripId}
                disabled={busy}
                onPendingChange={setImportPending}
              />
              <Button
                className="gap-2 bg-white text-primary hover:bg-white/90"
                disabled={busy}
                onClick={() => {
                  setForm(defaultForm);
                  setShowAdd(true);
                }}
              >
                <Plus className="h-4 w-4" />
                {t("addPin")}
              </Button>
            </div>
          ) : (
            <p className="text-xs text-white/65">
              {lang === "zh"
                ? "唯讀地圖 · 可搜尋及瀏覽地點"
                : "Read-only map · Search and explore saved places"}
            </p>
          )}
        </div>
      </header>

      <section
        aria-label={lang === "zh" ? "真實地點數據" : "Real location data"}
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        <div className="voyage-metric">
          <p className="text-xs text-muted-foreground">
            {lang === "zh" ? "已儲存地點" : "Saved places"}
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums">
            {pinsReady ? pinsQuery.data!.length : "—"}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {lang === "zh" ? "旅程地圖記錄" : "Trip map records"}
          </p>
        </div>
        <div className="voyage-metric">
          <p className="text-xs text-muted-foreground">
            {lang === "zh" ? "可顯示的標記" : "Map-ready pins"}
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-primary">
            {pinsReady ? validPins.length : "—"}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {pinsReady
              ? lang === "zh"
                ? `${pinsQuery.data!.length - validPins.length} 個座標無效`
                : `${pinsQuery.data!.length - validPins.length} invalid coordinates`
              : lang === "zh"
                ? "正在檢查座標"
                : "Checking coordinates"}
          </p>
        </div>
        <div className="voyage-metric">
          <p className="text-xs text-muted-foreground">
            {lang === "zh"
              ? "行程地點座標覆蓋"
              : "Itinerary coordinate coverage"}
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums">
            {itineraryReady && coverage !== null ? `${coverage}%` : "—"}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {itineraryReady
              ? lang === "zh"
                ? `${itineraryCoverage.mapped} / ${itineraryCoverage.total} 個活動地點有座標`
                : `${itineraryCoverage.mapped} / ${itineraryCoverage.total} activity locations have coordinates`
              : lang === "zh"
                ? "正在讀取行程"
                : "Loading itinerary"}
          </p>
        </div>
        <div className="voyage-metric">
          <p className="text-xs text-muted-foreground">
            {lang === "zh" ? "行程尚未定位" : "Unmapped itinerary locations"}
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums">
            {itineraryReady ? itineraryCoverage.unmapped : "—"}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {lang === "zh"
              ? "有地點描述，但欠有效座標"
              : "Location entered, no valid coordinates"}
          </p>
        </div>
      </section>

      {(pinsQuery.isError || daysQuery.isError) && (
        <div
          role="alert"
          className="voyage-panel flex flex-wrap items-center justify-between gap-3 border-destructive/20"
        >
          <p className="flex items-center gap-2 text-sm">
            <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
            {lang === "zh"
              ? "部分地點資料未能載入；數據暫以「—」顯示。"
              : "Some location data could not be loaded. Unavailable figures show “—”."}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void pinsQuery.refetch();
              void daysQuery.refetch();
            }}
          >
            {lang === "zh" ? "再試一次" : "Retry"}
          </Button>
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm">
        <div className="border-b border-border p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="voyage-section-title">
              {lang === "zh" ? "探索你的地點" : "Explore your places"}
            </h2>
            <span className="shrink-0 text-xs text-muted-foreground">
              {pinsReady
                ? `${filteredPins.length} / ${pinsQuery.data!.length}`
                : "—"}
            </span>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                aria-label={
                  lang === "zh" ? "搜尋已儲存地點" : "Search saved places"
                }
                className="pl-9"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder={
                  lang === "zh"
                    ? "搜尋名稱、地址或筆記…"
                    : "Search name, address or notes…"
                }
              />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger
                className="w-full sm:w-44"
                aria-label={
                  lang === "zh" ? "篩選地點分類" : "Filter place category"
                }
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {lang === "zh" ? "所有分類" : "All categories"}
                </SelectItem>
                {PIN_TYPES.map(type => (
                  <SelectItem key={type.value} value={type.value}>
                    {t(type.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-muted p-1 lg:hidden">
            <Button
              size="sm"
              variant={mobileView === "map" ? "default" : "ghost"}
              className="gap-2 rounded-lg"
              onClick={() => setMobileView("map")}
              aria-pressed={mobileView === "map"}
            >
              <MapIcon className="h-4 w-4" />
              {lang === "zh" ? "地圖" : "Map"}
            </Button>
            <Button
              size="sm"
              variant={mobileView === "list" ? "default" : "ghost"}
              className="gap-2 rounded-lg"
              onClick={() => setMobileView("list")}
              aria-pressed={mobileView === "list"}
            >
              <List className="h-4 w-4" />
              {lang === "zh" ? "地點清單" : "Places"}
            </Button>
          </div>
        </div>
        <div className="grid lg:grid-cols-[minmax(0,1fr)_330px]">
          <div
            ref={mapContainerRef}
            className={`${mobileView === "map" ? "block" : "hidden"} relative z-0 h-[420px] overflow-hidden lg:block lg:h-[570px]`}
          >
            <MapView
              onMapReady={handleMapReady}
              className="absolute inset-0 h-full w-full"
              initialCenter={
                firstPin
                  ? { lat: Number(firstPin.lat), lng: Number(firstPin.lng) }
                  : itineraryCoverage.first
                    ? {
                        lat: Number(itineraryCoverage.first.lat),
                        lng: Number(itineraryCoverage.first.lng),
                      }
                    : { lat: 20, lng: 0 }
              }
              initialZoom={firstPin || itineraryCoverage.first ? 10 : 2}
            />
            <div className="pointer-events-none absolute bottom-7 left-3 right-3 z-[450] rounded-xl bg-card/95 px-3 py-2 text-xs text-card-foreground shadow-sm sm:right-auto">
              {pinsQuery.isLoading
                ? lang === "zh"
                  ? "正在載入地點…"
                  : "Loading places…"
                : canEdit
                  ? lang === "zh"
                    ? "點擊地圖選取座標，新增你想去的地點"
                    : "Click the map to choose coordinates and add a place"
                  : lang === "zh"
                    ? "點擊標記，查看地點詳情"
                    : "Click a pin to explore place details"}
            </div>
          </div>
          <aside
            aria-label={lang === "zh" ? "已儲存地點清單" : "Saved places list"}
            className={`${mobileView === "list" ? "block" : "hidden"} min-w-0 border-border bg-card lg:block lg:max-h-[570px] lg:overflow-y-auto lg:border-l`}
          >
            {pinsQuery.isLoading ? (
              <div
                className="space-y-3 p-4"
                role="status"
                aria-label={lang === "zh" ? "正在載入地點" : "Loading places"}
              >
                {[1, 2, 3, 4].map(row => (
                  <div
                    key={row}
                    className="h-20 animate-pulse rounded-xl bg-muted"
                  />
                ))}
              </div>
            ) : pinsQuery.isError ? (
              <div className="p-6 text-sm text-muted-foreground">
                {lang === "zh"
                  ? "暫時無法顯示地點，請重新載入。"
                  : "Places are unavailable. Please retry."}
              </div>
            ) : !filteredPins.length ? (
              <div className="px-5 py-12 text-center">
                <MapPin className="mx-auto mb-3 h-8 w-8 text-primary/50" />
                <h3 className="text-sm font-semibold">
                  {lang === "zh"
                    ? search || category !== "all"
                      ? "找不到符合的地點"
                      : "地點誌，由第一個地點開始"
                    : search || category !== "all"
                      ? "No matching places"
                      : "Your journal starts with one place"}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {lang === "zh"
                    ? search || category !== "all"
                      ? "試試另一個關鍵字或清除篩選。"
                      : "在地圖上選取座標，或預覽並匯入行程地點。"
                    : search || category !== "all"
                      ? "Try another keyword or clear your filters."
                      : "Choose coordinates on the map or preview your itinerary locations."}
                </p>
                {(search || category !== "all") && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => {
                      setSearch("");
                      setCategory("all");
                    }}
                  >
                    {lang === "zh" ? "清除篩選" : "Clear filters"}
                  </Button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filteredPins.map(pin => {
                  const type =
                    PIN_TYPES.find(
                      candidate => candidate.value === pin.category
                    ) ?? PIN_TYPES[4];
                  const Icon = type.icon;
                  return (
                    <article
                      key={pin.id}
                      className={`p-4 transition-colors ${selectedPinId === pin.id ? "bg-accent/60" : "hover:bg-accent/25"}`}
                    >
                      <button
                        type="button"
                        className="flex w-full items-start gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => focusPin(pin)}
                        aria-pressed={selectedPinId === pin.id}
                      >
                        <span
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                          style={{
                            background: `${type.color}14`,
                            color: type.color,
                          }}
                        >
                          <Icon className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block break-words text-sm font-semibold">
                            {pin.title}
                          </span>
                          <span className="mt-1 block text-[11px] text-muted-foreground">
                            {t(type.label)}
                          </span>
                          {pin.address && (
                            <span className="mt-1 block break-words text-xs text-muted-foreground">
                              {pin.address}
                            </span>
                          )}
                          {!validPinIds.has(pin.id) && (
                            <span className="mt-1 block text-xs text-destructive">
                              {lang === "zh"
                                ? "座標無效，未能顯示在地圖"
                                : "Invalid coordinates; not shown on map"}
                            </span>
                          )}
                        </span>
                        <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                      {mapNotesForDisplay(pin.notes) && (
                        <p className="ml-[52px] mt-2 line-clamp-2 break-words text-xs leading-relaxed text-muted-foreground">
                          {mapNotesForDisplay(pin.notes)}
                        </p>
                      )}
                      {canEdit && (
                        <div className="ml-[52px] mt-2 flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1.5 px-2 text-xs"
                            disabled={busy}
                            onClick={() => openEdit(pin)}
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                            {t("editPin")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1.5 px-2 text-xs text-destructive hover:text-destructive"
                            disabled={busy}
                            onClick={() => setDeletingPin(pin)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {t("deletePin")}
                          </Button>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </aside>
        </div>
      </section>

      {selectedPin && (
        <section className="voyage-panel">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="voyage-eyebrow">
                {lang === "zh" ? "目前選取" : "SELECTED PLACE"}
              </p>
              <h3 className="mt-1 break-words text-lg font-bold">
                {selectedPin.title}
              </h3>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label={
                lang === "zh" ? "關閉地點詳情" : "Close place details"
              }
              onClick={() => setSelectedPinId(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          {selectedPin.address && (
            <p className="mt-2 break-words text-sm text-muted-foreground">
              {selectedPin.address}
            </p>
          )}
          {mapNotesForDisplay(selectedPin.notes) && (
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">
              {mapNotesForDisplay(selectedPin.notes)}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!validPinIds.has(selectedPin.id)}
              className="gap-2"
              onClick={() => focusPin(selectedPin)}
            >
              <LocateFixed className="h-4 w-4" />
              {lang === "zh" ? "在地圖查看" : "Show on map"}
            </Button>
            {canEdit && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => openEdit(selectedPin)}
                >
                  {t("editPin")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  disabled={busy}
                  onClick={() => setDeletingPin(selectedPin)}
                >
                  {t("deletePin")}
                </Button>
              </>
            )}
          </div>
        </section>
      )}

      <section className="voyage-panel">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="voyage-eyebrow">
              {lang === "zh" ? "真實地點概覽" : "REAL PLACE INSIGHTS"}
            </p>
            <h2 className="voyage-section-title mt-1">
              {lang === "zh" ? "這趟旅程的地點風格" : "The shape of your trip"}
            </h2>
          </div>
          <p className="text-xs text-muted-foreground">
            {lang === "zh"
              ? "所有已儲存地點，不受篩選影響"
              : "All saved places, independent of filters"}
          </p>
        </div>
        {pinsQuery.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-5">
            {[1, 2, 3, 4, 5].map(row => (
              <div
                key={row}
                className="h-20 animate-pulse rounded-xl bg-muted"
              />
            ))}
          </div>
        ) : !pinsReady ? (
          <p className="text-sm text-muted-foreground">
            {lang === "zh"
              ? "分類數據暫時未能載入。"
              : "Category data is unavailable."}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {categoryCounts.map(type => {
              const Icon = type.icon;
              const share = pinsQuery.data!.length
                ? Math.round((type.count / pinsQuery.data!.length) * 100)
                : 0;
              return (
                <div
                  key={type.value}
                  className="rounded-xl border border-border p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Icon className="h-4 w-4" style={{ color: type.color }} />
                    <span className="text-lg font-bold tabular-nums">
                      {type.count}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t(type.label)}
                  </p>
                  <div
                    className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
                    aria-hidden="true"
                  >
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${share}%`, background: type.color }}
                    />
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {pinsQuery.data!.length ? `${share}%` : "—"}
                  </p>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          {lang === "zh"
            ? "行程覆蓋以活動為單位：已有有效座標的活動視為已定位；只有地點文字的活動視為未定位。"
            : "Coverage counts activities: valid saved coordinates mean mapped; a location description without coordinates means unmapped."}
          {itineraryReady &&
            (lang === "zh"
              ? ` 另有 ${itineraryCoverage.noLocation} 個活動沒有地點或座標，不計入覆蓋率。`
              : ` ${itineraryCoverage.noLocation} activities have neither a location nor coordinates and are excluded from coverage.`)}
        </p>
      </section>

      <Dialog
        open={showAdd}
        onOpenChange={next => {
          if (!busy) setShowAdd(next);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("addPin")}</DialogTitle>
            <DialogDescription>
              {lang === "zh"
                ? "搜尋真實地點、點選地圖或直接輸入座標。"
                : "Search a real place, click the map or enter coordinates."}
            </DialogDescription>
          </DialogHeader>
          {renderPinFormFields(true)}
          <Button
            className="mt-4 w-full gap-2"
            onClick={handleSave}
            disabled={busy || !canEdit}
          >
            {addPin.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("addPin")}
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!editingPin}
        onOpenChange={next => {
          if (!next && !busy) setEditingPin(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("editPin")}</DialogTitle>
            <DialogDescription>
              {lang === "zh"
                ? "更新地點資料；原有座標保持不變。"
                : "Update place details. Existing coordinates stay unchanged."}
            </DialogDescription>
          </DialogHeader>
          {renderPinFormFields(false)}
          <Button
            className="mt-4 w-full gap-2"
            onClick={handleSave}
            disabled={busy || !canEdit}
          >
            {updatePin.isPending && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            {t("saveChanges")}
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!deletingPin}
        onOpenChange={next => {
          if (!next && !deletePin.isPending) setDeletingPin(null);
        }}
      >
        <DialogContent className="rounded-2xl sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {lang === "zh" ? "刪除此地點？" : "Delete this place?"}
            </DialogTitle>
            <DialogDescription>
              {lang === "zh"
                ? `將從地圖移除「${deletingPin?.title ?? ""}」。原有行程活動不會被刪除。`
                : `Remove “${deletingPin?.title ?? ""}” from the map. Existing itinerary activities will not be deleted.`}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-3 flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={deletePin.isPending}
              onClick={() => setDeletingPin(null)}
            >
              {lang === "zh" ? "取消" : "Cancel"}
            </Button>
            <Button
              variant="destructive"
              disabled={busy || !canEdit}
              onClick={() => {
                if (deletingPin && canEdit && !busy)
                  deletePin.mutate({ pinId: deletingPin.id, tripId });
              }}
            >
              {deletePin.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t("deletePin")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
