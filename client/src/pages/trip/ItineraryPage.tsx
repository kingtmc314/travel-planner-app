import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus, MapPin, Clock, Trash2, Edit2, Sparkles, Loader2,
  Car, Home, Utensils, Camera, ShoppingBag, MoreHorizontal
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";

const CATEGORIES = [
  { value: "transport", label: "交通", icon: Car, color: "bg-blue-100 text-blue-600" },
  { value: "accommodation", label: "住宿", icon: Home, color: "bg-purple-100 text-purple-600" },
  { value: "food", label: "餐飲", icon: Utensils, color: "bg-orange-100 text-orange-600" },
  { value: "attraction", label: "景點", icon: Camera, color: "bg-green-100 text-green-600" },
  { value: "shopping", label: "購物", icon: ShoppingBag, color: "bg-pink-100 text-pink-600" },
  { value: "other", label: "其他", icon: MoreHorizontal, color: "bg-muted text-muted-foreground" },
];

function getCategoryStyle(cat: string) {
  return CATEGORIES.find(c => c.value === cat) ?? CATEGORIES[5];
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

export default function ItineraryPage({ tripId }: { tripId: number }) {
  const { data: days, refetch, isLoading } = trpc.itinerary.getDays.useQuery({ tripId }, { refetchInterval: 15000 });
  const { data: trip } = trpc.trips.get.useQuery({ tripId });
  const [addingDayId, setAddingDayId] = useState<number | null>(null);
  const [editingActivity, setEditingActivity] = useState<any | null>(null);
  const [form, setForm] = useState<ActivityFormData>(defaultForm);
  const [aiDayId, setAiDayId] = useState<number | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<any[]>([]);

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
  const suggestActivities = trpc.ai.suggestActivities.useMutation({
    onSuccess: (data) => setAiSuggestions(data.activities ?? []),
    onError: () => toast.error("AI 建議失敗，請重試"),
  });

  const handleAdd = () => {
    if (!addingDayId || !form.title) { toast.error("請填寫活動名稱"); return; }
    addActivity.mutate({ dayId: addingDayId, tripId, ...form, category: form.category as "transport" | "accommodation" | "food" | "attraction" | "shopping" | "other", sortOrder: 0 });
  };

  const handleUpdate = () => {
    if (!editingActivity || !form.title) return;
    updateActivity.mutate({ activityId: editingActivity.id, tripId, ...form, category: form.category as "transport" | "accommodation" | "food" | "attraction" | "shopping" | "other" });
  };

  const handleAISuggest = (day: any) => {
    setAiDayId(day.id);
    setAiSuggestions([]);
    suggestActivities.mutate({
      destination: trip?.destination ?? "",
      date: day.dayDate,
      dayNumber: day.dayNumber,
      existingActivities: day.activities?.map((a: any) => a.title) ?? [],
    });
  };

  const handleApplySuggestion = (suggestion: any, dayId: number) => {
    addActivity.mutate({
      dayId,
      tripId,
      title: suggestion.title,
      location: suggestion.location ?? "",
      startTime: suggestion.startTime ?? "",
      endTime: suggestion.endTime ?? "",
      notes: suggestion.notes ?? "",
      category: (suggestion.category ?? "other") as "transport" | "accommodation" | "food" | "attraction" | "shopping" | "other",
      sortOrder: 99,
    });
    toast.success(`已新增：${suggestion.title}`);
  };

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-8 h-8 text-primary animate-spin" />
    </div>
  );

  return (
    <div className="px-4 sm:px-6 py-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-foreground">每日行程</h2>
        <p className="text-muted-foreground text-sm mt-0.5">{days?.length ?? 0} 天行程</p>
      </div>

      <div className="space-y-6">
        {days?.map((day) => (
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
                  {day.dayDate ? format(new Date(day.dayDate), "M月d日 (EEEE)", { locale: zhTW }) : ""}
                </p>
              </div>
              <div className="flex items-center gap-1">
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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setAddingDayId(day.id); setForm(defaultForm); }}
                  className="gap-1.5 text-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  新增
                </Button>
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

            {/* Activities timeline */}
            <div className="p-4">
              {(!day.activities || day.activities.length === 0) ? (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  <p>還沒有活動</p>
                  <button onClick={() => { setAddingDayId(day.id); setForm(defaultForm); }} className="text-primary hover:underline mt-1 text-sm">
                    + 新增第一個活動
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {day.activities.map((activity: any, idx: number) => {
                    const cat = getCategoryStyle(activity.category);
                    const Icon = cat.icon;
                    return (
                      <div key={activity.id} className="relative flex gap-3 group">
                        {/* Timeline connector */}
                        {idx < day.activities.length - 1 && (
                          <div className="absolute left-4 top-9 bottom-0 w-0.5 bg-border" />
                        )}
                        {/* Icon */}
                        <div className={`w-8 h-8 rounded-full ${cat.color} flex items-center justify-center shrink-0 z-10`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        {/* Content */}
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
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                              <button
                                onClick={() => { setEditingActivity(activity); setForm({ title: activity.title, location: activity.location ?? "", startTime: activity.startTime ?? "", endTime: activity.endTime ?? "", notes: activity.notes ?? "", category: activity.category }); }}
                                className="p-1.5 rounded-lg hover:bg-accent transition-colors"
                              >
                                <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                              </button>
                              <button
                                onClick={() => deleteActivity.mutate({ activityId: activity.id, tripId })}
                                className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-destructive" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Add Activity Dialog */}
      <Dialog open={!!addingDayId} onOpenChange={(o) => !o && setAddingDayId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新增活動</DialogTitle>
          </DialogHeader>
          <ActivityForm form={form} setForm={setForm} onSubmit={handleAdd} loading={addActivity.isPending} submitLabel="新增活動" />
        </DialogContent>
      </Dialog>

      {/* Edit Activity Dialog */}
      <Dialog open={!!editingActivity} onOpenChange={(o) => !o && setEditingActivity(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>編輯活動</DialogTitle>
          </DialogHeader>
          <ActivityForm form={form} setForm={setForm} onSubmit={handleUpdate} loading={updateActivity.isPending} submitLabel="儲存變更" />
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
        <Input className="mt-1.5" placeholder="例：參觀吉薩金字塔" value={form.title} onChange={e => setForm({...form, title: e.target.value})} />
      </div>
      <div>
        <Label>類別</Label>
        <Select value={form.category} onValueChange={v => setForm({...form, category: v})}>
          <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
          <SelectContent>
            {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>地點</Label>
        <Input className="mt-1.5" placeholder="例：吉薩高原" value={form.location} onChange={e => setForm({...form, location: e.target.value})} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>開始時間</Label>
          <Input className="mt-1.5" type="time" value={form.startTime} onChange={e => setForm({...form, startTime: e.target.value})} />
        </div>
        <div>
          <Label>結束時間</Label>
          <Input className="mt-1.5" type="time" value={form.endTime} onChange={e => setForm({...form, endTime: e.target.value})} />
        </div>
      </div>
      <div>
        <Label>備注</Label>
        <Textarea className="mt-1.5" placeholder="任何備注或提示..." value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={2} />
      </div>
      <Button className="w-full" onClick={onSubmit} disabled={loading}>
        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
        {submitLabel}
      </Button>
    </div>
  );
}
