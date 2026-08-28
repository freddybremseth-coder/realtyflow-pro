"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Criterion = {
  criterionType: "hard_requirement" | "preference" | "exclusion" | "missing_information";
  key: string;
  otherKey: string | null;
  operator: string;
  value: unknown;
  weight: number | null;
  severity: "reject" | "major_penalty" | "minor_penalty" | null;
  appliesToPropertyTypes: string[];
  sourceText: string | null;
  customerConfirmed: boolean;
  active: boolean;
};

type PersonaCandidate = { id: string; confidence: number; evidence?: string[] };

type QueueItem = {
  id: string;
  priority: string;
  createdAt: string;
  brandId?: string | null;
  extractionConfidence?: string | null;
  contact: { id: string; name?: string | null; email?: string | null; pipelineStatus?: string | null; propertyInterest?: string | null };
  counts: { personas: number; lifestyle: number };
};

type RevisionDraft = {
  brand: string;
  summary: string;
  purchaseReadiness: string;
  budgetAmount: number | null;
  budgetCurrency: string;
  budgetIncludesCosts: boolean | null;
  budgetApproximate: boolean;
  locationFlexible: boolean;
  revisionNote: string;
  criteria: Criterion[];
};

type ApprovalPreview = {
  action: "revise_existing_profile" | "create_initial_profile";
  contact: { id: string; name?: string | null; email?: string | null; brand?: string | null; pipelineStatus?: string | null };
  activeProfile: { id: string; version: number; summary?: string | null } | null;
  personas: PersonaCandidate[];
  proposedLifestyleCriteria: Criterion[];
  existingCriteria: Criterion[];
  revisionDraft: RevisionDraft | null;
};

function humanize(value: string) {
  return value.replaceAll("_", " ").replaceAll(":", " · ");
}

function routingPersonaCriterion(persona: PersonaCandidate): Criterion {
  return {
    criterionType: "hard_requirement",
    key: "other",
    otherKey: "routing_persona",
    operator: "eq",
    value: persona.id,
    weight: null,
    severity: null,
    appliesToPropertyTypes: [],
    sourceText: `Godkjent routing-persona fra Buyer Intake. AI confidence ${Math.round(persona.confidence * 100)}%. Evidence: ${(persona.evidence || []).join(" | ").slice(0, 350) || "ikke oppgitt"}`,
    customerConfirmed: false,
    active: true,
  };
}

export default function BuyerIntakeReviewsPage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<ApprovalPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [selectedCriteria, setSelectedCriteria] = useState<Set<string>>(new Set());
  const [selectedPersonaId, setSelectedPersonaId] = useState("");

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/nexus/buyer-intake/reviews?limit=50", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
      setItems(Array.isArray(body?.items) ? body.items : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke laste Buyer Intake reviews");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadQueue(); }, [loadQueue]);

  const openReview = async (workItemId: string) => {
    setSelectedId(workItemId);
    setPreview(null);
    setPreviewLoading(true);
    setError("");
    setSuccess("");
    setSelectedPersonaId("");
    try {
      const response = await fetch(`/api/nexus/buyer-intake/approval-preview?workItemId=${encodeURIComponent(workItemId)}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
      const next = body as ApprovalPreview;
      setPreview(next);
      setSelectedCriteria(new Set((next.proposedLifestyleCriteria || []).map((criterion) => criterion.otherKey || criterion.key)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke åpne Buyer Intake review");
    } finally {
      setPreviewLoading(false);
    }
  };

  const selectedLifestyle = useMemo(() => {
    if (!preview) return [];
    return preview.proposedLifestyleCriteria.filter((criterion) => selectedCriteria.has(criterion.otherKey || criterion.key));
  }, [preview, selectedCriteria]);

  const selectedPersona = useMemo(() => preview?.personas.find((persona) => persona.id === selectedPersonaId) || null, [preview, selectedPersonaId]);

  const effectiveCriteria = useMemo(() => {
    if (!preview) return [];
    const replacements = new Set(selectedLifestyle.map((criterion) => `${criterion.key}:${criterion.otherKey || ""}`));
    if (selectedPersona) replacements.add("other:routing_persona");
    const existing = preview.existingCriteria.filter((criterion) => !replacements.has(`${criterion.key}:${criterion.otherKey || ""}`));
    return [...existing, ...selectedLifestyle, ...(selectedPersona ? [routingPersonaCriterion(selectedPersona)] : [])];
  }, [preview, selectedLifestyle, selectedPersona]);

  const approveRevision = async () => {
    if (!selectedId || !preview?.activeProfile || !preview.revisionDraft || (selectedLifestyle.length === 0 && !selectedPersona)) return;
    setApproving(true);
    setError("");
    setSuccess("");
    try {
      const revisionResponse = await fetch(`/api/lead-intelligence/buyer-profiles/${preview.activeProfile.id}/revision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...preview.revisionDraft, criteria: effectiveCriteria }),
      });
      const revisionBody = await revisionResponse.json().catch(() => ({}));
      if (!revisionResponse.ok) throw new Error(revisionBody?.error?.message || revisionBody?.error || `Revision failed: HTTP ${revisionResponse.status}`);
      const buyerProfileId = String(revisionBody?.result?.buyerProfileId || "").trim();
      if (!buyerProfileId) throw new Error("Ny Buyer Profile-versjon ble opprettet, men responsen manglet buyerProfileId.");

      const completeResponse = await fetch("/api/nexus/buyer-intake/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workItemId: selectedId, buyerProfileId }),
      });
      const completeBody = await completeResponse.json().catch(() => ({}));
      if (!completeResponse.ok) throw new Error(`Profil v${revisionBody?.result?.version || "ny"} ble opprettet, men intake kunne ikke lukkes: ${completeBody?.error || `HTTP ${completeResponse.status}`}`);

      setSuccess(`Buyer Intake er godkjent. Buyer Profile v${revisionBody?.result?.version || "ny"} er aktiv${selectedPersona ? ` med routing-persona «${humanize(selectedPersona.id)}»` : ""}.`);
      setPreview(null);
      setSelectedId(null);
      setSelectedCriteria(new Set());
      setSelectedPersonaId("");
      await loadQueue();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke godkjenne Buyer Intake");
    } finally {
      setApproving(false);
    }
  };

  return (
    <main className="mx-auto max-w-[1500px] space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-700">Nexus Buyer Intelligence · Real Estate</p>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Buyer Intake Review Queue</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">Godkjenn dokumenterte fakta og eventuelt én routing-persona før de blir del av den versjonerte Buyer Profile. AI foreslår; du bestemmer.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/nexus-os/buyer-intake" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-700">Ny Buyer Intake</Link>
          <button onClick={() => void loadQueue()} disabled={loading || approving} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:opacity-50">{loading ? "Oppdaterer …" : "Oppdater kø"}</button>
        </div>
      </section>

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">{error}</div> : null}
      {success ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{success}</div> : null}

      <div className="grid gap-5 xl:grid-cols-[430px_minmax(0,1fr)]">
        <section className="space-y-3">
          {!loading && !items.length ? <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Ingen Buyer Intake reviews venter.</div> : null}
          {items.map((item) => <button key={item.id} onClick={() => void openReview(item.id)} disabled={approving} className={`w-full rounded-2xl border p-4 text-left shadow-sm transition disabled:opacity-60 ${selectedId === item.id ? "border-cyan-400 bg-cyan-50" : "border-slate-200 bg-white hover:border-slate-400"}`}>
            <div className="flex items-center justify-between gap-3"><span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-black uppercase text-slate-700">{item.priority}</span><span className="text-[11px] text-slate-500">{new Date(item.createdAt).toLocaleDateString("nb-NO")}</span></div>
            <div className="mt-3 text-base font-black text-slate-950">{item.contact.name || item.contact.email || "Ukjent lead"}</div>
            <div className="mt-1 text-xs text-slate-500">{item.brandId || "Ukjent brand"} · {item.contact.pipelineStatus || "ukjent stage"}</div>
            {item.contact.propertyInterest ? <div className="mt-2 text-xs font-semibold text-slate-700">{item.contact.propertyInterest}</div> : null}
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold"><span className="rounded-lg bg-violet-50 px-2 py-1 text-violet-800">{item.counts.personas} persona</span><span className="rounded-lg bg-cyan-50 px-2 py-1 text-cyan-800">{item.counts.lifestyle} lifestyle</span><span className="rounded-lg bg-slate-100 px-2 py-1 text-slate-700">OCR {item.extractionConfidence || "ukjent"}</span></div>
          </button>)}
        </section>

        <section className="min-h-[480px] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          {!selectedId ? <div className="flex min-h-[400px] items-center justify-center text-sm text-slate-500">Velg en intake i køen for å reviewe den.</div> : null}
          {previewLoading ? <div className="flex min-h-[400px] items-center justify-center text-sm font-bold text-slate-600">Laster Buyer Profile og evidence …</div> : null}
          {preview && !previewLoading ? <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="text-xs font-black uppercase tracking-wide text-slate-500">{preview.action === "revise_existing_profile" ? "Ny profilrevision" : "Første Buyer Profile"}</div><h3 className="mt-1 text-2xl font-black text-slate-950">{preview.contact.name || preview.contact.email || "CRM lead"}</h3><div className="mt-1 text-sm text-slate-500">{preview.contact.brand || "Ukjent brand"} · {preview.contact.pipelineStatus || "ukjent stage"}</div></div>{preview.activeProfile ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-800">Aktiv Buyer Profile v{preview.activeProfile.version}</div> : <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800">Ingen aktiv Buyer Profile</div>}</div>

            {preview.personas.length ? <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4"><div className="text-xs font-black uppercase tracking-wide text-violet-800">Routing-persona · velg maks én</div><p className="mt-1 text-xs text-violet-700">Ingen Persona er forhåndsgodkjent. Valget lagres som godkjent `routing_persona` i neste Buyer Profile-versjon.</p><div className="mt-3 grid gap-2 md:grid-cols-2">{preview.personas.map((persona) => <label key={persona.id} className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${selectedPersonaId === persona.id ? "border-violet-400 bg-white" : "border-violet-200 bg-violet-50"}`}><input type="radio" name="routing-persona" checked={selectedPersonaId === persona.id} disabled={approving} onChange={() => setSelectedPersonaId(persona.id)} className="mt-1" /><div><div className="text-sm font-black text-slate-900">{humanize(persona.id)}</div><div className="mt-1 text-xs font-bold text-violet-700">AI confidence {Math.round(persona.confidence * 100)}%</div>{persona.evidence?.length ? <div className="mt-1 text-xs text-slate-600">{persona.evidence.slice(0, 2).join(" · ")}</div> : null}</div></label>)}</div>{selectedPersonaId ? <button type="button" onClick={() => setSelectedPersonaId("")} className="mt-3 text-xs font-black text-violet-800 underline">Ikke godkjenn Persona</button> : null}</div> : null}

            <div><div className="flex items-center justify-between gap-3"><div className="text-xs font-black uppercase tracking-wide text-slate-500">Nye lifestyle-signaler</div><div className="text-xs font-bold text-cyan-800">{selectedLifestyle.length} valgt</div></div><div className="mt-3 grid gap-2 md:grid-cols-2">{preview.proposedLifestyleCriteria.length ? preview.proposedLifestyleCriteria.map((criterion) => { const id = criterion.otherKey || criterion.key; const checked = selectedCriteria.has(id); return <label key={id} className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${checked ? "border-cyan-300 bg-cyan-50" : "border-slate-200 bg-slate-50"}`}><input type="checkbox" checked={checked} disabled={approving} onChange={() => setSelectedCriteria((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })} className="mt-1" /><div><div className="text-sm font-black text-slate-900">{humanize(id)}</div><div className="mt-1 text-xs text-slate-600">Evidence: {criterion.sourceText || "ikke vist"}</div><div className="mt-1 text-[11px] font-bold text-slate-500">Weight {criterion.weight ?? "–"} · eksplisitt skjemaevidence</div></div></label>; }) : <div className="text-sm text-slate-500">Ingen eksplisitte lifestyle-signaler funnet.</div>}</div></div>

            <div className="grid gap-4 lg:grid-cols-2"><div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs font-black uppercase tracking-wide text-slate-500">Eksisterende aktive kriterier</div><div className="mt-2 text-3xl font-black text-slate-950">{preview.existingCriteria.length}</div><div className="mt-2 text-xs text-slate-600">Tidligere budsjett-, område-, bolig-, persona- og lifestyle-data beholdes til du eksplisitt erstatter samme nøkkel.</div></div><div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4"><div className="text-xs font-black uppercase tracking-wide text-cyan-700">Profil etter valgene</div><div className="mt-2 text-3xl font-black text-slate-950">{effectiveCriteria.length}</div><div className="mt-2 text-xs text-slate-600">Valgt Persona erstatter kun `routing_persona`; valgte lifestyle-signaler erstatter kun samme namespacede nøkkel.</div></div></div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800">Godkjenning oppdaterer Buyer Profile. Den sender ikke e-post. Lead Nurture LIVE styres separat.</div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5"><Link href={`/customers/${preview.contact.id}`} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-black text-slate-700">Customer 360</Link>{preview.activeProfile && preview.revisionDraft ? <button onClick={() => void approveRevision()} disabled={approving || (selectedLifestyle.length === 0 && !selectedPersona)} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-black text-white disabled:opacity-50">{approving ? "Godkjenner og versjonerer …" : "Godkjenn valg + lag ny Buyer Profile-versjon"}</button> : <Link href="/lead-intelligence" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-black text-amber-900">Opprett første profil i Lead Intelligence →</Link>}</div>
          </div> : null}
        </section>
      </div>
    </main>
  );
}