"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  Loader2,
  MessageSquareText,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { BRANDS } from "@/lib/constants";
import { LEAD_INTELLIGENCE_LIMITS, type ExtractedLead, type PhoneLookupNormalization } from "@/services/lead-intelligence/contracts";

type Source = "phone_call" | "whatsapp" | "email" | "sms" | "meeting_note" | "other";

interface LeadAnalysisResponse {
  ok: true;
  correlationId: string;
  result: ExtractedLead;
  meta: {
    model: string;
    promptVersion: string;
    durationMs: number;
    repaired: boolean;
    redaction: {
      phoneCount: number;
      emailCount: number;
    };
    phoneNormalization: PhoneLookupNormalization;
  };
}

interface SafeErrorResponse {
  ok: false;
  error: {
    correlationId: string;
    code: string;
    message: string;
  };
}

interface Props {
  featureEnabled: boolean;
}

const sourceOptions: Array<{ value: Source; label: string }> = [
  { value: "phone_call", label: "Telefonsamtale" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "E-post" },
  { value: "sms", label: "SMS" },
  { value: "meeting_note", label: "Møtenotat" },
  { value: "other", label: "Annet" },
];

const realEstateBrands = BRANDS.filter((brand) => brand.type === "real_estate");

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function parseJsonEditor(value: string) {
  try {
    return { parsed: JSON.parse(value) as ExtractedLead, error: null };
  } catch (error) {
    return { parsed: null, error: error instanceof Error ? error.message : "Ugyldig JSON" };
  }
}

function badgeForPhone(status: PhoneLookupNormalization["status"]) {
  switch (status) {
    case "verified_e164":
      return { label: "Verifisert E.164", variant: "success" as const };
    case "national":
      return { label: "Nasjonalt format", variant: "warning" as const };
    case "invalid":
      return { label: "Ugyldig telefon", variant: "destructive" as const };
    default:
      return { label: "Ingen telefon", variant: "secondary" as const };
  }
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-medium uppercase tracking-wide text-slate-500">{children}</label>;
}

function TextInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
}) {
  return (
    <div className="space-y-1">
      <FieldLabel>{label}</FieldLabel>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function JsonSection({
  title,
  value,
}: {
  title: string;
  value: unknown;
}) {
  return (
    <div className="rounded-lg border border-slate-700/60 bg-slate-900/50 p-3">
      <h3 className="mb-2 text-sm font-semibold text-slate-200">{title}</h3>
      <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words text-xs text-slate-300">
        {prettyJson(value)}
      </pre>
    </div>
  );
}

export function LeadIntelligenceClient({ featureEnabled }: Props) {
  const [source, setSource] = useState<Source>("phone_call");
  const [brand, setBrand] = useState(realEstateBrands[0]?.id || "soleada");
  const [language, setLanguage] = useState("");
  const [rawText, setRawText] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<LeadAnalysisResponse | null>(null);
  const [error, setError] = useState<SafeErrorResponse["error"] | null>(null);
  const [editableJson, setEditableJson] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  const jsonEditor = useMemo(() => parseJsonEditor(editableJson), [editableJson]);
  const edited = jsonEditor.parsed || response?.result || null;
  const phoneBadge = response ? badgeForPhone(response.meta.phoneNormalization.status) : null;
  const remaining = LEAD_INTELLIGENCE_LIMITS.bodyText - rawText.length;

  const updateEdited = (updater: (current: ExtractedLead) => ExtractedLead) => {
    if (!edited) return;
    const next = updater(edited);
    setEditableJson(prettyJson(next));
  };

  const analyze = async () => {
    setLoading(true);
    setError(null);
    setCopyState("idle");

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
        setError((body as SafeErrorResponse).error || {
          correlationId: res.headers.get("x-correlation-id") || "unknown",
          code: "INTERNAL_ERROR",
          message: "Analysen feilet",
        });
        return;
      }
      setResponse(body);
      setEditableJson(prettyJson(body.result));
    } catch {
      setError({
        correlationId: "client",
        code: "INTERNAL_ERROR",
        message: "Kunne ikke kontakte analyse-API-et.",
      });
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setResponse(null);
    setError(null);
    setEditableJson("");
    setCopyState("idle");
  };

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(editableJson);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary-400" />
            <Badge variant="default">Preview</Badge>
          </div>
          <h1 className="text-3xl font-bold text-white">AI Lead Inbox</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Lim inn en henvendelse og få et strukturert forslag til kontakt, kjøpsstatus,
            budsjett, krav, ønsker og avvisningskriterier. Previewet skriver ikke til CRM.
          </p>
        </div>
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-300" />
            <div>
              <p className="font-semibold">Freddy kontrollerer før noe lagres.</p>
              <p className="text-emerald-200/80">
                Ingen data lagres før du godkjenner i en senere fase. Ingen melding sendes til kunden.
              </p>
            </div>
          </div>
        </div>
      </div>

      {!featureEnabled && (
        <Card className="border-amber-500/30 bg-amber-500/10">
          <CardContent className="flex items-start gap-3 pt-5 text-amber-100">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-300" />
            <div>
              <p className="font-semibold">Lead Intelligence er deaktivert i dette miljøet.</p>
              <p className="text-sm text-amber-100/80">
                Serveren må ha REALTYFLOW_LEAD_INTELLIGENCE_ENABLED=true for å åpne analysepreviewet.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
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
                  onChange={(event) => setSource(event.target.value as Source)}
                  className="h-10 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 text-sm text-slate-100"
                >
                  {sourceOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <FieldLabel>Brand</FieldLabel>
                <select
                  value={brand}
                  onChange={(event) => setBrand(event.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 text-sm text-slate-100"
                >
                  {realEstateBrands.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </div>
              <TextInput label="Språk (valgfritt)" value={language} onChange={setLanguage} />
            </div>

            <div className="space-y-1">
              <FieldLabel>Rå tekst</FieldLabel>
              <textarea
                value={rawText}
                onChange={(event) => setRawText(event.target.value)}
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
                onClick={analyze}
              >
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Analyser henvendelse
              </Button>
              <Button type="button" variant="secondary" onClick={reset} disabled={loading}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Start på nytt
              </Button>
              {response && (
                <Button type="button" variant="outline" onClick={analyze} disabled={loading || !featureEnabled}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Analyser på nytt
                </Button>
              )}
            </div>

            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
                <p className="font-semibold">{error.code}</p>
                <p className="mt-1">{error.message}</p>
                <p className="mt-2 text-xs text-red-200/80">Correlation ID: {error.correlationId}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Analysepreview</CardTitle>
          </CardHeader>
          <CardContent>
            {!response && !loading && (
              <div className="rounded-lg border border-slate-700/60 bg-slate-900/50 p-8 text-center text-slate-400">
                <Sparkles className="mx-auto mb-3 h-8 w-8 text-slate-500" />
                <p className="font-medium text-slate-300">Ingen analyse ennå.</p>
                <p className="mt-1 text-sm">Lim inn en henvendelse og kjør analysen for å se forslag her.</p>
              </div>
            )}

            {loading && (
              <div className="rounded-lg border border-slate-700/60 bg-slate-900/50 p-8 text-center text-slate-300">
                <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-primary-400" />
                <p>Analyserer henvendelsen med strukturert output...</p>
              </div>
            )}

            {response && edited && (
              <div className="space-y-5">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-lg border border-slate-700/60 bg-slate-900/50 p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Correlation ID</p>
                    <p className="mt-1 break-all text-xs text-slate-300">{response.correlationId}</p>
                  </div>
                  <div className="rounded-lg border border-slate-700/60 bg-slate-900/50 p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Prompt</p>
                    <p className="mt-1 text-xs text-slate-300">{response.meta.promptVersion}</p>
                  </div>
                  <div className="rounded-lg border border-slate-700/60 bg-slate-900/50 p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Varighet</p>
                    <p className="mt-1 text-xs text-slate-300">{response.meta.durationMs} ms</p>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-lg border border-slate-700/60 bg-slate-950 p-4">
                    <h2 className="mb-3 text-sm font-semibold text-slate-200">Original henvendelse</h2>
                    <dl className="mb-3 grid gap-2 text-xs text-slate-400 md:grid-cols-3">
                      <div>
                        <dt className="text-slate-500">Kilde</dt>
                        <dd>{sourceOptions.find((option) => option.value === source)?.label}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Brand</dt>
                        <dd>{BRANDS.find((item) => item.id === brand)?.name || brand}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Språk</dt>
                        <dd>{language || "Ikke satt"}</dd>
                      </div>
                    </dl>
                    <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-sm text-slate-200">
                      {rawText}
                    </pre>
                  </div>

                  <div className="space-y-4 rounded-lg border border-slate-700/60 bg-slate-950 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-semibold text-slate-200">Kontaktforslag</h2>
                      {phoneBadge && <Badge variant={phoneBadge.variant}>{phoneBadge.label}</Badge>}
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <TextInput
                        label="Navn"
                        value={edited.contact.name || ""}
                        onChange={(value) => updateEdited((current) => ({
                          ...current,
                          contact: { ...current.contact, name: value || null },
                        }))}
                      />
                      <TextInput
                        label="Telefon"
                        value={edited.contact.phone || ""}
                        onChange={(value) => updateEdited((current) => ({
                          ...current,
                          contact: { ...current.contact, phone: value || null },
                        }))}
                      />
                      <TextInput
                        label="E-post"
                        value={edited.contact.email || ""}
                        onChange={(value) => updateEdited((current) => ({
                          ...current,
                          contact: { ...current.contact, email: value || null },
                        }))}
                      />
                      <TextInput
                        label="Land"
                        value={edited.contact.country || ""}
                        onChange={(value) => updateEdited((current) => ({
                          ...current,
                          contact: { ...current.contact, country: value || null },
                        }))}
                      />
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <TextInput
                        label="Readiness"
                        value={edited.purchaseReadiness.level}
                        onChange={(value) => updateEdited((current) => ({
                          ...current,
                          purchaseReadiness: { ...current.purchaseReadiness, level: value as ExtractedLead["purchaseReadiness"]["level"] },
                        }))}
                      />
                      <TextInput
                        label="Budsjett"
                        value={String(edited.budget.amount || "")}
                        onChange={(value) => updateEdited((current) => ({
                          ...current,
                          budget: { ...current.budget, amount: value ? Number(value) : null },
                        }))}
                      />
                      <TextInput
                        label="Valuta"
                        value={edited.budget.currency || ""}
                        onChange={(value) => updateEdited((current) => ({
                          ...current,
                          budget: { ...current.budget, currency: value || null },
                        }))}
                      />
                    </div>
                    <p className="text-xs text-slate-500">
                      Telefonlookup: {response.meta.phoneNormalization.normalizedLookup || "ingen"}.
                      E.164-verifisering: {response.meta.phoneNormalization.verifiedE164 ? "ja" : "nei"}.
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <JsonSection title="Boligtyper og områder" value={{ propertyTypes: edited.propertyTypes, locations: edited.locations }} />
                  <JsonSection title="Kjøpsstatus og budsjett" value={{ purchaseReadiness: edited.purchaseReadiness, budget: edited.budget }} />
                  <JsonSection title="Absolutte krav" value={edited.hardRequirements} />
                  <JsonSection title="Sterke ønsker" value={edited.preferences} />
                  <JsonSection title="Avvisningskriterier" value={edited.exclusions} />
                  <JsonSection title="Manglende informasjon" value={edited.missingInformation} />
                </div>

                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-slate-200">Rediger hele AI-forslaget lokalt</h2>
                    <Button type="button" variant="outline" size="sm" onClick={copyJson}>
                      <Clipboard className="mr-2 h-4 w-4" />
                      Kopier JSON
                    </Button>
                  </div>
                  <textarea
                    value={editableJson}
                    onChange={(event) => setEditableJson(event.target.value)}
                    rows={18}
                    className="w-full resize-y rounded-lg border border-slate-600 bg-slate-950 px-3 py-3 font-mono text-xs text-slate-100 outline-none focus:border-primary-500"
                  />
                  <div className="flex items-center gap-2 text-xs">
                    {jsonEditor.error ? (
                      <span className="text-amber-300">JSON er ikke gyldig: {jsonEditor.error}</span>
                    ) : (
                      <span className="flex items-center gap-1 text-emerald-300">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Lokalt preview er gyldig JSON.
                      </span>
                    )}
                    {copyState === "copied" && <span className="text-primary-300">Kopiert.</span>}
                    {copyState === "failed" && <span className="text-red-300">Kunne ikke kopiere.</span>}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
