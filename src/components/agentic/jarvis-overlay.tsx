"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, CornerDownLeft, Cpu, Loader2, Mic, MicOff, ShieldAlert, Sparkles, X } from "lucide-react";
import { useLongformSpeech } from "@/hooks/use-longform-speech";

interface AgentCapability {
  name?: string;
  role?: string;
  description?: string;
}

interface ExecResult {
  status?: string;
  output?: string;
  error?: string;
  results?: Array<{ agent?: string; status?: string; output?: string }>;
}

interface TraceLine {
  ts: string;
  kind: "prompt" | "route" | "result" | "error" | "note";
  text: string;
}

const AGENT_HINTS: { key: string; label: string }[] = [
  { key: "auto", label: "Auto (orchestrator velger)" },
  { key: "ceo", label: "CEO" },
  { key: "sales", label: "Sales" },
  { key: "marketing", label: "Marketing" },
  { key: "seo", label: "SEO" },
  { key: "business", label: "Business" },
  { key: "scheduling", label: "Scheduling" },
];

const nowStr = () => new Date().toLocaleTimeString("nb-NO", { hour12: false });

export function JarvisOverlay() {
  const [open, setOpen] = useState(false);
  const [agent, setAgent] = useState("auto");
  const [command, setCommand] = useState("");
  const [busy, setBusy] = useState(false);
  const [trace, setTrace] = useState<TraceLine[]>([]);
  const [agents, setAgents] = useState<AgentCapability[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const voice = useLongformSpeech({
    language: "nb-NO",
    silenceMs: 10000,
    onFinalText: (text) => setCommand((current) => `${current}${current.trim() ? " " : ""}${text}`.trimStart()),
    // Jarvis may execute actions, so a long pause ends dictation but never
    // executes automatically. The user must explicitly press Kjør.
    onSilence: () => undefined,
  });

  const push = useCallback((kind: TraceLine["kind"], text: string) => {
    setTrace((prev) => [...prev, { ts: nowStr(), kind, text }].slice(-60));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("jarvis:open", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("jarvis:open", onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 40);
      if (agents.length === 0) {
        fetch("/api/agents")
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            if (d && Array.isArray(d.agents)) setAgents(d.agents as AgentCapability[]);
          })
          .catch(() => {});
      }
    }
  }, [open, agents.length]);

  const run = useCallback(async () => {
    const cmd = command.trim();
    if (!cmd || busy) return;
    voice.stop();
    setBusy(true);
    push("prompt", cmd);
    const multi = agent === "auto";
    push("route", multi ? "Ruter via orchestrator (multi-agent)" : `Ruter til «${agent}»`);
    try {
      const body = multi
        ? { multiAgent: true, command: cmd, agents: ["business", "sales", "marketing"] }
        : { agent, command: cmd };
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data: ExecResult = await res.json().catch(() => ({}));
      if (!res.ok) {
        push("error", data.error || `Feil (${res.status})`);
      } else if (data.results && data.results.length > 0) {
        data.results.forEach((r) => push("result", `[${r.agent ?? "agent"}] ${(r.output ?? "").slice(0, 800)}`));
      } else if (data.output) {
        push("result", data.output.slice(0, 1200));
      } else {
        push("note", "Fullført (ingen tekst-output).");
      }
    } catch (err) {
      push("error", err instanceof Error ? err.message : "Ukjent feil");
    } finally {
      setBusy(false);
      setCommand("");
      inputRef.current?.focus();
    }
  }, [command, busy, agent, push, voice]);

  const lineColor = (kind: TraceLine["kind"]) =>
    kind === "prompt" ? "text-white" : kind === "route" ? "text-violet-300" : kind === "result" ? "text-emerald-300" : kind === "error" ? "text-rose-300" : "text-slate-400";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Åpne Jarvis (Cmd+K)"
        className="fixed bottom-20 left-4 z-[60] flex h-11 items-center gap-2 rounded-full border border-white/10 bg-black/70 px-4 text-sm text-slate-200 backdrop-blur-md transition-colors hover:border-emerald-400/40 sm:bottom-24 sm:left-6 lg:bottom-6"
        style={{ boxShadow: "0 0 24px rgba(52,211,153,0.15)" }}
      >
        <Sparkles className="h-4 w-4 text-emerald-400" />
        <span className="font-medium">Jarvis</span>
        <span className="hidden rounded border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 sm:inline">⌘K</span>
      </button>

      {!open ? null : (
        <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/50 p-4 pt-[8vh] backdrop-blur-sm" onClick={() => { voice.stop(); setOpen(false); }}>
          <div
            className="w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-[#0a0b0f]/95 backdrop-blur-md"
            style={{ boxShadow: "0 24px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-400/30 bg-emerald-400/10"><Bot className="h-4 w-4 text-emerald-400" /></div>
                <div><p className="text-sm font-semibold text-white">Jarvis</p><p className="text-[10px] uppercase tracking-widest text-slate-500">Nexus execution interface</p></div>
              </div>
              <button onClick={() => { voice.stop(); setOpen(false); }} className="rounded-lg p-1 text-slate-500 hover:bg-white/10 hover:text-slate-300"><X className="h-4 w-4" /></button>
            </div>

            <div className="max-h-[46vh] overflow-y-auto px-4 py-3 font-mono text-xs">
              {trace.length === 0 ? (
                <div className="py-6 text-center text-slate-500">
                  <Cpu className="mx-auto mb-2 h-6 w-6 text-slate-600" />
                  <p>Skriv eller dikter en kommando. Jarvis lar deg tenke høyt og venter 10 sekunder med stillhet før mikrofonøkten avsluttes.</p>
                  <p className="mt-2 flex items-center justify-center gap-1 text-[11px] text-amber-400/80"><ShieldAlert className="h-3 w-3" /> Tale kjører aldri handling automatisk. Trykk Kjør når kommandoen er riktig.</p>
                </div>
              ) : (
                trace.map((l, i) => <div key={i} className="flex gap-2 border-b border-white/[0.04] py-1.5 last:border-b-0"><span className="shrink-0 text-slate-600">{l.ts}</span><span className={`shrink-0 uppercase ${lineColor(l.kind)}`}>{l.kind}</span><p className={`min-w-0 whitespace-pre-wrap break-words ${l.kind === "prompt" ? "text-slate-200" : "text-slate-300"}`}>{l.text}</p></div>)
              )}
              {busy && <div className="flex items-center gap-2 py-2 text-violet-300"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Jarvis arbeider …</div>}
            </div>

            <div className="border-t border-white/10 p-3">
              <div className="mb-2 flex flex-wrap items-center gap-1">
                {AGENT_HINTS.map((a) => <button key={a.key} onClick={() => setAgent(a.key)} className={`rounded-lg px-2 py-1 text-[11px] transition-colors ${agent === a.key ? "bg-white/10 text-white" : "text-slate-500 hover:text-slate-300"}`}>{a.key === "auto" ? "Auto" : a.label}</button>)}
                {agents.length > 0 && <span className="ml-auto font-mono text-[10px] text-slate-600">{agents.length} agenter online</span>}
              </div>
              {voice.listening && <div className="mb-2 rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-200"><b>Lytter…</b> fortsett å snakke. Jarvis sender ingenting før du trykker Kjør.{voice.interim ? <div className="mt-1 opacity-70">{voice.interim}</div> : null}</div>}
              {voice.error && <div className="mb-2 text-xs text-rose-300">{voice.error}</div>}
              <div className="flex items-end gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2">
                <button type="button" onClick={voice.listening ? voice.stop : voice.start} className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${voice.listening ? "bg-rose-500/20 text-rose-300" : "bg-emerald-400/10 text-emerald-300"}`} title={voice.listening ? "Stopp tale" : "Start tale"}>{voice.listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}</button>
                <textarea ref={inputRef} value={command} onChange={(e) => setCommand(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void run(); } }} rows={2} placeholder="Spør Jarvis, skriv eller dikter en kommando …" disabled={busy} className="max-h-32 flex-1 resize-none bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-600 disabled:opacity-50" />
                <button onClick={() => void run()} disabled={busy || !command.trim()} className="flex shrink-0 items-center gap-1 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-2 text-[11px] font-semibold text-emerald-300 transition-colors hover:bg-emerald-400/20 disabled:opacity-40"><CornerDownLeft className="h-3.5 w-3.5" /> Kjør</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
