import { useI18n } from "@/hooks/useI18n";
import { trpc } from "@/lib/trpc";
import { MapPin, Calendar, Clock, DollarSign, Utensils, Hotel, Train, Camera, ShoppingBag, Star, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { useRoute } from "wouter";

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  transport: <Train className="w-4 h-4" />,
  food: <Utensils className="w-4 h-4" />,
  hotel: <Hotel className="w-4 h-4" />,
  attraction: <Camera className="w-4 h-4" />,
  shopping: <ShoppingBag className="w-4 h-4" />,
  other: <Star className="w-4 h-4" />,
};

const CATEGORY_COLORS: Record<string, string> = {
  transport: "bg-blue-100 text-blue-700",
  food: "bg-orange-100 text-orange-700",
  hotel: "bg-purple-100 text-purple-700",
  attraction: "bg-green-100 text-green-700",
  shopping: "bg-pink-100 text-pink-700",
  other: "bg-gray-100 text-gray-700",
};

export default function SharedTripPage() {
  const { t, lang } = useI18n();
  const [, params] = useRoute("/share/:token");
  const token = params?.token ?? "";
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set([0]));

  const { data, isLoading, error } = trpc.trips.getPublicTrip.useQuery(
    { token },
    { enabled: !!token }
  );

  const toggleDay = (idx: number) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-4 border-primary border-t-transparent animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">{lang === "zh" ? "載入行程中..." : "Loading trip..."}</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md px-4">
          <div className="text-6xl mb-4">🔗</div>
          <h1 className="text-2xl font-bold text-foreground mb-2">
            {lang === "zh" ? "連結無效或已停用" : "Link Invalid or Disabled"}
          </h1>
          <p className="text-muted-foreground">
            {lang === "zh"
              ? "此分享連結不存在或已被行程擁有者停用。"
              : "This share link does not exist or has been disabled by the trip owner."}
          </p>
        </div>
      </div>
    );
  }

  const { trip, days } = data;
  const startDate = new Date(trip.startDate);
  const endDate = new Date(trip.endDate);
  const locale = lang === "zh" ? "zh-HK" : "en-US";
  const dateRange = `${startDate.toLocaleDateString(locale, { month: "short", day: "numeric" })} – ${endDate.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" })}`;
  const totalDays = Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Banner */}
      <div className="relative h-64 sm:h-80 overflow-hidden">
        {trip.coverImage ? (
          <img src={trip.coverImage} alt={trip.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-blue-500 to-indigo-600" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        {/* Readonly badge */}
        <div className="absolute top-4 right-4">
          <span className="px-3 py-1.5 rounded-full bg-white/20 backdrop-blur-sm text-white text-xs font-medium border border-white/30">
            {lang === "zh" ? "唯讀瀏覽" : "Read Only"}
          </span>
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-6">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2 drop-shadow-lg">{trip.name}</h1>
          <div className="flex flex-wrap items-center gap-3 text-white/90">
            <div className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4" />
              <span className="text-sm">{trip.destination}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4" />
              <span className="text-sm">{dateRange}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              <span className="text-sm">{totalDays} {lang === "zh" ? "天" : "days"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-8">
        {trip.description && (
          <div className="bg-white rounded-2xl p-5 mb-6 shadow-sm border border-border">
            <p className="text-muted-foreground leading-relaxed">{trip.description}</p>
          </div>
        )}

        {/* Itinerary Days */}
        {days.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>{lang === "zh" ? "此行程尚無行程天數" : "No itinerary days yet"}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {days.map((day: any, dayIdx: number) => {
              const dayDate = new Date(day.date);
              const isExpanded = expandedDays.has(dayIdx);
              const activities = day.activities ?? [];
              const dayTotal = activities.reduce((sum: number, a: any) => {
                if (a.cost) return sum + parseFloat(a.cost);
                return sum;
              }, 0);

              return (
                <div key={day.id} className="bg-white rounded-2xl overflow-hidden shadow-sm border border-border">
                  {/* Day Header */}
                  <button
                    onClick={() => toggleDay(dayIdx)}
                    className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex flex-col items-center justify-center shrink-0">
                        <span className="text-primary font-bold text-sm leading-none">D{day.dayNumber}</span>
                      </div>
                      <div className="text-left">
                        <div className="font-semibold text-foreground">{day.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {dayDate.toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" })}
                          {dayTotal > 0 && (
                            <span className="ml-2 text-primary font-medium">
                              {trip.baseCurrency} {dayTotal.toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{activities.length} {lang === "zh" ? "項" : "items"}</span>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </button>

                  {/* Activities */}
                  {isExpanded && activities.length > 0 && (
                    <div className="border-t border-border">
                      {activities.map((activity: any, actIdx: number) => (
                        <div key={activity.id} className={`flex gap-4 px-4 py-3 ${actIdx < activities.length - 1 ? "border-b border-border/50" : ""}`}>
                          {/* Time */}
                          <div className="w-12 shrink-0 text-right">
                            <span className="text-xs font-mono text-muted-foreground">{activity.startTime ?? "--:--"}</span>
                          </div>
                          {/* Icon */}
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${CATEGORY_COLORS[activity.category] ?? "bg-gray-100 text-gray-700"}`}>
                            {CATEGORY_ICONS[activity.category] ?? <Star className="w-4 h-4" />}
                          </div>
                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-foreground text-sm">{activity.title}</div>
                            {activity.location && (
                              <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {activity.location}
                              </div>
                            )}
                            {activity.notes && (
                              <div className="text-xs text-muted-foreground mt-1 italic">{activity.notes}</div>
                            )}
                            {activity.cost && (
                              <div className="text-xs text-primary font-medium mt-1 flex items-center gap-1">
                                <DollarSign className="w-3 h-3" />
                                {activity.currency ?? trip.baseCurrency} {parseFloat(activity.cost).toLocaleString()}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {isExpanded && activities.length === 0 && (
                    <div className="border-t border-border px-4 py-6 text-center text-sm text-muted-foreground">
                      {lang === "zh" ? "此天尚無活動" : "No activities for this day"}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="mt-10 text-center text-xs text-muted-foreground">
          <p>{lang === "zh" ? "由 Travel Planner 分享 · 僅供瀏覽，無法編輯" : "Shared via Travel Planner · Read-only view"}</p>
        </div>
      </div>
    </div>
  );
}
