"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, Bot, CalendarClock, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

type EvidenceCandidate = {
  key: string;
  otherKey?: string | null;
  operator: string;
  value: string | number;
  confidence: number;
  sourceText?: string | null;
};

type EvidenceConflict = {
  field: string;
  values: Array<string | number>;
  reason: string;
};

type SalesAssistantResult = {
  followupBrief?: string | null;
  buyerProfileEvidence?: {
    candidates?: EvidenceCandidate[];
    conflicts?: EvidenceConflict[];
    reviewRecommended?: boolean;
    href?: string;
    persisted?: boolean;
  };
};

const EVIDENCE_LABELS: Record<string, string> = {
  property_type: "Boligtype",
  bedrooms: "Soverom",
  other: "Annet",
};

function evidenceLabel(candidate: EvidenceCandidate) {
  return candidate.otherKey || EVIDENCE_LABELS[candidate.key] || candidate.key;
}

export function CustomerSalesAssistantNote({ contactId, onSaved }: { contactId: string; onSaved?: () => void }) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<SalesAssistantResult | null>(null);

  async function save() {
    if (note.trim().length < 3) return;
    setSaving(true);
    setError("");
    setMessage("");
    setResult(null);
    try {
      const response = await fetch(`/api/customers/${encodeURIComponent(contactId)}/sales-assistant-note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) throw new Error(body?.error || "Kunne ikke behandle notatet.");
      const followup = body.followupApplied ? ` Oppfølging: ${new Date(body.analysis.nextFollowup).toLocaleString("nb-NO")}.` : "";
      const calendar = body.calendar?.created ? " Kalenderavtale opprettet." : body.calendar?.error && body.followupApplied ? " Oppfølgingen er lagret i CRM, men kalenderavtalen ble ikke opprettet." : "";
      setMessage(`AI har strukturert og lagret notatet.${followup}${calendar}`);
      setResult(body);
      setNote("");
      onSaved?.();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Kunne ikke behandle notatet.");
    } finally {
      setSaving(false);
    }
  }

  const candidates = result?.buyerProfileEvidence?.candidates || [];
  const conflicts = result?.buyerProfileEvidence?.conflicts || [];

  return (
    <section className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-lg border border-violet-400/30 bg-violet-500/10 p-2 text-violet-200"><Bot size={19} /></div>
        <div>
          <h3 className="font-semibold text-white">AI salgsassistent</h3>
          <p className="mt-1 text-sm text-slate-400">Skriv naturlig hva som skjedde og hva du vil gjøre. RealtyFlow beholder originalen, finpusser CRM-notatet og setter trygg oppfølging automatisk.</p>
        </div>
      </div>
      <textarea
        className="mt-4 min-h-32 w-full resize-y rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-3 text-sm text-slate-100 outline-none transition focus:border-violet-400/70 focus:ring-2 focus:ring-violet-500/10"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="F.eks. Snakket med kunden. Fortsatt interessert, men er i Norge de neste to ukene. Jeg ringer når han er tilbake og går gjennom nye alternativer."
      />
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-xs text-slate-500"><CalendarClock size={14} />Tydelig oppfølgingstid kan legges i CRM, Nexus Today og Google Calendar.</div>
        <Button type="button" onClick={save} disabled={saving || note.trim().length < 3}>
          {saving ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Sparkles size={16} className="mr-2" />}Tolk og lagre
        </Button>
      </div>
      {error && <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}
      {message && <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{message}</div>}

      {result?.followupBrief && (
        <div className="mt-3 rounded-lg border border-cyan-500/25 bg-cyan-500/5 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-cyan-300">Samtalegrunnlag i Nexus Today</p>
          <p className="mt-1 text-sm text-slate-200">{result.followupBrief}</p>
        </div>
      )}

      {(candidates.length > 0 || conflicts.length > 0) && (
        <div className="mt-3 rounded-lg border border-slate-700 bg-slate-950/45 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-white">Buyer Profile-forslag</p>
              <p className="text-xs text-slate-500">AI kan foreslå eksplisitte fakta, men ingenting blir gjort til hardt kriterium uten review.</p>
            </div>
            {result?.buyerProfileEvidence?.href && (
              <Button asChild size="sm" variant="outline">
                <Link href={result.buyerProfileEvidence.href}>Åpne review</Link>
              </Button>
            )}
          </div>

          {candidates.length > 0 && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {candidates.map((candidate, index) => (
                <div key={`${candidate.key}-${candidate.otherKey || ""}-${index}`} className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                  <div className="flex items-center gap-2 text-xs text-emerald-300"><CheckCircle2 size={14} />{Math.round(candidate.confidence * 100)}% confidence</div>
                  <p className="mt-1 text-sm font-medium text-white">{evidenceLabel(candidate)}: {String(candidate.value)}</p>
                  {candidate.sourceText && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{candidate.sourceText}</p>}
                </div>
              ))}
            </div>
          )}

          {conflicts.length > 0 && (
            <div className="mt-3 space-y-2">
              {conflicts.map((conflict, index) => (
                <div key={`${conflict.field}-${index}`} className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-sm text-amber-100">
                  <div className="flex items-center gap-2 font-medium"><AlertTriangle size={15} />Konflikt: {conflict.field}</div>
                  <p className="mt-1 text-xs text-amber-200/80">{conflict.reason} Verdier: {conflict.values.join(", ")}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
