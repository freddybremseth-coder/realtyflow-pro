"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

interface QueueItem {
  id: string;
  title: string;
  status: string;
  priority: string;
  createdAt: string;
  brandId?: string | null;
  extractionConfidence?: string | null;
  formType?: string | null;
  contact: {
    id: string;
    name?: string | null;
    email?: string | null;
    pipelineStatus?: string | null;
    propertyInterest?: string | null;
    pipelineValue?: number | null;
  };
  counts: { personas: number; lifestyle: number };
}

interface Criterion {
  criterionType: string;
  key: string;
  otherKey: string | null;
  operator: string;
  value: unknown;
  weight: number | null;
  sourceText: string | null;
  customerConfirmed: boolean;
}

interface ApprovalPreview {
  action: "revise_existing_profile" | "create_initial_profile";
  contact: {
    id: string;
    name?: string | null;
    email?: string | null;
    brand?: string | null;
    pipelineStatus?: string | null;
  };
  activeProfile: {
    id: string;
    version: number;
    summary?: string | null;
  } | null;
  personas: Array<{ id: string; confidence: number; evidence?: string[] }>;
  proposedLifestyleCriteria: Criterion[];
  existingCriteria: Criterion[];
  mergedCriteria: Criterion[];
  safety: { readOnly: boolean; explicitApprovalRequired: boolean };
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replaceAll(":", " · ");
}

function priorityClass(priority: string) {
  return priority === "high"
    ? "border-rose-200 bg-rose-50 text-rose-800"
    : "border-slate-200 bg-slate-50 text-slate-700";
}

function criterionLabel(criterion: Criterion) {
  return humanize(criterion.otherKey || criterion.key);
}

export default function BuyerIntakeReviewsPage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<ApprovalPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [selectedCriteria, setSelectedCriteria] = useState<Set<string>>(new Set());

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

  const selectedCount = selectedCriteria.size;
  const effectiveCriteria = useMemo(() => {
    if (!preview) return [];
    const selectedLifestyle = preview.proposedLifestyleCriteria.filter((criterion) => selectedCriteria.has(criterion.otherKey || criterion.key));
    const replaceKeys = new Set(selectedLifestyle.map((criterion) => `${criterion.key}:${criterion.otherKey || ""}`));
    const existing = preview.existingCriteria.filter((criterion) => !replaceKeys.has(`${criterion.key}:${criterion.otherKey || ""}`));
    return [...existing, ...selectedLifestyle];
  }, [preview, selectedCriteria]);

  return (
    <main className="mx-auto max-w-[1500px] space-y-6 px-4 py-8 sm:px-6">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-700">Nexus Buyer Intelligence</p>
          <h2 className="mt-1 text-3xl font-black tracking-tight text-slate-950">Buyer Intake Review Queue</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
            Review skjema- og bildebaserte signaler før de blir del av Buyer Profile. Eksisterende boligkrav beholdes; nye lifestyle-signaler må velges eksplisitt.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/nexus-os/buyer-intake" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-700">Ny Buyer Intake</Link>
          <button onClick={() => void loadQueue()} disabled={loading} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:opacity-50">{loading ? "Oppdaterer …" : "Oppdater kø"}</button>
        </div>
      </section>

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">{error}</div> : null}

      <div className="grid gap-5 xl:grid-cols-[430px_minmax(0,1fr)]">
        <section className="space-y-3">
          {!loading && items.length === 0 ? <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Ingen Buyer Intake reviews venter.</div> : null}
          {items.map((item) => (
            <button key={item.id} onClick={() => void openReview(item.id)} className={`w-full rounded-2xl border p-4 text-left shadow-sm transition ${selectedId === item.id ? "border-cyan-400 bg-cyan-50" : "border-slate-200 bg-white hover:border-slate-400"}`}>
              <div className="flex items-center justify-between gap-3">
                <span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase ${priorityClass(item.priority)}`}>{item.priority}</span>
                <span className="text-[11px] text-slate-500">{new Date(item.createdAt).toLocaleDateString("nb-NO")}</span>
              </div>
              <div className="mt-3 text-base font-black text-slate-950">{item.contact.name || item.contact.email || "Ukjent lead"}</div>
              <div className="mt-1 text-xs text-slate-500">{item.brandId || "Ukjent brand"} · {item.contact.pipelineStatus || "ukjent stage"}</div>
              {item.contact.propertyInterest ? <div className="mt-2 text-xs font-semibold text-slate-700">{item.contact.propertyInterest}</div> : null}
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold">
                <span className="rounded-lg bg-violet-50 px-2 py-1 text-violet-800">{item.counts.personas} persona</span>
                <span className="rounded-lg bg-cyan-50 px-2 py-1 text-cyan-800">{item.counts.lifestyle} lifestyle</span>
                <span className="rounded-lg bg-slate-100 px-2 py-1 text-slate-700">OCR {item.extractionConfidence || "ukjent"}</span>
              </div>
            </button>
          ))}
        </section>

        <section className="min-h-[480px] rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {!selectedId ? <div className="flex min-h-[400px] items-center justify-center text-sm text-slate-500">Velg en intake i køen for å reviewe den.</div> : null}
          {previewLoading ? <div className="flex min-h-[400px] items-center justify-center text-sm font-bold text-slate-600">Laster Buyer Profile og evidence …</div> : null}
          {preview && !previewLoading ? (
            <div className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-black uppercase tracking-wide text-slate-500">{preview.action === "revise_existing_profile" ? "Ny profilrevision" : "Første Buyer Profile"}</div>
                  <h3 className="mt-1 text-2xl font-black text-slate-950">{preview.contact.name || preview.contact.email || "CRM lead"}</h3>
                  <div className="mt-1 text-sm text-slate-500">{preview.contact.brand || "Ukjent brand"} · {preview.contact.pipelineStatus || "ukjent stage"}</div>
                </div>
                {preview.activeProfile ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-800">Aktiv Buyer Profile v{preview.activeProfile.version}</div> : <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800">Ingen aktiv Buyer Profile</div>}
              </div>

              {preview.personas.length ? (
                <div>
                  <div className="text-xs font-black uppercase tracking-wide text-slate-500">Persona-kontekst — ikke persistet som kriterium</div>
                  <div className="mt-2 flex flex-wrap gap-2">{preview.personas.map((persona) => <span key={persona.id} className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-bold text-violet-800">{humanize(persona.id)} · {Math.round(persona.confidence * 100)}%</span>)}</div>
                </div>
              ) : null}

              <div>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-black uppercase tracking-wide text-slate-500">Nye lifestyle-signaler fra skjema</div>
                  <div className="text-xs font-bold text-cyan-800">{selectedCount} valgt</div>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {preview.proposedLifestyleCriteria.length ? preview.proposedLifestyleCriteria.map((criterion) => {
                    const id = criterion.otherKey || criterion.key;
                    const checked = selectedCriteria.has(id);
                    return <label key={id} className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${checked ? "border-cyan-300 bg-cyan-50" : "border-slate-200 bg-slate-50"}`}>
                      <input type="checkbox" checked={checked} onChange={() => setSelectedCriteria((current) => {
                        const next = new Set(current);
                        if (next.has(id)) next.delete(id); else next.add(id);
                        return next;
                      })} className="mt-1" />
                      <div>
                        <div className="text-sm font-black text-slate-900">{criterionLabel(criterion)}</div>
                        <div className="mt-1 text-xs text-slate-600">Evidence: {criterion.sourceText || "ikke vist"}</div>
                        <div className="mt-1 text-[11px] font-bold text-slate-500">Weight {criterion.weight ?? "–"} · eksplisitt skjemaevidence</div>
                      </div>
                    </label>;
                  }) : <div className="text-sm text-slate-500">Ingen eksplisitte lifestyle-signaler funnet.</div>}
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-black uppercase tracking-wide text-slate-500">Eksisterende aktive kriterier</div>
                  <div className="mt-2 text-3xl font-black text-slate-950">{preview.existingCriteria.length}</div>
                  <div className="mt-2 text-xs text-slate-600">Budsjett, område, boligkrav og tidligere lifestyle beholdes med mindre samme lifestyle-nøkkel erstattes.</div>
                </div>
                <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4">
                  <div className="text-xs font-black uppercase tracking-wide text-cyan-700">Profil etter valgene over</div>
                  <div className="mt-2 text-3xl font-black text-slate-950">{effectiveCriteria.length}</div>
                  <div className="mt-2 text-xs text-slate-600">Ingen lagring skjer på denne siden ennå. Neste gate er eksplisitt approval til eksisterende Lead Intelligence profile/revision.</div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
                <Link href={`/customers/${preview.contact.id}`} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-black text-slate-700">Customer 360</Link>
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-800">Read-only gate · eksplisitt approval kommer i neste steg</div>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
