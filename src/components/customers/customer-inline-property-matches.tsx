"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ExternalLink, ListPlus, Loader2, Search, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MatchList,
  PropertyEligibilityBadge,
  PropertyMatchThumbnail,
  propertyDisplayName,
  propertyFactsLine,
  type LeadIntelligencePropertyMatch,
} from "@/components/lead-intelligence/property-match-display";

type ShortlistDecision = "current" | "maybe" | "needs_research";
type QualityReviewStatus = "client_ready" | "needs_review" | "ask_agent" | "verify_price_availability";

type QualityReview = {
  status: QualityReviewStatus;
  note: string;
  checkedAt: string;
  checkedBy: string;
};

type ShortlistSaveResult = {
  shortlistId: string;
  duplicate: boolean;
  itemCount: number;
};

interface Props {
  brand: string;
  buyerProfileId: string;
  correlationId: string;
  matched: number;
  bestEffort: boolean;
  matches: LeadIntelligencePropertyMatch[];
  onSaved?: () => void;
}

const decisionOptions: Array<{ value: ShortlistDecision; label: string }> = [
  { value: "current", label: "Aktuell" },
  { value: "maybe", label: "Kanskje" },
  { value: "needs_research", label: "Må undersøkes" },
];

const qualityOptions: Array<{ value: QualityReviewStatus; label: string }> = [
  { value: "needs_review", label: "Må sjekkes" },
  { value: "verify_price_availability", label: "Verifiser pris/tilgjengelighet" },
  { value: "ask_agent", label: "Spør utbygger/megler" },
  { value: "client_ready", label: "Klar for kunde" },
];

function defaultQualityReview(): QualityReview {
  return {
    status: "needs_review",
    note: "",
    checkedAt: new Date().toISOString(),
    checkedBy: "Freddy",
  };
}

function eligibilityText(match: LeadIntelligencePropertyMatch) {
  if (match.eligibility === "eligible") return "Består harde krav";
  if (match.eligibility === "conditional") return "Består med forbehold";
  return "Avvist av harde krav";
}

function qualityLabel(status: QualityReviewStatus) {
  return qualityOptions.find((option) => option.value === status)?.label || status;
}

export function CustomerInlinePropertyMatches({
  brand,
  buyerProfileId,
  correlationId,
  matched,
  bestEffort,
  matches,
  onSaved,
}: Props) {
  const [decisions, setDecisions] = useState<Record<string, ShortlistDecision>>({});
  const [qualityReviews, setQualityReviews] = useState<Record<string, QualityReview>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveResult, setSaveResult] = useState<ShortlistSaveResult | null>(null);

  const selectedMatches = useMemo(
    () => matches.filter((match) => Boolean(decisions[match.propertyId]) && match.eligibility !== "rejected"),
    [decisions, matches],
  );

  function invalidateSavedState() {
    setSaveError("");
    setSaveResult(null);
  }

  function updateDecision(propertyId: string, decision: ShortlistDecision) {
    invalidateSavedState();
    setDecisions((current) => {
      if (current[propertyId] === decision) {
        const next = { ...current };
        delete next[propertyId];
        return next;
      }
      return { ...current, [propertyId]: decision };
    });
    setQualityReviews((current) => current[propertyId]
      ? current
      : { ...current, [propertyId]: defaultQualityReview() });
  }

  function updateQualityStatus(propertyId: string, status: QualityReviewStatus) {
    invalidateSavedState();
    setQualityReviews((current) => ({
      ...current,
      [propertyId]: {
        ...(current[propertyId] || defaultQualityReview()),
        status,
        checkedAt: new Date().toISOString(),
      },
    }));
  }

  function updateQualityNote(propertyId: string, note: string) {
    invalidateSavedState();
    setQualityReviews((current) => ({
      ...current,
      [propertyId]: {
        ...(current[propertyId] || defaultQualityReview()),
        note: note.slice(0, 2000),
      },
    }));
  }

  async function saveShortlist() {
    if (selectedMatches.length === 0) return;
    setSaving(true);
    setSaveError("");
    setSaveResult(null);
    try {
      const response = await fetch("/api/lead-intelligence/shortlists", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-correlation-id": correlationId,
        },
        body: JSON.stringify({
          brand,
          buyerProfileId,
          title: `CRM shortlist ${new Date().toLocaleDateString("nb-NO")}`,
          idempotencySeed: correlationId,
          items: selectedMatches.map((match) => {
            const review = qualityReviews[match.propertyId] || defaultQualityReview();
            return {
              propertyId: match.propertyId,
              decision: decisions[match.propertyId],
              qualityReview: {
                status: review.status,
                note: review.note.trim() || null,
                checkedAt: review.checkedAt,
                checkedBy: review.checkedBy,
              },
            };
          }),
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) {
        throw new Error(body?.error?.message || body?.error || "Kunne ikke lagre shortlist-utkastet.");
      }
      setSaveResult({
        shortlistId: String(body.result?.shortlistId || ""),
        duplicate: Boolean(body.result?.duplicate),
        itemCount: Number(body.result?.itemCount || selectedMatches.length),
      });
      onSaved?.();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Kunne ikke lagre shortlist-utkastet.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-3 rounded-xl border border-cyan-500/25 bg-cyan-500/5 p-3 sm:p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-cyan-100">
            <Search size={16} /> Beste boligmatcher
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Matching-preview viser {matches.length} bolig{matches.length === 1 ? "" : "er"}; {matched} består kravene. Velg bare boliger du faktisk vil ta videre.
          </p>
        </div>
        <Badge variant="secondary">Buyer Profile aktiv</Badge>
      </div>

      {bestEffort && (
        <div className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-100">
          Ingen bolig i kandidatsettet bestod alle harde krav. Resultatene under er kun best-effort og kan ikke legges i shortlist fra dette panelet.
        </div>
      )}

      {matches.length === 0 ? (
        <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/50 p-4 text-sm text-slate-400">
          Ingen matchende boliger ble funnet i dette søket. Buyer Profile er fortsatt lagret og kan brukes i senere matching.
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {matches.map((match, index) => {
            const decision = decisions[match.propertyId];
            const review = qualityReviews[match.propertyId] || defaultQualityReview();
            const selectable = match.eligibility !== "rejected";
            return (
              <article key={match.propertyId} className="rounded-xl border border-slate-700 bg-slate-950/55 p-3">
                <div className="flex flex-col gap-3 lg:flex-row">
                  <PropertyMatchThumbnail match={match} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">#{index + 1} · Match {Math.round(match.score)}/100</p>
                        <h4 className="mt-1 text-sm font-semibold text-white">{propertyDisplayName(match)}</h4>
                        <p className="mt-1 text-xs text-slate-400">{propertyFactsLine(match) || "Begrensede boligdata"}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <PropertyEligibilityBadge eligibility={match.eligibility} />
                        <Badge variant="secondary">Datakvalitet {Math.round(match.dataQualityScore)}/100</Badge>
                      </div>
                    </div>

                    <p className="mt-2 text-xs text-slate-500">{eligibilityText(match)}</p>
                    <div className="mt-3 grid gap-3 lg:grid-cols-2">
                      <MatchList title="Hvorfor den matcher" items={match.reasonsForMatch.slice(0, 4)} emptyLabel="Ingen positive matchforklaringer tilgjengelig." />
                      <MatchList title="Forbehold" items={match.concerns.slice(0, 3)} emptyLabel="Ingen registrerte forbehold." />
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {decisionOptions.map((option) => (
                        <Button
                          key={option.value}
                          type="button"
                          size="sm"
                          variant={decision === option.value ? "default" : "outline"}
                          disabled={!selectable}
                          onClick={() => updateDecision(match.propertyId, option.value)}
                        >
                          {option.label}
                        </Button>
                      ))}
                      {match.property.publicUrl && (
                        <a
                          href={match.property.publicUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-8 items-center rounded-md border border-slate-700 px-3 text-xs font-medium text-slate-200 hover:bg-slate-800"
                        >
                          <ExternalLink size={13} className="mr-2" /> Åpne bolig
                        </a>
                      )}
                    </div>

                    {decision && selectable && (
                      <div className="mt-3 rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-200">Kvalitet før shortlist</p>
                            <p className="mt-1 text-xs text-slate-500">Standard er «Må sjekkes». Bare du kan gjøre boligen «Klar for kunde».</p>
                          </div>
                          <select
                            value={review.status}
                            onChange={(event) => updateQualityStatus(match.propertyId, event.target.value as QualityReviewStatus)}
                            className="h-9 rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-slate-100"
                          >
                            {qualityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </select>
                        </div>
                        <textarea
                          value={review.note}
                          onChange={(event) => updateQualityNote(match.propertyId, event.target.value)}
                          rows={2}
                          placeholder="Valgfritt kvalitetssjekk-notat, f.eks. pris må bekreftes eller ring utbygger."
                          className="mt-2 w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-cyan-500"
                        />
                        <div className="mt-2 flex items-center gap-2 text-xs text-slate-500"><ShieldCheck size={13} />{qualityLabel(review.status)}</div>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {saveError && <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{saveError}</div>}
      {saveResult && (
        <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
          <div className="flex items-center gap-2 font-semibold"><CheckCircle2 size={15} />Shortlist-utkast lagret</div>
          <p className="mt-1 text-xs text-emerald-100/80">
            {saveResult.itemCount} bolig{saveResult.itemCount === 1 ? "" : "er"} er lagt i shortlist. {saveResult.duplicate ? "Eksisterende identisk utkast ble gjenbrukt." : "Ingen kundeinformasjon er sendt."}
          </p>
        </div>
      )}

      {selectedMatches.length > 0 && (
        <div className="mt-3 flex flex-col gap-2 border-t border-slate-800 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">{selectedMatches.length} bolig{selectedMatches.length === 1 ? "" : "er"} valgt. Shortlist lagres som utkast og sendes ikke til kunden.</p>
          <Button type="button" size="sm" onClick={saveShortlist} disabled={saving}>
            {saving ? <Loader2 size={14} className="mr-2 animate-spin" /> : <ListPlus size={14} className="mr-2" />}
            Lag shortlist-utkast
          </Button>
        </div>
      )}
    </section>
  );
}
