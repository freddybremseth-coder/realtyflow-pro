"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { MessageSquare, X, Send, Loader2, User, Bot, Minimize2, Mic, MicOff, Volume2, VolumeX, ShieldCheck } from "lucide-react";
import { useLongformSpeech } from "@/hooks/use-longform-speech";

interface MessageAction {
  label: string;
  href: string;
  description?: string;
}

type GovernedActionType =
  | "prepare_customer_email"
  | "schedule_customer_followup"
  | "add_customer_note"
  | "create_customer_task"
  | "update_customer_email"
  | "update_customer_phone";

type GovernedActionEndpoint = "/api/nexus/actions" | "/api/nexus/contact-field-action";

interface GovernedAction {
  id: string;
  type: GovernedActionType;
  label: string;
  description: string;
  endpoint: GovernedActionEndpoint;
  method: "POST";
  contactId: string;
  contactName: string;
  requestText: string;
  requiresApproval: boolean;
  scheduledFor?: string;
  field?: "email" | "phone";
  fieldValue?: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  actions?: MessageAction[];
  proposedActions?: GovernedAction[];
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
  voiceAutoSend?: boolean;
  voiceSilenceMs?: number;
}

function isGovernedAction(value: unknown): value is GovernedAction {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  const type = candidate.type;
  if (
    type !== "prepare_customer_email"
    && type !== "schedule_customer_followup"
    && type !== "add_customer_note"
    && type !== "create_customer_task"
    && type !== "update_customer_email"
    && type !== "update_customer_phone"
  ) return false;
  if (
    candidate.method !== "POST"
    || typeof candidate.requiresApproval !== "boolean"
    || typeof candidate.id !== "string"
    || typeof candidate.label !== "string"
    || typeof candidate.description !== "string"
    || typeof candidate.contactId !== "string"
    || typeof candidate.contactName !== "string"
    || typeof candidate.requestText !== "string"
  ) return false;

  const contactFieldAction = type === "update_customer_email" || type === "update_customer_phone";
  if (contactFieldAction) {
    if (candidate.endpoint !== "/api/nexus/contact-field-action") return false;
    if (candidate.requiresApproval !== false) return false;
    if (candidate.field !== (type === "update_customer_email" ? "email" : "phone")) return false;
    if (typeof candidate.fieldValue !== "string" || !candidate.fieldValue.trim()) return false;
  } else if (candidate.endpoint !== "/api/nexus/actions") {
    return false;
  }

  if (type === "prepare_customer_email" && candidate.requiresApproval !== true) return false;
  if (type === "schedule_customer_followup") {
    if (candidate.requiresApproval !== false || typeof candidate.scheduledFor !== "string") return false;
  }
  if ((type === "add_customer_note" || type === "create_customer_task") && candidate.requiresApproval !== false) return false;
  if (type === "create_customer_task" && candidate.scheduledFor !== undefined && typeof candidate.scheduledFor !== "string") return false;
  return true;
}

function governedActionSuccessCopy(action: GovernedAction) {
  if (action.type === "prepare_customer_email") {
    return {
      text: "Handlingen er forberedt og venter på godkjenning.",
      navigation: "Kontroller utkastet før eventuell sending.",
    };
  }
  if (action.type === "schedule_customer_followup") {
    return {
      text: "CRM-oppfølgingen er lagret. Ingen melding er sendt.",
      navigation: "Åpne kundekortet og kontroller den planlagte oppfølgingen.",
    };
  }
  if (action.type === "add_customer_note") {
    return {
      text: "Det interne CRM-notatet er lagret. Ingen melding er sendt.",
      navigation: "Åpne kundekortet og kontroller notatet.",
    };
  }
  if (action.type === "create_customer_task") {
    return {
      text: "Den interne kundeoppgaven er opprettet. Ingen melding er sendt.",
      navigation: "Åpne dagens arbeid og kontroller oppgaven.",
    };
  }
  return {
    text: "Kontaktinformasjonen er oppdatert. Ingen melding er sendt.",
    navigation: "Åpne kundekortet og kontroller kontaktinformasjonen.",
  };
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
  voiceAutoSend = false,
  voiceSilenceMs = 9000,
}: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: welcomeMessage, timestamp: new Date().toISOString() },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const [minimized, setMinimized] = useState(false);
  const [unread, setUnread] = useState(0);
  const [speakReplies, setSpeakReplies] = useState(false);
  const [restored, setRestored] = useState(false);
  const [actionBusy, setActionBusy] = useState<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const draftRef = useRef("");
  const messagesRef = useRef(messages);
  const storageKey = `nexus-chat:${brandId}:${apiUrl || "default"}`;

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { draftRef.current = input; }, [input]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw);
        if (Array.isArray(saved?.messages) && saved.messages.length > 0) {
          setMessages(saved.messages.slice(-40));
        }
        if (typeof saved?.sessionId === "string" && saved.sessionId) {
          setSessionId(saved.sessionId);
        }
      }
    } catch {
      // Corrupt local history must never block the assistant.
    } finally {
      setRestored(true);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!restored || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({
        sessionId,
        messages: messages.slice(-40),
      }));
    } catch {
      // Local persistence is a convenience only; chat must still work without it.
    }
  }, [messages, restored, sessionId, storageKey]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (isOpen) scrollToBottom();
  }, [messages, isOpen, scrollToBottom]);

  useEffect(() => {
    if (isOpen && inputRef.current) inputRef.current.focus();
  }, [isOpen]);

  const speak = useCallback((text: string) => {
    if (!speakReplies || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "nb-NO";
    utterance.rate = 0.96;
    window.speechSynthesis.speak(utterance);
  }, [speakReplies]);

  const executeGovernedAction = useCallback(async (action: GovernedAction) => {
    if (actionBusy[action.id] || action.method !== "POST") return;
    if (action.endpoint !== "/api/nexus/actions" && action.endpoint !== "/api/nexus/contact-field-action") return;
    setActionBusy((current) => ({ ...current, [action.id]: true }));
    try {
      const res = await fetch(action.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: action.type,
          proposalId: action.id,
          contactId: action.contactId,
          requestText: action.requestText,
          scheduledFor: action.scheduledFor,
          field: action.field,
          fieldValue: action.fieldValue,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Handlingen kunne ikke utføres.");

      const copy = governedActionSuccessCopy(action);
      const text = String(data.message || copy.text);
      const navigation = data.navigation && typeof data.navigation.label === "string" && typeof data.navigation.href === "string"
        ? [{ label: String(data.navigation.label), href: String(data.navigation.href), description: copy.navigation }]
        : [];
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: text,
        timestamp: new Date().toISOString(),
        actions: navigation,
      }]);
      speak(text);
    } catch (error) {
      const text = `Jeg kunne ikke utføre handlingen: ${error instanceof Error ? error.message : "ukjent feil"}`;
      setMessages((prev) => [...prev, { role: "assistant", content: text, timestamp: new Date().toISOString() }]);
      speak(text);
    } finally {
      setActionBusy((current) => ({ ...current, [action.id]: false }));
    }
  }, [actionBusy, speak]);

  const sendText = useCallback(async (rawText: string) => {
    const userMessage = rawText.trim();
    if (!userMessage || loading) return;

    setInput("");
    draftRef.current = "";
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
          conversation: messagesRef.current.map((m) => ({ role: m.role, content: m.content })),
          brandId,
          sessionId,
          visitorInfo: {
            page: typeof window !== "undefined" ? window.location.href : undefined,
            inputMode: speakReplies ? "voice" : "text",
          },
        }),
      });

      const data = await res.json();
      const responseText = data.response || "Beklager, jeg klarte ikke å svare. Prøv igjen.";
      const actions: MessageAction[] = Array.isArray(data.actions)
        ? data.actions
            .filter((action: unknown) => {
              if (!action || typeof action !== "object") return false;
              const candidate = action as Record<string, unknown>;
              return typeof candidate.label === "string" && typeof candidate.href === "string";
            })
            .slice(0, 5)
            .map((action: Record<string, unknown>) => ({
              label: String(action.label),
              href: String(action.href),
              description: typeof action.description === "string" ? action.description : undefined,
            }))
        : [];
      const proposedActions: GovernedAction[] = Array.isArray(data.proposedActions)
        ? data.proposedActions.filter(isGovernedAction).slice(0, 3)
        : [];
      const assistantMsg: Message = {
        role: "assistant",
        content: responseText,
        timestamp: new Date().toISOString(),
        actions,
        proposedActions,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      speak(responseText);

      if (!isOpen || minimized) setUnread((prev) => prev + 1);
    } catch {
      const text = "Beklager, noe gikk galt. Prøv igjen senere.";
      setMessages((prev) => [...prev, { role: "assistant", content: text, timestamp: new Date().toISOString() }]);
      speak(text);
    } finally {
      setLoading(false);
    }
  }, [apiUrl, brandId, isOpen, loading, minimized, sessionId, speak, speakReplies]);

  const voice = useLongformSpeech({
    language: "nb-NO",
    silenceMs: voiceSilenceMs,
    onFinalText: (text) => {
      setInput((current) => {
        const next = `${current}${current.trim() ? " " : ""}${text}`.trimStart();
        draftRef.current = next;
        return next;
      });
    },
    onSilence: () => {
      if (voiceAutoSend && draftRef.current.trim()) void sendText(draftRef.current);
    },
  });

  const sendMessage = () => void sendText(input);

  const startVoice = () => {
    setIsOpen(true);
    setMinimized(false);
    setSpeakReplies(true);
    voice.start();
  };

  const stopVoice = () => voice.stop();

  const positionClasses = position === "bottom-right" ? "right-4 sm:right-6" : "left-4 sm:left-6";

  return (
    <>
      {!isOpen && (
        <button
          onClick={() => { setIsOpen(true); setUnread(0); }}
          className={`fixed bottom-20 sm:bottom-24 lg:bottom-6 ${positionClasses} z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all hover:scale-110 active:scale-95`}
          style={{ backgroundColor: primaryColor }}
          aria-label="Open chat"
        >
          <MessageSquare className="text-white" size={24} />
          {unread > 0 && <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">{unread}</span>}
        </button>
      )}

      {isOpen && (
        <div
          className={`fixed bottom-20 sm:bottom-24 lg:bottom-6 ${positionClasses} z-50 flex w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-slate-700/50 shadow-2xl sm:w-96`}
          style={{ maxHeight: minimized ? "56px" : "min(640px, calc(100vh - 8rem))" }}
        >
          <div className="flex cursor-pointer select-none items-center justify-between px-4 py-3" style={{ backgroundColor: primaryColor }} onClick={() => { if (minimized) { setMinimized(false); setUnread(0); } }}>
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20"><Bot size={18} className="text-white" /></div>
              <div><h3 className="text-sm font-semibold text-white">{title}</h3>{!minimized && <p className="text-[10px] text-white/70">{subtitle}</p>}</div>
            </div>
            <div className="flex items-center gap-1">
              {!minimized && <button onClick={(e) => { e.stopPropagation(); setSpeakReplies((v) => !v); if (speakReplies && typeof window !== "undefined") window.speechSynthesis?.cancel(); }} className="rounded-lg p-1.5 hover:bg-white/20" title={speakReplies ? "Stopp opplesning" : "Les svar høyt"}>{speakReplies ? <Volume2 size={14} className="text-white" /> : <VolumeX size={14} className="text-white" />}</button>}
              {!minimized && <button onClick={(e) => { e.stopPropagation(); setMinimized(true); }} className="rounded-lg p-1.5 hover:bg-white/20"><Minimize2 size={14} className="text-white" /></button>}
              <button onClick={(e) => { e.stopPropagation(); voice.stop(); setIsOpen(false); setMinimized(false); }} className="rounded-lg p-1.5 hover:bg-white/20"><X size={14} className="text-white" /></button>
            </div>
          </div>

          {!minimized && <>
            <div className="flex-1 space-y-3 overflow-y-auto bg-slate-900 p-4" style={{ minHeight: "300px" }}>
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${msg.role === "user" ? "bg-slate-700" : ""}`} style={msg.role === "assistant" ? { backgroundColor: `${primaryColor}30` } : undefined}>
                    {msg.role === "user" ? <User size={14} className="text-slate-300" /> : <Bot size={14} style={{ color: primaryColor }} />}
                  </div>
                  <div className="max-w-[80%]">
                    <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${msg.role === "user" ? "rounded-tr-sm bg-slate-700 text-white" : "rounded-tl-sm border border-slate-700/50 bg-slate-800 text-slate-200"}`}>{msg.content}</div>
                    {msg.role === "assistant" && msg.proposedActions && msg.proposedActions.length > 0 && (
                      <div className="mt-2 flex flex-col gap-1.5">
                        {msg.proposedActions.map((action) => (
                          <button
                            key={action.id}
                            type="button"
                            disabled={Boolean(actionBusy[action.id])}
                            onClick={() => void executeGovernedAction(action)}
                            className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-left text-xs text-emerald-100 transition-colors hover:border-emerald-400/60 hover:bg-emerald-500/15 disabled:cursor-wait disabled:opacity-60"
                          >
                            <span className="flex items-center gap-1.5 font-semibold"><ShieldCheck size={13} />{actionBusy[action.id] ? "Utfører…" : action.label}</span>
                            <span className="mt-1 block text-[10px] leading-4 text-slate-400">{action.description}</span>
                            <span className="mt-1 block text-[9px] font-semibold uppercase tracking-wide text-emerald-300/80">
                              {action.requiresApproval ? "Krever godkjenning før sending" : "Intern CRM-handling · sender ingenting"}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    {msg.role === "assistant" && msg.actions && msg.actions.length > 0 && (
                      <div className="mt-2 flex flex-col gap-1.5">
                        {msg.actions.map((action) => (
                          <a
                            key={`${action.href}:${action.label}`}
                            href={action.href}
                            className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-xs text-cyan-100 transition-colors hover:border-cyan-400/50 hover:bg-cyan-500/10"
                          >
                            <span className="font-semibold">{action.label}</span>
                            {action.description ? <span className="mt-0.5 block text-[10px] leading-4 text-slate-400">{action.description}</span> : null}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {loading && <div className="flex gap-2"><div className="flex h-7 w-7 items-center justify-center rounded-full" style={{ backgroundColor: `${primaryColor}30` }}><Bot size={14} style={{ color: primaryColor }} /></div><div className="rounded-2xl rounded-tl-sm border border-slate-700 bg-slate-800 px-4 py-3"><Loader2 size={16} className="animate-spin text-slate-400" /></div></div>}
              <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-slate-700 bg-slate-800 p-3">
              {voice.listening && <div className="mb-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200"><b>Lytter…</b> Snakk i ditt tempo. Jeg venter ca. {Math.round(voiceSilenceMs / 1000)} sekunder med stillhet før jeg tolker deg.{voice.interim ? <div className="mt-1 text-cyan-100/70">{voice.interim}</div> : null}</div>}
              {voice.error && <div className="mb-2 text-xs text-rose-400">{voice.error}</div>}
              <div className="flex items-end gap-2">
                <button type="button" onClick={voice.listening ? stopVoice : startVoice} disabled={!voice.supported && !voice.listening} className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${voice.listening ? "bg-rose-600 text-white" : "bg-slate-700 text-slate-200"}`} title={voice.listening ? "Stopp tale" : "Start tale"}>{voice.listening ? <MicOff size={17} /> : <Mic size={17} />}</button>
                <textarea ref={inputRef} rows={2} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} placeholder={placeholder} className="max-h-28 flex-1 resize-none rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition-colors focus:border-cyan-500" disabled={loading} maxLength={8000} />
                <button type="button" onClick={sendMessage} disabled={!input.trim() || loading} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl disabled:opacity-30" style={{ backgroundColor: primaryColor }}>{loading ? <Loader2 size={16} className="animate-spin text-white" /> : <Send size={16} className="text-white" />}</button>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[9px] text-slate-600"><span>{voiceAutoSend ? "Hands-free: sender etter lang pause" : "Tale blir liggende som utkast til du sender"}</span><span>Powered by Nexus · ChatGenius.pro</span></div>
            </div>
          </>}
        </div>
      )}
    </>
  );
}
