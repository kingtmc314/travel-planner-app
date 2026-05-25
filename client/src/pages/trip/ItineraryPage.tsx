import { trpc } from "@/lib/trpc";
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
import { zhTW } from "date-fns/locale";
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

const CATEGORIES = [
  { value: "transport", label: "交通", icon: Car, color: "bg-blue-100 text-blue-600" },
  { value: "accommodation", label: "住宿", icon: Home, color: "bg-purple-100 text-purple-600" },
  // "hotel" is the DB value for accommodation
  { value: "hotel", label: "住宿", icon: Home, color: "bg-purple-100 text-purple-600" },
  { value: "food", label: "餐飲", icon: Utensils, color: "bg-orange-100 text-orange-600" },
  { value: "attraction", label: "景點", icon: Camera, color: "bg-green-100 text-green-600" },
  { value: "shopping", label: "購物", icon: ShoppingBag, color: "bg-pink-100 text-pink-600" },
  { value: "other", label: "其他", icon: MoreHorizontal, color: "bg-muted text-muted-foreground" },
];

function getCategoryStyle(cat: string) {
  return CATEGORIES.find(c => c.value === cat) ?? CATEGORIES[6];
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
}: {
  activity: any;
  idx: number;
  totalCount: number;
  tripId: number;
  onEdit: (activity: any) => void;
  onDelete: (activityId: number) => void;
  onMove: (activity: any) => void;
  canEdit: boolean;
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

  const cat = getCategoryStyle(activity.category);
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
        aria-label="拖曳排序"
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
                title="編輯"
              >
                <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
              <button
                onClick={() => onMove(activity)}
                className="p-1.5 rounded-lg hover:bg-blue-50 transition-colors"
                title="移至其他天"
              >
                <MoveRight className="w-3.5 h-3.5 text-blue-500" />
              </button>
              <button
                onClick={() => onDelete(activity.id)}
                className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors"
                title="刪除"
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
  const utils = trpc.useUtils();
  const { data: days, refetch, isLoading } = trpc.itinerary.getDays.useQuery({ tripId }, { refetchInterval: 15000 });
  const { data: trip } = trpc.trips.get.useQuery({ tripId });
  const canEdit = trip?.userRole === "owner" || trip?.userRole === "editor";
  const { data: pins } = trpc.map.getPins.useQuery({ tripId });

  const [addingDayId, setAddingDayId] = useState<number | null>(null);
  const [editingActivity, setEditingActivity] = useState<any | null>(null);
  const [movingActivity, setMovingActivity] = useState<any | null>(null);

  const exportToPDF = () => {
    if (!days || days.length === 0) { toast.error("沒有行程可以匯出"); return; }
    const tripName = trip?.name ?? "行程";
    const tripDest = trip?.destination ?? "";
    const tripDates = trip?.startDate && trip?.endDate
      ? `${getDateStr(trip.startDate)} – ${getDateStr(trip.endDate)}`
      : "";

    const catColors: Record<string, string> = {
      transport: "#3b82f6", accommodation: "#8b5cf6", hotel: "#8b5cf6",
      food: "#f97316", attraction: "#22c55e", shopping: "#ec4899", other: "#94a3b8",
    };
    const catLabels: Record<string, string> = {
      transport: "交通", accommodation: "住宿", hotel: "住宿",
      food: "餐飲", attraction: "景點", shopping: "購物", other: "其他",
    };

    const daysHtml = days.map(day => {
      const acts = getActivitiesForDay(day);
      const actsHtml = acts.length === 0
        ? `<p style="color:#9ca3af;font-size:13px;margin:8px 0">未安排活動</p>`
        : acts.map(a => {
            const color = catColors[a.category] ?? "#94a3b8";
            const label = catLabels[a.category] ?? "其他";
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
        ? new Date(day.date).toLocaleDateString("zh-TW", { year: "numeric", month: "long", day: "numeric", weekday: "long" })
        : "";

      return `
        <div style="margin-bottom:28px;page-break-inside:avoid">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #e5e7eb">
            <div style="width:28px;height:28px;border-radius:50%;background:#1e40af;color:white;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0">${day.dayNumber}</div>
            <div>
              <div style="font-weight:700;font-size:15px">${day.title ?? `第 ${day.dayNumber} 天`}</div>
              ${dateStr ? `<div style="color:#6b7280;font-size:12px">${dateStr}</div>` : ""}
            </div>
          </div>
          ${actsHtml}
        </div>`;
    }).join("");

    const html = `
      <!DOCTYPE html>
      <html lang="zh-TW">
      <head>
        <meta charset="UTF-8">
        <title>${tripName} 行程</title>
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
          <p style="color:#9ca3af;font-size:12px;margin:8px 0 0">產生時間：${new Date().toLocaleString("zh-TW")}</p>
        </div>
        ${daysHtml}
        <div class="no-print" style="text-align:center;margin-top:32px">
          <button onclick="window.print()" style="background:#1e40af;color:white;border:none;padding:10px 24px;border-radius:8px;font-size:14px;cursor:pointer">🖨️ 列印 / 儲存為 PDF</button>
        </div>
      </body>
      </html>`;

    const win = window.open("", "_blank");
    if (win) {
      win.document.write(html);
      win.document.close();
      setTimeout(() => win.print(), 500);
    } else {
      toast.error("請允許彈出視窗以匯出 PDF");
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
    onSuccess: () => { refetch(); setAddingDayId(null); setForm(defaultForm); toast.success("活動已新增"); },
    onError: () => toast.error("新增失敗"),
  });
  const updateActivity = trpc.itinerary.updateActivity.useMutation({
    onSuccess: () => { refetch(); setEditingActivity(null); toast.success("活動已更新"); },
    onError: () => toast.error("更新失敗"),
  });
  const deleteActivity = trpc.itinerary.deleteActivity.useMutation({
    onSuccess: () => { refetch(); toast.success("活動已刪除"); },
  });
  const addDay = trpc.itinerary.addDay.useMutation({
    onSuccess: () => { refetch(); toast.success("已新增一天"); },
    onError: () => toast.error("新增失敗"),
  });
  const moveActivity = trpc.itinerary.moveActivity.useMutation({
    onSuccess: () => {
      refetch();
      setMovingActivity(null);
      toast.success("活動已移至其他天");
    },
    onError: () => toast.error("移動失敗"),
  });

  const reorderActivities = trpc.itinerary.reorderActivities.useMutation({
    onError: () => { refetch(); toast.error("排序儲存失敗，已還原"); },
  });
  const suggestActivities = trpc.ai.suggestActivities.useMutation({
    onSuccess: (data) => setAiSuggestions(data.activities ?? []),
    onError: () => toast.error("AI 建議失敗，請重試"),
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
    // Optimistic update
    setLocalOrders(prev => ({ ...prev, [dayId]: reordered }));
    // Persist to server
    reorderActivities.mutate({
      tripId,
      orderedIds: reordered.map(a => a.id),
    });
  }, [tripId, reorderActivities]);

  const handleAdd = () => {
    if (!addingDayId || !form.title) { toast.error("請填寫活動名稱"); return; }
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
    toast.success(`已新增：${suggestion.title}`);
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
    toast.success(`已匯入：${pin.title}`);
  };

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-8 h-8 text-primary animate-spin" />
    </div>
  );

  const hasPins = pins && pins.length > 0;

  return (
    <div className="px-4 sm:px-6 py-6 max-w-3xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-foreground">每日行程</h2>
          <p className="text-muted-foreground text-sm mt-0.5">{days?.length ?? 0} 天行程</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportToPDF} className="gap-1.5 shrink-0">
            <FileDown className="w-3.5 h-3.5" />
            匯出 PDF
          </Button>
          <Button variant="outline" size="sm" onClick={handleAddDay} disabled={addDay.isPending} className="gap-1.5 shrink-0">
            {addDay.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarPlus className="w-3.5 h-3.5" />}
            新增一天
          </Button>
        </div>
      </div>

      {/* Empty state */}
      {(!days || days.length === 0) && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <CalendarPlus className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">還沒有行程天數</h3>
          <p className="text-muted-foreground text-sm mb-4 max-w-xs">
            點擊「新增一天」開始規劃每日行程，或修改行程日期讓系統自動生成
          </p>
          <Button onClick={handleAddDay} disabled={addDay.isPending} className="gap-2">
            {addDay.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarPlus className="w-4 h-4" />}
            新增第一天
          </Button>
        </div>
      )}

      <div className="space-y-6">
        {days?.map((day) => {
          const activities = getActivitiesForDay(day);
          const activityIds = activities.map((a: any) => a.id);

          return (
            <div key={day.id} className="bg-card rounded-2xl border border-border overflow-hidden">
              {/* Day header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                      {day.dayNumber}
                    </span>
                    <span className="font-semibold text-foreground">{day.title ?? `第 ${day.dayNumber} 天`}</span>
                  </div>
                  <p className="text-muted-foreground text-xs mt-0.5 ml-9">
                    {day.date ? format(new Date(day.date), "M月d日 (EEEE)", { locale: zhTW }) : ""}
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
                      匯入地點
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
                      AI 建議
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
                      新增
                    </Button>
                  )}
                </div>
              </div>

              {/* AI Suggestions */}
              {aiDayId === day.id && aiSuggestions.length > 0 && (
                <div className="px-4 py-3 bg-purple-50 border-b border-purple-100">
                  <p className="text-purple-700 text-xs font-medium mb-2 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    AI 推薦活動（點擊新增）
                  </p>
                  <div className="space-y-2">
                    {aiSuggestions.map((s, i) => {
                      const cat = getCategoryStyle(s.category);
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
                    <p>還沒有活動</p>
                    <button onClick={() => { setAddingDayId(day.id); setForm(defaultForm); }} className="text-primary hover:underline mt-1 text-sm">
                      + 新增第一個活動
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
            <DialogTitle>新增活動</DialogTitle>
          </DialogHeader>
          <ActivityForm form={form} setForm={setForm} onSubmit={handleAdd} loading={addActivity.isPending} submitLabel="新增活動" />
        </DialogContent>
      </Dialog>

      {/* Edit Activity Dialog */}
      <Dialog open={!!editingActivity} onOpenChange={(o) => !o && setEditingActivity(null)}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>編輯活動</DialogTitle>
          </DialogHeader>
          <ActivityForm form={form} setForm={setForm} onSubmit={handleUpdate} loading={updateActivity.isPending} submitLabel="儲存變更" />
        </DialogContent>
      </Dialog>

      {/* Move to Another Day Dialog */}
      <Dialog open={!!movingActivity} onOpenChange={(o) => !o && setMovingActivity(null)}>
        <DialogContent className="sm:max-w-sm max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MoveRight className="w-4 h-4 text-blue-500" />
              移至其他天
            </DialogTitle>
          </DialogHeader>
          {movingActivity && (
            <div className="mt-2">
              <p className="text-sm text-muted-foreground mb-3">
                選擇要將「<span className="font-medium text-foreground">{movingActivity.title}</span>」移至哪一天：
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
                      <p className="text-sm font-medium text-foreground">{d.title ?? `第 ${d.dayNumber} 天`}</p>
                      {d.date && (
                        <p className="text-xs text-muted-foreground">
                          {new Date(d.date).toLocaleDateString("zh-TW", { month: "long", day: "numeric", weekday: "short" })}
                        </p>
                      )}
                    </div>
                    {moveActivity.isPending ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : <MoveRight className="w-4 h-4 text-primary" />}
                  </button>
                ))}
                {days?.filter(d => d.id !== movingActivity.dayId).length === 0 && (
                  <p className="text-center text-muted-foreground text-sm py-4">只有一天行程，無法移動</p>
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
              從地圖標記匯入景點
            </DialogTitle>
          </DialogHeader>
          <div className="mt-2">
            {!pins || pins.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <MapPin className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p>地圖上還沒有標記</p>
                <p className="text-xs mt-1">先在地圖頁面新增地點標記</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground mb-3">點擊地點即可加入當天行程</p>
                {pins.map((pin) => {
                  const cat = getCategoryStyle(PIN_CATEGORY_MAP[pin.category ?? "other"] ?? "other");
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

function ActivityForm({ form, setForm, onSubmit, loading, submitLabel }: {
  form: ActivityFormData;
  setForm: (f: ActivityFormData) => void;
  onSubmit: () => void;
  loading: boolean;
  submitLabel: string;
}) {
  return (
    <div className="space-y-4 mt-2">
      <div>
        <Label>活動名稱 *</Label>
        <Input className="mt-1.5" placeholder="例：參觀吉薩金字塔" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
      </div>
      <div>
        <Label>類別</Label>
        <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
          <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
          <SelectContent>
            {CATEGORIES.filter(c => c.value !== "accommodation").map(c => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>地點</Label>
        <Input className="mt-1.5" placeholder="例：吉薩高原" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>開始時間</Label>
          <Input className="mt-1.5" type="time" value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })} />
        </div>
        <div>
          <Label>結束時間</Label>
          <Input className="mt-1.5" type="time" value={form.endTime} onChange={e => setForm({ ...form, endTime: e.target.value })} />
        </div>
      </div>
      <div>
        <Label>備注</Label>
        <Textarea className="mt-1.5" placeholder="任何備注或提示..." value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} />
      </div>
      <Button className="w-full" onClick={onSubmit} disabled={loading}>
        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
        {submitLabel}
      </Button>
    </div>
  );
}
