"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, FileCheck2, Loader2, Mail, RefreshCw, ShieldCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";

type ReviewItem = {
  id: string;
  brandId: string;
  customerName?: string | null;
  customerEmail?: string | null;
  contactId?: string | null;
  presentation?: { status: string; title: string; content: unknown } | null;
  messageDraft?: { status: string; subject: string; bodyText: string; bodyHtml?: string | null; language?: string | null } | null;
  nextAction?: string | null;
};

export default function NexusPresentationReviewPage() {
  const params = useSearchParams();
  const workItemId = params.get("workItemId") || "";
  const [item, setItem] = useState<ReviewItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    if (!workItemId) {
      setError("workItemId mangler.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/nexus/presentation-reviews?workItemId=${encodeURIComponent(workItemId)}`, { cache: "no-store", credentials: "same-origin" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "Kunne ikke laste sluttkontrollen.");
      setItem(body?.items?.[0] || null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [workItemId]);

  useEffect(() => { void load(); }, [load]);

  async function approve() {
    if (!item || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/nexus/presentation-reviews", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workItemId: item.id, explicitApproval: true }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "Godkjenning feilet.");
      setDone(true);
      setItem(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main className="mx-auto max-w-5xl p-6"><div className="flex items-center gap-2 text-sm font-bold text-slate-600"><Loader2 className="animate-spin" size={18} /> Laster sluttkontroll…</div></main>;

  return <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
    <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-cyan-700"><FileCheck2 size={16} /> Nexus sluttkontroll</div>
          <h1 className="mt-2 text-3xl font-black text-slate-950">Presentasjon og e-postutkast</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">Kontroller sluttresultatet. Godkjenning her gjør innholdet klart for send-preflight, men sender ingenting til kunden.</p>
        </div>
        <button onClick={() => void load()} disabled={saving} className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-700"><RefreshCw size={17} /></button>
      </div>
    </header>

    {error && <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"><div className="flex gap-2"><AlertTriangle size={18} />{error}</div></section>}
    {done && <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950"><div className="flex gap-3"><CheckCircle2 size={20} /><div><b>Sluttresultatet er godkjent.</b><div className="mt-1 text-sm">Shortlist, presentasjon og e-postutkast er godkjent for neste preflight-steg. Ingen kundeutsending er utført.</div></div></div></section>}

    {!done && !item && !error && <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Denne saken venter ikke lenger på sluttkontroll.</section>}

    {item && <>
      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-xs font-black uppercase text-slate-500">Kunde</div><div className="mt-2 font-black text-slate-950">{item.customerName || "Ukjent kunde"}</div><div className="mt-1 text-sm text-slate-600">{item.customerEmail || "Ingen e-post"}</div></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-xs font-black uppercase text-slate-500">Brand</div><div className="mt-2 font-black text-slate-950">{item.brandId}</div></div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><ShieldCheck size={18} className="text-emerald-700" /><div className="mt-2 text-sm font-bold text-emerald-950">Ingen automatisk utsending</div><div className="mt-1 text-xs leading-5 text-emerald-800">Knappen under godkjenner bare sluttresultatet og åpner for send-preflight.</div></div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-xs font-black uppercase tracking-wider text-slate-500">Presentasjon</div>
        <h2 className="mt-2 text-xl font-black text-slate-950">{item.presentation?.title || "Kundepresentasjon"}</h2>
        <pre className="mt-4 max-h-[420px] overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-700">{JSON.stringify(item.presentation?.content ?? {}, null, 2)}</pre>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500"><Mail size={15} /> E-postutkast</div>
        <div className="mt-4 text-xs font-bold uppercase text-slate-500">Emne</div>
        <div className="mt-1 font-black text-slate-950">{item.messageDraft?.subject || ""}</div>
        <div className="mt-4 text-xs font-bold uppercase text-slate-500">Tekst</div>
        <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-800">{item.messageDraft?.bodyText || ""}</pre>
      </section>

      <section className="rounded-2xl border border-cyan-200 bg-cyan-50 p-6">
        <div className="text-sm leading-6 text-cyan-950">{item.nextAction || "Kontroller sluttresultatet før eventuell utsending."}</div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button onClick={() => void approve()} disabled={saving} className="inline-flex items-center rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-60">{saving && <Loader2 size={16} className="mr-2 animate-spin" />}Godkjenn sluttresultat – sender ikke</button>
          {item.contactId && <Link href={`/customers/${encodeURIComponent(item.contactId)}`} className="rounded-xl border border-cyan-300 bg-white px-5 py-3 text-sm font-black text-cyan-900">Åpne Customer 360</Link>}
        </div>
      </section>
    </>}
  </main>;
}
