import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import {
  ArrowLeft, Calendar, DollarSign, Map, Users, Plane, Sparkles, Menu, X, Bell, LogOut
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import AIAssistant from "@/components/AIAssistant";
import NotificationsPanel from "@/components/NotificationsPanel";

const NAV_ITEMS = [
  { key: "itinerary", label: "行程", icon: Calendar, path: "itinerary" },
  { key: "expenses", label: "費用", icon: DollarSign, path: "expenses" },
  { key: "map", label: "地圖", icon: Map, path: "map" },
  { key: "members", label: "成員", icon: Users, path: "members" },
  { key: "flights", label: "航班", icon: Plane, path: "flights" },
];

interface TripLayoutProps {
  tripId: number;
  children: React.ReactNode;
}

export default function TripLayout({ tripId, children }: TripLayoutProps) {
  const { user, loading, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const { data: trip } = trpc.trips.get.useQuery({ tripId }, { enabled: !!user && !!tripId });
  const { data: unreadCount } = trpc.notifications.unreadCount.useQuery(undefined, {
    enabled: !!user,
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (!loading && !user) setLocation("/");
  }, [user, loading]);

  if (loading || !user) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-10 h-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
    </div>
  );

  const activeTab = NAV_ITEMS.find(n => location.includes(`/${n.path}`))?.key ?? "itinerary";

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Back to dashboard */}
      <div className="p-4 border-b border-sidebar-border">
        <button
          onClick={() => setLocation("/dashboard")}
          className="flex items-center gap-2 text-sidebar-foreground/70 hover:text-sidebar-foreground transition-colors text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          返回儀表板
        </button>
      </div>

      {/* Trip info */}
      <div className="p-4 border-b border-sidebar-border">
        {trip?.coverImage && (
          <div className="relative h-28 rounded-xl overflow-hidden mb-3">
            <img src={trip.coverImage} className="w-full h-full object-cover" alt={trip.name} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
          </div>
        )}
        <h2 className="font-bold text-sidebar-foreground text-base leading-tight line-clamp-2">{trip?.name ?? "載入中..."}</h2>
        <p className="text-sidebar-foreground/60 text-xs mt-1 line-clamp-1">{trip?.destination}</p>
        {trip?.startDate && (
          <p className="text-sidebar-foreground/50 text-xs mt-0.5">
            {new Date(trip.startDate).toLocaleDateString("zh-HK")} – {new Date(trip.endDate).toLocaleDateString("zh-HK")}
          </p>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.key;
          return (
            <button
              key={item.key}
              onClick={() => { setLocation(`/trips/${tripId}/${item.path}`); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
              }`}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* AI Assistant button */}
      <div className="p-3 border-t border-sidebar-border">
        <button
          onClick={() => { setShowAI(true); setSidebarOpen(false); }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-all"
        >
          <Sparkles className="w-4 h-4 shrink-0 text-purple-400" />
          AI 旅遊助手
        </button>
      </div>

      {/* User */}
      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center text-sidebar-accent-foreground font-semibold text-sm shrink-0">
            {user.name?.charAt(0).toUpperCase() ?? "U"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sidebar-foreground text-sm font-medium truncate">{user.name}</p>
            <p className="text-sidebar-foreground/50 text-xs truncate">{user.email}</p>
          </div>
          <button onClick={logout} className="text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0 h-screen sticky top-0 overflow-y-auto" style={{background:"oklch(0.14 0.03 255)"}}>
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="p-0 w-72" style={{background:"oklch(0.14 0.03 255)"}}>
          <SidebarContent />
        </SheetContent>
      </Sheet>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="lg:hidden sticky top-0 z-30 glass border-b border-border">
          <div className="flex items-center justify-between px-4 h-14">
            <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg hover:bg-accent transition-colors">
              <Menu className="w-5 h-5 text-foreground" />
            </button>
            <div className="flex-1 text-center">
              <h1 className="font-semibold text-foreground text-sm line-clamp-1 px-2">{trip?.name ?? "行程"}</h1>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setShowNotifications(true)} className="relative p-2 rounded-lg hover:bg-accent transition-colors">
                <Bell className="w-5 h-5 text-muted-foreground" />
                {unreadCount && unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-destructive" />
                )}
              </button>
              <button onClick={() => setShowAI(true)} className="p-2 rounded-lg hover:bg-accent transition-colors">
                <Sparkles className="w-5 h-5 text-purple-500" />
              </button>
            </div>
          </div>
        </header>

        {/* Desktop top bar */}
        <div className="hidden lg:flex items-center justify-between px-6 py-3 border-b border-border bg-background/80 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <h1 className="font-semibold text-foreground">{trip?.name}</h1>
            {trip?.memberRole && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                trip.memberRole === "owner" ? "bg-primary/10 text-primary" :
                trip.memberRole === "editor" ? "bg-green-100 text-green-700" :
                "bg-muted text-muted-foreground"
              }`}>
                {trip.memberRole === "owner" ? "擁有者" : trip.memberRole === "editor" ? "編輯者" : "觀看者"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowNotifications(true)} className="relative p-2 rounded-lg hover:bg-accent transition-colors">
              <Bell className="w-5 h-5 text-muted-foreground" />
              {unreadCount && unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-destructive" />
              )}
            </button>
            <Button variant="outline" size="sm" onClick={() => setShowAI(true)} className="gap-1.5">
              <Sparkles className="w-4 h-4 text-purple-500" />
              AI 助手
            </Button>
          </div>
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-auto pb-20 lg:pb-6 page-enter">
          {children}
        </main>

        {/* Mobile bottom nav */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 glass border-t border-border pb-safe">
          <div className="flex items-center justify-around px-2 py-2">
            {NAV_ITEMS.map((item) => {
              const isActive = activeTab === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setLocation(`/trips/${tripId}/${item.path}`)}
                  className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all ${
                    isActive ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  <item.icon className={`w-5 h-5 ${isActive ? "text-primary" : ""}`} />
                  <span className="text-[10px] font-medium">{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>

      {/* AI Assistant Panel */}
      <AIAssistant
        open={showAI}
        onClose={() => setShowAI(false)}
        tripId={tripId}
        destination={trip?.destination}
      />

      {/* Notifications */}
      <NotificationsPanel open={showNotifications} onClose={() => setShowNotifications(false)} />
    </div>
  );
}
