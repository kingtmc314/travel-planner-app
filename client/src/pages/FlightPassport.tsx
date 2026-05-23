import { trpc } from "@/lib/trpc";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plane, Plus, Trash2, Loader2, Clock, Globe, Building2, Share2 } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_TABS = ["All-Time", ...Array.from({ length: 6 }, (_, i) => String(CURRENT_YEAR - i))];

const FLIGHT_TYPE_LABELS: Record<string, string> = {
  outbound: "去程",
  return: "回程",
  connecting: "轉機",
  domestic: "國內",
  international: "國際",
};

// Approximate distance between two IATA airport codes (simplified)
// We'll use a lookup for common routes and estimate for others
const AIRPORT_COORDS: Record<string, [number, number]> = {
  HKG: [22.308, 113.915], NRT: [35.765, 140.386], ICN: [37.469, 126.451],
  LHR: [51.477, -0.461], CDG: [49.013, 2.550], JFK: [40.640, -73.779],
  LAX: [33.943, -118.408], SYD: [-33.946, 151.177], SIN: [1.350, 103.994],
  BKK: [13.681, 100.747], DXB: [25.253, 55.365], TPE: [25.077, 121.233],
  PEK: [40.080, 116.584], PVG: [31.143, 121.805], CAN: [23.392, 113.299],
  KIX: [34.427, 135.244], FUK: [33.585, 130.451], OKA: [26.195, 127.646],
  MNL: [14.509, 121.020], KUL: [2.745, 101.710], CGK: [-6.126, 106.656],
  DEL: [28.556, 77.100], BOM: [19.089, 72.868], LOS: [6.577, 3.321],
  CAI: [30.122, 31.406], JNB: [-26.134, 28.242], NBO: [-1.319, 36.928],
  GRU: [-23.435, -46.473], EZE: [-34.822, -58.536], MEX: [19.436, -99.072],
  YYZ: [43.677, -79.631], ORD: [41.978, -87.905], MIA: [25.796, -80.287],
  SFO: [37.619, -122.375], SEA: [47.450, -122.309], ATL: [33.641, -84.427],
  FCO: [41.800, 12.239], MAD: [40.494, -3.567], BCN: [41.297, 2.078],
  AMS: [52.308, 4.764], FRA: [50.033, 8.571], MUC: [48.354, 11.786],
  ZRH: [47.458, 8.548], VIE: [48.110, 16.570], CPH: [55.618, 12.656],
  ARN: [59.651, 17.919], HEL: [60.317, 24.963], DUB: [53.421, -6.270],
  IST: [40.976, 28.814], DOH: [25.273, 51.608], AUH: [24.433, 54.651],
};

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function estimateDistance(dep: string, arr: string): number {
  const c1 = AIRPORT_COORDS[dep?.toUpperCase()];
  const c2 = AIRPORT_COORDS[arr?.toUpperCase()];
  if (c1 && c2) return Math.round(haversineKm(c1[0], c1[1], c2[0], c2[1]));
  return 0;
}

function estimateFlightHours(distKm: number): number {
  // Rough: 800 km/h + 1h taxi/boarding
  return distKm > 0 ? distKm / 800 + 1 : 0;
}

function formatHours(hours: number): string {
  const d = Math.floor(hours / 24);
  const h = Math.floor(hours % 24);
  const m = Math.round((hours - Math.floor(hours)) * 60);
  if (d > 0) return `${d}d ${h}h`;
  return `${h}h ${m}m`;
}

function formatDistance(km: number): string {
  if (km >= 1000) return `${(km / 1000).toFixed(1)}k km`;
  return `${km} km`;
}

type PastFlight = {
  id: number;
  flightNumber: string | null;
  airline: string | null;
  departureAirport: string | null;
  arrivalAirport: string | null;
  flightDate: Date | null;
  flightYear: number | null;
  durationMinutes: number | null;
  distanceKm: number | null;
  notes: string | null;
  seatClass: 'economy' | 'premium_economy' | 'business' | 'first' | null;
};

const defaultForm = {
  flightNumber: "",
  airline: "",
  departureAirport: "",
  arrivalAirport: "",
  departureDate: "",
  durationMinutes: "",
  distanceKm: "",
  seatClass: "economy" as string,
  notes: "",
};

export default function FlightPassport() {
  const { data: flights, refetch, isLoading } = trpc.passport.getFlights.useQuery();
  const addFlight = trpc.passport.addFlight.useMutation({
    onSuccess: () => { refetch(); setShowAdd(false); setForm(defaultForm); toast.success("航班已記錄"); },
    onError: () => toast.error("新增失敗"),
  });
  const deleteFlight = trpc.passport.deleteFlight.useMutation({
    onSuccess: () => { refetch(); toast.success("已刪除"); },
  });
  const seedFlights = trpc.passport.seedMyFlights.useMutation({
    onSuccess: (data) => {
      if (data.alreadySeeded) {
        toast.info(`已有 ${data.count} 筆航班記錄`);
      } else {
        refetch();
        toast.success(`成功匯入 ${data.count} 筆歷史航班！`);
      }
    },
    onError: () => toast.error("匯入失敗"),
  });

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [activeYear, setActiveYear] = useState("All-Time");

  // Compute stats
  const stats = useMemo(() => {
    if (!flights) return null;
    const filtered = activeYear === "All-Time" ? flights : flights.filter(f => f.flightYear === parseInt(activeYear));

    const totalFlights = filtered.length;
    let totalDistKm = 0;
    let totalHours = 0;
    const airports = new Set<string>();
    const airlines = new Set<string>();

    filtered.forEach(f => {
      const dep = f.departureAirport ?? "";
      const arr = f.arrivalAirport ?? "";
      if (dep) airports.add(dep);
      if (arr) airports.add(arr);
      if (f.airline) airlines.add(f.airline);

      const dist = f.distanceKm ?? estimateDistance(dep, arr);
      totalDistKm += dist;

      const hrs = f.durationMinutes ? f.durationMinutes / 60 : estimateFlightHours(dist);
      totalHours += hrs;
    });

    const longHaul = filtered.filter(f => {
      const dep = f.departureAirport ?? "";
      const arr = f.arrivalAirport ?? "";
      const dist = f.distanceKm ?? estimateDistance(dep, arr);
      return dist > 6000;
    }).length;

    const earthCircumference = 40075;
    const earthWraps = totalDistKm / earthCircumference;

    return {
      totalFlights,
      totalDistKm,
      totalHours,
      airports: airports.size,
      airlines: airlines.size,
      longHaul,
      earthWraps,
      filtered,
    };
  }, [flights, activeYear]);

  // Auto-estimate distance when airports change
  const handleAirportChange = (field: "departureAirport" | "arrivalAirport", value: string) => {
    const updated = { ...form, [field]: value };
    const dep = field === "departureAirport" ? value : form.departureAirport;
    const arr = field === "arrivalAirport" ? value : form.arrivalAirport;
    const dist = estimateDistance(dep, arr);
    if (dist > 0) updated.distanceKm = String(dist);
    setForm(updated);
  };

  const handleAdd = () => {
    if (!form.departureAirport || !form.arrivalAirport) { toast.error("請填寫出發和抵達機場"); return; }
    const dist = form.distanceKm ? parseInt(form.distanceKm) : estimateDistance(form.departureAirport, form.arrivalAirport);
    addFlight.mutate({
      flightNumber: form.flightNumber || undefined,
      airline: form.airline || undefined,
      departureAirport: form.departureAirport,
      arrivalAirport: form.arrivalAirport,
      flightDate: form.departureDate || new Date().toISOString().split('T')[0],
      durationMinutes: form.durationMinutes ? parseInt(form.durationMinutes) : undefined,
      distanceKm: dist || undefined,
      seatClass: (form.seatClass as 'economy' | 'premium_economy' | 'business' | 'first') || 'economy',
      notes: form.notes || undefined,
    });
  };

  const yearFlights = useMemo(() => {
    if (!flights) return {};
    const byYear: Record<string, number> = {};
    flights.forEach(f => {
      const y = String(f.flightYear ?? "Unknown");
      byYear[y] = (byYear[y] ?? 0) + 1;
    });
    return byYear;
  }, [flights]);

  return (
    <AppLayout>
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border px-4 sm:px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-600 flex items-center justify-center">
              <Plane className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-foreground text-lg leading-tight">飛行護照</h1>
              <p className="text-muted-foreground text-xs">Flight Passport</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(!flights || flights.length === 0) && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-sky-300 text-sky-600 hover:bg-sky-50"
                onClick={() => seedFlights.mutate()}
                disabled={seedFlights.isPending}
              >
                {seedFlights.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plane className="w-4 h-4" />}
                <span className="hidden sm:inline">匯入歷史航班</span>
              </Button>
            )}
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => toast.info("分享功能即將推出")}>
              <Share2 className="w-4 h-4" />
              <span className="hidden sm:inline">分享</span>
            </Button>
            <Button onClick={() => setShowAdd(true)} size="sm" className="gap-1.5 bg-sky-600 hover:bg-sky-700">
              <Plus className="w-4 h-4" />
              記錄
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        {/* Year Tabs */}
        <div className="overflow-x-auto mb-6 -mx-4 px-4">
          <div className="flex gap-2 min-w-max">
            {YEAR_TABS.map(year => (
              <button
                key={year}
                onClick={() => setActiveYear(year)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                  activeYear === year
                    ? "bg-sky-600 text-white shadow-sm"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {year}
                {year !== "All-Time" && yearFlights[year] && (
                  <span className="ml-1.5 text-xs opacity-70">({yearFlights[year]})</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-sky-600" /></div>
        ) : !stats || stats.totalFlights === 0 ? (
          <div className="text-center py-20">
            <div className="w-20 h-20 rounded-full bg-sky-50 flex items-center justify-center mx-auto mb-4">
              <Plane className="w-10 h-10 text-sky-400" />
            </div>
            <h3 className="font-semibold text-foreground mb-1">
              {activeYear === "All-Time" ? "還沒有飛行記錄" : `${activeYear} 年沒有飛行記錄`}
            </h3>
            <p className="text-muted-foreground text-sm">記錄你的每一次飛行旅程</p>
            <button onClick={() => setShowAdd(true)} className="text-sky-600 hover:underline mt-3 text-sm">+ 新增第一個航班</button>
          </div>
        ) : (
          <>
            {/* Passport Card */}
            <div className="rounded-2xl overflow-hidden mb-6 shadow-lg">
              <div className="bg-gradient-to-br from-indigo-900 via-blue-900 to-sky-800 p-6 text-white">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium tracking-widest opacity-70 uppercase">
                    {activeYear === "All-Time" ? "All-Time Passport" : `${activeYear} Passport`}
                  </p>
                  <Plane className="w-5 h-5 opacity-60" />
                </div>
                <p className="text-xs opacity-50 mb-4 tracking-wider">PASSPORT • PASS • PASAPORTE</p>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-xs opacity-60 uppercase tracking-wider mb-0.5">Flights</p>
                    <p className="text-4xl font-bold">{stats.totalFlights}</p>
                    {stats.longHaul > 0 && (
                      <p className="text-xs opacity-60 mt-0.5">{stats.longHaul} Long Haul</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs opacity-60 uppercase tracking-wider mb-0.5">Distance</p>
                    <p className="text-3xl font-bold">{stats.totalDistKm.toLocaleString()} km</p>
                    {stats.earthWraps > 0 && (
                      <p className="text-xs opacity-60 mt-0.5">{stats.earthWraps.toFixed(1)}x around the world</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 pt-4 border-t border-white/20">
                  <div>
                    <p className="text-xs opacity-60 uppercase tracking-wider mb-0.5">Flight Time</p>
                    <p className="text-lg font-bold">{formatHours(stats.totalHours)}</p>
                  </div>
                  <div>
                    <p className="text-xs opacity-60 uppercase tracking-wider mb-0.5">Airports</p>
                    <p className="text-lg font-bold">{stats.airports}</p>
                  </div>
                  <div>
                    <p className="text-xs opacity-60 uppercase tracking-wider mb-0.5">Airlines</p>
                    <p className="text-lg font-bold">{stats.airlines}</p>
                  </div>
                </div>
              </div>

              {/* Route visualization */}
              <div className="bg-indigo-950 px-6 py-4">
                <FlightRouteMap flights={stats.filtered} />
              </div>
            </div>

            {/* Flight List */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-foreground">航班記錄</h3>
                <p className="text-sm text-muted-foreground">{stats.totalFlights} 個航班</p>
              </div>
              <div className="space-y-2">
                {stats.filtered.map(flight => {
                  const dep = flight.departureAirport ?? "";
                  const arr = flight.arrivalAirport ?? "";
                  const dist = flight.distanceKm ?? estimateDistance(dep, arr);
                  const hrs = flight.durationMinutes ? flight.durationMinutes / 60 : estimateFlightHours(dist);
                  return (
                    <div key={flight.id} className="bg-card rounded-xl border border-border p-4 group">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-sky-100 flex items-center justify-center shrink-0">
                          <Plane className="w-5 h-5 text-sky-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-bold text-foreground text-lg">{dep}</span>
                            <div className="flex-1 flex items-center gap-1 max-w-16">
                              <div className="flex-1 h-px bg-border" />
                              <Plane className="w-3 h-3 text-muted-foreground" />
                              <div className="flex-1 h-px bg-border" />
                            </div>
                            <span className="font-bold text-foreground text-lg">{arr}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                            {flight.flightNumber && <span className="font-medium">{flight.flightNumber}</span>}
                            {flight.airline && <span>{flight.airline}</span>}
                            {flight.flightDate && <span>{new Date(flight.flightDate).toLocaleDateString()}</span>}
                            {dist > 0 && <span>{dist.toLocaleString()} km</span>}
                            {hrs > 0 && <span>{formatHours(hrs)}</span>}
                            {flight.seatClass && (
                              <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                flight.seatClass === "business" ? "bg-amber-100 text-amber-700" :
                                flight.seatClass === "first" ? "bg-purple-100 text-purple-700" :
                                "bg-muted text-muted-foreground"
                              }`}>
                                {flight.seatClass === "economy" ? "經濟" : flight.seatClass === "business" ? "商務" : flight.seatClass === "first" ? "頭等" : flight.seatClass}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => deleteFlight.mutate({ flightId: flight.id })}
                          className="p-1.5 rounded-lg hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Add Flight Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>記錄航班</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground">出發機場 * (IATA)</label>
                <Input
                  className="mt-1.5 uppercase"
                  placeholder="例：HKG"
                  value={form.departureAirport}
                  onChange={e => handleAirportChange("departureAirport", e.target.value.toUpperCase())}
                  maxLength={3}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">抵達機場 * (IATA)</label>
                <Input
                  className="mt-1.5 uppercase"
                  placeholder="例：NRT"
                  value={form.arrivalAirport}
                  onChange={e => handleAirportChange("arrivalAirport", e.target.value.toUpperCase())}
                  maxLength={3}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground">航班號碼</label>
                <Input className="mt-1.5" placeholder="例：CX 543" value={form.flightNumber} onChange={e => setForm({ ...form, flightNumber: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">航空公司</label>
                <Input className="mt-1.5" placeholder="例：Cathay Pacific" value={form.airline} onChange={e => setForm({ ...form, airline: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground">出發日期</label>
                <Input className="mt-1.5" type="date" value={form.departureDate} onChange={e => setForm({ ...form, departureDate: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">艙等</label>
                <Select value={form.seatClass} onValueChange={v => setForm({ ...form, seatClass: v })}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="economy">經濟艙</SelectItem>
                    <SelectItem value="premium_economy">豪華經濟</SelectItem>
                    <SelectItem value="business">商務艙</SelectItem>
                    <SelectItem value="first">頭等艙</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground">距離 (km)</label>
                <Input
                  className="mt-1.5"
                  type="number"
                  placeholder="自動估算"
                  value={form.distanceKm}
                  onChange={e => setForm({ ...form, distanceKm: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">飛行時間 (分鐘)</label>
                <Input
                  className="mt-1.5"
                  type="number"
                  placeholder="例：165"
                  value={form.durationMinutes}
                  onChange={e => setForm({ ...form, durationMinutes: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">備注</label>
              <Input className="mt-1.5" placeholder="選填" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
            <Button className="w-full bg-sky-600 hover:bg-sky-700" onClick={handleAdd} disabled={addFlight.isPending}>
              {addFlight.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              記錄航班
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </AppLayout>
  );
}

// Flight Route Map Component
function FlightRouteMap({ flights }: { flights: PastFlight[] }) {
  const routes = useMemo(() => {
    return flights
      .filter(f => f.departureAirport && f.arrivalAirport)
      .map(f => {
        const dep = f.departureAirport!.toUpperCase();
        const arr = f.arrivalAirport!.toUpperCase();
        const c1 = AIRPORT_COORDS[dep];
        const c2 = AIRPORT_COORDS[arr];
        return { dep, arr, c1, c2 };
      })
      .filter(r => r.c1 && r.c2);
  }, [flights]);

  // Convert lat/lon to SVG coordinates (simple equirectangular projection)
  const toSVG = (lat: number, lon: number): [number, number] => {
    const x = ((lon + 180) / 360) * 580 + 10;
    const y = ((90 - lat) / 180) * 200 + 10;
    return [x, y];
  };

  const airports = useMemo(() => {
    const set = new Set<string>();
    routes.forEach(r => { set.add(r.dep); set.add(r.arr); });
    return Array.from(set).map(code => {
      const coords = AIRPORT_COORDS[code];
      return { code, coords };
    }).filter(a => a.coords);
  }, [routes]);

  if (routes.length === 0) {
    return (
      <div className="flex items-center justify-center py-6 text-white/40 text-sm">
        <Globe className="w-4 h-4 mr-2" />
        航班路線圖
      </div>
    );
  }

  return (
    <svg viewBox="0 0 600 220" className="w-full" style={{ minWidth: 280 }}>
      {/* Ocean background */}
      <rect width="600" height="220" fill="#0f172a" rx="8" />

      {/* Simple continent outlines (very simplified) */}
      {/* North America */}
      <path d="M 30 40 L 130 30 L 160 80 L 140 130 L 90 150 L 50 120 Z" fill="#1e293b" stroke="#334155" strokeWidth="0.5" />
      {/* South America */}
      <path d="M 100 160 L 150 155 L 160 200 L 130 210 L 90 200 Z" fill="#1e293b" stroke="#334155" strokeWidth="0.5" />
      {/* Europe */}
      <path d="M 255 30 L 320 25 L 340 60 L 310 80 L 260 70 Z" fill="#1e293b" stroke="#334155" strokeWidth="0.5" />
      {/* Africa */}
      <path d="M 265 80 L 330 75 L 340 160 L 300 175 L 260 155 Z" fill="#1e293b" stroke="#334155" strokeWidth="0.5" />
      {/* Asia */}
      <path d="M 330 20 L 530 15 L 550 100 L 480 130 L 380 120 L 330 80 Z" fill="#1e293b" stroke="#334155" strokeWidth="0.5" />
      {/* Australia */}
      <path d="M 470 150 L 560 145 L 565 195 L 490 200 Z" fill="#1e293b" stroke="#334155" strokeWidth="0.5" />

      {/* Flight routes */}
      {routes.map((r, i) => {
        const [x1, y1] = toSVG(r.c1![0], r.c1![1]);
        const [x2, y2] = toSVG(r.c2![0], r.c2![1]);
        // Control point for arc
        const mx = (x1 + x2) / 2;
        const my = Math.min(y1, y2) - 30;
        return (
          <path
            key={i}
            d={`M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`}
            fill="none"
            stroke="#38bdf8"
            strokeWidth="1"
            strokeOpacity="0.6"
            strokeDasharray="3 2"
          />
        );
      })}

      {/* Airport dots */}
      {airports.map(a => {
        const [x, y] = toSVG(a.coords![0], a.coords![1]);
        return (
          <g key={a.code}>
            <circle cx={x} cy={y} r="3" fill="#38bdf8" />
            <circle cx={x} cy={y} r="5" fill="#38bdf8" fillOpacity="0.3" />
            <text x={x + 5} y={y - 3} fontSize="6" fill="#7dd3fc" fontFamily="monospace">{a.code}</text>
          </g>
        );
      })}
    </svg>
  );
}
