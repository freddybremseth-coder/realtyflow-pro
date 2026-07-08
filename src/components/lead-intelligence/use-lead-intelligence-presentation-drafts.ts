"use client";

import { useState } from "react";
import type {
  PresentationDraftHistoryResponse,
  PresentationDraftResponse,
  ReviewSaveResponse,
  SafeErrorResponse,
  ShortlistSaveResponse,
} from "@/components/lead-intelligence/lead-intelligence-client-types";
import type { LeadIntelligenceWorklistItem } from "@/components/lead-intelligence/lead-intelligence-worklist-history-panel";

type CopyState = "idle" | "copied" | "failed";

interface ShortlistPresentationPreview {
  title: string;
}

interface ShortlistEmailDraftPreview {
  subject: string;
  body: string;
}

interface UseLeadIntelligencePresentationDraftsParams {
  brand: string;
  language: string;
  activeWorklistItem: LeadIntelligenceWorklistItem | null;
  saveResult: ReviewSaveResponse | null;
  shortlistSaveResult: ShortlistSaveResponse | null;
  shortlistPresentation: ShortlistPresentationPreview | null;
  shortlistPresentationText: string | null;
  shortlistEmailDraft: ShortlistEmailDraftPreview | null;
  onShortlistSaveResultLoaded: (result: ShortlistSaveResponse) => void;
}

function scrollToActivePresentationDraft() {
  window.setTimeout(() => {
    document.getElementById("lead-intelligence-active-presentation-draft")?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, 50);
}

export function useLeadIntelligencePresentationDrafts({
  brand,
  language,
  activeWorklistItem,
  saveResult,
  shortlistSaveResult,
  shortlistPresentation,
  shortlistPresentationText,
  shortlistEmailDraft,
  onShortlistSaveResultLoaded,
}: UseLeadIntelligencePresentationDraftsParams) {
  const [emailDraftCopyState, setEmailDraftCopyState] = useState<CopyState>("idle");
  const [emailDraftHtmlCopyState, setEmailDraftHtmlCopyState] = useState<CopyState>("idle");
  const [presentationCopyState, setPresentationCopyState] = useState<CopyState>("idle");
  const [presentationDraftLoading, setPresentationDraftLoading] = useState(false);
  const [presentationDraftError, setPresentationDraftError] = useState<SafeErrorResponse["error"] | null>(null);
  const [presentationDraftResult, setPresentationDraftResult] = useState<PresentationDraftResponse | null>(null);
  const [presentationDraftHistoryLoading, setPresentationDraftHistoryLoading] = useState(false);
  const [presentationDraftHistoryError, setPresentationDraftHistoryError] = useState<SafeErrorResponse["error"] | null>(null);
  const [presentationDraftHistoryResult, setPresentationDraftHistoryResult] = useState<PresentationDraftHistoryResponse | null>(null);
  const [editableEmailSubject, setEditableEmailSubject] = useState("");
  const [editableEmailBody, setEditableEmailBody] = useState("");

  const resetDraftCopyState = () => {
    setEmailDraftCopyState("idle");
    setEmailDraftHtmlCopyState("idle");
    setPresentationCopyState("idle");
  };

  const clearPresentationDraftState = () => {
    setPresentationDraftError(null);
    setPresentationDraftResult(null);
    setPresentationDraftHistoryError(null);
    setPresentationDraftHistoryResult(null);
    setEditableEmailSubject("");
    setEditableEmailBody("");
    resetDraftCopyState();
  };

  const updateEditableEmailSubject = (value: string) => {
    setEditableEmailSubject(value);
    resetDraftCopyState();
  };

  const updateEditableEmailBody = (value: string) => {
    setEditableEmailBody(value);
    resetDraftCopyState();
  };

  const copyEmailDraftText = async () => {
    const draft = presentationDraftResult?.result.messageDraft
      ? {
          subject: editableEmailSubject,
          body: editableEmailBody,
        }
      : shortlistEmailDraft;
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(`Emne: ${draft.subject}\n\n${draft.body}`);
      setEmailDraftCopyState("copied");
    } catch {
      setEmailDraftCopyState("failed");
    }
  };

  const copyEmailDraftHtml = async () => {
    const draft = presentationDraftResult?.result.messageDraft;
    if (!draft?.bodyHtml) return;
    try {
      if ("ClipboardItem" in window && typeof navigator.clipboard.write === "function") {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([draft.bodyHtml], { type: "text/html" }),
            "text/plain": new Blob([`Emne: ${draft.subject}\n\n${draft.bodyText}`], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(draft.bodyHtml);
      }
      setEmailDraftHtmlCopyState("copied");
    } catch {
      setEmailDraftHtmlCopyState("failed");
    }
  };

  const copyPresentationDraft = async () => {
    if (!shortlistPresentationText) return;
    try {
      await navigator.clipboard.writeText(shortlistPresentationText);
      setPresentationCopyState("copied");
    } catch {
      setPresentationCopyState("failed");
    }
  };

  const savePresentationDraft = async () => {
    if (!saveResult || !shortlistSaveResult) return;
    setPresentationDraftLoading(true);
    setPresentationDraftError(null);
    setPresentationDraftResult(null);
    setEditableEmailSubject("");
    setEditableEmailBody("");
    resetDraftCopyState();

    try {
      const res = await fetch("/api/lead-intelligence/presentations", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-correlation-id": shortlistSaveResult.correlationId,
        },
        body: JSON.stringify({
          brand,
          buyerProfileId: saveResult.result.buyerProfile.id,
          shortlistId: shortlistSaveResult.result.shortlistId,
          title: shortlistPresentation?.title || `Kundepresentasjon ${new Date().toLocaleDateString("nb-NO")}`,
          idempotencySeed: shortlistSaveResult.correlationId,
          language: language || null,
        }),
      });
      const body = (await res.json()) as PresentationDraftResponse | SafeErrorResponse;
      if (!res.ok || !body.ok) {
        setPresentationDraftError((body as SafeErrorResponse).error || {
          correlationId: res.headers.get("x-correlation-id") || "unknown",
          code: "INTERNAL_ERROR",
          message: "Kunne ikke lagre presentasjonsutkast.",
        });
        return;
      }
      setPresentationDraftResult(body);
      setEditableEmailSubject(body.result.messageDraft.subject);
      setEditableEmailBody(body.result.messageDraft.bodyText);
      scrollToActivePresentationDraft();
    } catch {
      setPresentationDraftError({
        correlationId: "client",
        code: "INTERNAL_ERROR",
        message: "Kunne ikke kontakte presentasjons-API-et.",
      });
    } finally {
      setPresentationDraftLoading(false);
    }
  };

  const loadPresentationDraftById = async (presentationId: string) => {
    setPresentationDraftLoading(true);
    setPresentationDraftError(null);
    setPresentationDraftResult(null);
    setEditableEmailSubject("");
    setEditableEmailBody("");
    resetDraftCopyState();

    try {
      const params = new URLSearchParams({
        brand,
        presentationId,
      });
      const res = await fetch(`/api/lead-intelligence/presentations?${params.toString()}`, {
        method: "GET",
        headers: { accept: "application/json" },
      });
      const body = (await res.json()) as PresentationDraftResponse | SafeErrorResponse;
      if (!res.ok || !body.ok) {
        setPresentationDraftError((body as SafeErrorResponse).error || {
          correlationId: res.headers.get("x-correlation-id") || "unknown",
          code: "INTERNAL_ERROR",
          message: "Kunne ikke hente lagret presentasjonsutkast.",
        });
        return;
      }
      onShortlistSaveResultLoaded({
        ok: true,
        correlationId: body.correlationId,
        result: {
          shortlistId: body.result.shortlistId,
          duplicate: true,
          conflict: false,
          itemCount: body.result.itemCount,
          sideEffects: {
            leadsCreated: false,
            contactsCreated: false,
            emailsSent: false,
            propertyMatchingStarted: false,
            presentationCreated: false,
          },
        },
      });
      setPresentationDraftResult(body);
      setEditableEmailSubject(body.result.messageDraft.subject);
      setEditableEmailBody(body.result.messageDraft.bodyText);
      scrollToActivePresentationDraft();
    } catch {
      setPresentationDraftError({
        correlationId: "client",
        code: "INTERNAL_ERROR",
        message: "Kunne ikke kontakte presentasjons-API-et.",
      });
    } finally {
      setPresentationDraftLoading(false);
    }
  };

  const loadLatestPresentationDraft = async () => {
    if (!activeWorklistItem?.latestPresentationId) return;
    await loadPresentationDraftById(activeWorklistItem.latestPresentationId);
  };

  const loadPresentationDraftHistory = async () => {
    if (!activeWorklistItem?.buyerProfileId) return;
    setPresentationDraftHistoryLoading(true);
    setPresentationDraftHistoryError(null);

    try {
      const params = new URLSearchParams({
        brand,
        buyerProfileId: activeWorklistItem.buyerProfileId,
        limit: "5",
      });
      const res = await fetch(`/api/lead-intelligence/presentations?${params.toString()}`, {
        method: "GET",
        headers: { accept: "application/json" },
      });
      const body = (await res.json()) as PresentationDraftHistoryResponse | SafeErrorResponse;
      if (!res.ok || !body.ok) {
        setPresentationDraftHistoryError((body as SafeErrorResponse).error || {
          correlationId: res.headers.get("x-correlation-id") || "unknown",
          code: "INTERNAL_ERROR",
          message: "Kunne ikke hente utkasthistorikk.",
        });
        return;
      }
      setPresentationDraftHistoryResult(body);
    } catch {
      setPresentationDraftHistoryError({
        correlationId: "client",
        code: "INTERNAL_ERROR",
        message: "Kunne ikke kontakte presentasjons-API-et.",
      });
    } finally {
      setPresentationDraftHistoryLoading(false);
    }
  };

  return {
    emailDraftCopyState,
    emailDraftHtmlCopyState,
    presentationCopyState,
    presentationDraftLoading,
    presentationDraftError,
    presentationDraftResult,
    presentationDraftHistoryLoading,
    presentationDraftHistoryError,
    presentationDraftHistoryResult,
    editableEmailSubject,
    editableEmailBody,
    clearPresentationDraftState,
    updateEditableEmailSubject,
    updateEditableEmailBody,
    copyEmailDraftText,
    copyEmailDraftHtml,
    copyPresentationDraft,
    savePresentationDraft,
    loadPresentationDraftById,
    loadLatestPresentationDraft,
    loadPresentationDraftHistory,
  };
}
