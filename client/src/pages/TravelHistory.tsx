import { trpc } from "@/lib/trpc";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Globe, Plus, Trash2, Loader2, MapPin, CheckCircle, Heart, Calendar, Edit2, Search, X } from "lucide-react";
import WorldMap from "@/components/WorldMap";
import { MapView, type LeafletMap } from "@/components/Map";
import L from "leaflet";
import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { toast } from "sonner";

// Comprehensive list of countries with ISO codes and regions
const COUNTRIES = [
  { code: "AF", name: "Afghanistan", region: "Asia" },
  { code: "AL", name: "Albania", region: "Europe" },
  { code: "DZ", name: "Algeria", region: "Africa" },
  { code: "AD", name: "Andorra", region: "Europe" },
  { code: "AO", name: "Angola", region: "Africa" },
  { code: "AR", name: "Argentina", region: "South America" },
  { code: "AM", name: "Armenia", region: "Asia" },
  { code: "AU", name: "Australia", region: "Oceania" },
  { code: "AT", name: "Austria", region: "Europe" },
  { code: "AZ", name: "Azerbaijan", region: "Asia" },
  { code: "BS", name: "Bahamas", region: "North America" },
  { code: "BH", name: "Bahrain", region: "Asia" },
  { code: "BD", name: "Bangladesh", region: "Asia" },
  { code: "BY", name: "Belarus", region: "Europe" },
  { code: "BE", name: "Belgium", region: "Europe" },
  { code: "BZ", name: "Belize", region: "North America" },
  { code: "BJ", name: "Benin", region: "Africa" },
  { code: "BT", name: "Bhutan", region: "Asia" },
  { code: "BO", name: "Bolivia", region: "South America" },
  { code: "BA", name: "Bosnia and Herzegovina", region: "Europe" },
  { code: "BW", name: "Botswana", region: "Africa" },
  { code: "BR", name: "Brazil", region: "South America" },
  { code: "BN", name: "Brunei", region: "Asia" },
  { code: "BG", name: "Bulgaria", region: "Europe" },
  { code: "BF", name: "Burkina Faso", region: "Africa" },
  { code: "BI", name: "Burundi", region: "Africa" },
  { code: "KH", name: "Cambodia", region: "Asia" },
  { code: "CM", name: "Cameroon", region: "Africa" },
  { code: "CA", name: "Canada", region: "North America" },
  { code: "CV", name: "Cape Verde", region: "Africa" },
  { code: "CF", name: "Central African Republic", region: "Africa" },
  { code: "TD", name: "Chad", region: "Africa" },
  { code: "CL", name: "Chile", region: "South America" },
  { code: "CN", name: "China", region: "Asia" },
  { code: "CO", name: "Colombia", region: "South America" },
  { code: "KM", name: "Comoros", region: "Africa" },
  { code: "CG", name: "Congo", region: "Africa" },
  { code: "CR", name: "Costa Rica", region: "North America" },
  { code: "HR", name: "Croatia", region: "Europe" },
  { code: "CU", name: "Cuba", region: "North America" },
  { code: "CY", name: "Cyprus", region: "Europe" },
  { code: "CZ", name: "Czech Republic", region: "Europe" },
  { code: "DK", name: "Denmark", region: "Europe" },
  { code: "DJ", name: "Djibouti", region: "Africa" },
  { code: "DO", name: "Dominican Republic", region: "North America" },
  { code: "EC", name: "Ecuador", region: "South America" },
  { code: "EG", name: "Egypt", region: "Africa" },
  { code: "SV", name: "El Salvador", region: "North America" },
  { code: "GQ", name: "Equatorial Guinea", region: "Africa" },
  { code: "ER", name: "Eritrea", region: "Africa" },
  { code: "EE", name: "Estonia", region: "Europe" },
  { code: "ET", name: "Ethiopia", region: "Africa" },
  { code: "FJ", name: "Fiji", region: "Oceania" },
  { code: "FI", name: "Finland", region: "Europe" },
  { code: "FR", name: "France", region: "Europe" },
  { code: "GA", name: "Gabon", region: "Africa" },
  { code: "GM", name: "Gambia", region: "Africa" },
  { code: "GE", name: "Georgia", region: "Asia" },
  { code: "DE", name: "Germany", region: "Europe" },
  { code: "GH", name: "Ghana", region: "Africa" },
  { code: "GR", name: "Greece", region: "Europe" },
  { code: "GT", name: "Guatemala", region: "North America" },
  { code: "GN", name: "Guinea", region: "Africa" },
  { code: "GW", name: "Guinea-Bissau", region: "Africa" },
  { code: "GY", name: "Guyana", region: "South America" },
  { code: "HT", name: "Haiti", region: "North America" },
  { code: "HN", name: "Honduras", region: "North America" },
  { code: "HK", name: "Hong Kong", region: "Asia" },
  { code: "HU", name: "Hungary", region: "Europe" },
  { code: "IS", name: "Iceland", region: "Europe" },
  { code: "IN", name: "India", region: "Asia" },
  { code: "ID", name: "Indonesia", region: "Asia" },
  { code: "IR", name: "Iran", region: "Asia" },
  { code: "IQ", name: "Iraq", region: "Asia" },
  { code: "IE", name: "Ireland", region: "Europe" },
  { code: "IL", name: "Israel", region: "Asia" },
  { code: "IT", name: "Italy", region: "Europe" },
  { code: "JM", name: "Jamaica", region: "North America" },
  { code: "JP", name: "Japan", region: "Asia" },
  { code: "JO", name: "Jordan", region: "Asia" },
  { code: "KZ", name: "Kazakhstan", region: "Asia" },
  { code: "KE", name: "Kenya", region: "Africa" },
  { code: "KW", name: "Kuwait", region: "Asia" },
  { code: "KG", name: "Kyrgyzstan", region: "Asia" },
  { code: "LA", name: "Laos", region: "Asia" },
  { code: "LV", name: "Latvia", region: "Europe" },
  { code: "LB", name: "Lebanon", region: "Asia" },
  { code: "LS", name: "Lesotho", region: "Africa" },
  { code: "LR", name: "Liberia", region: "Africa" },
  { code: "LY", name: "Libya", region: "Africa" },
  { code: "LI", name: "Liechtenstein", region: "Europe" },
  { code: "LT", name: "Lithuania", region: "Europe" },
  { code: "LU", name: "Luxembourg", region: "Europe" },
  { code: "MO", name: "Macau", region: "Asia" },
  { code: "MK", name: "North Macedonia", region: "Europe" },
  { code: "MG", name: "Madagascar", region: "Africa" },
  { code: "MW", name: "Malawi", region: "Africa" },
  { code: "MY", name: "Malaysia", region: "Asia" },
  { code: "MV", name: "Maldives", region: "Asia" },
  { code: "ML", name: "Mali", region: "Africa" },
  { code: "MT", name: "Malta", region: "Europe" },
  { code: "MR", name: "Mauritania", region: "Africa" },
  { code: "MU", name: "Mauritius", region: "Africa" },
  { code: "MX", name: "Mexico", region: "North America" },
  { code: "MD", name: "Moldova", region: "Europe" },
  { code: "MC", name: "Monaco", region: "Europe" },
  { code: "MN", name: "Mongolia", region: "Asia" },
  { code: "ME", name: "Montenegro", region: "Europe" },
  { code: "MA", name: "Morocco", region: "Africa" },
  { code: "MZ", name: "Mozambique", region: "Africa" },
  { code: "MM", name: "Myanmar", region: "Asia" },
  { code: "NA", name: "Namibia", region: "Africa" },
  { code: "NP", name: "Nepal", region: "Asia" },
  { code: "NL", name: "Netherlands", region: "Europe" },
  { code: "NZ", name: "New Zealand", region: "Oceania" },
  { code: "NI", name: "Nicaragua", region: "North America" },
  { code: "NE", name: "Niger", region: "Africa" },
  { code: "NG", name: "Nigeria", region: "Africa" },
  { code: "NO", name: "Norway", region: "Europe" },
  { code: "OM", name: "Oman", region: "Asia" },
  { code: "PK", name: "Pakistan", region: "Asia" },
  { code: "PA", name: "Panama", region: "North America" },
  { code: "PG", name: "Papua New Guinea", region: "Oceania" },
  { code: "PY", name: "Paraguay", region: "South America" },
  { code: "PE", name: "Peru", region: "South America" },
  { code: "PH", name: "Philippines", region: "Asia" },
  { code: "PL", name: "Poland", region: "Europe" },
  { code: "PT", name: "Portugal", region: "Europe" },
  { code: "QA", name: "Qatar", region: "Asia" },
  { code: "RO", name: "Romania", region: "Europe" },
  { code: "RU", name: "Russia", region: "Europe" },
  { code: "RW", name: "Rwanda", region: "Africa" },
  { code: "SA", name: "Saudi Arabia", region: "Asia" },
  { code: "SN", name: "Senegal", region: "Africa" },
  { code: "RS", name: "Serbia", region: "Europe" },
  { code: "SL", name: "Sierra Leone", region: "Africa" },
  { code: "SG", name: "Singapore", region: "Asia" },
  { code: "SK", name: "Slovakia", region: "Europe" },
  { code: "SI", name: "Slovenia", region: "Europe" },
  { code: "SO", name: "Somalia", region: "Africa" },
  { code: "ZA", name: "South Africa", region: "Africa" },
  { code: "KR", name: "South Korea", region: "Asia" },
  { code: "SS", name: "South Sudan", region: "Africa" },
  { code: "ES", name: "Spain", region: "Europe" },
  { code: "LK", name: "Sri Lanka", region: "Asia" },
  { code: "SD", name: "Sudan", region: "Africa" },
  { code: "SR", name: "Suriname", region: "South America" },
  { code: "SZ", name: "Eswatini", region: "Africa" },
  { code: "SE", name: "Sweden", region: "Europe" },
  { code: "CH", name: "Switzerland", region: "Europe" },
  { code: "SY", name: "Syria", region: "Asia" },
  { code: "TW", name: "Taiwan", region: "Asia" },
  { code: "TJ", name: "Tajikistan", region: "Asia" },
  { code: "TZ", name: "Tanzania", region: "Africa" },
  { code: "TH", name: "Thailand", region: "Asia" },
  { code: "TL", name: "Timor-Leste", region: "Asia" },
  { code: "TG", name: "Togo", region: "Africa" },
  { code: "TT", name: "Trinidad and Tobago", region: "North America" },
  { code: "TN", name: "Tunisia", region: "Africa" },
  { code: "TR", name: "Turkey", region: "Asia" },
  { code: "TM", name: "Turkmenistan", region: "Asia" },
  { code: "UG", name: "Uganda", region: "Africa" },
  { code: "UA", name: "Ukraine", region: "Europe" },
  { code: "AE", name: "United Arab Emirates", region: "Asia" },
  { code: "GB", name: "United Kingdom", region: "Europe" },
  { code: "US", name: "United States", region: "North America" },
  { code: "UY", name: "Uruguay", region: "South America" },
  { code: "UZ", name: "Uzbekistan", region: "Asia" },
  { code: "VE", name: "Venezuela", region: "South America" },
  { code: "VN", name: "Vietnam", region: "Asia" },
  { code: "YE", name: "Yemen", region: "Asia" },
  { code: "ZM", name: "Zambia", region: "Africa" },
  { code: "ZW", name: "Zimbabwe", region: "Africa" },
];

const STATUS_CONFIG = {
  visited: { label: "已到訪", color: "bg-emerald-500", mapColor: "#10b981", icon: CheckCircle },
  planned: { label: "計劃中", color: "bg-blue-500", mapColor: "#3b82f6", icon: Calendar },
  wishlist: { label: "心願清單", color: "bg-amber-500", mapColor: "#f59e0b", icon: Heart },
};

const REGIONS = ["全部", "Asia", "Europe", "Africa", "North America", "South America", "Oceania"];

const TOTAL_COUNTRIES = 195;

// Country code → approximate center coordinates for map zoom
const COUNTRY_CENTERS: Record<string, { lat: number; lng: number; zoom: number }> = {
  JP: { lat: 36.2, lng: 138.3, zoom: 5 }, TW: { lat: 23.7, lng: 121.0, zoom: 7 },
  KR: { lat: 36.5, lng: 127.8, zoom: 6 }, TH: { lat: 13.0, lng: 101.0, zoom: 6 },
  SG: { lat: 1.35, lng: 103.82, zoom: 11 }, MY: { lat: 4.2, lng: 108.0, zoom: 5 },
  ID: { lat: -2.5, lng: 118.0, zoom: 4 }, VN: { lat: 16.0, lng: 107.8, zoom: 5 },
  PH: { lat: 12.9, lng: 122.0, zoom: 5 }, KH: { lat: 12.6, lng: 104.9, zoom: 7 },
  CN: { lat: 35.9, lng: 104.2, zoom: 4 }, EG: { lat: 26.8, lng: 30.8, zoom: 6 },
  GB: { lat: 55.4, lng: -3.4, zoom: 5 }, FR: { lat: 46.2, lng: 2.2, zoom: 5 },
  DE: { lat: 51.2, lng: 10.5, zoom: 5 }, IT: { lat: 41.9, lng: 12.6, zoom: 5 },
  ES: { lat: 40.5, lng: -3.7, zoom: 5 }, US: { lat: 37.1, lng: -95.7, zoom: 4 },
  CA: { lat: 56.1, lng: -106.3, zoom: 3 }, AU: { lat: -25.3, lng: 133.8, zoom: 4 },
  NZ: { lat: -41.3, lng: 172.5, zoom: 5 }, AE: { lat: 24.0, lng: 54.0, zoom: 7 },
  GR: { lat: 39.1, lng: 22.0, zoom: 6 }, PT: { lat: 39.6, lng: -8.0, zoom: 6 },
  NL: { lat: 52.3, lng: 5.3, zoom: 7 }, CH: { lat: 46.8, lng: 8.2, zoom: 7 },
  AT: { lat: 47.5, lng: 14.6, zoom: 7 }, CZ: { lat: 49.8, lng: 15.5, zoom: 7 },
  HU: { lat: 47.2, lng: 19.5, zoom: 7 }, PL: { lat: 51.9, lng: 19.1, zoom: 6 },
  IN: { lat: 20.6, lng: 78.9, zoom: 4 }, MV: { lat: 3.2, lng: 73.2, zoom: 7 },
  LK: { lat: 7.9, lng: 80.8, zoom: 7 }, NP: { lat: 28.4, lng: 84.1, zoom: 7 },
  MA: { lat: 31.8, lng: -7.1, zoom: 6 }, TR: { lat: 39.1, lng: 35.2, zoom: 5 },
  RU: { lat: 61.5, lng: 105.3, zoom: 3 }, BR: { lat: -14.2, lng: -51.9, zoom: 4 },
  AR: { lat: -38.4, lng: -63.6, zoom: 4 }, MX: { lat: 23.6, lng: -102.6, zoom: 5 },
  HK: { lat: 22.35, lng: 114.13, zoom: 10 }, MO: { lat: 22.2, lng: 113.55, zoom: 12 },
};

export default function TravelHistory() {
  const { data: countries, refetch, isLoading } = trpc.travelHistory.getCountries.useQuery();
  const upsertCountry = trpc.travelHistory.upsertCountry.useMutation({ onSuccess: () => { refetch(); setShowAdd(false); toast.success("已新增"); } });
  const removeCountry = trpc.travelHistory.removeCountry.useMutation({ onSuccess: () => { refetch(); toast.success("已移除"); } });
  const updateStatus = trpc.travelHistory.upsertCountry.useMutation({ onSuccess: () => { refetch(); toast.success("已更新"); } });

  const [showAdd, setShowAdd] = useState(false);
  const [editingCountry, setEditingCountry] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ status: "visited" as "visited" | "planned" | "wishlist", visitedYear: "", notes: "" });
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "visited" | "planned" | "wishlist">("all");
  const [filterRegion, setFilterRegion] = useState("全部");
  const [addForm, setAddForm] = useState({ countryCode: "", countryName: "", status: "visited" as "visited" | "planned" | "wishlist", visitedYear: "" });
  const [activeTab, setActiveTab] = useState<"map" | "list">("map");

  // Country detail sheet state
  const [detailCountry, setDetailCountry] = useState<{ code: string; name: string } | null>(null);
  const [placeSearch, setPlaceSearch] = useState("");
  const [placeSuggestions, setPlaceSuggestions] = useState<Array<{ placeId: string; description: string; lat?: number; lng?: number }>>([]);
  const [savedPlaces, setSavedPlaces] = useState<Array<{ name: string; lat: number; lng: number }>>([]);
  const detailMapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const countryMap = useMemo(() => {
    const m: Record<string, { status: string; visitedYear?: number | null }> = {};
    countries?.forEach(c => { m[c.countryCode] = { status: c.status, visitedYear: c.visitedAt ? new Date(c.visitedAt).getFullYear() : null }; });
    return m;
  }, [countries]);

  const visitedCount = countries?.filter(c => c.status === "visited").length ?? 0;
  const plannedCount = countries?.filter(c => c.status === "planned").length ?? 0;
  const wishlistCount = countries?.filter(c => c.status === "wishlist").length ?? 0;
  const visitedPct = TOTAL_COUNTRIES > 0 ? ((visitedCount / TOTAL_COUNTRIES) * 100).toFixed(1) : "0.0";

  const filteredCountries = useMemo(() => {
    return (countries ?? []).filter(c => {
      const matchStatus = filterStatus === "all" || c.status === filterStatus;
      const country = COUNTRIES.find(x => x.code === c.countryCode);
      const matchRegion = filterRegion === "全部" || country?.region === filterRegion;
      const matchSearch = !search || c.countryName.toLowerCase().includes(search.toLowerCase());
      return matchStatus && matchRegion && matchSearch;
    });
  }, [countries, filterStatus, filterRegion, search]);

  const availableToAdd = COUNTRIES.filter(c => !countryMap[c.code]);

  const openEditCountry = (c: any) => {
    setEditingCountry(c);
    setEditForm({
      status: c.status,
      visitedYear: c.visitedAt ? String(new Date(c.visitedAt as Date).getFullYear()) : "",
      notes: c.notes ?? "",
    });
  };

  const handleEditCountry = () => {
    if (!editingCountry) return;
    updateStatus.mutate({
      countryCode: editingCountry.countryCode,
      countryName: editingCountry.countryName,
      status: editForm.status,
      visitedAt: editForm.visitedYear ? `${editForm.visitedYear}-01-01` : undefined,
      notes: editForm.notes || undefined,
    }, { onSuccess: () => { setEditingCountry(null); refetch(); toast.success("已更新"); } });
  };

  const handleAdd = () => {
    if (!addForm.countryCode) { toast.error("請選擇國家"); return; }
    const country = COUNTRIES.find(c => c.code === addForm.countryCode);
    upsertCountry.mutate({
      countryCode: addForm.countryCode,
      countryName: country?.name ?? addForm.countryCode,
      status: addForm.status,
      visitedAt: addForm.visitedYear ? `${addForm.visitedYear}-01-01` : undefined,
    });
  };

  // Open country detail sheet
  const openDetail = (code: string, name: string) => {
    setDetailCountry({ code, name });
    setPlaceSearch("");
    setPlaceSuggestions([]);
    setSavedPlaces([]);
  };

  // Initialize detail map and zoom to country
  const handleDetailMapReady = useCallback((map: LeafletMap) => {
    detailMapRef.current = map;
    if (detailCountry) {
      const center = COUNTRY_CENTERS[detailCountry.code];
      if (center) {
        map.setView([center.lat, center.lng], center.zoom);
      }
    }
  }, [detailCountry]);

  // Place search using Nominatim (OpenStreetMap)
  useEffect(() => {
    if (!placeSearch.trim()) {
      setPlaceSuggestions([]);
      return;
    }
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      const countryCode = detailCountry?.code?.toLowerCase() ?? "";
      fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(placeSearch)}&countrycodes=${countryCode}&format=json&limit=5&accept-language=zh-TW,en`)
        .then(r => r.json())
        .then((results: any[]) => {
          setPlaceSuggestions(results.map((r: any) => ({ placeId: String(r.place_id), description: r.display_name, lat: parseFloat(r.lat), lng: parseFloat(r.lon) })));
        })
        .catch(() => setPlaceSuggestions([]));
    }, 400);
  }, [placeSearch, detailCountry]);

  // Select a place from suggestions → add Leaflet marker
  const selectPlace = useCallback((suggestion: { placeId: string; description: string; lat?: number; lng?: number }) => {
    setPlaceSearch("");
    setPlaceSuggestions([]);
    if (!detailMapRef.current || suggestion.lat === undefined || suggestion.lng === undefined) return;
    const lat = suggestion.lat;
    const lng = suggestion.lng;
    detailMapRef.current.panTo([lat, lng]);
    detailMapRef.current.setZoom(14);
    const marker = L.marker([lat, lng])
      .addTo(detailMapRef.current)
      .bindPopup(suggestion.description)
      .openPopup();
    markersRef.current.push(marker);
    setSavedPlaces(prev => [...prev, { name: suggestion.description, lat, lng }]);
  }, []);

  // Clear markers when detail sheet closes
  const closeDetail = () => {
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    setDetailCountry(null);
  };

  return (
    <AppLayout>
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border px-4 sm:px-6 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0">
              <Globe className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-foreground text-lg leading-tight">旅遊足跡</h1>
              <p className="text-muted-foreground text-xs">{visitedCount} / {TOTAL_COUNTRIES} 個國家 · {visitedPct}%</p>
            </div>
          </div>
          <Button onClick={() => setShowAdd(true)} size="sm" className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 shrink-0">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">新增</span>
          </Button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 pb-24 sm:pb-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
          {(Object.entries(STATUS_CONFIG) as [string, typeof STATUS_CONFIG["visited"]][]).map(([key, cfg]) => {
            const count = key === "visited" ? visitedCount : key === "planned" ? plannedCount : wishlistCount;
            const Icon = cfg.icon;
            const pct = TOTAL_COUNTRIES > 0 ? ((count / TOTAL_COUNTRIES) * 100).toFixed(0) : "0";
            return (
              <button
                key={key}
                onClick={() => setFilterStatus(filterStatus === key ? "all" : key as any)}
                className={`bg-card rounded-2xl border p-3 sm:p-4 text-left transition-all ${filterStatus === key ? "border-indigo-300 shadow-md" : "border-border hover:border-indigo-200"}`}
              >
                <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full ${cfg.color} flex items-center justify-center mb-1.5`}>
                  <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                </div>
                <p className="text-xl sm:text-2xl font-bold text-foreground">{count}</p>
                <p className="text-xs text-muted-foreground leading-tight">{cfg.label}</p>
                {key === "visited" && <p className="text-xs text-indigo-500 font-medium mt-0.5">{pct}%</p>}
              </button>
            );
          })}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={v => setActiveTab(v as any)} className="mb-4">
          <TabsList>
            <TabsTrigger value="map" className="gap-2"><Globe className="w-4 h-4" />地圖</TabsTrigger>
            <TabsTrigger value="list" className="gap-2"><MapPin className="w-4 h-4" />清單</TabsTrigger>
          </TabsList>
        </Tabs>

        {activeTab === "map" ? (
          /* World Map View */
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <div className="p-3 sm:p-4 border-b border-border flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-foreground">世界地圖</p>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-muted-foreground">
                {(Object.entries(STATUS_CONFIG) as [string, typeof STATUS_CONFIG["visited"]][]).map(([key, cfg]) => (
                  <div key={key} className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cfg.mapColor }} />
                    <span>{cfg.label}</span>
                  </div>
                ))}
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full bg-muted-foreground/20" />
                  <span>未到訪</span>
                </div>
              </div>
            </div>
            <WorldMap
              visitedCountries={(countries ?? []).map(c => ({ countryCode: c.countryCode, status: c.status as "visited" | "planned" | "wishlist" }))}
              onCountryClick={(code, name) => {
                if (countryMap[code]) {
                  // Already visited → open detail map
                  openDetail(code, name);
                } else {
                  // Not yet added → open add dialog pre-filled
                  setAddForm({ countryCode: code, countryName: name, status: "visited", visitedYear: "" });
                  setShowAdd(true);
                }
              }}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground text-center py-2">點擊已到訪國家查看詳細地圖 · 點擊未到訪國家快速新增</p>
          </div>
        ) : (
          /* List View */
          <div>
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-4">
              <Input
                placeholder="搜尋國家..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="flex-1"
              />
              <Select value={filterRegion} onValueChange={setFilterRegion}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REGIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
            ) : filteredCountries.length === 0 ? (
              <div className="text-center py-20">
                <Globe className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">還沒有記錄</p>
                <button onClick={() => setShowAdd(true)} className="text-indigo-600 hover:underline mt-2 text-sm">+ 新增第一個國家</button>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredCountries.map(c => {
                  const cfg = STATUS_CONFIG[c.status as keyof typeof STATUS_CONFIG];
                  const Icon = cfg?.icon ?? CheckCircle;
                  const country = COUNTRIES.find(x => x.code === c.countryCode);
                  return (
                    <div key={c.id} className="bg-card rounded-xl border border-border p-3 flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full ${cfg?.color ?? "bg-muted"} flex items-center justify-center shrink-0`}>
                        <Icon className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-foreground text-sm truncate">{c.countryName}</p>
                          {c.visitedAt && <span className="text-xs text-muted-foreground shrink-0">{new Date(c.visitedAt as Date).getFullYear()}</span>}
                        </div>
                        <p className="text-xs text-muted-foreground">{country?.region ?? ""}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {/* Detail map button */}
                        <button
                          onClick={() => openDetail(c.countryCode, c.countryName)}
                          className="p-1.5 rounded-lg hover:bg-accent transition-colors"
                          title="查看詳細地圖"
                        >
                          <MapPin className="w-3.5 h-3.5 text-indigo-500" />
                        </button>
                        <button
                          onClick={() => openEditCountry(c)}
                          className="p-1.5 rounded-lg hover:bg-accent transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                        <button
                          onClick={() => removeCountry.mutate({ countryCode: c.countryCode })}
                          className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors"
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
        )}
      </div>

      {/* Country Detail Sheet */}
      <Sheet open={!!detailCountry} onOpenChange={o => !o && closeDetail()}>
        <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col">
          <SheetHeader className="px-4 pt-4 pb-3 border-b border-border shrink-0">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-lg font-bold">{detailCountry?.name}</SheetTitle>
              <button onClick={closeDetail} className="p-1.5 rounded-lg hover:bg-accent transition-colors">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            {/* Bilingual place search */}
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                className="pl-9 pr-4"
                placeholder="搜尋地點（中文或英文）..."
                value={placeSearch}
                onChange={e => setPlaceSearch(e.target.value)}
              />
              {placeSearch && (
                <button
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  onClick={() => { setPlaceSearch(""); setPlaceSuggestions([]); }}
                >
                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              )}
              {/* Autocomplete dropdown */}
              {placeSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-50 bg-popover border border-border rounded-xl shadow-lg mt-1 overflow-hidden">
                  {placeSuggestions.map(s => (
                    <button
                      key={s.placeId}
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-accent transition-colors flex items-center gap-2"
                      onClick={() => selectPlace(s)}
                    >
                      <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate">{s.description}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </SheetHeader>

          {/* Map */}
          <div className="flex-1 min-h-0 relative">
            {detailCountry && (
              <MapView
                key={detailCountry.code}
                className="w-full h-full"
                initialCenter={COUNTRY_CENTERS[detailCountry.code] ? { lat: COUNTRY_CENTERS[detailCountry.code].lat, lng: COUNTRY_CENTERS[detailCountry.code].lng } : { lat: 0, lng: 0 }}
                initialZoom={COUNTRY_CENTERS[detailCountry.code]?.zoom ?? 5}
                onMapReady={handleDetailMapReady}
              />
            )}
          </div>

          {/* Saved places list */}
          {savedPlaces.length > 0 && (
            <div className="shrink-0 border-t border-border px-4 py-3 max-h-40 overflow-y-auto">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">已標記地點</p>
              <div className="space-y-1.5">
                {savedPlaces.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <MapPin className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                    <span className="truncate text-foreground">{p.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Edit Country Dialog */}
      <Dialog open={!!editingCountry} onOpenChange={(o) => !o && setEditingCountry(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>修改 {editingCountry?.countryName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-sm font-medium text-foreground">狀態</label>
              <Select value={editForm.status} onValueChange={v => setEditForm({ ...editForm, status: v as any })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">到訪年份（選填）</label>
              <Input className="mt-1.5" type="number" placeholder="例：2024" value={editForm.visitedYear} onChange={e => setEditForm({ ...editForm, visitedYear: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">備注（選填）</label>
              <Input className="mt-1.5" placeholder="備注..." value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} />
            </div>
            <Button className="w-full bg-indigo-600 hover:bg-indigo-700" onClick={handleEditCountry} disabled={updateStatus.isPending}>
              {updateStatus.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              儲存變更
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Country Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新增國家</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-sm font-medium text-foreground">國家 *</label>
              <Select value={addForm.countryCode} onValueChange={v => setAddForm({ ...addForm, countryCode: v })}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="選擇國家" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {availableToAdd.map(c => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.name} ({c.region})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">狀態</label>
              <Select value={addForm.status} onValueChange={v => setAddForm({ ...addForm, status: v as any })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {addForm.status === "visited" && (
              <div>
                <label className="text-sm font-medium text-foreground">到訪年份（選填）</label>
                <Input
                  className="mt-1.5"
                  type="number"
                  placeholder="例：2024"
                  value={addForm.visitedYear}
                  onChange={e => setAddForm({ ...addForm, visitedYear: e.target.value })}
                />
              </div>
            )}
            <Button className="w-full bg-indigo-600 hover:bg-indigo-700" onClick={handleAdd} disabled={upsertCountry.isPending}>
              {upsertCountry.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              新增
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </AppLayout>
  );
}
