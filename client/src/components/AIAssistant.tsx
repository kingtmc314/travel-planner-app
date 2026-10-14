import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { useI18n } from "@/hooks/useI18n";
import { Sparkles, Send, Bot, User, Loader2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AIAssistantProps {
  open: boolean;
  onClose: () => void;
  tripId: number;
  destination?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  baseCurrency?: string | null;
}

export default function AIAssistant({ open, onClose, tripId, destination, startDate, endDate, baseCurrency }: AIAssistantProps) {
  const { t, lang } = useI18n();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: t("aiGreeting", destination),
    },
  ]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const chat = trpc.ai.chat.useMutation({
    onSuccess: (data) => {
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    },
    onError: () => {
      setMessages((prev) => [...prev, { role: "assistant", content: lang === "zh" ? "抱歉，我暫時無法回應。請稍後再試。" : "Sorry, I cannot respond right now. Please try again shortly." }]);
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || chat.isPending) return;
    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    chat.mutate({
      messages: [...messages, { role: "user" as const, content: userMsg }],
      tripContext: destination ? { destination, startDate: startDate ?? "", endDate: endDate ?? "" } : undefined,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const quickPrompts = destination
    ? lang === "zh"
      ? [`推薦 ${destination} 必去景點`, `${destination} 當地美食推薦`, `${destination} 旅遊注意事項`, `${destination} 交通攻略`]
      : [`What should I see in ${destination}?`, `What local food should I try in ${destination}?`, `What should I know before visiting ${destination}?`, `How should I get around ${destination}?`]
    : [];

  return (
    <Sheet open={open} onOpenChange={onClose}>
      {/*
        Key mobile fix:
        - SheetContent uses h-full (inset-y-0) from sheet.tsx, which is correct.
        - We use `flex flex-col` with an explicit `overflow-hidden` wrapper so the
          inner scroll area gets a bounded height and doesn't overflow the viewport.
        - Quick prompts are moved INSIDE the scrollable messages div so they never
          push the input bar off-screen on small devices.
      */}
      <SheetContent
        side="right"
        className="w-full sm:max-w-md p-0 flex flex-col overflow-hidden"
      >
        {/* Header — fixed height */}
        <SheetHeader className="px-5 py-3.5 border-b border-border shrink-0">
          <SheetTitle className="flex items-center gap-2 text-base">
            <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-purple-600" />
            </div>
            {t("aiAssistantName")}
          </SheetTitle>
        </SheetHeader>

        {/* Scrollable messages area — takes all remaining height */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-4 min-h-0">
          {destination && (
            <div className="rounded-xl border border-primary/15 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{destination}</span>
              {startDate && endDate ? <span> · {startDate} – {endDate}</span> : null}
              {baseCurrency ? <span> · {baseCurrency}</span> : null}
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  msg.role === "assistant" ? "bg-purple-100" : "bg-primary/10"
                }`}
              >
                {msg.role === "assistant" ? (
                  <Bot className="w-4 h-4 text-purple-600" />
                ) : (
                  <User className="w-4 h-4 text-primary" />
                )}
              </div>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-line ${
                  msg.role === "assistant"
                    ? "bg-muted text-foreground rounded-tl-sm"
                    : "bg-primary text-primary-foreground rounded-tr-sm"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {chat.isPending && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-purple-600" />
              </div>
              <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}

          {/* Quick prompts — inside scroll area so they never push input off-screen */}
          {quickPrompts.length > 0 && messages.length <= 1 && (
            <div className="pt-1">
              <p className="text-xs text-muted-foreground mb-2">{lang === "zh" ? "快速提問：" : "Quick prompts:"}</p>
              <div className="flex flex-col gap-2">
                {quickPrompts.map((p) => (
                  <button
                    key={p}
                    onClick={() => setInput(p)}
                    className="w-full text-left px-3 py-2.5 rounded-xl border border-border text-xs text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 active:scale-[0.98] transition-all"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input bar — fixed at bottom, never scrolls away */}
        <div className="shrink-0 p-4 border-t border-border">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={lang === "zh" ? "問我任何旅遊問題..." : "Ask any travel question..."}
              className="flex-1"
              disabled={chat.isPending}
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!input.trim() || chat.isPending}
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
