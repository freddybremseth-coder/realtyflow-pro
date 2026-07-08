"use client";

import { useState } from "react";
import type { LeadIntelligenceSource } from "@/components/lead-intelligence/lead-intelligence-request-card";
import type {
  LeadAnalysisResponse,
  SafeErrorResponse,
} from "@/components/lead-intelligence/lead-intelligence-client-types";
import {
  apiResponseError,
  clientApiError,
} from "@/components/lead-intelligence/lead-intelligence-client-errors";

interface UseLeadIntelligenceAnalysisFlowParams {
  defaultBrand: string;
  onAnalysisLoaded: (result: LeadAnalysisResponse["result"]) => void;
  onAnalysisInvalidated: () => void;
  onAnalysisReset: () => void;
  onBrandChanged: () => void;
}

export function useLeadIntelligenceAnalysisFlow({
  defaultBrand,
  onAnalysisLoaded,
  onAnalysisInvalidated,
  onAnalysisReset,
  onBrandChanged,
}: UseLeadIntelligenceAnalysisFlowParams) {
  const [source, setSource] = useState<LeadIntelligenceSource>("phone_call");
  const [brand, setBrand] = useState(defaultBrand);
  const [language, setLanguage] = useState("");
  const [rawText, setRawText] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<LeadAnalysisResponse | null>(null);
  const [error, setError] = useState<SafeErrorResponse["error"] | null>(null);

  const changeSource = (nextSource: LeadIntelligenceSource) => {
    setSource(nextSource);
    onAnalysisInvalidated();
  };

  const changeBrand = (nextBrand: string) => {
    setBrand(nextBrand);
    onAnalysisInvalidated();
    onBrandChanged();
  };

  const changeLanguage = (value: string) => {
    setLanguage(value);
    onAnalysisInvalidated();
  };

  const changeRawText = (value: string) => {
    setRawText(value);
    onAnalysisInvalidated();
  };

  const clearAnalysisResult = () => {
    setResponse(null);
    setError(null);
  };

  const analyze = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/lead-intelligence/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source,
          brand,
          rawText,
          language: language.trim() || null,
        }),
      });
      const body = (await res.json()) as LeadAnalysisResponse | SafeErrorResponse;
      if (!res.ok || !body.ok) {
        setError(apiResponseError(res, body, "Analysen feilet"));
        return;
      }
      setResponse(body);
      onAnalysisLoaded(body.result);
      onAnalysisInvalidated();
    } catch {
      setError(clientApiError("Kunne ikke kontakte analyse-API-et."));
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    clearAnalysisResult();
    onAnalysisReset();
  };

  return {
    source,
    brand,
    language,
    rawText,
    loading,
    response,
    error,
    changeSource,
    changeBrand,
    changeLanguage,
    changeRawText,
    clearAnalysisResult,
    analyze,
    reset,
  };
}
