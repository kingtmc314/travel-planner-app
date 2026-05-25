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
  destination?: string;
}

export default function AIAssistant({ open, onClose, tripId, destination }: AIAssistantProps) {
  const { t, lang } = useI18n();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: `你好！我是 VoyageAI 旅遊助手 ✈️\n\n我可以幫你：\n• 推薦景點和餐廳\n• 規劃每日行程\n• 提供旅遊小貼士\n• 回答旅遊相關問題\n\n${destination ? `目前行程目的地：**${destination}**\n\n` : ""}有什麼我可以幫你的嗎？`,
    },
  ]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const chat = trpc.ai.chat.useMutation({
    onSuccess: (data) => {
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    },
    onError: () => {
      setMessages((prev) => [...prev, { role: "assistant", content: "抱歉，我暫時無法回應。請稍後再試。" }]);
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
      tripContext: destination ? { destination, startDate: "", endDate: "" } : undefined,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const quickPrompts = destination
    ? [
        `推薦 ${destination} 必去景點`,
        `${destination} 當地美食推薦`,
        `${destination} 旅遊注意事項`,
        `${destination} 交通攻略`,
      ]
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
            AI 旅遊助手
          </SheetTitle>
        </SheetHeader>

        {/* Scrollable messages area — takes all remaining height */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-4 min-h-0">
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
              <p className="text-xs text-muted-foreground mb-2">快速提問：</p>
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
              placeholder="問我任何旅遊問題..."
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
