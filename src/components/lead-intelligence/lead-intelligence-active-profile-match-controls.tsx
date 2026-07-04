"use client";

import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  FieldLabel,
  prettyJson,
} from "@/components/lead-intelligence/lead-intelligence-client-helpers";

type PropertyMatchPreviewMode = "auto" | "explicit";

interface SafePanelError {
  correlationId: string;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

interface ParsedPropertyReferences {
  references: string[];
  error: string | null;
}

interface LeadIntelligenceActiveProfileMatchControlsProps {
  propertyReferencesText: string;
  parsedPropertyReferences: ParsedPropertyReferences;
  propertyMatchLoading: boolean;
  propertyMatchingEnabled: boolean;
  propertyMatchError: SafePanelError | null;
  onPropertyReferencesChange: (value: string) => void;
  onPreviewPropertyMatches: (mode: PropertyMatchPreviewMode) => void;
}

export function LeadIntelligenceActiveProfileMatchControls({
  propertyReferencesText,
  parsedPropertyReferences,
  propertyMatchLoading,
  propertyMatchingEnabled,
  propertyMatchError,
  onPropertyReferencesChange,
  onPreviewPropertyMatches,
}: LeadIntelligenceActiveProfileMatchControlsProps) {
  return (
    <>
      <div className="space-y-2">
        <FieldLabel>Eiendomsreferanser, valgfritt</FieldLabel>
        <textarea
          value={propertyReferencesText}
          onChange={(event) => onPropertyReferencesChange(event.target.value)}
          rows={3}
          placeholder="F.eks. N8513, N8514 eller én database-UUID per linje..."
          className="w-full resize-y rounded-lg border border-slate-600 bg-slate-950 px-3 py-3 font-mono text-xs text-slate-100 outline-none focus:border-primary-500"
        />
        {parsedPropertyReferences.error ? (
          <p className="text-sm text-amber-300">{parsedPropertyReferences.error}</p>
        ) : (
          <p className="text-xs text-slate-500">
            Tomt felt bruker automatisk søk i eksisterende eiendommer.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => onPreviewPropertyMatches("auto")}
          disabled={propertyMatchLoading || !propertyMatchingEnabled}
        >
          {propertyMatchLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Search className="mr-2 h-4 w-4" />
          )}
          Finn aktuelle eiendommer automatisk
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => onPreviewPropertyMatches("explicit")}
          disabled={
            propertyMatchLoading ||
            !propertyMatchingEnabled ||
            parsedPropertyReferences.references.length === 0 ||
            Boolean(parsedPropertyReferences.error)
          }
        >
          <Search className="mr-2 h-4 w-4" />
          Forhåndsvis valgte eiendommer
        </Button>
      </div>

      {propertyMatchError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
          <p className="font-semibold">{propertyMatchError.code}</p>
          <p className="mt-1">{propertyMatchError.message}</p>
          {propertyMatchError.details && (
            <pre className="mt-2 max-h-40 overflow-auto rounded bg-red-950/50 p-2 text-xs text-red-50">
              {prettyJson(propertyMatchError.details)}
            </pre>
          )}
          <p className="mt-2 text-xs text-red-100/80">
            Correlation ID: {propertyMatchError.correlationId}
          </p>
        </div>
      )}
    </>
  );
}
