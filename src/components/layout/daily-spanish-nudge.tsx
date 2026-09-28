"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Flame, Languages, Loader2, X } from "lucide-react";

type Status = {
  completedToday: boolean;
  streakDays: number;
  totalSessions: number;
  totalMinutes: number;
  focus: string;
  launchUrl: string;
};

export function DailySpanishNudge() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [launched, setLaunched] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [failed, setFailed] = useState(false);

  async function load() {
    try {
      const response = await fetch("/api/personal-intelligence/spanish/daily", { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error(`Spanish status failed (${response.status})`);
      const body = await response.json();
      setStatus(body);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function start() {
    if (!status) return;
    window.open(status.launchUrl, "_blank", "noopener,noreferrer");
    setLaunched(true);
    void fetch("/api/personal-intelligence/spanish/daily", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start" }),
    });
  }

  async function complete() {
    const response = await fetch("/api/personal-intelligence/spanish/daily", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "complete", minutes: 5 }),
    });
    if (response.ok) setStatus(await response.json());
  }

  if (loading || dismissed) return null;
  if (!status && failed) return (
    <div className="fixed right-4 top-4 z-[70] w-[min(92vw,360px)] rounded-2xl border border-amber-300/40 bg-slate-950/95 p-3 shadow-2xl backdrop-blur">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400/15 text-amber-300"><Languages size={19}/></div>
        <div className="min-w-0 flex-1"><div className="font-black text-white">5 minutter spansk</div><div className="text-xs text-slate-500">Åpne Spanish ChatGenius direkte</div></div>
        <a href="https://spanish.chatgenius.pro/?source=realtyflow&mode=daily5&minutes=5" target="_blank" rel="noreferrer" className="rounded-xl bg-amber-400 px-3 py-2 text-xs font-black text-slate-950">Start</a>
      </div>
    </div>
  );
  if (!status) return null;

  return (
    <div className="fixed right-4 top-4 z-[70] w-[min(92vw,360px)] rounded-2xl border border-amber-300/40 bg-slate-950/95 p-3 shadow-2xl backdrop-blur">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-400/15 text-amber-300">
          <Languages size={19} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="font-black text-white">{status.completedToday ? "Spansk ferdig i dag" : "5 minutter spansk"}</div>
            {status.streakDays > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-black text-orange-300"><Flame size={11}/>{status.streakDays}</span>}
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">{status.focus}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {status.completedToday ? (
              <a href={status.launchUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs font-black text-emerald-300"><CheckCircle2 size={14}/> Fortsett hvis du vil</a>
            ) : (
              <button type="button" onClick={start} className="rounded-xl bg-amber-400 px-3 py-2 text-xs font-black text-slate-950">Start 5 min nå</button>
            )}
            {launched && !status.completedToday && <button type="button" onClick={() => void complete()} className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-black text-slate-300">Jeg er ferdig</button>}
          </div>
          <div className="mt-2 text-[10px] text-slate-600">{status.totalSessions} økter · {status.totalMinutes} min totalt</div>
        </div>
        <button type="button" onClick={() => setDismissed(true)} aria-label="Skjul for denne åpningen" className="rounded p-1 text-slate-600 hover:text-slate-300"><X size={14}/></button>
      </div>
    </div>
  );
}
