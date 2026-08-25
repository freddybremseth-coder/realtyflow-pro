"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Plan = {
  id: string;
  identity_key: string;
  platform: string;
  account_type: string;
  proposed_name: string;
  proposed_handle: string | null;
  alternate_handles: string[];
  positioning: string;
  proposed_bio: string;
  primary_url: string | null;
  primary_cta: string | null;
  content_pillars: string[];
  automation_plan: Record<string, unknown>;
  status: string;
  notes: string | null;
};

type Payload = { plans: Plan[]; policy?: Record<string, unknown> };

export default function AccountLaunchPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/nexus/account-launch", { cache: "no-store", credentials: "same-origin" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Kunne ikke hente konto-planer");
      setData(body);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  async function setStatus(id: string, status: string) {
    setBusy(id);
    try {
      const res = await fetch("/api/nexus/account-launch", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ id, status }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Oppdatering feilet");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }

  return <div className="mx-auto max-w-[1500px] space-y-6 p-6">
    <header className="rounded-3xl border border-indigo-900/30 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-7 text-white shadow-xl">
      <div className="text-xs font-black uppercase tracking-[0.24em] text-indigo-300">Nexus OS · Brand Expansion</div>
      <h1 className="mt-2 text-3xl font-black">Account Launch Center</h1>
      <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-300">Forslag til nye kontoer og posisjonering med navn, handle, bio, CTA, innholdspilarer og automasjonsplan. Nexus forbereder alt; selve konto-/OAuth-steget hos plattformen utføres bare når plattformen krever eiersamtykke.</p>
    </header>

    {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
    {loading && !data && <div className="rounded-xl border border-slate-200 bg-white p-8 text-slate-500">Laster forslag…</div>}

    <section className="grid gap-4 xl:grid-cols-3">
      {(data?.plans ?? []).map((plan) => <article key={plan.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{plan.platform} · {plan.account_type.replaceAll("_", " ")}</div><h2 className="mt-1 text-xl font-black text-slate-900">{plan.proposed_name}</h2>{plan.proposed_handle && <div className="mt-1 text-sm font-bold text-indigo-700">@{plan.proposed_handle}</div>}</div>
          <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase text-slate-600">{plan.status}</span>
        </div>
        <p className="mt-4 text-sm leading-6 text-slate-600">{plan.positioning}</p>
        <div className="mt-4 rounded-xl bg-slate-50 p-3"><div className="text-[10px] font-black uppercase text-slate-400">Foreslått bio</div><div className="mt-1 text-sm text-slate-700">{plan.proposed_bio}</div></div>
        {plan.alternate_handles?.length > 0 && <div className="mt-3 text-xs text-slate-500">Alternativer: {plan.alternate_handles.map(x => `@${x}`).join(" · ")}</div>}
        <div className="mt-4 flex flex-wrap gap-1">{plan.content_pillars.map(p => <span key={p} className="rounded-full bg-indigo-50 px-2 py-1 text-[10px] font-bold text-indigo-700">{p.replaceAll("_", " ")}</span>)}</div>
        {plan.primary_url && <div className="mt-4 text-xs"><b>Lenke:</b> {plan.primary_url}</div>}
        {plan.primary_cta && <div className="mt-1 text-xs"><b>CTA:</b> {plan.primary_cta}</div>}
        {plan.notes && <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">{plan.notes}</div>}
        <div className="mt-5 flex flex-wrap gap-2">
          {plan.status === "proposed" && <button disabled={busy === plan.id} onClick={() => setStatus(plan.id, "ready")} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">Gjør klar</button>}
          {plan.platform === "instagram" || plan.platform === "facebook" || plan.platform === "youtube" || plan.platform === "linkedin" ? <Link href="/connections" className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-black text-slate-700">Åpne Connections</Link> : <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500">Connector planlegges</span>}
        </div>
      </article>)}
    </section>

    <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-5 text-sm text-cyan-950"><b>Automatiseringsregel:</b> nye identiteter arver ikke automatisk publiseringsrettigheter. Først identity → channel connection → source strategy → controlled publishing → measurement → learning.</div>
  </div>;
}
