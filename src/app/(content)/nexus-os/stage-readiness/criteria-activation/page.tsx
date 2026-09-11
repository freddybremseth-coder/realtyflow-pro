"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck, SlidersHorizontal } from "lucide-react";

type LifestyleCandidate = {
  key: string;
  strength: string;
  confidence: number;
  sourceText: string;
  customerConfirmed: boolean;
};

type PersonaCandidate = { id: string; confidence: number; evidence: string[] };

type Preview = {
  contact: {
    id: string;
    name: string;
    email?: string | null;
    brand?: string | null;
    pipelineStatus?: string | null;
    pipelineValue: number;
    propertyInterest?: string | null;
    notes?: string | null;
    source?: string | null;
  };
  lead: { type:null; property_interest:string|null; notes:string|null; preferences:null };
  buyerIntelligence: { lifestyleCandidates:LifestyleCandidate[]; personaCandidates:PersonaCandidate[] };
};

export default function CriteriaActivationPage() {
  const params = useSearchParams();
  const contactId = String(params.get("contactId") || "");
  const [data, setData] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!contactId) { setError("contactId mangler"); setLoading(false); return; }
    void (async () => {
      try {
        const r = await fetch(`/api/nexus/criteria-activation/preview?contactId=${encodeURIComponent(contactId)}`, { cache:"no-store", credentials:"same-origin" });
        const b = await r.json().catch(() => null);
        if (!r.ok) throw new Error(b?.error || "Kunne ikke analysere CRM-kriterier");
        setData(b as Preview);
      } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
      finally { setLoading(false); }
    })();
  }, [contactId]);

  const candidates = data?.buyerIntelligence?.lifestyleCandidates || [];

  async function createReview() {
    if (!data || !candidates.length) return;
    if (!window.confirm(`Legg dokumenterte CRM-signaler for ${data.contact.name} i Buyer Intake Review?\n\nDette endrer ikke Buyer Profile eller pipeline. Kriteriene må fortsatt godkjennes eksplisitt i review-køen.`)) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      const brand = String(data.contact.brand || "").toLowerCase();
      const importSource = brand === "soleada" ? "soleada-import" : brand === "zeneco" ? "zeneco-import" : "historical-import";
      const rawText = [data.contact.propertyInterest, data.contact.notes].filter(Boolean).join("\n\n");
      const r = await fetch("/api/nexus/buyer-intake/attach", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          contactId:data.contact.id,
          lead:data.lead,
          rawText,
          formType:"crm_existing_evidence",
          confidence:"existing_crm_evidence",
          importSource,
        }),
      });
      const b = await r.json().catch(() => null);
      if (!r.ok) throw new Error(b?.error || "Kunne ikke opprette criteria review");
      setSuccess(b?.duplicate ? "Denne CRM-evidensen finnes allerede i review-køen." : "CRM-evidensen er lagt i Buyer Intake Review. Ingen Buyer Profile- eller pipeline-endring er gjort.");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  }

  return <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
    <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-cyan-700"><SlidersHorizontal size={16}/> Criteria Activation</div>
      <h1 className="mt-2 text-3xl font-black text-slate-950">Gjør CRM-fakta klare for matching</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Analyserer bare eksisterende CRM-notater og property interest. Forslag blir ikke kundesannhet før du eksplisitt godkjenner dem i Buyer Intake Review.</p>
    </header>
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"><ShieldCheck size={16} className="mr-2 inline"/><b>Sikker modus:</b> preview er read-only. «Legg til review» oppretter bare et internt work item. Ingen e-post, pipeline-endring eller automatisk Buyer Profile-write.</div>
    {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950"><AlertTriangle size={16} className="mr-2 inline"/>{error}</div>}
    {success && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-950"><CheckCircle2 size={16} className="mr-2 inline"/>{success}<Link href="/nexus-os/buyer-intake/reviews" className="ml-3 inline-flex rounded-lg bg-emerald-800 px-3 py-1.5 text-xs font-black text-white">Åpne review</Link></div>}
    {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500"><Loader2 size={18} className="mr-2 inline animate-spin"/>Analyserer CRM-evidens…</div> : data ? <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-xl font-black text-slate-950">{data.contact.name}</h2><div className="mt-1 text-sm text-slate-500">{data.contact.email} · {data.contact.pipelineStatus} · {data.contact.brand || "ukjent brand"}</div></div><div className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-black">{candidates.length} kriteriesignaler</div></div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2"><div className="rounded-2xl border border-slate-200 p-4"><div className="text-xs font-black uppercase tracking-wide text-slate-500">Eksisterende CRM-grunnlag</div>{data.contact.propertyInterest ? <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700"><b>Property interest:</b> {data.contact.propertyInterest}</div> : null}{data.contact.notes ? <div className="mt-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-700"><b>Notater:</b> {data.contact.notes}</div> : null}{!data.contact.propertyInterest && !data.contact.notes ? <div className="mt-3 text-sm text-slate-500">Ingen CRM-tekst som kan brukes til kriteriepreview.</div> : null}</div><div className="rounded-2xl border border-slate-200 p-4"><div className="text-xs font-black uppercase tracking-wide text-slate-500">Forslag som må reviewes</div><div className="mt-3 space-y-2">{candidates.map((c) => <div key={c.key} className="rounded-xl bg-cyan-50 p-3"><div className="flex justify-between gap-3"><span className="text-sm font-black text-cyan-950">{c.key.replaceAll("_"," ")}</span><span className="text-xs font-black text-cyan-800">{Math.round(c.confidence * 100)}%</span></div><div className="mt-1 text-xs text-cyan-900">{c.sourceText}</div></div>)}{!candidates.length ? <div className="text-sm text-amber-800">CRM-dataene gir ingen dokumenterbare boligkriterier. Bruk Buyer Intake for å samle nye fakta fra skjema/bilde/PDF eller avklar kriteriene med kunden.</div> : null}</div></div></div>
      <div className="mt-5 flex flex-wrap gap-2"><Link href={`/customers?contactId=${encodeURIComponent(data.contact.id)}`} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white">Customer 360</Link>{candidates.length ? <button onClick={() => void createReview()} disabled={saving} className="rounded-xl bg-cyan-700 px-4 py-2 text-sm font-black text-white disabled:opacity-50">{saving ? <Loader2 size={15} className="mr-2 inline animate-spin"/> : null}Legg til review</button> : <Link href="/nexus-os/buyer-intake" className="rounded-xl bg-cyan-700 px-4 py-2 text-sm font-black text-white">Åpne Buyer Intake</Link>}<Link href="/nexus-os/stage-readiness" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-700">Tilbake til Stage Readiness</Link></div>
    </section> : null}
  </main>;
}
