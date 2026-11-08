import React, { useEffect, useRef, useState } from "react";
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
import {
  Loader2,
  FileInput,
  Plane,
  Hotel,
  ShieldCheck,
  ImagePlus,
  ClipboardPaste,
} from "lucide-react";
import { toast } from "sonner";
import {
  BookingImageError,
  prepareBookingImage,
  isBookingImageMime,
  type PreparedBookingImage,
  type BookingImageMime,
} from "@/lib/bookingImage";
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
  const [mode, setMode] = useState<"paste" | "file" | "image">("paste");
  const [kind, setKind] = useState<"email" | "pdf" | "eml" | "image">("email");
  const [content, setContent] = useState("");
  const [filename, setFilename] = useState("");
  const [size, setSize] = useState(0);
  const [image, setImage] = useState<Omit<
    PreparedBookingImage,
    "base64"
  > | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const picker = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const readLock = useRef(false);
  const current = useRef({ open, tripId, mode, canEdit });
  current.current = { open, tripId, mode, canEdit };
  const [reading, setReading] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<{
    flightsCreated: number;
    hotelsCreated: number;
    skipped: number;
  } | null>(null);
  // reset() on source changes/close detaches the observer; discard its cached
  // source variables immediately rather than keeping raw base64 for 5 minutes.
  const analyze = trpc.bookingImport.analyze.useMutation({ gcTime: 0 });
  const importer = trpc.bookingImport.import.useMutation({ gcTime: 0 });
  const busy = reading || analyze.isPending || importer.isPending;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const stillCurrent = (token: number, source = current.current) =>
    token === generation.current &&
    current.current.open &&
    current.current.canEdit &&
    current.current.tripId === source.tripId &&
    current.current.mode === source.mode;
  useEffect(() => {
    generation.current++;
    readLock.current = false;
    setReading(false);
    analyze.reset();
    importer.reset();
    setMode("paste");
    setKind("email");
    setContent("");
    setFilename("");
    setSize(0);
    setImage(null);
    setPreview(null);
    setSelected(new Set());
    setError("");
    setSummary(null);
    return () => {
      generation.current++;
    };
  }, [open, tripId]);
  useEffect(() => {
    if (!open || !image) {
      setImageUrl("");
      return;
    }
    const url = URL.createObjectURL(image.blob);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [image, open, tripId]);
  const clearDraft = () => {
    setPreview(null);
    setSelected(new Set());
    setSummary(null);
    setError("");
  };
  const clearSource = () => {
    generation.current++;
    analyze.reset();
    importer.reset();
    setContent("");
    setFilename("");
    setSize(0);
    setImage(null);
    setKind("email");
    clearDraft();
  };
  const switchMode = (next: typeof mode) => {
    if (busyRef.current || readLock.current) return;
    clearSource();
    setMode(next);
  };
  const imageError = (cause: unknown) => {
    if (!(cause instanceof BookingImageError))
      return copy(
        "圖片讀取失敗，請重新選擇。",
        "Could not read the image. Choose it again."
      );
    const messages: Record<BookingImageError["code"], [string, string]> = {
      format: [
        "只接受真實 PNG、JPEG 或 WebP 圖片（不支援 HEIC／GIF／SVG）。請先轉換格式。",
        "Choose a real PNG, JPEG or WebP image (not HEIC/GIF/SVG). Convert it first.",
      ],
      size: [
        "圖片原檔需大於 0 並不超過 20 MB。",
        "The original image must be nonempty and no larger than 20 MB.",
      ],
      dimensions: [
        "圖片尺寸過大或無效：最多 3,200 萬像素，每邊最多 32,768。請先縮小原圖。",
        "Image dimensions are invalid or too large: max 32 million pixels and 32,768 per edge. Reduce the original first.",
      ],
      broken: [
        "圖片損壞或無法解碼，請重新截圖或另存為 PNG／JPEG／WebP。",
        "The image is damaged or cannot be decoded. Take another screenshot or save as PNG/JPEG/WebP.",
      ],
      animated: [
        "只接受靜態截圖／相片，不支援動畫 PNG／WebP。",
        "Use a still screenshot/photo, not animated PNG/WebP.",
      ],
      compression: [
        "無法安全壓縮至 3 MB；請先縮小原圖，但保留完整清晰的預訂內容。",
        "Could not safely fit the image within 3 MB. Reduce it first, keeping all booking details readable.",
      ],
    };
    return copy(...messages[cause.code]);
  };
  const readSource = async (
    file: File,
    token: number,
    source: typeof current.current,
    imageOnly = false
  ) => {
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    const isImage =
      imageOnly ||
      isBookingImageMime(file.type) ||
      file.type.startsWith("image/") ||
      ["png", "jpg", "jpeg", "webp", "heic", "heif", "gif", "svg"].includes(
        extension
      );
    if (isImage) {
      const prepared = await prepareBookingImage(file);
      if (!stillCurrent(token, source)) return;
      const { base64, ...metadata } = prepared;
      setImage(metadata);
      setKind("image");
      setContent(base64);
      setFilename(file.name.slice(0, 255));
      setSize(metadata.blob.size);
      setMode("image");
      clearDraft();
      return;
    }
    if (file.size > BOOKING_MAX_BYTES)
      throw new Error(copy("檔案不可超過 3 MB", "Files must not exceed 3 MB"));
    if (!["pdf", "eml", "txt"].includes(extension))
      throw new Error(
        copy(
          "只接受 PDF、EML、TXT、PNG、JPEG 或 WebP",
          "Choose PDF, EML, TXT, PNG, JPEG or WebP"
        )
      );
    const next =
      extension === "txt" ? await file.text() : await base64File(file);
    if (
      extension === "txt" &&
      (next.trim().length < 30 || next.length > BOOKING_MAX_TEXT)
    )
      throw new Error(
        copy("文字需要 30–50,000 字元", "Text requires 30–50,000 characters")
      );
    if (!stillCurrent(token, source)) return;
    setKind(extension === "txt" ? "email" : (extension as "pdf" | "eml"));
    setContent(next);
    setFilename(file.name.slice(0, 255));
    setSize(file.size);
    setImage(null);
    clearDraft();
  };
  const chooseFile = async (file?: File, imageOnly = mode === "image") => {
    if (!file || busyRef.current || readLock.current || !open || !canEdit)
      return;
    clearSource();
    const token = generation.current,
      source = current.current;
    readLock.current = true;
    setReading(true);
    try {
      await readSource(file, token, source, imageOnly);
    } catch (cause) {
      if (stillCurrent(token, source))
        setError(
          cause instanceof BookingImageError
            ? imageError(cause)
            : cause instanceof Error
              ? cause.message
              : imageError(cause)
        );
    } finally {
      if (token === generation.current) {
        readLock.current = false;
        setReading(false);
      }
    }
  };
  const pasteClipboardImage = async () => {
    if (busyRef.current || readLock.current || !open || !canEdit) return;
    if (!navigator.clipboard?.read) {
      setError(
        copy(
          "瀏覽器不支援讀取圖片剪貼簿，請使用「選擇截圖／相片」。",
          "Image clipboard reading is unavailable. Use Choose screenshot / photo."
        )
      );
      picker.current?.click();
      return;
    }
    clearSource();
    const token = generation.current,
      source = current.current;
    readLock.current = true;
    setReading(true);
    try {
      // Only called by this button's user gesture; never read on mount or in an effect.
      const items = await navigator.clipboard.read();
      if (!stillCurrent(token, source)) return;
      const item = items.find(item => item.types.some(isBookingImageMime));
      const mime = item?.types.find(isBookingImageMime) as
        | BookingImageMime
        | undefined;
      if (!item || !mime) throw new BookingImageError("format");
      const blob = await item.getType(mime);
      if (!stillCurrent(token, source)) return;
      const extension = mime === "image/jpeg" ? "jpg" : mime.split("/")[1];
      await readSource(
        new File([blob], `clipboard.${extension}`, { type: mime }),
        token,
        source,
        true
      );
    } catch (cause) {
      if (stillCurrent(token, source))
        setError(
          cause instanceof BookingImageError
            ? imageError(cause)
            : copy(
                "未能讀取剪貼簿（Safari／權限限制）。請直接貼上圖片或使用「選擇截圖／相片」。",
                "Clipboard access failed (Safari/permission restrictions). Paste an image directly or use Choose screenshot / photo."
              )
        );
    } finally {
      if (token === generation.current) {
        readLock.current = false;
        setReading(false);
      }
    }
  };
  const parseBooking = async () => {
    if (
      !content ||
      busyRef.current ||
      readLock.current ||
      !canEdit ||
      !open ||
      (kind === "image" && !image)
    )
      return;
    const token = generation.current,
      source = current.current;
    busyRef.current = true;
    setError("");
    try {
      const result = await analyze.mutateAsync({
        tripId,
        kind,
        content,
        ...(kind === "image" && image ? { mimeType: image.mimeType } : {}),
        ...(filename ? { filename } : {}),
      });
      if (!stillCurrent(token, source)) return;
      setPreview(result);
      setSelected(new Set());
      setSummary(null);
    } catch (cause) {
      if (stillCurrent(token, source))
        setError(
          cause instanceof Error
            ? cause.message
            : copy("解析失敗", "Parsing failed")
        );
    }
  };
  const confirmImport = async () => {
    if (
      !preview ||
      invalidSelection ||
      busyRef.current ||
      readLock.current ||
      !canEdit ||
      !open
    )
      return;
    const token = generation.current,
      source = current.current;
    busyRef.current = true;
    try {
      const result = await importer.mutateAsync({
        tripId,
        sourceHash: preview.sourceHash,
        previewToken: preview.previewToken,
        flights: selectedFlights,
        hotels: selectedHotels,
      });
      // Invalidate even if the dialog was externally closed: the server may have saved.
      void utils.invalidate();
      if (!stillCurrent(token, source)) return;
      setSummary(result);
      setError("");
      setSelected(new Set());
      toast.success(copy("預訂匯入完成", "Booking import completed"));
    } catch (cause) {
      void utils.invalidate();
      if (stillCurrent(token, source))
        setError(
          cause instanceof Error
            ? cause.message
            : copy("匯入失敗", "Import failed")
        );
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
        if (!busyRef.current && !readLock.current) onOpenChange(next);
      }}
    >
      <DialogContent
        showCloseButton={!busy}
        className="max-w-3xl max-h-[90dvh] overflow-y-auto"
        onPaste={event => {
          const file = Array.from(event.clipboardData.items)
            .find(
              item => item.kind === "file" && item.type.startsWith("image/")
            )
            ?.getAsFile();
          if (!file) return;
          event.preventDefault();
          if (!busyRef.current && !readLock.current && canEdit)
            void chooseFile(file, true);
        }}
        onEscapeKeyDown={event => {
          if (busyRef.current || readLock.current) event.preventDefault();
        }}
        onInteractOutside={event => {
          if (busyRef.current || readLock.current) event.preventDefault();
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
              "只有點擊「解析預訂」才會將內容送至 AI，並消耗項目信用額。圖片／PDF／EML 只在記憶體處理；不會公開上傳或儲存原始檔案，關閉會清除本地預覽。請先遮蓋或移除旅客姓名、護照及付款資料。",
              "Only Parse booking sends content to AI and uses project credits. Images/PDF/EML are processed in memory, with no public upload or original-file storage; closing clears the local preview. Cover or remove traveler names, passport and payment details first."
            )}
          </p>
          <p>
            {copy(
              "只匯入航班與住宿，不建立支出或付款；金額、貨幣及確認編號（如有）只作備註。匯入後旅程受邀成員可見。EML 附件會忽略，請另外選擇 PDF 或圖片附件。",
              "Imports flights/stays only, not expenses or payments. Found prices, currencies and references remain notes only, visible to invited trip members. EML attachments are ignored; choose PDF or image attachments separately."
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
          <div className="flex flex-wrap gap-2">
            <Button
              variant={mode === "paste" ? "default" : "outline"}
              aria-pressed={mode === "paste"}
              className="h-auto min-h-10 whitespace-normal py-2 text-sm"
              onClick={() => switchMode("paste")}
            >
              {copy("貼上電郵", "Paste email")}
            </Button>
            <Button
              variant={mode === "file" ? "default" : "outline"}
              aria-pressed={mode === "file"}
              className="h-auto min-h-10 whitespace-normal py-2 text-sm"
              onClick={() => switchMode("file")}
            >
              {copy("選擇檔案", "Choose file")}
            </Button>
            <Button
              variant={mode === "image" ? "default" : "outline"}
              aria-pressed={mode === "image"}
              className="h-auto min-h-10 gap-2 whitespace-normal py-2 text-sm border-primary/50"
              onClick={() => switchMode("image")}
            >
              <ImagePlus className="h-4 w-4 shrink-0" />
              {copy("截圖／相片", "Screenshot / photo")}
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
          ) : mode === "file" ? (
            <div>
              <Label htmlFor="booking-file">
                PDF / EML / TXT · {copy("最大 3 MB", "maximum 3 MB")}
              </Label>
              <p className="mt-1 text-sm text-muted-foreground">
                {copy(
                  "亦接受 PNG／JPEG／WebP 截圖及相片（原檔最多 20 MB）。",
                  "Also accepts PNG/JPEG/WebP screenshots and photos (original max 20 MB)."
                )}
              </p>
              <Input
                id="booking-file"
                type="file"
                className="mt-2 h-auto min-h-11 py-2 text-base sm:text-sm"
                accept=".pdf,.eml,.txt,.png,.jpg,.jpeg,.webp,application/pdf,message/rfc822,text/plain,image/png,image/jpeg,image/webp"
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
          ) : (
            <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-3 min-w-0">
              <Label htmlFor="booking-image" className="text-sm font-semibold">
                {copy(
                  "選擇預訂截圖／相片",
                  "Choose a booking screenshot / photo"
                )}
              </Label>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {copy(
                  "PNG／JPEG／WebP · 原檔最多 20 MB；較大圖片會在本機等比例壓縮至 3 MB，不裁切、不放大。請保留完整且清晰的航班或酒店資料。",
                  "PNG/JPEG/WebP · original max 20 MB. Larger images are compressed locally to 3 MB, proportionally, without cropping or upscaling. Keep complete flight or hotel details readable."
                )}
              </p>
              <Input
                ref={picker}
                id="booking-image"
                type="file"
                className="h-auto min-h-11 py-2 text-base sm:text-sm"
                accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                onChange={event => {
                  void chooseFile(event.target.files?.[0], true);
                  event.target.value = "";
                }}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  className="h-auto min-h-10 gap-2 whitespace-normal py-2 text-sm"
                  onClick={() => void pasteClipboardImage()}
                >
                  <ClipboardPaste className="h-4 w-4 shrink-0" />
                  {copy("貼上剪貼簿圖片", "Paste clipboard image")}
                </Button>
                {image && (
                  <Button
                    variant="ghost"
                    className="h-auto min-h-10 whitespace-normal py-2 text-sm"
                    onClick={clearSource}
                  >
                    {copy("移除圖片", "Remove image")}
                  </Button>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {copy(
                  "桌面可直接按 Ctrl+V／⌘V 貼上圖片；Safari 或未授權時請用上方檔案選擇器。剪貼簿只會在你貼上或按下按鈕時讀取。",
                  "On desktop, paste an image with Ctrl+V / ⌘V. Use the picker if Safari or permissions block access. Clipboard is read only when you paste or press the button."
                )}
              </p>
              {image && imageUrl && (
                <div className="space-y-2">
                  <p className="break-all text-sm font-medium">{filename}</p>
                  <p role="status" className="text-sm text-muted-foreground">
                    {image.compressed
                      ? copy(
                          `已在本機壓縮：${(image.originalSize / 1024 / 1024).toFixed(2)} → ${(size / 1024 / 1024).toFixed(2)} MB`,
                          `Compressed locally: ${(image.originalSize / 1024 / 1024).toFixed(2)} → ${(size / 1024 / 1024).toFixed(2)} MB`
                        )
                      : copy(
                          `保留原圖 · ${(size / 1024).toFixed(1)} KB`,
                          `Original preserved · ${(size / 1024).toFixed(1)} KB`
                        )}
                    {` · ${image.width} × ${image.height}`}
                  </p>
                  <a
                    href={imageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-sm text-primary underline"
                  >
                    {copy(
                      "開啟本地完整圖片以核對文字",
                      "Open the complete local image to check text"
                    )}
                    <img
                      src={imageUrl}
                      alt={copy(
                        "待解析的預訂截圖／相片（本地預覽）",
                        "Booking screenshot/photo to parse (local preview)"
                      )}
                      className="mt-2 w-full h-auto rounded-lg border bg-background"
                    />
                  </a>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {image.compressed
                      ? copy(
                          "壓縮／縮小可能令細字模糊。請先開啟完整圖片核對；若資料不清楚，重新選擇較清晰圖片。解析後亦須逐項覆核，所有項目預設不選取。",
                          "Compression/resizing may blur small text. Check the complete image first; choose a clearer image if needed. Review every parsed field; all items start unchecked."
                        )
                      : copy(
                          "請先核對清晰度及遮蓋個人／付款資料；解析後逐項覆核。選擇圖片不會自動解析。",
                          "Check readability and cover personal/payment details before parsing, then review every field. Selecting an image does not parse it automatically."
                        )}
                  </p>
                </div>
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
            onClick={() => void parseBooking()}
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
              onClick={() => void confirmImport()}
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
          onClick={() => {
            if (!busyRef.current && !readLock.current) onOpenChange(false);
          }}
        >
          {copy("關閉", "Close")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
