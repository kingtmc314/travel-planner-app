import { trpc } from "@/lib/trpc";
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

const PIN_TYPES = [
  { value: "attraction", label: "景點", icon: MapPin, color: "#22c55e" },
  { value: "hotel", label: "酒店", icon: Hotel, color: "#8b5cf6" },
  { value: "restaurant", label: "餐廳", icon: Utensils, color: "#f97316" },
  { value: "transport", label: "交通", icon: Car, color: "#3b82f6" },
  { value: "other", label: "其他", icon: MoreHorizontal, color: "#94a3b8" },
];

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
  const { data: pins, refetch, isLoading } = trpc.map.getPins.useQuery({ tripId });
  const [showAdd, setShowAdd] = useState(false);
  const [editingPin, setEditingPin] = useState<any | null>(null);
  const [selectedPin, setSelectedPin] = useState<any>(null);
  const [form, setForm] = useState(defaultForm);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<L.Marker[]>([]);

  const addPin = trpc.map.addPin.useMutation({
    onSuccess: () => { refetch(); setShowAdd(false); setForm(defaultForm); toast.success("地點已新增"); },
    onError: () => toast.error("新增失敗"),
  });
  const updatePin = trpc.map.updatePin.useMutation({
    onSuccess: () => { refetch(); setEditingPin(null); toast.success("地點已更新"); },
    onError: () => toast.error("更新失敗"),
  });
  const deletePin = trpc.map.deletePin.useMutation({
    onSuccess: () => { refetch(); setSelectedPin(null); toast.success("地點已刪除"); },
  });
  const geocodePlace = trpc.map.geocodePlace.useMutation({
    onSuccess: (data) => {
      setForm(prev => ({
        ...prev,
        lat: data.lat,
        lng: data.lng,
        address: data.address,
        // Only auto-fill title if it's empty
        title: prev.title || data.name,
      }));
      toast.success("已自動填入座標和地址");
    },
    onError: (err) => toast.error(err.message || "找不到該地點"),
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
    if (!form.title || !form.lat || !form.lng) { toast.error("請填寫名稱並提供座標（可點擊地圖或搜尋地點）"); return; }
    addPin.mutate({ tripId, title: form.title, notes: form.notes, lat: form.lat, lng: form.lng, category: form.category as any, address: form.address });
  };

  const handleUpdate = () => {
    if (!editingPin || !form.title) { toast.error("請填寫名稱"); return; }
    updatePin.mutate({ pinId: editingPin.id, tripId, title: form.title, notes: form.notes, category: form.category as any, address: form.address });
  };

  const openEdit = (pin: any) => {
    setEditingPin(pin);
    setForm({ title: pin.title, notes: pin.notes ?? "", lat: String(pin.lat), lng: String(pin.lng), category: pin.category ?? "attraction", address: pin.address ?? "" });
  };

  const handleGeocode = () => {
    if (!form.title.trim()) { toast.error("請先輸入地點名稱"); return; }
    geocodePlace.mutate({ query: form.title });
  };

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-8 h-8 text-primary animate-spin" />
    </div>
  );

  // Shared form fields component
  const PinFormFields = ({ showCoords = true }: { showCoords?: boolean }) => (
    <div className="space-y-4 mt-2">
      {/* Place name with geocode button */}
      <div>
        <Label>地點名稱 *</Label>
        <div className="flex gap-2 mt-1.5">
          <Input
            className="flex-1"
            placeholder="例：吉薩金字塔"
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
            title="自動搜尋座標和地址"
          >
            {geocodePlace.isPending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Search className="w-4 h-4" />
            }
            搜尋
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">輸入名稱後點「搜尋」自動填入座標和地址</p>
      </div>

      <div>
        <Label>類型</Label>
        <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
          <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
          <SelectContent>{PIN_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div>
        <Label>描述</Label>
        <Input className="mt-1.5" placeholder="簡短描述..." value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
      </div>

      <div>
        <Label>地址</Label>
        <Input className="mt-1.5" placeholder="詳細地址（搜尋後自動填入）..." value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
      </div>

      {showCoords && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>緯度 *</Label>
              <Input className="mt-1.5" placeholder="29.9792" value={form.lat} onChange={e => setForm({ ...form, lat: e.target.value })} />
            </div>
            <div>
              <Label>經度 *</Label>
              <Input className="mt-1.5" placeholder="31.1342" value={form.lng} onChange={e => setForm({ ...form, lng: e.target.value })} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">💡 搜尋地點名稱或直接在地圖上點擊即可自動填入座標</p>
        </>
      )}
    </div>
  );

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 120px)" }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background shrink-0">
        <div>
          <h2 className="text-base font-bold text-foreground">地圖模式</h2>
          <p className="text-xs text-muted-foreground">{pins?.length ?? 0} 個地點 · 點擊地圖新增標記</p>
        </div>
        <Button onClick={() => { setShowAdd(true); setForm(defaultForm); }} size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" />新增地點
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
            <h3 className="font-semibold text-sm text-foreground">地點列表</h3>
          </div>
          {!pins || pins.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <MapPin className="w-8 h-8 text-muted-foreground mb-2" />
              <p className="text-muted-foreground text-sm">點擊地圖或使用「新增地點」按鈕</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {pins.map(pin => {
                const pinType = PIN_TYPES.find(t => t.value === pin.category) ?? PIN_TYPES[0];
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
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); openEdit(pin); }}
                        className="p-1 rounded hover:bg-accent transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); deletePin.mutate({ pinId: pin.id, tripId }); }}
                        className="p-1 rounded hover:bg-destructive/10 transition-all"
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

      {/* Add Pin Dialog — max-h + overflow-y-auto prevents content from going off-screen */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>新增地點標記</DialogTitle></DialogHeader>
          <PinFormFields showCoords={true} />
          <Button className="w-full mt-4" onClick={handleAdd} disabled={addPin.isPending}>
            {addPin.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            新增標記
          </Button>
        </DialogContent>
      </Dialog>

      {/* Edit Pin Dialog */}
      <Dialog open={!!editingPin} onOpenChange={(o) => !o && setEditingPin(null)}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>修改地點標記</DialogTitle></DialogHeader>
          <PinFormFields showCoords={false} />
          <Button className="w-full mt-4" onClick={handleUpdate} disabled={updatePin.isPending}>
            {updatePin.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            儲存修改
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
