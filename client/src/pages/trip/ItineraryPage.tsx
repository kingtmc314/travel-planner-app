import { trpc } from "@/lib/trpc";
import { useI18n } from "@/hooks/useI18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus, MapPin, Clock, Trash2, Edit2, Sparkles, Loader2,
  Car, Home, Utensils, Camera, ShoppingBag, MoreHorizontal, CalendarPlus, GripVertical, MoveRight, FileDown
} from "lucide-react";
import { useState, useCallback } from "react";
import { toast } from "sonner";
import { format, addDays } from "date-fns";
import { zhTW, enUS } from "date-fns/locale";
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

const CATEGORY_DEFS = [
  { value: "transport", icon: Car, color: "bg-blue-100 text-blue-600" },
  { value: "accommodation", icon: Home, color: "bg-purple-100 text-purple-600" },
  { value: "hotel", icon: Home, color: "bg-purple-100 text-purple-600" },
  { value: "food", icon: Utensils, color: "bg-orange-100 text-orange-600" },
  { value: "attraction", icon: Camera, color: "bg-green-100 text-green-600" },
  { value: "shopping", icon: ShoppingBag, color: "bg-pink-100 text-pink-600" },
  { value: "other", icon: MoreHorizontal, color: "bg-muted text-muted-foreground" },
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

interface ActivityFormData {
  title: string;
  location: string;
  startTime: string;
  endTime: string;
  notes: string;
  category: string;
}

const defaultForm: ActivityFormData = {
  title: "", location: "", startTime: "", endTime: "", notes: "", category: "attraction",
};

const PIN_CATEGORY_MAP: Record<string, string> = {
  attraction: "attraction",
  hotel: "hotel",
  restaurant: "food",
  transport: "transport",
  other: "other",
};

// ─── Sortable Activity Card ───────────────────────────────────────────────────
function SortableActivityCard({
  activity,
  idx,
  totalCount,
  tripId,
  onEdit,
  onDelete,
  onMove,
  canEdit,
  t,
}: {
  activity: any;
  idx: number;
  totalCount: number;
  tripId: number;
  onEdit: (activity: any) => void;
  onDelete: (activityId: number) => void;
  onMove: (activity: any) => void;
  canEdit: boolean;
  t: (k: any) => string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: activity.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  const cat = getCategoryStyle(activity.category, t);
  const Icon = cat.icon;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative flex gap-3 group"
    >
      {idx < totalCount - 1 && (
        <div className="absolute left-4 top-9 bottom-0 w-0.5 bg-border" />
      )}
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="absolute -left-5 top-2 p-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing touch-none"
        aria-label={t("dragToReorder")}
        tabIndex={-1}
      >
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
      </button>
      <div className={`w-8 h-8 rounded-full ${cat.color} flex items-center justify-center shrink-0 z-10`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0 pb-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-foreground text-sm">{activity.title}</p>
            {activity.location && (
              <div className="flex items-center gap-1 text-muted-foreground text-xs mt-0.5">
                <MapPin className="w-3 h-3 shrink-0" />
                <span className="truncate">{activity.location}</span>
              </div>
            )}
            {(activity.startTime || activity.endTime) && (
              <div className="flex items-center gap-1 text-muted-foreground text-xs mt-0.5">
                <Clock className="w-3 h-3 shrink-0" />
                <span>{activity.startTime}{activity.endTime ? ` – ${activity.endTime}` : ""}</span>
              </div>
            )}
            {activity.notes && (
              <p className="text-muted-foreground text-xs mt-1 leading-relaxed">{activity.notes}</p>
            )}
          </div>
          {canEdit && (
            <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0">
              <button
                onClick={() => onEdit(activity)}
                className="p-1.5 rounded-lg hover:bg-accent transition-colors"
                title={t("edit")}
              >
                <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
              <button
                onClick={() => onMove(activity)}
                className="p-1.5 rounded-lg hover:bg-blue-50 transition-colors"
                title={t("moveToDay")}
              >
                <MoveRight className="w-3.5 h-3.5 text-blue-500" />
              </button>
              <button
                onClick={() => onDelete(activity.id)}
                className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors"
                title={t("delete")}
              >
                <Trash2 className="w-3.5 h-3.5 text-destructive" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ItineraryPage({ tripId }: { tripId: number }) {
  const { t, lang } = useI18n();
  const utils = trpc.useUtils();
  const { data: days, refetch, isLoading } = trpc.itinerary.getDays.useQuery({ tripId }, { refetchInterval: 15000 });
  const { data: trip } = trpc.trips.get.useQuery({ tripId });
  const canEdit = trip?.userRole === "owner" || trip?.userRole === "editor";
  const { data: pins } = trpc.map.getPins.useQuery({ tripId });

  const [addingDayId, setAddingDayId] = useState<number | null>(null);
  const [editingActivity, setEditingActivity] = useState<any | null>(null);
  const [movingActivity, setMovingActivity] = useState<any | null>(null);

  const exportToPDF = () => {
    if (!days || days.length === 0) { toast.error(lang === "zh" ? "沒有行程可以匯出" : "No itinerary to export"); return; }
    const tripName = trip?.name ?? (lang === "zh" ? "行程" : "Trip");
    const tripDest = trip?.destination ?? "";
    const tripDates = trip?.startDate && trip?.endDate
      ? `${getDateStr(trip.startDate)} – ${getDateStr(trip.endDate)}`
      : "";

    const catColors: Record<string, string> = {
      transport: "#3b82f6", accommodation: "#8b5cf6", hotel: "#8b5cf6",
      food: "#f97316", attraction: "#22c55e", shopping: "#ec4899", other: "#94a3b8",
    };

    const daysHtml = days.map(day => {
      const acts = getActivitiesForDay(day);
      const noActLabel = lang === "zh" ? "未安排活動" : "No activities scheduled";
      const actsHtml = acts.length === 0
        ? `<p style="color:#9ca3af;font-size:13px;margin:8px 0">${noActLabel}</p>`
        : acts.map(a => {
            const color = catColors[a.category] ?? "#94a3b8";
            const label = getCategoryStyle(a.category, t).label;
            return `
              <div style="display:flex;gap:12px;margin-bottom:12px;align-items:flex-start">
                <div style="width:8px;height:8px;border-radius:50%;background:${color};margin-top:5px;flex-shrink:0"></div>
                <div style="flex:1">
                  <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                    <span style="font-weight:600;font-size:14px">${a.title}</span>
                    <span style="background:${color}22;color:${color};font-size:11px;padding:1px 6px;border-radius:4px">${label}</span>
                    ${a.startTime ? `<span style="color:#6b7280;font-size:12px">${a.startTime}${a.endTime ? ` – ${a.endTime}` : ""}</span>` : ""}
                  </div>
                  ${a.location ? `<div style="color:#6b7280;font-size:12px;margin-top:2px">📍 ${a.location}</div>` : ""}
                  ${a.notes ? `<div style="color:#9ca3af;font-size:12px;margin-top:2px">${a.notes}</div>` : ""}
                </div>
              </div>`;
          }).join("");

      const dateStr = day.date
        ? new Date(day.date).toLocaleDateString(lang === "zh" ? "zh-TW" : "en-US", { year: "numeric", month: "long", day: "numeric", weekday: "long" })
        : "";
      const dayTitle = day.title ?? (lang === "zh" ? `第 ${day.dayNumber} 天` : `Day ${day.dayNumber}`);

      return `
        <div style="margin-bottom:28px;page-break-inside:avoid">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #e5e7eb">
            <div style="width:28px;height:28px;border-radius:50%;background:#1e40af;color:white;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0">${day.dayNumber}</div>
            <div>
              <div style="font-weight:700;font-size:15px">${dayTitle}</div>
              ${dateStr ? `<div style="color:#6b7280;font-size:12px">${dateStr}</div>` : ""}
            </div>
          </div>
          ${actsHtml}
        </div>`;
    }).join("");

    const printLabel = lang === "zh" ? "🖨️ 列印 / 儲存為 PDF" : "🖨️ Print / Save as PDF";
    const generatedLabel = lang === "zh" ? `產生時間：${new Date().toLocaleString("zh-TW")}` : `Generated: ${new Date().toLocaleString("en-US")}`;

    const html = `
      <!DOCTYPE html>
      <html lang="${lang === "zh" ? "zh-TW" : "en"}">
      <head>
        <meta charset="UTF-8">
        <title>${tripName}</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; padding: 32px; color: #111827; max-width: 800px; margin: 0 auto; }
          @media print {
            body { padding: 16px; }
            .no-print { display: none !important; }
          }
        </style>
      </head>
      <body>
        <div style="text-align:center;margin-bottom:32px;padding-bottom:24px;border-bottom:3px solid #1e40af">
          <h1 style="font-size:28px;font-weight:800;color:#1e40af;margin:0 0 8px">${tripName}</h1>
          ${tripDest ? `<p style="color:#6b7280;font-size:15px;margin:0 0 4px">📍 ${tripDest}</p>` : ""}
          ${tripDates ? `<p style="color:#6b7280;font-size:14px;margin:0">📅 ${tripDates}</p>` : ""}
          <p style="color:#9ca3af;font-size:12px;margin:8px 0 0">${generatedLabel}</p>
        </div>
        ${daysHtml}
        <div class="no-print" style="text-align:center;margin-top:32px">
          <button onclick="window.print()" style="background:#1e40af;color:white;border:none;padding:10px 24px;border-radius:8px;font-size:14px;cursor:pointer">${printLabel}</button>
        </div>
      </body>
      </html>`;

    const win = window.open("", "_blank");
    if (win) {
      win.document.write(html);
      win.document.close();
      setTimeout(() => win.print(), 500);
    } else {
      toast.error(lang === "zh" ? "請允許彈出視窗以匯出 PDF" : "Please allow popups to export PDF");
    }
  };

  function getDateStr(d: Date | string | null | undefined) {
    if (!d) return "";
    if (d instanceof Date) return d.toISOString().split("T")[0];
    return String(d).split("T")[0];
  }
  const [form, setForm] = useState<ActivityFormData>(defaultForm);
  const [aiDayId, setAiDayId] = useState<number | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<any[]>([]);
  const [showImportPins, setShowImportPins] = useState(false);
  const [importTargetDayId, setImportTargetDayId] = useState<number | null>(null);

  // Local optimistic order state per day: dayId → activity[]
  const [localOrders, setLocalOrders] = useState<Record<number, any[]>>({});

  const addActivity = trpc.itinerary.addActivity.useMutation({
    onSuccess: () => { refetch(); setAddingDayId(null); setForm(defaultForm); toast.success(t("activityAdded")); },
    onError: () => toast.error(t("addFailed")),
  });
  const updateActivity = trpc.itinerary.updateActivity.useMutation({
    onSuccess: () => { refetch(); setEditingActivity(null); toast.success(t("activityUpdated")); },
    onError: () => toast.error(t("updateFailed")),
  });
  const deleteActivity = trpc.itinerary.deleteActivity.useMutation({
    onSuccess: () => { refetch(); toast.success(t("activityDeleted")); },
  });
  const addDay = trpc.itinerary.addDay.useMutation({
    onSuccess: () => { refetch(); toast.success(lang === "zh" ? "已新增一天" : "Day added"); },
    onError: () => toast.error(t("addFailed")),
  });
  const moveActivity = trpc.itinerary.moveActivity.useMutation({
    onSuccess: () => {
      refetch();
      setMovingActivity(null);
      toast.success(t("activityMoved"));
    },
    onError: () => toast.error(t("updateFailed")),
  });

  const reorderActivities = trpc.itinerary.reorderActivities.useMutation({
    onError: () => { refetch(); toast.error(lang === "zh" ? "排序儲存失敗，已還原" : "Reorder failed, reverted"); },
  });
  const suggestActivities = trpc.ai.suggestActivities.useMutation({
    onSuccess: (data) => setAiSuggestions(data.activities ?? []),
    onError: () => toast.error(t("aiSuggestFailed")),
  });

  // dnd-kit sensors: pointer (desktop) + touch (mobile) + keyboard (a11y)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const getActivitiesForDay = useCallback((day: any): any[] => {
    if (localOrders[day.id]) return localOrders[day.id];
    return [...(day.activities ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }, [localOrders]);

  const handleDragEnd = useCallback((event: DragEndEvent, dayId: number, currentActivities: any[]) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = currentActivities.findIndex(a => a.id === active.id);
    const newIndex = currentActivities.findIndex(a => a.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(currentActivities, oldIndex, newIndex);
    setLocalOrders(prev => ({ ...prev, [dayId]: reordered }));
    reorderActivities.mutate({
      tripId,
      orderedIds: reordered.map(a => a.id),
    });
  }, [tripId, reorderActivities]);

  const handleAdd = () => {
    if (!addingDayId || !form.title) { toast.error(lang === "zh" ? "請填寫活動名稱" : "Please enter activity name"); return; }
    addActivity.mutate({
      dayId: addingDayId, tripId, ...form,
      category: (form.category === "accommodation" ? "hotel" : form.category) as "transport" | "food" | "attraction" | "hotel" | "shopping" | "other",
      sortOrder: 0,
    });
  };

  const handleUpdate = () => {
    if (!editingActivity || !form.title) return;
    updateActivity.mutate({
      activityId: editingActivity.id, tripId, ...form,
      category: (form.category === "accommodation" ? "hotel" : form.category) as "transport" | "food" | "attraction" | "hotel" | "shopping" | "other",
    });
  };

  const handleAISuggest = (day: any) => {
    setAiDayId(day.id);
    setAiSuggestions([]);
    suggestActivities.mutate({
      destination: trip?.destination ?? "",
      date: day.date,
      dayNumber: day.dayNumber,
      existingActivities: day.activities?.map((a: any) => a.title) ?? [],
    });
  };

  const handleApplySuggestion = (suggestion: any, dayId: number) => {
    addActivity.mutate({
      dayId, tripId,
      title: suggestion.title,
      location: suggestion.location ?? "",
      startTime: suggestion.startTime ?? "",
      endTime: suggestion.endTime ?? "",
      notes: suggestion.notes ?? "",
      category: (suggestion.category === "accommodation" ? "hotel" : (suggestion.category ?? "other")) as "transport" | "food" | "attraction" | "hotel" | "shopping" | "other",
      sortOrder: 99,
    });
    toast.success(lang === "zh" ? `已新增：${suggestion.title}` : `Added: ${suggestion.title}`);
  };

  const handleAddDay = () => {
    const currentDayCount = days?.length ?? 0;
    const nextDayNumber = currentDayCount + 1;
    const baseDate = trip?.startDate ? new Date(trip.startDate) : new Date();
    const newDate = addDays(baseDate, currentDayCount);
    addDay.mutate({
      tripId,
      date: newDate.toISOString(),
      dayNumber: nextDayNumber,
      title: `Day ${nextDayNumber}`,
    });
  };

  const handleImportPin = (pin: any, dayId: number) => {
    const mappedCategory = PIN_CATEGORY_MAP[pin.category ?? "other"] ?? "other";
    addActivity.mutate({
      dayId, tripId,
      title: pin.title,
      location: pin.address ?? "",
      startTime: "",
      endTime: "",
      notes: pin.notes ?? "",
      category: mappedCategory as "transport" | "food" | "attraction" | "hotel" | "shopping" | "other",
      sortOrder: 99,
    });
    toast.success(lang === "zh" ? `已匯入：${pin.title}` : `Imported: ${pin.title}`);
  };

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-8 h-8 text-primary animate-spin" />
    </div>
  );

  const hasPins = pins && pins.length > 0;
  const dateLocale = lang === "zh" ? zhTW : enUS;
  const dateFormatStr = lang === "zh" ? "M月d日 (EEEE)" : "MMM d (EEEE)";

  return (
    <div className="px-4 sm:px-6 py-6 max-w-3xl mx-auto">
      {!canEdit && (
        <div className="mb-4 flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-sm">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
          <span>{t("viewerCannotEdit")}</span>
        </div>
      )}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-foreground">{lang === "zh" ? "每日行程" : "Daily Itinerary"}</h2>
          <p className="text-muted-foreground text-sm mt-0.5">
            {lang === "zh" ? `${days?.length ?? 0} 天行程` : `${days?.length ?? 0} day${(days?.length ?? 0) !== 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportToPDF} className="gap-1.5 shrink-0">
            <FileDown className="w-3.5 h-3.5" />
            {t("exportItinerary")}
          </Button>
          {canEdit && (
            <Button variant="outline" size="sm" onClick={handleAddDay} disabled={addDay.isPending} className="gap-1.5 shrink-0">
              {addDay.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarPlus className="w-3.5 h-3.5" />}
              {lang === "zh" ? "新增一天" : "Add Day"}
            </Button>
          )}
        </div>
      </div>

      {/* Empty state */}
      {(!days || days.length === 0) && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <CalendarPlus className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">
            {lang === "zh" ? "還沒有行程天數" : "No days yet"}
          </h3>
          <p className="text-muted-foreground text-sm mb-4 max-w-xs">
            {lang === "zh"
              ? "點擊「新增一天」開始規劃每日行程，或修改行程日期讓系統自動生成"
              : "Click \"Add Day\" to start planning, or update trip dates to auto-generate days"}
          </p>
          <Button onClick={handleAddDay} disabled={addDay.isPending} className="gap-2">
            {addDay.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarPlus className="w-4 h-4" />}
            {lang === "zh" ? "新增第一天" : "Add First Day"}
          </Button>
        </div>
      )}

      <div className="space-y-6">
        {days?.map((day) => {
          const activities = getActivitiesForDay(day);
          const activityIds = activities.map((a: any) => a.id);
          const dayTitle = day.title ?? (lang === "zh" ? `第 ${day.dayNumber} 天` : `Day ${day.dayNumber}`);

          return (
            <div key={day.id} className="bg-card rounded-2xl border border-border overflow-hidden">
              {/* Day header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                      {day.dayNumber}
                    </span>
                    <span className="font-semibold text-foreground">{dayTitle}</span>
                  </div>
                  <p className="text-muted-foreground text-xs mt-0.5 ml-9">
                    {day.date ? format(new Date(day.date), dateFormatStr, { locale: dateLocale }) : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {canEdit && hasPins && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setImportTargetDayId(day.id); setShowImportPins(true); }}
                      className="gap-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50 text-xs"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      {lang === "zh" ? "匯入地點" : "Import Location"}
                    </Button>
                  )}
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleAISuggest(day)}
                      disabled={suggestActivities.isPending && aiDayId === day.id}
                      className="gap-1.5 text-purple-600 hover:text-purple-700 hover:bg-purple-50 text-xs"
                    >
                      {suggestActivities.isPending && aiDayId === day.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Sparkles className="w-3.5 h-3.5" />
                      }
                      {t("aiSuggest")}
                    </Button>
                  )}
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setAddingDayId(day.id); setForm(defaultForm); }}
                      className="gap-1.5 text-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {t("add")}
                    </Button>
                  )}
                </div>
              </div>

              {/* AI Suggestions */}
              {aiDayId === day.id && aiSuggestions.length > 0 && (
                <div className="px-4 py-3 bg-purple-50 border-b border-purple-100">
                  <p className="text-purple-700 text-xs font-medium mb-2 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    {lang === "zh" ? "AI 推薦活動（點擊新增）" : "AI Suggestions (click to add)"}
                  </p>
                  <div className="space-y-2">
                    {aiSuggestions.map((s, i) => {
                      const cat = getCategoryStyle(s.category, t);
                      return (
                        <button
                          key={i}
                          onClick={() => handleApplySuggestion(s, day.id)}
                          className="w-full text-left p-3 rounded-xl bg-white border border-purple-100 hover:border-purple-300 hover:shadow-sm transition-all"
                        >
                          <div className="flex items-start gap-2">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${cat.color} shrink-0`}>{cat.label}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground">{s.title}</p>
                              {s.location && <p className="text-xs text-muted-foreground mt-0.5">{s.location}</p>}
                              {s.startTime && <p className="text-xs text-muted-foreground">{s.startTime}{s.endTime ? ` – ${s.endTime}` : ""}</p>}
                            </div>
                            <Plus className="w-4 h-4 text-purple-500 shrink-0 mt-0.5" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Activities timeline with DnD */}
              <div className="p-4">
                {activities.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">
                    <p>{t("noActivities")}</p>
                    <button onClick={() => { setAddingDayId(day.id); setForm(defaultForm); }} className="text-primary hover:underline mt-1 text-sm">
                      + {lang === "zh" ? "新增第一個活動" : "Add first activity"}
                    </button>
                  </div>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={(event) => handleDragEnd(event, day.id, activities)}
                  >
                    <SortableContext items={activityIds} strategy={verticalListSortingStrategy}>
                      <div className="space-y-3 pl-5">
                        {activities.map((activity: any, idx: number) => (
                          <SortableActivityCard
                            key={activity.id}
                            activity={activity}
                            idx={idx}
                            totalCount={activities.length}
                            tripId={tripId}
                            canEdit={canEdit}
                            t={t}
                            onEdit={(a) => {
                              setEditingActivity(a);
                              setForm({ title: a.title, location: a.location ?? "", startTime: a.startTime ?? "", endTime: a.endTime ?? "", notes: a.notes ?? "", category: a.category });
                            }}
                            onMove={(a) => setMovingActivity(a)}
                            onDelete={(id) => deleteActivity.mutate({ activityId: id, tripId })}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Activity Dialog */}
      <Dialog open={!!addingDayId} onOpenChange={(o) => !o && setAddingDayId(null)}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("addActivity")}</DialogTitle>
          </DialogHeader>
          <ActivityForm form={form} setForm={setForm} onSubmit={handleAdd} loading={addActivity.isPending} submitLabel={t("addActivity")} t={t} lang={lang} />
        </DialogContent>
      </Dialog>

      {/* Edit Activity Dialog */}
      <Dialog open={!!editingActivity} onOpenChange={(o) => !o && setEditingActivity(null)}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("editActivity")}</DialogTitle>
          </DialogHeader>
          <ActivityForm form={form} setForm={setForm} onSubmit={handleUpdate} loading={updateActivity.isPending} submitLabel={t("saveChanges")} t={t} lang={lang} />
        </DialogContent>
      </Dialog>

      {/* Move to Another Day Dialog */}
      <Dialog open={!!movingActivity} onOpenChange={(o) => !o && setMovingActivity(null)}>
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
                {lang === "zh"
                  ? <>選擇要將「<span className="font-medium text-foreground">{movingActivity.title}</span>」移至哪一天：</>
                  : <>Select a day to move <span className="font-medium text-foreground">"{movingActivity.title}"</span> to:</>
                }
              </p>
              <div className="space-y-2">
                {days?.filter(d => d.id !== movingActivity.dayId).map(d => (
                  <button
                    key={d.id}
                    onClick={() => moveActivity.mutate({ tripId, activityId: movingActivity.id, targetDayId: d.id })}
                    disabled={moveActivity.isPending}
                    className="w-full text-left p-3 rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-all flex items-center gap-3"
                  >
                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                      {d.dayNumber}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{d.title ?? (lang === "zh" ? `第 ${d.dayNumber} 天` : `Day ${d.dayNumber}`)}</p>
                      {d.date && (
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(d.date), dateFormatStr, { locale: dateLocale })}
                        </p>
                      )}
                    </div>
                    {moveActivity.isPending ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : <MoveRight className="w-4 h-4 text-primary" />}
                  </button>
                ))}
                {days?.filter(d => d.id !== movingActivity.dayId).length === 0 && (
                  <p className="text-center text-muted-foreground text-sm py-4">
                    {lang === "zh" ? "只有一天行程，無法移動" : "Only one day, cannot move"}
                  </p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Import from Map Pins Dialog */}
      <Dialog open={showImportPins} onOpenChange={(o) => { if (!o) { setShowImportPins(false); setImportTargetDayId(null); } }}>
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
                <p className="text-xs mt-1">{lang === "zh" ? "先在地圖頁面新增地點標記" : "Add pins on the Map page first"}</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground mb-3">
                  {lang === "zh" ? "點擊地點即可加入當天行程" : "Click a pin to add it to this day"}
                </p>
                {pins.map((pin) => {
                  const cat = getCategoryStyle(PIN_CATEGORY_MAP[pin.category ?? "other"] ?? "other", t);
                  const Icon = cat.icon;
                  return (
                    <button
                      key={pin.id}
                      onClick={() => {
                        if (importTargetDayId) handleImportPin(pin, importTargetDayId);
                      }}
                      disabled={addActivity.isPending}
                      className="w-full text-left p-3 rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-all flex items-start gap-3"
                    >
                      <div className={`w-8 h-8 rounded-full ${cat.color} flex items-center justify-center shrink-0`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{pin.title}</p>
                        <p className="text-xs text-muted-foreground">{cat.label}</p>
                        {pin.address && <p className="text-xs text-muted-foreground truncate mt-0.5">{pin.address}</p>}
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

function ActivityForm({ form, setForm, onSubmit, loading, submitLabel, t, lang }: {
  form: ActivityFormData;
  setForm: (f: ActivityFormData) => void;
  onSubmit: () => void;
  loading: boolean;
  submitLabel: string;
  t: (k: any) => string;
  lang: string;
}) {
  const categories = CATEGORY_DEFS.filter(c => c.value !== "accommodation").map(c => ({
    ...c,
    label: {
      transport: t("catTransport"),
      hotel: t("catAccommodation"),
      food: t("catFood"),
      attraction: t("catAttraction"),
      shopping: t("catShopping"),
      other: t("catOther"),
    }[c.value] ?? c.value,
  }));

  return (
    <div className="space-y-4 mt-2">
      <div>
        <Label>{t("activityTitle")} *</Label>
        <Input className="mt-1.5" placeholder={lang === "zh" ? "例：參觀吉薩金字塔" : "e.g. Visit the Pyramids"} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
      </div>
      <div>
        <Label>{t("activityCategory")}</Label>
        <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
          <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
          <SelectContent>
            {categories.map(c => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>{t("activityLocation")}</Label>
        <Input className="mt-1.5" placeholder={lang === "zh" ? "例：吉薩高原" : "e.g. Giza Plateau"} value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>{t("activityStartTime")}</Label>
          <Input className="mt-1.5" type="time" value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })} />
        </div>
        <div>
          <Label>{t("activityEndTime")}</Label>
          <Input className="mt-1.5" type="time" value={form.endTime} onChange={e => setForm({ ...form, endTime: e.target.value })} />
        </div>
      </div>
      <div>
        <Label>{t("activityNotes")}</Label>
        <Textarea className="mt-1.5" placeholder={t("activityNotesPlaceholder")} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} />
      </div>
      <Button className="w-full" onClick={onSubmit} disabled={loading}>
        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
        {submitLabel}
      </Button>
    </div>
  );
}
