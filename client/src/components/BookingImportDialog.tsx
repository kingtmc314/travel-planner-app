import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useI18n } from "@/hooks/useI18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, FileInput, Plane, Hotel, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  BOOKING_MAX_BYTES,
  BOOKING_MAX_TEXT,
  bookingFlightImportSchema,
  bookingHotelImportSchema,
  bookingFlightKey,
  bookingHotelKey,
  bookingNights,
  type BookingFlight,
  type BookingHotel,
  type BookingFlightLike,
  type BookingHotelLike,
} from "@shared/bookingImport";

type Preview = {
  flights: BookingFlight[];
  hotels: BookingHotel[];
  warnings: string[];
  sourceHash: string;
  previewToken: string;
};
type Props = {
  tripId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canEdit: boolean;
  existingFlights?: BookingFlightLike[];
  existingHotels?: BookingHotelLike[];
};
const base64File = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.onload = () => {
      const data = String(reader.result);
      resolve(data.slice(data.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
export default function BookingImportDialog({
  tripId,
  open,
  onOpenChange,
  canEdit,
  existingFlights = [],
  existingHotels = [],
}: Props) {
  const { lang } = useI18n();
  const copy = (zh: string, en: string) => (lang === "zh" ? zh : en);
  const utils = trpc.useUtils();
  const [mode, setMode] = useState<"paste" | "file">("paste");
  const [kind, setKind] = useState<"email" | "pdf" | "eml">("email");
  const [content, setContent] = useState("");
  const [filename, setFilename] = useState("");
  const [size, setSize] = useState(0);
  const [reading, setReading] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<{
    flightsCreated: number;
    hotelsCreated: number;
    skipped: number;
  } | null>(null);
  const analyze = trpc.bookingImport.analyze.useMutation({
    onSuccess: result => {
      setPreview(result);
      setSelected(new Set());
      setError("");
      setSummary(null);
    },
    onError: error => setError(error.message),
  });
  const importer = trpc.bookingImport.import.useMutation({
    onSuccess: result => {
      setSummary(result);
      setError("");
      setSelected(new Set());
      void utils.invalidate(); // flights/stays, trip, budgets, analytics, itinerary and passport caches
      toast.success(copy("預訂匯入完成", "Booking import completed"));
    },
    onError: error => {
      setError(error.message);
      void utils.invalidate();
    },
  });
  const busy = reading || analyze.isPending || importer.isPending;
  useEffect(() => {
    if (!open) {
      setContent("");
      setFilename("");
      setSize(0);
      setPreview(null);
      setSelected(new Set());
      setError("");
      setSummary(null);
    }
  }, [open, tripId]);
  const clearDraft = () => {
    setPreview(null);
    setSelected(new Set());
    setSummary(null);
    setError("");
  };
  const chooseFile = async (file?: File) => {
    if (!file || busy) return;
    if (file.size > BOOKING_MAX_BYTES) {
      setError(copy("檔案不可超過 3 MB", "Files must not exceed 3 MB"));
      return;
    }
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!["pdf", "eml", "txt"].includes(extension ?? "")) {
      setError(copy("只接受 PDF、EML 或 TXT", "Choose PDF, EML or TXT"));
      return;
    }
    setReading(true);
    try {
      const next =
        extension === "txt" ? await file.text() : await base64File(file);
      if (
        extension === "txt" &&
        (next.trim().length < 30 || next.length > BOOKING_MAX_TEXT)
      )
        throw new Error(
          copy("文字需要 30–50,000 字元", "Text requires 30–50,000 characters")
        );
      setKind(extension === "txt" ? "email" : (extension as "pdf" | "eml"));
      setContent(next);
      setFilename(file.name);
      setSize(file.size);
      clearDraft();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : copy("讀取失敗", "File could not be read")
      );
    } finally {
      setReading(false);
    }
  };
  const flightKeys = new Set(
    existingFlights.map(bookingFlightKey).filter(Boolean)
  );
  const hotelKeys = new Set(
    existingHotels.map(bookingHotelKey).filter(Boolean)
  );
  const isDuplicateFlight = (flight: BookingFlight) => {
    const key = bookingFlightKey(flight);
    return !!key && flightKeys.has(key);
  };
  const isDuplicateHotel = (hotel: BookingHotel) => {
    const key = bookingHotelKey(hotel);
    return !!key && hotelKeys.has(key);
  };
  const toggle = (key: string) =>
    setSelected(previous => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const selectValid = () => {
    const next = new Set<string>();
    preview?.flights.forEach((flight, index) => {
      if (
        bookingFlightImportSchema.safeParse(flight).success &&
        !isDuplicateFlight(flight)
      )
        next.add(`f${index}`);
    });
    preview?.hotels.forEach((hotel, index) => {
      if (
        bookingHotelImportSchema.safeParse(hotel).success &&
        !isDuplicateHotel(hotel)
      )
        next.add(`h${index}`);
    });
    setSelected(next);
  };
  const selectedFlights =
    preview?.flights.filter((_, index) => selected.has(`f${index}`)) ?? [];
  const selectedHotels =
    preview?.hotels.filter((_, index) => selected.has(`h${index}`)) ?? [];
  const invalidSelection =
    selectedFlights.some(
      value => !bookingFlightImportSchema.safeParse(value).success
    ) ||
    selectedHotels.some(
      value => !bookingHotelImportSchema.safeParse(value).success
    );
  const editFlight = (
    index: number,
    field: keyof BookingFlight,
    value: string
  ) =>
    setPreview(
      previous =>
        previous && {
          ...previous,
          flights: previous.flights.map((flight, i) =>
            i === index ? { ...flight, [field]: value } : flight
          ),
        }
    );
  const editHotel = (index: number, field: keyof BookingHotel, value: string) =>
    setPreview(
      previous =>
        previous && {
          ...previous,
          hotels: previous.hotels.map((hotel, i) =>
            i === index ? { ...hotel, [field]: value } : hotel
          ),
        }
    );
  const fieldLabels: Record<string, [string, string]> = {
    airline: ["航空公司", "Airline"],
    flightNumber: ["航班編號", "Flight number"],
    date: ["出發日期 *", "Departure date *"],
    fromCode: ["出發 IATA *", "From IATA *"],
    fromCity: ["出發城市", "From city"],
    toCode: ["抵達 IATA *", "To IATA *"],
    toCity: ["抵達城市", "To city"],
    departTime: ["出發時間", "Departure time"],
    arriveTime: ["抵達時間", "Arrival time"],
    duration: ["原文飛行時長", "Source duration"],
    bookingReference: ["確認編號", "Booking reference"],
    name: ["酒店名稱 *", "Hotel name *"],
    city: ["城市", "City"],
    checkIn: ["入住日期 *", "Check-in *"],
    checkOut: ["退房日期 *", "Check-out *"],
    notes: [
      "備註（勿填個人／付款資料）",
      "Notes (no personal/payment details)",
    ],
  };
  const field = (
    id: string,
    name: string,
    value: string,
    update: (value: string) => void
  ) => {
    const isDate = ["date", "checkIn", "checkOut"].includes(name);
    const limit =
      name === "notes"
        ? 2000
        : name === "bookingReference"
          ? 100
          : name === "flightNumber"
            ? 50
            : ["departTime", "arriveTime"].includes(name)
              ? 5
              : name === "duration"
                ? 30
                : ["fromCode", "toCode"].includes(name)
                  ? 3
                  : isDate
                    ? 10
                    : 255;
    return (
      <div
        key={id}
        className={name === "notes" ? "col-span-2 min-w-0" : "min-w-0"}
      >
        <Label htmlFor={id} className="text-xs">
          {copy(...fieldLabels[name])}
        </Label>
        {name === "notes" ? (
          <textarea
            id={id}
            className="mt-1 w-full min-h-20 rounded-lg border bg-background p-2 text-sm"
            maxLength={limit}
            value={value}
            onChange={e => update(e.target.value)}
          />
        ) : (
          <Input
            id={id}
            type={isDate ? "date" : "text"}
            className="mt-1 w-full"
            maxLength={limit}
            placeholder={
              ["departTime", "arriveTime"].includes(name) ? "HH:mm" : ""
            }
            value={value}
            onChange={e =>
              update(
                ["fromCode", "toCode", "flightNumber"].includes(name)
                  ? e.target.value.toUpperCase()
                  : e.target.value
              )
            }
          />
        )}
      </div>
    );
  };
  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!busy) onOpenChange(next);
      }}
    >
      <DialogContent
        showCloseButton={!busy}
        className="max-w-3xl max-h-[90dvh] overflow-y-auto"
        onEscapeKeyDown={event => {
          if (busy) event.preventDefault();
        }}
        onInteractOutside={event => {
          if (busy) event.preventDefault();
        }}
      >
        <DialogHeader>
          <p className="voyage-eyebrow flex items-center gap-2">
            <FileInput className="h-4 w-4" />{" "}
            {copy("旅途手記 · 預訂匯入", "TRAVEL JOURNAL · BOOKING IMPORT")}
          </p>
          <DialogTitle>
            {copy(
              "讀取預訂，確認後加入旅程",
              "Read a booking, review, then add to your trip"
            )}
          </DialogTitle>
          <DialogDescription>
            {copy(
              "手動上傳或貼上 → AI 解析 → 編輯及選取 → 確認匯入。未連接郵箱，不會自動或持續監察收件箱。",
              "Upload or paste → AI parse → edit and select → confirm import. No mailbox connection or continuous inbox monitoring is configured."
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-xl border bg-accent/40 p-3 text-xs leading-relaxed space-y-2">
          <p className="flex gap-2">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            {copy(
              "點擊解析會將內容送至 AI，並消耗項目信用額。PDF／EML 只在記憶體處理；不會公開上傳或儲存原始內容。請先移除旅客、護照及付款資料。",
              "Parse sends content to AI and uses project credits. PDF/EML are processed in memory, never publicly uploaded or stored as source content. Remove traveler, passport and payment details first."
            )}
          </p>
          <p>
            {copy(
              "只匯入航班與住宿，不建立支出或付款；金額、貨幣及確認編號（如有）只作備註。匯入後旅程受邀成員可見。EML 附件會忽略，請另外上傳 PDF 附件。",
              "Imports flights/stays only, not expenses or payments. Found prices, currencies and references remain notes only, visible to invited trip members. EML attachments are ignored; upload PDF attachments separately."
            )}
          </p>
        </div>
        {!canEdit && (
          <p role="alert" className="text-sm text-destructive">
            {copy(
              "唯讀：只有旅程擁有人或編輯者可解析及匯入。",
              "Read-only: only trip owners and editors can parse or import."
            )}
          </p>
        )}
        <fieldset disabled={busy || !canEdit} className="space-y-3 min-w-0">
          <div className="flex gap-2">
            <Button
              variant={mode === "paste" ? "default" : "outline"}
              onClick={() => {
                setMode("paste");
                setKind("email");
                setContent("");
                setFilename("");
                setSize(0);
                clearDraft();
              }}
            >
              {copy("貼上電郵", "Paste email")}
            </Button>
            <Button
              variant={mode === "file" ? "default" : "outline"}
              onClick={() => {
                setMode("file");
                setContent("");
                setFilename("");
                setSize(0);
                clearDraft();
              }}
            >
              {copy("選擇檔案", "Choose file")}
            </Button>
          </div>
          {mode === "paste" ? (
            <div>
              <Label htmlFor="booking-source">
                {copy(
                  "電郵內容（30–50,000 字元）",
                  "Email text (30–50,000 characters)"
                )}
              </Label>
              <textarea
                id="booking-source"
                className="mt-2 w-full min-h-36 rounded-lg border bg-background p-3 text-sm"
                maxLength={BOOKING_MAX_TEXT}
                value={content}
                onChange={e => {
                  setContent(e.target.value);
                  clearDraft();
                }}
              />
              <p className="text-xs text-muted-foreground">
                {content.length.toLocaleString()} / 50,000
              </p>
            </div>
          ) : (
            <div>
              <Label htmlFor="booking-file">
                PDF / EML / TXT · {copy("最大 3 MB", "maximum 3 MB")}
              </Label>
              <Input
                id="booking-file"
                type="file"
                className="mt-2"
                accept=".pdf,.eml,.txt,application/pdf,message/rfc822,text/plain"
                onChange={e => {
                  void chooseFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              {filename && (
                <p className="mt-2 break-all text-xs text-muted-foreground">
                  {filename} · {(size / 1024).toFixed(1)} KB
                </p>
              )}
            </div>
          )}
          <Button
            className="gap-2"
            disabled={
              !content ||
              (kind === "email" &&
                (content.trim().length < 30 ||
                  content.length > BOOKING_MAX_TEXT))
            }
            onClick={() => {
              setError("");
              analyze.mutate({
                tripId,
                kind,
                content,
                ...(filename ? { filename } : {}),
              });
            }}
          >
            <FileInput className="h-4 w-4" />
            {copy("解析預訂", "Parse booking")}
          </Button>
        </fieldset>
        {busy && (
          <p role="status" className="flex gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            {importer.isPending
              ? copy("正在儲存選取項目…", "Saving selected bookings…")
              : copy(
                  "正在安全處理，請稍候…",
                  "Processing securely, please wait…"
                )}
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive break-words"
          >
            {error}
          </p>
        )}
        {summary && (
          <p role="status" className="rounded-xl bg-primary/10 p-3 text-sm">
            {copy(
              `已新增 ${summary.flightsCreated} 個航班、${summary.hotelsCreated} 個住宿；跳過 ${summary.skipped} 個重複項目。沒有建立支出或付款。`,
              `Created ${summary.flightsCreated} flights and ${summary.hotelsCreated} stays; skipped ${summary.skipped} duplicates. No expenses or payments created.`
            )}
          </p>
        )}
        {preview && (
          <fieldset disabled={busy || !canEdit} className="space-y-4 min-w-0">
            <div className="rounded-xl bg-accent/40 p-3 text-xs leading-relaxed space-y-2">
              <p>
                {copy(
                  "AI 可能出錯，所有項目預設不選取。請修正缺漏、日期、機場及時間後選取。香港 UTC+8 顯示保留原文日期；機場當地時間尚未轉換，請自行核對，勿用時差推算飛行時間。",
                  "AI can be wrong; all items start unchecked. Correct missing dates, airports and times before selecting. Hong Kong UTC+8 display preserves source calendar dates; airport-local clocks have NOT been converted. Verify them; never infer duration from clock differences."
                )}
              </p>
              {!preview.flights.length && !preview.hotels.length && (
                <p role="status">
                  {copy(
                    "未找到航班或住宿。沒有資料可匯入。",
                    "No flights or stays found. There is nothing to import."
                  )}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <Button variant="outline" size="sm" onClick={selectValid}>
                {copy("選取有效非重複項目", "Select valid nonduplicates")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelected(new Set())}
              >
                {copy("全部取消", "Clear selection")}
              </Button>
              <span className="text-xs">
                {copy(`已選 ${selected.size} 項`, `${selected.size} selected`)}
              </span>
            </div>
            {preview.flights.map((flight, index) => {
              const validation = bookingFlightImportSchema.safeParse(flight);
              return (
                <section
                  key={`f${index}`}
                  className="rounded-xl border p-3 sm:p-4 space-y-3"
                >
                  <Label className="flex gap-2 items-center">
                    <input
                      type="checkbox"
                      checked={selected.has(`f${index}`)}
                      onChange={() => toggle(`f${index}`)}
                    />
                    <Plane className="h-4 w-4" />
                    {copy(`航班 ${index + 1}`, `Flight ${index + 1}`)}
                  </Label>
                  {isDuplicateFlight(flight) && (
                    <p className="text-xs text-primary">
                      {copy(
                        "旅程已有相符航班；確認時會跳過。",
                        "Matching flight already exists; confirmation will skip it."
                      )}
                    </p>
                  )}
                  {!validation.success && (
                    <p role="status" className="text-xs text-destructive">
                      {copy("需修正：", "Needs correction: ")}
                      {validation.error.issues
                        .map(issue =>
                          copy(
                            ...(fieldLabels[String(issue.path[0])] ?? [
                              "欄位",
                              "Field",
                            ])
                          )
                        )
                        .join(" · ")}
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    {(
                      [
                        "airline",
                        "flightNumber",
                        "date",
                        "fromCode",
                        "fromCity",
                        "toCode",
                        "toCity",
                        "departTime",
                        "arriveTime",
                        "duration",
                        "bookingReference",
                        "notes",
                      ] as const
                    ).map(name =>
                      field(
                        `booking-f${index}-${name}`,
                        name,
                        flight[name],
                        value => editFlight(index, name, value)
                      )
                    )}
                    <div className="col-span-2">
                      <Label htmlFor={`booking-f${index}-type`}>
                        {copy("航段類型", "Segment type")}
                      </Label>
                      <select
                        id={`booking-f${index}-type`}
                        className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
                        value={flight.type}
                        onChange={e =>
                          editFlight(index, "type", e.target.value)
                        }
                      >
                        <option value="outbound">
                          {copy("去程", "Outbound")}
                        </option>
                        <option value="return">{copy("回程", "Return")}</option>
                        <option value="connecting">
                          {copy("轉機／待分類", "Connecting / unclassified")}
                        </option>
                      </select>
                    </div>
                  </div>
                </section>
              );
            })}
            {preview.hotels.map((hotel, index) => {
              const validation = bookingHotelImportSchema.safeParse(hotel),
                nights = bookingNights(hotel.checkIn, hotel.checkOut);
              return (
                <section
                  key={`h${index}`}
                  className="rounded-xl border p-3 sm:p-4 space-y-3"
                >
                  <Label className="flex gap-2 items-center">
                    <input
                      type="checkbox"
                      checked={selected.has(`h${index}`)}
                      onChange={() => toggle(`h${index}`)}
                    />
                    <Hotel className="h-4 w-4" />
                    {copy(`住宿 ${index + 1}`, `Stay ${index + 1}`)}
                  </Label>
                  {isDuplicateHotel(hotel) && (
                    <p className="text-xs text-primary">
                      {copy(
                        "旅程已有相符住宿；確認時會跳過。",
                        "Matching stay already exists; confirmation will skip it."
                      )}
                    </p>
                  )}
                  {!validation.success && (
                    <p role="status" className="text-xs text-destructive">
                      {copy("需修正：", "Needs correction: ")}
                      {validation.error.issues
                        .map(issue =>
                          copy(
                            ...(fieldLabels[String(issue.path[0])] ?? [
                              "欄位",
                              "Field",
                            ])
                          )
                        )
                        .join(" · ")}
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    {(
                      [
                        "name",
                        "city",
                        "checkIn",
                        "checkOut",
                        "bookingReference",
                        "notes",
                      ] as const
                    ).map(name =>
                      field(
                        `booking-h${index}-${name}`,
                        name,
                        hotel[name],
                        value => editHotel(index, name, value)
                      )
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {nights === null
                      ? copy(
                          "晚數：待完整有效日期",
                          "Nights: valid dates needed"
                        )
                      : copy(
                          `${nights} 晚（按日期自動計算）`,
                          `${nights} nights (computed from dates)`
                        )}
                  </p>
                </section>
              );
            })}
            <p className="text-xs text-muted-foreground">
              {copy(
                "確認只會新增選取資料，不修改或刪除現有項目。重複檢查於本伺服器程序內序列化，跨伺服器並非唯一性保證。預覽一小時後失效。",
                "Confirmation only adds selected records; existing data is never edited or deleted. Duplicate checks are serialized in this server process, not guaranteed across servers. Preview expires in one hour."
              )}
            </p>
            <Button
              className="w-full gap-2"
              disabled={!selected.size || invalidSelection}
              onClick={() => {
                if (!preview || invalidSelection || busy || !canEdit) return;
                importer.mutate({
                  tripId,
                  sourceHash: preview.sourceHash,
                  previewToken: preview.previewToken,
                  flights: selectedFlights,
                  hotels: selectedHotels,
                });
              }}
            >
              <ShieldCheck className="h-4 w-4" />
              {copy(
                `確認匯入 ${selected.size} 項`,
                `Confirm import · ${selected.size} selected`
              )}
            </Button>
            {invalidSelection && (
              <p role="alert" className="text-xs text-destructive">
                {copy(
                  "選取項目仍有錯誤，請修正或取消選取。",
                  "Selected items need correction; edit or deselect them."
                )}
              </p>
            )}
          </fieldset>
        )}
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => onOpenChange(false)}
        >
          {copy("關閉", "Close")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
