import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { Globe, Map, Users, Wallet, Sparkles, ArrowRight } from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "wouter";
import AppLogo from "@/components/AppLogo";
import { useI18n } from "@/hooks/useI18n";

export default function Home() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();
  const { t, lang, setLang } = useI18n();

  useEffect(() => {
    if (!loading && user) setLocation("/dashboard");
  }, [user, loading]);

  const features = [
    { icon: Map, title: t("featureItinerary"), desc: t("featureItineraryDesc") },
    { icon: Wallet, title: t("featureExpense"), desc: t("featureExpenseDesc") },
    { icon: Globe, title: t("featureMap"), desc: t("featureMapDesc") },
    { icon: Users, title: t("featureCollab"), desc: t("featureCollabDesc") },
    { icon: Sparkles, title: t("featureAI"), desc: t("featureAIDesc") },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-10 h-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Hero */}
      <div
        className="relative min-h-screen flex flex-col"
        style={{ background: "linear-gradient(135deg, oklch(0.10 0.06 280) 0%, oklch(0.16 0.08 255) 45%, oklch(0.12 0.07 230) 100%)" }}
      >
        {/* Background image overlay */}
        <div
          className="absolute inset-0 opacity-15"
          style={{
            backgroundImage: "url('https://images.unsplash.com/photo-1488085061387-422e29b40080?w=1920&q=60')",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        {/* Ambient glows */}
        <div className="absolute top-16 right-16 w-80 h-80 rounded-full opacity-20 blur-3xl" style={{ background: "oklch(0.55 0.22 280)" }} />
        <div className="absolute bottom-32 left-8 w-64 h-64 rounded-full opacity-15 blur-3xl" style={{ background: "oklch(0.65 0.20 45)" }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-5 blur-3xl" style={{ background: "oklch(0.60 0.18 200)" }} />

        {/* Nav */}
        <nav className="relative z-10 flex items-center justify-between px-6 py-5 max-w-7xl mx-auto w-full">
          <div className="flex items-center gap-3">
            <AppLogo size={38} />
            <div className="flex flex-col leading-none">
              <span className="text-white font-extrabold text-lg tracking-tight">VoyageAI</span>
              <span className="text-white/50 text-[10px] tracking-[0.2em] uppercase">旅跡</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Language toggle */}
            <button
              onClick={() => setLang(lang === "zh" ? "en" : "zh")}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/25 text-white/70 hover:text-white hover:border-white/50 transition-colors"
            >
              {lang === "zh" ? "EN" : "中文"}
            </button>
            <Button
              onClick={() => window.location.href = getLoginUrl()}
              variant="outline"
              className="border-white/30 text-white bg-white/10 hover:bg-white/20"
            >
              {t("login")}
            </Button>
          </div>
        </nav>

        {/* Hero content */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-6 py-20">
          {/* Badge */}
          <div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/20 text-white/80 text-sm mb-8"
            style={{ background: "oklch(1 0 0 / 0.08)" }}
          >
            <Sparkles className="w-4 h-4" style={{ color: "oklch(0.85 0.18 55)" }} />
            {t("appTagline")}
          </div>

          {/* Headline */}
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold text-white leading-tight mb-6 max-w-4xl">
            {t("heroTitle1")}<br />
            <span
              className="text-transparent bg-clip-text"
              style={{ backgroundImage: "linear-gradient(to right, oklch(0.80 0.18 280), oklch(0.78 0.16 200), oklch(0.82 0.20 160))" }}
            >
              {t("heroTitle2")}
            </span>
          </h1>

          <p className="text-white/65 text-lg sm:text-xl max-w-2xl mb-10 leading-relaxed whitespace-pre-line">
            {t("appDesc")}
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-4 items-center">
            <Button
              size="lg"
              onClick={() => window.location.href = getLoginUrl()}
              className="font-bold px-8 py-6 text-base shadow-2xl"
              style={{ background: "linear-gradient(135deg, #7c3aed, #2563eb)", color: "white" }}
            >
              {t("startFree")} <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => setLocation("/dashboard")}
              className="border-white/30 text-white bg-white/10 hover:bg-white/20 px-8 py-6 text-base"
            >
              {t("continueAsGuest")}
            </Button>
          </div>

          {/* Stats */}
          <div className="mt-16 grid grid-cols-3 gap-8 sm:gap-16 text-center">
            {[
              { value: t("stats50"), label: t("statsLabel50") },
              { value: t("statsInf"), label: t("statsLabelInf") },
              { value: t("statsRealtime"), label: t("statsLabelRealtime") },
            ].map(s => (
              <div key={s.label}>
                <div className="text-3xl font-extrabold text-white">{s.value}</div>
                <div className="text-white/45 text-sm mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="py-24 px-6 bg-background">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-foreground mb-4">
              {lang === "zh" ? "一個 App，搞定所有旅行細節" : "One App. Every Travel Detail."}
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">{t("footerTagline")}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <div
                key={f.title}
                className="group p-6 rounded-2xl border border-border bg-card hover:border-primary/40 hover:shadow-xl transition-all duration-300"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                  <f.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">{f.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA section */}
      <div
        className="py-24 px-6"
        style={{ background: "linear-gradient(135deg, oklch(0.12 0.06 280), oklch(0.18 0.08 255))" }}
      >
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-white mb-6">
            {lang === "zh" ? "準備好開始你的下一段旅程了嗎？" : "Ready for your next adventure?"}
          </h2>
          <p className="text-white/65 text-lg mb-10">
            {lang === "zh"
              ? "登入後即可開始規劃你的第一次旅行，記錄行程、費用與旅遊足跡。"
              : "Sign in to start planning, track expenses, and record every journey."}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              size="lg"
              onClick={() => window.location.href = getLoginUrl()}
              className="font-bold px-10 py-6 text-base shadow-2xl"
              style={{ background: "linear-gradient(135deg, #7c3aed, #2563eb)", color: "white" }}
            >
              {lang === "zh" ? "立即免費使用" : "Get Started Free"} <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => setLocation("/dashboard")}
              className="border-white/30 text-white bg-white/10 hover:bg-white/20 px-10 py-6 text-base"
            >
              {t("continueAsGuest")}
            </Button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-border">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-muted-foreground">
            <AppLogo size={24} />
            <span className="font-bold text-foreground">VoyageAI · 旅跡</span>
            <span className="text-sm hidden sm:inline">— {lang === "zh" ? "智能旅行規劃平台" : "Smart Travel Planning"}</span>
          </div>
          <p className="text-muted-foreground text-sm">{t("copyright")}</p>
        </div>
      </footer>
    </div>
  );
}
