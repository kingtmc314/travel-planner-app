import { trpc } from "@/lib/trpc";
import { useI18n } from "@/hooks/useI18n";
import { Button } from "@/components/ui/button";
import { formatDateOnlyInHongKong } from "@/lib/hongKongDate";
import {
  escapeItineraryHtml,
  getActivityFieldsFromPin,
  getItineraryInsights,
  getNextItineraryDay,
  getPlannedCosts,
  itineraryDateOnly,
  parsePlannedCost,
  UNSPECIFIED_CURRENCY,
} from "@/lib/itineraryInsights";
import {
  Dialog,
  DialogContent,
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
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  MapPin,
  Clock,
  Trash2,
  Edit2,
  Sparkles,
  Loader2,
  Home,
  Utensils,
  Camera,
  ShoppingBag,
  MoreHorizontal,
  CalendarPlus,
  GripVertical,
  MoveRight,
  FileDown,
  Train,
  Ticket,
  RefreshCw,
  Plane,
  CalendarDays,
  ListChecks,
} from "lucide-react";
import { useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ─── Category Definitions ─────────────────────────────────────────────────────
const CATEGORY_DEFS = [
  {
    value: "transport",
    icon: Train,
    color: "bg-blue-100 text-blue-600",
    ring: "ring-blue-200",
  },
  {
    value: "accommodation",
    icon: Home,
    color: "bg-purple-100 text-purple-600",
    ring: "ring-purple-200",
  },
  {
    value: "hotel",
    icon: Home,
    color: "bg-purple-100 text-purple-600",
    ring: "ring-purple-200",
  },
  {
    value: "food",
    icon: Utensils,
    color: "bg-orange-100 text-orange-600",
    ring: "ring-orange-200",
  },
  {
    value: "attraction",
    icon: Camera,
    color: "bg-emerald-100 text-emerald-600",
    ring: "ring-emerald-200",
  },
  {
    value: "shopping",
    icon: ShoppingBag,
    color: "bg-pink-100 text-pink-600",
    ring: "ring-pink-200",
  },
  {
    value: "other",
    icon: MoreHorizontal,
    color: "bg-muted text-muted-foreground",
    ring: "ring-border",
  },
];

function getCategoryStyle(cat: string, t: (k: any) => string) {
  const labels: Record<string, string> = {
    transport: t("catTransport"),
    accommodation: t("catAccommodation"),
    hotel: t("catAccommodation"),
    food: t("catFood"),
    attraction: t("catAttraction"),
    shopping: t("catShopping"),
    other: t("catOther"),
  };
  const def = CATEGORY_DEFS.find(c => c.value === cat) ?? CATEGORY_DEFS[6];
  return { ...def, label: labels[cat] ?? labels.other };
}

// ─── Status Detection from Notes ──────────────────────────────────────────────
function detectStatusBadge(
  notes: string | null | undefined,
  lang: string
): { label: string; cls: string } | null {
  if (!notes) return null;
  const n = notes;
  if (/需劃位|seat.?reserv|booking.?required/i.test(n))
    return {
      label: lang === "zh" ? "需劃位" : "Seat Req.",
      cls: "bg-amber-100 text-amber-700",
    };
  if (/建議預約|recommend|reserve/i.test(n))
    return {
      label: lang === "zh" ? "建議預約" : "Recommended",
      cls: "bg-amber-100 text-amber-700",
    };
  if (/\bpass\b|周遊券|rail.?pass/i.test(n))
    return { label: "PASS", cls: "bg-emerald-100 text-emerald-700" };
  return null;
}

// ─── Extract Train/Pass Tags from Notes ──────────────────────────────────────
function extractTags(notes: string | null | undefined): string[] {
  if (!notes) return [];
  const tags: string[] = [];
  const trainMatch = notes.match(/\b([A-Z][A-Z]+)\s+(\d{1,4})\b/g);
  if (trainMatch) tags.push(...trainMatch.slice(0, 2));
  const passMatch = notes.match(
    /([A-Z][A-Za-z\s]{2,20}Pass|[^\s,，。]{2,15}周遊券[^\s,，。]{0,8})/g
  );
  if (passMatch) tags.push(...passMatch.slice(0, 1));
  return tags.slice(0, 3);
}

// ─── Activity Form Data ───────────────────────────────────────────────────────
interface ActivityFormData {
  title: string;
  location: string;
  startTime: string;
  endTime: string;
  cost: string;
  currency: string;
  notes: string;
  category: string;
}

const defaultForm: ActivityFormData = {
  title: "",
  location: "",
  startTime: "",
  endTime: "",
  cost: "",
  currency: "JPY",
  notes: "",
  category: "attraction",
};

const PIN_CATEGORY_MAP: Record<string, string> = {
  attraction: "attraction",
  hotel: "hotel",
  restaurant: "food",
  transport: "transport",
  other: "other",
};

const CURRENCIES = [
  "JPY",
  "HKD",
  "USD",
  "EUR",
  "TWD",
  "KRW",
  "THB",
  "SGD",
  "AUD",
  "GBP",
];

// ─── Sortable Activity Card (Timeline Style) ──────────────────────────────────
function SortableActivityCard({
  activity,
  idx,
  totalCount,
  tripId,
  onEdit,
  onDelete,
  onMove,
  canEdit,
  busy,
  t,
  lang,
}: {
  activity: any;
  idx: number;
  totalCount: number;
  tripId: number;
  onEdit: (a: any) => void;
  onDelete: (id: number) => void;
  onMove: (a: any) => void;
  canEdit: boolean;
  busy: boolean;
  t: (k: any) => string;
  lang: string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: activity.id, disabled: !canEdit || busy });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
  };
  const cat = getCategoryStyle(activity.category, t);
  const Icon = cat.icon;
  const statusBadge = detectStatusBadge(activity.notes, lang);
  const tags = extractTags(activity.notes);
  const isLast = idx === totalCount - 1;

  return (
    <div ref={setNodeRef} style={style} className="relative flex gap-0 group">
      {/* Timeline: time + icon + spine */}
      <div className="flex flex-col items-center w-16 shrink-0">
        <div className="text-[11px] font-mono text-muted-foreground w-full text-right pr-2.5 pt-1 leading-none min-h-[18px]">
          {activity.startTime || ""}
        </div>
        <div
          className={`w-9 h-9 rounded-full ${cat.color} ring-2 ${cat.ring} flex items-center justify-center shrink-0 z-10 mt-0.5`}
        >
          <Icon className="w-4 h-4" />
        </div>
        {!isLast && (
          <div className="w-0.5 flex-1 bg-border mt-1 min-h-[20px]" />
        )}
      </div>

      {/* Card */}
      <div className="flex-1 min-w-0 pb-5 pt-1 pl-1">
        <div className="bg-card text-card-foreground border border-border rounded-2xl px-3 sm:px-4 py-3 shadow-sm">
          {/* Actions row (hover) */}
          {canEdit && (
            <div className="flex items-center justify-between mb-1 -mt-0.5">
              <button
                {...attributes}
                {...listeners}
                disabled={busy}
                className="w-11 h-11 flex items-center justify-center rounded-xl text-muted-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-primary cursor-grab active:cursor-grabbing touch-none"
                aria-label={t("dragToReorder")}
              >
                <GripVertical className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => onEdit(activity)}
                  disabled={busy}
                  className="w-11 h-11 flex items-center justify-center rounded-xl hover:bg-accent focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40"
                  title={t("edit")}
                  aria-label={`${t("edit")} ${activity.title}`}
                >
                  <Edit2 className="w-4 h-4 text-muted-foreground" />
                </button>
                <button
                  onClick={() => onMove(activity)}
                  disabled={busy}
                  className="w-11 h-11 flex items-center justify-center rounded-xl hover:bg-accent focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40"
                  title={t("moveToDay")}
                  aria-label={`${t("moveToDay")} ${activity.title}`}
                >
                  <MoveRight className="w-4 h-4 text-primary" />
                </button>
                <button
                  onClick={() => onDelete(activity.id)}
                  disabled={busy}
                  className="w-11 h-11 flex items-center justify-center rounded-xl hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40"
                  title={t("delete")}
                  aria-label={`${t("delete")} ${activity.title}`}
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </button>
              </div>
            </div>
          )}

          {/* Title + status badge */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground text-sm leading-snug">
                {activity.title}
              </p>
              {activity.location && (
                <div className="flex items-center gap-1 text-muted-foreground text-xs mt-1">
                  <MapPin className="w-3 h-3 shrink-0" />
                  <span className="truncate">{activity.location}</span>
                </div>
              )}
              {(activity.startTime || activity.endTime) && (
                <div className="flex items-center gap-1 text-muted-foreground text-xs mt-0.5">
                  <Clock className="w-3 h-3 shrink-0" />
                  <span>
                    {activity.startTime ?? ""}
                    {activity.endTime ? ` – ${activity.endTime}` : ""}
                  </span>
                </div>
              )}
            </div>
            {statusBadge && (
              <span
                className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${statusBadge.cls}`}
              >
                {statusBadge.label}
              </span>
            )}
          </div>

          {/* Cost badge */}
          {parsePlannedCost(activity.cost) != null && (
            <div className="mt-2">
              <span className="inline-flex items-center gap-1 bg-muted text-muted-foreground text-xs px-2 py-0.5 rounded-full font-mono">
                {lang === "zh" ? "預算" : "Estimated"} ·{" "}
                {activity.currency ||
                  (lang === "zh" ? "未指定貨幣" : "Unspecified currency")}{" "}
                {parsePlannedCost(activity.cost)!.toLocaleString(
                  lang === "zh" ? "zh-HK" : "en-HK",
                  { maximumFractionDigits: 2 }
                )}
              </span>
            </div>
          )}

          {activity.cost && parsePlannedCost(activity.cost) == null && (
            <p className="mt-2 text-xs text-muted-foreground break-words">
              {lang === "zh"
                ? "原有費用備註（不計入統計）"
                : "Original cost note (excluded from totals)"}
              : {activity.cost}
            </p>
          )}

          {/* Train/pass tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {tags.map((tag, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 bg-muted text-muted-foreground text-xs px-2 py-0.5 rounded border border-border"
                >
                  <Ticket className="w-2.5 h-2.5" />
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Notes */}
          {activity.notes && (
            <p className="text-muted-foreground text-xs mt-2 leading-relaxed line-clamp-2">
              {activity.notes}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Day Cover Banner ─────────────────────────────────────────────────────────
function DayCoverBanner({
  day,
  trip,
  activities,
  lang,
  t,
  canEdit,
  onAISuggest,
  onImportPins,
  onAddActivity,
  hasPins,
  suggestPending,
  busy,
}: {
  day: any;
  trip: any;
  activities: any[];
  lang: string;
  t: (k: any) => string;
  canEdit: boolean;
  onAISuggest: (d: any) => void;
  onImportPins: (id: number) => void;
  onAddActivity: (id: number) => void;
  hasPins: boolean;
  suggestPending: boolean;
  busy: boolean;
}) {
  const dateStr = formatDateOnlyInHongKong(
    itineraryDateOnly(day.date),
    lang === "zh" ? "zh" : "en",
    { month: "short", day: "numeric", weekday: "short" }
  );
  const dayTitle =
    day.title ??
    (lang === "zh" ? `第 ${day.dayNumber} 天` : `Day ${day.dayNumber}`);

  // Activity budgets are estimates; do not sum different currencies or expenses.
  const dailyCosts = getPlannedCosts(activities);

  // Route: first → last distinct location
  const locs = activities
    .filter((a: any) => a.location)
    .map((a: any) => a.location as string);
  const routeFrom = locs[0];
  const routeTo = locs[locs.length - 1];
  const showRoute = routeFrom && routeTo && routeFrom !== routeTo;

  // Pass tags from notes
  const passTags: string[] = [];
  activities.forEach((a: any) => {
    if (a.notes) {
      const m = a.notes.match(
        /([A-Z][A-Za-z\s]{2,20}Pass|[^\s,，。]{2,15}周遊券[^\s,，。]{0,8})/g
      );
      if (m)
        m.forEach((tag: string) => {
          if (!passTags.includes(tag)) passTags.push(tag);
        });
    }
  });

  return (
    <div className="rounded-t-2xl overflow-hidden border border-border border-b-0">
      {/* Cover photo strip */}
      <div
        className="relative min-h-28 flex items-end"
        style={{
          background: trip?.coverImage
            ? `linear-gradient(to bottom, rgba(0,0,0,0.05), rgba(0,0,0,0.7)), url(${trip.coverImage}) center/cover no-repeat`
            : "linear-gradient(135deg, #123044 0%, #12665d 100%)",
        }}
      >
        <div className="p-4 flex flex-col gap-3 w-full">
          <div>
            <div className="text-white/75 text-xs font-medium">
              {lang === "zh"
                ? `第 ${day.dayNumber} 天`
                : `Day ${day.dayNumber}`}{" "}
              · {dateStr || "—"}
            </div>
            <div className="text-white font-bold text-lg leading-tight mt-1 break-words">
              {dayTitle}
            </div>
          </div>
          {dailyCosts.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {dailyCosts.map(cost => (
                <span
                  key={cost.currency}
                  className="bg-white/10 text-white text-xs px-2.5 py-1 rounded-full"
                >
                  {lang === "zh" ? "預算" : "Estimated"} ·{" "}
                  {cost.currency === UNSPECIFIED_CURRENCY
                    ? lang === "zh"
                      ? "未指定貨幣"
                      : "Unspecified"
                    : cost.currency}{" "}
                  {cost.amount.toLocaleString(
                    lang === "zh" ? "zh-HK" : "en-HK",
                    { maximumFractionDigits: 2 }
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Route + pass tags row */}
      {(showRoute || passTags.length > 0) && (
        <div className="bg-muted/40 border-b border-border px-4 py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          {showRoute && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="w-3 h-3 shrink-0" />
              <span className="font-medium text-foreground">{routeFrom}</span>
              <span>→</span>
              <span className="font-medium text-foreground">{routeTo}</span>
            </div>
          )}
          {passTags.map((tag, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 text-xs font-medium px-2 py-0.5 rounded-full"
            >
              <Train className="w-3 h-3" />
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div className="bg-card text-card-foreground px-2 py-2 flex items-center gap-1 flex-wrap border-b border-border">
        {canEdit && hasPins && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onImportPins(day.id)}
            disabled={busy}
            className="gap-1.5 text-primary hover:bg-primary/10 text-xs min-h-11"
          >
            <MapPin className="w-3.5 h-3.5" />
            {lang === "zh" ? "匯入地點" : "Import Pin"}
          </Button>
        )}
        {canEdit && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onAISuggest(day)}
            disabled={suggestPending || busy}
            className="gap-1.5 text-purple-600 hover:text-purple-700 hover:bg-purple-50 text-xs min-h-11"
          >
            {suggestPending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Sparkles className="w-3 h-3" />
            )}
            {t("aiSuggest")}
          </Button>
        )}
        {canEdit && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onAddActivity(day.id)}
            disabled={busy}
            className="gap-1.5 text-primary hover:bg-primary/10 text-xs min-h-11 ml-auto"
          >
            <Plus className="w-3 h-3" />
            {t("addActivity")}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Activity Form ────────────────────────────────────────────────────────────
function ActivityForm({
  form,
  setForm,
  onSubmit,
  loading,
  submitLabel,
  t,
  lang,
}: {
  form: ActivityFormData;
  setForm: (f: ActivityFormData) => void;
  onSubmit: () => void;
  loading: boolean;
  submitLabel: string;
  t: (k: any) => string;
  lang: string;
}) {
  const categories = CATEGORY_DEFS.filter(c => c.value !== "accommodation").map(
    c => ({
      ...c,
      label:
        {
          transport: t("catTransport"),
          hotel: t("catAccommodation"),
          food: t("catFood"),
          attraction: t("catAttraction"),
          shopping: t("catShopping"),
          other: t("catOther"),
        }[c.value] ?? c.value,
    })
  );

  return (
    <div className="space-y-4 mt-2">
      <div>
        <Label>{t("activityTitle")} *</Label>
        <Input
          className="mt-1.5"
          placeholder={
            lang === "zh" ? "例：山形新幹線" : "e.g. Yamagata Shinkansen"
          }
          value={form.title}
          onChange={e => setForm({ ...form, title: e.target.value })}
        />
      </div>
      <div>
        <Label>{t("activityCategory")}</Label>
        <Select
          value={form.category}
          onValueChange={v => setForm({ ...form, category: v })}
        >
          <SelectTrigger className="mt-1.5">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {categories.map(c => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>{t("activityLocation")}</Label>
        <Input
          className="mt-1.5"
          placeholder={lang === "zh" ? "例：東京站" : "e.g. Tokyo Station"}
          value={form.location}
          onChange={e => setForm({ ...form, location: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>{t("activityStartTime")}</Label>
          <Input
            className="mt-1.5"
            type="time"
            value={form.startTime}
            onChange={e => setForm({ ...form, startTime: e.target.value })}
          />
        </div>
        <div>
          <Label>{t("activityEndTime")}</Label>
          <Input
            className="mt-1.5"
            type="time"
            value={form.endTime}
            onChange={e => setForm({ ...form, endTime: e.target.value })}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>{lang === "zh" ? "預算費用" : "Estimated cost"}</Label>
          <Input
            className="mt-1.5"
            inputMode="decimal"
            placeholder={lang === "zh" ? "未填寫" : "Not entered"}
            value={form.cost}
            onChange={e => setForm({ ...form, cost: e.target.value })}
          />
        </div>
        <div>
          <Label>{lang === "zh" ? "貨幣" : "Currency"}</Label>
          <Select
            value={form.currency || "unspecified"}
            onValueChange={v =>
              setForm({ ...form, currency: v === "unspecified" ? "" : v })
            }
          >
            <SelectTrigger className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unspecified">
                {lang === "zh" ? "未指定貨幣" : "Unspecified currency"}
              </SelectItem>
              {Array.from(
                new Set([
                  ...CURRENCIES,
                  ...(form.currency ? [form.currency] : []),
                ])
              ).map(c => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        {lang === "zh"
          ? "此處為活動預算，不會自動列入實際開支。時間以香港時間（UTC+8）顯示。"
          : "Activity costs are estimates, not automatically recorded expenses. Times use Hong Kong time (UTC+8)."}
      </p>
      <div>
        <Label>{t("activityNotes")}</Label>
        <Textarea
          className="mt-1.5"
          placeholder={
            lang === "zh"
              ? "備注、票號、通行證（如：需劃位、TSUBASA 133、JR Pass）"
              : "Notes, ticket no., pass info (e.g. Seat Req., TSUBASA 133, JR Pass)"
          }
          value={form.notes}
          onChange={e => setForm({ ...form, notes: e.target.value })}
          rows={2}
        />
      </div>
      <Button
        className="w-full min-h-11 rounded-xl"
        onClick={onSubmit}
        disabled={loading}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
        {submitLabel}
      </Button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ItineraryPage({ tripId }: { tripId: number }) {
  const { t, lang } = useI18n();
  const utils = trpc.useUtils();
  const {
    data: days,
    refetch,
    isLoading,
    error: daysError,
  } = trpc.itinerary.getDays.useQuery({ tripId }, { refetchInterval: 15000 });
  const { data: trip, isLoading: tripLoading } = trpc.trips.get.useQuery({
    tripId,
  });
  const canEdit = trip?.userRole === "owner" || trip?.userRole === "editor";
  const { data: pins } = trpc.map.getPins.useQuery({ tripId });
  const {
    data: flights,
    isLoading: flightsLoading,
    error: flightsError,
  } = trpc.flights.list.useQuery({ tripId });
  const {
    data: hotels,
    isLoading: hotelsLoading,
    error: hotelsError,
  } = trpc.hotels.list.useQuery({ tripId });
  const hasPins = (pins?.length ?? 0) > 0;

  const [addingDayId, setAddingDayId] = useState<number | null>(null);
  const [editingActivity, setEditingActivity] = useState<any | null>(null);
  const [movingActivity, setMovingActivity] = useState<any | null>(null);
  const [form, setForm] = useState<ActivityFormData>(defaultForm);
  const [aiDayId, setAiDayId] = useState<number | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<any[]>([]);
  const [showImportPins, setShowImportPins] = useState(false);
  const [importTargetDayId, setImportTargetDayId] = useState<number | null>(
    null
  );
  const [localOrders, setLocalOrders] = useState<Record<number, any[]>>({});
  const [selectedDayId, setSelectedDayId] = useState<number | null>(null);
  const [showSyncPreview, setShowSyncPreview] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    created: number;
    updated: number;
    skipped: number;
    invalid: number;
  } | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [selectedPinId, setSelectedPinId] = useState<string>("manual");
  const insights = useMemo(
    () => (days ? getItineraryInsights(days) : null),
    [days]
  );
  const sortedDays = useMemo(
    () => [...(days ?? [])].sort((a, b) => a.dayNumber - b.dayNumber),
    [days]
  );
  const activeDayId = selectedDayId ?? sortedDays[0]?.id;
  const targetDay = sortedDays.find(day => day.id === addingDayId);
  const formatDayDate = (
    value: string | Date | null | undefined,
    long = false
  ) =>
    formatDateOnlyInHongKong(
      itineraryDateOnly(value),
      lang === "zh" ? "zh" : "en",
      {
        month: "short",
        day: "numeric",
        ...(long ? { weekday: "long" as const } : {}),
      }
    );

  const addActivity = trpc.itinerary.addActivity.useMutation({
    onSuccess: async () => {
      setLocalOrders({});
      setAddingDayId(null);
      setForm(defaultForm);
      toast.success(t("activityAdded"));
      await utils.invalidate();
    },
    onError: error => toast.error(`${t("addFailed")}: ${error.message}`),
  });
  const updateActivity = trpc.itinerary.updateActivity.useMutation({
    onSuccess: async () => {
      setLocalOrders({});
      setEditingActivity(null);
      toast.success(t("activityUpdated"));
      await utils.invalidate();
    },
    onError: error => toast.error(`${t("updateFailed")}: ${error.message}`),
  });
  const deleteActivity = trpc.itinerary.deleteActivity.useMutation({
    onSuccess: async () => {
      setLocalOrders({});
      toast.success(t("activityDeleted"));
      await utils.invalidate();
    },
    onError: error =>
      toast.error(
        `${lang === "zh" ? "刪除失敗" : "Delete failed"}: ${error.message}`
      ),
  });
  const addDay = trpc.itinerary.addDay.useMutation({
    onSuccess: async () => {
      toast.success(lang === "zh" ? "已新增一天" : "Day added");
      await utils.invalidate();
    },
    onError: error => toast.error(`${t("addFailed")}: ${error.message}`),
  });
  const moveActivity = trpc.itinerary.moveActivity.useMutation({
    onSuccess: async () => {
      setLocalOrders({});
      setMovingActivity(null);
      toast.success(t("activityMoved"));
      await utils.invalidate();
    },
    onError: error => toast.error(`${t("updateFailed")}: ${error.message}`),
  });
  const reorderActivities = trpc.itinerary.reorderActivities.useMutation({
    onSuccess: async () => {
      await utils.invalidate();
      setLocalOrders({});
    },
    onError: () => {
      setLocalOrders({});
      refetch();
      toast.error(
        lang === "zh" ? "排序儲存失敗，已還原" : "Reorder failed, reverted"
      );
    },
  });
  const suggestActivities = trpc.ai.suggestActivities.useMutation({
    onSuccess: data => setAiSuggestions(data.activities ?? []),
    onError: () => toast.error(t("aiSuggestFailed")),
  });
  const syncLogistics = trpc.connected.syncLogisticsToItinerary.useMutation({
    onMutate: () => {
      setSyncError(null);
      setSyncResult(null);
    },
    onSuccess: async result => {
      setSyncResult(result);
      setLocalOrders({});
      toast.success(
        lang === "zh"
          ? `已補上 ${result.created} 個物流項目`
          : `${result.created} missing logistics entries added`
      );
      await utils.invalidate();
    },
    onError: error => {
      setSyncError(error.message);
      toast.error(
        `${lang === "zh" ? "物流同步失敗" : "Logistics sync failed"}: ${error.message}`
      );
    },
  });
  const activityMutationPending =
    addActivity.isPending ||
    updateActivity.isPending ||
    deleteActivity.isPending ||
    moveActivity.isPending ||
    reorderActivities.isPending ||
    syncLogistics.isPending;

  const openAddActivity = (dayId: number) => {
    if (!canEdit || activityMutationPending) return;
    setSelectedDayId(dayId);
    setAddingDayId(dayId);
    setSelectedPinId("manual");
    setForm({ ...defaultForm, currency: trip?.baseCurrency || "HKD" });
  };
  const selectDay = (dayId: number) => {
    setSelectedDayId(dayId);
    document
      .getElementById(`itinerary-day-${dayId}`)
      ?.scrollIntoView({ behavior: "auto", block: "start" });
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const getActivitiesForDay = useCallback(
    (day: any): any[] => {
      if (localOrders[day.id]) return localOrders[day.id];
      return [...(day.activities ?? [])].sort(
        (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
      );
    },
    [localOrders]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent, dayId: number, currentActivities: any[]) => {
      const { active, over } = event;
      if (!canEdit || activityMutationPending || !over || active.id === over.id)
        return;
      const oldIndex = currentActivities.findIndex(a => a.id === active.id);
      const newIndex = currentActivities.findIndex(a => a.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = arrayMove(currentActivities, oldIndex, newIndex);
      setLocalOrders(prev => ({ ...prev, [dayId]: reordered }));
      reorderActivities.mutate({
        tripId,
        orderedIds: reordered.map(a => a.id),
      });
    },
    [tripId, reorderActivities, canEdit, activityMutationPending]
  );

  const handleAdd = () => {
    if (!canEdit || activityMutationPending) return;
    if (!addingDayId || !form.title.trim()) {
      toast.error(
        lang === "zh" ? "請填寫活動名稱" : "Please enter activity name"
      );
      return;
    }
    if (form.cost.trim() && parsePlannedCost(form.cost) == null) {
      toast.error(
        lang === "zh"
          ? "請輸入有效的非負預算金額（最多兩位小數）"
          : "Enter a valid non-negative estimated amount (up to two decimals)"
      );
      return;
    }
    addActivity.mutate({
      dayId: addingDayId,
      tripId,
      title: form.title.trim(),
      location: form.location || undefined,
      startTime: form.startTime || undefined,
      endTime: form.endTime || undefined,
      cost: form.cost || undefined,
      currency: form.currency || undefined,
      notes: form.notes || undefined,
      category: (form.category === "accommodation"
        ? "hotel"
        : form.category) as any,
      sortOrder:
        Math.max(
          -1,
          ...(targetDay?.activities ?? []).map(
            activity => activity.sortOrder ?? 0
          )
        ) + 1,
    });
  };

  const handleUpdate = () => {
    if (
      !canEdit ||
      activityMutationPending ||
      !editingActivity ||
      !form.title.trim()
    )
      return;
    if (
      form.cost !== (editingActivity.cost ?? "") &&
      form.cost.trim() &&
      parsePlannedCost(form.cost) == null
    ) {
      toast.error(
        lang === "zh"
          ? "請輸入有效的非負預算金額（最多兩位小數）"
          : "Enter a valid non-negative estimated amount (up to two decimals)"
      );
      return;
    }
    updateActivity.mutate({
      activityId: editingActivity.id,
      tripId,
      title: form.title.trim(),
      location: form.location,
      startTime: form.startTime,
      endTime: form.endTime,
      cost: form.cost,
      currency: form.currency,
      notes: form.notes,
      category: (form.category === "accommodation"
        ? "hotel"
        : form.category) as any,
    });
  };

  const handleAISuggest = (day: any) => {
    if (!canEdit || suggestActivities.isPending || activityMutationPending)
      return;
    setAiDayId(day.id);
    setAiSuggestions([]);
    suggestActivities.mutate({
      destination: trip?.destination ?? "",
      date: itineraryDateOnly(day.date),
      dayNumber: day.dayNumber,
      tripId: tripId,
      existingActivities: day.activities?.map((a: any) => a.title) ?? [],
    });
  };

  const handleApplySuggestion = (suggestion: any, dayId: number) => {
    if (!canEdit || activityMutationPending) return;
    addActivity.mutate({
      dayId,
      tripId,
      title: suggestion.title,
      location: suggestion.location ?? "",
      startTime: suggestion.startTime ?? "",
      endTime: suggestion.endTime ?? "",
      notes: suggestion.notes ?? "",
      category: (suggestion.category === "accommodation"
        ? "hotel"
        : (suggestion.category ?? "other")) as any,
      sortOrder: 99,
    });
  };

  const handleAddDay = () => {
    if (!canEdit || addDay.isPending || activityMutationPending || !days)
      return;
    const next = getNextItineraryDay(days, trip?.startDate);
    addDay.mutate({
      tripId,
      date: next.date,
      dayNumber: next.dayNumber,
      title:
        lang === "zh" ? `第 ${next.dayNumber} 天` : `Day ${next.dayNumber}`,
    });
  };

  const handleImportPin = (pin: any, dayId: number) => {
    if (!canEdit || activityMutationPending) return;
    const fields = getActivityFieldsFromPin(pin);
    addActivity.mutate({
      dayId,
      tripId,
      ...fields,
      startTime: "",
      endTime: "",
      category: fields.category as any,
      sortOrder: 99,
    });
  };

  const exportToPDF = () => {
    if (!days || days.length === 0) {
      toast.error(
        lang === "zh" ? "沒有行程可以匯出" : "No itinerary to export"
      );
      return;
    }
    const tripName = escapeItineraryHtml(
      trip?.name ?? (lang === "zh" ? "行程" : "Trip")
    );
    const tripDest = escapeItineraryHtml(trip?.destination ?? "");
    const tripDates =
      trip?.startDate && trip?.endDate
        ? `${itineraryDateOnly(trip.startDate)} – ${itineraryDateOnly(trip.endDate)}`
        : "";
    const catColors: Record<string, string> = {
      transport: "#3b82f6",
      accommodation: "#8b5cf6",
      hotel: "#8b5cf6",
      food: "#f97316",
      attraction: "#22c55e",
      shopping: "#ec4899",
      other: "#94a3b8",
    };
    const daysHtml = days
      .map(day => {
        const acts = getActivitiesForDay(day);
        const dayTitle = escapeItineraryHtml(
          day.title ??
            (lang === "zh" ? `第 ${day.dayNumber} 天` : `Day ${day.dayNumber}`)
        );
        const dateStr = formatDateOnlyInHongKong(
          itineraryDateOnly(day.date),
          lang === "zh" ? "zh" : "en",
          { year: "numeric", month: "long", day: "numeric", weekday: "long" }
        );
        const noActLabel =
          lang === "zh" ? "未安排活動" : "No activities scheduled";
        const actsHtml =
          acts.length === 0
            ? `<p style="color:#9ca3af;font-size:13px;margin:8px 0">${noActLabel}</p>`
            : acts
                .map((a: any) => {
                  const color = catColors[a.category] ?? "#94a3b8";
                  const label = getCategoryStyle(a.category, t).label;
                  return `<div style="display:flex;gap:12px;margin-bottom:12px;align-items:flex-start">
              <div style="width:8px;height:8px;border-radius:50%;background:${color};margin-top:5px;flex-shrink:0"></div>
              <div style="flex:1">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                  <span style="font-weight:600;font-size:14px">${escapeItineraryHtml(a.title)}</span>
                  <span style="background:${color}22;color:${color};font-size:11px;padding:1px 6px;border-radius:4px">${label}</span>
                  ${a.startTime ? `<span style="color:#6b7280;font-size:12px">${escapeItineraryHtml(a.startTime)}${a.endTime ? ` – ${escapeItineraryHtml(a.endTime)}` : ""}</span>` : ""}
                  ${parsePlannedCost(a.cost) != null ? `<span style="color:#374151;font-size:12px;font-family:monospace">${lang === "zh" ? "預算" : "Estimated"} · ${escapeItineraryHtml(a.currency || (lang === "zh" ? "未指定貨幣" : "Unspecified currency"))} ${parsePlannedCost(a.cost)!.toLocaleString(lang === "zh" ? "zh-HK" : "en-HK", { maximumFractionDigits: 2 })}</span>` : ""}
                </div>
                ${a.location ? `<div style="color:#6b7280;font-size:12px;margin-top:2px">${escapeItineraryHtml(a.location)}</div>` : ""}
                ${a.notes ? `<div style="color:#9ca3af;font-size:12px;margin-top:2px">${escapeItineraryHtml(a.notes)}</div>` : ""}
              </div></div>`;
                })
                .join("");
        return `<div style="margin-bottom:28px;page-break-inside:avoid">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #e5e7eb">
          <div style="width:28px;height:28px;border-radius:50%;background:#1e40af;color:white;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0">${day.dayNumber}</div>
          <div><div style="font-weight:700;font-size:15px">${dayTitle}</div>${dateStr ? `<div style="color:#6b7280;font-size:12px">${dateStr}</div>` : ""}</div>
        </div>${actsHtml}</div>`;
      })
      .join("");
    const printLabel =
      lang === "zh" ? "列印 / 儲存為 PDF" : "Print / Save as PDF";
    const generatedAt = new Intl.DateTimeFormat(
      lang === "zh" ? "zh-HK" : "en-HK",
      { timeZone: "Asia/Hong_Kong", dateStyle: "medium", timeStyle: "short" }
    ).format(new Date());
    const generatedLabel =
      lang === "zh"
        ? `產生時間：${generatedAt} · 香港時間 UTC+8`
        : `Generated: ${generatedAt} · Hong Kong time UTC+8`;
    const html = `<!DOCTYPE html><html lang="${lang === "zh" ? "zh-HK" : "en-HK"}"><head><meta charset="UTF-8"><title>${tripName}</title>
      <style>*{box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;padding:32px;color:#111827;max-width:800px;margin:0 auto}@media print{body{padding:16px}.no-print{display:none!important}}</style></head><body>
      <div style="text-align:center;margin-bottom:32px;padding-bottom:24px;border-bottom:3px solid #1e40af">
        <h1 style="font-size:28px;font-weight:800;color:#1e40af;margin:0 0 8px">${tripName}</h1>
        ${tripDest ? `<p style="color:#6b7280;font-size:15px;margin:0 0 4px">${tripDest}</p>` : ""}
        ${tripDates ? `<p style="color:#6b7280;font-size:14px;margin:0">${tripDates}</p>` : ""}
        <p style="color:#9ca3af;font-size:12px;margin:8px 0 0">${generatedLabel}</p>
      </div>
      ${daysHtml}
      <div class="no-print" style="text-align:center;margin-top:32px">
        <button onclick="window.print()" style="background:#1e40af;color:white;border:none;padding:10px 24px;border-radius:8px;font-size:14px;cursor:pointer">${printLabel}</button>
      </div></body></html>`;
    const win = window.open("", "_blank");
    if (win) {
      win.document.write(html);
      win.document.close();
      setTimeout(() => win.print(), 500);
    } else
      toast.error(
        lang === "zh"
          ? "請允許彈出視窗以匯出 PDF"
          : "Please allow popups to export PDF"
      );
  };

  if (isLoading)
    return (
      <div
        className="px-4 sm:px-6 py-6 max-w-4xl mx-auto space-y-4"
        role="status"
        aria-label={lang === "zh" ? "正在載入行程" : "Loading itinerary"}
      >
        <div className="h-44 rounded-[28px] bg-muted animate-pulse" />
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map(key => (
            <div
              key={key}
              className="h-24 rounded-2xl bg-muted animate-pulse"
            />
          ))}
        </div>
        <div className="h-72 rounded-2xl bg-muted animate-pulse" />
      </div>
    );

  return (
    <div className="px-4 sm:px-6 py-6 max-w-4xl mx-auto space-y-5">
      {/* Viewer banner */}
      {!tripLoading && !canEdit && (
        <div className="mb-4 flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-sm">
          <svg
            className="w-4 h-4 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
          <span>{t("viewerCannotEdit")}</span>
        </div>
      )}

      {/* Page header */}
      <section className="voyage-hero">
        <p className="text-[10px] uppercase tracking-[0.22em] text-white/70">
          {lang === "zh"
            ? "旅程手帳 · 每日規劃"
            : "Travel journal · Daily planning"}
        </p>
        <h2 className="text-2xl sm:text-3xl font-bold mt-2">
          {lang === "zh"
            ? "把每一天，安排得剛好。"
            : "Make room for a great day."}
        </h2>
        <p className="text-white/80 text-sm mt-2 leading-relaxed break-words">
          {trip?.name || "—"}
          {trip?.destination ? ` · ${trip.destination}` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-white/75 mt-3">
          <span className="inline-flex gap-1.5 items-center">
            <CalendarDays className="w-3.5 h-3.5" />
            {formatDayDate(trip?.startDate) || "—"} –{" "}
            {formatDayDate(trip?.endDate) || "—"}
          </span>
          <span>
            {lang === "zh" ? "香港時間 · UTC+8" : "Hong Kong time · UTC+8"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-5">
          <Button
            variant="outline"
            size="sm"
            onClick={exportToPDF}
            disabled={!days?.length}
            className="gap-1.5 min-h-11 rounded-xl border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
          >
            <FileDown className="w-3.5 h-3.5" />
            {t("exportItinerary")}
          </Button>
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddDay}
              disabled={addDay.isPending || activityMutationPending || !days}
              className="gap-1.5 min-h-11 rounded-xl border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
            >
              {addDay.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CalendarPlus className="w-3.5 h-3.5" />
              )}
              {lang === "zh" ? "新增一天" : "Add Day"}
            </Button>
          )}
        </div>
      </section>

      {daysError && (
        <div
          role="alert"
          className="voyage-panel border-destructive/30 text-sm"
        >
          <p className="font-semibold text-destructive">
            {lang === "zh"
              ? "無法載入行程，未顯示統計"
              : "Unable to load itinerary; insights are unavailable"}
          </p>
          <p className="text-muted-foreground mt-1 break-words">
            {daysError.message}
          </p>
          <Button
            variant="outline"
            className="mt-3 min-h-11"
            onClick={() => refetch()}
          >
            {lang === "zh" ? "重新載入" : "Try again"}
          </Button>
        </div>
      )}

      <section
        aria-label={lang === "zh" ? "行程真實統計" : "Itinerary insights"}
        className="grid grid-cols-3 gap-2 sm:gap-3"
      >
        {[
          {
            label: lang === "zh" ? "已安排天數" : "Scheduled days",
            value: insights?.scheduledDayCount,
            icon: CalendarDays,
            detail: insights
              ? lang === "zh"
                ? `共 ${insights.dayCount} 天`
                : `of ${insights.dayCount} days`
              : "—",
          },
          {
            label: lang === "zh" ? "活動" : "Activities",
            value: insights?.activityCount,
            icon: ListChecks,
            detail: lang === "zh" ? "已儲存項目" : "Saved entries",
          },
          {
            label: lang === "zh" ? "不同地點" : "Locations",
            value: insights?.locationCount,
            icon: MapPin,
            detail: lang === "zh" ? "已填寫地點" : "Named locations",
          },
        ].map(metric => (
          <div key={metric.label} className="voyage-metric !p-3 sm:!p-4">
            <metric.icon className="w-4 h-4 text-primary mb-2" />
            <p className="text-xs text-muted-foreground">{metric.label}</p>
            <p className="text-2xl sm:text-3xl font-bold tabular-nums text-foreground mt-1">
              {metric.value ?? "—"}
            </p>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
              {metric.detail}
            </p>
          </div>
        ))}
      </section>

      <section className="voyage-panel">
        <p className="voyage-eyebrow">
          {lang === "zh" ? "預算，不是帳單" : "Estimates, not expenses"}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2 mt-1">
          <h3 className="voyage-section-title text-base">
            {lang === "zh"
              ? "活動預算 · 按貨幣分開"
              : "Planned costs · By currency"}
          </h3>
          <a
            href={`/trips/${tripId}/expenses`}
            className="inline-flex items-center gap-1.5 min-h-11 text-xs font-semibold text-primary hover:underline"
          >
            {lang === "zh" ? "查看已記錄開支" : "View recorded expenses"}
            <MoveRight className="w-3.5 h-3.5" />
          </a>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          {insights?.plannedCosts.length ? (
            insights.plannedCosts.map(cost => (
              <div
                key={cost.currency}
                className="rounded-xl bg-accent text-accent-foreground px-3 py-2"
              >
                <p className="text-[10px] font-semibold uppercase tracking-wide">
                  {cost.currency === UNSPECIFIED_CURRENCY
                    ? lang === "zh"
                      ? "未指定貨幣"
                      : "Unspecified currency"
                    : cost.currency}
                </p>
                <p className="text-lg font-bold tabular-nums">
                  {cost.amount.toLocaleString(
                    lang === "zh" ? "zh-HK" : "en-HK",
                    { maximumFractionDigits: 2 }
                  )}
                </p>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground py-1">
              {insights
                ? lang === "zh"
                  ? "尚未填寫活動預算"
                  : "No activity estimates entered"
                : "—"}
            </p>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
          {lang === "zh"
            ? "不合計不同貨幣，不套用匯率，亦不代表實際已付金額。"
            : "Currencies are never combined or converted here. These are not amounts actually paid."}
          {insights && insights.unpricedActivityCount > 0
            ? lang === "zh"
              ? ` ${insights.unpricedActivityCount} 個活動尚未填寫有效預算。`
              : ` ${insights.unpricedActivityCount} activities have no valid estimate.`
            : ""}
        </p>
      </section>

      <section className="voyage-panel">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent text-primary flex items-center justify-center shrink-0">
            <RefreshCw className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="voyage-eyebrow">
              {lang === "zh"
                ? "輸入一次，連結旅程"
                : "Enter once, connect your trip"}
            </p>
            <h3 className="voyage-section-title text-base mt-1">
              {lang === "zh"
                ? "航班與住宿 → 每日行程"
                : "Flights & stays → Itinerary"}
            </h3>
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
              {lang === "zh"
                ? "補上航班、酒店入住及退房項目。可重複執行：已連結項目會跳過，不覆寫、不刪除現有資料。"
                : "Add missing flights, hotel check-ins and check-outs. Repeat safely: linked entries are skipped; existing data is never overwritten or deleted."}
            </p>
          </div>
        </div>
        {canEdit && (
          <Button
            className="w-full sm:w-auto gap-2 mt-4 min-h-11 rounded-xl"
            disabled={activityMutationPending || addDay.isPending}
            onClick={() => setShowSyncPreview(true)}
          >
            {syncLogistics.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            {lang === "zh" ? "預覽及同步物流" : "Preview & sync logistics"}
          </Button>
        )}
        {syncResult && (
          <div
            role="status"
            className="mt-3 rounded-xl bg-accent text-accent-foreground p-3 text-xs leading-relaxed"
          >
            {lang === "zh"
              ? `新增 ${syncResult.created} · 更新 ${syncResult.updated} · 已存在／跳過 ${syncResult.skipped} · 資料不完整 ${syncResult.invalid}`
              : `Added ${syncResult.created} · Updated ${syncResult.updated} · Existing/skipped ${syncResult.skipped} · Invalid ${syncResult.invalid}`}
            {syncResult.invalid > 0 && (
              <p className="mt-1">
                {lang === "zh"
                  ? "請到航班與住宿頁補回日期及必需欄位，再重新同步。"
                  : "Complete dates and required fields on Flights & stays, then retry."}
              </p>
            )}
          </div>
        )}
        {syncError && (
          <p role="alert" className="text-xs text-destructive mt-3 break-words">
            {syncError}
          </p>
        )}
      </section>

      {sortedDays.length > 0 && (
        <nav
          aria-label={
            lang === "zh" ? "選擇行程日期" : "Choose an itinerary day"
          }
          className="voyage-panel !p-3"
        >
          <p className="voyage-eyebrow mb-2">
            {lang === "zh" ? "逐日旅程" : "Your days, at a glance"}
          </p>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {sortedDays.map(day => (
              <button
                key={day.id}
                onClick={() => selectDay(day.id)}
                aria-current={activeDayId === day.id ? "date" : undefined}
                className={`shrink-0 min-w-20 min-h-16 rounded-xl px-3 py-2 text-left border transition-colors focus-visible:ring-2 focus-visible:ring-primary ${activeDayId === day.id ? "bg-primary text-primary-foreground border-primary" : "bg-card text-card-foreground border-border hover:bg-accent"}`}
              >
                <span className="block text-xs font-semibold">
                  {lang === "zh"
                    ? `第 ${day.dayNumber} 天`
                    : `Day ${day.dayNumber}`}
                </span>
                <span className="block text-[11px] mt-1 opacity-75">
                  {formatDayDate(day.date) || "—"}
                </span>
                <span className="block text-[10px] mt-0.5 opacity-75">
                  {lang === "zh"
                    ? `${day.activities.length} 個活動`
                    : `${day.activities.length} activities`}
                </span>
              </button>
            ))}
          </div>
          {canEdit && activeDayId && (
            <Button
              variant="outline"
              className="w-full min-h-11 rounded-xl gap-2 mt-2"
              disabled={activityMutationPending}
              onClick={() => openAddActivity(activeDayId)}
            >
              <Plus className="w-4 h-4" />
              {lang === "zh"
                ? "為所選日期新增活動"
                : "Add activity to selected day"}
            </Button>
          )}
        </nav>
      )}

      {/* Empty state */}
      {days && days.length === 0 && (
        <div className="voyage-panel flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <CalendarPlus className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">
            {lang === "zh" ? "還沒有行程天數" : "No days yet"}
          </h3>
          <p className="text-muted-foreground text-sm mb-4 max-w-xs">
            {lang === "zh"
              ? "從旅程開始日期建立第一天，或同步已有的航班及住宿，不必重複輸入。"
              : "Start from your trip date, or sync your existing flights and stays without entering them again."}
          </p>
          {canEdit && (
            <Button
              onClick={handleAddDay}
              disabled={addDay.isPending || activityMutationPending}
              className="gap-2 min-h-11 rounded-xl"
            >
              {addDay.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CalendarPlus className="w-4 h-4" />
              )}
              {lang === "zh" ? "新增第一天" : "Add First Day"}
            </Button>
          )}
        </div>
      )}

      {/* Day list */}
      <div className="space-y-8">
        {sortedDays.map(day => {
          const activities = getActivitiesForDay(day);
          const activityIds = activities.map((a: any) => a.id);

          return (
            <section
              key={day.id}
              id={`itinerary-day-${day.id}`}
              className="scroll-mt-24"
            >
              {/* Cover banner */}
              <DayCoverBanner
                day={day}
                trip={trip}
                activities={activities}
                lang={lang}
                t={t}
                canEdit={canEdit}
                busy={activityMutationPending}
                onAISuggest={handleAISuggest}
                onImportPins={id => {
                  setImportTargetDayId(id);
                  setShowImportPins(true);
                }}
                onAddActivity={openAddActivity}
                hasPins={hasPins}
                suggestPending={suggestActivities.isPending}
              />

              {/* AI Suggestions */}
              {aiDayId === day.id && aiSuggestions.length > 0 && (
                <div className="bg-purple-50 border border-t-0 border-purple-200 px-4 py-3">
                  <p className="text-purple-700 text-xs font-medium mb-2 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    {lang === "zh"
                      ? "AI 推薦活動（點擊新增）"
                      : "AI Suggestions (click to add)"}
                  </p>
                  <div className="space-y-2">
                    {aiSuggestions.map((s, i) => {
                      const cat = getCategoryStyle(s.category, t);
                      return (
                        <button
                          key={i}
                          onClick={() => handleApplySuggestion(s, day.id)}
                          disabled={!canEdit || activityMutationPending}
                          className="w-full text-left p-3 rounded-xl bg-white border border-purple-100 hover:border-purple-300 hover:shadow-sm transition-all disabled:opacity-50"
                        >
                          <div className="flex items-start gap-2">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${cat.color} shrink-0`}
                            >
                              {cat.label}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground">
                                {s.title}
                              </p>
                              {s.location && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {s.location}
                                </p>
                              )}
                              {s.startTime && (
                                <p className="text-xs text-muted-foreground">
                                  {s.startTime}
                                  {s.endTime ? ` – ${s.endTime}` : ""}
                                </p>
                              )}
                            </div>
                            <Plus className="w-4 h-4 text-purple-500 shrink-0 mt-0.5" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Timeline activities */}
              <div className="bg-card text-card-foreground border border-t-0 border-border rounded-b-2xl px-2 sm:px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-1 mb-4 px-2">
                  <h4 className="text-sm font-semibold">
                    {lang === "zh" ? "當日時間軸" : "Daily timeline"}
                  </h4>
                  <span className="text-[10px] text-muted-foreground">
                    {activities.length}{" "}
                    {lang === "zh"
                      ? "個活動 · 香港時間"
                      : "activities · HK time"}
                  </span>
                </div>
                {activities.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p>{t("noActivities")}</p>
                    <p className="text-xs mt-1 px-3 leading-relaxed">
                      {lang === "zh"
                        ? "保留一點彈性，或從地圖標記帶入已儲存地點。"
                        : "Leave room to explore, or reuse a saved location from your map."}
                    </p>
                    {canEdit && (
                      <Button
                        variant="outline"
                        onClick={() => openAddActivity(day.id)}
                        disabled={activityMutationPending}
                        className="text-primary mt-3 text-sm min-h-11 rounded-xl"
                      >
                        +{" "}
                        {lang === "zh"
                          ? "新增第一個活動"
                          : "Add first activity"}
                      </Button>
                    )}
                  </div>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={event =>
                      handleDragEnd(event, day.id, activities)
                    }
                  >
                    <SortableContext
                      items={activityIds}
                      strategy={verticalListSortingStrategy}
                    >
                      <div>
                        {activities.map((activity: any, idx: number) => (
                          <SortableActivityCard
                            key={activity.id}
                            activity={activity}
                            idx={idx}
                            totalCount={activities.length}
                            tripId={tripId}
                            canEdit={canEdit}
                            busy={activityMutationPending}
                            t={t}
                            lang={lang}
                            onEdit={a => {
                              setEditingActivity(a);
                              setForm({
                                title: a.title,
                                location: a.location ?? "",
                                startTime: a.startTime ?? "",
                                endTime: a.endTime ?? "",
                                cost: a.cost ?? "",
                                currency: a.currency ?? "",
                                notes: a.notes ?? "",
                                category: a.category ?? "other",
                              });
                            }}
                            onMove={a => setMovingActivity(a)}
                            onDelete={id => {
                              if (
                                canEdit &&
                                !activityMutationPending &&
                                window.confirm(
                                  lang === "zh"
                                    ? "確定要刪除此活動？這只會刪除你選擇的項目。"
                                    : "Delete this activity? Only the selected entry will be removed."
                                )
                              )
                                deleteActivity.mutate({
                                  activityId: id,
                                  tripId,
                                });
                            }}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {/* Explicit, non-destructive logistics sync preview */}
      <Dialog
        open={showSyncPreview}
        onOpenChange={open => {
          if (!syncLogistics.isPending) setShowSyncPreview(open);
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle>
              {lang === "zh" ? "同步前預覽" : "Preview logistics sync"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {lang === "zh"
              ? "以下來自這個旅程已儲存的航班及住宿；同步只新增未連結的項目，已有項目會跳過。保留原有資料及手動活動，不覆寫、不刪除。"
              : "These are saved flights and stays for this trip. Sync only adds unlinked entries and skips existing ones. Original data and manual activities are retained, without overwriting or deleting."}
          </p>
          <p className="text-xs text-muted-foreground">
            {lang === "zh"
              ? "以香港日期配對行程日；缺少行程日會補建。預覽數量不是新增數量，實際結果以同步回報為準。"
              : "Entries match Hong Kong calendar dates; missing days are created. Preview counts are not insertion counts; see the sync result for actual totals."}
          </p>
          <div className="rounded-xl bg-accent text-accent-foreground p-3 flex flex-wrap gap-3 text-xs">
            <span className="inline-flex items-center gap-1">
              <Plane className="w-3.5 h-3.5" />
              {flightsLoading || flightsError || !flights
                ? "—"
                : flights.length}{" "}
              {lang === "zh" ? "個航班" : "flights"}
            </span>
            <span className="inline-flex items-center gap-1">
              <Home className="w-3.5 h-3.5" />
              {hotelsLoading || hotelsError || !hotels
                ? "—"
                : hotels.length}{" "}
              {lang === "zh"
                ? "間住宿（入住及退房）"
                : "stays (check-in & check-out)"}
            </span>
          </div>
          {(flightsError || hotelsError) && (
            <p role="alert" className="text-xs text-destructive">
              {lang === "zh"
                ? "無法載入物流預覽，請重新載入後再同步。"
                : "Unable to load the logistics preview. Reload before syncing."}
            </p>
          )}
          {flightsLoading || hotelsLoading ? (
            <div
              role="status"
              className="h-24 bg-muted rounded-xl animate-pulse"
            />
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {flights?.map(flight => (
                <div
                  key={`flight-${flight.id}`}
                  className="rounded-xl border border-border p-3 text-xs"
                >
                  <p className="font-semibold flex items-center gap-2">
                    <Plane className="w-3.5 h-3.5 text-primary" />
                    {flight.flightNumber ||
                      flight.airline ||
                      (lang === "zh" ? "航班" : "Flight")}
                  </p>
                  <p className="text-muted-foreground mt-1 break-words">
                    {flight.fromCode || flight.fromCity || "—"} →{" "}
                    {flight.toCode || flight.toCity || "—"} ·{" "}
                    {itineraryDateOnly(flight.date) ||
                      (lang === "zh" ? "缺少有效日期" : "Missing valid date")}
                  </p>
                  <p className="text-muted-foreground mt-0.5">
                    {flight.departTime || "—"} – {flight.arriveTime || "—"}
                  </p>
                </div>
              ))}
              {hotels?.map(hotel => (
                <div
                  key={`hotel-${hotel.id}`}
                  className="rounded-xl border border-border p-3 text-xs"
                >
                  <p className="font-semibold flex items-center gap-2">
                    <Home className="w-3.5 h-3.5 text-primary" />
                    {hotel.name}
                  </p>
                  <p className="text-muted-foreground mt-1">
                    {lang === "zh" ? "入住" : "Check-in"}{" "}
                    {itineraryDateOnly(hotel.checkIn) || "—"} ·{" "}
                    {lang === "zh" ? "退房" : "Check-out"}{" "}
                    {itineraryDateOnly(hotel.checkOut) || "—"}
                  </p>
                </div>
              ))}
              {flights?.length === 0 && hotels?.length === 0 && (
                <p className="text-sm text-muted-foreground py-3">
                  {lang === "zh"
                    ? "沒有已儲存的航班或住宿；可繼續手動新增活動。"
                    : "No saved flights or stays. You can still add activities manually."}
                </p>
              )}
            </div>
          )}
          {syncResult && (
            <p
              role="status"
              className="rounded-xl bg-accent text-accent-foreground p-3 text-xs"
            >
              {lang === "zh"
                ? `新增 ${syncResult.created} · 更新 ${syncResult.updated} · 跳過 ${syncResult.skipped} · 無效 ${syncResult.invalid}`
                : `Added ${syncResult.created} · Updated ${syncResult.updated} · Skipped ${syncResult.skipped} · Invalid ${syncResult.invalid}`}
            </p>
          )}
          {syncError && (
            <p role="alert" className="text-xs text-destructive break-words">
              {syncError}
            </p>
          )}
          <Button
            className="min-h-11 rounded-xl gap-2 w-full"
            disabled={
              !canEdit ||
              activityMutationPending ||
              addDay.isPending ||
              flightsLoading ||
              hotelsLoading ||
              !!flightsError ||
              !!hotelsError ||
              !flights ||
              !hotels ||
              flights.length + hotels.length === 0
            }
            onClick={() => {
              if (!activityMutationPending && canEdit)
                syncLogistics.mutate({ tripId });
            }}
          >
            {syncLogistics.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            {lang === "zh"
              ? "確認：只補上缺少的項目"
              : "Confirm: add missing entries only"}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Add Activity Dialog */}
      <Dialog
        open={!!addingDayId}
        onOpenChange={o => !o && setAddingDayId(null)}
      >
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("addActivity")}</DialogTitle>
          </DialogHeader>
          <div className="rounded-xl bg-accent text-accent-foreground px-3 py-2 text-xs">
            {lang === "zh"
              ? `加入第 ${targetDay?.dayNumber ?? "—"} 天`
              : `Adding to Day ${targetDay?.dayNumber ?? "—"}`}{" "}
            · {targetDay ? formatDayDate(targetDay.date, true) || "—" : "—"} ·
            UTC+8
          </div>
          {hasPins && (
            <div>
              <Label>
                {lang === "zh"
                  ? "帶入已儲存地點（可選）"
                  : "Reuse a saved map location (optional)"}
              </Label>
              <Select
                value={selectedPinId}
                onValueChange={value => {
                  setSelectedPinId(value);
                  const pin = pins?.find(item => String(item.id) === value);
                  if (pin)
                    setForm({ ...form, ...getActivityFieldsFromPin(pin) });
                }}
              >
                <SelectTrigger className="mt-1.5 min-h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">
                    {lang === "zh" ? "手動輸入" : "Enter manually"}
                  </SelectItem>
                  {pins?.map(pin => (
                    <SelectItem key={pin.id} value={String(pin.id)}>
                      {pin.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1.5">
                {lang === "zh"
                  ? "選擇後帶入名稱、地址、類別及備註，可再編輯；日期毋須重新輸入。"
                  : "Reuse title, address, category and notes, then edit freely. The selected date is already set."}
              </p>
            </div>
          )}
          <ActivityForm
            form={form}
            setForm={setForm}
            onSubmit={handleAdd}
            loading={activityMutationPending}
            submitLabel={t("addActivity")}
            t={t}
            lang={lang}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Activity Dialog */}
      <Dialog
        open={!!editingActivity}
        onOpenChange={o => !o && setEditingActivity(null)}
      >
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("editActivity")}</DialogTitle>
          </DialogHeader>
          <ActivityForm
            form={form}
            setForm={setForm}
            onSubmit={handleUpdate}
            loading={activityMutationPending}
            submitLabel={t("saveChanges")}
            t={t}
            lang={lang}
          />
        </DialogContent>
      </Dialog>

      {/* Move to Another Day Dialog */}
      <Dialog
        open={!!movingActivity}
        onOpenChange={o => !o && setMovingActivity(null)}
      >
        <DialogContent className="sm:max-w-sm max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MoveRight className="w-4 h-4 text-blue-500" />
              {t("moveToDay")}
            </DialogTitle>
          </DialogHeader>
          {movingActivity && (
            <div className="mt-2">
              <p className="text-sm text-muted-foreground mb-3">
                {lang === "zh" ? (
                  <>
                    選擇要將「
                    <span className="font-medium text-foreground">
                      {movingActivity.title}
                    </span>
                    」移至哪一天：
                  </>
                ) : (
                  <>
                    Select a day to move{" "}
                    <span className="font-medium text-foreground">
                      "{movingActivity.title}"
                    </span>{" "}
                    to:
                  </>
                )}
              </p>
              <div className="space-y-2">
                {days
                  ?.filter(d => d.id !== movingActivity.dayId)
                  .map(d => (
                    <button
                      key={d.id}
                      onClick={() => {
                        if (canEdit && !activityMutationPending)
                          moveActivity.mutate({
                            tripId,
                            activityId: movingActivity.id,
                            targetDayId: d.id,
                          });
                      }}
                      disabled={activityMutationPending || !canEdit}
                      className="w-full text-left p-3 rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-all flex items-center gap-3"
                    >
                      <div className="w-8 h-8 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                        {d.dayNumber}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {d.title ??
                            (lang === "zh"
                              ? `第 ${d.dayNumber} 天`
                              : `Day ${d.dayNumber}`)}
                        </p>
                        {d.date && (
                          <p className="text-xs text-muted-foreground">
                            {formatDayDate(d.date, true)}
                          </p>
                        )}
                      </div>
                      {moveActivity.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      ) : (
                        <MoveRight className="w-4 h-4 text-primary" />
                      )}
                    </button>
                  ))}
                {days?.filter(d => d.id !== movingActivity.dayId).length ===
                  0 && (
                  <p className="text-center text-muted-foreground text-sm py-4">
                    {lang === "zh"
                      ? "只有一天行程，無法移動"
                      : "Only one day, cannot move"}
                  </p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Import from Map Pins Dialog */}
      <Dialog
        open={showImportPins}
        onOpenChange={o => {
          if (!o) {
            setShowImportPins(false);
            setImportTargetDayId(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-blue-600" />
              {lang === "zh" ? "從地圖標記匯入景點" : "Import from Map Pins"}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-2">
            {!pins || pins.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <MapPin className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p>{lang === "zh" ? "地圖上還沒有標記" : "No map pins yet"}</p>
                <p className="text-xs mt-1">
                  {lang === "zh"
                    ? "先在地圖頁面新增地點標記"
                    : "Add pins on the Map page first"}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground mb-3">
                  {lang === "zh"
                    ? "點擊地點即可加入當天行程"
                    : "Click a pin to add it to this day"}
                </p>
                {pins.map(pin => {
                  const cat = getCategoryStyle(
                    PIN_CATEGORY_MAP[pin.category ?? "other"] ?? "other",
                    t
                  );
                  const Icon = cat.icon;
                  return (
                    <button
                      key={pin.id}
                      onClick={() => {
                        if (importTargetDayId)
                          handleImportPin(pin, importTargetDayId);
                      }}
                      disabled={activityMutationPending || !canEdit}
                      className="w-full text-left p-3 rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-all flex items-start gap-3"
                    >
                      <div
                        className={`w-8 h-8 rounded-full ${cat.color} flex items-center justify-center shrink-0`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {pin.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {cat.label}
                        </p>
                        {pin.address && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {pin.address}
                          </p>
                        )}
                      </div>
                      <Plus className="w-4 h-4 text-primary shrink-0 mt-1" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
