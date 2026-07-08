"use client";

import { useState } from "react";
import type {
  SafeErrorResponse,
  SavedProfileArchiveResponse,
  SavedProfileContactCandidatesResponse,
  SavedProfileContactCreateResponse,
  SavedProfileContactLinkResponse,
} from "@/components/lead-intelligence/lead-intelligence-client-types";
import type { LeadIntelligenceWorklistItem } from "@/components/lead-intelligence/lead-intelligence-worklist-history-panel";

interface UseLeadIntelligenceActiveProfileActionsParams {
  brand: string;
  activeWorklistItem: LeadIntelligenceWorklistItem | null;
  persistenceEnabled: boolean;
  connectExistingEnabled: boolean;
  createContactEnabled: boolean;
  onContactCandidatesLoaded: (result: SavedProfileContactCandidatesResponse) => void;
  onContactLinked: (result: SavedProfileContactLinkResponse) => void;
  onContactCreated: (result: SavedProfileContactCreateResponse) => void;
  onProfileArchived: (result: SavedProfileArchiveResponse) => void;
}

export function useLeadIntelligenceActiveProfileActions({
  brand,
  activeWorklistItem,
  persistenceEnabled,
  connectExistingEnabled,
  createContactEnabled,
  onContactCandidatesLoaded,
  onContactLinked,
  onContactCreated,
  onProfileArchived,
}: UseLeadIntelligenceActiveProfileActionsParams) {
  const [profileContactCandidatesLoading, setProfileContactCandidatesLoading] = useState(false);
  const [profileContactCandidatesError, setProfileContactCandidatesError] = useState<SafeErrorResponse["error"] | null>(null);
  const [profileContactCandidatesResult, setProfileContactCandidatesResult] =
    useState<SavedProfileContactCandidatesResponse | null>(null);
  const [profileSelectedContactId, setProfileSelectedContactId] = useState<string | null>(null);
  const [profileContactLinkLoading, setProfileContactLinkLoading] = useState(false);
  const [profileContactLinkError, setProfileContactLinkError] = useState<SafeErrorResponse["error"] | null>(null);
  const [profileContactLinkResult, setProfileContactLinkResult] = useState<SavedProfileContactLinkResponse | null>(null);
  const [profileContactCreateLoading, setProfileContactCreateLoading] = useState(false);
  const [profileContactCreateError, setProfileContactCreateError] = useState<SafeErrorResponse["error"] | null>(null);
  const [profileContactCreateResult, setProfileContactCreateResult] =
    useState<SavedProfileContactCreateResponse | null>(null);
  const [profileArchiveLoading, setProfileArchiveLoading] = useState(false);
  const [profileArchiveError, setProfileArchiveError] = useState<SafeErrorResponse["error"] | null>(null);
  const [profileArchiveResult, setProfileArchiveResult] = useState<SavedProfileArchiveResponse | null>(null);

  const clearActiveProfileActions = () => {
    setProfileContactCandidatesLoading(false);
    setProfileContactCandidatesError(null);
    setProfileContactCandidatesResult(null);
    setProfileSelectedContactId(null);
    setProfileContactLinkLoading(false);
    setProfileContactLinkError(null);
    setProfileContactLinkResult(null);
    setProfileContactCreateLoading(false);
    setProfileContactCreateError(null);
    setProfileContactCreateResult(null);
    setProfileArchiveLoading(false);
    setProfileArchiveError(null);
    setProfileArchiveResult(null);
  };

  const selectProfileContactCandidate = (contactId: string) => {
    setProfileSelectedContactId(contactId);
    setProfileContactLinkError(null);
    setProfileContactLinkResult(null);
  };

  const loadSavedProfileContactCandidates = async () => {
    if (!activeWorklistItem || !persistenceEnabled) return;
    setProfileContactCandidatesLoading(true);
    setProfileContactCandidatesError(null);
    setProfileContactLinkError(null);
    setProfileContactLinkResult(null);
    setProfileContactCreateError(null);
    setProfileContactCreateResult(null);
    setProfileSelectedContactId(null);

    try {
      const res = await fetch(
        `/api/lead-intelligence/buyer-profiles/${activeWorklistItem.buyerProfileId}/contact-candidates`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ brand }),
        },
      );
      const body = (await res.json()) as SavedProfileContactCandidatesResponse | SafeErrorResponse;
      if (!res.ok || !body.ok) {
        setProfileContactCandidatesError((body as SafeErrorResponse).error || {
          correlationId: res.headers.get("x-correlation-id") || "unknown",
          code: "INTERNAL_ERROR",
          message: "Kunne ikke hente kontaktkandidater for lagret profil.",
        });
        return;
      }
      setProfileContactCandidatesResult(body);
      onContactCandidatesLoaded(body);
    } catch {
      setProfileContactCandidatesError({
        correlationId: "client",
        code: "INTERNAL_ERROR",
        message: "Kunne ikke kontakte profil-kandidat-API-et.",
      });
    } finally {
      setProfileContactCandidatesLoading(false);
    }
  };

  const linkSavedProfileContact = async (contactId: string) => {
    if (!activeWorklistItem || !persistenceEnabled || !connectExistingEnabled) return;
    const confirmed = window.confirm(
      "Koble denne buyer profile til den valgte eksisterende kontakten? Kontaktkortet oppdateres ikke, og det opprettes ikke lead eller e-post.",
    );
    if (!confirmed) return;

    setProfileSelectedContactId(contactId);
    setProfileContactLinkLoading(true);
    setProfileContactLinkError(null);
    setProfileContactLinkResult(null);

    try {
      const res = await fetch(
        `/api/lead-intelligence/buyer-profiles/${activeWorklistItem.buyerProfileId}/contact-link`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ brand, contactId }),
        },
      );
      const body = (await res.json()) as SavedProfileContactLinkResponse | SafeErrorResponse;
      if (!res.ok || !body.ok) {
        setProfileContactLinkError((body as SafeErrorResponse).error || {
          correlationId: res.headers.get("x-correlation-id") || "unknown",
          code: "INTERNAL_ERROR",
          message: "Kunne ikke koble eksisterende kontakt.",
        });
        return;
      }

      setProfileContactLinkResult(body);
      onContactLinked(body);
    } catch {
      setProfileContactLinkError({
        correlationId: "client",
        code: "INTERNAL_ERROR",
        message: "Kunne ikke kontakte kontaktkoblings-API-et.",
      });
    } finally {
      setProfileContactLinkLoading(false);
    }
  };

  const createContactFromSavedProfile = async () => {
    if (!activeWorklistItem || !persistenceEnabled || !createContactEnabled) return;
    const confirmed = window.confirm(
      "Opprett ny CRM-kontakt fra denne godkjente buyer profile? Dette oppretter én kontakt og kobler profilen, men oppretter ikke lead, e-post eller matchingjobb.",
    );
    if (!confirmed) return;

    setProfileContactCreateLoading(true);
    setProfileContactCreateError(null);
    setProfileContactCreateResult(null);

    try {
      const res = await fetch(
        `/api/lead-intelligence/buyer-profiles/${activeWorklistItem.buyerProfileId}/contact-create`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ brand }),
        },
      );
      const body = (await res.json()) as SavedProfileContactCreateResponse | SafeErrorResponse;
      if (!res.ok || !body.ok) {
        setProfileContactCreateError((body as SafeErrorResponse).error || {
          correlationId: res.headers.get("x-correlation-id") || "unknown",
          code: "INTERNAL_ERROR",
          message: "Kunne ikke opprette CRM-kontakt.",
        });
        return;
      }

      setProfileContactCreateResult(body);
      onContactCreated(body);
    } catch {
      setProfileContactCreateError({
        correlationId: "client",
        code: "INTERNAL_ERROR",
        message: "Kunne ikke kontakte kontaktopprettings-API-et.",
      });
    } finally {
      setProfileContactCreateLoading(false);
    }
  };

  const archiveActiveProfile = async () => {
    if (!activeWorklistItem || !persistenceEnabled) return;
    const confirmed = window.confirm(
      "Arkiver denne buyer profile? Den fjernes fra arbeidslisten, men slettes ikke fysisk og kan beholdes som audit-historikk.",
    );
    if (!confirmed) return;

    setProfileArchiveLoading(true);
    setProfileArchiveError(null);
    setProfileArchiveResult(null);

    try {
      const res = await fetch(
        `/api/lead-intelligence/buyer-profiles/${activeWorklistItem.buyerProfileId}/archive`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ brand }),
        },
      );
      const body = (await res.json()) as SavedProfileArchiveResponse | SafeErrorResponse;
      if (!res.ok || !body.ok) {
        setProfileArchiveError((body as SafeErrorResponse).error || {
          correlationId: res.headers.get("x-correlation-id") || "unknown",
          code: "INTERNAL_ERROR",
          message: "Kunne ikke arkivere profilen.",
        });
        return;
      }

      clearActiveProfileActions();
      setProfileArchiveResult(body);
      onProfileArchived(body);
    } catch {
      setProfileArchiveError({
        correlationId: "client",
        code: "INTERNAL_ERROR",
        message: "Kunne ikke kontakte profilarkiv-API-et.",
      });
    } finally {
      setProfileArchiveLoading(false);
    }
  };

  return {
    profileContactCandidatesLoading,
    profileContactCandidatesError,
    profileContactCandidatesResult,
    profileSelectedContactId,
    profileContactLinkLoading,
    profileContactLinkError,
    profileContactLinkResult,
    profileContactCreateLoading,
    profileContactCreateError,
    profileContactCreateResult,
    profileArchiveLoading,
    profileArchiveError,
    profileArchiveResult,
    clearActiveProfileActions,
    selectProfileContactCandidate,
    loadSavedProfileContactCandidates,
    linkSavedProfileContact,
    createContactFromSavedProfile,
    archiveActiveProfile,
  };
}
