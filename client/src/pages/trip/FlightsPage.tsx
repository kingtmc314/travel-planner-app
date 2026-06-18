import { trpc } from "@/lib/trpc";
import { useI18n } from "@/hooks/useI18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Loader2, Plane, Hotel, ArrowRight, Edit2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const defaultFlight = {
  flightNumber: "", airline: "", fromCode: "", fromCity: "", toCode: "", toCity: "",
  date: "", departTime: "", arriveTime: "", duration: "", notes: "",
  type: "outbound" as "outbound" | "return" | "connecting",
};
const defaultHotel = { name: "", city: "", checkIn: "", checkOut: "", nights: "", notes: "" };

export default function FlightsPage({ tripId }: { tripId: number }) {
  const { t, lang } = useI18n();
  const { data: flights, refetch: refetchFlights, isLoading: flightsLoading } = trpc.flights.list.useQuery({ tripId });
  const { data: hotels, refetch: refetchHotels, isLoading: hotelsLoading } = trpc.hotels.list.useQuery({ tripId });
  const [showAddFlight, setShowAddFlight] = useState(false);
  const [showAddHotel, setShowAddHotel] = useState(false);
  const [editingFlight, setEditingFlight] = useState<any | null>(null);
  const [editingHotel, setEditingHotel] = useState<any | null>(null);
  const [flightForm, setFlightForm] = useState(defaultFlight);
  const [hotelForm, setHotelForm] = useState(defaultHotel);

  const addFlight = trpc.flights.add.useMutation({
    onSuccess: () => { refetchFlights(); setShowAddFlight(false); setFlightForm(defaultFlight); toast.success(t("flightAdded")); },
    onError: () => toast.error(t("addFailed")),
  });
  const updateFlight = trpc.flights.update.useMutation({
    onSuccess: () => { refetchFlights(); setEditingFlight(null); toast.success(t("flightUpdated")); },
    onError: () => toast.error(t("updateFailed")),
  });
  const deleteFlight = trpc.flights.delete.useMutation({ onSuccess: () => { refetchFlights(); toast.success(t("flightDeleted")); } });

  const addHotel = trpc.hotels.add.useMutation({
    onSuccess: () => { refetchHotels(); setShowAddHotel(false); setHotelForm(defaultHotel); toast.success(t("hotelAdded")); },
    onError: () => toast.error(t("addFailed")),
  });
  const updateHotel = trpc.hotels.update.useMutation({
    onSuccess: () => { refetchHotels(); setEditingHotel(null); toast.success(t("hotelUpdated")); },
    onError: () => toast.error(t("updateFailed")),
  });
  const deleteHotel = trpc.hotels.delete.useMutation({ onSuccess: () => { refetchHotels(); toast.success(t("hotelDeleted")); } });

  const handleAddFlight = () => {
    if (!flightForm.fromCode || !flightForm.toCode) {
      toast.error(lang === "zh" ? "請填寫出發和抵達機場代碼" : "Please enter departure and arrival airport codes");
      return;
    }
    addFlight.mutate({ tripId, ...flightForm });
  };

  const handleUpdateFlight = () => {
    if (!editingFlight) return;
    updateFlight.mutate({ flightId: editingFlight.id, tripId, ...flightForm });
  };

  const openEditFlight = (flight: any) => {
    setEditingFlight(flight);
    setFlightForm({
      flightNumber: flight.flightNumber ?? "",
      airline: flight.airline ?? "",
      fromCode: flight.fromCode ?? "",
      fromCity: flight.fromCity ?? "",
      toCode: flight.toCode ?? "",
      toCity: flight.toCity ?? "",
      date: flight.date ?? "",
      departTime: flight.departTime ?? "",
      arriveTime: flight.arriveTime ?? "",
      duration: flight.duration ?? "",
      notes: flight.notes ?? "",
      type: flight.type ?? "outbound",
    });
  };

  const handleAddHotel = () => {
    if (!hotelForm.name) { toast.error(lang === "zh" ? "請填寫酒店名稱" : "Please enter hotel name"); return; }
    addHotel.mutate({ tripId, ...hotelForm, nights: hotelForm.nights ? parseInt(hotelForm.nights) : undefined });
  };

  const handleUpdateHotel = () => {
    if (!editingHotel || !hotelForm.name) { toast.error(lang === "zh" ? "請填寫必填欄位" : "Please fill in required fields"); return; }
    updateHotel.mutate({ accId: editingHotel.id, tripId, ...hotelForm, nights: hotelForm.nights ? parseInt(hotelForm.nights) : undefined });
  };

  const openEditHotel = (hotel: any) => {
    setEditingHotel(hotel);
    setHotelForm({
      name: hotel.name ?? "",
      city: hotel.city ?? "",
      checkIn: hotel.checkIn ?? "",
      checkOut: hotel.checkOut ?? "",
      nights: hotel.nights ? String(hotel.nights) : "",
      notes: hotel.notes ?? "",
    });
  };

  const typeLabel: Record<string, string> = {
    outbound: t("flightOutbound"),
    return: t("flightReturn"),
    connecting: t("flightConnecting"),
  };
  const typeColor: Record<string, string> = {
    outbound: "bg-blue-100 text-blue-700",
    return: "bg-green-100 text-green-700",
    connecting: "bg-amber-100 text-amber-700",
  };

  const flightFormJSX = (
    <div className="space-y-4 mt-2">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>{t("flightNumber")}</Label>
          <Input className="mt-1.5" placeholder="CX100" value={flightForm.flightNumber} onChange={e => setFlightForm({...flightForm, flightNumber: e.target.value})} />
        </div>
        <div>
          <Label>{t("airline")}</Label>
          <Input className="mt-1.5" placeholder={lang === "zh" ? "國泰航空" : "Cathay Pacific"} value={flightForm.airline} onChange={e => setFlightForm({...flightForm, airline: e.target.value})} />
        </div>
      </div>
      <div>
        <Label>{t("flightType")}</Label>
        <Select value={flightForm.type} onValueChange={v => setFlightForm({...flightForm, type: v as any})}>
          <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="outbound">{t("flightOutbound")}</SelectItem>
            <SelectItem value="return">{t("flightReturn")}</SelectItem>
            <SelectItem value="connecting">{t("flightConnecting")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>{t("fromAirport")} *</Label>
          <Input className="mt-1.5" placeholder="HKG" value={flightForm.fromCode} onChange={e => setFlightForm({...flightForm, fromCode: e.target.value.toUpperCase()})} />
        </div>
        <div>
          <Label>{t("fromCity")}</Label>
          <Input className="mt-1.5" placeholder="Hong Kong" value={flightForm.fromCity} onChange={e => setFlightForm({...flightForm, fromCity: e.target.value})} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>{t("toAirport")} *</Label>
          <Input className="mt-1.5" placeholder="CAI" value={flightForm.toCode} onChange={e => setFlightForm({...flightForm, toCode: e.target.value.toUpperCase()})} />
        </div>
        <div>
          <Label>{t("toCity")}</Label>
          <Input className="mt-1.5" placeholder="Cairo" value={flightForm.toCity} onChange={e => setFlightForm({...flightForm, toCity: e.target.value})} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label>{t("flightDate")}</Label>
          <Input className="mt-1.5" type="date" value={flightForm.date} onChange={e => setFlightForm({...flightForm, date: e.target.value})} />
        </div>
        <div>
          <Label>{t("departTime")}</Label>
          <Input className="mt-1.5" type="time" value={flightForm.departTime} onChange={e => setFlightForm({...flightForm, departTime: e.target.value})} />
        </div>
        <div>
          <Label>{t("arriveTime")}</Label>
          <Input className="mt-1.5" type="time" value={flightForm.arriveTime} onChange={e => setFlightForm({...flightForm, arriveTime: e.target.value})} />
        </div>
      </div>
      <div>
        <Label>{t("activityNotes")}</Label>
        <Input className="mt-1.5" placeholder={t("activityNotesPlaceholder")} value={flightForm.notes} onChange={e => setFlightForm({...flightForm, notes: e.target.value})} />
      </div>
    </div>
  );

  const hotelFormJSX = (
    <div className="space-y-4 mt-2">
      <div>
        <Label>{t("hotelName")} *</Label>
        <Input className="mt-1.5" placeholder={lang === "zh" ? "例：開羅希爾頓酒店" : "e.g. Cairo Hilton"} value={hotelForm.name} onChange={e => setHotelForm({...hotelForm, name: e.target.value})} />
      </div>
      <div>
        <Label>{t("hotelCity")}</Label>
        <Input className="mt-1.5" placeholder={lang === "zh" ? "城市名稱" : "City name"} value={hotelForm.city} onChange={e => setHotelForm({...hotelForm, city: e.target.value})} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>{t("checkIn")}</Label>
          <Input className="mt-1.5" type="date" value={hotelForm.checkIn} onChange={e => setHotelForm({...hotelForm, checkIn: e.target.value})} />
        </div>
        <div>
          <Label>{t("checkOut")}</Label>
          <Input className="mt-1.5" type="date" value={hotelForm.checkOut} onChange={e => setHotelForm({...hotelForm, checkOut: e.target.value})} />
        </div>
      </div>
      <div>
        <Label>{t("nights")}</Label>
        <Input className="mt-1.5" type="number" min="1" placeholder="3" value={hotelForm.nights} onChange={e => setHotelForm({...hotelForm, nights: e.target.value})} />
      </div>
      <div>
        <Label>{t("activityNotes")}</Label>
        <Input className="mt-1.5" placeholder={t("activityNotesPlaceholder")} value={hotelForm.notes} onChange={e => setHotelForm({...hotelForm, notes: e.target.value})} />
      </div>
    </div>
  );

  return (
    <div className="px-4 sm:px-6 py-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-foreground">{t("flightsTitle")}</h2>
        <p className="text-muted-foreground text-sm mt-0.5">{t("flightsDesc")}</p>
      </div>

      <Tabs defaultValue="flights">
        <TabsList className="mb-6">
          <TabsTrigger value="flights" className="gap-2">
            <Plane className="w-4 h-4" />{t("flights")}
          </TabsTrigger>
          <TabsTrigger value="hotels" className="gap-2">
            <Hotel className="w-4 h-4" />{t("hotels")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="flights">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">
              {lang === "zh" ? `${flights?.length ?? 0} 個航班` : `${flights?.length ?? 0} flight${(flights?.length ?? 0) !== 1 ? "s" : ""}`}
            </p>
            <Button onClick={() => { setShowAddFlight(true); setFlightForm(defaultFlight); }} size="sm" className="gap-1.5">
              <Plus className="w-4 h-4" />{t("addFlight")}
            </Button>
          </div>
          {flightsLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : !flights || flights.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <Plane className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">{t("noFlights")}</p>
              <button onClick={() => setShowAddFlight(true)} className="text-primary hover:underline mt-2 text-sm">+ {t("addFlight")}</button>
            </div>
          ) : (
            <div className="space-y-3">
              {flights.map(flight => (
                <div key={flight.id} className="bg-card rounded-2xl border border-border p-4 group">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {flight.flightNumber && <span className="font-bold text-foreground">{flight.flightNumber}</span>}
                        {flight.airline && <span className="text-muted-foreground text-sm">{flight.airline}</span>}
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${(flight.type ? typeColor[flight.type] : null) ?? "bg-muted text-muted-foreground"}`}>
                          {(flight.type ? typeLabel[flight.type] : null) ?? flight.type}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-center">
                          <p className="text-lg font-bold text-foreground">{flight.fromCode ?? "—"}</p>
                          {flight.fromCity && <p className="text-xs text-muted-foreground">{flight.fromCity}</p>}
                          {flight.departTime && <p className="text-xs text-primary font-medium">{flight.departTime}</p>}
                          {flight.date && <p className="text-xs text-muted-foreground">{flight.date}</p>}
                        </div>
                        <div className="flex-1 flex items-center gap-1">
                          <div className="flex-1 h-px bg-border" />
                          <Plane className="w-4 h-4 text-primary" />
                          <div className="flex-1 h-px bg-border" />
                        </div>
                        <div className="text-center">
                          <p className="text-lg font-bold text-foreground">{flight.toCode ?? "—"}</p>
                          {flight.toCity && <p className="text-xs text-muted-foreground">{flight.toCity}</p>}
                          {flight.arriveTime && <p className="text-xs text-primary font-medium">{flight.arriveTime}</p>}
                        </div>
                      </div>
                      {flight.notes && <p className="text-xs text-muted-foreground mt-2">{flight.notes}</p>}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                      <button onClick={() => openEditFlight(flight)} className="p-1.5 rounded-lg hover:bg-accent transition-colors" title={t("edit")}>
                        <Edit2 className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button onClick={() => deleteFlight.mutate({ flightId: flight.id, tripId })} className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors" title={t("delete")}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="hotels">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">
              {lang === "zh" ? `${hotels?.length ?? 0} 個住宿` : `${hotels?.length ?? 0} accommodation${(hotels?.length ?? 0) !== 1 ? "s" : ""}`}
            </p>
            <Button onClick={() => { setShowAddHotel(true); setHotelForm(defaultHotel); }} size="sm" className="gap-1.5">
              <Plus className="w-4 h-4" />{t("addHotel")}
            </Button>
          </div>
          {hotelsLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : !hotels || hotels.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <Hotel className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">{t("noHotels")}</p>
              <button onClick={() => setShowAddHotel(true)} className="text-primary hover:underline mt-2 text-sm">+ {t("addHotel")}</button>
            </div>
          ) : (
            <div className="space-y-3">
              {hotels.map(hotel => (
                <div key={hotel.id} className="bg-card rounded-2xl border border-border p-4 group">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Hotel className="w-4 h-4 text-purple-500" />
                        <h3 className="font-semibold text-foreground">{hotel.name}</h3>
                        {hotel.city && <span className="text-sm text-muted-foreground">· {hotel.city}</span>}
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        {hotel.checkIn && <span className="font-medium text-foreground">{hotel.checkIn}</span>}
                        {hotel.checkIn && hotel.checkOut && <ArrowRight className="w-4 h-4 text-muted-foreground" />}
                        {hotel.checkOut && <span className="font-medium text-foreground">{hotel.checkOut}</span>}
                        {hotel.nights && (
                          <span className="text-muted-foreground text-xs">
                            ({hotel.nights} {lang === "zh" ? "晚" : `night${hotel.nights !== 1 ? "s" : ""}`})
                          </span>
                        )}
                      </div>
                      {hotel.notes && <p className="text-xs text-muted-foreground mt-1">{hotel.notes}</p>}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                      <button onClick={() => openEditHotel(hotel)} className="p-1.5 rounded-lg hover:bg-accent transition-colors" title={t("edit")}>
                        <Edit2 className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button onClick={() => deleteHotel.mutate({ accId: hotel.id, tripId })} className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors" title={t("delete")}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Add Flight Dialog */}
      <Dialog open={showAddFlight} onOpenChange={setShowAddFlight}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("addFlight")}</DialogTitle></DialogHeader>
          {flightFormJSX}
          <Button className="w-full mt-4" onClick={handleAddFlight} disabled={addFlight.isPending}>
            {addFlight.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {t("addFlight")}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Edit Flight Dialog */}
      <Dialog open={!!editingFlight} onOpenChange={(o) => !o && setEditingFlight(null)}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("editFlight")}</DialogTitle></DialogHeader>
          {flightFormJSX}
          <Button className="w-full mt-4" onClick={handleUpdateFlight} disabled={updateFlight.isPending}>
            {updateFlight.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {t("saveChanges")}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Add Hotel Dialog */}
      <Dialog open={showAddHotel} onOpenChange={setShowAddHotel}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("addHotel")}</DialogTitle></DialogHeader>
          {hotelFormJSX}
          <Button className="w-full mt-4" onClick={handleAddHotel} disabled={addHotel.isPending}>
            {addHotel.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {t("addHotel")}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Edit Hotel Dialog */}
      <Dialog open={!!editingHotel} onOpenChange={(o) => !o && setEditingHotel(null)}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("editHotel")}</DialogTitle></DialogHeader>
          {hotelFormJSX}
          <Button className="w-full mt-4" onClick={handleUpdateHotel} disabled={updateHotel.isPending}>
            {updateHotel.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {t("saveChanges")}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
