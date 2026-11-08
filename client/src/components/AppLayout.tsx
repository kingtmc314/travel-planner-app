import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { BarChart3, Bell, ChevronRight, Compass, Globe, LogOut, Plane, RefreshCw, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import NotificationsPanel from "@/components/NotificationsPanel";
import AppLogo from "@/components/AppLogo";
import { useI18n } from "@/hooks/useI18n";
import { APP_VERSION } from "@/lib/design";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [currentPath, setLocation] = useLocation();
  const [showNotifications, setShowNotifications] = useState(false);
  const { t, lang, setLang } = useI18n();
  const { data: unreadCount } = trpc.notifications.unreadCount.useQuery(undefined, { enabled: !!user, refetchInterval: 30000 });
  const navItems = [
    { path: "/dashboard", label: t("myTrips"), short: lang === "zh" ? "旅程" : "Trips", icon: Compass },
    { path: "/analytics", label: lang === "zh" ? "旅行分析" : "Travel insights", short: lang === "zh" ? "分析" : "Insights", icon: BarChart3 },
    { path: "/travel-history", label: t("travelHistory"), short: lang === "zh" ? "足跡" : "Places", icon: Globe },
    { path: "/flight-passport", label: t("flightPassport"), short: lang === "zh" ? "飛行" : "Flights", icon: Plane },
    { path: "/sync", label: lang === "zh" ? "資料連接中心" : "Connections", short: lang === "zh" ? "連接" : "Connect", icon: RefreshCw },
  ];
  const activeLabel = navItems.find(item => currentPath === item.path)?.label ?? "VoyageAI";
  const languageButton = (dark = false) => (
    <button onClick={() => setLang(lang === "zh" ? "en" : "zh")} className={`h-9 min-w-9 px-2.5 rounded-xl text-xs font-semibold border transition-colors ${dark ? "border-white/15 text-white/80 hover:bg-white/10" : "border-border bg-card hover:bg-accent"}`} aria-label={lang === "zh" ? "Switch to English" : "切換中文"}>{lang === "zh" ? "EN" : "中"}</button>
  );
  const notificationButton = (dark = false) => (
    <button onClick={() => setShowNotifications(true)} className={`relative h-10 w-10 grid place-items-center rounded-xl transition-colors ${dark ? "hover:bg-white/10 text-white/70" : "bg-card border border-border hover:bg-accent text-muted-foreground"}`} aria-label={t("notifications")}>
      <Bell className="w-[18px] h-[18px]" />
      {!!unreadCount?.count && <span className="absolute top-1 right-1 rounded-full bg-destructive text-white min-w-4 h-4 text-[9px] grid place-items-center px-0.5">{unreadCount.count > 9 ? "9+" : unreadCount.count}</span>}
    </button>
  );

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="hidden lg:flex flex-col w-[244px] shrink-0 sticky top-0 h-screen text-sidebar-foreground bg-sidebar border-r border-sidebar-border">
        <button onClick={() => setLocation("/dashboard")} className="flex items-center gap-3 text-left px-6 h-24" aria-label="VoyageAI">
          <AppLogo size={39} />
          <div><span className="font-bold text-lg tracking-tight text-white">VoyageAI</span><p className="text-[10px] tracking-[0.16em] text-white/45 mt-0.5">{lang === "zh" ? "旅跡 · 你的旅行日誌" : "YOUR TRAVEL JOURNAL"}</p></div>
        </button>
        <p className="px-6 mb-3 text-[10px] tracking-[0.18em] uppercase text-white/35">{lang === "zh" ? "我的旅行空間" : "Your workspace"}</p>
        <nav className="px-3 space-y-1.5">
          {navItems.map(item => { const Icon = item.icon; const active = currentPath === item.path; return (
            <button key={item.path} onClick={() => setLocation(item.path)} aria-current={active ? "page" : undefined} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm font-medium transition-colors ${active ? "bg-[#b9ebdc] text-[#123d38] shadow-sm" : "text-white/60 hover:text-white hover:bg-white/5"}`}>
              <Icon className="w-[18px] h-[18px] shrink-0" /><span className="flex-1 text-left">{item.label}</span>{active && <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          ); })}
        </nav>
        <div className="mx-5 mt-9 p-4 border border-white/10 rounded-2xl bg-white/[0.035]">
          <ShieldCheck className="w-5 h-5 text-[#a6ddcc] mb-2.5" />
          <p className="text-xs font-semibold text-white/85">{lang === "zh" ? "資料連接，紀錄保留" : "Connected. Not replaced."}</p>
          <p className="text-[11px] leading-relaxed text-white/45 mt-1.5">{lang === "zh" ? "沿用你的舊資料，將旅行細節連接起來，毋須再填一次。" : "Keep your records and reuse the details across your journey."}</p>
        </div>
        <div className="mt-auto px-5 py-5 border-t border-white/10 space-y-4">
          <div className="flex justify-between items-center"><span className="text-[11px] font-mono text-white/40">{APP_VERSION} · HKT (UTC+8)</span>{languageButton(true)}</div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/10 grid place-items-center text-[#b9ebdc] font-semibold shrink-0">{user?.name?.charAt(0).toUpperCase() ?? "V"}</div>
            <div className="flex-1 min-w-0"><p className="text-xs font-semibold text-white truncate">{user?.name ?? (lang === "zh" ? "旅人" : "Traveller")}</p><p className="text-[10px] text-white/40 mt-0.5">{lang === "zh" ? "好好記錄每一段旅程" : "Make every journey count"}</p></div>
            <button onClick={logout} aria-label={t("logout")} className="h-9 w-9 grid place-items-center rounded-xl hover:bg-white/10 text-white/50"><LogOut className="w-4 h-4" /></button>
          </div>
        </div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 glass border-b border-border/80">
          <div className="h-[72px] px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3">
            <div className="lg:hidden flex items-center gap-2.5"><AppLogo size={33} /><div><p className="font-bold text-sm tracking-tight">VoyageAI</p><p className="text-[9px] text-muted-foreground tracking-widest mt-0.5">旅跡 · {APP_VERSION}</p></div></div>
            <div className="hidden lg:flex items-center gap-2 text-xs text-muted-foreground"><Compass className="w-4 h-4" /><span>VoyageAI</span><ChevronRight className="w-3 h-3" /><span className="font-medium text-foreground">{activeLabel}</span></div>
            <div className="flex items-center gap-2 sm:gap-3"><span className="hidden sm:inline text-[10px] tracking-wider text-muted-foreground">HONG KONG · UTC+8</span><span className="lg:hidden">{languageButton()}</span>{notificationButton()}</div>
          </div>
        </header>
        <main className="flex-1 pb-24 lg:pb-8 min-w-0">{children}</main>
        <nav aria-label={lang === "zh" ? "主要導覽" : "Main navigation"} className="lg:hidden fixed bottom-0 inset-x-0 z-40 glass border-t border-border" style={{paddingBottom:"env(safe-area-inset-bottom)"}}>
          <div className="flex h-[68px] px-2 gap-1 items-center">
            {navItems.map(item => { const Icon = item.icon; const active = currentPath === item.path; return <button key={item.path} onClick={() => setLocation(item.path)} aria-label={item.label} aria-current={active ? "page" : undefined} className={`flex-1 min-w-0 flex flex-col items-center justify-center gap-1 h-14 rounded-2xl transition-colors ${active ? "bg-primary/8 text-primary" : "text-muted-foreground"}`}><Icon className="w-5 h-5" /><span className="text-[10px] font-semibold truncate max-w-full">{item.short}</span></button>; })}
          </div>
        </nav>
      </div>
      <NotificationsPanel open={showNotifications} onClose={() => setShowNotifications(false)} />
    </div>
  );
}
