import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { Globe, Map, Users, Wallet, Sparkles, ArrowRight, Plane } from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "wouter";

const features = [
  { icon: Map, title: "行程時間軸", desc: "每日行程一目了然，輕鬆規劃每個精彩時刻" },
  { icon: Wallet, title: "費用分帳", desc: "自動計算分攤，告別旅後算帳煩惱" },
  { icon: Globe, title: "互動地圖", desc: "景點、餐廳、酒店一鍵標記，全程導覽" },
  { icon: Users, title: "多人協作", desc: "邀請旅伴共同編輯，即時同步最新行程" },
  { icon: Sparkles, title: "AI 行程助手", desc: "智能推薦景點與活動，讓規劃更輕鬆" },
  { icon: Plane, title: "航班住宿管理", desc: "航班資訊與住宿一站式管理，出行無憂" },
];

export default function Home() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && user) setLocation("/dashboard");
  }, [user, loading]);

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
      <div className="relative min-h-screen flex flex-col" style={{background:"linear-gradient(135deg, oklch(0.14 0.04 255) 0%, oklch(0.20 0.06 240) 50%, oklch(0.12 0.05 270) 100%)"}}>
        <div className="absolute inset-0 opacity-20" style={{backgroundImage:"url('https://images.unsplash.com/photo-1488085061387-422e29b40080?w=1920&q=60')",backgroundSize:"cover",backgroundPosition:"center"}} />
        <div className="absolute top-20 right-20 w-96 h-96 rounded-full opacity-10 blur-3xl" style={{background:"oklch(0.55 0.18 255)"}} />
        <div className="absolute bottom-40 left-10 w-72 h-72 rounded-full opacity-10 blur-3xl" style={{background:"oklch(0.65 0.18 45)"}} />

        <nav className="relative z-10 flex items-center justify-between px-6 py-6 max-w-7xl mx-auto w-full">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow-lg" style={{background:"oklch(0.65 0.14 255)"}}>
              <Plane className="w-5 h-5 text-white rotate-45" />
            </div>
            <span className="text-white font-bold text-xl tracking-tight">WanderPlan</span>
          </div>
          <Button onClick={() => window.location.href = getLoginUrl()} variant="outline" className="border-white/30 text-white bg-white/10 hover:bg-white/20">
            登入
          </Button>
        </nav>

        <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-6 py-20">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/20 text-white/80 text-sm mb-8" style={{background:"oklch(1 0 0 / 0.1)"}}>
            <Sparkles className="w-4 h-4" style={{color:"oklch(0.85 0.15 55)"}} />
            AI 驅動的智能旅行規劃
          </div>
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-white leading-tight mb-6 max-w-4xl">
            讓每一次旅行<br />
            <span className="text-transparent bg-clip-text" style={{backgroundImage:"linear-gradient(to right, oklch(0.75 0.15 255), oklch(0.80 0.15 200))"}}>
              都成為傳奇
            </span>
          </h1>
          <p className="text-white/70 text-lg sm:text-xl max-w-2xl mb-10 leading-relaxed">
            與旅伴共同規劃行程、分攤費用、標記景點。<br className="hidden sm:block" />
            AI 助手為你推薦最佳行程，讓旅行規劃輕鬆愉快。
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Button size="lg" onClick={() => window.location.href = getLoginUrl()} className="bg-white font-semibold px-8 py-6 text-base shadow-2xl" style={{color:"oklch(0.15 0.03 255)"}}>
              免費開始規劃 <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </div>
          <div className="mt-16 grid grid-cols-3 gap-8 text-center">
            {[{value:"50+",label:"支援貨幣"},{value:"∞",label:"行程數量"},{value:"即時",label:"多人協作"}].map(s=>(
              <div key={s.label}>
                <div className="text-3xl font-bold text-white">{s.value}</div>
                <div className="text-white/50 text-sm mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="py-24 px-6 bg-background">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-foreground mb-4">一個 App，搞定所有旅行細節</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">從規劃到出發，WanderPlan 陪你走過每一步</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <div key={f.title} className="group p-6 rounded-2xl border border-border bg-card hover:border-primary/30 hover:shadow-lg transition-all duration-300">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/15 transition-colors">
                  <f.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">{f.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="py-24 px-6" style={{background:"linear-gradient(135deg, oklch(0.14 0.04 255), oklch(0.20 0.06 240))"}}>
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-white mb-6">準備好開始你的下一段旅程了嗎？</h2>
          <p className="text-white/70 text-lg mb-10">立即登入，我們已為你準備了一個埃及示範行程，讓你馬上體驗所有功能。</p>
          <Button size="lg" onClick={() => window.location.href = getLoginUrl()} className="bg-white font-semibold px-10 py-6 text-base shadow-2xl" style={{color:"oklch(0.15 0.03 255)"}}>
            立即免費使用 <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
        </div>
      </div>

      <footer className="py-8 px-6 border-t border-border">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Plane className="w-4 h-4 rotate-45" />
            <span className="font-medium text-foreground">WanderPlan</span>
            <span className="text-sm">— 智能旅行規劃平台</span>
          </div>
          <p className="text-muted-foreground text-sm">© 2026 WanderPlan. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
