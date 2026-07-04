"use client";

import { prettyJson } from "@/components/lead-intelligence/lead-intelligence-client-helpers";

export interface LeadIntelligenceErrorAlertError {
  correlationId: string;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

interface LeadIntelligenceErrorAlertProps {
  error: LeadIntelligenceErrorAlertError;
  className?: string;
  detailsClassName?: string;
}

export function LeadIntelligenceErrorAlert({
  error,
  className = "",
  detailsClassName = "max-h-48 bg-red-950/50 text-red-50",
}: LeadIntelligenceErrorAlertProps) {
  return (
    <div className={`rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100 ${className}`}>
      <p className="font-semibold">{error.code}</p>
      <p className="mt-1">{error.message}</p>
      {error.details && (
        <pre className={`mt-2 overflow-auto rounded p-2 text-xs ${detailsClassName}`}>
          {prettyJson(error.details)}
        </pre>
      )}
      <p className="mt-2 text-xs text-red-100/70">Correlation ID: {error.correlationId}</p>
    </div>
  );
}
