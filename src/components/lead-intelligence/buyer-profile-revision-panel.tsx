"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Save, Search, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { BRANDS } from "@/lib/constants";

interface SafeErrorResponse {
  ok: false;
  error: {
    correlationId: string;
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

interface LeadIntelligenceWorklistItem {
  buyerProfileId: string;
  intakeId: string;
  analysisRunId: string | null;
  source: string | null;
  intakeStatus: string | null;
  profileStatus: string;
  purchaseReadiness: string | null;
  summary: string | null;
  budgetAmount: number | null;
  budgetCurrency: string | null;
  locationFlexible: boolean;
  contactLinked: boolean;
  criterionCount: number;
  shortlistCount: number;
  latestShortlistId: string | null;
  latestShortlistStatus: string | null;
  latestShortlistItemCount: number;
  presentationCount: number;
  latestPresentationId: string | null;
  latestPresentationStatus: string | null;
  latestMessageDraftId: string | null;
  latestMessageDraftStatus: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  linkedContact: {
    contactId: string;
    name: string | null;
    maskedPhone: string | null;
    maskedEmail: string | null;
  } | null;
}

interface LeadIntelligenceWorklistResponse {
  ok: true;
  correlationId: string;
  result: {
    brand: string;
    limit: number;
    items: LeadIntelligenceWorklistItem[];
  };
}

interface BuyerProfileRevisionResponse {
  ok: true;
  correlationId: string;
  result: {
    previousBuyerProfileId: string;
    buyerProfileId: string;
    intakeId: string;
    previousVersion: number;
    version: number;
    previousStatus: "superseded";
    status: "approved";
    criteriaCopied: number;
    revisionNote: string | null;
  };
  sideEffects: {
    buyerProfileCreated: true;
    previousProfileSuperseded: true;
    oldShortlistsUpdated: false;
    oldPresentationsUpdated: false;
    contactsCreated: false;
    contactsUpdated: false;
    leadsCreated: false;
    emailSent: false;
    propertyMatchingStarted: false;
    presentationCreated: false;
  };
}

type PurchaseReadiness = "cold" | "warm" | "hot" | "ready_to_buy" | "unknown";

interface RevisionFormState {
  summary: string;
  purchaseReadiness: PurchaseReadiness;
  budgetAmount: string;
  budgetCurrency: string;
  budgetIncludesCosts: boolean;
  budgetApproximate: boolean;
  locationFlexible: boolean;
  revisionNote: string;
}

interface Props {
  featureEnabled: boolean;
  persistenceEnabled: boolean;
  propertyMatchingEnabled: boolean;
}

const realEstateBrands = BRANDS.filter((brand) => brand.type === "real_estate");

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function generateClientCorrelationId() {
  const bytes = new Uint8Array(12);
  globalThis.crypto?.getRandomValues(bytes);
  const random = bytes.some(Boolean)
    ? Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")
    : Math.random().toString(16).slice(2).padEnd(24, "0").slice(0, 24);
  return `rf_revision_ui_${Date.now().toString(36)}_${random}`;
}

function formatCurrency(value: number | null, currency = "EUR") {
  if (value === null) return "Uten budsjett";
  try {
    return new Intl.NumberFormat("nb-NO", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 }).format(value);
  }
}

function formatDateTime(value: string | null) {
  if (!value) return "Ikke satt";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("nb-NO", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function purchaseReadinessLabel(value: string | null) {
  switch (value) {
    case "cold":
      return "Tidlig fase";
    case "warm":
      return "Varm";
    case "hot":
      return "Veldig interessert";
    case "ready_to_buy":
      return "Kjøpsklar";
    case "unknown":
    default:
      return "Ukjent";
  }
}

function initialForm(item: LeadIntelligenceWorklistItem): RevisionFormState {
  return {
    summary: item.summary || "",
    purchaseReadiness: (item.purchaseReadiness || "unknown") as PurchaseReadiness,
    budgetAmount: item.budgetAmount === null ? "" : String(item.budgetAmount),
    budgetCurrency: item.budgetCurrency || "EUR",
    budgetIncludesCosts: false,
    budgetApproximate: false,
    locationFlexible: item.locationFlexible,
    revisionNote: "",
  };
}

function selectedProfileLabel(item: LeadIntelligenceWorklistItem) {
  const contact = item.linkedContact?.name || item.linkedContact?.maskedEmail || item.linkedContact?.maskedPhone || "Uten kontakt";
  return `${contact} · ${formatCurrency(item.budgetAmount, item.budgetCurrency || "EUR")} · ${item.summary?.slice(0, 70) || "Ingen oppsummering"}`;
}

function revisionMatchUrl(buyerProfileId: string) {
  const params = new URLSearchParams({ buyerProfileId });
  return `/lead-intelligence?${params.toString()}`;
}

export function BuyerProfileRevisionPanel({ featureEnabled, persistenceEnabled, propertyMatchingEnabled }: Props) {
  const [brand, setBrand] = useState(realEstateBrands[0]?.id || "soleada");
  const [loading, setLoading] = useState(false);
  const [worklist, setWorklist] = useState<LeadIntelligenceWorklistResponse | null>(null);
  const [error, setError] = useState<SafeErrorResponse["error"] | null>(null);
  const [selectedBuyerProfileId, setSelectedBuyerProfileId] = useState("");
  const [form, setForm] = useState<RevisionFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<SafeErrorResponse["error"] | null>(null);
  const [revisionResult, setRevisionResult] = useState<BuyerProfileRevisionResponse | null>(null);

  const activeProfiles = useMemo(
    () => (worklist?.result.items || []).filter((item) => item.profileStatus !== "archived" && item.profileStatus !== "superseded"),
    [worklist],
  );
  const selectedProfile = activeProfiles.find((item) => item.buyerProfileId === selectedBuyerProfileId) || null;
  const canSave = featureEnabled && persistenceEnabled && selectedProfile && form && form.summary.trim().length > 0 && !saving;

  const loadWorklist = async (nextBrand = brand) => {
    if (!featureEnabled || !persistenceEnabled) return;
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ brand: nextBrand, limit: "20" });
      const res = await fetch(`/api/lead-intelligence/worklist?${params.toString()}`, {
        method: "GET",
        headers: { accept: "application/json" },
      });
      const body = (await res.json()) as LeadIntelligenceWorklistResponse | SafeErrorResponse;
      if (!res.ok || !body.ok) {
        setError((body as SafeErrorResponse).error || {
          correlationId: res.headers.get("x-correlation-id") || "unknown",
          code: "INTERNAL_ERROR",
          message: "Kunne ikke hente buyer profiles for redigering.",
        });
        return;
      }
      setWorklist(body);
      setRevisionResult(null);
      const urlBuyerProfileId = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("buyerProfileId");
      const nextSelected =
        (urlBuyerProfileId && body.result.items.find((item) => item.buyerProfileId === urlBuyerProfileId)?.buyerProfileId) ||
        body.result.items.find((item) => item.profileStatus !== "archived" && item.profileStatus !== "superseded")?.buyerProfileId ||
        "";
      setSelectedBuyerProfileId(nextSelected);
      const nextItem = body.result.items.find((item) => item.buyerProfileId === nextSelected) || null;
      setForm(nextItem ? initialForm(nextItem) : null);
    } catch {
      setError({
        correlationId: "client",
        code: "INTERNAL_ERROR",
        message: "Kunne ikke kontakte arbeidsliste-API-et.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadWorklist(brand);
    // Load when brand or flags change. loadWorklist intentionally omitted to avoid re-creating the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand, featureEnabled, persistenceEnabled]);

  const selectProfile = (buyerProfileId: string) => {
    setSelectedBuyerProfileId(buyerProfileId);
    setRevisionResult(null);
    setSaveError(null);
    const item = activeProfiles.find((candidate) => candidate.buyerProfileId === buyerProfileId) || null;
    setForm(item ? initialForm(item) : null);
  };

  const saveRevision = async () => {
    if (!canSave || !selectedProfile || !form) return;
    const confirmed = window.confirm(
      "Lagre endringene som en ny buyer profile-versjon? Den gamle profilen beholdes som historikk og eksisterende shortlists/presentasjoner endres ikke.",
    );
    if (!confirmed) return;

    const budgetAmount = form.budgetAmount.trim() ? Number(form.budgetAmount.replace(/\s/g, "").replace(",", ".")) : null;
    if (budgetAmount !== null && (!Number.isFinite(budgetAmount) || budgetAmount < 0)) {
      setSaveError({
        correlationId: "client",
        code: "INVALID_REQUEST",
        message: "Budsjett må være et positivt tall eller tomt.",
      });
      return;
    }

    setSaving(true);
    setSaveError(null);
    setRevisionResult(null);

    try {
      const correlationId = generateClientCorrelationId();
      const res = await fetch(`/api/lead-intelligence/buyer-profiles/${selectedProfile.buyerProfileId}/revision`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-correlation-id": correlationId,
        },
        body: JSON.stringify({
          brand,
          summary: form.summary.trim(),
          purchaseReadiness: form.purchaseReadiness,
          budgetAmount,
          budgetCurrency: form.budgetCurrency.trim().toUpperCase() || "EUR",
          budgetIncludesCosts: form.budgetIncludesCosts,
          budgetApproximate: form.budgetApproximate,
          locationFlexible: form.locationFlexible,
          revisionNote: form.revisionNote.trim() || null,
        }),
      });
      const body = (await res.json()) as BuyerProfileRevisionResponse | SafeErrorResponse;
      if (!res.ok || !body.ok) {
        setSaveError((body as SafeErrorResponse).error || {
          correlationId: res.headers.get("x-correlation-id") || "unknown",
          code: "INTERNAL_ERROR",
          message: "Kunne ikke lagre ny buyer profile-versjon.",
        });
        return;
      }
      setRevisionResult(body);
      await loadWorklist(brand);
      setSelectedBuyerProfileId(body.result.buyerProfileId);
    } catch {
      setSaveError({
        correlationId: "client",
        code: "INTERNAL_ERROR",
        message: "Kunne ikke kontakte buyer profile revision-API-et.",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!featureEnabled || !persistenceEnabled) {
    return null;
  }

  return (
    <Card className="border-cyan-500/20 bg-slate-950/70">
      <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-cyan-300" />
            Rediger buyer profile
          </CardTitle>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Endre oppsummering, budsjett og kjøpsstatus når kunden korrigerer behovene. Lagring oppretter en ny versjon;
            gammel profil og historikk beholdes.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={brand}
            onChange={(event) => setBrand(event.target.value)}
            className="h-9 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100"
          >
            {realEstateBrands.map((brandOption) => (
              <option key={brandOption.id} value={brandOption.id}>
                {brandOption.name}
              </option>
            ))}
          </select>
          <Button type="button" variant="outline" size="sm" onClick={() => loadWorklist()} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Oppdater profiler
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3 text-sm text-cyan-100">
          <p className="font-semibold">Trygg versjonering</p>
          <p className="mt-1 text-cyan-100/80">
            Denne handlingen oppretter ikke kontakt, lead, e-post, presentasjon eller automatisk matching.
            Aktive kriterier kopieres til ny profil, og gammel profil settes til superseded.
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
            <p className="font-semibold">{error.code}</p>
            <p className="mt-1">{error.message}</p>
            {error.details && <pre className="mt-2 max-h-40 overflow-auto rounded bg-red-950/50 p-2 text-xs">{prettyJson(error.details)}</pre>}
            <p className="mt-2 text-xs text-red-100/70">Correlation ID: {error.correlationId}</p>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr),minmax(320px,420px)]">
          <div className="space-y-3">
            <div className="space-y-1">
              <label htmlFor="buyer-profile-revision-select" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Velg buyer profile
              </label>
              <select
                id="buyer-profile-revision-select"
                value={selectedBuyerProfileId}
                onChange={(event) => selectProfile(event.target.value)}
                disabled={loading || activeProfiles.length === 0}
                className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100"
              >
                {activeProfiles.length === 0 ? (
                  <option value="">Ingen aktive profiler</option>
                ) : (
                  activeProfiles.map((item) => (
                    <option key={item.buyerProfileId} value={item.buyerProfileId}>
                      {selectedProfileLabel(item)}
                    </option>
                  ))
                )}
              </select>
            </div>

            {selectedProfile && (
              <div className="grid gap-3 rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-sm text-slate-300 md:grid-cols-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Nåværende budsjett</p>
                  <p className="mt-1 font-semibold text-slate-100">
                    {formatCurrency(selectedProfile.budgetAmount, selectedProfile.budgetCurrency || "EUR")}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Kjøpsstatus</p>
                  <p className="mt-1 font-semibold text-slate-100">{purchaseReadinessLabel(selectedProfile.purchaseReadiness)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Historikk</p>
                  <p className="mt-1 font-semibold text-slate-100">
                    {selectedProfile.shortlistCount} shortlist · {selectedProfile.presentationCount} presentasjon
                  </p>
                </div>
              </div>
            )}

            {!selectedProfile && !loading && (
              <div className="rounded-lg border border-slate-700/60 bg-slate-900/50 p-4 text-sm text-slate-400">
                Ingen aktiv buyer profile funnet for valgt brand.
              </div>
            )}
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-sm text-slate-300">
            <p className="font-semibold text-slate-100">Neste steg etter lagring</p>
            <p className="mt-1 text-slate-400">
              Når ny versjon er lagret, åpner du den nye profilen og kjører matching på nytt. Eksisterende shortlists og
              presentasjonsutkast blir ikke endret.
            </p>
            {revisionResult ? (
              <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-100">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-300" />
                  <div>
                    <p className="font-semibold">Ny profilversjon er lagret.</p>
                    <p className="mt-1 text-xs text-emerald-100/80">
                      Versjon {revisionResult.result.previousVersion} → {revisionResult.result.version}. Kopierte kriterier: {revisionResult.result.criteriaCopied}.
                    </p>
                    <Button asChild type="button" size="sm" className="mt-3" disabled={!propertyMatchingEnabled}>
                      <a href={revisionMatchUrl(revisionResult.result.buyerProfileId)}>
                        <Search className="mr-2 h-4 w-4" />
                        Kjør ny matching med oppdatert profil
                      </a>
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-3 rounded-lg border border-slate-700 bg-slate-950/50 p-3 text-xs text-slate-400">
                CTA vises her når ny versjon er lagret.
              </div>
            )}
          </div>
        </div>

        {form && selectedProfile && (
          <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-slate-100">Endringer lagres som ny versjon</p>
                <p className="mt-1 text-sm text-slate-500">
                  Bruk dette når kunden ringer og endrer budsjett, kjøpsstatus eller behovstekst.
                </p>
              </div>
              <Badge variant="secondary">Ingen overwrite</Badge>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-1 lg:col-span-2">
                <label htmlFor="buyer-profile-revision-summary" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Oppsummering / kundens behov
                </label>
                <textarea
                  id="buyer-profile-revision-summary"
                  value={form.summary}
                  onChange={(event) => setForm((current) => current ? { ...current, summary: event.target.value } : current)}
                  rows={5}
                  className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-slate-100 outline-none focus:border-primary-500"
                  placeholder="Skriv oppdatert behovstekst her..."
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="buyer-profile-revision-budget" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Budsjett
                </label>
                <Input
                  id="buyer-profile-revision-budget"
                  inputMode="decimal"
                  value={form.budgetAmount}
                  onChange={(event) => setForm((current) => current ? { ...current, budgetAmount: event.target.value } : current)}
                  placeholder="F.eks. 550000"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="buyer-profile-revision-currency" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Valuta
                </label>
                <Input
                  id="buyer-profile-revision-currency"
                  value={form.budgetCurrency}
                  onChange={(event) => setForm((current) => current ? { ...current, budgetCurrency: event.target.value.toUpperCase().slice(0, 3) } : current)}
                  placeholder="EUR"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="buyer-profile-revision-readiness" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Kjøpsstatus
                </label>
                <select
                  id="buyer-profile-revision-readiness"
                  value={form.purchaseReadiness}
                  onChange={(event) => setForm((current) => current ? { ...current, purchaseReadiness: event.target.value as PurchaseReadiness } : current)}
                  className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100"
                >
                  <option value="unknown">Ukjent</option>
                  <option value="cold">Tidlig fase</option>
                  <option value="warm">Varm</option>
                  <option value="hot">Veldig interessert</option>
                  <option value="ready_to_buy">Kjøpsklar</option>
                </select>
              </div>

              <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                <label className="flex items-center gap-2 text-sm text-slate-200">
                  <input
                    type="checkbox"
                    checked={form.locationFlexible}
                    onChange={(event) => setForm((current) => current ? { ...current, locationFlexible: event.target.checked } : current)}
                    className="h-4 w-4 rounded border-slate-700 bg-slate-950"
                  />
                  Område er fleksibelt
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-200">
                  <input
                    type="checkbox"
                    checked={form.budgetIncludesCosts}
                    onChange={(event) => setForm((current) => current ? { ...current, budgetIncludesCosts: event.target.checked } : current)}
                    className="h-4 w-4 rounded border-slate-700 bg-slate-950"
                  />
                  Budsjett inkluderer omkostninger
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-200">
                  <input
                    type="checkbox"
                    checked={form.budgetApproximate}
                    onChange={(event) => setForm((current) => current ? { ...current, budgetApproximate: event.target.checked } : current)}
                    className="h-4 w-4 rounded border-slate-700 bg-slate-950"
                  />
                  Budsjett er omtrentlig
                </label>
              </div>

              <div className="space-y-1 lg:col-span-2">
                <label htmlFor="buyer-profile-revision-note" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Intern revisjonsnote
                </label>
                <textarea
                  id="buyer-profile-revision-note"
                  value={form.revisionNote}
                  onChange={(event) => setForm((current) => current ? { ...current, revisionNote: event.target.value } : current)}
                  rows={3}
                  className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-slate-100 outline-none focus:border-primary-500"
                  placeholder="F.eks. Kunde ringte og økte budsjettet fra 400 000 til 550 000."
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-800 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2 text-xs text-amber-100">
                <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-300" />
                <p>
                  Kriterier kopieres uendret i denne versjonen. Detaljert kriterie-redigering bør tas som egen, trygg PR.
                </p>
              </div>
              <Button type="button" onClick={saveRevision} disabled={!canSave}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Lagre som ny versjon
              </Button>
            </div>

            {saveError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
                <p className="font-semibold">{saveError.code}</p>
                <p className="mt-1">{saveError.message}</p>
                {saveError.details && <pre className="mt-2 max-h-40 overflow-auto rounded bg-red-950/50 p-2 text-xs">{prettyJson(saveError.details)}</pre>}
                <p className="mt-2 text-xs text-red-100/70">Correlation ID: {saveError.correlationId}</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
