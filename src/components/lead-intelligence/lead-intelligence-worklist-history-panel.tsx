"use client";

import { Loader2, Trash2, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  SafeErrorResponse,
  SavedProfilesDeleteResponse,
} from "@/components/lead-intelligence/lead-intelligence-client-types";
import { formatDateTime } from "@/components/lead-intelligence/lead-intelligence-client-helpers";
import { formatCurrency, shortPropertyId } from "@/components/lead-intelligence/property-match-display";
import type {
  LeadIntelligenceSource,
  LeadIntelligenceSourceOption,
} from "@/components/lead-intelligence/lead-intelligence-request-card";

export interface LinkedContactPreview {
  contactId: string;
  name: string | null;
  maskedPhone: string | null;
  maskedEmail: string | null;
}

export interface LeadIntelligenceWorklistItem {
  buyerProfileId: string;
  intakeId: string;
  analysisRunId: string | null;
  source: LeadIntelligenceSource | null;
  intakeStatus: string | null;
  profileStatus: string;
  purchaseReadiness: string | null;
  summary: string | null;
  budgetAmount: number | null;
  budgetCurrency: string | null;
  locationFlexible: boolean;
  contactLinked: boolean;
  criterionCount: number;
  shortlistCount: number;
  latestShortlistId: string | null;
  latestShortlistStatus: string | null;
  latestShortlistItemCount: number;
  presentationCount: number;
  latestPresentationId: string | null;
  latestPresentationStatus: string | null;
  latestMessageDraftId: string | null;
  latestMessageDraftStatus: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  linkedContact: LinkedContactPreview | null;
}

interface LeadIntelligenceWorklistHistoryPanelProps {
  items: LeadIntelligenceWorklistItem[];
  activeBuyerProfileId: string | null;
  expanded: boolean;
  selectedBuyerProfileIds: string[];
  deleteLoading: boolean;
  deleteError: SafeErrorResponse["error"] | null;
  deleteResult: SavedProfilesDeleteResponse | null;
  sourceOptions: LeadIntelligenceSourceOption[];
  onToggleExpanded: () => void;
  onScrollToActiveProfile: () => void;
  onContinueFromItem: (item: LeadIntelligenceWorklistItem) => void;
  onToggleItemSelection: (buyerProfileId: string) => void;
  onSelectAllVisible: () => void;
  onClearSelection: () => void;
  onDeleteSelected: () => void;
}

export function LeadIntelligenceWorklistHistoryPanel({
  items,
  activeBuyerProfileId,
  expanded,
  selectedBuyerProfileIds,
  deleteLoading,
  deleteError,
  deleteResult,
  sourceOptions,
  onToggleExpanded,
  onScrollToActiveProfile,
  onContinueFromItem,
  onToggleItemSelection,
  onSelectAllVisible,
  onClearSelection,
  onDeleteSelected,
}: LeadIntelligenceWorklistHistoryPanelProps) {
  const hasActiveWorklistItem = Boolean(activeBuyerProfileId);
  const selectedCount = selectedBuyerProfileIds.length;
  const allVisibleSelected = items.length > 0 && selectedCount === items.length;

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-100">Lagret profilhistorikk</p>
          <p className="mt-1 text-xs text-slate-500">
            {hasActiveWorklistItem
              ? "Historikken er skjult mens du jobber med valgt profil, slik at arbeidsflaten holder seg kort."
              : "Velg en profil for å fortsette uten å analysere henvendelsen på nytt."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {expanded && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={allVisibleSelected ? onClearSelection : onSelectAllVisible}
                disabled={deleteLoading || items.length === 0}
              >
                {allVisibleSelected ? "Nullstill valg" : "Velg alle synlige"}
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={onDeleteSelected}
                disabled={deleteLoading || selectedCount === 0}
              >
                {deleteLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                Slett valgte{selectedCount > 0 ? ` (${selectedCount})` : ""}
              </Button>
            </>
          )}
          {hasActiveWorklistItem && (
            <Button type="button" variant="outline" size="sm" onClick={onScrollToActiveProfile}>
              Gå til aktiv profil
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" onClick={onToggleExpanded}>
            {expanded ? "Skjul profilhistorikk" : "Vis profilhistorikk"}
          </Button>
        </div>
      </div>

      {deleteError && (
        <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-100">
          <p className="font-semibold">Kunne ikke slette valgte profiler.</p>
          <p className="mt-1 text-red-100/80">{deleteError.message}</p>
        </div>
      )}

      {deleteResult && deleteResult.result.deletedCount > 0 && (
        <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-100">
          Slettet {deleteResult.result.deletedCount} buyer profile
          {deleteResult.result.deletedCount === 1 ? "" : "r"} permanent.
          {deleteResult.result.missingCount > 0
            ? ` ${deleteResult.result.missingCount} var allerede borte eller tilhørte et annet brand.`
            : ""}
        </div>
      )}

      {!expanded && (
        <p className="mt-3 rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-400">
          {items.length} lagrede profiler er skjult. Åpne historikken hvis du vil bytte aktiv profil.
        </p>
      )}

      {expanded && (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {items.map((item) => {
            const budget = formatCurrency(item.budgetAmount, item.budgetCurrency || "EUR");
            const isActive = activeBuyerProfileId === item.buyerProfileId;
            const isSelected = selectedBuyerProfileIds.includes(item.buyerProfileId);

            return (
              <div
                key={item.buyerProfileId}
                className={`rounded-lg border bg-slate-950 p-4 ${
                  isActive
                    ? "border-primary-400/70 ring-1 ring-primary-400/30"
                    : isSelected
                      ? "border-red-400/60 ring-1 ring-red-400/20"
                      : "border-slate-700/60"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-3">
                    <label className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-red-500 focus:ring-red-400"
                        checked={isSelected}
                        disabled={deleteLoading}
                        aria-label={`Velg buyer profile ${shortPropertyId(item.buyerProfileId)} for sletting`}
                        onChange={() => onToggleItemSelection(item.buyerProfileId)}
                      />
                    </label>
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-wide text-slate-500">
                        Buyer profile {shortPropertyId(item.buyerProfileId)}
                      </p>
                      <h2 className="mt-1 text-sm font-semibold text-slate-100">
                        {item.summary || "Uten sammendrag"}
                      </h2>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {isSelected && <Badge variant="destructive">Valgt for sletting</Badge>}
                    {isActive && <Badge variant="default">Aktiv</Badge>}
                    <Badge variant="outline">{item.profileStatus}</Badge>
                    {item.purchaseReadiness && <Badge variant="secondary">{item.purchaseReadiness}</Badge>}
                  </div>
                </div>

                <dl className="mt-4 grid gap-3 text-xs text-slate-400 md:grid-cols-3">
                  <div>
                    <dt className="text-slate-500">Kilde</dt>
                    <dd>{sourceOptions.find((option) => option.value === item.source)?.label || "Ikke satt"}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Budsjett</dt>
                    <dd>{budget || "Ikke satt"}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Kontakt</dt>
                    <dd>
                      {item.linkedContact
                        ? item.linkedContact.name || item.linkedContact.maskedPhone || "Koblet"
                        : item.contactLinked
                          ? "Koblet"
                          : "Ikke koblet"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Kriterier</dt>
                    <dd>{item.criterionCount}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Shortlist</dt>
                    <dd>
                      {item.shortlistCount > 0
                        ? `${item.latestShortlistItemCount} bolig(er) · ${item.latestShortlistStatus}`
                        : "Ingen"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">E-postutkast</dt>
                    <dd>{item.latestMessageDraftStatus || "Ingen"}</dd>
                  </div>
                </dl>

                <div className="mt-4 grid gap-2 text-xs text-slate-500 md:grid-cols-2">
                  <p>Intake {shortPropertyId(item.intakeId)}</p>
                  <p>Oppdatert {formatDateTime(item.updatedAt)}</p>
                  <p>Analyse {item.analysisRunId ? shortPropertyId(item.analysisRunId) : "mangler"}</p>
                  <p>Godkjent {formatDateTime(item.approvedAt)}</p>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={isActive ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => onContinueFromItem(item)}
                    disabled={!item.analysisRunId}
                  >
                    <UserCheck className="mr-2 h-4 w-4" />
                    {isActive ? "Valgt for videre arbeid" : "Fortsett med denne profilen"}
                  </Button>
                  {!item.analysisRunId && (
                    <p className="text-xs text-amber-200">
                      Mangler analyse-run og kan ikke brukes til videre preview ennå.
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
