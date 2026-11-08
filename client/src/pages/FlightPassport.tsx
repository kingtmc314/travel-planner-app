import { trpc } from "@/lib/trpc";
import AppLayout from "@/components/AppLayout";
import WorldMap from "@/components/WorldMap";
import PassportInsights from "@/components/PassportInsights";
import FlightLookupPanel from "@/components/FlightLookupPanel";
import { useFlightAutofill } from "@/hooks/useFlightAutofill";
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
import {
  AlertCircle,
  ArrowRight,
  Download,
  Edit2,
  Globe,
  Loader2,
  Plane,
  Plus,
  RefreshCw,
  Share2,
  Trash2,
} from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { useI18n } from "@/hooks/useI18n";
import {
  buildPassportInsights,
  getPassportFlightDate,
  getPassportFlightMetrics,
  getPassportFlightStatus,
  getPassportFlightYear,
} from "@/lib/passportInsights";
import { normalizeDateOnly } from "@/lib/hongKongDate";
import {
  formatFlightDateInHongKong,
  formatFlightHours,
  getHongKongDateInput,
  getHongKongYear,
  isIataCode,
  normalizeIataCode,
  parsePositiveWholeNumber,
} from "@shared/flightPassport";
import type { PastFlight } from "../../../drizzle/schema";

// Existing airport lookup retained once; insights consume the estimator rather than a second dataset.
const AIRPORT_COORDS: Record<string, [number, number]> = {
  HKG: [22.308, 113.915],
  MFM: [22.15, 113.592],
  TPE: [25.077, 121.233],
  TSA: [25.069, 121.552],
  KHH: [22.577, 120.35],
  RMQ: [24.264, 120.621],
  TNN: [22.95, 120.206],
  TTT: [22.755, 121.101],
  HUN: [23.741, 121.617],
  KNH: [24.427, 118.359],
  NRT: [35.765, 140.386],
  HND: [35.549, 139.78],
  KIX: [34.427, 135.244],
  FUK: [33.585, 130.451],
  OKA: [26.195, 127.646],
  CTS: [42.775, 141.692],
  NGO: [34.858, 136.805],
  ITM: [34.785, 135.438],
  OIT: [33.479, 131.737],
  KMJ: [32.837, 130.855],
  KMI: [31.877, 131.449],
  MYJ: [33.828, 132.7],
  HIJ: [34.436, 132.92],
  TAK: [34.215, 134.016],
  SDJ: [38.14, 140.917],
  AOJ: [40.735, 140.691],
  AXT: [39.615, 140.219],
  ICN: [37.469, 126.451],
  GMP: [37.558, 126.791],
  PUS: [35.179, 128.938],
  CJU: [33.511, 126.493],
  TAE: [35.894, 128.659],
  PEK: [40.08, 116.584],
  PKX: [39.509, 116.41],
  PVG: [31.143, 121.805],
  SHA: [31.198, 121.336],
  CAN: [23.392, 113.299],
  SZX: [22.639, 113.811],
  CTU: [30.578, 103.947],
  KMG: [24.992, 102.743],
  XIY: [34.447, 108.752],
  WUH: [30.784, 114.208],
  CSX: [28.189, 113.22],
  NKG: [31.742, 118.862],
  HGH: [30.229, 120.434],
  XMN: [24.544, 118.128],
  FOC: [25.935, 119.663],
  HAK: [19.935, 110.459],
  SYX: [18.307, 109.412],
  URC: [43.907, 87.474],
  CGO: [34.524, 113.841],
  TNA: [36.857, 117.216],
  TSN: [39.124, 117.346],
  DLC: [38.966, 121.539],
  SHE: [41.639, 123.483],
  HRB: [45.623, 126.25],
  SIN: [1.35, 103.994],
  KUL: [2.745, 101.71],
  BKK: [13.681, 100.747],
  DMK: [13.913, 100.607],
  MNL: [14.509, 121.02],
  CGK: [-6.126, 106.656],
  DPS: [-8.748, 115.167],
  SUB: [-7.38, 112.787],
  HAN: [21.221, 105.807],
  SGN: [10.818, 106.652],
  DAD: [16.044, 108.199],
  RGN: [16.907, 96.133],
  PNH: [11.547, 104.844],
  VTE: [17.988, 102.563],
  REP: [13.411, 103.813],
  BKI: [5.937, 116.051],
  KCH: [1.485, 110.336],
  PEN: [5.297, 100.277],
  DEL: [28.556, 77.1],
  BOM: [19.089, 72.868],
  MAA: [12.99, 80.169],
  BLR: [13.198, 77.706],
  CCU: [22.654, 88.447],
  HYD: [17.231, 78.43],
  CMB: [7.18, 79.884],
  DAC: [23.843, 90.398],
  KTM: [27.697, 85.36],
  DXB: [25.253, 55.365],
  AUH: [24.433, 54.651],
  DOH: [25.273, 51.608],
  KWI: [29.227, 47.969],
  BAH: [26.271, 50.634],
  MCT: [23.593, 58.285],
  AMM: [31.723, 35.993],
  BEY: [33.821, 35.488],
  TLV: [32.011, 34.887],
  LHR: [51.477, -0.461],
  LGW: [51.148, -0.19],
  STN: [51.885, 0.235],
  CDG: [49.013, 2.55],
  ORY: [48.724, 2.38],
  AMS: [52.308, 4.764],
  FRA: [50.033, 8.571],
  MUC: [48.354, 11.786],
  BER: [52.366, 13.503],
  ZRH: [47.458, 8.548],
  VIE: [48.11, 16.57],
  FCO: [41.8, 12.239],
  MXP: [45.63, 8.728],
  MAD: [40.494, -3.567],
  BCN: [41.297, 2.078],
  LIS: [38.774, -9.134],
  CPH: [55.618, 12.656],
  ARN: [59.651, 17.919],
  HEL: [60.317, 24.963],
  OSL: [60.194, 11.1],
  DUB: [53.421, -6.27],
  BRU: [50.901, 4.484],
  GVA: [46.238, 6.109],
  PRG: [50.1, 14.26],
  WAW: [52.166, 20.967],
  BUD: [47.437, 19.261],
  ATH: [37.936, 23.944],
  IST: [40.976, 28.814],
  SAW: [40.898, 29.309],
  ADB: [38.292, 27.157],
  CAI: [30.122, 31.406],
  ASW: [23.965, 32.82],
  LOS: [6.577, 3.321],
  JNB: [-26.134, 28.242],
  CPT: [-33.965, 18.602],
  NBO: [-1.319, 36.928],
  ADD: [8.978, 38.799],
  CMN: [33.368, -7.59],
  TUN: [36.851, 10.227],
  ALG: [36.691, 3.215],
  JFK: [40.64, -73.779],
  EWR: [40.69, -74.175],
  LGA: [40.777, -73.873],
  LAX: [33.943, -118.408],
  SFO: [37.619, -122.375],
  SEA: [47.45, -122.309],
  ORD: [41.978, -87.905],
  ATL: [33.641, -84.427],
  MIA: [25.796, -80.287],
  DFW: [32.897, -97.038],
  DEN: [39.856, -104.674],
  BOS: [42.365, -71.01],
  YYZ: [43.677, -79.631],
  YVR: [49.195, -123.184],
  YUL: [45.47, -73.741],
  MEX: [19.436, -99.072],
  BOG: [4.702, -74.147],
  LIM: [-12.022, -77.114],
  GRU: [-23.435, -46.473],
  EZE: [-34.822, -58.536],
  SCL: [-33.393, -70.786],
  SYD: [-33.946, 151.177],
  MEL: [-37.673, 144.843],
  BNE: [-27.384, 153.118],
  PER: [-31.94, 115.967],
  AKL: [-37.008, 174.792],
  CHC: [-43.489, 172.532],
};

function estimateDistance(dep: string, arr: string): number {
  const c1 = AIRPORT_COORDS[normalizeIataCode(dep)];
  const c2 = AIRPORT_COORDS[normalizeIataCode(arr)];
  if (!c1 || !c2 || dep === arr) return 0;
  const radians = (value: number) => (value * Math.PI) / 180;
  const a =
    Math.sin(radians(c2[0] - c1[0]) / 2) ** 2 +
    Math.cos(radians(c1[0])) *
      Math.cos(radians(c2[0])) *
      Math.sin(radians(c2[1] - c1[1]) / 2) ** 2;
  return Math.round(
    6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)))
  );
}

const COUNTRY_NAME_TO_ISO: Record<string, string> = {
  Japan: "JP",
  Taiwan: "TW",
  "South Korea": "KR",
  Korea: "KR",
  Thailand: "TH",
  Singapore: "SG",
  Malaysia: "MY",
  Indonesia: "ID",
  Vietnam: "VN",
  Philippines: "PH",
  Cambodia: "KH",
  China: "CN",
  Egypt: "EG",
  UK: "GB",
  "United Kingdom": "GB",
  France: "FR",
  Germany: "DE",
  Italy: "IT",
  Spain: "ES",
  USA: "US",
  "United States": "US",
  Canada: "CA",
  Australia: "AU",
  "New Zealand": "NZ",
  UAE: "AE",
  "United Arab Emirates": "AE",
  Greece: "GR",
  Portugal: "PT",
  Netherlands: "NL",
  Switzerland: "CH",
  Austria: "AT",
  "Czech Republic": "CZ",
  Hungary: "HU",
  Poland: "PL",
  India: "IN",
  Maldives: "MV",
  "Sri Lanka": "LK",
  Nepal: "NP",
  Morocco: "MA",
  Turkey: "TR",
  Russia: "RU",
  Brazil: "BR",
  Argentina: "AR",
  Mexico: "MX",
  "Hong Kong": "HK",
  Macau: "MO",
};

const defaultForm = {
  flightNumber: "",
  airline: "",
  departureAirport: "",
  arrivalAirport: "",
  departureDate: "",
  durationMinutes: "",
  distanceKm: "",
  seatClass: "economy",
  notes: "",
};

export default function FlightPassport() {
  const { t, lang } = useI18n();
  const zh = lang === "zh";
  const utils = trpc.useUtils();
  const flightQuery = trpc.passport.getFlights.useQuery();
  const { data: flights, isLoading } = flightQuery;
  const [showAdd, setShowAdd] = useState(false);
  const [editingFlight, setEditingFlight] = useState<PastFlight | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [flightSession, setFlightSession] = useState(0);
  const authQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const autofill = useFlightAutofill({
    form,
    setForm,
    numberField: "flightNumber",
    dateField: "departureDate",
    sessionKey: `passport:${flightSession}`,
    open: showAdd || Boolean(editingFlight),
    authorized: Boolean(authQuery.data) && !authQuery.isError,
    mapCandidate: candidate => ({
      airline: candidate.airline,
      departureAirport: candidate.fromCode,
      arrivalAirport: candidate.toCode,
      durationMinutes:
        candidate.durationMinutes === null
          ? ""
          : String(candidate.durationMinutes),
      distanceKm:
        candidate.distanceKm === null ? "" : String(candidate.distanceKm),
    }),
  });
  const [autoMetrics, setAutoMetrics] = useState({
    distance: false,
    duration: false,
  });
  const [activeYear, setActiveYear] = useState("All-Time");
  const [showTripImport, setShowTripImport] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState("");
  const [importResult, setImportResult] = useState<{
    flights: number;
    countries: number;
  } | null>(null);
  const tripQuery = trpc.trips.list.useQuery(undefined, {
    enabled: showTripImport,
  });
  const tripFlightsQuery = trpc.flights.list.useQuery(
    { tripId: Number(selectedTrip) },
    { enabled: showTripImport && Boolean(selectedTrip) }
  );
  const [today, setToday] = useState(() => getHongKongDateInput());
  useEffect(() => {
    const timer = window.setInterval(
      () => setToday(getHongKongDateInput()),
      60_000
    );
    return () => window.clearInterval(timer);
  }, []);
  const errorToast = (label: string, error: { message: string }) =>
    toast.error(`${label}: ${error.message}`);
  const resetFlightForm = () => {
    setForm({ ...defaultForm, departureDate: getHongKongDateInput() });
    setFlightSession(value => value + 1);
    setAutoMetrics({ distance: false, duration: false });
  };
  const syncCountries = trpc.passport.syncCountriesFromFlights.useMutation({
    onSuccess: async data => {
      await utils.invalidate();
      toast.success(
        zh
          ? `已同步 ${data.synced} 個國家到旅遊足跡地圖`
          : `Synced ${data.synced} countries to your travel map`
      );
    },
    onError: error => errorToast(t("syncFailed"), error),
  });
  const addFlight = trpc.passport.addFlight.useMutation({
    onSuccess: async () => {
      setShowAdd(false);
      resetFlightForm();
      toast.success(t("flightRecordAdded"));
      await utils.invalidate();
      syncCountries.mutate();
    },
    onError: error => errorToast(t("addFlightFailed"), error),
  });
  const updateFlight = trpc.passport.updateFlight.useMutation({
    onSuccess: async () => {
      setEditingFlight(null);
      resetFlightForm();
      toast.success(t("flightUpdated"));
      await utils.invalidate();
      syncCountries.mutate();
    },
    onError: error => errorToast(t("updateFailed"), error),
  });
  const deleteFlight = trpc.passport.deleteFlight.useMutation({
    onSuccess: async () => {
      toast.success(t("flightRecordDeleted"));
      await utils.invalidate();
    },
    onError: error => errorToast(t("deleteFlightFailed"), error),
  });
  const seedFlights = trpc.passport.seedMyFlights.useMutation({
    onSuccess: async data => {
      setImportResult({
        flights: data.count,
        countries: data.countriesSynced ?? 0,
      });
      await utils.invalidate();
    },
    onError: error => errorToast(t("importFailed"), error),
  });
  const importTripFlights = trpc.connected.importFlightsToPassport.useMutation({
    onSuccess: async data => {
      toast.success(
        zh
          ? `已匯入 ${data.created} 班；跳過 ${data.skipped} 班（重複或未來日期）；${data.invalid} 班資料不完整`
          : `Imported ${data.created}; skipped ${data.skipped} (duplicates or future dates); ${data.invalid} invalid records`
      );
      await utils.invalidate();
    },
    onError: error => errorToast(t("importFailed"), error),
  });
  const busy =
    addFlight.isPending ||
    updateFlight.isPending ||
    deleteFlight.isPending ||
    seedFlights.isPending ||
    syncCountries.isPending ||
    importTripFlights.isPending;
  const stats = useMemo(
    () =>
      flights
        ? buildPassportInsights(flights, estimateDistance, activeYear, today)
        : null,
    [flights, activeYear, today]
  );
  const yearTabs = useMemo(() => {
    const years = new Set<number>();
    flights?.forEach(flight => {
      const year = getPassportFlightYear(flight);
      if (year !== null) years.add(year);
    });
    if (!years.size) years.add(getHongKongYear(today) ?? 2026);
    return [
      "All-Time",
      ...Array.from(years)
        .sort((a, b) => b - a)
        .map(String),
    ];
  }, [flights, today]);
  useEffect(() => {
    if (!yearTabs.includes(activeYear)) setActiveYear("All-Time");
  }, [activeYear, yearTabs]);
  const yearCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    flights?.forEach(flight => {
      const year = getPassportFlightYear(flight);
      if (year !== null) counts[String(year)] = (counts[String(year)] ?? 0) + 1;
    });
    return counts;
  }, [flights]);
  const flightRoutes = useMemo(
    () =>
      stats?.routes.map(route => ({
        dep: route.departure,
        arr: route.arrival,
      })) ?? [],
    [stats]
  );
  const mapCountries = useMemo(() => {
    const seen = new Set<string>();
    stats?.completed.forEach(flight => {
      for (const name of [flight.arrivalCountry, flight.departureCountry]) {
        if (!name || name === "Hong Kong") continue;
        const iso = COUNTRY_NAME_TO_ISO[name];
        if (iso) seen.add(iso);
      }
    });
    return Array.from(seen).map(countryCode => ({
      countryCode,
      status: "visited" as const,
    }));
  }, [stats]);

  const openEditFlight = (flight: PastFlight) => {
    if (busy) return;
    setEditingFlight(flight);
    setFlightSession(value => value + 1);
    const metrics = getPassportFlightMetrics(flight, estimateDistance);
    setAutoMetrics({
      distance: metrics.distance.source === "estimated",
      duration: metrics.duration.source === "estimated",
    });
    setForm({
      flightNumber: flight.flightNumber ?? "",
      airline: flight.airline ?? "",
      departureAirport: normalizeIataCode(flight.departureAirport),
      arrivalAirport: normalizeIataCode(flight.arrivalAirport),
      departureDate: getPassportFlightDate(flight),
      durationMinutes:
        metrics.duration.value !== null
          ? String(Math.round(metrics.duration.value * 60))
          : "",
      distanceKm:
        metrics.distance.value !== null
          ? String(Math.round(metrics.distance.value))
          : "",
      seatClass: flight.seatClass ?? "economy",
      notes: flight.notes ?? "",
    });
  };
  const handleAirportChange = (
    field: "departureAirport" | "arrivalAirport",
    value: string
  ) => {
    // Legacy edit defaults stay untouched until an actual route edit.
    if (autoMetrics.distance)
      autofill.trackEstimate("distanceKm", form.distanceKm);
    if (autoMetrics.duration)
      autofill.trackEstimate("durationMinutes", form.durationMinutes);
    autofill.change(field, normalizeIataCode(value));
  };
  useEffect(() => {
    if (!showAdd && !editingFlight) return;
    const estimate = estimateDistance(
      form.departureAirport,
      form.arrivalAirport
    );
    if (estimate <= 0) return;
    const values: Partial<typeof defaultForm> = {};
    const nextAuto = { ...autoMetrics };
    // Keep the existing estimator, but also respect manually cleared fields.
    if (
      autofill.canManage("distanceKm") &&
      (!form.distanceKm || autoMetrics.distance)
    ) {
      values.distanceKm = String(estimate);
      nextAuto.distance = true;
    }
    if (
      autofill.canManage("durationMinutes") &&
      (!form.durationMinutes || autoMetrics.duration)
    ) {
      values.durationMinutes = String(Math.round((estimate / 800 + 1) * 60));
      nextAuto.duration = true;
    }
    if (Object.keys(values).length) {
      autofill.applyValues(values);
      setAutoMetrics(nextAuto);
    }
  }, [
    form.departureAirport,
    form.arrivalAirport,
    flightSession,
    showAdd,
    editingFlight,
  ]);
  const saveFlight = () => {
    if (busy) return;
    const departureAirport = normalizeIataCode(form.departureAirport);
    const arrivalAirport = normalizeIataCode(form.arrivalAirport);
    if (!isIataCode(departureAirport) || !isIataCode(arrivalAirport)) {
      toast.error(t("airportRequired"));
      return;
    }
    const flightDate = normalizeDateOnly(form.departureDate);
    if (!flightDate) {
      toast.error(
        zh
          ? "請選擇有效的香港出發日期"
          : "Select a valid Hong Kong departure date"
      );
      return;
    }
    const distanceKm = form.distanceKm
      ? parsePositiveWholeNumber(form.distanceKm)
      : null;
    const durationMinutes = form.durationMinutes
      ? parsePositiveWholeNumber(form.durationMinutes)
      : null;
    if (
      (form.distanceKm && distanceKm === null) ||
      (form.durationMinutes && durationMinutes === null)
    ) {
      toast.error(t("positiveFlightMetricsRequired"));
      return;
    }
    const input = {
      flightNumber: form.flightNumber.trim() || undefined,
      airline: form.airline.trim() || undefined,
      departureAirport,
      arrivalAirport,
      flightDate,
      durationMinutes: durationMinutes ?? undefined,
      distanceKm: distanceKm ?? undefined,
      seatClass: form.seatClass as
        | "economy"
        | "premium_economy"
        | "business"
        | "first",
      notes: form.notes.trim() || undefined,
    };
    if (editingFlight)
      updateFlight.mutate({ flightId: editingFlight.id, ...input });
    else addFlight.mutate(input);
  };
  const previewFlights = tripFlightsQuery.data;
  const previewValid = previewFlights?.filter(
    flight =>
      isIataCode(flight.fromCode) &&
      isIataCode(flight.toCode) &&
      normalizeIataCode(flight.fromCode) !== normalizeIataCode(flight.toCode) &&
      normalizeDateOnly(flight.date)
  );
  const previewEligible = previewValid?.filter(
    flight => normalizeDateOnly(flight.date) <= today
  );
  const previewPlanned = previewValid?.filter(
    flight => normalizeDateOnly(flight.date) > today
  );
  const metricLabel = (source: "recorded" | "estimated" | "unknown") =>
    source === "estimated"
      ? zh
        ? "估算"
        : "estimated"
      : source === "recorded"
        ? zh
          ? "已記錄"
          : "recorded"
        : zh
          ? "未知"
          : "unknown";

  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-5 pb-10 sm:px-6 sm:py-7">
        <section
          className="voyage-hero relative overflow-hidden"
          style={{
            background:
              "linear-gradient(125deg, #14263d 0%, #173d48 58%, #226c5e 100%)",
          }}
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full border border-white/10" />
          <div className="pointer-events-none absolute right-4 top-4 h-28 w-28 rounded-full border border-white/10" />
          <div className="relative">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-white/70">
                {zh ? "VoyageAI · 你的空中旅誌" : "VOYAGEAI · YOUR TRAVEL LOG"}
              </p>
              <Plane className="h-6 w-6 text-white/60" />
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
              {t("flightPassportTitle")}
            </h1>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-white/75">
              {zh
                ? "每一段航線，都是旅程的一頁。整理飛行足跡，從真實紀錄發現你的旅行節奏。"
                : "Every route is a new chapter. Keep your flight memories together and discover patterns in your real travel records."}
            </p>
            <div className="mt-6 flex items-end gap-8 border-t border-white/15 pt-5">
              <div>
                <p className="text-[11px] text-white/65">
                  {zh ? "已過日期航班" : "Past-dated flights"}
                </p>
                <p className="mt-1 text-4xl font-bold tabular-nums">
                  {isLoading || !stats ? "—" : stats.totalFlights}
                </p>
              </div>
              <div className="pb-1">
                <p className="text-xl font-bold tabular-nums">
                  {isLoading || !stats ? "—" : stats.airports}
                </p>
                <p className="mt-1 text-[11px] text-white/65">
                  {zh ? "個機場" : "airports"}
                </p>
              </div>
              <div className="pb-1">
                <p className="text-xl font-bold tabular-nums">
                  {isLoading || !stats ? "—" : stats.planned.length}
                </p>
                <p className="mt-1 text-[11px] text-white/65">
                  {zh ? "班計劃航班" : "planned flights"}
                </p>
              </div>
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-white/55">
              {zh
                ? `香港時間 UTC+8 · ${today} · 統計按下方選定年份；已過日期不等於核實已完成。`
                : `Hong Kong UTC+8 · ${today} · Metrics use your selected year; past date is not verified completion.`}
            </p>
          </div>
        </section>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              resetFlightForm();
              setShowAdd(true);
            }}
            disabled={busy}
            className="gap-2 rounded-full"
          >
            <Plus className="h-4 w-4" />
            {t("record")}
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowTripImport(true)}
            disabled={busy}
            className="gap-2 rounded-full bg-card"
          >
            <Download className="h-4 w-4" />
            {zh ? "從行程匯入" : "Import from a trip"}
          </Button>
          {flights && flights.length === 0 && !flightQuery.isError ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                if (!busy) seedFlights.mutate();
              }}
              className="gap-2 rounded-full bg-card"
            >
              {seedFlights.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plane className="h-4 w-4" />
              )}
              {t("importHistoryFlights")}
            </Button>
          ) : (
            <Button
              variant="outline"
              disabled={busy || isLoading || !flights?.length}
              onClick={() => {
                if (!busy) syncCountries.mutate();
              }}
              className="gap-2 rounded-full bg-card"
            >
              {syncCountries.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {t("syncMap")}
            </Button>
          )}
          <Button
            variant="ghost"
            className="ml-auto hidden gap-2 rounded-full sm:flex"
            onClick={() =>
              toast.info(zh ? "分享功能即將推出" : "Share feature coming soon")
            }
          >
            <Share2 className="h-4 w-4" />
            {t("share")}
          </Button>
        </div>

        <div
          className="-mx-4 overflow-x-auto px-4 pb-1"
          aria-label={zh ? "按年份篩選" : "Filter by year"}
        >
          <div className="flex min-w-max gap-2">
            {yearTabs.map(year => (
              <button
                type="button"
                key={year}
                aria-pressed={activeYear === year}
                onClick={() => setActiveYear(year)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${activeYear === year ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground hover:bg-accent"}`}
              >
                {year === "All-Time" ? (zh ? "全部年份" : "All-time") : year}
                {year !== "All-Time" && yearCounts[year] !== undefined && (
                  <span className="ml-1.5 text-xs opacity-70">
                    {yearCounts[year]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {flightQuery.isError && (
          <div
            className="voyage-panel flex flex-wrap items-center gap-3"
            role="alert"
          >
            <AlertCircle className="h-5 w-5 text-destructive" />
            <p className="flex-1 text-sm">
              {zh ? "未能載入飛行紀錄" : "Could not load your flight records"}:{" "}
              {flightQuery.error.message}
            </p>
            <Button
              variant="outline"
              onClick={() => flightQuery.refetch()}
              disabled={flightQuery.isFetching}
            >
              {zh ? "重試" : "Retry"}
            </Button>
          </div>
        )}
        {isLoading ? (
          <div
            className="space-y-4"
            role="status"
            aria-label={zh ? "正在載入飛行紀錄" : "Loading flight records"}
          >
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[1, 2, 3, 4].map(key => (
                <div
                  key={key}
                  className="h-36 animate-pulse rounded-2xl bg-muted"
                />
              ))}
            </div>
            <div className="h-64 animate-pulse rounded-2xl bg-muted" />
          </div>
        ) : stats && !flightQuery.isError ? (
          <>
            {stats.filtered.length === 0 ? (
              <div className="voyage-panel py-10 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
                  <Plane className="h-7 w-7" />
                </div>
                <h2 className="voyage-section-title">
                  {activeYear === "All-Time"
                    ? t("noFlightRecords")
                    : zh
                      ? `${activeYear} 年沒有飛行紀錄`
                      : `No flights in ${activeYear}`}
                </h2>
                <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
                  {t("noFlightRecordsDesc")}
                </p>
                <Button
                  variant="link"
                  disabled={busy}
                  onClick={() => {
                    resetFlightForm();
                    setShowAdd(true);
                  }}
                >
                  {t("addFlightRecord")}
                </Button>
              </div>
            ) : (
              <>
                {(stats.planned.length > 0 || stats.undated.length > 0) && (
                  <div className="rounded-2xl border border-border bg-accent/50 p-4 text-sm text-accent-foreground">
                    {zh
                      ? `${stats.planned.length} 班計劃航班、${stats.undated.length} 班未定日期紀錄，不納入已過日期距離／時間統計。`
                      : `${stats.planned.length} planned and ${stats.undated.length} undated records are excluded from past-dated distance and time metrics.`}
                  </div>
                )}
                <PassportInsights stats={stats} activeYear={activeYear} />
                <section className="overflow-hidden rounded-2xl bg-slate-950 p-4 text-white sm:p-5">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-white/50">
                        {zh ? "你的空中足跡" : "YOUR FLIGHT FOOTPRINT"}
                      </p>
                      <h2 className="mt-1 text-base font-semibold">
                        {zh ? "航線世界地圖" : "Your world of routes"}
                      </h2>
                    </div>
                    <Globe className="h-5 w-5 text-white/60" />
                  </div>
                  <WorldMap
                    visitedCountries={mapCountries}
                    flightRoutes={flightRoutes}
                    className="w-full overflow-hidden rounded-xl"
                  />
                  <p className="mt-3 text-[11px] text-white/55">
                    {zh
                      ? "地圖只顯示已過日期的有效航線；可按年份查看。"
                      : "Only valid past-dated routes are shown. Filter by year above."}
                  </p>
                </section>
                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="voyage-section-title">
                      {t("flightRecordsTitle")}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {stats.filtered.length} {t("flightsCount")}
                    </p>
                  </div>
                  {stats.filtered.map(flight => {
                    const status = getPassportFlightStatus(flight, today);
                    const metrics = getPassportFlightMetrics(
                      flight,
                      estimateDistance
                    );
                    const dep =
                      normalizeIataCode(flight.departureAirport) || "—";
                    const arr = normalizeIataCode(flight.arrivalAirport) || "—";
                    return (
                      <article key={flight.id} className="voyage-panel !p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-[11px] text-muted-foreground">
                                {flight.flightDate
                                  ? formatFlightDateInHongKong(
                                      flight.flightDate,
                                      lang
                                    )
                                  : zh
                                    ? "日期未知"
                                    : "Date unknown"}
                              </p>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] ${status === "planned" ? "bg-accent text-accent-foreground" : status === "undated" ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}
                              >
                                {status === "planned"
                                  ? zh
                                    ? "計劃"
                                    : "Planned"
                                  : status === "undated"
                                    ? zh
                                      ? "未定日期"
                                      : "Undated"
                                    : zh
                                      ? "已過日期"
                                      : "Past-dated"}
                              </span>
                            </div>
                            <div className="mt-2 flex items-center gap-3">
                              <span className="text-2xl font-bold tracking-tight">
                                {dep}
                              </span>
                              <div className="flex w-14 items-center gap-1">
                                <div className="h-px flex-1 bg-border" />
                                <Plane className="h-3.5 w-3.5 text-primary" />
                                <div className="h-px flex-1 bg-border" />
                              </div>
                              <span className="text-2xl font-bold tracking-tight">
                                {arr}
                              </span>
                            </div>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9"
                              disabled={busy}
                              aria-label={
                                zh
                                  ? `編輯 ${dep} 至 ${arr}`
                                  : `Edit ${dep} to ${arr}`
                              }
                              onClick={() => openEditFlight(flight)}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 text-destructive hover:bg-destructive/10"
                              disabled={busy}
                              aria-label={
                                zh
                                  ? `刪除 ${dep} 至 ${arr}`
                                  : `Delete ${dep} to ${arr}`
                              }
                              onClick={() => {
                                if (
                                  !busy &&
                                  window.confirm(
                                    zh
                                      ? `確定刪除 ${dep} → ${arr} 飛行紀錄？`
                                      : `Delete the ${dep} → ${arr} flight record?`
                                  )
                                )
                                  deleteFlight.mutate({ flightId: flight.id });
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          {flight.flightNumber && (
                            <span className="font-medium text-foreground">
                              {flight.flightNumber}
                            </span>
                          )}
                          <span>
                            {flight.airline ||
                              (zh ? "航空公司未知" : "Airline unknown")}
                          </span>
                          {flight.seatClass && (
                            <span className="rounded bg-muted px-2 py-0.5">
                              {flight.seatClass === "economy"
                                ? t("seatEconomy")
                                : flight.seatClass === "premium_economy"
                                  ? t("seatPremiumEconomy")
                                  : flight.seatClass === "business"
                                    ? t("seatBusiness")
                                    : t("seatFirst")}
                            </span>
                          )}
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 text-xs">
                          <p>
                            {metrics.distance.value !== null
                              ? `${Math.round(metrics.distance.value).toLocaleString()} km`
                              : "— km"}
                            <span className="ml-1 text-[10px] text-muted-foreground">
                              {metricLabel(metrics.distance.source)}
                            </span>
                          </p>
                          <p>
                            {metrics.duration.value !== null
                              ? formatFlightHours(metrics.duration.value)
                              : "—"}
                            <span className="ml-1 text-[10px] text-muted-foreground">
                              {metricLabel(metrics.duration.source)}
                            </span>
                          </p>
                        </div>
                        {flight.notes && (
                          <p className="mt-3 whitespace-pre-wrap break-words border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
                            {flight.notes}
                          </p>
                        )}
                      </article>
                    );
                  })}
                </section>
              </>
            )}
          </>
        ) : null}

        <Dialog
          open={showAdd || Boolean(editingFlight)}
          onOpenChange={open => {
            if (!open && !busy) {
              setShowAdd(false);
              setEditingFlight(null);
              resetFlightForm();
            }
          }}
        >
          <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingFlight ? t("editFlightRecord") : t("addFlightRecord")}
              </DialogTitle>
              <DialogDescription>
                {zh
                  ? "日期一律按香港 UTC+8；機場代碼會自動估算距離及時間，亦可手動修改。"
                  : "Dates use Hong Kong UTC+8. Airport codes auto-estimate distance and time; you can edit both."}
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={event => {
                event.preventDefault();
                saveFlight();
              }}
            >
              <fieldset disabled={busy} className="space-y-4">
                <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
                  <div className="min-w-0">
                    <Label htmlFor="passport-number">{t("flightNumber")}</Label>
                    <Input
                      id="passport-number"
                      className="mt-1.5 w-full uppercase"
                      placeholder="CX 543"
                      autoCapitalize="characters"
                      autoCorrect="off"
                      value={form.flightNumber}
                      onChange={event =>
                        autofill.change("flightNumber", event.target.value)
                      }
                    />
                  </div>
                  <div className="min-w-0">
                    <Label htmlFor="passport-date">
                      {t("departureDate")} *
                    </Label>
                    <Input
                      id="passport-date"
                      className="mt-1.5 w-full"
                      type="date"
                      value={form.departureDate}
                      onChange={event =>
                        autofill.change("departureDate", event.target.value)
                      }
                      required
                    />
                  </div>
                </div>
                <FlightLookupPanel
                  flightNumber={form.flightNumber}
                  date={form.departureDate}
                  sessionKey={`passport:${flightSession}`}
                  open={showAdd || Boolean(editingFlight)}
                  authorized={Boolean(authQuery.data) && !authQuery.isError}
                  disabled={busy}
                  lang={lang}
                  onApply={candidate => {
                    setAutoMetrics(previous => ({
                      distance:
                        candidate.distanceKm !== null &&
                        autofill.canManage("distanceKm")
                          ? false
                          : previous.distance,
                      duration:
                        candidate.durationMinutes !== null &&
                        autofill.canManage("durationMinutes")
                          ? false
                          : previous.duration,
                    }));
                    autofill.applyCandidate(candidate);
                  }}
                />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="passport-departure">
                      {t("departureAirport")} * (IATA)
                    </Label>
                    <Input
                      id="passport-departure"
                      className="mt-1.5 uppercase"
                      placeholder="HKG"
                      value={form.departureAirport}
                      onChange={event =>
                        handleAirportChange(
                          "departureAirport",
                          event.target.value
                        )
                      }
                      maxLength={3}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="passport-arrival">
                      {t("arrivalAirport")} * (IATA)
                    </Label>
                    <Input
                      id="passport-arrival"
                      className="mt-1.5 uppercase"
                      placeholder="NRT"
                      value={form.arrivalAirport}
                      onChange={event =>
                        handleAirportChange(
                          "arrivalAirport",
                          event.target.value
                        )
                      }
                      maxLength={3}
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="passport-airline">{t("airline")}</Label>
                    <Input
                      id="passport-airline"
                      className="mt-1.5"
                      placeholder="Cathay Pacific"
                      value={form.airline}
                      onChange={event =>
                        autofill.change("airline", event.target.value)
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="passport-seat">{t("seatClass")}</Label>
                    <Select
                      value={form.seatClass}
                      onValueChange={seatClass =>
                        setForm({ ...form, seatClass })
                      }
                      disabled={busy}
                    >
                      <SelectTrigger id="passport-seat" className="mt-1.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="economy">
                          {t("seatEconomyFull")}
                        </SelectItem>
                        <SelectItem value="premium_economy">
                          {t("seatPremiumEconomy")}
                        </SelectItem>
                        <SelectItem value="business">
                          {t("seatBusinessFull")}
                        </SelectItem>
                        <SelectItem value="first">
                          {t("seatFirstFull")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="passport-distance">{t("distanceKm")}</Label>
                    <Input
                      id="passport-distance"
                      className="mt-1.5"
                      type="number"
                      min="1"
                      step="1"
                      placeholder={t("autoEstimate")}
                      value={form.distanceKm}
                      onChange={event => {
                        autofill.change("distanceKm", event.target.value);
                        setAutoMetrics({ ...autoMetrics, distance: false });
                      }}
                    />
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {autoMetrics.distance
                        ? zh
                          ? "大圓距離估算"
                          : "Great-circle estimate"
                        : zh
                          ? "已記錄／手動輸入"
                          : "Recorded / manual input"}
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="passport-duration">
                      {t("durationMinutes")}
                    </Label>
                    <Input
                      id="passport-duration"
                      className="mt-1.5"
                      type="number"
                      min="1"
                      step="1"
                      placeholder="165"
                      value={form.durationMinutes}
                      onChange={event => {
                        autofill.change("durationMinutes", event.target.value);
                        setAutoMetrics({ ...autoMetrics, duration: false });
                      }}
                    />
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {autoMetrics.duration
                        ? zh
                          ? "距離推算（非實際時間）"
                          : "Distance-based estimate, not actual"
                        : zh
                          ? "已記錄／手動輸入"
                          : "Recorded / manual input"}
                    </p>
                  </div>
                </div>
                <div>
                  <Label htmlFor="passport-notes">{t("notes")}</Label>
                  <Input
                    id="passport-notes"
                    className="mt-1.5"
                    placeholder={t("optional")}
                    value={form.notes}
                    onChange={event =>
                      setForm({ ...form, notes: event.target.value })
                    }
                  />
                </div>
              </fieldset>
              <p className="rounded-xl bg-accent/50 p-3 text-[11px] leading-relaxed text-muted-foreground">
                {zh
                  ? "自動填入的數值屬估算，並非實際航程數據。留空而且無法估算的資料會保留為未知。"
                  : "Auto-filled values are estimates, not actual flight data. Blank fields with no available estimate remain unknown."}
              </p>
              <Button type="submit" className="w-full" disabled={busy}>
                {addFlight.isPending || updateFlight.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {editingFlight ? t("saveChanges") : t("addFlightRecord")}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog
          open={showTripImport}
          onOpenChange={open => {
            if (!importTripFlights.isPending) setShowTripImport(open);
          }}
        >
          <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {zh
                  ? "從行程匯入飛行護照"
                  : "Import trip flights to your passport"}
              </DialogTitle>
              <DialogDescription>
                {zh
                  ? "資料只需輸入一次。選擇行程並預覽，再明確匯入；重複紀錄會跳過，手動輸入仍然保留。"
                  : "Enter once. Choose a trip, preview its flights, then explicitly import. Duplicates are skipped; manual records stay available."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {tripQuery.isLoading ? (
                <div className="h-10 animate-pulse rounded-xl bg-muted" />
              ) : tripQuery.isError ? (
                <div role="alert" className="text-sm text-destructive">
                  {tripQuery.error.message}
                  <Button
                    variant="link"
                    disabled={tripQuery.isFetching}
                    onClick={() => tripQuery.refetch()}
                  >
                    {zh ? "重試" : "Retry"}
                  </Button>
                </div>
              ) : tripQuery.data?.length ? (
                <Select
                  value={selectedTrip}
                  onValueChange={selected => {
                    setSelectedTrip(selected);
                    importTripFlights.reset();
                  }}
                  disabled={busy}
                >
                  <SelectTrigger
                    aria-label={zh ? "選擇來源行程" : "Choose source trip"}
                  >
                    <SelectValue
                      placeholder={zh ? "選擇一個行程" : "Choose a trip"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {tripQuery.data.map(trip => (
                      <SelectItem key={trip.id} value={String(trip.id)}>
                        {trip.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">
                  {zh
                    ? "未有行程；可以先手動記錄航班。"
                    : "No trips yet. You can still add flights manually."}
                </p>
              )}
              {selectedTrip && (
                <>
                  <Link
                    href={`/trips/${selectedTrip}/flights`}
                    className="inline-flex items-center gap-2 text-sm font-medium text-primary"
                    onClick={event => {
                      if (busy) event.preventDefault();
                    }}
                  >
                    {zh
                      ? "查看／編輯這個行程的航班"
                      : "View / edit this trip’s flights"}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  {tripFlightsQuery.isLoading ? (
                    <div className="h-28 animate-pulse rounded-xl bg-muted" />
                  ) : tripFlightsQuery.isError ? (
                    <div role="alert" className="text-sm text-destructive">
                      {tripFlightsQuery.error.message}
                      <Button
                        variant="link"
                        disabled={tripFlightsQuery.isFetching}
                        onClick={() => tripFlightsQuery.refetch()}
                      >
                        {zh ? "重試" : "Retry"}
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="rounded-xl border border-border p-3">
                        <p className="text-xs text-muted-foreground">
                          {zh
                            ? `已選行程共 ${previewFlights?.length ?? 0} 班 · ${previewEligible?.length ?? 0} 班已過日期及格式有效 · ${previewPlanned?.length ?? 0} 班計劃將跳過（最終由伺服器檢查）`
                            : `${previewFlights?.length ?? 0} flights · ${previewEligible?.length ?? 0} past-dated with valid fields · ${previewPlanned?.length ?? 0} planned to skip (server validates final result)`}
                        </p>
                        <div className="mt-3 max-h-60 space-y-2 overflow-y-auto">
                          {previewFlights?.map(flight => (
                            <div
                              key={flight.id}
                              className="rounded-lg bg-muted/60 p-3"
                            >
                              <p className="text-sm font-semibold">
                                {normalizeIataCode(flight.fromCode) || "—"} →{" "}
                                {normalizeIataCode(flight.toCode) || "—"}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {flight.flightNumber || "—"} ·{" "}
                                {flight.airline ||
                                  (zh
                                    ? "航空公司未知"
                                    : "Airline unknown")}{" "}
                                ·{" "}
                                {normalizeDateOnly(flight.date) ||
                                  (zh ? "日期未完整" : "Incomplete date")}
                              </p>
                            </div>
                          ))}
                        </div>
                        {!previewFlights?.length && (
                          <p className="mt-3 text-sm text-muted-foreground">
                            {zh
                              ? "此行程未有航班，可先前往航班頁新增。"
                              : "This trip has no flights. Add them on its flights page first."}
                          </p>
                        )}
                      </div>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {zh
                          ? "確認後只匯入已過日期的有效航班；重複及未來日期會跳過。計劃航班保留在行程中，旅程後可再匯入。"
                          : "Only valid past-dated flights are imported. Duplicates and future dates are skipped. Planned flights stay in your trip; import them after travel."}
                      </p>
                      <Button
                        className="w-full gap-2"
                        disabled={
                          busy ||
                          !previewFlights?.length ||
                          !previewEligible?.length ||
                          tripFlightsQuery.isFetching
                        }
                        onClick={() => {
                          if (!busy && selectedTrip && previewEligible?.length)
                            importTripFlights.mutate({
                              tripId: Number(selectedTrip),
                            });
                        }}
                      >
                        {importTripFlights.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                        {zh
                          ? "確認匯入已選行程"
                          : "Confirm selected trip import"}
                      </Button>
                      {importTripFlights.data && (
                        <p
                          role="status"
                          className="rounded-xl bg-accent p-3 text-sm text-accent-foreground"
                        >
                          {zh
                            ? `新增 ${importTripFlights.data.created} 班 · 跳過 ${importTripFlights.data.skipped} 班（重複或未來日期）· 無效 ${importTripFlights.data.invalid} 班`
                            : `Created ${importTripFlights.data.created} · skipped ${importTripFlights.data.skipped} (duplicates or future dates) · invalid ${importTripFlights.data.invalid}`}
                        </p>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={Boolean(importResult)}
          onOpenChange={open => {
            if (!open) setImportResult(null);
          }}
        >
          <DialogContent className="rounded-2xl sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{t("importComplete")}</DialogTitle>
              <DialogDescription>
                {zh
                  ? "已保留歷史航班，並同步旅遊足跡地圖。"
                  : "Historical flights saved and travel map synchronized."}
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-accent p-4 text-center">
                <p className="text-3xl font-bold text-primary">
                  {importResult?.flights}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("flightsImported")}
                </p>
              </div>
              <div className="rounded-xl bg-accent p-4 text-center">
                <p className="text-3xl font-bold text-primary">
                  {importResult?.countries}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("countriesAddedToMap")}
                </p>
              </div>
            </div>
            <p className="text-center text-xs text-muted-foreground">
              {zh
                ? "前往「旅遊足跡」查看已同步的國家。"
                : "See your synchronized countries in Travel History."}
            </p>
            <Button className="w-full" onClick={() => setImportResult(null)}>
              {t("great")}
            </Button>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
