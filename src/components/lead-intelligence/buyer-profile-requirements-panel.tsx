"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, Save, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { BRANDS } from "@/lib/constants";

type CriterionType = "hard_requirement" | "preference" | "exclusion" | "missing_information";
type CriterionOperator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "not_in" | "contains" | "exists" | "unknown";
type CriterionSeverity = "reject" | "major_penalty" | "minor_penalty" | null;

type WorkItem = {
  buyerProfileId: string;
  profileStatus: string;
  purchaseReadiness: string | null;
  summary: string | null;
  budgetAmount: number | null;
  budgetCurrency: string | null;
  budgetIncludesCosts?: boolean | null;
  locationFlexible: boolean;
  linkedContact: {
    name: string | null;
    maskedEmail: string | null;
    maskedPhone: string | null;
  } | null;
};

type WorklistOk = {
  ok: true;
  result: {
    items: WorkItem[];
  };
};

type ApiError = {
  ok: false;
  error: {
    message: string;
    code: string;
    correlationId: string;
  };
};

type CriteriaDetailsOk = {
  ok: true;
  result: {
    criteria: Array<{
      id: string;
      criterionType: string;
      key: string;
      otherKey: string | null;
      operator: string;
      value: unknown;
      weight: number | null;
      severity: string | null;
      appliesToPropertyTypes: string[];
      sourceText: string | null;
      customerConfirmed: boolean;
      active: boolean;
    }>;
  };
};

type SaveOk = {
  ok: true;
  result: {
    buyerProfileId: string;
    previousVersion: number;
    version: number;
    criteriaCopied: number;
    criteriaReplaced?: boolean;
  };
};

type CriterionPayload = {
  criterionType: CriterionType;
  key: string;
  otherKey: string | null;
  operator: CriterionOperator;
  value: unknown;
  weight: number | null;
  severity: CriterionSeverity;
  appliesToPropertyTypes: string[];
  sourceText: string;
  customerConfirmed: boolean;
  active: boolean;
};

const realEstateBrands = BRANDS.filter((brand) => brand.type === "real_estate");
const editableKeys = new Set(["location", "bedrooms", "bathrooms", "purchase_price", "property_type"]);
const criterionTypes = new Set(["hard_requirement", "preference", "exclusion", "missing_information"]);
const operators = new Set(["eq", "neq", "gt", "gte", "lt", "lte", "in", "not_in", "contains", "exists", "unknown"]);
const severities = new Set(["reject", "major_penalty", "minor_penalty"]);

function parseOptionalNumber(value: string) {
  const cleaned = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Ugyldig tall: ${value}`);
  return parsed;
}

function valueToInput(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

function labelForProfile(item: WorkItem) {
  const contact = item.linkedContact?.name || item.linkedContact?.maskedEmail || item.linkedContact?.maskedPhone || "Uten kontakt";
  const summary = item.summary?.slice(0, 70) || "Ingen oppsummering";
  return `${contact} · ${summary}`;
}

function correlationId() {
  return `rf_req_ui_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 18)}`;
}

function matchingUrl(buyerProfileId: string) {
  return `/lead-intelligence?${new URLSearchParams({ buyerProfileId }).toString()}`;
}

function normalizeCriterionType(value: string): CriterionType {
  return criterionTypes.has(value) ? (value as CriterionType) : "hard_requirement";
}

function normalizeOperator(value: string): CriterionOperator {
  return operators.has(value) ? (value as CriterionOperator) : "eq";
}

function normalizeSeverity(value: string | null): CriterionSeverity {
  return value && severities.has(value) ? (value as CriterionSeverity) : null;
}

function normalizeExistingCriterion(criterion: CriteriaDetailsOk["result"]["criteria"][number]): CriterionPayload {
  const criterionType = normalizeCriterionType(criterion.criterionType);
  const operator = normalizeOperator(criterion.operator);
  const severity = criterionType === "exclusion" ? normalizeSeverity(criterion.severity) || "major_penalty" : null;
  const weight = criterionType === "preference" ? criterion.weight ?? 0.5 : null;

  return {
    criterionType,
    key: criterion.key,
    otherKey: criterion.key === "other" ? criterion.otherKey : null,
    operator,
    value: criterion.value ?? null,
    weight,
    severity,
    appliesToPropertyTypes: criterion.appliesToPropertyTypes || [],
    sourceText: criterion.sourceText || `${criterion.key} ${operator} ${valueToInput(criterion.value)}`,
    customerConfirmed: criterion.customerConfirmed,
    active: criterion.active,
  };
}

function hardRequirement(key: string, operator: CriterionOperator, value: string | number): CriterionPayload {
  return {
    criterionType: "hard_requirement",
    key,
    otherKey: null,
    operator,
    value,
    weight: null,
    severity: null,
    appliesToPropertyTypes: [],
    sourceText: `${key} ${operator} ${value}`,
    customerConfirmed: true,
    active: true,
  };
}

export function BuyerProfileRequirementsPanel({
  featureEnabled,
  persistenceEnabled,
  propertyMatchingEnabled,
}: {
  featureEnabled: boolean;
  persistenceEnabled: boolean;
  propertyMatchingEnabled: boolean;
}) {
  const [brand, setBrand] = useState(realEstateBrands[0]?.id || "zeneco");
  const [profiles, setProfiles] = useState<WorkItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [criteria, setCriteria] = useState<CriterionPayload[]>([]);
  const [area, setArea] = useState("");
  const [bedrooms, setBedrooms] = useState("");
  const [bathrooms, setBathrooms] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [propertyType, setPropertyType] = useState("");
  const [loading, setLoading] = useState(false);
  const [criteriaLoading, setCriteriaLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<SaveOk | null>(null);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.buyerProfileId === selectedId) || null,
    [profiles, selectedId],
  );

  function fillEditableFields(nextCriteria: CriterionPayload[]) {
    const byKey = new Map(nextCriteria.map((criterion) => [criterion.key, criterion]));
    setArea(valueToInput(byKey.get("location")?.value));
    setBedrooms(valueToInput(byKey.get("bedrooms")?.value));
    setBathrooms(valueToInput(byKey.get("bathrooms")?.value));
    setMaxPrice(valueToInput(byKey.get("purchase_price")?.value));
    setPropertyType(valueToInput(byKey.get("property_type")?.value));
  }

  async function loadCriteria(buyerProfileId: string, nextBrand = brand) {
    if (!buyerProfileId) return;
    setCriteriaLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ brand: nextBrand });
      const response = await fetch(`/api/lead-intelligence/buyer-profiles/${buyerProfileId}/revision?${params.toString()}`, {
        headers: { accept: "application/json" },
      });
      const body = (await response.json()) as CriteriaDetailsOk | ApiError;
      if (!response.ok || !body.ok) throw new Error((body as ApiError).error?.message || "Kunne ikke hente krav.");

      const nextCriteria = body.result.criteria.map(normalizeExistingCriterion).filter((criterion) => criterion.active);
      setCriteria(nextCriteria);
      fillEditableFields(nextCriteria);
    } catch (caught) {
      setCriteria([]);
      fillEditableFields([]);
      setError(caught instanceof Error ? caught.message : "Ukjent feil ved henting av krav.");
    } finally {
      setCriteriaLoading(false);
    }
  }

  async function loadProfiles(nextBrand = brand) {
    if (!featureEnabled || !persistenceEnabled) return;
    setLoading(true);
    setError("");
    setSaved(null);
    try {
      const params = new URLSearchParams({ brand: nextBrand, limit: "50" });
      const response = await fetch(`/api/lead-intelligence/worklist?${params.toString()}`, {
        headers: { accept: "application/json" },
      });
      const body = (await response.json()) as WorklistOk | ApiError;
      if (!response.ok || !body.ok) throw new Error((body as ApiError).error?.message || "Kunne ikke hente profiler.");

      const activeProfiles = body.result.items.filter((item) => item.profileStatus === "draft" || item.profileStatus === "approved");
      setProfiles(activeProfiles);
      const nextSelectedId = activeProfiles[0]?.buyerProfileId || "";
      setSelectedId(nextSelectedId);
      if (nextSelectedId) await loadCriteria(nextSelectedId, nextBrand);
    } catch (caught) {
      setProfiles([]);
      setSelectedId("");
      setCriteria([]);
      fillEditableFields([]);
      setError(caught instanceof Error ? caught.message : "Ukjent feil ved henting.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProfiles(brand);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand, featureEnabled, persistenceEnabled]);

  async function handleSelectProfile(buyerProfileId: string) {
    setSelectedId(buyerProfileId);
    setSaved(null);
    await loadCriteria(buyerProfileId);
  }

  function buildReplacementCriteria() {
    const overrides: CriterionPayload[] = [];
    const bedroomsNumber = parseOptionalNumber(bedrooms);
    const bathroomsNumber = parseOptionalNumber(bathrooms);
    const maxPriceNumber = parseOptionalNumber(maxPrice);

    if (area.trim()) overrides.push(hardRequirement("location", "eq", area.trim()));
    if (bedroomsNumber !== null) overrides.push(hardRequirement("bedrooms", "gte", bedroomsNumber));
    if (bathroomsNumber !== null) overrides.push(hardRequirement("bathrooms", "gte", bathroomsNumber));
    if (maxPriceNumber !== null) overrides.push(hardRequirement("purchase_price", "lte", maxPriceNumber));
    if (propertyType.trim()) overrides.push(hardRequirement("property_type", "eq", propertyType.trim()));

    if (overrides.length === 0) throw new Error("Legg inn minst ett krav før lagring.");

    const overriddenKeys = new Set(overrides.map((criterion) => criterion.key));
    const preserved = criteria.filter((criterion) => !overriddenKeys.has(criterion.key) && criterion.active);
    return [...preserved, ...overrides];
  }

  async function saveRequirements() {
    if (!selectedProfile) return;

    let replacementCriteria: CriterionPayload[];
    try {
      replacementCriteria = buildReplacementCriteria();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kravene kunne ikke leses.");
      return;
    }

    const confirmed = window.confirm(
      "Lagre kravene som ny buyer profile-versjon? Gamle shortlists og presentasjoner endres ikke.",
    );
    if (!confirmed) return;

    setSaving(true);
    setError("");
    setSaved(null);
    try {
      const response = await fetch(`/api/lead-intelligence/buyer-profiles/${selectedProfile.buyerProfileId}/revision`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-correlation-id": correlationId(),
        },
        body: JSON.stringify({
          brand,
          summary: selectedProfile.summary || "Oppdatert buyer profile etter endring av krav.",
          purchaseReadiness: selectedProfile.purchaseReadiness || "unknown",
          budgetAmount: selectedProfile.budgetAmount,
          budgetCurrency: selectedProfile.budgetCurrency || "EUR",
          budgetIncludesCosts: selectedProfile.budgetIncludesCosts ?? null,
          budgetApproximate: false,
          locationFlexible: selectedProfile.locationFlexible,
          revisionNote: "Krav oppdatert fra Lead Intelligence UI.",
          criteria: replacementCriteria,
        }),
      });
      const body = (await response.json()) as SaveOk | ApiError;
      if (!response.ok || !body.ok) throw new Error((body as ApiError).error?.message || "Kunne ikke lagre krav.");

      setSaved(body);
      await loadProfiles(brand);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ukjent feil ved lagring.");
    } finally {
      setSaving(false);
    }
  }

  if (!featureEnabled || !persistenceEnabled) return null;

  return (
    <Card className="border-amber-500/20 bg-slate-950/70">
      <CardHeader>
        <CardTitle>Rediger krav</CardTitle>
        <p className="text-sm text-slate-400">
          Bruk denne når kundens faktiske søk endrer seg, for eksempel «vurderer Polop». Da lagres kravet som
          strukturert matching-kriterium, ikke bare som fritekst.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-amber-100">
          Lagres som ny buyer profile-versjon. Eksisterende krav beholdes, og feltene under erstatter bare samme type krav.
        </div>

        <div className="grid gap-3 lg:grid-cols-[180px,1fr]">
          <select
            value={brand}
            onChange={(event) => setBrand(event.target.value)}
            className="h-10 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100"
          >
            {realEstateBrands.map((option) => (
              <option key={option.id} value={option.id}>{option.name}</option>
            ))}
          </select>
          <select
            value={selectedId}
            onChange={(event) => void handleSelectProfile(event.target.value)}
            disabled={loading || profiles.length === 0}
            className="h-10 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100"
          >
            {profiles.length === 0 ? (
              <option value="">Ingen aktive profiler</option>
            ) : (
              profiles.map((profile) => (
                <option key={profile.buyerProfileId} value={profile.buyerProfileId}>{labelForProfile(profile)}</option>
              ))
            )}
          </select>
        </div>

        <div className="grid gap-3 md:grid-cols-5">
          <Input placeholder="Område, f.eks. Polop" value={area} onChange={(event) => setArea(event.target.value)} />
          <Input placeholder="Soverom min." inputMode="numeric" value={bedrooms} onChange={(event) => setBedrooms(event.target.value)} />
          <Input placeholder="Bad min." inputMode="numeric" value={bathrooms} onChange={(event) => setBathrooms(event.target.value)} />
          <Input placeholder="Makspris" inputMode="decimal" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} />
          <Input placeholder="Boligtype" value={propertyType} onChange={(event) => setPropertyType(event.target.value)} />
        </div>

        <p className="text-xs text-slate-500">
          Eksempel: skriv <strong className="text-slate-300">Polop</strong> i områdefeltet og lagre. Ny profilversjon får da
          kriteriet <code>location = Polop</code>, og ny matching bruker dette.
        </p>

        {criteriaLoading && <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-3 text-sm text-cyan-100">Henter eksisterende krav...</div>}
        {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">{error}</div>}

        {saved && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4" />
              <div>
                <p className="font-semibold">Ny kravversjon er lagret.</p>
                <p className="mt-1 text-xs">
                  Versjon {saved.result.previousVersion} → {saved.result.version}. Kriterier: {saved.result.criteriaCopied}.
                </p>
                <Button asChild size="sm" className="mt-3" disabled={!propertyMatchingEnabled}>
                  <a href={matchingUrl(saved.result.buyerProfileId)}>
                    <Search className="mr-2 h-4 w-4" />
                    Kjør ny matching
                  </a>
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => void loadProfiles()} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Oppdater
          </Button>
          <Button type="button" onClick={saveRequirements} disabled={!selectedProfile || saving || criteriaLoading}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Lagre krav som ny versjon
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
