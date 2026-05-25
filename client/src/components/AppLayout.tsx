import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Bell, Globe, LogOut, Plane, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import NotificationsPanel from "@/components/NotificationsPanel";
import AppLogo from "@/components/AppLogo";
import { useI18n } from "@/hooks/useI18n";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [currentPath, setLocation] = useLocation();
  const [showNotifications, setShowNotifications] = useState(false);
  const { t, lang, setLang } = useI18n();

  const { data: unreadCount } = trpc.notifications.unreadCount.useQuery(undefined, {
    enabled: !!user,
    refetchInterval: 30000,
  });

  const navItems = [
    { path: "/dashboard", label: t("myTrips"), icon: Plane, iconClass: "rotate-45" },
    { path: "/travel-history", label: t("travelHistory"), icon: Globe, iconClass: "" },
    { path: "/flight-passport", label: t("flightPassport"), icon: Plane, iconClass: "" },
    { path: "/sync", label: t("syncCenter"), icon: RefreshCw, iconClass: "" },
  ];

  const LangToggle = () => (
    <button
      onClick={() => setLang(lang === "zh" ? "en" : "zh")}
      className="px-2 py-1 rounded-lg text-xs font-semibold border border-border text-muted-foreground hover:text-foreground hover:border-primary transition-colors"
      title={lang === "zh" ? "Switch to English" : "切換中文"}
    >
      {lang === "zh" ? "EN" : "中"}
    </button>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-56 shrink-0 border-r border-border bg-card/50 sticky top-0 h-screen">
        <div className="flex items-center gap-3 px-5 h-16 border-b border-border">
          <AppLogo size={32} />
          <div className="flex flex-col leading-none">
            <span className="font-bold text-foreground text-sm tracking-tight">VoyageAI</span>
            <span className="text-[10px] text-muted-foreground tracking-widest">{lang === "zh" ? "旅跡" : "Travel"}</span>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(item => {
            const Icon = item.icon;
            const active = currentPath === item.path;
            return (
              <button
                key={item.path}
                onClick={() => setLocation(item.path)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                <Icon className={`w-4 h-4 ${item.iconClass}`} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="px-3 py-4 border-t border-border space-y-1">
          <button
            onClick={() => setShowNotifications(true)}
            className="relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <Bell className="w-4 h-4" />
            {t("notifications")}
            {unreadCount && unreadCount.count > 0 ? (
              <span className="ml-auto w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center font-bold">
                {unreadCount.count > 9 ? "9+" : unreadCount.count}
              </span>
            ) : null}
          </button>
          <div className="flex items-center gap-2 px-3 py-2">
            <LangToggle />
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs shrink-0">
                {user?.name?.charAt(0).toUpperCase() ?? "U"}
              </div>
              <span className="text-sm text-foreground flex-1 truncate">{user?.name ?? (lang === "zh" ? "旅人" : "Traveller")}</span>
            </div>
            <button onClick={logout} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-accent transition-colors shrink-0">
              <LogOut className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <header className="lg:hidden sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
          <div className="px-4 sm:px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <AppLogo size={30} />
              <div className="flex flex-col leading-none">
                <span className="font-bold text-foreground text-sm tracking-tight">VoyageAI</span>
                <span className="text-[9px] text-muted-foreground tracking-widest">{lang === "zh" ? "旅跡" : "Travel"}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <LangToggle />
              <button
                onClick={() => setShowNotifications(true)}
                className="relative w-9 h-9 rounded-lg flex items-center justify-center hover:bg-accent transition-colors"
              >
                <Bell className="w-5 h-5 text-muted-foreground" />
                {unreadCount && unreadCount.count > 0 ? (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-destructive" />
                ) : null}
              </button>
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                {user?.name?.charAt(0).toUpperCase() ?? "U"}
              </div>
              <button
                onClick={logout}
                className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-accent transition-colors"
              >
                <LogOut className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 pb-20 lg:pb-0">
          {children}
        </main>

        {/* Mobile Bottom Navigation */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-background/95 backdrop-blur-sm border-t border-border">
          <div className="flex items-center justify-around h-16">
            {navItems.map(item => {
              const Icon = item.icon;
              const active = currentPath === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => setLocation(item.path)}
                  className={`flex flex-col items-center gap-1 px-4 py-2 transition-colors ${
                    active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className={`w-5 h-5 ${item.iconClass}`} />
                  <span className="text-[10px] font-medium">{item.label}</span>
                </button>
              );
            })}
            <button
              onClick={() => setShowNotifications(true)}
              className="relative flex flex-col items-center gap-1 px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Bell className="w-5 h-5" />
              {unreadCount && unreadCount.count > 0 ? (
                <span className="absolute top-1 right-3 w-2 h-2 rounded-full bg-destructive" />
              ) : null}
              <span className="text-[10px] font-medium">{t("notifications")}</span>
            </button>
          </div>
        </nav>
      </div>

      <NotificationsPanel open={showNotifications} onClose={() => setShowNotifications(false)} />
    </div>
  );
}
