"use client";

/**
 * The AI receptionist, live on the demo. Floating chat (bottom-left, the
 * design switcher owns bottom-right) answering from the company's own
 * content via /api/public/demo-chat — the Standard package's main selling
 * point, demonstrated instead of mocked.
 */

import { FormEvent, useEffect, useRef, useState } from "react";
import { Bot, Loader2, MessageCircle, Send, X } from "lucide-react";

type ChatMessage = { role: "user" | "assistant"; content: string };

type DemoChatWidgetProps = {
  token: string;
  companyName: string;
  accentColor: string;
  accentTextColor: string;
};

export function DemoChatWidget({ token, companyName, accentColor, accentTextColor }: DemoChatWidgetProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const question = input.trim();
    if (!question || sending) return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: question }];
    setMessages(nextMessages);
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/public/demo-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, messages: nextMessages }),
      });
      const data = await res.json();
      const reply = res.ok && data.reply ? data.reply : data.error || "Beklager, prøv igjen — eller bruk kontaktskjemaet.";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Beklager, jeg mistet nettet et øyeblikk. Prøv igjen!" }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed bottom-4 left-4 z-40">
      {open ? (
        <div className="flex h-[440px] w-[320px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:w-[360px]">
          <div className="flex items-center justify-between px-4 py-3" style={{ backgroundColor: accentColor, color: accentTextColor }}>
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              <div>
                <p className="text-sm font-bold leading-tight">{companyName}</p>
                <p className="text-[10px] opacity-80">AI-resepsjonist · svarer døgnet rundt</p>
              </div>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded p-1 opacity-80 hover:opacity-100">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto bg-slate-50 p-3">
            <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-sm text-slate-800 shadow-sm">
              Hei! 👋 Jeg kan svare på spørsmål om tjenester, priser og kontakt hos {companyName}. Hva lurer du på?
            </div>
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={
                  message.role === "user"
                    ? "ml-auto max-w-[85%] rounded-2xl rounded-tr-sm px-3 py-2 text-sm shadow-sm"
                    : "max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-sm text-slate-800 shadow-sm"
                }
                style={message.role === "user" ? { backgroundColor: accentColor, color: accentTextColor } : undefined}
              >
                {message.content}
              </div>
            ))}
            {sending && (
              <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-sm text-slate-500 shadow-sm">
                <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> skriver…
              </div>
            )}
          </div>

          <form onSubmit={send} className="flex items-center gap-2 border-t border-slate-200 bg-white p-2.5">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Skriv et spørsmål…"
              className="h-10 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-500"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl disabled:opacity-50"
              style={{ backgroundColor: accentColor, color: accentTextColor }}
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-full px-4 py-3 text-sm font-bold shadow-2xl transition-transform hover:scale-105"
          style={{ backgroundColor: accentColor, color: accentTextColor }}
        >
          <MessageCircle className="h-5 w-5" />
          Spør oss
        </button>
      )}
    </div>
  );
}
