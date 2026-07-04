"use client";

import { Loader2, Save, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { prettyJson } from "@/components/lead-intelligence/lead-intelligence-client-helpers";
import type { LeadContactDecision } from "@/components/lead-intelligence/lead-intelligence-contact-candidates-panel";

interface ReviewSavePanelError {
  correlationId: string;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

interface ReviewSavePanelResult {
  status: {
    newlySaved: boolean;
    duplicate: boolean;
    conflict: boolean;
  };
  intake: { id: string };
  buyerProfile: { id: string; criterionCount: number };
}

interface LeadIntelligenceReviewSavePanelProps {
  saveLoading: boolean;
  persistenceEnabled: boolean;
  hasJsonError: boolean;
  allCriteriaReviewed: boolean;
  contactDecision: LeadContactDecision;
  selectedContactId: string | null;
  saveError: ReviewSavePanelError | null;
  saveResult: ReviewSavePanelResult | null;
  hasActiveWorklistItem: boolean;
  onSave: () => void;
}

export function LeadIntelligenceReviewSavePanel({
  saveLoading,
  persistenceEnabled,
  hasJsonError,
  allCriteriaReviewed,
  contactDecision,
  selectedContactId,
  saveError,
  saveResult,
  hasActiveWorklistItem,
  onSave,
}: LeadIntelligenceReviewSavePanelProps) {
  return (
    <div className="rounded-lg border border-slate-700/60 bg-slate-950 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">Lagre review</h2>
          <p className="mt-1 text-xs text-slate-500">
            Lagrer godkjent intake og buyer profile bak server-side feature flag. Ingen kommunikasjon sendes.
          </p>
        </div>
        <Button
          type="button"
          onClick={onSave}
          disabled={
            saveLoading ||
            !persistenceEnabled ||
            hasJsonError ||
            !allCriteriaReviewed ||
            (contactDecision === "connect_existing" && !selectedContactId)
          }
        >
          {saveLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Lagre intake og kjøperprofil
        </Button>
      </div>

      {!allCriteriaReviewed && (
        <p className="mt-3 text-sm text-amber-300">
          Alle kriterier må godkjennes eller avvises før lagring.
        </p>
      )}

      {!persistenceEnabled && (
        <p className="mt-3 text-sm text-amber-300">
          Lagring er av i dette miljøet. Analyse og lokal redigering fungerer fortsatt, men ingen intake eller buyer profile skrives.
        </p>
      )}

      {saveError && (
        <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
          <p className="font-semibold">{saveError.code}</p>
          <p className="mt-1">{saveError.message}</p>
          {saveError.code === "REVIEW_CONFLICT" && (
            <div className="mt-2 rounded-md border border-red-400/30 bg-red-950/40 p-2 text-xs text-red-50">
              Dette reviewet er allerede lagret med en annen versjon av innholdet. Systemet har ikke
              overskrevet buyer profile eller kriterier. Start på nytt eller analyser henvendelsen på
              nytt dersom du vil lagre en ny godkjent versjon.
            </div>
          )}
          {saveError.details && (
            <pre className="mt-2 max-h-48 overflow-auto rounded bg-red-950/50 p-2 text-xs text-red-50">
              {prettyJson(saveError.details)}
            </pre>
          )}
          <p className="mt-2 text-xs text-red-100/80">Correlation ID: {saveError.correlationId}</p>
        </div>
      )}

      {saveResult && (
        <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
          <div className="flex items-start gap-2">
            <Users className="mt-0.5 h-4 w-4 text-emerald-300" />
            <div>
              <p className="font-semibold">
                {hasActiveWorklistItem
                  ? "Lagret buyer profile valgt fra arbeidslisten."
                  : saveResult.status.duplicate
                    ? "Identisk review var allerede lagret."
                    : "Review lagret uten eksterne sideeffekter."}
              </p>
              <p className="mt-1 text-emerald-100/80">
                Intake {saveResult.intake.id} · Buyer profile {saveResult.buyerProfile.id} ·
                kriterier {saveResult.buyerProfile.criterionCount}
              </p>
              {hasActiveWorklistItem && (
                <p className="mt-1 text-xs text-emerald-100/80">
                  Du kan kjøre ny eiendomsmatch på denne lagrede profilen uten å analysere henvendelsen
                  på nytt. Presentasjonsutkast fra gammel analyse åpnes ikke i denne fasen.
                </p>
              )}
              {saveResult.status.duplicate && (
                <p className="mt-1 text-xs text-emerald-100/80">
                  Ingen nye rader ble opprettet. Du ser samme intake, analyse og buyer profile som ved
                  første lagring.
                </p>
              )}
              <p className="mt-1 text-xs text-emerald-100/70">
                Ny lagring: {saveResult.status.newlySaved ? "ja" : "nei"} ·
                Duplicate: {saveResult.status.duplicate ? "ja" : "nei"} ·
                Conflict: {saveResult.status.conflict ? "ja" : "nei"} ·
                E-post sendt: nei · Property matching: nei · Kontakt opprettet: nei
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
