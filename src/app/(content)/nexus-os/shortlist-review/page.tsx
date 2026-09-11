"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, ExternalLink, Loader2, RefreshCw, Save, ShieldCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";

type ReviewStatus = "client_ready" | "needs_review" | "rejected" | "ask_agent" | "verify_price_availability";

type Candidate = {
  id: string;
  propertyId: string;
  reference: string | null;
  title: string | null;
  location: string | null;
  price: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  imageUrl: string | null;
  publicUrl: string | null;
  rank: number;
  eligibility: string | null;
  score: number;
  dataQualityScore: number;
  reasons: string[];
  concerns: string[];
  questionsToVerify: string[];
  qualityReviewStatus: ReviewStatus;
  qualityReviewNote: string | null;
};

type ReviewItem = {
  id: string;
  title: string;
  priority: string;
  brandId: string;
  customerName: string | null;
  customerEmail: string | null;
  buyerProfileId: string | null;
  shortlistId: string;
  nextAction: string;
  candidates: Candidate[];
};

type Payload = { items?: ReviewItem[]; error?: string };

function money(value: number | null) {
  if (value === null) return "Pris ikke oppgitt";
  return new Intl.NumberFormat("nb-NO", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

const statusOptions: Array<{ value: ReviewStatus; label: string }> = [
  { value: "client_ready", label: "Klar for kunde" },
  { value: "verify_price_availability", label: "Bekreft pris/tilgjengelighet" },
  { value: "ask_agent", label: "Spør megler/utbygger" },
  { value: "needs_review", label: "Må vurderes mer" },
  { value: "rejected", label: "Avvis" },
];

export default function NexusShortlistReviewPage() {
  const searchParams = useSearchParams();
  const workItemId = searchParams.get("workItemId") || "";
  const [item, setItem] = useState<ReviewItem | null>(null);
  const [status, setStatus] = useState<Record<string, ReviewStatus>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<{ clientReadyCount: number; presentationWillPrepareAutomatically: boolean } | null>(null);

  const load = useCallback(async () => {
    if (!workItemId) {
      setError("Mangler workItemId.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/nexus/shortlist-reviews?workItemId=${encodeURIComponent(workItemId)}`, { cache: "no-store" });
      const body = await response.json() as Payload;
      if (!response.ok) throw new Error(body.error || "Kunne ikke hente shortlist-review.");
      const next = body.items?.[0] || null;
      setItem(next);
      setStatus(Object.fromEntries((next?.candidates || []).map((candidate) => [candidate.id, candidate.qualityReviewStatus])));
      setNotes(Object.fromEntries((next?.candidates || []).map((candidate) => [candidate.id, candidate.qualityReviewNote || ""])));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setItem(null);
    } finally {
      setLoading(false);
    }
  }, [workItemId]);

  useEffect(() => { void load(); }, [load]);

  const readyCount = useMemo(
    () => Object.values(status).filter((value) => value === "client_ready").length,
    [status],
  );

  async function save() {
    if (!item) return;
    setSaving(true);
    setError("");
    setSaved(null);
    try {
      const response = await fetch("/api/nexus/shortlist-reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workItemId: item.id,
          reviews: item.candidates.map((candidate) => ({
            itemId: candidate.id,
            status: status[candidate.id] || "needs_review",
            note: notes[candidate.id] || null,
          })),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || "Kunne ikke lagre review.");
      setSaved({
        clientReadyCount: Number(body.clientReadyCount || 0),
        presentationWillPrepareAutomatically: Boolean(body.presentationWillPrepareAutomatically),
      });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  return <main className="mx-auto max-w-[1300px] space-y-5 p-4 sm:p-6">
    <div className="flex items-center justify-between gap-3">
      <Link href="/nexus-os/inbox" className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-slate-950"><ArrowLeft size={16} />Til Nexus Inbox</Link>
      <button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700"><RefreshCw size={15} className={loading ? "animate-spin" : ""} />Oppdater</button>
    </div>

    <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-cyan-700"><ShieldCheck size={16} /> Nexus shortlist review</div>
      <h1 className="mt-2 text-3xl font-black text-slate-950">Velg hvilke boliger som faktisk er klare for kunden</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Nexus har gjort matching og shortlist-forarbeidet. Du trenger bare å kvalitetssikre kandidatene. Så snart minst én bolig er markert <b>Klar for kunde</b>, lager Nexus presentasjon og e-postutkast automatisk. Ingenting sendes uten videre godkjenning.</p>
    </header>

    {loading && <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Henter shortlist…</div>}
    {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-900">{error}</div>}

    {item && <>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-xs font-black uppercase tracking-wider text-slate-500">Kunde</div>
        <div className="mt-1 text-xl font-black text-slate-950">{item.customerName || item.customerEmail || item.title}</div>
        <div className="mt-2 text-sm text-slate-600">{item.nextAction}</div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {item.candidates.map((candidate) => <article key={candidate.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {candidate.imageUrl && <img src={candidate.imageUrl} alt="" className="h-52 w-full object-cover" />}
          <div className="space-y-4 p-5">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500"><span>#{candidate.rank}</span>{candidate.reference && <span>· {candidate.reference}</span>}<span>· Score {candidate.score}</span></div>
              <h2 className="mt-1 text-xl font-black text-slate-950">{candidate.title || candidate.reference || "Boligkandidat"}</h2>
              <div className="mt-1 text-sm text-slate-600">{candidate.location || "Område ikke oppgitt"} · {money(candidate.price)}{candidate.bedrooms !== null ? ` · ${candidate.bedrooms} sov` : ""}{candidate.bathrooms !== null ? ` · ${candidate.bathrooms} bad` : ""}</div>
            </div>

            {candidate.reasons.length > 0 && <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-950"><b>Hvorfor den matcher:</b><ul className="mt-1 list-disc space-y-1 pl-5">{candidate.reasons.slice(0, 3).map((reason, index) => <li key={index}>{reason}</li>)}</ul></div>}
            {(candidate.concerns.length > 0 || candidate.questionsToVerify.length > 0) && <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950"><b>Må kontrolleres:</b><ul className="mt-1 list-disc space-y-1 pl-5">{[...candidate.concerns, ...candidate.questionsToVerify].slice(0, 4).map((value, index) => <li key={index}>{value}</li>)}</ul></div>}

            <div className="grid gap-2 sm:grid-cols-[220px,1fr]">
              <select value={status[candidate.id] || "needs_review"} onChange={(event) => setStatus((current) => ({ ...current, [candidate.id]: event.target.value as ReviewStatus }))} className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800">
                {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <input value={notes[candidate.id] || ""} onChange={(event) => setNotes((current) => ({ ...current, [candidate.id]: event.target.value }))} placeholder="Kort notat, valgfritt" className="h-10 rounded-xl border border-slate-300 px-3 text-sm" />
            </div>

            {candidate.publicUrl && <a href={candidate.publicUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-bold text-cyan-700 hover:text-cyan-900">Åpne bolig <ExternalLink size={14} /></a>}
          </div>
        </article>)}
      </section>

      <section className="sticky bottom-3 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-slate-700"><b>{readyCount}</b> markert klar for kunde. {readyCount > 0 ? "Nexus kan lage presentasjons- og e-postutkast etter lagring." : "Minst én må være klar før Nexus går videre."}</div>
        <button onClick={() => void save()} disabled={saving || item.candidates.length === 0} className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-50">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Lagre review og fortsett</button>
      </section>

      {saved && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"><div className="flex gap-2"><CheckCircle2 size={18} /><div><b>Review lagret.</b> {saved.presentationWillPrepareAutomatically ? `Nexus fortsetter automatisk med ${saved.clientReadyCount} godkjent${saved.clientReadyCount === 1 ? "" : "e"} bolig${saved.clientReadyCount === 1 ? "" : "er"}.` : "Ingen bolig er klar for presentasjon ennå."}</div></div></div>}
    </>}
  </main>;
}
