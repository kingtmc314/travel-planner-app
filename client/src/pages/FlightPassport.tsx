import { trpc } from "@/lib/trpc";
import AppLayout from "@/components/AppLayout";
import WorldMap from "@/components/WorldMap";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plane, Plus, Trash2, Loader2, Clock, Globe, Building2, Share2, Edit2, RefreshCw } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { useI18n } from "@/hooks/useI18n";

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
  // Hong Kong & Macau
  HKG: [22.308, 113.915], MFM: [22.150, 113.592],
  // Taiwan
  TPE: [25.077, 121.233], TSA: [25.069, 121.552], KHH: [22.577, 120.350],
  RMQ: [24.264, 120.621], TNN: [22.950, 120.206], TTT: [22.755, 121.101],
  HUN: [23.741, 121.617], KNH: [24.427, 118.359],
  // Japan
  NRT: [35.765, 140.386], HND: [35.549, 139.780], KIX: [34.427, 135.244],
  FUK: [33.585, 130.451], OKA: [26.195, 127.646], CTS: [42.775, 141.692],
  NGO: [34.858, 136.805], ITM: [34.785, 135.438], OIT: [33.479, 131.737],
  KMJ: [32.837, 130.855], MYJ: [33.828, 132.700], HIJ: [34.436, 132.920],
  SDJ: [38.140, 140.917], AOJ: [40.735, 140.691], AXT: [39.615, 140.219],
  // South Korea
  ICN: [37.469, 126.451], GMP: [37.558, 126.791], PUS: [35.179, 128.938],
  CJU: [33.511, 126.493], TAE: [35.894, 128.659],
  // China
  PEK: [40.080, 116.584], PKX: [39.509, 116.410], PVG: [31.143, 121.805],
  SHA: [31.198, 121.336], CAN: [23.392, 113.299], SZX: [22.639, 113.811],
  CTU: [30.578, 103.947], KMG: [24.992, 102.743], XIY: [34.447, 108.752],
  WUH: [30.784, 114.208], CSX: [28.189, 113.220], NKG: [31.742, 118.862],
  HGH: [30.229, 120.434], XMN: [24.544, 118.128], FOC: [25.935, 119.663],
  HAK: [19.935, 110.459], SYX: [18.307, 109.412], URC: [43.907, 87.474],
  CGO: [34.524, 113.841], TNA: [36.857, 117.216], TSN: [39.124, 117.346],
  DLC: [38.966, 121.539], SHE: [41.639, 123.483], HRB: [45.623, 126.250],
  // Southeast Asia
  SIN: [1.350, 103.994], KUL: [2.745, 101.710], BKK: [13.681, 100.747],
  DMK: [13.913, 100.607], MNL: [14.509, 121.020], CGK: [-6.126, 106.656],
  DPS: [-8.748, 115.167], SUB: [-7.380, 112.787], HAN: [21.221, 105.807],
  SGN: [10.818, 106.652], DAD: [16.044, 108.199], RGN: [16.907, 96.133],
  PNH: [11.547, 104.844], VTE: [17.988, 102.563], REP: [13.411, 103.813],
  BKI: [5.937, 116.051], KCH: [1.485, 110.336], PEN: [5.297, 100.277],
  // South Asia
  DEL: [28.556, 77.100], BOM: [19.089, 72.868], MAA: [12.990, 80.169],
  BLR: [13.198, 77.706], CCU: [22.654, 88.447], HYD: [17.231, 78.430],
  CMB: [7.180, 79.884], DAC: [23.843, 90.398], KTM: [27.697, 85.360],
  // Middle East
  DXB: [25.253, 55.365], AUH: [24.433, 54.651], DOH: [25.273, 51.608],
  KWI: [29.227, 47.969], BAH: [26.271, 50.634], MCT: [23.593, 58.285],
  AMM: [31.723, 35.993], BEY: [33.821, 35.488], TLV: [32.011, 34.887],
  // Europe
  LHR: [51.477, -0.461], LGW: [51.148, -0.190], STN: [51.885, 0.235],
  CDG: [49.013, 2.550], ORY: [48.724, 2.380], AMS: [52.308, 4.764],
  FRA: [50.033, 8.571], MUC: [48.354, 11.786], BER: [52.366, 13.503],
  ZRH: [47.458, 8.548], VIE: [48.110, 16.570], FCO: [41.800, 12.239],
  MXP: [45.630, 8.728], MAD: [40.494, -3.567], BCN: [41.297, 2.078],
  LIS: [38.774, -9.134], CPH: [55.618, 12.656], ARN: [59.651, 17.919],
  HEL: [60.317, 24.963], OSL: [60.194, 11.100], DUB: [53.421, -6.270],
  BRU: [50.901, 4.484], GVA: [46.238, 6.109], PRG: [50.100, 14.260],
  WAW: [52.166, 20.967], BUD: [47.437, 19.261], ATH: [37.936, 23.944],
  IST: [40.976, 28.814], SAW: [40.898, 29.309], ADB: [38.292, 27.157],
  // Africa
  CAI: [30.122, 31.406], LOS: [6.577, 3.321], JNB: [-26.134, 28.242],
  CPT: [-33.965, 18.602], NBO: [-1.319, 36.928], ADD: [8.978, 38.799],
  CMN: [33.368, -7.590], TUN: [36.851, 10.227], ALG: [36.691, 3.215],
  // Americas
  JFK: [40.640, -73.779], EWR: [40.690, -74.175], LGA: [40.777, -73.873],
  LAX: [33.943, -118.408], SFO: [37.619, -122.375], SEA: [47.450, -122.309],
  ORD: [41.978, -87.905], ATL: [33.641, -84.427], MIA: [25.796, -80.287],
  DFW: [32.897, -97.038], DEN: [39.856, -104.674], BOS: [42.365, -71.010],
  YYZ: [43.677, -79.631], YVR: [49.195, -123.184], YUL: [45.470, -73.741],
  MEX: [19.436, -99.072], BOG: [4.702, -74.147], LIM: [-12.022, -77.114],
  GRU: [-23.435, -46.473], EZE: [-34.822, -58.536], SCL: [-33.393, -70.786],
  // Oceania
  SYD: [-33.946, 151.177], MEL: [-37.673, 144.843], BNE: [-27.384, 153.118],
  PER: [-31.940, 115.967], AKL: [-37.008, 174.792], CHC: [-43.489, 172.532],
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
  departureCountry: string | null;
  arrivalCountry: string | null;
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
  const { t, lang } = useI18n();
  const { data: flights, refetch, isLoading } = trpc.passport.getFlights.useQuery();
  // We derive visited countries directly from flight records so the map stays in sync
  // without requiring a separate sync step
  const addFlight = trpc.passport.addFlight.useMutation({
    onSuccess: () => { refetch(); setShowAdd(false); setForm(defaultForm); toast.success(t("flightRecordAdded")); },
    onError: () => toast.error(t("addFlightFailed")),
  });
  const deleteFlight = trpc.passport.deleteFlight.useMutation({
    onSuccess: () => { refetch(); toast.success(t("flightRecordDeleted")); },
  });
  const [importResult, setImportResult] = useState<{ flights: number; countries: number } | null>(null);

  const seedFlights = trpc.passport.seedMyFlights.useMutation({
    onSuccess: (data) => {
      refetch();
      setImportResult({ flights: data.count, countries: data.countriesSynced ?? 0 });
    },
    onError: () => toast.error(t("importFailed")),
  });

  const syncCountries = trpc.passport.syncCountriesFromFlights.useMutation({
    onSuccess: (data) => {
      toast.success(lang === "zh" ? `已同步 ${data.synced} 個國家到旅遊足跡地圖！` : `Synced ${data.synced} countries to travel map!`);
    },
    onError: () => toast.error(t("syncFailed")),
  });

  const updateFlight = trpc.passport.updateFlight.useMutation({
    onSuccess: () => { refetch(); setEditingFlight(null); toast.success(t("flightUpdated")); },
    onError: () => toast.error(t("updateFailed")),
  });

  const [showAdd, setShowAdd] = useState(false);
  const [editingFlight, setEditingFlight] = useState<PastFlight | null>(null);
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

  const openEditFlight = (flight: PastFlight) => {
    setEditingFlight(flight);
    const dep = (flight.departureAirport ?? "").toUpperCase();
    const arr = (flight.arrivalAirport ?? "").toUpperCase();
    // Auto-calculate distance and duration if not stored
    let distanceKm = flight.distanceKm ? String(flight.distanceKm) : "";
    let durationMinutes = flight.durationMinutes ? String(flight.durationMinutes) : "";
    if (dep.length === 3 && arr.length === 3) {
      const dist = estimateDistance(dep, arr);
      if (dist > 0) {
        if (!distanceKm) distanceKm = String(dist);
        if (!durationMinutes) durationMinutes = String(Math.round(estimateFlightHours(dist) * 60));
      }
    }
    setForm({
      flightNumber: flight.flightNumber ?? "",
      airline: flight.airline ?? "",
      departureAirport: dep,
      arrivalAirport: arr,
      departureDate: flight.flightDate ? new Date(flight.flightDate).toISOString().split('T')[0] : "",
      durationMinutes,
      distanceKm,
      seatClass: flight.seatClass ?? "economy",
      notes: flight.notes ?? "",
    });
  };

  const handleUpdate = () => {
    if (!editingFlight || !form.departureAirport || !form.arrivalAirport) { toast.error(t("airportRequired")); return; }
    const dist = form.distanceKm ? parseInt(form.distanceKm) : estimateDistance(form.departureAirport, form.arrivalAirport);
    updateFlight.mutate({
      flightId: editingFlight.id,
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

  // Auto-estimate distance and duration when airports change
  const handleAirportChange = (field: "departureAirport" | "arrivalAirport", value: string) => {
    const updated = { ...form, [field]: value };
    const dep = field === "departureAirport" ? value : form.departureAirport;
    const arr = field === "arrivalAirport" ? value : form.arrivalAirport;
    // Only auto-calculate when both airports are 3-letter IATA codes
    if (dep.length === 3 && arr.length === 3) {
      const dist = estimateDistance(dep, arr);
      if (dist > 0) {
        updated.distanceKm = String(dist);
        // Only auto-fill duration if user hasn't manually entered one
        if (!form.durationMinutes) {
          const durationMins = Math.round(estimateFlightHours(dist) * 60);
          updated.durationMinutes = String(durationMins);
        }
      }
    }
    setForm(updated);
  };

  const handleAdd = () => {
    if (!form.departureAirport || !form.arrivalAirport) { toast.error(t("airportRequired")); return; }
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

  // Build unique flight routes for map arcs (deduplicated by dep+arr pair)
  // Derived from stats.filtered so year filter updates the map in real-time
  const flightRoutes = useMemo(() => {
    if (!stats) return [];
    const seen = new Set<string>();
    const routes: { dep: string; arr: string }[] = [];
    stats.filtered.forEach(f => {
      const dep = (f.departureAirport ?? "").toUpperCase();
      const arr = (f.arrivalAirport ?? "").toUpperCase();
      if (!dep || !arr || dep === arr) return;
      const key = [dep, arr].sort().join("-");
      if (!seen.has(key)) { seen.add(key); routes.push({ dep, arr }); }
    });
    return routes;
  }, [stats]);

  // Country name → ISO alpha-2 (mirrors FLIGHT_COUNTRY_TO_ISO on the server)
  const COUNTRY_NAME_TO_ISO: Record<string, string> = {
    "Japan": "JP", "Taiwan": "TW", "South Korea": "KR", "Korea": "KR",
    "Thailand": "TH", "Singapore": "SG", "Malaysia": "MY", "Indonesia": "ID",
    "Vietnam": "VN", "Philippines": "PH", "Cambodia": "KH", "China": "CN",
    "Egypt": "EG", "UK": "GB", "United Kingdom": "GB", "France": "FR",
    "Germany": "DE", "Italy": "IT", "Spain": "ES", "USA": "US",
    "United States": "US", "Canada": "CA", "Australia": "AU", "New Zealand": "NZ",
    "UAE": "AE", "United Arab Emirates": "AE", "Greece": "GR", "Portugal": "PT",
    "Netherlands": "NL", "Switzerland": "CH", "Austria": "AT", "Czech Republic": "CZ",
    "Hungary": "HU", "Poland": "PL", "India": "IN", "Maldives": "MV",
    "Sri Lanka": "LK", "Nepal": "NP", "Morocco": "MA", "Turkey": "TR",
    "Russia": "RU", "Brazil": "BR", "Argentina": "AR", "Mexico": "MX",
    "Hong Kong": "HK", "Macau": "MO",
  };

  // Derive visited countries from filtered flights so year filter updates map in real-time
  const mapCountries = useMemo(() => {
    if (!stats) return [];
    const seen = new Set<string>();
    const result: { countryCode: string; status: "visited" }[] = [];
    stats.filtered.forEach(f => {
      for (const name of [f.arrivalCountry, f.departureCountry]) {
        if (!name || name === "Hong Kong") continue;
        const iso = COUNTRY_NAME_TO_ISO[name];
        if (iso && !seen.has(iso)) {
          seen.add(iso);
          result.push({ countryCode: iso, status: "visited" });
        }
      }
    });
    return result;
  }, [stats]);

  return (
    <AppLayout>
    <div className="min-h-screen bg-background">
      {/* Import Result Dialog */}
      {importResult && (
        <Dialog open onOpenChange={() => setImportResult(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-sky-100 flex items-center justify-center">
                  <Plane className="w-4 h-4 text-sky-600" />
                </div>
                {t("importComplete")}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-sky-50 rounded-xl p-4 text-center">
                  <p className="text-3xl font-bold text-sky-600">{importResult.flights}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t("flightsImported")}</p>
                </div>
                <div className="bg-emerald-50 rounded-xl p-4 text-center">
                  <p className="text-3xl font-bold text-emerald-600">{importResult.countries}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t("countriesAddedToMap")}</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground text-center">
                {lang === "zh" ? <>前往<span className="font-medium text-foreground">旅遊足跡</span>查看世界地圖上已高亮的國家 🌍</> : <>Go to <span className="font-medium text-foreground">Travel History</span> to see highlighted countries on the world map 🌍</>}
              </p>
              <Button className="w-full bg-sky-600 hover:bg-sky-700" onClick={() => setImportResult(null)}>
                {t("great")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border px-4 sm:px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-600 flex items-center justify-center">
              <Plane className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-foreground text-lg leading-tight">{t("flightPassportTitle")}</h1>
              <p className="text-muted-foreground text-xs">Flight Passport</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            {(!flights || flights.length === 0) ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-sky-300 text-sky-600 hover:bg-sky-50 px-2 sm:px-3"
                onClick={() => seedFlights.mutate()}
                disabled={seedFlights.isPending}
                title={t("importHistoryFlights")}
              >
                {seedFlights.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plane className="w-4 h-4" />}
                <span className="hidden sm:inline">{t("importHistoryFlights")}</span>
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-emerald-300 text-emerald-600 hover:bg-emerald-50 px-2 sm:px-3"
                onClick={() => syncCountries.mutate()}
                disabled={syncCountries.isPending}
                title={t("syncMap")}
              >
                {syncCountries.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                <span className="hidden sm:inline">{t("syncMap")}</span>
              </Button>
            )}
            {/* Share button: icon-only on mobile */}
            <Button variant="outline" size="sm" className="gap-1.5 hidden sm:flex" onClick={() => toast.info(lang === "zh" ? "分享功能即將推出" : "Share feature coming soon")}>
              <Share2 className="w-4 h-4" />
              {t("share")}
            </Button>
            <Button onClick={() => setShowAdd(true)} size="sm" className="gap-1.5 bg-sky-600 hover:bg-sky-700 px-2 sm:px-3">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">{t("record")}</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 pb-8">
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
              {activeYear === "All-Time" ? t("noFlightRecords") : lang === "zh" ? `${activeYear} 年沒有飛行記錄` : `No flights in ${activeYear}`}
            </h3>
            <p className="text-muted-foreground text-sm">{t("noFlightRecordsDesc")}</p>
            <button onClick={() => setShowAdd(true)} className="text-sky-600 hover:underline mt-3 text-sm">+ {t("addFlightRecord")}</button>
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

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <p className="text-[10px] opacity-60 uppercase tracking-wider mb-0.5">Flights</p>
                    <p className="text-3xl sm:text-4xl font-bold">{stats.totalFlights}</p>
                    {stats.longHaul > 0 && (
                      <p className="text-[10px] opacity-60 mt-0.5">{stats.longHaul} Long Haul</p>
                    )}
                  </div>
                  <div>
                    <p className="text-[10px] opacity-60 uppercase tracking-wider mb-0.5">Distance</p>
                    <p className="text-xl sm:text-3xl font-bold break-all">{stats.totalDistKm.toLocaleString()} km</p>
                    {stats.earthWraps > 0 && (
                      <p className="text-[10px] opacity-60 mt-0.5">{stats.earthWraps.toFixed(1)}× around the world</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-4 border-t border-white/20">
                  <div>
                    <p className="text-[10px] opacity-60 uppercase tracking-wider mb-0.5">Flight Time</p>
                    <p className="text-sm sm:text-lg font-bold">{formatHours(stats.totalHours)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] opacity-60 uppercase tracking-wider mb-0.5">Airports</p>
                    <p className="text-sm sm:text-lg font-bold">{stats.airports}</p>
                  </div>
                  <div>
                    <p className="text-[10px] opacity-60 uppercase tracking-wider mb-0.5">Airlines</p>
                    <p className="text-sm sm:text-lg font-bold">{stats.airlines}</p>
                  </div>
                </div>
              </div>

              {/* World Map with flight routes and visited countries */}
              <div className="bg-indigo-950 px-4 pb-4 pt-2">
                <p className="text-xs text-white/50 uppercase tracking-wider mb-2">Flight Map</p>
                <div style={{ minHeight: 220 }}>
                  <WorldMap
                    visitedCountries={mapCountries}
                    flightRoutes={flightRoutes}
                    className="w-full rounded-xl overflow-hidden"
                  />
                </div>
              </div>
            </div>

            {/* Flight List */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-foreground">{t("flightRecordsTitle")}</h3>
                <p className="text-sm text-muted-foreground">{stats.totalFlights} {t("flightsCount")}</p>
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
                                {flight.seatClass === "economy" ? t("seatEconomy") : flight.seatClass === "business" ? t("seatBusiness") : flight.seatClass === "first" ? t("seatFirst") : flight.seatClass}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all shrink-0">
                          <button
                            onClick={() => openEditFlight(flight)}
                            className="p-1.5 rounded-lg hover:bg-accent transition-colors"
                          >
                            <Edit2 className="w-4 h-4 text-muted-foreground" />
                          </button>
                          <button
                            onClick={() => deleteFlight.mutate({ flightId: flight.id })}
                            className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors"
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Edit Flight Dialog */}
      <Dialog open={!!editingFlight} onOpenChange={(o) => !o && setEditingFlight(null)}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("editFlightRecord")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground">{t("departureAirport")} * (IATA)</label>
                <Input className="mt-1.5 uppercase" placeholder="e.g. HKG" value={form.departureAirport} onChange={e => handleAirportChange("departureAirport", e.target.value.toUpperCase())} maxLength={3} />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">{t("arrivalAirport")} * (IATA)</label>
                <Input className="mt-1.5 uppercase" placeholder="e.g. NRT" value={form.arrivalAirport} onChange={e => handleAirportChange("arrivalAirport", e.target.value.toUpperCase())} maxLength={3} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground">{t("flightNumber")}</label>
                <Input className="mt-1.5" placeholder="e.g. CX 543" value={form.flightNumber} onChange={e => setForm({ ...form, flightNumber: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">{t("airline")}</label>
                <Input className="mt-1.5" placeholder="e.g. Cathay Pacific" value={form.airline} onChange={e => setForm({ ...form, airline: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground">{t("departureDate")}</label>
                <Input className="mt-1.5" type="date" value={form.departureDate} onChange={e => setForm({ ...form, departureDate: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">{t("seatClass")}</label>
                <Select value={form.seatClass} onValueChange={v => setForm({ ...form, seatClass: v })}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="economy">{t("seatEconomyFull")}</SelectItem>
                    <SelectItem value="premium_economy">{t("seatPremiumEconomy")}</SelectItem>
                    <SelectItem value="business">{t("seatBusinessFull")}</SelectItem>
                    <SelectItem value="first">{t("seatFirstFull")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground">{t("distanceKm")}</label>
                <Input className="mt-1.5" type="number" placeholder={t("autoEstimate")} value={form.distanceKm} onChange={e => setForm({ ...form, distanceKm: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">{t("durationMinutes")}</label>
                <Input className="mt-1.5" type="number" placeholder="e.g. 165" value={form.durationMinutes} onChange={e => setForm({ ...form, durationMinutes: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">{t("notes")}</label>
              <Input className="mt-1.5" placeholder={t("optional")} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
            <Button className="w-full bg-sky-600 hover:bg-sky-700" onClick={handleUpdate} disabled={updateFlight.isPending}>
              {updateFlight.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {t("saveChanges")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Flight Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("addFlightRecord")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground">{t("departureAirport")} * (IATA)</label>
                <Input
                  className="mt-1.5 uppercase"
                  placeholder="e.g. HKG"
                  value={form.departureAirport}
                  onChange={e => handleAirportChange("departureAirport", e.target.value.toUpperCase())}
                  maxLength={3}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">{t("arrivalAirport")} * (IATA)</label>
                <Input
                  className="mt-1.5 uppercase"
                  placeholder="e.g. NRT"
                  value={form.arrivalAirport}
                  onChange={e => handleAirportChange("arrivalAirport", e.target.value.toUpperCase())}
                  maxLength={3}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground">{t("flightNumber")}</label>
                <Input className="mt-1.5" placeholder="e.g. CX 543" value={form.flightNumber} onChange={e => setForm({ ...form, flightNumber: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">{t("airline")}</label>
                <Input className="mt-1.5" placeholder="e.g. Cathay Pacific" value={form.airline} onChange={e => setForm({ ...form, airline: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground">{t("departureDate")}</label>
                <Input className="mt-1.5" type="date" value={form.departureDate} onChange={e => setForm({ ...form, departureDate: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">{t("seatClass")}</label>
                <Select value={form.seatClass} onValueChange={v => setForm({ ...form, seatClass: v })}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="economy">{t("seatEconomyFull")}</SelectItem>
                    <SelectItem value="premium_economy">{t("seatPremiumEconomy")}</SelectItem>
                    <SelectItem value="business">{t("seatBusinessFull")}</SelectItem>
                    <SelectItem value="first">{t("seatFirstFull")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground">{t("distanceKm")}</label>
                <Input
                  className="mt-1.5"
                  type="number"
                  placeholder={t("autoEstimate")}
                  value={form.distanceKm}
                  onChange={e => setForm({ ...form, distanceKm: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">{t("durationMinutes")}</label>
                <Input
                  className="mt-1.5"
                  type="number"
                  placeholder="e.g. 165"
                  value={form.durationMinutes}
                  onChange={e => setForm({ ...form, durationMinutes: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">{t("notes")}</label>
              <Input className="mt-1.5" placeholder={t("optional")} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
            <Button className="w-full bg-sky-600 hover:bg-sky-700" onClick={handleAdd} disabled={addFlight.isPending}>
              {addFlight.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {t("addFlightRecord")}
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
  const { lang } = useI18n();
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
        {lang === "zh" ? "航班路線圖" : "Flight Route Map"}
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
