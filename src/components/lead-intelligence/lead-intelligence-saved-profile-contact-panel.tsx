"use client";

import { Loader2, Search, Trash2, UserCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { shortPropertyId } from "@/components/lead-intelligence/property-match-display";
import type { LeadContactCandidatePreview } from "@/components/lead-intelligence/lead-intelligence-contact-candidates-panel";
import type {
  LeadIntelligenceWorklistItem,
  LinkedContactPreview,
} from "@/components/lead-intelligence/lead-intelligence-worklist-history-panel";

interface SafePanelError {
  correlationId: string;
  code: string;
  message: string;
}

interface SavedProfileContactCreateResult {
  correlationId: string;
  result: {
    linkedContact: LinkedContactPreview;
  };
}

interface SavedProfileContactLinkResult {
  result: {
    contactId: string;
    linkedContact: LinkedContactPreview;
  };
}

interface SavedProfileArchiveResult {
  result: {
    buyerProfileId: string;
  };
}

interface LeadIntelligenceSavedProfileContactPanelProps {
  activeWorklistItem: LeadIntelligenceWorklistItem;
  persistenceEnabled: boolean;
  connectExistingEnabled: boolean;
  createContactEnabled: boolean;
  contactCandidates: LeadContactCandidatePreview[] | null;
  selectedContactId: string | null;
  contactCandidatesLoading: boolean;
  contactLinkLoading: boolean;
  contactCreateLoading: boolean;
  profileArchiveLoading: boolean;
  contactCandidatesError: SafePanelError | null;
  contactLinkError: SafePanelError | null;
  contactCreateError: SafePanelError | null;
  profileArchiveError: SafePanelError | null;
  contactCreateResult: SavedProfileContactCreateResult | null;
  contactLinkResult: SavedProfileContactLinkResult | null;
  profileArchiveResult: SavedProfileArchiveResult | null;
  onLoadContactCandidates: () => void;
  onCreateContact: () => void;
  onArchiveProfile: () => void;
  onSelectContactCandidate: (contactId: string) => void;
  onLinkContact: (contactId: string) => void;
}

export function LeadIntelligenceSavedProfileContactPanel({
  activeWorklistItem,
  persistenceEnabled,
  connectExistingEnabled,
  createContactEnabled,
  contactCandidates,
  selectedContactId,
  contactCandidatesLoading,
  contactLinkLoading,
  contactCreateLoading,
  profileArchiveLoading,
  contactCandidatesError,
  contactLinkError,
  contactCreateError,
  profileArchiveError,
  contactCreateResult,
  contactLinkResult,
  profileArchiveResult,
  onLoadContactCandidates,
  onCreateContact,
  onArchiveProfile,
  onSelectContactCandidate,
  onLinkContact,
}: LeadIntelligenceSavedProfileContactPanelProps) {
  const hasLinkedContact = Boolean(activeWorklistItem.linkedContact);

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3 text-sm text-slate-300">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-semibold text-slate-100">Kontaktkort</p>
          <p className="mt-1 text-xs text-slate-400">
            Se koblet kontakt eller finn en eksisterende kontakt for denne lagrede profilen. Ingen ny
            kontakt opprettes her.
          </p>
        </div>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={onArchiveProfile}
          disabled={profileArchiveLoading}
        >
          {profileArchiveLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="mr-2 h-4 w-4" />
          )}
          Arkiver profil
        </Button>
      </div>

      {activeWorklistItem.linkedContact ? (
        <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-100">
          <p className="text-xs uppercase tracking-wide text-emerald-200/80">Koblet eksisterende kontakt</p>
          <p className="mt-1 font-semibold text-emerald-50">
            {activeWorklistItem.linkedContact.name || "Uten navn"}
          </p>
          <p className="mt-1 text-xs text-emerald-100/75">
            {activeWorklistItem.linkedContact.maskedPhone || "ingen telefon"} ·{" "}
            {activeWorklistItem.linkedContact.maskedEmail || "ingen e-post"}
          </p>
          <p className="mt-2 text-xs text-emerald-100/70">
            Kontaktdata er hentet read-only og ble ikke overskrevet av Lead Intelligence.
          </p>
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-amber-100">
          <p className="font-semibold">Ingen kontakt koblet ennå.</p>
          <p className="mt-1 text-xs text-amber-100/80">
            Du kan søke etter eksisterende kontakt fra den lagrede analysen. Opprett ny kontakt er
            fortsatt en egen godkjenningsfase.
          </p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onLoadContactCandidates}
          disabled={contactCandidatesLoading || !persistenceEnabled}
        >
          {contactCandidatesLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Search className="mr-2 h-4 w-4" />
          )}
          Finn kontaktkandidater
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCreateContact}
          disabled={contactCreateLoading || !createContactEnabled || hasLinkedContact}
        >
          {contactCreateLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Users className="mr-2 h-4 w-4" />
          )}
          {createContactEnabled ? "Opprett ny kontakt" : "Kontaktoppretting låst"}
        </Button>
      </div>

      {!createContactEnabled && (
        <p className="mt-2 text-xs text-slate-500">
          Oppretting av ny kontakt krever server-side feature flag og egen produksjonsgate.
        </p>
      )}

      {contactCreateResult && (
        <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-100">
          <p className="font-semibold">Kontakt opprettet og koblet uten lead, e-post eller matching.</p>
          <p className="mt-1">
            {contactCreateResult.result.linkedContact.name || "Uten navn"} ·{" "}
            {contactCreateResult.result.linkedContact.maskedPhone || "ingen telefon"} ·{" "}
            {contactCreateResult.result.linkedContact.maskedEmail || "ingen e-post"}
          </p>
          <p className="mt-2 text-emerald-100/70">
            Correlation ID: {contactCreateResult.correlationId}
          </p>
        </div>
      )}

      {contactCreateError && (
        <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-100">
          <p className="font-semibold">{contactCreateError.code}</p>
          <p className="mt-1">{contactCreateError.message}</p>
          <p className="mt-2 text-red-100/70">Correlation ID: {contactCreateError.correlationId}</p>
        </div>
      )}

      {profileArchiveResult && (
        <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-100">
          Profil {shortPropertyId(profileArchiveResult.result.buyerProfileId)} er arkivert. Den er
          fjernet fra arbeidslisten, men ikke fysisk slettet.
        </div>
      )}

      {profileArchiveError && (
        <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-100">
          <p className="font-semibold">{profileArchiveError.code}</p>
          <p className="mt-1">{profileArchiveError.message}</p>
          <p className="mt-2 text-red-100/70">Correlation ID: {profileArchiveError.correlationId}</p>
        </div>
      )}

      {contactCandidatesError && (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
          <p className="font-semibold">{contactCandidatesError.code}</p>
          <p className="mt-1">{contactCandidatesError.message}</p>
          <p className="mt-2 text-amber-100/80">
            Correlation ID: {contactCandidatesError.correlationId}
          </p>
        </div>
      )}

      {contactLinkError && (
        <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-100">
          <p className="font-semibold">{contactLinkError.code}</p>
          <p className="mt-1">{contactLinkError.message}</p>
          <p className="mt-2 text-red-100/70">Correlation ID: {contactLinkError.correlationId}</p>
        </div>
      )}

      {contactLinkResult && (
        <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-100">
          Kontakt {contactLinkResult.result.linkedContact.name || shortPropertyId(contactLinkResult.result.contactId)}{" "}
          er koblet til buyer profile. Ingen kontakt, lead eller e-post ble opprettet.
        </div>
      )}

      {contactCandidates && (
        <div className="mt-3 space-y-2">
          {contactCandidates.length === 0 ? (
            <p className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-400">
              Ingen eksisterende kontaktkandidater funnet for denne profilen.
            </p>
          ) : (
            contactCandidates.map((candidate) => (
              <div
                key={`${candidate.matchType}:${candidate.contactId}`}
                className="rounded-lg border border-slate-800 bg-slate-950/70 p-3"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <label className="flex min-w-0 cursor-pointer items-start gap-3">
                    <input
                      type="radio"
                      name="saved-profile-contact-candidate"
                      checked={selectedContactId === candidate.contactId}
                      onChange={() => onSelectContactCandidate(candidate.contactId)}
                      className="mt-1 h-4 w-4"
                      disabled={hasLinkedContact || !connectExistingEnabled}
                    />
                    <span className="min-w-0">
                      <span className="block font-medium text-slate-100">
                        {candidate.name || "Uten navn"}
                      </span>
                      <span className="mt-1 block text-xs text-slate-500">
                        {candidate.maskedPhone || "ingen telefon"} · {candidate.maskedEmail || "ingen e-post"}
                      </span>
                      <span className="mt-1 block text-xs text-slate-400">
                        {candidate.matchType} · {Math.round(candidate.confidence * 100)}%
                      </span>
                    </span>
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onLinkContact(candidate.contactId)}
                    disabled={contactLinkLoading || hasLinkedContact || !connectExistingEnabled}
                  >
                    {contactLinkLoading && selectedContactId === candidate.contactId ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <UserCheck className="mr-2 h-4 w-4" />
                    )}
                    Koble
                  </Button>
                </div>
              </div>
            ))
          )}
          {!connectExistingEnabled && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
              Kobling til eksisterende kontakt er ikke aktivert i dette miljøet.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
