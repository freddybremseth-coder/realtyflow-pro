"use client";

import { Loader2, RefreshCw, Search, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/components/lead-intelligence/lead-intelligence-client-helpers";
import { formatCurrency } from "@/components/lead-intelligence/property-match-display";

export interface LeadContactCandidatePreview {
  contactId: string;
  name: string | null;
  maskedPhone: string | null;
  maskedEmail: string | null;
  matchType: "exact_phone" | "exact_email" | "name_similarity" | "manual" | "other";
  confidence: number;
  reasons: string[];
}

export interface LeadIntelligenceCrmContextItem {
  contactId: string;
  name: string | null;
  maskedPhone: string | null;
  maskedEmail: string | null;
  matchType: LeadContactCandidatePreview["matchType"];
  confidence: number;
  reasons: string[];
  pipelineStatus: string | null;
  pipelineValue: number | null;
  propertyInterest: string | null;
  source: string | null;
  sentiment: string | null;
  notesExcerpt: string | null;
  interactionCount: number;
  lastContact: string | null;
  nextFollowup: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export type LeadContactDecision = "connect_existing" | "create_new" | "continue_without_contact";

interface LeadIntelligencePanelError {
  correlationId: string;
  code: string;
  message: string;
}

interface LeadIntelligenceContactCandidatesPanelProps {
  hasEditableLead: boolean;
  persistenceEnabled: boolean;
  connectExistingEnabled: boolean;
  candidateLoading: boolean;
  crmContextLoading: boolean;
  contactCandidatesLoaded: boolean;
  contactCandidates: LeadContactCandidatePreview[];
  contactCandidateError: LeadIntelligencePanelError | null;
  crmContextError: LeadIntelligencePanelError | null;
  crmContextItems: LeadIntelligenceCrmContextItem[] | null;
  contactDecision: LeadContactDecision;
  selectedContactId: string | null;
  onLoadContactCandidates: () => void;
  onLoadCrmContext: () => void;
  onSelectExistingContact: (contactId: string) => void;
  onContactDecisionChange: (decision: Exclude<LeadContactDecision, "connect_existing">) => void;
}

export function LeadIntelligenceContactCandidatesPanel({
  hasEditableLead,
  persistenceEnabled,
  connectExistingEnabled,
  candidateLoading,
  crmContextLoading,
  contactCandidatesLoaded,
  contactCandidates,
  contactCandidateError,
  crmContextError,
  crmContextItems,
  contactDecision,
  selectedContactId,
  onLoadContactCandidates,
  onLoadCrmContext,
  onSelectExistingContact,
  onContactDecisionChange,
}: LeadIntelligenceContactCandidatesPanelProps) {
  return (
    <div className="space-y-4 rounded-lg border border-slate-700/60 bg-slate-950 p-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-200">Kontaktkandidater</h2>
        <p className="mt-1 text-xs text-slate-500">
          Kandidater vises maskert. Eksisterende kontakt kan velges eksplisitt, men ingen kontakt opprettes automatisk.
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={onLoadContactCandidates}
        disabled={candidateLoading || !hasEditableLead || !persistenceEnabled}
      >
        {candidateLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
        Vis kontaktkandidater
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={onLoadCrmContext}
        disabled={crmContextLoading || !hasEditableLead || !persistenceEnabled}
      >
        {crmContextLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
        Hent CRM-kontekst
      </Button>

      {!persistenceEnabled && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
          Kontaktkandidatoppslag er deaktivert sammen med persistence. Ingen databaseoppslag kjøres fra denne visningen.
        </div>
      )}

      {contactCandidateError && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
          <p className="font-semibold">{contactCandidateError.code}</p>
          <p className="mt-1">{contactCandidateError.message}</p>
          <p className="mt-2 text-xs text-amber-100/80">
            Correlation ID: {contactCandidateError.correlationId}
          </p>
        </div>
      )}

      {crmContextError && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
          <p className="font-semibold">{crmContextError.code}</p>
          <p className="mt-1">{crmContextError.message}</p>
          <p className="mt-2 text-xs text-amber-100/80">
            Correlation ID: {crmContextError.correlationId}
          </p>
        </div>
      )}

      {contactCandidates.length === 0 && !contactCandidateError && !contactCandidatesLoaded && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3 text-sm text-slate-400">
          Ingen kontaktkandidater hentet ennå.
        </div>
      )}

      {contactCandidates.length === 0 && !contactCandidateError && contactCandidatesLoaded && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
          Kandidatoppslag fullført. Ingen matchende kontaktkandidater funnet.
        </div>
      )}

      {contactCandidates.length > 0 && !contactCandidateError && contactCandidatesLoaded && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3 text-sm text-slate-300">
          {contactCandidates.length} kontaktkandidat{contactCandidates.length === 1 ? "" : "er"} funnet.
        </div>
      )}

      {contactCandidates.length > 0 && !connectExistingEnabled && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
          Kandidatoppslag er kun read-only nå. Kobling til eksisterende kontakt er låst til egen testkontakt
          og egen server-side aktivering.
        </div>
      )}

      {crmContextItems && (
        <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/50 p-3">
          <div>
            <p className="text-sm font-semibold text-slate-200">CRM-kontekst</p>
            <p className="mt-1 text-xs text-slate-500">
              Read-only kontekst fra eksisterende kontaktpipeline. Ingen kontakt, lead eller e-post er opprettet.
            </p>
          </div>
          {crmContextItems.length === 0 ? (
            <p className="text-sm text-slate-400">
              Ingen eksisterende CRM-kontekst funnet for de server-bekreftede kandidatene.
            </p>
          ) : (
            <div className="space-y-2">
              {crmContextItems.map((item) => (
                <div
                  key={`${item.matchType}:${item.contactId}`}
                  className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm text-slate-300"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-slate-100">{item.name || "Uten navn"}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {item.maskedPhone || "ingen telefon"} · {item.maskedEmail || "ingen e-post"}
                      </p>
                    </div>
                    <Badge variant="secondary">
                      {item.matchType} · {Math.round(item.confidence * 100)}%
                    </Badge>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-2">
                    <p>Status: <span className="text-slate-200">{item.pipelineStatus || "ukjent"}</span></p>
                    <p>Verdi: <span className="text-slate-200">{formatCurrency(item.pipelineValue)}</span></p>
                    <p>Kilde: <span className="text-slate-200">{item.source || "ukjent"}</span></p>
                    <p>Siste kontakt: <span className="text-slate-200">{formatDateTime(item.lastContact)}</span></p>
                    <p>Neste oppfølging: <span className="text-slate-200">{formatDateTime(item.nextFollowup)}</span></p>
                    <p>Interaksjoner: <span className="text-slate-200">{item.interactionCount}</span></p>
                  </div>
                  {item.propertyInterest && (
                    <p className="mt-3 text-xs text-slate-400">
                      Boliginteresse: <span className="text-slate-200">{item.propertyInterest}</span>
                    </p>
                  )}
                  {item.notesExcerpt && (
                    <p className="mt-3 rounded-md border border-slate-800 bg-slate-900 p-2 text-xs text-slate-300">
                      {item.notesExcerpt}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-slate-500">
            Sideeffekter: kontakter opprettet nei · leads opprettet nei · e-post sendt nei · property matching startet nei.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {contactCandidates.map((candidate) => (
          <div
            key={`${candidate.matchType}:${candidate.contactId}`}
            className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-900/50 p-3"
          >
            {connectExistingEnabled ? (
              <input
                type="radio"
                name="lead-contact-candidate"
                checked={contactDecision === "connect_existing" && selectedContactId === candidate.contactId}
                onChange={() => {
                  onSelectExistingContact(candidate.contactId);
                }}
                className="mt-1 h-4 w-4"
              />
            ) : (
              <Search className="mt-0.5 h-4 w-4 text-slate-500" aria-hidden="true" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-slate-200">
                {candidate.name || "Uten navn"}
              </span>
              <span className="mt-1 block text-xs text-slate-500">
                {candidate.maskedPhone || "ingen telefon"} · {candidate.maskedEmail || "ingen e-post"}
              </span>
              <span className="mt-1 block text-xs text-slate-400">
                {candidate.matchType} · {Math.round(candidate.confidence * 100)}%
              </span>
            </span>
          </div>
        ))}
      </div>

      <div className="space-y-2 border-t border-slate-800 pt-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
          <input
            type="radio"
            name="lead-contact-decision"
            checked={contactDecision === "continue_without_contact"}
            onChange={() => {
              onContactDecisionChange("continue_without_contact");
            }}
          />
          Fortsett uten koblet kontakt
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
          <input
            type="radio"
            name="lead-contact-decision"
            checked={contactDecision === "create_new"}
            onChange={() => {
              onContactDecisionChange("create_new");
            }}
          />
          Marker at ny kontakt må opprettes senere
        </label>
      </div>

      <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-100">
        <div className="flex items-start gap-2">
          <UserCheck className="mt-0.5 h-4 w-4 text-blue-300" />
          <p>
            Denne fasen lagrer bare intake, analyse og buyer profile. Kontaktkandidat lagres kun når
            Freddy eksplisitt kobler en eksisterende kontakt. Den sender ikke e-post, starter ikke
            matching og oppdaterer ikke eksisterende kontaktdata.
          </p>
        </div>
      </div>
    </div>
  );
}
