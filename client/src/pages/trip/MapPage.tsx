import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapView } from "@/components/Map";
import { Plus, Trash2, Loader2, MapPin, Hotel, Utensils, Car, MoreHorizontal, Edit2 } from "lucide-react";
import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";

const PIN_TYPES = [
  { value: "attraction", label: "景點", icon: MapPin, color: "#22c55e" },
  { value: "hotel", label: "酒店", icon: Hotel, color: "#8b5cf6" },
  { value: "restaurant", label: "餐廳", icon: Utensils, color: "#f97316" },
  { value: "transport", label: "交通", icon: Car, color: "#3b82f6" },
  { value: "other", label: "其他", icon: MoreHorizontal, color: "#94a3b8" },
];

const defaultForm = { title: "", notes: "", lat: "", lng: "", category: "attraction", address: "" };

export default function MapPage({ tripId }: { tripId: number }) {
  const { data: pins, refetch, isLoading } = trpc.map.getPins.useQuery({ tripId }, { refetchInterval: 15000 });
  const { data: trip } = trpc.trips.get.useQuery({ tripId });
  const [showAdd, setShowAdd] = useState(false);
  const [editingPin, setEditingPin] = useState<any | null>(null);
  const [selectedPin, setSelectedPin] = useState<any>(null);
  const [form, setForm] = useState(defaultForm);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

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

  const handleMapReady = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    infoWindowRef.current = new google.maps.InfoWindow();
    map.addListener("click", (e: google.maps.MapMouseEvent) => {
      if (e.latLng) {
        setForm(prev => ({ ...prev, lat: e.latLng!.lat().toFixed(7), lng: e.latLng!.lng().toFixed(7) }));
        setShowAdd(true);
      }
    });
  }, []);

  const renderMarkers = useCallback(() => {
    if (!mapRef.current || !pins) return;
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    const bounds = new google.maps.LatLngBounds();
    pins.forEach(pin => {
      const pinType = PIN_TYPES.find(t => t.value === pin.category) ?? PIN_TYPES[0];
      const marker = new google.maps.Marker({
        position: { lat: parseFloat(pin.lat as string), lng: parseFloat(pin.lng as string) },
        map: mapRef.current!,
        title: pin.title,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: pinType.color,
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 2,
        },
      });
      marker.addListener("click", () => {
        setSelectedPin(pin);
        infoWindowRef.current?.setContent(`<div style="padding:4px 8px;font-weight:600">${pin.title}</div>${pin.notes ? `<div style="padding:0 8px 4px;color:#666;font-size:12px">${pin.notes}</div>` : ""}`);  
        infoWindowRef.current?.open(mapRef.current!, marker);
      });
      bounds.extend({ lat: parseFloat(pin.lat as string), lng: parseFloat(pin.lng as string) });
      markersRef.current.push(marker);
    });
    if (pins.length > 0) mapRef.current!.fitBounds(bounds, 60);
  }, [pins]);

  const mapKey = pins?.map(p => p.id).join(",") ?? "";

  const handleAdd = () => {
    if (!form.title || !form.lat || !form.lng) { toast.error("請填寫名稱並在地圖上選擇位置"); return; }
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

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-8 h-8 text-primary animate-spin" />
    </div>
  );

  const PinFormFields = ({ showCoords = true }: { showCoords?: boolean }) => (
    <div className="space-y-4 mt-2">
      <div>
        <Label>地點名稱 *</Label>
        <Input className="mt-1.5" placeholder="例：吉薩金字塔" value={form.title} onChange={e => setForm({...form, title: e.target.value})} />
      </div>
      <div>
        <Label>類型</Label>
        <Select value={form.category} onValueChange={v => setForm({...form, category: v})}>
          <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
          <SelectContent>{PIN_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div>
        <Label>描述</Label>
        <Input className="mt-1.5" placeholder="簡短描述..." value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
      </div>
      <div>
        <Label>地址</Label>
        <Input className="mt-1.5" placeholder="詳細地址..." value={form.address} onChange={e => setForm({...form, address: e.target.value})} />
      </div>
      {showCoords && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>緯度 *</Label>
              <Input className="mt-1.5" placeholder="29.9792" value={form.lat} onChange={e => setForm({...form, lat: e.target.value})} />
            </div>
            <div>
              <Label>經度 *</Label>
              <Input className="mt-1.5" placeholder="31.1342" value={form.lng} onChange={e => setForm({...form, lng: e.target.value})} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">💡 直接在地圖上點擊即可自動填入座標</p>
        </>
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-full" style={{height:"calc(100vh - 120px)"}}>
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
        <div className="flex-1 relative">
          <MapView
            key={mapKey}
            onMapReady={(map) => { handleMapReady(map); setTimeout(renderMarkers, 100); }}
            className="w-full h-full"
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
              <p className="text-muted-foreground text-sm">點擊地圖新增地點</p>
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
                      if (mapRef.current) mapRef.current.panTo({ lat: parseFloat(pin.lat as string), lng: parseFloat(pin.lng as string) });
                    }}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{background:`${pinType.color}20`, color: pinType.color}}>
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

      {/* Add Pin Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-md">
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>修改地點標記</DialogTitle></DialogHeader>
          <PinFormFields showCoords={false} />
          <Button className="w-full mt-4" onClick={handleUpdate} disabled={updatePin.isPending}>
            {updatePin.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            儲存變更
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
