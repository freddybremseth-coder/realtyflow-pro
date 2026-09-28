"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Languages, Loader2 } from "lucide-react";

type SpanishStatus = {
  ok: boolean;
  todayCompleted: boolean;
  completed30d: number;
  lastCompletedAt: string | null;
  focus: {
    topicId: string;
    topicName: string;
    reason: string;
    activityMode: string;
  } | null;
  appUrl: string;
};

type StartResponse = {
  ok: boolean;
  handoffUrl: string;
  focus: SpanishStatus["focus"];
};

async function jsonRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    cache: "no-store",
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `${url} failed (${response.status})`);
  return body as T;
}

export function DailySpanishNudge() {
  const [status, setStatus] = useState<SpanishStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const [hidden, setHidden] = useState(false);

  const load = useCallback(async () => {
    try {
      const next = await jsonRequest<SpanishStatus>("/api/integrations/spanish/daily");
      setStatus(next);
      setHidden(false);
    } catch {
      setHidden(true);
    }
  }, []);

  useEffect(() => {
    void load();
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  async function start() {
    if (starting) return;
    setStarting(true);
    try {
      const returnPath = `${window.location.pathname}${window.location.search}`;
      const result = await jsonRequest<StartResponse>("/api/integrations/spanish/daily", {
        method: "POST",
        body: JSON.stringify({ returnPath }),
      });
      window.open(result.handoffUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => void load(), 1200);
    } catch {
      window.open("https://spanish.chatgenius.pro/", "_blank", "noopener,noreferrer");
    } finally {
      setStarting(false);
    }
  }

  if (hidden) return null;

  const done = Boolean(status?.todayCompleted);
  const focus = status?.focus?.topicName || "Spansk";
  const detail = status?.focus?.reason || "Kort, adaptiv økt";
  const title = done
    ? `Dagens 5 minutter er registrert. Du kan gjerne ta en ekstra økt. Neste fokus: ${focus}.`
    : `5 minutter spansk · ${focus} · ${detail}`;

  return (
    <button
      type="button"
      onClick={() => void start()}
      disabled={starting}
      title={title}
      aria-label={title}
      className={[
        "fixed top-3 z-[84] inline-flex max-w-[min(76vw,330px)] items-center gap-2 rounded-full border px-3 py-2 text-xs font-black shadow-lg backdrop-blur transition",
        "right-3 lg:right-28",
        done
          ? "border-emerald-400/40 bg-emerald-950/90 text-emerald-100 hover:border-emerald-300/70 hover:bg-emerald-900"
          : "border-amber-400/45 bg-slate-950/92 text-amber-100 hover:border-amber-300/80 hover:bg-slate-900",
        starting ? "cursor-wait opacity-80" : "",
      ].join(" ")}
    >
      {starting ? <Loader2 size={15} className="shrink-0 animate-spin" /> : done ? <CheckCircle2 size={15} className="shrink-0" /> : <Languages size={15} className="shrink-0" />}
      <span className="sm:hidden">{done ? "5 min spansk ✓" : "5 min spansk"}</span>
      <span className="hidden truncate sm:inline">{done ? "5 minutt spansk ✓" : "5 minutt for litt spansk opplæring"}</span>
    </button>
  );
}
