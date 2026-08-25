"use client";

import { useEffect, useMemo, useState } from "react";

type Control = {
  control_key: string;
  label: string;
  category: string;
  enabled: boolean;
  risk_level: "low" | "medium" | "high" | "critical";
  description: string;
  config: Record<string, unknown>;
  updated_by: string | null;
  updated_at: string;
};

type Audit = {
  id: string;
  control_key: string;
  previous_enabled: boolean | null;
  resulting_enabled: boolean;
  changed_by: string | null;
  reason: string | null;
  created_at: string;
};

type Payload = { controls: Control[]; audit: Audit[]; note?: string };

const riskClass: Record<string, string> = {
  low: "bg-emerald-100 text-emerald-800",
  medium: "bg-cyan-100 text-cyan-800",
  high: "bg-amber-100 text-amber-800",
  critical: "bg-rose-100 text-rose-800",
};

export default function NexusRuntimePage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/nexus/runtime-controls", { cache: "no-store", credentials: "same-origin" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Kunne ikke hente runtime controls");
      setData(body);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  async function toggle(control: Control) {
    const target = !control.enabled;
    const highRisk = control.risk_level === "high" || control.risk_level === "critical";
    if (highRisk) {
      const ok = window.confirm(`${target ? "Slå PÅ" : "Slå AV"} ${control.label}?\n\nRisiko: ${control.risk_level.toUpperCase()}\n${control.description}`);
      if (!ok) return;
    }
    setBusy(control.control_key); setError("");
    try {
      const res = await fetch("/api/nexus/runtime-controls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ control_key: control.control_key, enabled: target, confirmed: highRisk, reason: `Owner toggled ${target ? "on" : "off"} in Nexus Runtime Controls` }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Endring feilet");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }

  const grouped = useMemo(() => {
    const map = new Map<string, Control[]>();
    for (const c of data?.controls ?? []) map.set(c.category, [...(map.get(c.category) ?? []), c]);
    return Array.from(map.entries());
  }, [data]);

  return <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6">
    <header className="rounded-3xl border border-violet-900/30 bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950 p-6 text-white shadow-xl sm:p-7">
      <div className="text-xs font-black uppercase tracking-[0.24em] text-violet-300">Nexus OS · Runtime Control</div>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-3xl font-black">Skru automasjon av/på her</h1><p className="mt-2 max-w-4xl text-sm leading-6 text-slate-300">Operativ styring ligger i Nexus. Vercel brukes fortsatt til hemmelige nøkler og teknisk fallback, men du trenger ikke åpne Vercel for å starte eller stoppe normale automasjoner.</p></div>
        <button onClick={load} disabled={loading} className="rounded-xl bg-violet-300 px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-50">{loading ? "Oppdaterer…" : "Oppdater"}</button>
      </div>
    </header>

    {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}

    {grouped.map(([category, controls]) => <section key={category} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-4"><h2 className="text-lg font-black capitalize text-slate-900">{category.replaceAll("_", " ")}</h2></div>
      <div className="divide-y divide-slate-100">{controls.map(control => <div key={control.control_key} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-slate-900">{control.label}</h3><span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${riskClass[control.risk_level]}`}>{control.risk_level}</span></div>
          <p className="mt-1 text-sm leading-5 text-slate-600">{control.description}</p>
          <div className="mt-2 text-[11px] text-slate-400">{control.control_key} · sist endret {new Date(control.updated_at).toLocaleString("nb-NO")}{control.updated_by ? ` · ${control.updated_by}` : ""}</div>
        </div>
        <button onClick={() => toggle(control)} disabled={busy === control.control_key} className={`min-w-28 rounded-xl px-4 py-2 text-sm font-black text-white disabled:opacity-50 ${control.enabled ? "bg-emerald-600" : "bg-slate-500"}`}>{busy === control.control_key ? "Lagrer…" : control.enabled ? "PÅ" : "AV"}</button>
      </div>)}</div>
    </section>)}

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-black text-slate-900">Siste endringer</h2>
      <div className="mt-3 space-y-2">{(data?.audit ?? []).slice(0, 15).map(a => <div key={a.id} className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600"><b className="text-slate-900">{a.control_key}</b> → <b>{a.resulting_enabled ? "PÅ" : "AV"}</b> · {new Date(a.created_at).toLocaleString("nb-NO")} · {a.changed_by || "ukjent"}{a.reason ? <div className="mt-1 text-slate-500">{a.reason}</div> : null}</div>)}</div>
    </section>
  </div>;
}
