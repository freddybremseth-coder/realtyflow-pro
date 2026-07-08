"use client";

import { useState } from "react";
import type { ExtractedLead } from "@/services/lead-intelligence/contracts";
import type {
  ContactCandidatesResponse,
  LeadIntelligenceCrmContextResponse,
  SafeErrorResponse,
} from "@/components/lead-intelligence/lead-intelligence-client-types";
import {
  apiResponseError,
  clientApiError,
} from "@/components/lead-intelligence/lead-intelligence-client-errors";
import type {
  LeadContactCandidatePreview,
  LeadContactDecision,
} from "@/components/lead-intelligence/lead-intelligence-contact-candidates-panel";

interface UseLeadIntelligenceContactFlowParams {
  brand: string;
  edited: ExtractedLead | null;
  persistenceEnabled: boolean;
  onReviewResultInvalidated: () => void;
  onReviewSelectionChanged: () => void;
}

export function useLeadIntelligenceContactFlow({
  brand,
  edited,
  persistenceEnabled,
  onReviewResultInvalidated,
  onReviewSelectionChanged,
}: UseLeadIntelligenceContactFlowParams) {
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [contactCandidatesLoaded, setContactCandidatesLoaded] = useState(false);
  const [contactCandidates, setContactCandidates] = useState<LeadContactCandidatePreview[]>([]);
  const [contactCandidateError, setContactCandidateError] = useState<SafeErrorResponse["error"] | null>(null);
  const [contactDecision, setContactDecision] = useState<LeadContactDecision>("continue_without_contact");
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [crmContextLoading, setCrmContextLoading] = useState(false);
  const [crmContextError, setCrmContextError] = useState<SafeErrorResponse["error"] | null>(null);
  const [crmContextResult, setCrmContextResult] = useState<LeadIntelligenceCrmContextResponse | null>(null);

  const clearCrmContext = () => {
    setCrmContextLoading(false);
    setCrmContextError(null);
    setCrmContextResult(null);
  };

  const clearContactCandidatesState = () => {
    setContactCandidatesLoaded(false);
    setContactCandidates([]);
    setContactCandidateError(null);
    clearCrmContext();
    setContactDecision("continue_without_contact");
    setSelectedContactId(null);
  };

  const selectExistingContact = (contactId: string) => {
    setContactDecision("connect_existing");
    setSelectedContactId(contactId);
    onReviewSelectionChanged();
  };

  const changeContactDecision = (decision: LeadContactDecision) => {
    setContactDecision(decision);
    setSelectedContactId(null);
    onReviewSelectionChanged();
  };

  const loadContactCandidates = async () => {
    if (!edited || !persistenceEnabled) return;
    setCandidateLoading(true);
    setContactCandidatesLoaded(false);
    setContactCandidateError(null);
    try {
      const res = await fetch("/api/lead-intelligence/contact-candidates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          brand,
          contact: edited.contact,
        }),
      });
      const body = (await res.json()) as ContactCandidatesResponse | SafeErrorResponse;
      if (!res.ok || !body.ok) {
        setContactCandidateError(apiResponseError(res, body, "Kunne ikke hente kontaktkandidater."));
        return;
      }
      setContactCandidates(body.candidates);
      setContactCandidatesLoaded(true);
      clearCrmContext();
      setContactDecision("continue_without_contact");
      setSelectedContactId(null);
      onReviewResultInvalidated();
    } catch {
      setContactCandidateError(clientApiError("Kunne ikke kontakte kandidat-API-et."));
    } finally {
      setCandidateLoading(false);
    }
  };

  const loadCrmContext = async () => {
    if (!edited || !persistenceEnabled) return;
    setCrmContextLoading(true);
    setCrmContextError(null);
    setCrmContextResult(null);
    try {
      const res = await fetch("/api/lead-intelligence/crm-context", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          brand,
          contact: edited.contact,
          contactIds: contactCandidates.map((candidate) => candidate.contactId),
        }),
      });
      const body = (await res.json()) as LeadIntelligenceCrmContextResponse | SafeErrorResponse;
      if (!res.ok || !body.ok) {
        setCrmContextError(apiResponseError(res, body, "Kunne ikke hente CRM-kontekst."));
        return;
      }
      setCrmContextResult(body);
      setContactCandidates(body.result.candidates);
      setContactCandidatesLoaded(true);
      setContactCandidateError(null);
      setContactDecision("continue_without_contact");
      setSelectedContactId(null);
      onReviewResultInvalidated();
    } catch {
      setCrmContextError(clientApiError("Kunne ikke kontakte CRM-kontekst-API-et."));
    } finally {
      setCrmContextLoading(false);
    }
  };

  return {
    candidateLoading,
    contactCandidatesLoaded,
    contactCandidates,
    contactCandidateError,
    contactDecision,
    selectedContactId,
    crmContextLoading,
    crmContextError,
    crmContextResult,
    clearContactCandidatesState,
    selectExistingContact,
    changeContactDecision,
    loadContactCandidates,
    loadCrmContext,
  };
}
