"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Clock3, Loader2, Target, UserRound } from "lucide-react";

type Item = {
  id: string;
  period: "historical" | "current" | "future";
  kind: "claim" | "goal";
  label: string;
  detail: string | null;
  status: string;
  confidence: number | null;
  privacyLevel: string;
  sourceId: string | null;
  sourceExcerpt: string | null;
  evidenceRule: string;
  updatedAt: string;
};

type ResponseBody = {
  subject: { id: string; display_name: string };
  historical: Item[];
  current: Item[];
  future: Item[];
  unknown: { historical: boolean; current: boolean; future: boolean };
  principles: Record<string, boolean>;
  writesPerformed: number;
};

const SECTIONS = [
  { key: "historical" as const, title: "Historical Freddy", icon: Clock3, description: "Only evidence explicitly marked as past or with an ended validity period." },
  { key: "current" as const, title: "Current Freddy", icon: UserRound, description: "Validated or canonical current context. This is not treated as permanent identity." },
  { key: "future" as const, title: "Future Freddy", icon: Target, description: "Explicit goals and future directions. Goals are not predictions, and ideas are not commitments." },
];

export default function TrajectoryPage() {
  const [data, setData] = useState<ResponseBody | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/personal-intelligence/trajectory", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || `Trajectory failed (${response.status})`);
        return body as ResponseBody;
      })
      .then((body) => { if (active) setData(body); })
      .catch((failure) => { if (active) setError(failure instanceof Error ? failure.message : String(failure)); });
    return () => { active = false; };
  }, []);

  return <main className="mx-auto max-w-[1200px] space-y-5 p-4 sm:p-6">
    <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="text-xs font-black uppercase tracking-[0.2em] text-indigo-700">Trajectory</div>
      <h1 className="mt-2 text-3xl font-black tracking-tight">Historical. Current. Future.</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">A read-only view of confirmed evidence. The system does not invent a life story, infer personality, or score who you are.</p>
    </header>

    {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-900">{error}</div>}
    {!data && !error && <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600"><Loader2 size={16} className="animate-spin"/> Loading evidence…</div>}

    {data && <>
      <section className="grid gap-4 lg:grid-cols-3">
        {SECTIONS.map(({ key, title, icon: Icon, description }) => {
          const items = data[key];
          return <article key={key} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2"><Icon size={18}/><h2 className="text-sm font-black">{title}</h2></div>
            <p className="mt-2 text-xs leading-5 text-slate-500">{description}</p>
            {items.length === 0 ? <div className="mt-4 rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500"><strong>Unknown.</strong> There is not enough explicit evidence yet.</div> : <div className="mt-4 space-y-3">{items.map((item) => <div key={item.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[10px] font-black uppercase tracking-wide text-indigo-700">{item.kind} · {item.status}</span><span className="text-[10px] text-slate-400">{item.privacyLevel}</span></div>
              <div className="mt-2 text-sm font-bold text-slate-950">{item.label}</div>
              {item.detail && <div className="mt-1 text-xs leading-5 text-slate-600">{item.detail}</div>}
              <div className="mt-3 rounded-xl bg-slate-50 p-3 text-[11px] leading-5 text-slate-500">Why here: {item.evidenceRule}</div>
              {item.sourceExcerpt && <div className="mt-2 text-[11px] text-slate-500">Source excerpt: “{item.sourceExcerpt}”</div>}
            </div>)}</div>}
          </article>;
        })}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-black"><ArrowRight size={16}/> Guardrails</div>
        <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-3">Read-only: no memory writes.</div>
          <div className="rounded-xl bg-slate-50 p-3">No personality or identity score.</div>
          <div className="rounded-xl bg-slate-50 p-3">No LLM temporal inference.</div>
          <div className="rounded-xl bg-slate-50 p-3">Unknown stays unknown.</div>
          <div className="rounded-xl bg-slate-50 p-3">Current context is not permanent identity.</div>
          <div className="rounded-xl bg-slate-50 p-3">Goals are not predictions or automatic commitments.</div>
        </div>
        <p className="mt-3 text-[11px] text-slate-500">Runtime contract reports writesPerformed: {data.writesPerformed}.</p>
      </section>
    </>}
  </main>;
}
