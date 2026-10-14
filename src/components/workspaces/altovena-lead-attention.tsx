"use client";

import { useEffect, useState } from "react";

type LeadTask = {
  id: string;
  title: string;
  status: "TO_DO" | "IN_PROGRESS" | "REVIEW";
  priority: "MEDIUM" | "HIGH" | "CRITICAL";
  contactId: string | null;
  createdAt: string | null;
  dueDate: string | null;
  nextAction: string | null;
};

export function AltovenaLeadAttention({ onOpenLeads }: { onOpenLeads: () => void }) {
  const [tasks, setTasks] = useState<LeadTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    fetch("/api/workspaces/altovena/lead-tasks", { cache: "no-store", signal: controller.signal })
      .then(async res => {
        if (!res.ok) throw new Error(res.status === 403 ? "Ingen tilgang til Altovena-leads." : "Kunne ikke hente henvendelser.");
        return res.json();
      })
      .then(body => {
        if (body.ok !== true || body.brand !== "altovena" || !Array.isArray(body.tasks))
          throw new Error("Ugyldig svar fra Altovena-oppfølging.");
        if (!controller.signal.aborted) setTasks(body.tasks.slice(0, 40));
      })
      .catch(cause => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Henvendelser er utilgjengelige.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refresh]);

  return <section aria-label="Altovena – oppfølging av nye henvendelser" className="rounded-2xl border border-cyan-900/60 bg-slate-900/70 p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">ALTOVENA · NYE HENVENDELSER</p>
        <h3 className="mt-1 text-xl font-semibold">
          {loading ? "Henter oppfølgingsoppgaver…" : error ? "Oppfølging må kontrolleres" :
            tasks.length === 0 ? "Ingen åpne webhenvendelser" : tasks.length + " henvendelser til oppfølging"}
        </h3>
        <p className="mt-1 text-sm text-slate-400">Bare Altovena. Henvendelser krever personlig gjennomgang; ingen automatisk kundeutsendelse.</p>
      </div>
      <button type="button" onClick={() => setRefresh(current => current + 1)}
        className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-cyan-200">Oppdater</button>
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-amber-300">{error}</p>}
    {!loading && !error && tasks.length > 0 && <div className="mt-4 space-y-2">
      {tasks.slice(0, 8).map(task => <div key={task.id}
        className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
        <div>
          <p className="font-medium">{task.title}</p>
          <p className="mt-1 text-xs text-slate-400">{task.nextAction || "Vurder forespørselen og svar personlig."}</p>
          <p className="mt-1 text-xs text-slate-500">Status: {task.status === "TO_DO" ? "Ny" : task.status === "REVIEW" ? "Til gjennomgang" : "Under arbeid"}
            {task.dueDate ? " · Frist: " + task.dueDate : ""}</p>
        </div>
        <button type="button" onClick={onOpenLeads}
          className="rounded-lg border border-cyan-700 px-3 py-2 text-sm text-cyan-200">Åpne CRM</button>
      </div>)}
      {tasks.length > 8 && <p className="text-xs text-slate-400">Viser de åtte nyeste. Bruk CRM for full oversikt.</p>}
    </div>}
    <p className="mt-3 text-xs text-slate-500">Dette er varsling i arbeidsflaten, ikke en bekreftet e-post- eller pushvarsling.</p>
  </section>;
}
