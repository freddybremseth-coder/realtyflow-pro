"use client";

import { Loader2, MessageSquareText, RefreshCw, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LEAD_INTELLIGENCE_LIMITS } from "@/services/lead-intelligence/contracts";
import { FieldLabel, TextInput, prettyJson } from "@/components/lead-intelligence/lead-intelligence-client-helpers";

export type LeadIntelligenceSource = "phone_call" | "whatsapp" | "email" | "sms" | "meeting_note" | "other";

export interface LeadIntelligenceSourceOption {
  value: LeadIntelligenceSource;
  label: string;
}

interface LeadIntelligenceBrandOption {
  id: string;
  name: string;
}

interface LeadIntelligenceRequestError {
  correlationId: string;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

interface LeadIntelligenceRequestCardProps {
  source: LeadIntelligenceSource;
  sourceOptions: LeadIntelligenceSourceOption[];
  brand: string;
  brandOptions: LeadIntelligenceBrandOption[];
  language: string;
  rawText: string;
  featureEnabled: boolean;
  loading: boolean;
  hasResponse: boolean;
  error: LeadIntelligenceRequestError | null;
  onSourceChange: (source: LeadIntelligenceSource) => void;
  onBrandChange: (brand: string) => void;
  onLanguageChange: (language: string) => void;
  onRawTextChange: (rawText: string) => void;
  onAnalyze: () => void;
  onReset: () => void;
}

export function LeadIntelligenceRequestCard({
  source,
  sourceOptions,
  brand,
  brandOptions,
  language,
  rawText,
  featureEnabled,
  loading,
  hasResponse,
  error,
  onSourceChange,
  onBrandChange,
  onLanguageChange,
  onRawTextChange,
  onAnalyze,
  onReset,
}: LeadIntelligenceRequestCardProps) {
  const remaining = LEAD_INTELLIGENCE_LIMITS.bodyText - rawText.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquareText className="h-5 w-5 text-primary-400" />
          Henvendelse
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <FieldLabel>Kilde</FieldLabel>
            <select
              value={source}
              onChange={(event) => {
                onSourceChange(event.target.value as LeadIntelligenceSource);
              }}
              className="h-10 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 text-sm text-slate-100"
            >
              {sourceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <FieldLabel>Brand</FieldLabel>
            <select
              value={brand}
              onChange={(event) => {
                onBrandChange(event.target.value);
              }}
              className="h-10 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 text-sm text-slate-100"
            >
              {brandOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <TextInput label="Språk (valgfritt)" value={language} onChange={onLanguageChange} />
        </div>

        <div className="space-y-1">
          <FieldLabel>Rå tekst</FieldLabel>
          <textarea
            value={rawText}
            onChange={(event) => {
              onRawTextChange(event.target.value);
            }}
            maxLength={LEAD_INTELLIGENCE_LIMITS.bodyText}
            rows={18}
            className="w-full resize-y rounded-lg border border-slate-600 bg-slate-950 px-3 py-3 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-600 focus:border-primary-500"
            placeholder="Lim inn telefonsamtalenotat, WhatsApp, SMS, e-post eller møtenotat..."
          />
          <div className="flex justify-between text-xs text-slate-500">
            <span>Bare tekst i denne fasen. Vedlegg og HTML analyseres ikke.</span>
            <span className={remaining < 500 ? "text-amber-300" : undefined}>{remaining} tegn igjen</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={!featureEnabled || loading || rawText.trim().length < 12}
            onClick={onAnalyze}
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Analyser henvendelse
          </Button>
          <Button type="button" variant="secondary" onClick={onReset} disabled={loading}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Start på nytt
          </Button>
          {hasResponse && (
            <Button type="button" variant="outline" onClick={onAnalyze} disabled={loading || !featureEnabled}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Analyser på nytt
            </Button>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
            <p className="font-semibold">{error.code}</p>
            <p className="mt-1">{error.message}</p>
            {error.details && (
              <pre className="mt-3 max-h-40 overflow-auto rounded border border-red-400/20 bg-red-950/30 p-2 text-xs text-red-100/90">
                {prettyJson(error.details)}
              </pre>
            )}
            <p className="mt-2 text-xs text-red-200/80">Correlation ID: {error.correlationId}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
