import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { ArrowRight, BarChart3, Check, Compass, Globe, Link2, Map, Plane, ShieldCheck, Sparkles, Users, Wallet } from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "wouter";
import AppLogo from "@/components/AppLogo";
import { useI18n } from "@/hooks/useI18n";
import { APP_VERSION, TRAVEL_COVER_IMAGE, TRAVEL_COVER_CREDIT } from "@/lib/design";

export default function Home() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();
  const { t, lang, setLang } = useI18n();
  const zh = lang === "zh";
  useEffect(() => { if (!loading && user) setLocation("/dashboard"); }, [user, loading, setLocation]);
  const login = () => { window.location.href = getLoginUrl(); };
  if (loading) return <div className="min-h-screen grid place-items-center"><div className="w-9 h-9 rounded-full border-4 border-primary border-t-transparent animate-spin" /></div>;
  const features = [
    { icon: Compass, title: zh ? "行程，更從容" : "Make room for the journey", desc: zh ? "每日時間線、地圖地點與航班住宿，整理在同一個旅程裡。" : "A daily timeline, places, flights and stays, together in one trip." },
    { icon: BarChart3, title: zh ? "看懂你的旅行" : "See the bigger picture", desc: zh ? "年度旅行趨勢、飛行紀錄及支出分析，以你的真實紀錄呈現。" : "Travel trends, your flight history and spending patterns, from real records." },
    { icon: Link2, title: zh ? "少填一次，多走一步" : "Enter once. Explore more.", desc: zh ? "已有的航班可轉入護照，活動費用可轉為支出，不必重新抄寫。" : "Reuse flight details in your passport and activity costs in your expenses." },
    { icon: Wallet, title: zh ? "多幣別，清楚分開" : "Money, without the guesswork", desc: zh ? "保留原始貨幣，換算與估算清楚標示，預計費用和實際支出分開。" : "Original currencies stay intact. Estimates and actual spending remain separate." },
    { icon: Globe, title: zh ? "每段旅程都留下足跡" : "Keep a journal of everywhere", desc: zh ? "從飛行護照連接旅遊足跡，在地圖上回望已到訪與想去的地方。" : "Connect your flight passport to places visited and destinations still ahead." },
    { icon: Users, title: zh ? "一起計劃，各有權限" : "Plan together, stay in control", desc: zh ? "旅伴共用行程，管理者、編輯者與唯讀角色讓協作更安心。" : "Shared plans with owner, editor and viewer roles, so everyone has their place." },
  ];
  return <div className="min-h-screen overflow-x-hidden">
    <nav className="max-w-7xl mx-auto px-5 sm:px-8 h-24 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3"><AppLogo size={39} /><div><p className="font-bold text-lg tracking-tight">VoyageAI <span className="font-normal text-muted-foreground text-sm">· 旅跡</span></p><p className="text-[9px] text-muted-foreground tracking-[0.18em]">CONNECTED TRAVEL · {APP_VERSION}</p></div></div>
      <div className="flex items-center gap-2 sm:gap-4"><button onClick={() => setLang(zh ? "en" : "zh")} className="h-10 min-w-10 text-xs font-semibold rounded-xl hover:bg-accent" aria-label={zh ? "Switch to English" : "切換中文"}>{zh ? "EN" : "中"}</button><Button onClick={login} className="rounded-xl">{t("login")}<ArrowRight className="w-4 h-4" /></Button></div>
    </nav>
    <section className="max-w-7xl mx-auto px-5 sm:px-8 pb-14 lg:pb-20 grid lg:grid-cols-[1.05fr_1fr] gap-10 lg:gap-16 items-center">
      <div className="pt-6 lg:py-12">
        <p className="voyage-eyebrow flex items-center gap-2 mb-7"><span className="w-6 h-px bg-primary" />{zh ? "讓旅行，回歸旅行" : "A little less planning. A little more living."}</p>
        <h1 className="text-[42px] sm:text-6xl lg:text-[68px] leading-[1.16] font-semibold tracking-tight">{zh ? <>把旅程連起來，<br /><span className="text-primary">把世界走出去。</span></> : <>All your journeys.<br /><span className="text-primary voyage-display italic">One beautiful place.</span></>}</h1>
        <p className="text-muted-foreground text-base sm:text-lg leading-relaxed max-w-lg mt-6">{zh ? "行程、支出、航班與旅遊足跡，不再各自分散。少一點重複輸入，多一點發現世界的時間。" : "Your plans, expenses, flights and travel memories, finally connected. Less repeat entry. More time to discover."}</p>
        <div className="flex flex-col sm:flex-row gap-3 mt-8"><Button size="lg" onClick={login} className="rounded-2xl h-12 px-6">{zh ? "開始我的旅行日誌" : "Start my travel journal"}<ArrowRight className="w-4 h-4" /></Button><Button size="lg" variant="outline" onClick={() => setLocation("/dashboard")} className="rounded-2xl h-12 px-6 bg-white">{t("continueAsGuest")}</Button></div>
        <p className="text-xs text-muted-foreground mt-4">{zh ? "訪客可先整理行程資料，登入後再使用完整功能。" : "Try trip planning as a guest. Sign in for all connected features."}</p>
        <div className="flex flex-wrap gap-x-5 gap-y-2 mt-8 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-primary" />{zh ? "保留你的既有紀錄" : "Keep your existing records"}</span><span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-primary" />{zh ? "香港 UTC+8 日期" : "Hong Kong UTC+8 dates"}</span></div>
      </div>
      <div className="relative">
        <div className="relative aspect-[4/4.4] sm:aspect-[5/5] overflow-hidden rounded-[32px] bg-[#183d37]">
          <img src={TRAVEL_COVER_IMAGE} alt={zh ? "紐西蘭綠色山谷與湖泊" : "A green mountain valley and lake in New Zealand"} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0b302ddd] via-transparent to-[#14382b22]" />
          <div className="absolute top-5 left-5 flex items-center gap-2 rounded-full bg-white/90 backdrop-blur px-3 py-2 text-[10px] text-[#254f44] font-semibold tracking-wider"><Compass className="w-3.5 h-3.5" />{zh ? "下一段旅程，由你決定" : "THE NEXT CHAPTER IS YOURS"}</div>
          <div className="absolute bottom-8 left-6 right-6 text-white"><p className="text-xs tracking-[0.18em] text-white/65 mb-2">EXPLORE · CONNECT · REMEMBER</p><h2 className="voyage-display text-4xl sm:text-5xl">A world worth<br /><em>remembering.</em></h2></div>
          <a href={TRAVEL_COVER_CREDIT.url} target="_blank" rel="noreferrer" className="absolute bottom-2 right-3 text-[8px] text-white/60 hover:text-white">Photo: {TRAVEL_COVER_CREDIT.name}</a>
        </div>
        <div className="absolute bottom-5 sm:bottom-10 -left-2 sm:-left-6 rounded-2xl bg-white shadow-xl border border-border py-3.5 px-4 flex items-center gap-3"><div className="w-9 h-9 rounded-xl bg-[#e5f1ea] grid place-items-center"><Link2 className="w-4 h-4 text-primary" /></div><div><p className="text-xs font-semibold">{zh ? "旅程細節，不用重填" : "Your details, already here"}</p><p className="text-[10px] text-muted-foreground mt-1">{zh ? "航班 → 護照 → 旅遊足跡" : "Flights → Passport → Places"}</p></div></div>
      </div>
    </section>
    <section className="border-y border-border bg-[#edf3ee] py-7"><div className="max-w-7xl mx-auto px-5 sm:px-8 flex flex-wrap gap-5 sm:gap-10 justify-between text-sm font-medium text-[#476c5c]">{[{icon:Map,label:zh ? "日程與地圖" : "Plans & places"},{icon:Wallet,label:zh ? "支出與分析" : "Spending & insights"},{icon:Plane,label:zh ? "航班與護照" : "Flights & passport"},{icon:ShieldCheck,label:zh ? "資料保留與連接" : "Records & connections"}].map(item=><span key={item.label} className="flex items-center gap-2"><item.icon className="w-4 h-4" />{item.label}</span>)}</div></section>
    <section className="max-w-7xl mx-auto px-5 sm:px-8 py-16 sm:py-24"><div className="max-w-2xl mb-9"><p className="voyage-eyebrow mb-3">BUILT FOR YOUR JOURNEY</p><h2 className="font-semibold text-3xl sm:text-4xl">{zh ? "旅行的細節，終於在一起。" : "Every detail. Finally, together."}</h2><p className="text-muted-foreground mt-4 leading-relaxed">{zh ? "不是再多一份表格，而是一個能沿用已有資料、看懂每段旅程的旅行空間。" : "Not another spreadsheet. A travel space that makes the most of what you already know."}</p></div><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{features.map(f=><article key={f.title} className="voyage-panel"><div className="w-11 h-11 rounded-xl bg-secondary text-primary grid place-items-center mb-5"><f.icon className="w-5 h-5" /></div><h3 className="font-semibold text-base">{f.title}</h3><p className="text-sm text-muted-foreground leading-relaxed mt-2">{f.desc}</p></article>)}</div></section>
    <section className="max-w-7xl mx-auto px-5 sm:px-8 pb-16"><div className="voyage-hero flex flex-col sm:flex-row sm:items-center justify-between gap-7"><div><p className="text-[10px] tracking-[0.16em] text-white/60 mb-3">YOUR NEXT CHAPTER</p><h2 className="text-2xl sm:text-3xl font-semibold">{zh ? "準備好，寫下下一段旅程。" : "Make your next chapter a good one."}</h2><p className="text-white/65 text-sm mt-3">{zh ? "既有紀錄繼續保留，新的旅程從這裡開始。" : "Your old memories stay. New journeys start here."}</p></div><Button onClick={login} size="lg" className="bg-[#b9ebdc] text-[#183d37] hover:bg-[#d2f5e8] rounded-xl shrink-0">{t("login")}<ArrowRight className="w-4 h-4" /></Button></div></section>
    <footer className="max-w-7xl mx-auto px-5 sm:px-8 pb-8 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground"><span>VoyageAI · 旅跡 · {APP_VERSION}</span><span>{zh ? "記錄每段旅程 · 香港時間 UTC+8" : "Make every journey count · Hong Kong UTC+8"}</span></footer>
  </div>;
}
