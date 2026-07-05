"use client";

import { JsonSection } from "@/components/lead-intelligence/lead-intelligence-client-helpers";

interface LeadIntelligencePropertyMatchDiagnosticsProps {
  missingPropertyReferences: string[];
  skippedProperties: unknown[];
}

export function LeadIntelligencePropertyMatchDiagnostics({
  missingPropertyReferences,
  skippedProperties,
}: LeadIntelligencePropertyMatchDiagnosticsProps) {
  if (missingPropertyReferences.length === 0 && skippedProperties.length === 0) return null;

  return (
    <JsonSection
      title="Diagnostics"
      value={{
        missingPropertyReferences,
        skippedProperties,
      }}
    />
  );
}
