"use client";

import { type ClipboardEvent, type ChangeEvent, useRef, useState } from "react";
import { AlertTriangle, Bot, CalendarClock, CheckCircle2, ImagePlus, Loader2, Paperclip, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomerInlinePropertyMatches } from "@/components/customers/customer-inline-property-matches";
import type { LeadIntelligencePropertyMatch } from "@/components/lead-intelligence/property-match-display";

type EvidenceCandidate = {
  criterionType: "hard_requirement" | "preference" | "exclusion";
  key: string;
  otherKey?: string | null;
  operator: string;
  value: string | number | boolean;
  weight?: number | null;
  severity?: "reject" | "major_penalty" | "minor_penalty" | null;
  appliesToPropertyTypes?: string[];
  confidence: number;
  sourceText: string;
  conflict?: boolean;
  existingValues?: Array<{ operator: string; value: unknown }>;
};

type EvidenceConflict = {
  field: string;
  values: Array<unknown>;
  reason: string;
};

type SalesAssistantResult = {
  interactionId?: string;
  followupBrief?: string | null;
  buyerProfileEvidence?: {
    brand?: string | null;
    candidates?: EvidenceCandidate[];
    conflicts?: EvidenceConflict[];
    alreadyKnownCount?: number;
    reviewRecommended?: boolean;
    href?: string;
    persisted?: boolean;
    activeProfile?: { buyerProfileId: string; status: string; version: number } | null;
  };
};

type MatchPreview = {
  brand: string;
  buyerProfileId: string;
  correlationId: string;
  matched: number;
  bestEffort: boolean;
  matches: LeadIntelligencePropertyMatch[];
};

const EVIDENCE_LABELS: Record<string, string> = {
  property_type: "Boligtype",
  bedrooms: "Soverom",
  bathrooms: "Bad",
  location: "Område",
  living_area_m2: "Boligareal",
  plot_area_m2: "Tomteareal",
  floor_position: "Etasje",
  purchase_price: "Kjøpspris",
  total_budget: "Totalbudsjett",
  estimated_total_cost: "Estimert totalkostnad",
  distance_to_beach: "Avstand til strand",
  has_lift: "Heis",
  terrace_area_m2: "Terrasse",
  parking: "Parkering",
  pool: "Basseng",
  other: "Annet",
};

const MAX_SOURCE_LENGTH = 30000;
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

function evidenceLabel(candidate: EvidenceCandidate) {
  return candidate.otherKey || EVIDENCE_LABELS[candidate.key] || candidate.key;
}

function evidenceId(candidate: EvidenceCandidate, index: number) {
  return `${index}:${candidate.criterionType}:${candidate.key}:${candidate.otherKey || ""}:${candidate.operator}:${String(candidate.value)}`;
}

function evidenceValue(candidate: EvidenceCandidate) {
  if (candidate.key === "living_area_m2" || candidate.key === "plot_area_m2" || candidate.key === "terrace_area_m2") {
    return `${String(candidate.value)} m²`;
  }
  if (["total_budget", "purchase_price", "estimated_total_cost"].includes(candidate.key) && typeof candidate.value === "number") {
    return new Intl.NumberFormat("nb-NO", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(candidate.value);
  }
  if (candidate.value === true) return "Ja";
  if (candidate.value === false) return "Nei";
  return String(candidate.value);
}

function operatorLabel(operator: string) {
  const labels: Record<string, string> = {
    eq: "=",
    neq: "ikke",
    gt: ">",
    gte: "min.",
    lt: "<",
    lte: "maks.",
    contains: "inneholder",
  };
  return labels[operator] || operator;
}

function attachmentFallback(body: any) {
  const leads = Array.isArray(body?.leads) ? body.leads : [];
  if (leads.length === 0) return "";
  return leads.map((lead: Record<string, unknown>) => [
    lead.name ? `Navn: ${String(lead.name)}` : null,
    lead.email ? `E-post: ${String(lead.email)}` : null,
    lead.phone ? `Telefon: ${String(lead.phone)}` : null,
    lead.property_interest ? `Boliginteresse: ${String(lead.property_interest)}` : null,
    lead.notes ? `Notater: ${String(lead.notes)}` : null,
    lead.preferences ? `Preferanser: ${JSON.stringify(lead.preferences)}` : null,
  ].filter(Boolean).join("\n")).filter(Boolean).join("\n\n");
}

function criterionPayload(candidate: EvidenceCandidate) {
  return {
    criterionType: candidate.criterionType,
    key: candidate.key,
    otherKey: candidate.otherKey || null,
    operator: candidate.operator,
    value: candidate.value,
    weight: candidate.criterionType === "preference" ? candidate.weight ?? 0.7 : null,
    severity: candidate.criterionType === "exclusion" ? candidate.severity || "major_penalty" : null,
    appliesToPropertyTypes: candidate.appliesToPropertyTypes || [],
    sourceText: candidate.sourceText,
    confidence: candidate.confidence,
  };
}

export function CustomerSalesAssistantNote({ contactId, onSaved }: { contactId: string; onSaved?: () => void }) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [applyingEvidence, setApplyingEvidence] = useState(false);
  const [selectedEvidence, setSelectedEvidence] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [importError, setImportError] = useState("");
  const [evidenceMessage, setEvidenceMessage] = useState("");
  const [evidenceError, setEvidenceError] = useState("");
  const [matchPreview, setMatchPreview] = useState<MatchPreview | null>(null);
  const [result, setResult] = useState<SalesAssistantResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function importAttachment(file: File) {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setImportError("Vedlegget er for stort. Maks størrelse er 15 MB.");
      return;
    }
    if (file.type !== "application/pdf" && !file.type.startsWith("image/")) {
      setImportError("Bruk PDF eller bilde. Tekst og e-post kan limes direkte inn i feltet.");
      return;
    }

    setImporting(true);
    setImportError("");
    setImportMessage("");
    setMessage("");
    setError("");
    setEvidenceMessage("");
    setEvidenceError("");
    setMatchPreview(null);
    setSelectedEvidence([]);
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("mode", "customer_context");
      const response = await fetch("/api/contacts/import-document", { method: "POST", body: form });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke lese vedlegget.");

      const extracted = String(body?.rawText || "").trim() || attachmentFallback(body);
      if (!extracted) throw new Error("AI fant ingen lesbar kundetekst i vedlegget.");

      setNote((current) => {
        const prefix = current.trim();
        const separator = prefix ? `\n\n--- Vedlegg: ${file.name} ---\n` : `Vedlegg: ${file.name}\n`;
        return `${prefix}${separator}${extracted}`.slice(0, MAX_SOURCE_LENGTH);
      });
      setImportMessage(`${file.name} er lest inn. Kontroller teksten og trykk «Tolk og lagre» når den ser riktig ut.`);
    } catch (attachmentError) {
      setImportError(attachmentError instanceof Error ? attachmentError.message : "Kunne ikke lese vedlegget.");
    } finally {
      setImporting(false);
    }
  }

  function chooseAttachment() {
    fileInputRef.current?.click();
  }

  function onAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void importAttachment(file);
  }

  function onSourcePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const imageItem = Array.from(event.clipboardData.items).find((item) => item.kind === "file" && item.type.startsWith("image/"));
    if (!imageItem) return;
    const file = imageItem.getAsFile();
    if (!file) return;
    event.preventDefault();
    void importAttachment(file);
  }

  async function save() {
    if (note.trim().length < 3) return;
    setSaving(true);
    setError("");
    setMessage("");
    setEvidenceMessage("");
    setEvidenceError("");
    setMatchPreview(null);
    setSelectedEvidence([]);
    setResult(null);
    try {
      const response = await fetch(`/api/customers/${encodeURIComponent(contactId)}/sales-assistant-note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) throw new Error(body?.error || "Kunne ikke behandle informasjonen.");
      const followup = body.followupApplied ? ` Oppfølging: ${new Date(body.analysis.nextFollowup).toLocaleString("nb-NO")}.` : "";
      const calendar = body.calendar?.created ? " Kalenderavtale opprettet." : body.calendar?.error && body.followupApplied ? " Oppfølgingen er lagret i CRM, men kalenderavtalen ble ikke opprettet." : "";
      setMessage(`AI har strukturert og lagret kundeinformasjonen.${followup}${calendar}`);
      setResult(body);
      const found = Array.isArray(body?.buyerProfileEvidence?.candidates) ? body.buyerProfileEvidence.candidates as EvidenceCandidate[] : [];
      setSelectedEvidence(found.map((candidate, index) => ({ candidate, id: evidenceId(candidate, index) })).filter(({ candidate }) => !candidate.conflict).map(({ id }) => id));
      setNote("");
      setImportMessage("");
      onSaved?.();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Kunne ikke behandle informasjonen.");
    } finally {
      setSaving(false);
    }
  }

  function toggleEvidence(id: string) {
    setSelectedEvidence((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function selectAllSafe() {
    setSelectedEvidence(candidates
      .map((candidate, index) => ({ candidate, id: evidenceId(candidate, index) }))
      .filter(({ candidate }) => !candidate.conflict)
      .map(({ id }) => id));
  }

  async function approveSelectedAndMatch() {
    const brand = result?.buyerProfileEvidence?.brand;
    const interactionId = result?.interactionId;
    if (!brand || !interactionId) return;
    const selected = candidates.filter((candidate, index) => selectedEvidence.includes(evidenceId(candidate, index)));
    if (selected.length === 0) return;

    setApplyingEvidence(true);
    setEvidenceMessage("");
    setEvidenceError("");
    setMatchPreview(null);
    try {
      const applyResponse = await fetch(`/api/customers/${encodeURIComponent(contactId)}/buyer-profile-evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand,
          interactionId,
          criteria: selected.map(criterionPayload),
        }),
      });
      const applyBody = await applyResponse.json().catch(() => null);
      if (!applyResponse.ok || !applyBody?.ok) {
        throw new Error(applyBody?.error || "Kunne ikke godkjenne Buyer Profile-opplysningene.");
      }

      const buyerProfileId = String(applyBody.result?.buyerProfileId || "");
      setEvidenceMessage(`${selected.length} opplysning${selected.length === 1 ? "" : "er"} er godkjent i Buyer Profile v${applyBody.result?.version || "?"}.`);
      setResult((current) => current ? {
        ...current,
        buyerProfileEvidence: current.buyerProfileEvidence ? { ...current.buyerProfileEvidence, persisted: true } : current.buyerProfileEvidence,
      } : current);
      onSaved?.();

      if (!buyerProfileId) return;
      const matchResponse = await fetch("/api/lead-intelligence/property-matches/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand,
          buyerProfileId,
          autoDiscover: true,
          candidateLimit: 120,
          maxResults: 10,
        }),
      });
      const matchBody = await matchResponse.json().catch(() => null);
      if (!matchResponse.ok || !matchBody?.ok) {
        const message = matchBody?.error?.message || matchBody?.error || "Matching-preview er ikke tilgjengelig akkurat nå.";
        setEvidenceError(`Buyer Profile er oppdatert, men ${message}`);
        return;
      }
      const matches = Array.isArray(matchBody.result?.matches) ? matchBody.result.matches as LeadIntelligencePropertyMatch[] : [];
      setMatchPreview({
        brand,
        buyerProfileId,
        correlationId: String(matchBody.correlationId || matchResponse.headers.get("x-correlation-id") || crypto.randomUUID()),
        matched: Number(matchBody.result?.matched || 0),
        bestEffort: Boolean(matchBody.result?.bestEffort),
        matches,
      });
    } catch (applyError) {
      setEvidenceError(applyError instanceof Error ? applyError.message : "Kunne ikke godkjenne Buyer Profile-opplysningene.");
    } finally {
      setApplyingEvidence(false);
    }
  }

  const candidates = result?.buyerProfileEvidence?.candidates || [];
  const conflicts = result?.buyerProfileEvidence?.conflicts || [];
  const alreadyKnownCount = result?.buyerProfileEvidence?.alreadyKnownCount || 0;
  const selectedCount = candidates.filter((candidate, index) => selectedEvidence.includes(evidenceId(candidate, index))).length;
  const canApprove = Boolean(
    result?.buyerProfileEvidence?.reviewRecommended
      && result?.buyerProfileEvidence?.brand
      && result?.interactionId
      && selectedCount > 0
      && !result?.buyerProfileEvidence?.persisted,
  );

  return (
    <section className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-lg border border-violet-400/30 bg-violet-500/10 p-2 text-violet-200"><Bot size={19} /></div>
        <div>
          <h3 className="font-semibold text-white">AI kundeinformasjon</h3>
          <p className="mt-1 text-sm text-slate-400">Lim inn hele e-posttråder, WhatsApp, SMS eller notater. Du kan også lime inn et skjermbilde eller laste opp bilde/PDF. AI skiller kundens egne utsagn fra interne meldinger, signaturer og gammel historikk.</p>
        </div>
      </div>

      <textarea
        className="mt-4 min-h-40 w-full resize-y rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-3 text-sm text-slate-100 outline-none transition focus:border-violet-400/70 focus:ring-2 focus:ring-violet-500/10"
        value={note}
        onChange={(event) => setNote(event.target.value.slice(0, MAX_SOURCE_LENGTH))}
        onPaste={onSourcePaste}
        placeholder="Lim inn korrespondanse eller skriv et notat. Eksempel: en komplett videresendt e-posttråd med kundens ønsker, svar og intern oppfølging."
      />

      <input
        ref={fileInputRef}
        className="hidden"
        type="file"
        accept="application/pdf,image/*"
        onChange={onAttachmentChange}
      />

      <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1 text-xs text-slate-500">
          <div className="flex items-center gap-2"><Paperclip size={14} />Originalteksten beholdes i kundehistorikken. Nye Buyer Profile-fakta krever din godkjenning.</div>
          <div>{note.length.toLocaleString("nb-NO")} / {MAX_SOURCE_LENGTH.toLocaleString("nb-NO")} tegn</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={chooseAttachment} disabled={importing || saving}>
            {importing ? <Loader2 size={16} className="mr-2 animate-spin" /> : <ImagePlus size={16} className="mr-2" />}Bilde / PDF
          </Button>
          <Button type="button" onClick={save} disabled={saving || importing || note.trim().length < 3}>
            {saving ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Sparkles size={16} className="mr-2" />}Tolk og lagre
          </Button>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2 text-xs text-slate-500"><CalendarClock size={14} />Bare tydelig fremtidig oppfølging kan legges i CRM, Nexus Today og Google Calendar. Gamle besøksdatoer behandles som historikk.</div>
      {importError && <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{importError}</div>}
      {importMessage && <div className="mt-3 rounded-lg border border-cyan-500/25 bg-cyan-500/5 p-3 text-sm text-cyan-100">{importMessage}</div>}
      {error && <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}
      {message && <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{message}</div>}

      {result?.followupBrief && (
        <div className="mt-3 rounded-lg border border-cyan-500/25 bg-cyan-500/5 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-cyan-300">Samtalegrunnlag i Nexus Today</p>
          <p className="mt-1 text-sm text-slate-200">{result.followupBrief}</p>
        </div>
      )}

      {(candidates.length > 0 || conflicts.length > 0 || alreadyKnownCount > 0) && (
        <div className="mt-3 rounded-lg border border-slate-700 bg-slate-950/45 p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">AI fant Buyer Profile-fakta</p>
              <p className="text-xs text-slate-500">Velg opplysningene du vil gjøre autoritative. Ingenting godkjennes før du trykker knappen.</p>
              {alreadyKnownCount > 0 && <p className="mt-1 text-xs text-emerald-300">{alreadyKnownCount} opplysning{alreadyKnownCount === 1 ? "" : "er"} var allerede korrekt i aktiv profil.</p>}
            </div>
            {candidates.length > 0 && !result?.buyerProfileEvidence?.persisted && (
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={selectAllSafe}>Velg alle uten konflikt</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setSelectedEvidence([])}>Fjern alle</Button>
              </div>
            )}
          </div>

          {candidates.length > 0 && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {candidates.map((candidate, index) => {
                const id = evidenceId(candidate, index);
                const selected = selectedEvidence.includes(id);
                return (
                  <label key={id} className={`cursor-pointer rounded-lg border p-3 transition ${candidate.conflict ? "border-amber-500/30 bg-amber-500/5" : "border-emerald-500/20 bg-emerald-500/5"}`}>
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 accent-emerald-500"
                        checked={selected}
                        disabled={Boolean(result?.buyerProfileEvidence?.persisted)}
                        onChange={() => toggleEvidence(id)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className={`flex items-center gap-2 text-xs ${candidate.conflict ? "text-amber-300" : "text-emerald-300"}`}>
                          {candidate.conflict ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
                          {Math.round(candidate.confidence * 100)}% sikker
                        </div>
                        <p className="mt-1 text-sm font-medium text-white">{evidenceLabel(candidate)}: {operatorLabel(candidate.operator)} {evidenceValue(candidate)}</p>
                        {candidate.conflict && (
                          <p className="mt-1 text-xs text-amber-200/80">Konflikt med aktiv profil. Hvis du velger denne, erstatter den gammel verdi for dette kriteriet i en ny profilversjon.</p>
                        )}
                        <p className="mt-1 line-clamp-3 text-xs text-slate-500">Kilde: «{candidate.sourceText}»</p>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}

          {conflicts.length > 0 && (
            <div className="mt-3 space-y-2">
              {conflicts.map((conflict, index) => (
                <div key={`${conflict.field}-${index}`} className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-sm text-amber-100">
                  <div className="flex items-center gap-2 font-medium"><AlertTriangle size={15} />Konflikt: {conflict.field}</div>
                  <p className="mt-1 text-xs text-amber-200/80">{conflict.reason}</p>
                </div>
              ))}
            </div>
          )}

          {evidenceMessage && <div className="mt-3 rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-3 text-sm text-emerald-200">{evidenceMessage}</div>}
          {evidenceError && <div className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-sm text-amber-100">{evidenceError}</div>}

          {matchPreview && (
            <CustomerInlinePropertyMatches
              brand={matchPreview.brand}
              buyerProfileId={matchPreview.buyerProfileId}
              correlationId={matchPreview.correlationId}
              matched={matchPreview.matched}
              bestEffort={matchPreview.bestEffort}
              matches={matchPreview.matches}
              onSaved={onSaved}
            />
          )}

          {canApprove && (
            <div className="mt-3 flex flex-col gap-2 border-t border-slate-800 pt-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-500">{selectedCount} av {candidates.length} nye opplysninger valgt. Konflikter er ikke valgt som standard.</p>
              <Button type="button" size="sm" onClick={approveSelectedAndMatch} disabled={applyingEvidence || selectedCount === 0}>
                {applyingEvidence ? <Loader2 size={14} className="mr-2 animate-spin" /> : <CheckCircle2 size={14} className="mr-2" />}
                Godkjenn valgte og match
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
