import { trpc } from "@/lib/trpc";
import { useI18n } from "@/hooks/useI18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapView, type LeafletMap } from "@/components/Map";
import { Plus, Trash2, Loader2, MapPin, Hotel, Utensils, Car, MoreHorizontal, Edit2, Search } from "lucide-react";
import { useState, useRef, useCallback, useEffect } from "react";
import { toast } from "sonner";
import L from "leaflet";

const defaultForm = { title: "", notes: "", lat: "", lng: "", category: "attraction", address: "" };

function createColoredIcon(color: string) {
  return L.divIcon({
    html: `<div style="width:20px;height:20px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>`,
    className: "",
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -14],
  });
}

export default function MapPage({ tripId }: { tripId: number }) {
  const { t, lang } = useI18n();
  const { data: pins, refetch, isLoading } = trpc.map.getPins.useQuery({ tripId });
  const [showAdd, setShowAdd] = useState(false);
  const [editingPin, setEditingPin] = useState<any | null>(null);
  const [selectedPin, setSelectedPin] = useState<any>(null);
  const [form, setForm] = useState(defaultForm);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<L.Marker[]>([]);

  const PIN_TYPES = [
    { value: "attraction", label: t("catAttraction"), icon: MapPin, color: "#22c55e" },
    { value: "hotel", label: t("catHotel"), icon: Hotel, color: "#8b5cf6" },
    { value: "restaurant", label: t("catRestaurant"), icon: Utensils, color: "#f97316" },
    { value: "transport", label: t("catTransport"), icon: Car, color: "#3b82f6" },
    { value: "other", label: t("catOther"), icon: MoreHorizontal, color: "#94a3b8" },
  ];

  const addPin = trpc.map.addPin.useMutation({
    onSuccess: () => { refetch(); setShowAdd(false); setForm(defaultForm); toast.success(t("pinAdded")); },
    onError: () => toast.error(t("pinAddFailed")),
  });
  const updatePin = trpc.map.updatePin.useMutation({
    onSuccess: () => { refetch(); setEditingPin(null); toast.success(t("pinUpdated")); },
    onError: () => toast.error(t("pinUpdateFailed")),
  });
  const deletePin = trpc.map.deletePin.useMutation({
    onSuccess: () => { refetch(); setSelectedPin(null); toast.success(t("pinDeleted")); },
  });
  const geocodePlace = trpc.map.geocodePlace.useMutation({
    onSuccess: (data) => {
      setForm(prev => ({
        ...prev,
        lat: data.lat,
        lng: data.lng,
        address: data.address,
        title: prev.title || data.name,
      }));
      toast.success(lang === "zh" ? "已自動填入座標和地址" : "Coordinates and address filled in");
    },
    onError: (err) => toast.error(err.message || (lang === "zh" ? "找不到該地點" : "Place not found")),
  });

  const handleMapReady = useCallback((map: LeafletMap) => {
    mapRef.current = map;
    map.on("click", (e: L.LeafletMouseEvent) => {
      setForm(prev => ({ ...prev, lat: e.latlng.lat.toFixed(7), lng: e.latlng.lng.toFixed(7) }));
      setShowAdd(true);
    });
  }, []);

  const renderMarkers = useCallback(() => {
    if (!mapRef.current || !pins) return;
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    const latLngs: L.LatLng[] = [];
    pins.forEach(pin => {
      const pinType = PIN_TYPES.find(t => t.value === pin.category) ?? PIN_TYPES[0];
      const lat = parseFloat(pin.lat as string);
      const lng = parseFloat(pin.lng as string);
      if (isNaN(lat) || isNaN(lng)) return;

      const marker = L.marker([lat, lng], { icon: createColoredIcon(pinType.color) })
        .addTo(mapRef.current!)
        .bindPopup(`<div style="font-weight:600;padding:2px 0">${pin.title}</div>${pin.notes ? `<div style="color:#666;font-size:12px;margin-top:2px">${pin.notes}</div>` : ""}`);

      marker.on("click", () => {
        setSelectedPin(pin);
        marker.openPopup();
      });

      latLngs.push(L.latLng(lat, lng));
      markersRef.current.push(marker);
    });

    if (latLngs.length > 0) {
      const bounds = L.latLngBounds(latLngs);
      mapRef.current!.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  }, [pins]);

  useEffect(() => {
    if (mapRef.current && pins) {
      renderMarkers();
    }
  }, [pins, renderMarkers]);

  const handleAdd = () => {
    if (!form.title || !form.lat || !form.lng) {
      toast.error(lang === "zh" ? "請填寫名稱並提供座標（可點擊地圖或搜尋地點）" : "Please enter a name and provide coordinates (click map or search)");
      return;
    }
    addPin.mutate({ tripId, title: form.title, notes: form.notes, lat: form.lat, lng: form.lng, category: form.category as any, address: form.address });
  };

  const handleUpdate = () => {
    if (!editingPin || !form.title) {
      toast.error(lang === "zh" ? "請填寫名稱" : "Please enter a name");
      return;
    }
    updatePin.mutate({ pinId: editingPin.id, tripId, title: form.title, notes: form.notes, category: form.category as any, address: form.address });
  };

  const openEdit = (pin: any) => {
    setEditingPin(pin);
    setForm({ title: pin.title, notes: pin.notes ?? "", lat: String(pin.lat), lng: String(pin.lng), category: pin.category ?? "attraction", address: pin.address ?? "" });
  };

  const handleGeocode = () => {
    if (!form.title.trim()) {
      toast.error(lang === "zh" ? "請先輸入地點名稱" : "Please enter a place name first");
      return;
    }
    geocodePlace.mutate({ query: form.title });
  };

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-8 h-8 text-primary animate-spin" />
    </div>
  );

  const renderPinFormFields = (showCoords: boolean) => (
    <div className="space-y-4 mt-2">
      <div>
        <Label>{t("pinName")} *</Label>
        <div className="flex gap-2 mt-1.5">
          <Input
            className="flex-1"
            placeholder={lang === "zh" ? "例：吉薩金字塔" : "e.g. Giza Pyramids"}
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleGeocode(); } }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleGeocode}
            disabled={geocodePlace.isPending}
            className="shrink-0 gap-1.5 px-3"
            title={lang === "zh" ? "自動搜尋座標和地址" : "Auto-search coordinates and address"}
          >
            {geocodePlace.isPending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Search className="w-4 h-4" />
            }
            {t("mapSearch")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {lang === "zh" ? "輸入名稱後點「搜尋」自動填入座標和地址" : "Enter a name and click Search to auto-fill coordinates"}
        </p>
      </div>

      <div>
        <Label>{t("pinCategory")}</Label>
        <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
          <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
          <SelectContent>{PIN_TYPES.map(tp => <SelectItem key={tp.value} value={tp.value}>{tp.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div>
        <Label>{t("pinNotes")}</Label>
        <Input className="mt-1.5" placeholder={lang === "zh" ? "簡短描述..." : "Short description..."} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
      </div>

      <div>
        <Label>{lang === "zh" ? "地址" : "Address"}</Label>
        <Input className="mt-1.5" placeholder={lang === "zh" ? "詳細地址（搜尋後自動填入）..." : "Address (auto-filled after search)..."} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
      </div>

      {showCoords && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{lang === "zh" ? "緯度 *" : "Latitude *"}</Label>
              <Input className="mt-1.5" placeholder="29.9792" value={form.lat} onChange={e => setForm({ ...form, lat: e.target.value })} />
            </div>
            <div>
              <Label>{lang === "zh" ? "經度 *" : "Longitude *"}</Label>
              <Input className="mt-1.5" placeholder="31.1342" value={form.lng} onChange={e => setForm({ ...form, lng: e.target.value })} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {lang === "zh" ? "💡 搜尋地點名稱或直接在地圖上點擊即可自動填入座標" : "💡 Search a place name or click on the map to auto-fill coordinates"}
          </p>
        </>
      )}
    </div>
  );

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 120px)" }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background shrink-0">
        <div>
          <h2 className="text-base font-bold text-foreground">{t("mapTitle")}</h2>
          <p className="text-xs text-muted-foreground">
            {lang === "zh"
              ? `${pins?.length ?? 0} 個地點 · 點擊地圖新增標記`
              : `${pins?.length ?? 0} place${(pins?.length ?? 0) !== 1 ? "s" : ""} · Click map to add pin`}
          </p>
        </div>
        <Button onClick={() => { setShowAdd(true); setForm(defaultForm); }} size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" />{t("addPin")}
        </Button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Map */}
        <div className="flex-1 relative min-h-0" style={{ minHeight: "400px" }}>
          <MapView
            onMapReady={(map) => { handleMapReady(map); setTimeout(renderMarkers, 300); }}
            className="w-full h-full absolute inset-0"
            initialCenter={pins && pins.length > 0
              ? { lat: parseFloat(pins[0].lat as string), lng: parseFloat(pins[0].lng as string) }
              : { lat: 30.0444, lng: 31.2357 }
            }
            initialZoom={pins && pins.length > 0 ? 10 : 6}
          />
        </div>

        {/* Pin list sidebar (desktop) */}
        <div className="hidden lg:flex flex-col w-72 border-l border-border bg-background overflow-y-auto">
          <div className="p-4 border-b border-border">
            <h3 className="font-semibold text-sm text-foreground">{lang === "zh" ? "地點列表" : "Places"}</h3>
          </div>
          {!pins || pins.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <MapPin className="w-8 h-8 text-muted-foreground mb-2" />
              <p className="text-muted-foreground text-sm">{t("noPinsDesc")}</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {pins.map(pin => {
                const pinType = PIN_TYPES.find(tp => tp.value === pin.category) ?? PIN_TYPES[0];
                const Icon = pinType.icon;
                return (
                  <div key={pin.id}
                    className={`p-3 flex items-start gap-3 group cursor-pointer hover:bg-accent/50 transition-colors ${selectedPin?.id === pin.id ? "bg-accent" : ""}`}
                    onClick={() => {
                      setSelectedPin(pin);
                      if (mapRef.current) {
                        mapRef.current.panTo([parseFloat(pin.lat as string), parseFloat(pin.lng as string)]);
                      }
                    }}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: `${pinType.color}20`, color: pinType.color }}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{pin.title}</p>
                      <p className="text-xs text-muted-foreground">{pinType.label}</p>
                      {pin.address && <p className="text-xs text-muted-foreground truncate">{pin.address}</p>}
                    </div>
                    <div className="flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); openEdit(pin); }}
                        className="p-1 rounded hover:bg-accent transition-colors"
                        title={t("editPin")}
                      >
                        <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); deletePin.mutate({ pinId: pin.id, tripId }); }}
                        className="p-1 rounded hover:bg-destructive/10 transition-all"
                        title={t("deletePin")}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Add Pin Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("addPin")}</DialogTitle></DialogHeader>
          {renderPinFormFields(true)}
          <Button className="w-full mt-4" onClick={handleAdd} disabled={addPin.isPending}>
            {addPin.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {t("addPin")}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Edit Pin Dialog */}
      <Dialog open={!!editingPin} onOpenChange={(o) => !o && setEditingPin(null)}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("editPin")}</DialogTitle></DialogHeader>
          {renderPinFormFields(false)}
          <Button className="w-full mt-4" onClick={handleUpdate} disabled={updatePin.isPending}>
            {updatePin.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {t("saveChanges")}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
