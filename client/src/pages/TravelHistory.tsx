import { trpc } from "@/lib/trpc";
import AppLayout from "@/components/AppLayout";
import { useI18n } from "@/hooks/useI18n";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Globe,
  Plus,
  Trash2,
  Loader2,
  MapPin,
  CheckCircle,
  Heart,
  Calendar,
  Edit2,
  Search,
  X,
  ArrowUpRight,
  Compass,
  Link2,
  RotateCcw,
} from "lucide-react";
import WorldMap from "@/components/WorldMap";
import { MapView, type LeafletMap } from "@/components/Map";
import L from "leaflet";
import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { Link } from "wouter";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  filterHistoryCountries,
  historyDateInput,
  historyVisitYear,
  resolveHistoryVisitDate,
  summarizeHistory,
  uniqueHistoryCountries,
  type HistoryStatus,
} from "@/lib/historyInsights";

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

const STATUS_CONFIG_BASE = {
  visited: { color: "bg-primary", mapColor: "#22c55e", icon: CheckCircle },
  planned: { color: "bg-blue-500", mapColor: "#3b82f6", icon: Calendar },
  wishlist: { color: "bg-amber-500", mapColor: "#f59e0b", icon: Heart },
};

const REGIONS_BASE = [
  "Asia",
  "Europe",
  "Africa",
  "North America",
  "South America",
  "Oceania",
];

const REGION_ZH: Record<string, string> = {
  Asia: "亞洲",
  Europe: "歐洲",
  Africa: "非洲",
  "North America": "北美洲",
  "South America": "南美洲",
  Oceania: "大洋洲",
};

// Country code → approximate center coordinates for map zoom
const COUNTRY_CENTERS: Record<
  string,
  { lat: number; lng: number; zoom: number }
> = {
  JP: { lat: 36.2, lng: 138.3, zoom: 5 },
  TW: { lat: 23.7, lng: 121.0, zoom: 7 },
  KR: { lat: 36.5, lng: 127.8, zoom: 6 },
  TH: { lat: 13.0, lng: 101.0, zoom: 6 },
  SG: { lat: 1.35, lng: 103.82, zoom: 11 },
  MY: { lat: 4.2, lng: 108.0, zoom: 5 },
  ID: { lat: -2.5, lng: 118.0, zoom: 4 },
  VN: { lat: 16.0, lng: 107.8, zoom: 5 },
  PH: { lat: 12.9, lng: 122.0, zoom: 5 },
  KH: { lat: 12.6, lng: 104.9, zoom: 7 },
  CN: { lat: 35.9, lng: 104.2, zoom: 4 },
  EG: { lat: 26.8, lng: 30.8, zoom: 6 },
  GB: { lat: 55.4, lng: -3.4, zoom: 5 },
  FR: { lat: 46.2, lng: 2.2, zoom: 5 },
  DE: { lat: 51.2, lng: 10.5, zoom: 5 },
  IT: { lat: 41.9, lng: 12.6, zoom: 5 },
  ES: { lat: 40.5, lng: -3.7, zoom: 5 },
  US: { lat: 37.1, lng: -95.7, zoom: 4 },
  CA: { lat: 56.1, lng: -106.3, zoom: 3 },
  AU: { lat: -25.3, lng: 133.8, zoom: 4 },
  NZ: { lat: -41.3, lng: 172.5, zoom: 5 },
  AE: { lat: 24.0, lng: 54.0, zoom: 7 },
  GR: { lat: 39.1, lng: 22.0, zoom: 6 },
  PT: { lat: 39.6, lng: -8.0, zoom: 6 },
  NL: { lat: 52.3, lng: 5.3, zoom: 7 },
  CH: { lat: 46.8, lng: 8.2, zoom: 7 },
  AT: { lat: 47.5, lng: 14.6, zoom: 7 },
  CZ: { lat: 49.8, lng: 15.5, zoom: 7 },
  HU: { lat: 47.2, lng: 19.5, zoom: 7 },
  PL: { lat: 51.9, lng: 19.1, zoom: 6 },
  IN: { lat: 20.6, lng: 78.9, zoom: 4 },
  MV: { lat: 3.2, lng: 73.2, zoom: 7 },
  LK: { lat: 7.9, lng: 80.8, zoom: 7 },
  NP: { lat: 28.4, lng: 84.1, zoom: 7 },
  MA: { lat: 31.8, lng: -7.1, zoom: 6 },
  TR: { lat: 39.1, lng: 35.2, zoom: 5 },
  RU: { lat: 61.5, lng: 105.3, zoom: 3 },
  BR: { lat: -14.2, lng: -51.9, zoom: 4 },
  AR: { lat: -38.4, lng: -63.6, zoom: 4 },
  MX: { lat: 23.6, lng: -102.6, zoom: 5 },
  HK: { lat: 22.35, lng: 114.13, zoom: 10 },
  MO: { lat: 22.2, lng: 113.55, zoom: 12 },
};

export default function TravelHistory() {
  const { t, lang } = useI18n();
  const utils = trpc.useUtils();
  const {
    data: countries,
    refetch,
    isLoading,
    isError,
    error,
  } = trpc.travelHistory.getCountries.useQuery();
  type CountryRecord = NonNullable<typeof countries>[number];
  const countryNames = useMemo(
    () =>
      new Intl.DisplayNames([lang === "zh" ? "zh-HK" : "en-HK"], {
        type: "region",
      }),
    [lang]
  );
  const countryName = useCallback(
    (code: string, fallback: string) => {
      if (!COUNTRIES.some(country => country.code === code.toUpperCase()))
        return fallback;
      try {
        return countryNames.of(code.toUpperCase()) || fallback;
      } catch {
        return fallback;
      }
    },
    [countryNames]
  );
  const regionName = (region: string) =>
    lang === "zh" ? (REGION_ZH[region] ?? region) : region;
  const STATUS_CONFIG = {
    visited: { ...STATUS_CONFIG_BASE.visited, label: t("statusVisited") },
    planned: { ...STATUS_CONFIG_BASE.planned, label: t("statusPlanned") },
    wishlist: { ...STATUS_CONFIG_BASE.wishlist, label: t("statusWishlist") },
  };

  const [showAdd, setShowAdd] = useState(false);
  const [editingCountry, setEditingCountry] = useState<CountryRecord | null>(
    null
  );
  const [editForm, setEditForm] = useState({
    status: "visited" as HistoryStatus,
    visitedYear: "",
    visitedDate: "",
    notes: "",
  });
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<HistoryStatus | "all">(
    "all"
  );
  const [filterRegion, setFilterRegion] = useState("__all__");
  const [addForm, setAddForm] = useState({
    countryCode: "",
    countryName: "",
    status: "visited" as HistoryStatus,
    visitedYear: "",
    visitedDate: "",
  });
  const [activeTab, setActiveTab] = useState<"map" | "list">("map");

  const mutationError = (err: { message: string }) =>
    toast.error(
      `${lang === "zh" ? "未能儲存變更" : "Could not save changes"}: ${err.message}`
    );
  const upsertCountry = trpc.travelHistory.upsertCountry.useMutation({
    onSuccess: async () => {
      setShowAdd(false);
      setAddForm({
        countryCode: "",
        countryName: "",
        status: "visited",
        visitedYear: "",
        visitedDate: "",
      });
      toast.success(t("added"));
      await utils.invalidate();
    },
    onError: mutationError,
  });
  const removeCountry = trpc.travelHistory.removeCountry.useMutation({
    onSuccess: async () => {
      toast.success(t("removed"));
      await utils.invalidate();
    },
    onError: mutationError,
  });
  const updateStatus = trpc.travelHistory.upsertCountry.useMutation({
    onSuccess: async () => {
      setEditingCountry(null);
      toast.success(t("updated"));
      await utils.invalidate();
    },
    onError: mutationError,
  });
  const mutationPending =
    upsertCountry.isPending ||
    removeCountry.isPending ||
    updateStatus.isPending;
  const dataReady = countries !== undefined;
  const disableMutation = mutationPending || !dataReady;

  // Country detail sheet state
  const [detailCountry, setDetailCountry] = useState<{
    code: string;
    name: string;
  } | null>(null);
  const [placeSearch, setPlaceSearch] = useState("");
  const [placeSuggestions, setPlaceSuggestions] = useState<
    Array<{ placeId: string; description: string; lat?: number; lng?: number }>
  >([]);
  const [placeSearchPending, setPlaceSearchPending] = useState(false);
  const [placeSearchError, setPlaceSearchError] = useState(false);
  const [savedPlaces, setSavedPlaces] = useState<
    Array<{ name: string; lat: number; lng: number }>
  >([]);
  const detailMapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const uniqueCountries = useMemo(
    () => uniqueHistoryCountries(countries ?? []),
    [countries]
  );
  const insights = useMemo(
    () => summarizeHistory(uniqueCountries, COUNTRIES),
    [uniqueCountries]
  );
  const countryMap = useMemo(() => {
    const m: Record<string, { status: string; visitedYear?: number | null }> =
      {};
    uniqueCountries.forEach(c => {
      m[c.countryCode.toUpperCase()] = {
        status: c.status,
        visitedYear: historyVisitYear(c.visitedAt),
      };
    });
    return m;
  }, [uniqueCountries]);

  const filteredCountries = useMemo(() => {
    return filterHistoryCountries(
      uniqueCountries,
      COUNTRIES,
      { search, status: filterStatus, region: filterRegion },
      code => countryName(code, code)
    );
  }, [uniqueCountries, filterStatus, filterRegion, search, countryName]);

  const availableToAdd = COUNTRIES.filter(c => !countryMap[c.code]);
  const hasFilters =
    Boolean(search.trim()) ||
    filterStatus !== "all" ||
    filterRegion !== "__all__";
  const resetFilters = () => {
    setSearch("");
    setFilterStatus("all");
    setFilterRegion("__all__");
  };
  const openAddCountry = () => {
    setAddForm({
      countryCode: "",
      countryName: "",
      status: "visited",
      visitedYear: "",
      visitedDate: "",
    });
    setShowAdd(true);
  };

  const openEditCountry = (c: CountryRecord) => {
    setEditingCountry(c);
    setEditForm({
      status: c.status,
      visitedYear: "",
      visitedDate: historyDateInput(c.visitedAt),
      notes: c.notes ?? "",
    });
  };

  const handleEditCountry = () => {
    if (!editingCountry || disableMutation) return;
    let visitedAt: string | undefined;
    try {
      visitedAt = resolveHistoryVisitDate(
        editForm.visitedDate,
        editForm.visitedYear
      );
    } catch {
      toast.error(
        lang === "zh"
          ? "請輸入有效日期或四位數年份"
          : "Enter a valid date or a four-digit year"
      );
      return;
    }
    updateStatus.mutate({
      countryCode: editingCountry.countryCode,
      countryName: editingCountry.countryName,
      status: editForm.status,
      visitedAt,
      notes: editForm.notes || undefined,
    });
  };

  const handleAdd = () => {
    if (disableMutation) return;
    if (!addForm.countryCode) {
      toast.error(t("selectCountryRequired"));
      return;
    }
    const country = COUNTRIES.find(c => c.code === addForm.countryCode);
    let visitedAt: string | undefined;
    try {
      visitedAt =
        addForm.status === "visited"
          ? resolveHistoryVisitDate(addForm.visitedDate, addForm.visitedYear)
          : undefined;
    } catch {
      toast.error(
        lang === "zh"
          ? "請輸入有效日期或四位數年份"
          : "Enter a valid date or a four-digit year"
      );
      return;
    }
    upsertCountry.mutate({
      countryCode: addForm.countryCode,
      countryName: country?.name ?? addForm.countryName ?? addForm.countryCode,
      status: addForm.status,
      visitedAt,
    });
  };

  // Open country detail sheet
  const openDetail = (code: string, name: string) => {
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];
    detailMapRef.current = null;
    setDetailCountry({ code, name });
    setPlaceSearch("");
    setPlaceSuggestions([]);
    setPlaceSearchError(false);
    setSavedPlaces([]);
  };

  // Initialize detail map and zoom to country
  const handleDetailMapReady = useCallback(
    (map: LeafletMap) => {
      detailMapRef.current = map;
      if (detailCountry) {
        const center = COUNTRY_CENTERS[detailCountry.code];
        if (center) {
          map.setView([center.lat, center.lng], center.zoom);
        }
      }
    },
    [detailCountry]
  );

  // Place search using Nominatim (OpenStreetMap)
  useEffect(() => {
    setPlaceSearchError(false);
    if (!placeSearch.trim() || !detailCountry) {
      setPlaceSuggestions([]);
      setPlaceSearchPending(false);
      return;
    }
    const controller = new AbortController();
    let active = true;
    setPlaceSearchPending(true);
    searchTimeoutRef.current = setTimeout(() => {
      const countryCode = detailCountry.code.toLowerCase();
      const language = lang === "zh" ? "zh-HK,zh-TW,en" : "en,zh-HK";
      fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(placeSearch)}&countrycodes=${countryCode}&format=json&limit=5&accept-language=${language}`,
        { signal: controller.signal }
      )
        .then(r => {
          if (!r.ok) throw new Error("Place search unavailable");
          return r.json();
        })
        .then(
          (
            results: Array<{
              place_id: number;
              display_name: string;
              lat: string;
              lon: string;
            }>
          ) => {
            if (!active) return;
            setPlaceSuggestions(
              results.map(r => ({
                placeId: String(r.place_id),
                description: r.display_name,
                lat: parseFloat(r.lat),
                lng: parseFloat(r.lon),
              }))
            );
          }
        )
        .catch(() => {
          if (active) {
            setPlaceSuggestions([]);
            setPlaceSearchError(true);
          }
        })
        .finally(() => {
          if (active) setPlaceSearchPending(false);
        });
    }, 400);
    return () => {
      active = false;
      controller.abort();
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [placeSearch, detailCountry, lang]);

  // Select a place from suggestions → add Leaflet marker
  const selectPlace = useCallback(
    (suggestion: {
      placeId: string;
      description: string;
      lat?: number;
      lng?: number;
    }) => {
      setPlaceSearch("");
      setPlaceSuggestions([]);
      if (
        !detailMapRef.current ||
        suggestion.lat === undefined ||
        suggestion.lng === undefined ||
        !Number.isFinite(suggestion.lat) ||
        !Number.isFinite(suggestion.lng)
      )
        return;
      const lat = suggestion.lat;
      const lng = suggestion.lng;
      detailMapRef.current.panTo([lat, lng]);
      detailMapRef.current.setZoom(14);
      const marker = L.marker([lat, lng])
        .addTo(detailMapRef.current)
        .bindPopup(suggestion.description)
        .openPopup();
      markersRef.current.push(marker);
      setSavedPlaces(prev => [
        ...prev,
        { name: suggestion.description, lat, lng },
      ]);
    },
    []
  );

  // Clear markers when detail sheet closes
  const closeDetail = () => {
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    setDetailCountry(null);
  };

  return (
    <AppLayout>
      <div className="min-h-screen bg-background text-foreground">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 sm:py-8 space-y-5 pb-8">
          <section className="voyage-hero relative overflow-hidden">
            <Globe
              aria-hidden="true"
              className="absolute -right-10 -top-10 h-56 w-56 opacity-[0.07]"
              strokeWidth={0.7}
            />
            <div className="relative grid gap-6 md:grid-cols-[1fr_240px] md:items-center">
              <div>
                <p className="text-xs font-semibold tracking-[0.18em] uppercase text-emerald-200 flex items-center gap-2 mb-3">
                  <Compass className="h-4 w-4" />
                  {lang === "zh"
                    ? "你的世界 · 旅行手帳"
                    : "Your world · Travel journal"}
                </p>
                <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
                  {t("travelHistoryTitle")}
                </h1>
                <p className="text-sm text-white/75 mt-3 leading-relaxed max-w-lg">
                  {lang === "zh"
                    ? "走過的地方，下一站的期待。把每一次出發，慢慢拼成你的世界。"
                    : "Places you have been. Places still calling. Build your own world, one journey at a time."}
                </p>
                <Button
                  onClick={openAddCountry}
                  disabled={disableMutation}
                  className="mt-5 gap-2 bg-white text-primary hover:bg-white/90 rounded-xl"
                >
                  <Plus className="h-4 w-4" />
                  {t("addCountry")}
                </Button>
              </div>
              <div className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm">
                <p className="text-xs text-white/75">
                  {lang === "zh" ? "目錄探索進度" : "Catalog exploration"}
                </p>
                <p className="text-4xl font-bold tracking-tight mt-2 tabular-nums">
                  {dataReady && insights.visitedPercentage !== null
                    ? `${insights.visitedPercentage.toFixed(1)}%`
                    : "—"}
                </p>
                <p className="text-xs text-white/80 mt-2 leading-relaxed">
                  {dataReady
                    ? lang === "zh"
                      ? `已到訪 ${insights.catalogVisited} / ${insights.catalogTotal} 個目錄國家／地區`
                      : `${insights.catalogVisited} of ${insights.catalogTotal} catalog countries / territories visited`
                    : isError
                      ? lang === "zh"
                        ? "足跡資料暫時不可用"
                        : "Footprint data is unavailable"
                      : lang === "zh"
                        ? "正在讀取你的足跡…"
                        : "Loading your footprint…"}
                </p>
                {dataReady ? (
                  <div
                    role="progressbar"
                    aria-label={
                      lang === "zh" ? "目錄探索進度" : "Catalog exploration"
                    }
                    aria-valuenow={insights.catalogVisited}
                    aria-valuemin={0}
                    aria-valuemax={insights.catalogTotal}
                    className="h-1.5 rounded-full bg-white/20 mt-3 overflow-hidden"
                  >
                    <div
                      className="h-full bg-emerald-200 rounded-full"
                      style={{ width: `${insights.visitedPercentage ?? 0}%` }}
                    />
                  </div>
                ) : (
                  <Skeleton className="h-1.5 w-full mt-3 bg-white/20" />
                )}
                <p className="text-[10px] text-white/60 mt-3 leading-relaxed">
                  {lang === "zh"
                    ? "以本頁可選目錄為分母；並非全球主權國家比例。"
                    : "Based on this page's supported catalog, not the world's sovereign-state count."}
                </p>
                {dataReady && insights.unmappedVisited > 0 && (
                  <p className="text-[10px] text-emerald-200 mt-2">
                    {lang === "zh"
                      ? `另有 ${insights.unmappedVisited} 個已到訪記錄未列入目錄，仍保留於清單。`
                      : `${insights.unmappedVisited} visited records outside the catalog are retained in your list.`}
                  </p>
                )}
              </div>
            </div>
          </section>

          {isError && (
            <div
              role="alert"
              className="voyage-panel border-destructive/25 flex flex-wrap items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="font-semibold text-sm">
                  {lang === "zh"
                    ? "未能載入旅遊足跡"
                    : "Could not load your travel history"}
                </p>
                <p className="text-xs text-muted-foreground mt-1 break-words">
                  {error.message}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RotateCcw className="h-4 w-4 mr-2" />
                {lang === "zh" ? "重試" : "Retry"}
              </Button>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            {(
              Object.entries(STATUS_CONFIG) as [
                HistoryStatus,
                (typeof STATUS_CONFIG)["visited"],
              ][]
            ).map(([key, cfg]) => {
              const Icon = cfg.icon;
              return (
                <button
                  key={key}
                  onClick={() =>
                    setFilterStatus(filterStatus === key ? "all" : key)
                  }
                  aria-pressed={filterStatus === key}
                  className={`voyage-metric text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${filterStatus === key ? "ring-2 ring-primary" : "hover:border-primary/40"}`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={`w-8 h-8 rounded-xl ${cfg.color} flex items-center justify-center`}
                    >
                      <Icon className="w-4 h-4 text-white" />
                    </span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  {dataReady ? (
                    <p className="text-3xl font-bold tracking-tight mt-3 tabular-nums">
                      {insights.counts[key]}
                    </p>
                  ) : (
                    <Skeleton className="w-12 h-8 mt-3" />
                  )}
                  <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                    {cfg.label}
                  </p>
                </button>
              );
            })}
          </div>

          <section className="voyage-panel flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <span className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Link2 className="h-5 w-5" />
              </span>
              <div>
                <p className="font-semibold text-sm">
                  {lang === "zh"
                    ? "資料只輸入一次，足跡保持相連"
                    : "Enter once. Keep your footprint connected."}
                </p>
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed max-w-2xl">
                  {lang === "zh"
                    ? "在資料同步中心，將飛行護照航班及行程目的地同步至國家足跡；手動新增的國家仍會保留。以下統計只使用你目前儲存的記錄，並非即時位置追蹤。"
                    : "Sync Flight Passport records and trip destinations into your country history in the Sync Center. Manually added countries are retained. Insights use your saved records, not live location tracking."}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              className="rounded-xl gap-2 shrink-0"
              asChild
            >
              <Link href="/sync">
                {lang === "zh" ? "前往同步中心" : "Open Sync Center"}
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Button>
          </section>

          <Tabs
            value={activeTab}
            onValueChange={v => setActiveTab(v as "map" | "list")}
          >
            <TabsList className="rounded-xl bg-primary/5">
              <TabsTrigger value="map" className="rounded-lg gap-2">
                <Globe className="w-4 h-4" />
                {t("mapTab")}
              </TabsTrigger>
              <TabsTrigger value="list" className="rounded-lg gap-2">
                <MapPin className="w-4 h-4" />
                {t("listTab")}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {activeTab === "map" && (
            <section className="rounded-2xl border border-border bg-card text-card-foreground shadow-sm overflow-hidden">
              <div className="p-4 sm:p-5 border-b border-border flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="voyage-eyebrow">
                    {lang === "zh" ? "世界畫布" : "The world canvas"}
                  </p>
                  <h2 className="voyage-section-title mt-1">{t("worldMap")}</h2>
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                    <span key={key} className="flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: cfg.mapColor }}
                      />
                      {cfg.label}
                    </span>
                  ))}
                </div>
              </div>
              {dataReady ? (
                <WorldMap
                  visitedCountries={uniqueCountries.map(c => ({
                    countryCode: c.countryCode,
                    status: c.status,
                  }))}
                  onCountryClick={(code, name) => {
                    if (countryMap[code.toUpperCase()])
                      openDetail(code, countryName(code, name));
                    else if (!disableMutation) {
                      setAddForm({
                        countryCode: code,
                        countryName: name,
                        status: "visited",
                        visitedYear: "",
                        visitedDate: "",
                      });
                      setShowAdd(true);
                    }
                  }}
                  className="w-full"
                />
              ) : (
                <div className="p-5">
                  <Skeleton className="h-52 sm:h-72 w-full rounded-xl" />
                </div>
              )}
              <p className="text-xs text-muted-foreground text-center px-4 py-3 leading-relaxed">
                {t("mapClickHint")}
              </p>
            </section>
          )}

          <section
            className="space-y-4"
            aria-label={
              lang === "zh" ? "國家足跡清單" : "Country footprint list"
            }
          >
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="voyage-eyebrow">
                  {lang === "zh" ? "你的收藏" : "Your collection"}
                </p>
                <h2 className="voyage-section-title mt-1">
                  {lang === "zh"
                    ? "每一站，都值得記下"
                    : "Every stop has a story"}
                </h2>
              </div>
              <span
                className="text-xs text-muted-foreground shrink-0"
                aria-live="polite"
              >
                {dataReady
                  ? `${filteredCountries.length} / ${insights.trackedCount}`
                  : "—"}
              </span>
            </div>
            <div className="voyage-panel space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  aria-label={t("searchCountry")}
                  placeholder={
                    lang === "zh"
                      ? "搜尋國家、中英文名稱或代碼…"
                      : "Search country, Chinese / English name or code…"
                  }
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9 rounded-xl"
                />
              </div>
              <div className="flex gap-2">
                <Select
                  value={filterStatus}
                  onValueChange={v =>
                    setFilterStatus(v as HistoryStatus | "all")
                  }
                >
                  <SelectTrigger
                    aria-label={t("status")}
                    className="flex-1 min-w-0 rounded-xl"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {lang === "zh" ? "所有狀態" : "All statuses"}
                    </SelectItem>
                    {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                      <SelectItem key={key} value={key}>
                        {cfg.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterRegion} onValueChange={setFilterRegion}>
                  <SelectTrigger
                    aria-label={lang === "zh" ? "洲份篩選" : "Region filter"}
                    className="flex-1 min-w-0 rounded-xl"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">
                      {lang === "zh" ? "所有洲份" : "All regions"}
                    </SelectItem>
                    {REGIONS_BASE.map(region => (
                      <SelectItem key={region} value={region}>
                        {regionName(region)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {hasFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetFilters}
                  className="gap-1.5 text-primary"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {lang === "zh" ? "重設篩選" : "Reset filters"}
                </Button>
              )}
            </div>
            {isLoading ? (
              <div className="grid sm:grid-cols-2 gap-3">
                {[1, 2, 3, 4].map(key => (
                  <Skeleton key={key} className="h-36 rounded-2xl" />
                ))}
              </div>
            ) : !dataReady ? null : filteredCountries.length === 0 ? (
              <div className="voyage-panel text-center py-10">
                <Globe className="h-10 w-10 mx-auto text-primary/40 mb-3" />
                <h3 className="font-semibold">
                  {hasFilters
                    ? lang === "zh"
                      ? "沒有符合的國家"
                      : "No matching countries"
                    : t("noCountriesYet")}
                </h3>
                <p className="text-xs text-muted-foreground mt-2 mb-4">
                  {hasFilters
                    ? lang === "zh"
                      ? "試試其他名稱、狀態或洲份，或重設篩選。"
                      : "Try another name, status or region, or reset your filters."
                    : t("noCountriesDesc")}
                </p>
                <Button
                  variant="outline"
                  onClick={hasFilters ? resetFilters : openAddCountry}
                  disabled={disableMutation}
                >
                  {hasFilters
                    ? lang === "zh"
                      ? "顯示全部記錄"
                      : "Show all records"
                    : t("addFirstCountry")}
                </Button>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {filteredCountries.map(c => {
                  const cfg = STATUS_CONFIG[c.status];
                  const Icon = cfg.icon;
                  const country = COUNTRIES.find(
                    x => x.code === c.countryCode.toUpperCase()
                  );
                  const name = countryName(c.countryCode, c.countryName);
                  const visitYear = historyVisitYear(c.visitedAt);
                  return (
                    <article
                      key={c.id}
                      className="voyage-panel flex flex-col gap-3 hover:border-primary/25 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`w-10 h-10 rounded-xl ${cfg.color} flex items-center justify-center shrink-0`}
                        >
                          <Icon className="w-5 h-5 text-white" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-base truncate">
                            {name}
                          </h3>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {country
                              ? regionName(country.region)
                              : lang === "zh"
                                ? "未分類地區"
                                : "Unmapped region"}{" "}
                            · {c.countryCode.toUpperCase()}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 items-center text-xs">
                        <span className="rounded-full bg-primary/5 px-2.5 py-1 font-medium">
                          {cfg.label}
                        </span>
                        <span className="text-muted-foreground">
                          {c.status === "visited"
                            ? (visitYear ??
                              (lang === "zh"
                                ? "到訪年份未記錄"
                                : "Visit year unknown"))
                            : lang === "zh"
                              ? "尚未到訪"
                              : "Not visited yet"}
                        </span>
                      </div>
                      {c.notes && (
                        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 break-words">
                          {c.notes}
                        </p>
                      )}
                      <div className="flex items-center gap-1 pt-2 border-t border-border mt-auto">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            openDetail(c.countryCode.toUpperCase(), name)
                          }
                          className="mr-auto gap-1.5 text-primary px-2"
                        >
                          <MapPin className="h-3.5 w-3.5" />
                          {lang === "zh" ? "探索地點" : "Explore places"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title={`${t("editCountry")} ${name}`}
                          aria-label={`${t("editCountry")} ${name}`}
                          disabled={disableMutation}
                          onClick={() => openEditCountry(c)}
                          className="h-9 w-9"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title={`${t("removeCountry")} ${name}`}
                          aria-label={`${t("removeCountry")} ${name}`}
                          disabled={disableMutation}
                          onClick={() => {
                            if (!disableMutation)
                              removeCountry.mutate({
                                countryCode: c.countryCode,
                              });
                          }}
                          className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          {removeCountry.isPending &&
                          removeCountry.variables?.countryCode ===
                            c.countryCode ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <div className="grid md:grid-cols-2 gap-4">
            <section className="voyage-panel">
              <p className="voyage-eyebrow">
                {lang === "zh" ? "足跡分佈" : "Footprint distribution"}
              </p>
              <h2 className="voyage-section-title mt-1">
                {lang === "zh" ? "按洲份探索" : "Explore by region"}
              </h2>
              <p className="text-xs text-muted-foreground mt-2 mb-5">
                {lang === "zh"
                  ? "按現有目錄分類；每列為已到訪／該洲份目錄總數。"
                  : "Uses the existing catalog's region mapping. Each row is visited / catalog total."}
              </p>
              {dataReady ? (
                <div className="space-y-4">
                  {insights.regions.map(region => (
                    <div key={region.region}>
                      <div className="flex justify-between gap-3 text-xs mb-1.5">
                        <span className="font-medium">
                          {regionName(region.region)}
                        </span>
                        <span className="text-muted-foreground tabular-nums">
                          {region.visited} / {region.total}
                        </span>
                      </div>
                      <div
                        className="h-2 bg-primary/5 rounded-full overflow-hidden"
                        role="progressbar"
                        aria-label={regionName(region.region)}
                        aria-valuenow={region.visited}
                        aria-valuemin={0}
                        aria-valuemax={region.total}
                      >
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{
                            width: `${region.total ? (region.visited / region.total) * 100 : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                  {insights.unmappedVisited > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {lang === "zh"
                        ? `${insights.unmappedVisited} 個已到訪記錄未分類，不納入洲份比例。`
                        : `${insights.unmappedVisited} unmapped visited records are excluded from region ratios.`}
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {[1, 2, 3, 4, 5, 6].map(key => (
                    <Skeleton key={key} className="h-7 w-full" />
                  ))}
                </div>
              )}
            </section>
            <section className="voyage-panel">
              <p className="voyage-eyebrow">
                {lang === "zh" ? "旅行年誌" : "The yearbook"}
              </p>
              <h2 className="voyage-section-title mt-1">
                {lang === "zh" ? "到訪記錄年份" : "Recorded visit years"}
              </h2>
              <p className="text-xs text-muted-foreground mt-2 mb-3 leading-relaxed">
                {lang === "zh"
                  ? "每個已到訪國家／地區只按目前儲存的年份計算一次，不代表旅程次數。日期採用香港時間（UTC+8）。"
                  : "Each visited country / territory is counted once using its saved visit year, not the number of trips. Dates use Hong Kong time (UTC+8)."}
              </p>
              {!dataReady ? (
                <Skeleton className="h-48 w-full rounded-xl" />
              ) : insights.visitsByYear.length === 0 ? (
                <div className="rounded-xl bg-primary/5 text-center py-10 px-4">
                  <Calendar className="h-7 w-7 text-primary mx-auto mb-2" />
                  <p className="text-sm font-medium">
                    {lang === "zh"
                      ? "尚未有已知到訪年份"
                      : "No known visit years yet"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {lang === "zh"
                      ? "編輯國家記錄，補上你記得的日期或年份。"
                      : "Edit a country to add a date or year you remember."}
                  </p>
                </div>
              ) : (
                <div className="h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={insights.visitsByYear}
                      margin={{ top: 8, right: 4, left: -25, bottom: 0 }}
                      accessibilityLayer
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="var(--border)"
                      />
                      <XAxis
                        dataKey="year"
                        tick={{ fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 12,
                          border: "1px solid var(--border)",
                          backgroundColor: "var(--card)",
                          color: "var(--card-foreground)",
                        }}
                        labelFormatter={year =>
                          lang === "zh" ? `${year} 年` : String(year)
                        }
                      />
                      <Bar
                        dataKey="count"
                        name={
                          lang === "zh"
                            ? "已到訪國家／地區"
                            : "Visited countries / territories"
                        }
                        fill="var(--primary)"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={40}
                        isAnimationActive={false}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              {dataReady && (
                <p className="text-xs text-muted-foreground mt-4 pt-3 border-t border-border">
                  {lang === "zh"
                    ? `年份未記錄：${insights.unknownVisitYear} 個已到訪國家／地區（獨立列示，不計入年度圖表）。`
                    : `Unknown year: ${insights.unknownVisitYear} visited countries / territories, listed separately and excluded from the chart.`}
                </p>
              )}
            </section>
          </div>
        </div>

        {/* Country Detail Sheet */}
        <Sheet open={!!detailCountry} onOpenChange={o => !o && closeDetail()}>
          <SheetContent
            side="right"
            className="w-full sm:max-w-lg p-0 flex flex-col"
          >
            <SheetHeader className="px-4 pt-4 pb-3 border-b border-border shrink-0">
              <div className="flex items-center justify-between">
                <SheetTitle className="text-lg font-bold">
                  {detailCountry?.name}
                </SheetTitle>
                <button
                  onClick={closeDetail}
                  aria-label={
                    lang === "zh"
                      ? "關閉國家詳細地圖"
                      : "Close country detail map"
                  }
                  className="p-1.5 rounded-lg hover:bg-accent transition-colors"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
              {/* Bilingual place search */}
              <div className="relative mt-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  className="pl-9 pr-4"
                  aria-label={lang === "zh" ? "搜尋地點" : "Search places"}
                  placeholder={
                    lang === "zh"
                      ? "搜尋地點（中文或英文）..."
                      : "Search places (Chinese or English)..."
                  }
                  value={placeSearch}
                  onChange={e => setPlaceSearch(e.target.value)}
                />
                {placeSearch && (
                  <button
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    aria-label={
                      lang === "zh" ? "清除地點搜尋" : "Clear place search"
                    }
                    onClick={() => {
                      setPlaceSearch("");
                      setPlaceSuggestions([]);
                    }}
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
              {placeSearchPending && (
                <p
                  className="text-xs text-muted-foreground flex items-center gap-1.5 mt-2"
                  role="status"
                >
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {lang === "zh" ? "正在搜尋地點…" : "Searching places…"}
                </p>
              )}
              {placeSearchError && (
                <p className="text-xs text-destructive mt-2" role="alert">
                  {lang === "zh"
                    ? "地點搜尋暫時不可用，請稍後再試。"
                    : "Place search is temporarily unavailable. Please try again."}
                </p>
              )}
              {placeSearch.trim() &&
                !placeSearchPending &&
                !placeSearchError &&
                placeSuggestions.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {lang === "zh"
                      ? "找不到地點，試試另一個名稱。"
                      : "No places found. Try another name."}
                  </p>
                )}
            </SheetHeader>

            {/* Map */}
            <div className="flex-1 min-h-0 relative">
              {detailCountry && (
                <MapView
                  key={detailCountry.code}
                  className="w-full h-full"
                  initialCenter={
                    COUNTRY_CENTERS[detailCountry.code]
                      ? {
                          lat: COUNTRY_CENTERS[detailCountry.code].lat,
                          lng: COUNTRY_CENTERS[detailCountry.code].lng,
                        }
                      : { lat: 0, lng: 0 }
                  }
                  initialZoom={COUNTRY_CENTERS[detailCountry.code]?.zoom ?? 5}
                  onMapReady={handleDetailMapReady}
                />
              )}
            </div>

            {/* Saved places list */}
            {savedPlaces.length > 0 && (
              <div className="shrink-0 border-t border-border px-4 py-3 max-h-40 overflow-y-auto">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  {t("markedPlaces")}
                </p>
                <p className="text-[11px] text-muted-foreground mb-2">
                  {lang === "zh"
                    ? "只在此地圖暫時標記，關閉後不會儲存。"
                    : "Temporary map markers only; not saved after closing."}
                </p>
                <div className="space-y-1.5">
                  {savedPlaces.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="truncate text-foreground">{p.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>

        {/* Edit Country Dialog */}
        <Dialog
          open={!!editingCountry}
          onOpenChange={o => !o && setEditingCountry(null)}
        >
          <DialogContent className="sm:max-w-sm rounded-2xl max-h-[85dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {t("editCountry")}{" "}
                {editingCountry &&
                  countryName(
                    editingCountry.countryCode,
                    editingCountry.countryName
                  )}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <label className="text-sm font-medium text-foreground">
                  {t("status")}
                </label>
                <Select
                  value={editForm.status}
                  disabled={mutationPending}
                  onValueChange={v =>
                    setEditForm({ ...editForm, status: v as HistoryStatus })
                  }
                >
                  <SelectTrigger aria-label={t("status")} className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label
                  htmlFor="history-edit-date"
                  className="text-sm font-medium text-foreground"
                >
                  {lang === "zh" ? "到訪日期（選填）" : "Visit date (optional)"}
                </label>
                <Input
                  id="history-edit-date"
                  className="mt-1.5"
                  type="date"
                  disabled={mutationPending}
                  value={editForm.visitedDate}
                  onChange={e =>
                    setEditForm({
                      ...editForm,
                      visitedDate: e.target.value,
                      visitedYear: "",
                    })
                  }
                />
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  {lang === "zh"
                    ? "香港時間（UTC+8）；儲存為 YYYY-MM-DD，不轉換日期。"
                    : "Hong Kong (UTC+8); saved as YYYY-MM-DD without shifting the calendar date."}
                </p>
              </div>
              <div>
                <label
                  htmlFor="history-edit-year"
                  className="text-sm font-medium text-foreground"
                >
                  {t("visitedYear")}
                </label>
                <Input
                  id="history-edit-year"
                  className="mt-1.5"
                  type="number"
                  min={1000}
                  max={9999}
                  inputMode="numeric"
                  disabled={mutationPending}
                  placeholder={
                    lang === "zh"
                      ? "只記得年份？例：2024"
                      : "Only remember the year? e.g. 2024"
                  }
                  value={editForm.visitedYear}
                  onChange={e =>
                    setEditForm({
                      ...editForm,
                      visitedYear: e.target.value,
                      visitedDate: "",
                    })
                  }
                />
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  {lang === "zh"
                    ? "只填年份時，以該年 1 月 1 日儲存作年份記錄，不代表實際到訪日。"
                    : "Year-only entries use January 1 as a year marker, not an actual visit day."}
                </p>
              </div>
              <div>
                <label
                  htmlFor="history-edit-notes"
                  className="text-sm font-medium text-foreground"
                >
                  {t("notes")}
                </label>
                <Input
                  id="history-edit-notes"
                  className="mt-1.5"
                  disabled={mutationPending}
                  placeholder={t("notesPlaceholder")}
                  value={editForm.notes}
                  onChange={e =>
                    setEditForm({ ...editForm, notes: e.target.value })
                  }
                />
              </div>
              <Button
                className="w-full rounded-xl"
                onClick={handleEditCountry}
                disabled={disableMutation}
              >
                {updateStatus.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                {t("saveChanges")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Add Country Dialog */}
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogContent className="sm:max-w-md rounded-2xl max-h-[85dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("addCountry")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <label className="text-sm font-medium text-foreground">
                  {t("country")} *
                </label>
                <Select
                  value={addForm.countryCode}
                  disabled={mutationPending}
                  onValueChange={v =>
                    setAddForm({ ...addForm, countryCode: v })
                  }
                >
                  <SelectTrigger aria-label={t("country")} className="mt-1.5">
                    <SelectValue placeholder={t("selectCountry")} />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {addForm.countryCode &&
                      !availableToAdd.some(
                        c => c.code === addForm.countryCode
                      ) &&
                      !countryMap[addForm.countryCode] && (
                        <SelectItem value={addForm.countryCode}>
                          {countryName(
                            addForm.countryCode,
                            addForm.countryName
                          )}
                        </SelectItem>
                      )}
                    {availableToAdd.map(c => (
                      <SelectItem key={c.code} value={c.code}>
                        {countryName(c.code, c.name)} ({regionName(c.region)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">
                  {t("status")}
                </label>
                <Select
                  value={addForm.status}
                  disabled={mutationPending}
                  onValueChange={v =>
                    setAddForm({ ...addForm, status: v as HistoryStatus })
                  }
                >
                  <SelectTrigger aria-label={t("status")} className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {addForm.status === "visited" && (
                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="history-add-date"
                      className="text-sm font-medium text-foreground"
                    >
                      {lang === "zh"
                        ? "到訪日期（選填）"
                        : "Visit date (optional)"}
                    </label>
                    <Input
                      id="history-add-date"
                      className="mt-1.5"
                      type="date"
                      disabled={mutationPending}
                      value={addForm.visitedDate}
                      onChange={e =>
                        setAddForm({
                          ...addForm,
                          visitedDate: e.target.value,
                          visitedYear: "",
                        })
                      }
                    />
                    <p className="text-[11px] text-muted-foreground mt-1.5">
                      {lang === "zh"
                        ? "香港時間（UTC+8）；儲存為 YYYY-MM-DD。"
                        : "Hong Kong (UTC+8); saved as YYYY-MM-DD."}
                    </p>
                  </div>
                  <div>
                    <label
                      htmlFor="history-add-year"
                      className="text-sm font-medium text-foreground"
                    >
                      {t("visitedYear")}
                    </label>
                    <Input
                      id="history-add-year"
                      className="mt-1.5"
                      type="number"
                      min={1000}
                      max={9999}
                      inputMode="numeric"
                      disabled={mutationPending}
                      placeholder={
                        lang === "zh"
                          ? "只記得年份？例：2024"
                          : "Only remember the year? e.g. 2024"
                      }
                      value={addForm.visitedYear}
                      onChange={e =>
                        setAddForm({
                          ...addForm,
                          visitedYear: e.target.value,
                          visitedDate: "",
                        })
                      }
                    />
                    <p className="text-[11px] text-muted-foreground mt-1.5">
                      {lang === "zh"
                        ? "只填年份時，以該年 1 月 1 日儲存作年份記錄，不代表實際到訪日。"
                        : "Year-only entries use January 1 as a year marker, not an actual visit day."}
                    </p>
                  </div>
                </div>
              )}
              <Button
                className="w-full rounded-xl"
                onClick={handleAdd}
                disabled={disableMutation || !addForm.countryCode}
              >
                {upsertCountry.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                {t("add")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
