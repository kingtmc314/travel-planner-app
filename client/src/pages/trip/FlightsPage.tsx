import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Loader2, Plane, Hotel, ArrowRight, Edit2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const defaultFlight = { flightNumber: "", airline: "", departureAirport: "", arrivalAirport: "", departureTime: "", arrivalTime: "", departureDate: "", arrivalDate: "", notes: "", type: "outbound" as "outbound" | "return" | "connecting", bookingRef: "" };
const defaultHotel = { name: "", address: "", checkIn: "", checkOut: "", confirmationNumber: "", bookingRef: "", notes: "" };

export default function FlightsPage({ tripId }: { tripId: number }) {
  const { data: flights, refetch: refetchFlights, isLoading: flightsLoading } = trpc.flights.list.useQuery({ tripId });
  const { data: hotels, refetch: refetchHotels, isLoading: hotelsLoading } = trpc.hotels.list.useQuery({ tripId });
  const [showAddFlight, setShowAddFlight] = useState(false);
  const [showAddHotel, setShowAddHotel] = useState(false);
  const [editingFlight, setEditingFlight] = useState<any | null>(null);
  const [editingHotel, setEditingHotel] = useState<any | null>(null);
  const [flightForm, setFlightForm] = useState(defaultFlight);
  const [hotelForm, setHotelForm] = useState(defaultHotel);

  const addFlight = trpc.flights.add.useMutation({
    onSuccess: () => { refetchFlights(); setShowAddFlight(false); setFlightForm(defaultFlight); toast.success("航班已新增"); },
    onError: () => toast.error("新增失敗"),
  });
  const updateFlight = trpc.flights.update.useMutation({
    onSuccess: () => { refetchFlights(); setEditingFlight(null); toast.success("航班已更新"); },
    onError: () => toast.error("更新失敗"),
  });
  const deleteFlight = trpc.flights.delete.useMutation({ onSuccess: () => { refetchFlights(); toast.success("航班已刪除"); } });

  const addHotel = trpc.hotels.add.useMutation({
    onSuccess: () => { refetchHotels(); setShowAddHotel(false); setHotelForm(defaultHotel); toast.success("住宿已新增"); },
    onError: () => toast.error("新增失敗"),
  });
  const updateHotel = trpc.hotels.update.useMutation({
    onSuccess: () => { refetchHotels(); setEditingHotel(null); toast.success("住宿已更新"); },
    onError: () => toast.error("更新失敗"),
  });
  const deleteHotel = trpc.hotels.delete.useMutation({ onSuccess: () => { refetchHotels(); toast.success("住宿已刪除"); } });

  const handleAddFlight = () => {
    if (!flightForm.flightNumber || !flightForm.departureAirport || !flightForm.arrivalAirport) { toast.error("請填寫必填欄位"); return; }
    addFlight.mutate({ tripId, ...flightForm });
  };

  const handleUpdateFlight = () => {
    if (!editingFlight || !flightForm.departureAirport || !flightForm.arrivalAirport) { toast.error("請填寫必填欄位"); return; }
    updateFlight.mutate({ flightId: editingFlight.id, tripId, ...flightForm });
  };

  const openEditFlight = (flight: any) => {
    setEditingFlight(flight);
    setFlightForm({
      flightNumber: flight.flightNumber ?? "",
      airline: flight.airline ?? "",
      departureAirport: flight.departureAirport ?? "",
      arrivalAirport: flight.arrivalAirport ?? "",
      departureTime: flight.departureTime ?? "",
      arrivalTime: flight.arrivalTime ?? "",
      departureDate: flight.departureDate ? String(flight.departureDate).split("T")[0] : "",
      arrivalDate: flight.arrivalDate ? String(flight.arrivalDate).split("T")[0] : "",
      notes: flight.notes ?? "",
      type: flight.type ?? "outbound",
      bookingRef: flight.bookingRef ?? "",
    });
  };

  const handleAddHotel = () => {
    if (!hotelForm.name || !hotelForm.checkIn || !hotelForm.checkOut) { toast.error("請填寫必填欄位"); return; }
    addHotel.mutate({ tripId, ...hotelForm });
  };

  const handleUpdateHotel = () => {
    if (!editingHotel || !hotelForm.name) { toast.error("請填寫必填欄位"); return; }
    updateHotel.mutate({ accId: editingHotel.id, tripId, ...hotelForm });
  };

  const openEditHotel = (hotel: any) => {
    setEditingHotel(hotel);
    setHotelForm({
      name: hotel.name ?? "",
      address: hotel.address ?? "",
      checkIn: hotel.checkIn ? (hotel.checkIn instanceof Date ? hotel.checkIn.toISOString().split("T")[0] : String(hotel.checkIn).split("T")[0]) : "",
      checkOut: hotel.checkOut ? (hotel.checkOut instanceof Date ? hotel.checkOut.toISOString().split("T")[0] : String(hotel.checkOut).split("T")[0]) : "",
      confirmationNumber: hotel.confirmationNumber ?? "",
      bookingRef: hotel.bookingRef ?? "",
      notes: hotel.notes ?? "",
    });
  };

  const typeLabel: Record<string, string> = { outbound: "去程", return: "回程", connecting: "轉機" };
  const typeColor: Record<string, string> = { outbound: "bg-blue-100 text-blue-700", return: "bg-green-100 text-green-700", connecting: "bg-amber-100 text-amber-700" };

  const FlightFormFields = () => (
    <div className="space-y-4 mt-2">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>航班號碼</Label>
          <Input className="mt-1.5" placeholder="CX100" value={flightForm.flightNumber} onChange={e => setFlightForm({...flightForm, flightNumber: e.target.value})} />
        </div>
        <div>
          <Label>航空公司</Label>
          <Input className="mt-1.5" placeholder="國泰航空" value={flightForm.airline} onChange={e => setFlightForm({...flightForm, airline: e.target.value})} />
        </div>
      </div>
      <div>
        <Label>類型</Label>
        <Select value={flightForm.type} onValueChange={v => setFlightForm({...flightForm, type: v as any})}>
          <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="outbound">去程</SelectItem>
            <SelectItem value="return">回程</SelectItem>
            <SelectItem value="connecting">轉機</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>出發機場 *</Label>
          <Input className="mt-1.5" placeholder="HKG" value={flightForm.departureAirport} onChange={e => setFlightForm({...flightForm, departureAirport: e.target.value})} />
        </div>
        <div>
          <Label>抵達機場 *</Label>
          <Input className="mt-1.5" placeholder="CAI" value={flightForm.arrivalAirport} onChange={e => setFlightForm({...flightForm, arrivalAirport: e.target.value})} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>出發日期</Label>
          <Input className="mt-1.5" type="date" value={flightForm.departureDate} onChange={e => setFlightForm({...flightForm, departureDate: e.target.value})} />
        </div>
        <div>
          <Label>出發時間</Label>
          <Input className="mt-1.5" type="time" value={flightForm.departureTime} onChange={e => setFlightForm({...flightForm, departureTime: e.target.value})} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>抵達日期</Label>
          <Input className="mt-1.5" type="date" value={flightForm.arrivalDate} onChange={e => setFlightForm({...flightForm, arrivalDate: e.target.value})} />
        </div>
        <div>
          <Label>抵達時間</Label>
          <Input className="mt-1.5" type="time" value={flightForm.arrivalTime} onChange={e => setFlightForm({...flightForm, arrivalTime: e.target.value})} />
        </div>
      </div>
      <div>
        <Label>訂位編號</Label>
        <Input className="mt-1.5" placeholder="ABCDEF" value={flightForm.bookingRef} onChange={e => setFlightForm({...flightForm, bookingRef: e.target.value})} />
      </div>
      <div>
        <Label>備注</Label>
        <Input className="mt-1.5" placeholder="備注..." value={flightForm.notes} onChange={e => setFlightForm({...flightForm, notes: e.target.value})} />
      </div>
    </div>
  );

  const HotelFormFields = () => (
    <div className="space-y-4 mt-2">
      <div>
        <Label>酒店名稱 *</Label>
        <Input className="mt-1.5" placeholder="例：開羅希爾頓酒店" value={hotelForm.name} onChange={e => setHotelForm({...hotelForm, name: e.target.value})} />
      </div>
      <div>
        <Label>地址</Label>
        <Input className="mt-1.5" placeholder="酒店地址" value={hotelForm.address} onChange={e => setHotelForm({...hotelForm, address: e.target.value})} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>入住日期 *</Label>
          <Input className="mt-1.5" type="date" value={hotelForm.checkIn} onChange={e => setHotelForm({...hotelForm, checkIn: e.target.value})} />
        </div>
        <div>
          <Label>退房日期 *</Label>
          <Input className="mt-1.5" type="date" value={hotelForm.checkOut} onChange={e => setHotelForm({...hotelForm, checkOut: e.target.value})} />
        </div>
      </div>
      <div>
        <Label>確認號碼</Label>
        <Input className="mt-1.5" placeholder="確認號碼" value={hotelForm.confirmationNumber} onChange={e => setHotelForm({...hotelForm, confirmationNumber: e.target.value})} />
      </div>
      <div>
        <Label>訂房編號</Label>
        <Input className="mt-1.5" placeholder="訂房編號" value={hotelForm.bookingRef} onChange={e => setHotelForm({...hotelForm, bookingRef: e.target.value})} />
      </div>
      <div>
        <Label>備注</Label>
        <Input className="mt-1.5" placeholder="備注..." value={hotelForm.notes} onChange={e => setHotelForm({...hotelForm, notes: e.target.value})} />
      </div>
    </div>
  );

  return (
    <div className="px-4 sm:px-6 py-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-foreground">航班 & 住宿</h2>
        <p className="text-muted-foreground text-sm mt-0.5">管理你的航班資訊和住宿預訂</p>
      </div>

      <Tabs defaultValue="flights">
        <TabsList className="mb-6">
          <TabsTrigger value="flights" className="gap-2">
            <Plane className="w-4 h-4" />航班
          </TabsTrigger>
          <TabsTrigger value="hotels" className="gap-2">
            <Hotel className="w-4 h-4" />住宿
          </TabsTrigger>
        </TabsList>

        <TabsContent value="flights">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">{flights?.length ?? 0} 個航班</p>
            <Button onClick={() => { setShowAddFlight(true); setFlightForm(defaultFlight); }} size="sm" className="gap-1.5">
              <Plus className="w-4 h-4" />新增航班
            </Button>
          </div>
          {flightsLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : !flights || flights.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <Plane className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">還沒有航班資訊</p>
              <button onClick={() => setShowAddFlight(true)} className="text-primary hover:underline mt-2 text-sm">+ 新增航班</button>
            </div>
          ) : (
            <div className="space-y-3">
              {flights.map(flight => (
                <div key={flight.id} className="bg-card rounded-2xl border border-border p-4 group">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-bold text-foreground">{flight.flightNumber}</span>
                        {flight.airline && <span className="text-muted-foreground text-sm">{flight.airline}</span>}
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${(flight.type ? typeColor[flight.type] : null) ?? "bg-muted text-muted-foreground"}`}>
                          {(flight.type ? typeLabel[flight.type] : null) ?? flight.type}
                        </span>
                        {flight.bookingRef && <span className="text-xs text-muted-foreground">· {flight.bookingRef}</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-center">
                          <p className="text-lg font-bold text-foreground">{flight.departureAirport}</p>
                          {flight.departureTime && <p className="text-xs text-muted-foreground">{flight.departureTime}</p>}
                          {flight.departureDate && <p className="text-xs text-muted-foreground">{String(flight.departureDate ?? '')}</p>}
                        </div>
                        <div className="flex-1 flex items-center gap-1">
                          <div className="flex-1 h-px bg-border" />
                          <Plane className="w-4 h-4 text-primary" />
                          <div className="flex-1 h-px bg-border" />
                        </div>
                        <div className="text-center">
                          <p className="text-lg font-bold text-foreground">{flight.arrivalAirport}</p>
                          {flight.arrivalTime && <p className="text-xs text-muted-foreground">{flight.arrivalTime}</p>}
                          {flight.arrivalDate && <p className="text-xs text-muted-foreground">{String(flight.arrivalDate ?? '')}</p>}
                        </div>
                      </div>
                      {flight.notes && <p className="text-xs text-muted-foreground mt-2">{flight.notes}</p>}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                      <button
                        onClick={() => openEditFlight(flight)}
                        className="p-1.5 rounded-lg hover:bg-accent transition-colors"
                      >
                        <Edit2 className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => deleteFlight.mutate({ flightId: flight.id, tripId })}
                        className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors"
                      >
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
            <p className="text-sm text-muted-foreground">{hotels?.length ?? 0} 個住宿</p>
            <Button onClick={() => { setShowAddHotel(true); setHotelForm(defaultHotel); }} size="sm" className="gap-1.5">
              <Plus className="w-4 h-4" />新增住宿
            </Button>
          </div>
          {hotelsLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : !hotels || hotels.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <Hotel className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">還沒有住宿資訊</p>
              <button onClick={() => setShowAddHotel(true)} className="text-primary hover:underline mt-2 text-sm">+ 新增住宿</button>
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
                      </div>
                      {hotel.address && <p className="text-sm text-muted-foreground mb-2">{hotel.address}</p>}
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium text-foreground">{hotel.checkIn instanceof Date ? hotel.checkIn.toLocaleDateString() : String(hotel.checkIn ?? '')}</span>
                        <ArrowRight className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium text-foreground">{hotel.checkOut instanceof Date ? hotel.checkOut.toLocaleDateString() : String(hotel.checkOut ?? '')}</span>
                      </div>
                      {hotel.confirmationNumber && (
                        <p className="text-xs text-muted-foreground mt-1">確認號碼：{hotel.confirmationNumber}</p>
                      )}
                      {hotel.bookingRef && (
                        <p className="text-xs text-muted-foreground mt-0.5">訂房編號：{hotel.bookingRef}</p>
                      )}
                      {hotel.notes && <p className="text-xs text-muted-foreground mt-1">{hotel.notes}</p>}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                      <button
                        onClick={() => openEditHotel(hotel)}
                        className="p-1.5 rounded-lg hover:bg-accent transition-colors"
                      >
                        <Edit2 className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => deleteHotel.mutate({ accId: hotel.id, tripId })}
                        className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors"
                      >
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
          <DialogHeader><DialogTitle>新增航班</DialogTitle></DialogHeader>
          <FlightFormFields />
          <Button className="w-full mt-4" onClick={handleAddFlight} disabled={addFlight.isPending}>
            {addFlight.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            新增航班
          </Button>
        </DialogContent>
      </Dialog>

      {/* Edit Flight Dialog */}
      <Dialog open={!!editingFlight} onOpenChange={(o) => !o && setEditingFlight(null)}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>修改航班</DialogTitle></DialogHeader>
          <FlightFormFields />
          <Button className="w-full mt-4" onClick={handleUpdateFlight} disabled={updateFlight.isPending}>
            {updateFlight.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            儲存變更
          </Button>
        </DialogContent>
      </Dialog>

      {/* Add Hotel Dialog */}
      <Dialog open={showAddHotel} onOpenChange={setShowAddHotel}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>新增住宿</DialogTitle></DialogHeader>
          <HotelFormFields />
          <Button className="w-full mt-4" onClick={handleAddHotel} disabled={addHotel.isPending}>
            {addHotel.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            新增住宿
          </Button>
        </DialogContent>
      </Dialog>

      {/* Edit Hotel Dialog */}
      <Dialog open={!!editingHotel} onOpenChange={(o) => !o && setEditingHotel(null)}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>修改住宿</DialogTitle></DialogHeader>
          <HotelFormFields />
          <Button className="w-full mt-4" onClick={handleUpdateHotel} disabled={updateHotel.isPending}>
            {updateHotel.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            儲存變更
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
