"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Flame, Languages } from "lucide-react";

type Status = {
  completedToday: boolean;
  streakDays: number;
  focus: string;
  launchUrl: string;
};

const FALLBACK_URL = "https://spanish.chatgenius.pro/?source=realtyflow&mode=daily5&minutes=5";

export function SpanishQuickButton() {
  const [status, setStatus] = useState<Status | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/personal-intelligence/spanish/daily", { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Spanish status failed (${response.status})`);
        return response.json();
      })
      .then((body) => { if (active) setStatus(body); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);

  async function openLesson() {
    const launchUrl = status?.launchUrl || FALLBACK_URL;
    window.open(launchUrl, "_blank", "noopener,noreferrer");
    if (status) {
      void fetch("/api/personal-intelligence/spanish/daily", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
    }
  }

  return (
    <button
      type="button"
      onClick={openLesson}
      className="flex w-full items-center gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-3 text-left transition hover:border-amber-300/60 hover:bg-amber-400/15"
      title={failed ? "Åpner Spanish ChatGenius direkte" : status?.focus || "5 minutter spansk"}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-400/15 text-amber-300">
        {status?.completedToday ? <CheckCircle2 size={17} /> : <Languages size={17} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-black text-amber-200">
          {status?.completedToday ? "Spansk ferdig i dag" : "5 minutter spansk"}
        </span>
        <span className="mt-0.5 block truncate text-[10px] text-slate-500">
          {failed ? "Åpne Spanish ChatGenius" : status?.focus || "Laster dagens økt…"}
        </span>
      </span>
      {(status?.streakDays || 0) > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/15 px-2 py-1 text-[10px] font-black text-orange-300">
          <Flame size={11} /> {status?.streakDays}
        </span>
      )}
    </button>
  );
}
