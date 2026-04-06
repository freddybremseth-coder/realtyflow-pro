"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { MessageSquare, X, Send, Loader2, User, Bot, Minimize2 } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface ChatWidgetProps {
  brandId?: string;
  apiUrl?: string;
  position?: "bottom-right" | "bottom-left";
  primaryColor?: string;
  title?: string;
  subtitle?: string;
  placeholder?: string;
  welcomeMessage?: string;
}

export function ChatWidget({
  brandId = "general",
  apiUrl,
  position = "bottom-right",
  primaryColor = "#0891b2",
  title = "Chat med oss",
  subtitle = "Vi svarer vanligvis umiddelbart",
  placeholder = "Skriv en melding...",
  welcomeMessage = "Hei! Hvordan kan jeg hjelpe deg i dag?",
}: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: welcomeMessage, timestamp: new Date().toISOString() },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(() => crypto.randomUUID());
  const [minimized, setMinimized] = useState(false);
  const [unread, setUnread] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (isOpen) scrollToBottom();
  }, [messages, isOpen, scrollToBottom]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput("");
    const newMsg: Message = { role: "user", content: userMessage, timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, newMsg]);
    setLoading(true);

    try {
      const endpoint = apiUrl || "/api/chatbot";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          conversation: messages.map((m) => ({ role: m.role, content: m.content })),
          brandId,
          sessionId,
          visitorInfo: {
            page: typeof window !== "undefined" ? window.location.href : undefined,
          },
        }),
      });

      const data = await res.json();
      const assistantMsg: Message = {
        role: "assistant",
        content: data.response || "Beklager, jeg klarte ikke å svare. Prøv igjen.",
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      if (!isOpen || minimized) {
        setUnread((prev) => prev + 1);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Beklager, noe gikk galt. Prøv igjen senere.", timestamp: new Date().toISOString() },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const positionClasses = position === "bottom-right" ? "right-4 sm:right-6" : "left-4 sm:left-6";

  return (
    <>
      {/* Chat bubble button */}
      {!isOpen && (
        <button
          onClick={() => { setIsOpen(true); setUnread(0); }}
          className={`fixed bottom-4 sm:bottom-6 ${positionClasses} z-50 flex items-center justify-center w-14 h-14 rounded-full shadow-lg transition-all hover:scale-110 active:scale-95`}
          style={{ backgroundColor: primaryColor }}
          aria-label="Open chat"
        >
          <MessageSquare className="text-white" size={24} />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
              {unread}
            </span>
          )}
        </button>
      )}

      {/* Chat window */}
      {isOpen && (
        <div
          className={`fixed bottom-4 sm:bottom-6 ${positionClasses} z-50 w-[calc(100vw-2rem)] sm:w-96 flex flex-col shadow-2xl rounded-2xl overflow-hidden border border-slate-700/50`}
          style={{ maxHeight: minimized ? "56px" : "min(600px, calc(100vh - 6rem))" }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
            style={{ backgroundColor: primaryColor }}
            onClick={() => { if (minimized) { setMinimized(false); setUnread(0); } }}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <Bot size={18} className="text-white" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">{title}</h3>
                {!minimized && <p className="text-[10px] text-white/70">{subtitle}</p>}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {!minimized && (
                <button
                  onClick={(e) => { e.stopPropagation(); setMinimized(true); }}
                  className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
                >
                  <Minimize2 size={14} className="text-white" />
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); setIsOpen(false); setMinimized(false); }}
                className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
              >
                <X size={14} className="text-white" />
              </button>
            </div>
          </div>

          {/* Messages */}
          {!minimized && (
            <>
              <div className="flex-1 overflow-y-auto bg-slate-900 p-4 space-y-3" style={{ minHeight: "300px" }}>
                {messages.map((msg, i) => (
                  <div key={i} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${msg.role === "user" ? "bg-slate-700" : ""}`}
                      style={msg.role === "assistant" ? { backgroundColor: `${primaryColor}30` } : undefined}>
                      {msg.role === "user" ? (
                        <User size={14} className="text-slate-300" />
                      ) : (
                        <Bot size={14} style={{ color: primaryColor }} />
                      )}
                    </div>
                    <div
                      className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                        msg.role === "user"
                          ? "bg-slate-700 text-white rounded-tr-sm"
                          : "bg-slate-800 text-slate-200 rounded-tl-sm border border-slate-700/50"
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex gap-2">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: `${primaryColor}30` }}>
                      <Bot size={14} style={{ color: primaryColor }} />
                    </div>
                    <div className="bg-slate-800 border border-slate-700/50 rounded-2xl rounded-tl-sm px-4 py-3">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                        <div className="w-2 h-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                        <div className="w-2 h-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="bg-slate-800 border-t border-slate-700 p-3">
                <form
                  onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
                  className="flex items-center gap-2"
                >
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={placeholder}
                    className="flex-1 bg-slate-900 border border-slate-600 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
                    disabled={loading}
                    maxLength={2000}
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || loading}
                    className="w-10 h-10 rounded-xl flex items-center justify-center transition-all disabled:opacity-30 hover:opacity-90 active:scale-95"
                    style={{ backgroundColor: primaryColor }}
                  >
                    {loading ? (
                      <Loader2 size={16} className="text-white animate-spin" />
                    ) : (
                      <Send size={16} className="text-white" />
                    )}
                  </button>
                </form>
                <p className="text-[9px] text-slate-600 text-center mt-1.5">Powered by ChatGenius.pro</p>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
