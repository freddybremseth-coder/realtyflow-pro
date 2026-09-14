"use client";

import Link from "next/link";
import { type ClipboardEvent, type ChangeEvent, useRef, useState } from "react";
import { AlertTriangle, Bot, CalendarClock, CheckCircle2, FilePlus2, ImagePlus, Loader2, Paperclip, Sparkles } from "lucide-react";
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
    draftRequest?: { contactId: string; brand: string } | null;
  };
};

const EVIDENCE_LABELS: Record<string, string> = {
  property_type: "Boligtype",
  bedrooms: "Soverom",
  bathrooms: "Bad",
  location: "Område",
  living_area_m2: "Boligareal",
  floor_position: "Etasje",
  purchase_price: "Kjøpspris",
  total_budget: "Totalbudsjett",
  other: "Annet",
};

const MAX_SOURCE_LENGTH = 30000;
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

function evidenceLabel(candidate: EvidenceCandidate) {
  return candidate.otherKey || EVIDENCE_LABELS[candidate.key] || candidate.key;
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

export function CustomerSalesAssistantNote({ contactId, onSaved }: { contactId: string; onSaved?: () => void }) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [importError, setImportError] = useState("");
  const [draftMessage, setDraftMessage] = useState("");
  const [draftError, setDraftError] = useState("");
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
    setDraftMessage("");
    setDraftError("");
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
      setNote("");
      setImportMessage("");
      onSaved?.();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Kunne ikke behandle informasjonen.");
    } finally {
      setSaving(false);
    }
  }

  async function createReviewDraft() {
    const draftRequest = result?.buyerProfileEvidence?.draftRequest;
    if (!draftRequest) return;
    setCreatingDraft(true);
    setDraftMessage("");
    setDraftError("");
    try {
      const response = await fetch("/api/nexus/profile-activation-priority/evidence-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftRequest),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) throw new Error(body?.error?.message || body?.error || "Kunne ikke opprette Buyer Profile review-utkast.");
      const existing = Boolean(body.result?.existingDraft || body.result?.duplicate);
      setDraftMessage(existing ? "Eksisterende Buyer Profile-utkast er klart for review." : "Buyer Profile review-utkast er opprettet med pending kriterier.");
      setResult((current) => current ? {
        ...current,
        buyerProfileEvidence: current.buyerProfileEvidence ? { ...current.buyerProfileEvidence, persisted: true } : current.buyerProfileEvidence,
      } : current);
    } catch (draftFailure) {
      setDraftError(draftFailure instanceof Error ? draftFailure.message : "Kunne ikke opprette Buyer Profile review-utkast.");
    } finally {
      setCreatingDraft(false);
    }
  }

  const candidates = result?.buyerProfileEvidence?.candidates || [];
  const conflicts = result?.buyerProfileEvidence?.conflicts || [];
  const canCreateDraft = Boolean(
    result?.buyerProfileEvidence?.reviewRecommended
      && result?.buyerProfileEvidence?.draftRequest
      && conflicts.length === 0
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
          <div className="flex items-center gap-2"><Paperclip size={14} />Originalteksten beholdes i kundehistorikken. Ingen kundedata blir gjort til hardt kriterium uten review.</div>
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

      {(candidates.length > 0 || conflicts.length > 0) && (
        <div className="mt-3 rounded-lg border border-slate-700 bg-slate-950/45 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-white">Buyer Profile-forslag</p>
              <p className="text-xs text-slate-500">AI kan foreslå eksplisitte fakta, men ingenting blir gjort til hardt kriterium uten review.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canCreateDraft && (
                <Button type="button" size="sm" onClick={createReviewDraft} disabled={creatingDraft}>
                  {creatingDraft ? <Loader2 size={14} className="mr-2 animate-spin" /> : <FilePlus2 size={14} className="mr-2" />}Lag review-utkast
                </Button>
              )}
              {result?.buyerProfileEvidence?.href && (
                <Button asChild size="sm" variant="outline">
                  <Link href={result.buyerProfileEvidence.href}>Åpne review</Link>
                </Button>
              )}
            </div>
          </div>

          {draftMessage && <div className="mt-3 rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-3 text-sm text-emerald-200">{draftMessage}</div>}
          {draftError && <div className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-sm text-amber-100">{draftError}</div>}

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
