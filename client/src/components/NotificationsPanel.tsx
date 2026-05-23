import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { trpc } from "@/lib/trpc";
import { Bell, CheckCheck, DollarSign, MapPin, Users, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { zhTW } from "date-fns/locale";

const typeIcon: Record<string, React.ElementType> = {
  expense_added: DollarSign,
  itinerary_updated: Calendar,
  member_joined: Users,
  member_left: Users,
  trip_updated: MapPin,
  general: Bell,
};

const typeColor: Record<string, string> = {
  expense_added: "bg-green-100 text-green-600",
  itinerary_updated: "bg-blue-100 text-blue-600",
  member_joined: "bg-purple-100 text-purple-600",
  member_left: "bg-red-100 text-red-600",
  trip_updated: "bg-amber-100 text-amber-600",
  general: "bg-muted text-muted-foreground",
};

export default function NotificationsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: notifications, refetch } = trpc.notifications.list.useQuery(undefined, { enabled: open });
  const markRead = trpc.notifications.markRead.useMutation({ onSuccess: () => refetch() });

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="px-6 py-4 border-b border-border flex-row items-center justify-between">
          <SheetTitle className="text-lg font-semibold">通知</SheetTitle>
          {notifications && notifications.some(n => !n.isRead) && (
            <Button variant="ghost" size="sm" onClick={() => markRead.mutate()} className="gap-1.5 text-muted-foreground">
              <CheckCheck className="w-4 h-4" />
              全部已讀
            </Button>
          )}
        </SheetHeader>
        <div className="flex-1 overflow-y-auto">
          {!notifications || notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center px-6">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Bell className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">目前沒有通知</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map((n) => {
                const Icon = typeIcon[n.type] ?? Bell;
                const color = typeColor[n.type] ?? "bg-muted text-muted-foreground";
                return (
                  <div key={n.id} className={`px-6 py-4 flex gap-3 ${!n.isRead ? "bg-primary/5" : ""}`}>
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-sm text-foreground">{n.title}</p>
                        {!n.isRead && <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1" />}
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{n.message}</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">
                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true, locale: zhTW })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
