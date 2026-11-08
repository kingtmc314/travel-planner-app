import BookingImportDialog from "@/components/BookingImportDialog";
import FlightLookupPanel from "@/components/FlightLookupPanel";
import { useFlightAutofill } from "@/hooks/useFlightAutofill";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
  Trash2,
  Loader2,
  Plane,
  Hotel,
  ArrowRight,
  Edit2,
  Copy,
  ArrowLeftRight,
  BookOpen,
  CalendarDays,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  formatDateOnlyInHongKong,
  getHongKongToday,
  normalizeDateOnly,
} from "@/lib/hongKongDate";
import {
  buildLogisticsInsights,
  deriveHotelNights,
  hotelNightInfo,
  normalizeIata,
  normalizeLogisticsDate,
  returnFlightDefaults,
  validateFlightRoute,
  validateHotelDates,
} from "@/lib/logisticsInsights";

const bookingMarkerLines = (notes: string | null | undefined) =>
  (notes ?? "")
    .split(/\r?\n/)
    .filter(line => /^\[voyageai:booking:/.test(line.trim()));
const visibleBookingNotes = (notes: string | null | undefined) =>
  (notes ?? "")
    .split(/\r?\n/)
    .filter(line => !/^\[voyageai:booking:/.test(line.trim()))
    .join("\n")
    .trim();
const preserveBookingMarkers = (
  notes: string,
  original: string | null | undefined
) =>
  [visibleBookingNotes(notes), ...bookingMarkerLines(original)]
    .filter(Boolean)
    .join("\n");

const defaultFlight = {
  flightNumber: "",
  airline: "",
  fromCode: "",
  fromCity: "",
  toCode: "",
  toCity: "",
  date: "",
  departTime: "",
  arriveTime: "",
  duration: "",
  notes: "",
  type: "outbound" as "outbound" | "return" | "connecting",
};
const defaultHotel = {
  name: "",
  city: "",
  checkIn: "",
  checkOut: "",
  nights: "",
  notes: "",
};
type ImportSummary = { created: number; skipped: number; invalid: number };
type SyncSummary = ImportSummary & { updated: number };

export default function FlightsPage({ tripId }: { tripId: number }) {
  const { t, lang } = useI18n();
  const copy = (zh: string, en: string) => (lang === "zh" ? zh : en);
  const utils = trpc.useUtils();
  const flightsQuery = trpc.flights.list.useQuery({ tripId });
  const hotelsQuery = trpc.hotels.list.useQuery({ tripId });
  const tripQuery = trpc.trips.get.useQuery({ tripId });
  const flights = flightsQuery.data;
  const hotels = hotelsQuery.data;
  const trip = tripQuery.data;
  const canEdit =
    !tripQuery.isError &&
    (trip?.userRole === "owner" || trip?.userRole === "editor");
  const canImportPassport = !tripQuery.isError && Boolean(trip?.userRole);
  const [showAddFlight, setShowAddFlight] = useState(false);
  const [showAddHotel, setShowAddHotel] = useState(false);
  const [showBookingImport, setShowBookingImport] = useState(false);
  const [editingFlight, setEditingFlight] = useState<
    NonNullable<typeof flights>[number] | null
  >(null);
  const [editingHotel, setEditingHotel] = useState<
    NonNullable<typeof hotels>[number] | null
  >(null);
  const [flightForm, setFlightForm] = useState(defaultFlight);
  const [hotelForm, setHotelForm] = useState(defaultHotel);
  const [flightSession, setFlightSession] = useState(0);
  const autofill = useFlightAutofill({
    form: flightForm,
    setForm: setFlightForm,
    numberField: "flightNumber",
    dateField: "date",
    sessionKey: `trip:${tripId}:${flightSession}`,
    open: (showAddFlight || Boolean(editingFlight)) && trip?.id === tripId,
    authorized: canEdit,
    mapCandidate: candidate => ({
      airline: candidate.airline,
      fromCode: candidate.fromCode,
      fromCity: candidate.fromCity,
      toCode: candidate.toCode,
      toCity: candidate.toCity,
      departTime: candidate.departTime,
      arriveTime: candidate.arriveTime,
      duration:
        candidate.durationMinutes === null
          ? ""
          : `${Math.floor(candidate.durationMinutes / 60)}h ${candidate.durationMinutes % 60}m`,
    }),
  });
  const [passportSummary, setPassportSummary] = useState<ImportSummary | null>(
    null
  );
  const [syncSummary, setSyncSummary] = useState<SyncSummary | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  useEffect(() => {
    setShowAddFlight(false);
    setShowAddHotel(false);
    setShowBookingImport(false);
    setEditingFlight(null);
    setEditingHotel(null);
    setFlightForm(defaultFlight);
    setFlightSession(value => value + 1);
    setHotelForm(defaultHotel);
    setPassportSummary(null);
    setSyncSummary(null);
    setConnectionError(null);
  }, [tripId]);
  const today = getHongKongToday();
  const insights = useMemo(
    () => buildLogisticsInsights(flights ?? [], hotels ?? [], today),
    [flights, hotels, today]
  );
  const showError = (label: string, error: { message: string }) =>
    toast.error(`${label}: ${error.message}`);
  const invalidate = () => {
    void utils.invalidate();
  };

  const addFlight = trpc.flights.add.useMutation({
    onSuccess: () => {
      invalidate();
      setShowAddFlight(false);
      setFlightForm(defaultFlight);
      toast.success(t("flightAdded"));
    },
    onError: error => showError(t("addFailed"), error),
  });
  const updateFlight = trpc.flights.update.useMutation({
    onSuccess: () => {
      invalidate();
      setEditingFlight(null);
      toast.success(t("flightUpdated"));
    },
    onError: error => showError(t("updateFailed"), error),
  });
  const deleteFlight = trpc.flights.delete.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success(t("flightDeleted"));
    },
    onError: error =>
      showError(copy("刪除航班失敗", "Could not delete flight"), error),
  });
  const addHotel = trpc.hotels.add.useMutation({
    onSuccess: () => {
      invalidate();
      setShowAddHotel(false);
      setHotelForm(defaultHotel);
      toast.success(t("hotelAdded"));
    },
    onError: error => showError(t("addFailed"), error),
  });
  const updateHotel = trpc.hotels.update.useMutation({
    onSuccess: () => {
      invalidate();
      setEditingHotel(null);
      toast.success(t("hotelUpdated"));
    },
    onError: error => showError(t("updateFailed"), error),
  });
  const deleteHotel = trpc.hotels.delete.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success(t("hotelDeleted"));
    },
    onError: error =>
      showError(copy("刪除住宿失敗", "Could not delete accommodation"), error),
  });
  const importPassport = trpc.connected.importFlightsToPassport.useMutation({
    onSuccess: result => {
      setPassportSummary(result);
      setConnectionError(null);
      invalidate();
      toast.success(copy("航班匯入已完成", "Flight import completed"));
    },
    onError: error => {
      const message = `${copy("匯入護照失敗", "Passport import failed")}: ${error.message}`;
      setConnectionError(message);
      toast.error(message);
    },
  });
  const syncLogistics = trpc.connected.syncLogisticsToItinerary.useMutation({
    onSuccess: result => {
      setSyncSummary(result);
      setConnectionError(null);
      invalidate();
      toast.success(copy("行程同步已完成", "Itinerary sync completed"));
    },
    onError: error => {
      const message = `${copy("同步行程失敗", "Itinerary sync failed")}: ${error.message}`;
      setConnectionError(message);
      toast.error(message);
    },
  });
  const busy =
    addFlight.isPending ||
    updateFlight.isPending ||
    deleteFlight.isPending ||
    addHotel.isPending ||
    updateHotel.isPending ||
    deleteHotel.isPending ||
    importPassport.isPending ||
    syncLogistics.isPending;
  const derivedFormNights = deriveHotelNights(
    hotelForm.checkIn,
    hotelForm.checkOut
  );
  const bothHotelDates = Boolean(hotelForm.checkIn && hotelForm.checkOut);
  const formDateError = validateHotelDates(
    hotelForm.checkIn,
    hotelForm.checkOut
  );
  const dateLabel = (value: string | Date | null | undefined) =>
    formatDateOnlyInHongKong(normalizeLogisticsDate(value), lang) || "—";

  const validatedFlight = () => {
    const routeError = validateFlightRoute(
      flightForm.fromCode,
      flightForm.toCode
    );
    if (routeError) {
      toast.error(
        routeError === "sameAirport"
          ? copy(
              "出發及抵達機場不可相同",
              "Departure and arrival airports must differ"
            )
          : copy(
              "請輸入有效的 3 位英文字母 IATA 機場代碼",
              "Enter valid three-letter IATA airport codes"
            )
      );
      return null;
    }
    if (flightForm.date && !normalizeDateOnly(flightForm.date)) {
      toast.error(copy("請輸入有效航班日期", "Enter a valid flight date"));
      return null;
    }
    return {
      ...flightForm,
      fromCode: normalizeIata(flightForm.fromCode),
      toCode: normalizeIata(flightForm.toCode),
      flightNumber: flightForm.flightNumber.trim().toUpperCase(),
      airline: flightForm.airline.trim(),
      date: normalizeDateOnly(flightForm.date),
    };
  };
  const handleAddFlight = () => {
    if (!canEdit || busy) return;
    const payload = validatedFlight();
    if (payload) addFlight.mutate({ tripId, ...payload });
  };
  const handleUpdateFlight = () => {
    if (!canEdit || busy || !editingFlight) return;
    const payload = validatedFlight();
    if (payload)
      updateFlight.mutate({
        flightId: editingFlight.id,
        tripId,
        ...payload,
        notes: preserveBookingMarkers(payload.notes, editingFlight.notes),
      });
  };
  const validatedHotel = () => {
    if (!hotelForm.name.trim()) {
      toast.error(copy("請填寫酒店名稱", "Please enter hotel name"));
      return null;
    }
    if (formDateError) {
      toast.error(
        formDateError === "invalidRange"
          ? copy("退房日期必須遲於入住日期", "Check-out must be after check-in")
          : copy("請輸入有效住宿日期", "Enter valid accommodation dates")
      );
      return null;
    }
    const manualNights = hotelForm.nights
      ? Number(hotelForm.nights)
      : undefined;
    if (
      !bothHotelDates &&
      manualNights !== undefined &&
      (!Number.isInteger(manualNights) || manualNights < 1)
    ) {
      toast.error(
        copy(
          "手動夜數必須是大於零的整數",
          "Manual nights must be a positive whole number"
        )
      );
      return null;
    }
    return {
      ...hotelForm,
      name: hotelForm.name.trim(),
      city: hotelForm.city.trim(),
      checkIn: normalizeDateOnly(hotelForm.checkIn),
      checkOut: normalizeDateOnly(hotelForm.checkOut),
      nights: derivedFormNights ?? manualNights,
    };
  };
  const handleAddHotel = () => {
    if (!canEdit || busy) return;
    const payload = validatedHotel();
    if (payload) addHotel.mutate({ tripId, ...payload });
  };
  const handleUpdateHotel = () => {
    if (!canEdit || busy || !editingHotel) return;
    const payload = validatedHotel();
    if (payload)
      updateHotel.mutate({
        accId: editingHotel.id,
        tripId,
        ...payload,
        notes: preserveBookingMarkers(payload.notes, editingHotel.notes),
      });
  };

  const flightToForm = (
    flight: NonNullable<typeof flights>[number]
  ): typeof defaultFlight => ({
    flightNumber: flight.flightNumber ?? "",
    airline: flight.airline ?? "",
    fromCode: normalizeIata(flight.fromCode),
    fromCity: flight.fromCity ?? "",
    toCode: normalizeIata(flight.toCode),
    toCity: flight.toCity ?? "",
    date: normalizeLogisticsDate(flight.date),
    departTime: flight.departTime ?? "",
    arriveTime: flight.arriveTime ?? "",
    duration: flight.duration ?? "",
    notes: visibleBookingNotes(flight.notes),
    type: flight.type ?? "outbound",
  });
  const hotelToForm = (
    hotel: NonNullable<typeof hotels>[number]
  ): typeof defaultHotel => ({
    name: hotel.name ?? "",
    city: hotel.city ?? "",
    checkIn: normalizeLogisticsDate(hotel.checkIn),
    checkOut: normalizeLogisticsDate(hotel.checkOut),
    nights: hotelNightInfo(hotel).nights?.toString() ?? "",
    notes: visibleBookingNotes(hotel.notes),
  });
  const openAddFlight = () => {
    if (!canEdit || busy) return;
    const previous = flights?.[flights.length - 1];
    setFlightSession(value => value + 1);
    setEditingFlight(null);
    setFlightForm({
      ...defaultFlight,
      date: normalizeLogisticsDate(trip?.startDate),
      airline: previous?.airline ?? "",
      fromCode: normalizeIata(previous?.toCode),
      fromCity: previous?.toCity ?? "",
    });
    setShowAddFlight(true);
  };
  const openEditFlight = (flight: NonNullable<typeof flights>[number]) => {
    if (!canEdit || busy) return;
    setShowAddFlight(false);
    setFlightSession(value => value + 1);
    setEditingFlight(flight);
    setFlightForm(flightToForm(flight));
  };
  const duplicateFlight = (flight: NonNullable<typeof flights>[number]) => {
    if (!canEdit || busy) return;
    setEditingFlight(null);
    setFlightSession(value => value + 1);
    setFlightForm({
      ...flightToForm(flight),
      date:
        normalizeLogisticsDate(flight.date) ||
        normalizeLogisticsDate(trip?.startDate),
    });
    setShowAddFlight(true);
  };
  const addReturnFlight = (flight: NonNullable<typeof flights>[number]) => {
    if (!canEdit || busy) return;
    setEditingFlight(null);
    setFlightSession(value => value + 1);
    setFlightForm({
      ...defaultFlight,
      ...returnFlightDefaults(flight, trip?.endDate),
    });
    setShowAddFlight(true);
  };
  const openAddHotel = () => {
    if (!canEdit || busy) return;
    const checkIn = normalizeLogisticsDate(trip?.startDate);
    const checkOut = normalizeLogisticsDate(trip?.endDate);
    setEditingHotel(null);
    setHotelForm({
      ...defaultHotel,
      city: trip?.destination ?? "",
      checkIn,
      checkOut,
      nights: deriveHotelNights(checkIn, checkOut)?.toString() ?? "",
    });
    setShowAddHotel(true);
  };
  const openEditHotel = (hotel: NonNullable<typeof hotels>[number]) => {
    if (!canEdit || busy) return;
    setShowAddHotel(false);
    setEditingHotel(hotel);
    setHotelForm(hotelToForm(hotel));
  };
  const duplicateHotel = (hotel: NonNullable<typeof hotels>[number]) => {
    if (!canEdit || busy) return;
    setEditingHotel(null);
    const checkIn =
      normalizeLogisticsDate(hotel.checkIn) ||
      normalizeLogisticsDate(trip?.startDate);
    const checkOut =
      normalizeLogisticsDate(hotel.checkOut) ||
      normalizeLogisticsDate(trip?.endDate);
    setHotelForm({
      ...hotelToForm(hotel),
      city: hotel.city ?? trip?.destination ?? "",
      checkIn,
      checkOut,
      nights:
        deriveHotelNights(checkIn, checkOut)?.toString() ??
        hotelNightInfo(hotel).nights?.toString() ??
        "",
    });
    setShowAddHotel(true);
  };
  const updateHotelDate = (key: "checkIn" | "checkOut", value: string) => {
    const next = { ...hotelForm, [key]: value };
    const nights = deriveHotelNights(next.checkIn, next.checkOut);
    setHotelForm({
      ...next,
      nights: nights !== null ? String(nights) : next.nights,
    });
  };
  const removeFlight = (flightId: number) => {
    if (
      !canEdit ||
      busy ||
      !window.confirm(copy("確定刪除這個航班？", "Delete this flight?"))
    )
      return;
    deleteFlight.mutate({ flightId, tripId });
  };
  const removeHotel = (accId: number) => {
    if (
      !canEdit ||
      busy ||
      !window.confirm(copy("確定刪除這個住宿？", "Delete this accommodation?"))
    )
      return;
    deleteHotel.mutate({ accId, tripId });
  };
  const typeLabel: Record<string, string> = {
    outbound: t("flightOutbound"),
    return: t("flightReturn"),
    connecting: t("flightConnecting"),
  };
  const typeColor: Record<string, string> = {
    outbound: "bg-primary/10 text-primary",
    return: "bg-accent text-accent-foreground",
    connecting: "bg-secondary text-secondary-foreground",
  };

  const flightFormJSX = (
    <fieldset disabled={!canEdit || busy} className="space-y-4 mt-2 min-w-0">
      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
        <div className="min-w-0">
          <Label htmlFor="flight-number">{t("flightNumber")}</Label>
          <Input
            id="flight-number"
            className="mt-1.5 w-full uppercase"
            placeholder="CX100"
            autoCapitalize="characters"
            autoCorrect="off"
            value={flightForm.flightNumber}
            onChange={e =>
              autofill.change("flightNumber", e.target.value.toUpperCase())
            }
          />
        </div>
        <div className="min-w-0">
          <Label htmlFor="flight-date">{t("flightDate")}</Label>
          <Input
            id="flight-date"
            className="mt-1.5 w-full"
            type="date"
            value={flightForm.date}
            onChange={e => autofill.change("date", e.target.value)}
          />
        </div>
      </div>
      <FlightLookupPanel
        flightNumber={flightForm.flightNumber}
        date={flightForm.date}
        tripId={tripId}
        sessionKey={`trip:${tripId}:${flightSession}`}
        open={(showAddFlight || Boolean(editingFlight)) && trip?.id === tripId}
        authorized={canEdit}
        disabled={busy}
        lang={lang}
        onApply={autofill.applyCandidate}
      />
      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
        <div className="min-w-0">
          <Label htmlFor="flight-airline">{t("airline")}</Label>
          <Input
            id="flight-airline"
            className="mt-1.5"
            placeholder={copy("國泰航空", "Cathay Pacific")}
            value={flightForm.airline}
            onChange={e => autofill.change("airline", e.target.value)}
          />
        </div>
        <div className="min-w-0">
          <Label htmlFor="flight-type">{t("flightType")}</Label>
          <Select
            disabled={!canEdit || busy}
            value={flightForm.type}
            onValueChange={v =>
              setFlightForm({
                ...flightForm,
                type: v as typeof flightForm.type,
              })
            }
          >
            <SelectTrigger id="flight-type" className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="outbound">{t("flightOutbound")}</SelectItem>
              <SelectItem value="return">{t("flightReturn")}</SelectItem>
              <SelectItem value="connecting">
                {t("flightConnecting")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="flight-from">{t("fromAirport")} *</Label>
          <Input
            id="flight-from"
            className="mt-1.5 uppercase"
            placeholder="HKG"
            autoCapitalize="characters"
            autoCorrect="off"
            maxLength={10}
            value={flightForm.fromCode}
            onChange={e =>
              autofill.change("fromCode", normalizeIata(e.target.value))
            }
          />
        </div>
        <div>
          <Label htmlFor="flight-from-city">{t("fromCity")}</Label>
          <Input
            id="flight-from-city"
            className="mt-1.5"
            placeholder="Hong Kong"
            value={flightForm.fromCity}
            onChange={e => autofill.change("fromCity", e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="flight-to">{t("toAirport")} *</Label>
          <Input
            id="flight-to"
            className="mt-1.5 uppercase"
            placeholder="NRT"
            autoCapitalize="characters"
            autoCorrect="off"
            maxLength={10}
            value={flightForm.toCode}
            onChange={e =>
              autofill.change("toCode", normalizeIata(e.target.value))
            }
          />
        </div>
        <div>
          <Label htmlFor="flight-to-city">{t("toCity")}</Label>
          <Input
            id="flight-to-city"
            className="mt-1.5"
            placeholder="Tokyo"
            value={flightForm.toCity}
            onChange={e => autofill.change("toCity", e.target.value)}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {copy(
          "機場代碼會自動轉為大寫；出發及抵達機場不可相同。",
          "Airport codes are normalized to uppercase; departure and arrival must differ."
        )}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="flight-depart">{t("departTime")}</Label>
          <Input
            id="flight-depart"
            className="mt-1.5"
            type="time"
            value={flightForm.departTime}
            onChange={e => autofill.change("departTime", e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="flight-arrive">{t("arriveTime")}</Label>
          <Input
            id="flight-arrive"
            className="mt-1.5"
            type="time"
            value={flightForm.arriveTime}
            onChange={e => autofill.change("arriveTime", e.target.value)}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {copy(
          "日期及時間以香港時間（UTC+8）記錄，不會推算飛行時數。",
          "Dates and times are recorded in Hong Kong time (UTC+8); flight duration is not inferred."
        )}
      </p>
      <div>
        <Label htmlFor="flight-duration">
          {copy("飛行時長（紀錄／手動）", "Flight duration (saved / manual)")}
        </Label>
        <Input
          id="flight-duration"
          className="mt-1.5"
          placeholder={copy("例如：4 小時 30 分鐘", "e.g. 4h 30m")}
          value={flightForm.duration}
          onChange={e => autofill.change("duration", e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="flight-notes">{t("activityNotes")}</Label>
        <Input
          id="flight-notes"
          className="mt-1.5"
          placeholder={t("activityNotesPlaceholder")}
          value={flightForm.notes}
          onChange={e =>
            setFlightForm({ ...flightForm, notes: e.target.value })
          }
        />
      </div>
    </fieldset>
  );
  const hotelFormJSX = (
    <fieldset disabled={!canEdit || busy} className="space-y-4 mt-2 min-w-0">
      <div>
        <Label htmlFor="hotel-name">{t("hotelName")} *</Label>
        <Input
          id="hotel-name"
          className="mt-1.5"
          placeholder={copy("例：東京酒店", "e.g. Tokyo Hotel")}
          value={hotelForm.name}
          onChange={e => setHotelForm({ ...hotelForm, name: e.target.value })}
        />
      </div>
      <div>
        <Label htmlFor="hotel-city">{t("hotelCity")}</Label>
        <Input
          id="hotel-city"
          className="mt-1.5"
          placeholder={copy("城市名稱", "City name")}
          value={hotelForm.city}
          onChange={e => setHotelForm({ ...hotelForm, city: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="hotel-in">{t("checkIn")}</Label>
          <Input
            id="hotel-in"
            className="mt-1.5"
            type="date"
            value={hotelForm.checkIn}
            onChange={e => updateHotelDate("checkIn", e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="hotel-out">{t("checkOut")}</Label>
          <Input
            id="hotel-out"
            className="mt-1.5"
            type="date"
            min={hotelForm.checkIn || undefined}
            aria-invalid={Boolean(formDateError)}
            value={hotelForm.checkOut}
            onChange={e => updateHotelDate("checkOut", e.target.value)}
          />
        </div>
      </div>
      {formDateError && (
        <p role="alert" className="text-xs text-destructive">
          {copy(
            "請使用有效日期，並確保退房遲於入住。",
            "Use valid dates, with check-out after check-in."
          )}
        </p>
      )}
      <div>
        <Label htmlFor="hotel-nights">
          {t("nights")} ·{" "}
          {bothHotelDates
            ? copy("按日期計算", "Calculated from dates")
            : copy("手動估算", "Manual estimate")}
        </Label>
        <Input
          id="hotel-nights"
          className="mt-1.5"
          type="number"
          min="1"
          step="1"
          placeholder={bothHotelDates ? "—" : "3"}
          readOnly={bothHotelDates}
          aria-readonly={bothHotelDates}
          value={
            bothHotelDates
              ? (derivedFormNights?.toString() ?? "")
              : hotelForm.nights
          }
          onChange={e => setHotelForm({ ...hotelForm, nights: e.target.value })}
        />
        <p className="mt-1.5 text-xs text-muted-foreground">
          {copy(
            "填齊日期後自動計算夜數；日期不足時可手動估算，但不計入日期夜數總覽。",
            "Both dates calculate nights automatically. Manual estimates without complete dates are excluded from the dated-night total."
          )}
        </p>
      </div>
      <div>
        <Label htmlFor="hotel-notes">{t("activityNotes")}</Label>
        <Input
          id="hotel-notes"
          className="mt-1.5"
          placeholder={t("activityNotesPlaceholder")}
          value={hotelForm.notes}
          onChange={e => setHotelForm({ ...hotelForm, notes: e.target.value })}
        />
      </div>
    </fieldset>
  );
  const skeleton = (
    <div
      className="space-y-3"
      aria-busy="true"
      aria-label={copy("正在載入", "Loading")}
    >
      <div className="voyage-panel h-36 animate-pulse bg-muted/60" />
      <div className="voyage-panel h-36 animate-pulse bg-muted/60" />
    </div>
  );

  return (
    <div className="px-4 sm:px-6 py-5 sm:py-7 max-w-5xl mx-auto space-y-5">
      <BookingImportDialog
        key={tripId}
        tripId={tripId}
        open={showBookingImport}
        onOpenChange={setShowBookingImport}
        canEdit={canEdit}
        existingFlights={flights ?? []}
        existingHotels={hotels ?? []}
      />
      <section className="voyage-hero relative overflow-hidden">
        <Plane
          aria-hidden="true"
          className="absolute right-5 top-5 h-20 w-20 rotate-[-20deg] opacity-10"
        />
        <p className="text-[10px] uppercase tracking-[0.24em] text-white/70">
          {copy("旅途手記 · 航班與住宿", "TRAVEL JOURNAL · FLIGHTS & STAYS")}
        </p>
        <h2 className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight">
          {t("flightsTitle")}
        </h2>
        <p className="mt-2 max-w-lg text-sm leading-relaxed text-white/80">
          {copy(
            "航班、住宿輸入一次，按需要同步到行程，已完成的飛行再匯入你的個人護照。",
            "Enter flights and stays once. Sync them to your itinerary and add completed flights to your personal passport when ready."
          )}
        </p>
        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs text-white/85">
          <CalendarDays className="h-3.5 w-3.5" />
          {copy("香港日期 · UTC+8", "Hong Kong dates · UTC+8")}
        </div>
      </section>

      <section className="voyage-panel flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div className="min-w-0">
          <p className="voyage-eyebrow">{copy("預訂匯入", "BOOKING IMPORT")}</p>
          <p className="mt-1 text-sm font-semibold">
            {copy(
              "截圖／相片、PDF、電郵檔案或貼上確認電郵",
              "Screenshot / photo, PDF, email file or pasted confirmation"
            )}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {copy(
              "先解析再編輯及確認；不連接郵箱，不建立支出。",
              "Parse, edit and confirm first. No mailbox connection or expenses created."
            )}
          </p>
          {!canEdit && !tripQuery.isPending && (
            <p className="mt-1 text-xs text-muted-foreground">
              {copy(
                "唯讀：只有擁有人或編輯者可匯入。",
                "Read-only: import requires an owner or editor."
              )}
            </p>
          )}
        </div>
        <Button
          className="gap-2 shrink-0"
          disabled={!canEdit || busy}
          onClick={() => setShowBookingImport(true)}
        >
          <Plus className="h-4 w-4" />
          {copy("匯入預訂", "Import booking")}
        </Button>
      </section>
      <section
        className="grid grid-cols-3 gap-2 sm:gap-3"
        aria-label={copy("物流摘要", "Logistics summary")}
      >
        <div className="voyage-metric min-w-0 p-3 sm:p-4">
          <Plane className="h-4 w-4 text-primary mb-2" />
          <p className="text-2xl sm:text-3xl font-bold tabular-nums">
            {flightsQuery.isPending || flightsQuery.isError
              ? "—"
              : insights.flightSegments}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {copy("已記錄航段", "Recorded segments")}
          </p>
        </div>
        <div className="voyage-metric min-w-0 p-3 sm:p-4">
          <ShieldCheck className="h-4 w-4 text-primary mb-2" />
          <p className="text-2xl sm:text-3xl font-bold tabular-nums">
            {flightsQuery.isPending || flightsQuery.isError
              ? "—"
              : insights.airlines.length}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {copy("已填航空公司", "Named airlines")}
          </p>
        </div>
        <div className="voyage-metric min-w-0 p-3 sm:p-4">
          <Hotel className="h-4 w-4 text-primary mb-2" />
          <p className="text-2xl sm:text-3xl font-bold tabular-nums">
            {hotelsQuery.isPending ||
            hotelsQuery.isError ||
            (Boolean(hotels?.length) && !insights.datedHotels)
              ? "—"
              : insights.hotelNights}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {copy("按日期住宿晚數", "Nights from dates")}
          </p>
        </div>
      </section>
      {((flights && insights.airlines.length > 0) ||
        (hotels && insights.incompleteHotels > 0)) && (
        <div className="space-y-1 px-1 text-xs leading-relaxed text-muted-foreground">
          {insights.airlines.length > 0 && (
            <p className="break-words">
              {copy("航空公司：", "Airlines: ")}
              {insights.airlines.join(" · ")}
            </p>
          )}
          {insights.incompleteHotels > 0 && (
            <p>
              {copy(
                `${insights.incompleteHotels} 個住宿未有有效完整日期，不計入晚數總覽。`,
                `${insights.incompleteHotels} stays lack valid full dates and are excluded from the night total.`
              )}
            </p>
          )}
        </div>
      )}

      <section className="voyage-panel space-y-4">
        <div>
          <p className="voyage-eyebrow">
            {copy("資料互通", "CONNECTED TRAVEL")}
          </p>
          <h3 className="voyage-section-title mt-1">
            {copy("一次輸入，隨你連繫", "One entry, connected by you")}
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {copy(
              "只有按下按鈕才會匯入或同步。你仍可手動管理航班、住宿和行程。",
              "Nothing is imported or synced automatically. Manual flight, stay and itinerary editing remains available."
            )}
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-accent/40 p-4 min-w-0">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <BookOpen className="h-4 w-4 text-primary" />
              {copy("個人飛行護照", "Personal flight passport")}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {copy(
                "只匯入已完成的航班；未來航班及護照內已有的重複紀錄會跳過，不會自動記錄未來飛行。",
                "Imports completed flights only. Future flights and existing passport duplicates are skipped; future flights are never recorded automatically."
              )}
            </p>
            {flights && (
              <p className="mt-2 text-xs text-primary">
                {copy(
                  `已過日期候選 ${insights.completedFlights} · 今日／未來 ${insights.upcomingFlights} · 資料不足 ${insights.incompleteFlights}`,
                  `Past-date candidates ${insights.completedFlights} · Today/future ${insights.upcomingFlights} · Incomplete ${insights.incompleteFlights}`
                )}
              </p>
            )}
            <Button
              className="w-full mt-3 gap-2 whitespace-normal h-auto min-h-10 py-2"
              disabled={
                !canImportPassport ||
                busy ||
                flightsQuery.isPending ||
                flightsQuery.isError ||
                !flights?.length
              }
              onClick={() => {
                if (!canImportPassport || busy) return;
                setConnectionError(null);
                setPassportSummary(null);
                importPassport.mutate({ tripId });
              }}
            >
              {importPassport.isPending ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              ) : (
                <BookOpen className="h-4 w-4 shrink-0" />
              )}
              {copy(
                "匯入已完成航班到護照",
                "Import completed flights to passport"
              )}
            </Button>
            {passportSummary && (
              <p
                role="status"
                aria-live="polite"
                className="mt-3 text-xs leading-relaxed text-primary"
              >
                {copy(
                  `匯入完成：新增 ${passportSummary.created} · 跳過 ${passportSummary.skipped}（包括未來／重複）· 無效 ${passportSummary.invalid}`,
                  `Import complete: ${passportSummary.created} created · ${passportSummary.skipped} skipped (including future/duplicates) · ${passportSummary.invalid} invalid`
                )}
              </p>
            )}
          </div>
          <div className="rounded-2xl bg-secondary/60 p-4 min-w-0">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <CalendarDays className="h-4 w-4 text-primary" />
              {copy("行程時間軸", "Itinerary timeline")}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {copy(
                "按有效日期將航班及住宿連到行程；再次同步會更新已連結項目，不需重新輸入。資料不足的項目會跳過或標示無效。",
                "Connect flights and stays to the itinerary using valid dates. Sync again to update linked items without re-entering data. Incomplete items are skipped or reported invalid."
              )}
            </p>
            <Button
              variant="outline"
              className="w-full mt-3 gap-2 whitespace-normal h-auto min-h-10 py-2 bg-card text-card-foreground"
              disabled={
                !canEdit ||
                busy ||
                flightsQuery.isPending ||
                hotelsQuery.isPending ||
                flightsQuery.isError ||
                hotelsQuery.isError ||
                (!flights?.length && !hotels?.length)
              }
              onClick={() => {
                if (!canEdit || busy) return;
                setConnectionError(null);
                setSyncSummary(null);
                syncLogistics.mutate({ tripId });
              }}
            >
              {syncLogistics.isPending ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              ) : (
                <ArrowLeftRight className="h-4 w-4 shrink-0" />
              )}
              {copy(
                "同步航班／住宿到行程",
                "Sync flights & stays to itinerary"
              )}
            </Button>
            {syncSummary && (
              <p
                role="status"
                aria-live="polite"
                className="mt-3 text-xs leading-relaxed text-primary"
              >
                {copy(
                  `同步完成：新增 ${syncSummary.created} · 更新 ${syncSummary.updated} · 跳過 ${syncSummary.skipped} · 無效 ${syncSummary.invalid}`,
                  `Sync complete: ${syncSummary.created} created · ${syncSummary.updated} updated · ${syncSummary.skipped} skipped · ${syncSummary.invalid} invalid`
                )}
              </p>
            )}
          </div>
        </div>
        {connectionError && (
          <p role="alert" className="text-sm text-destructive break-words">
            {connectionError}
          </p>
        )}
        {!canEdit && trip && (
          <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            {copy(
              "你是唯讀成員：可匯入至自己的護照，但不能新增、修改、複製、刪除或同步此行程的資料。",
              "Read-only member: you may import into your own passport, but cannot add, edit, duplicate, delete or sync this trip’s data."
            )}
          </p>
        )}
      </section>

      {tripQuery.isError && (
        <div role="alert" className="voyage-panel text-sm text-destructive">
          {copy(
            "無法取得行程權限，編輯及匯入操作暫停。",
            "Trip permissions could not be loaded. Editing and imports are disabled."
          )}{" "}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void tripQuery.refetch()}
          >
            {copy("重試", "Retry")}
          </Button>
        </div>
      )}
      <Tabs defaultValue="flights">
        <TabsList className="mb-5 grid w-full grid-cols-2 rounded-2xl h-11 bg-accent/60">
          <TabsTrigger value="flights" className="gap-2 rounded-xl">
            <Plane className="w-4 h-4" />
            {t("flights")}
          </TabsTrigger>
          <TabsTrigger value="hotels" className="gap-2 rounded-xl">
            <Hotel className="w-4 h-4" />
            {t("hotels")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="flights" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="voyage-section-title">
              {copy("你的航段", "Your flight segments")}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                {flightsQuery.isPending || flightsQuery.isError
                  ? "—"
                  : flights?.length}
              </span>
            </h3>
            {canEdit && (
              <Button
                onClick={openAddFlight}
                disabled={busy}
                size="sm"
                className="gap-1.5 rounded-xl"
              >
                <Plus className="w-4 h-4" />
                {t("addFlight")}
              </Button>
            )}
          </div>
          {flightsQuery.isPending ? (
            skeleton
          ) : flightsQuery.isError ? (
            <div role="alert" className="voyage-panel space-y-3">
              <p className="text-sm text-destructive">
                {copy(
                  "無法載入航班，請重試。",
                  "Flights could not be loaded. Please retry."
                )}
              </p>
              <Button
                variant="outline"
                onClick={() => void flightsQuery.refetch()}
              >
                {copy("重試", "Retry")}
              </Button>
            </div>
          ) : !flights?.length ? (
            <div className="voyage-panel text-center py-12">
              <div className="w-14 h-14 rounded-2xl bg-accent flex items-center justify-center mx-auto mb-4">
                <Plane className="w-7 h-7 text-primary" />
              </div>
              <p className="font-semibold">{t("noFlights")}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {copy(
                  "加入第一個航班，旅途就有了起點。",
                  "Add your first flight to give your journey a starting point."
                )}
              </p>
              {canEdit && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={openAddFlight}
                  className="mt-4 gap-2"
                >
                  <Plus className="h-4 w-4" />
                  {t("addFlight")}
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {flights.map(flight => (
                <article key={flight.id} className="voyage-panel min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    {flight.flightNumber && (
                      <span className="font-bold break-all">
                        {flight.flightNumber}
                      </span>
                    )}
                    {flight.airline && (
                      <span className="text-muted-foreground text-sm break-words">
                        {flight.airline}
                      </span>
                    )}
                    <span
                      className={`px-2 py-1 rounded-full text-[10px] font-semibold ${typeColor[flight.type ?? "outbound"] ?? "bg-muted text-muted-foreground"}`}
                    >
                      {typeLabel[flight.type ?? "outbound"]}
                    </span>
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_48px_minmax(0,1fr)] items-center gap-2 sm:gap-4">
                    <div className="min-w-0">
                      <p className="text-3xl font-bold tracking-tight break-all">
                        {normalizeIata(flight.fromCode) || "—"}
                      </p>
                      {flight.fromCity && (
                        <p className="mt-1 text-xs text-muted-foreground break-words">
                          {flight.fromCity}
                        </p>
                      )}
                      <p className="mt-2 text-sm text-primary font-semibold tabular-nums">
                        {flight.departTime || "—"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="flex-1 h-px bg-border" />
                      <Plane className="w-4 h-4 text-primary shrink-0" />
                      <div className="flex-1 h-px bg-border" />
                    </div>
                    <div className="min-w-0 text-right">
                      <p className="text-3xl font-bold tracking-tight break-all">
                        {normalizeIata(flight.toCode) || "—"}
                      </p>
                      {flight.toCity && (
                        <p className="mt-1 text-xs text-muted-foreground break-words">
                          {flight.toCity}
                        </p>
                      )}
                      <p className="mt-2 text-sm text-primary font-semibold tabular-nums">
                        {flight.arriveTime || "—"}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-4 text-xs text-muted-foreground">
                    <span>{dateLabel(flight.date)}</span>
                    <span>{copy("香港時間 UTC+8", "Hong Kong UTC+8")}</span>
                    {flight.duration && (
                      <span>
                        {copy("時長（手動）：", "Duration (manual): ")}
                        {flight.duration}
                      </span>
                    )}
                  </div>
                  {(!normalizeLogisticsDate(flight.date) ||
                    validateFlightRoute(
                      flight.fromCode ?? "",
                      flight.toCode ?? ""
                    )) && (
                    <p className="mt-2 text-xs text-muted-foreground flex items-start gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      {copy(
                        "日期或機場資料不完整，可能無法匯入／同步。",
                        "Incomplete date or airport details may prevent import/sync."
                      )}
                    </p>
                  )}
                  {bookingMarkerLines(flight.notes).length > 0 && (
                    <p className="text-xs text-primary">
                      {copy("從預訂匯入", "Imported from booking")}
                    </p>
                  )}
                  {visibleBookingNotes(flight.notes) && (
                    <p className="text-xs leading-relaxed text-muted-foreground mt-3 break-words">
                      {visibleBookingNotes(flight.notes)}
                    </p>
                  )}
                  {canEdit && (
                    <div className="flex flex-wrap gap-1.5 mt-4 pt-3 border-t border-border">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 rounded-xl text-xs"
                        disabled={busy}
                        onClick={() => addReturnFlight(flight)}
                      >
                        <ArrowLeftRight className="h-3.5 w-3.5" />
                        {copy("加入回程", "Add return")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 rounded-xl text-xs"
                        disabled={busy}
                        onClick={() => duplicateFlight(flight)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        {copy("複製", "Duplicate")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 rounded-xl text-xs"
                        disabled={busy}
                        onClick={() => openEditFlight(flight)}
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                        {t("edit")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 rounded-xl text-xs text-destructive"
                        disabled={busy}
                        onClick={() => removeFlight(flight.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {t("delete")}
                      </Button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="hotels" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="voyage-section-title">
              {copy("你的住宿", "Your stays")}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                {hotelsQuery.isPending || hotelsQuery.isError
                  ? "—"
                  : hotels?.length}
              </span>
            </h3>
            {canEdit && (
              <Button
                onClick={openAddHotel}
                disabled={busy}
                size="sm"
                className="gap-1.5 rounded-xl"
              >
                <Plus className="w-4 h-4" />
                {t("addHotel")}
              </Button>
            )}
          </div>
          {hotelsQuery.isPending ? (
            skeleton
          ) : hotelsQuery.isError ? (
            <div role="alert" className="voyage-panel space-y-3">
              <p className="text-sm text-destructive">
                {copy(
                  "無法載入住宿，請重試。",
                  "Stays could not be loaded. Please retry."
                )}
              </p>
              <Button
                variant="outline"
                onClick={() => void hotelsQuery.refetch()}
              >
                {copy("重試", "Retry")}
              </Button>
            </div>
          ) : !hotels?.length ? (
            <div className="voyage-panel text-center py-12">
              <div className="w-14 h-14 rounded-2xl bg-accent flex items-center justify-center mx-auto mb-4">
                <Hotel className="w-7 h-7 text-primary" />
              </div>
              <p className="font-semibold">{t("noHotels")}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {copy(
                  "記下每一晚的落腳點，日期會自動換算夜數。",
                  "Keep every place you stay; dates calculate nights for you."
                )}
              </p>
              {canEdit && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={openAddHotel}
                  className="mt-4 gap-2"
                >
                  <Plus className="h-4 w-4" />
                  {t("addHotel")}
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {hotels.map(hotel => {
                const nightInfo = hotelNightInfo(hotel);
                return (
                  <article key={hotel.id} className="voyage-panel min-w-0">
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-xl bg-accent flex items-center justify-center shrink-0">
                        <Hotel className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-base break-words">
                          {hotel.name}
                        </h3>
                        {hotel.city && (
                          <p className="mt-1 text-xs text-muted-foreground break-words">
                            {hotel.city}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="mt-4 rounded-2xl bg-accent/30 p-3">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                        <span>{dateLabel(hotel.checkIn)}</span>
                        <ArrowRight className="h-3.5 w-3.5 text-primary" />
                        <span>{dateLabel(hotel.checkOut)}</span>
                      </div>
                      <p className="mt-2 text-xs font-medium text-primary">
                        {nightInfo.nights !== null
                          ? copy(
                              `${nightInfo.nights} 晚`,
                              `${nightInfo.nights} night${nightInfo.nights === 1 ? "" : "s"}`
                            )
                          : "—"}{" "}
                        ·{" "}
                        {nightInfo.source === "dates"
                          ? copy("按日期計算", "Calculated from dates")
                          : nightInfo.source === "manual"
                            ? copy(
                                "手動估算，未計入總覽",
                                "Manual estimate, excluded from total"
                              )
                            : copy(
                                "日期不足或無效",
                                "Dates missing or invalid"
                              )}
                      </p>
                    </div>
                    {bookingMarkerLines(hotel.notes).length > 0 && (
                      <p className="text-xs text-primary">
                        {copy("從預訂匯入", "Imported from booking")}
                      </p>
                    )}
                    {visibleBookingNotes(hotel.notes) && (
                      <p className="text-xs leading-relaxed text-muted-foreground mt-3 break-words">
                        {visibleBookingNotes(hotel.notes)}
                      </p>
                    )}
                    {canEdit && (
                      <div className="flex flex-wrap gap-1.5 mt-4 pt-3 border-t border-border">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 rounded-xl text-xs"
                          disabled={busy}
                          onClick={() => duplicateHotel(hotel)}
                        >
                          <Copy className="h-3.5 w-3.5" />
                          {copy("複製", "Duplicate")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 rounded-xl text-xs"
                          disabled={busy}
                          onClick={() => openEditHotel(hotel)}
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                          {t("edit")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 rounded-xl text-xs text-destructive"
                          disabled={busy}
                          onClick={() => removeHotel(hotel.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {t("delete")}
                        </Button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog
        open={canEdit && showAddFlight}
        onOpenChange={open => {
          if (!busy) setShowAddFlight(open);
        }}
      >
        <DialogContent className="sm:max-w-md max-h-[85dvh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle>{t("addFlight")}</DialogTitle>
            <DialogDescription>
              {copy(
                "先核對航線及日期，再儲存航班。",
                "Review the route and date before saving."
              )}
            </DialogDescription>
          </DialogHeader>
          {flightFormJSX}
          <Button
            className="w-full mt-4"
            onClick={handleAddFlight}
            disabled={!canEdit || busy}
          >
            {addFlight.isPending && (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            )}
            {t("addFlight")}
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={canEdit && Boolean(editingFlight)}
        onOpenChange={open => {
          if (!open && !busy) setEditingFlight(null);
        }}
      >
        <DialogContent className="sm:max-w-md max-h-[85dvh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle>{t("editFlight")}</DialogTitle>
            <DialogDescription>
              {copy(
                "修改不會自動同步；完成後可手動同步行程。",
                "Edits are not synced automatically. Sync the itinerary when ready."
              )}
            </DialogDescription>
          </DialogHeader>
          {flightFormJSX}
          <Button
            className="w-full mt-4"
            onClick={handleUpdateFlight}
            disabled={!canEdit || busy}
          >
            {updateFlight.isPending && (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            )}
            {t("saveChanges")}
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={canEdit && showAddHotel}
        onOpenChange={open => {
          if (!busy) setShowAddHotel(open);
        }}
      >
        <DialogContent className="sm:max-w-md max-h-[85dvh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle>{t("addHotel")}</DialogTitle>
            <DialogDescription>
              {copy(
                "住宿日期會自動計算晚數。",
                "Stay dates calculate the number of nights automatically."
              )}
            </DialogDescription>
          </DialogHeader>
          {hotelFormJSX}
          <Button
            className="w-full mt-4"
            onClick={handleAddHotel}
            disabled={!canEdit || busy || Boolean(formDateError)}
          >
            {addHotel.isPending && (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            )}
            {t("addHotel")}
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={canEdit && Boolean(editingHotel)}
        onOpenChange={open => {
          if (!open && !busy) setEditingHotel(null);
        }}
      >
        <DialogContent className="sm:max-w-md max-h-[85dvh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle>{t("editHotel")}</DialogTitle>
            <DialogDescription>
              {copy(
                "日期完整時，晚數只供檢視。",
                "Nights are read-only when both dates are present."
              )}
            </DialogDescription>
          </DialogHeader>
          {hotelFormJSX}
          <Button
            className="w-full mt-4"
            onClick={handleUpdateHotel}
            disabled={!canEdit || busy || Boolean(formDateError)}
          >
            {updateHotel.isPending && (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            )}
            {t("saveChanges")}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
