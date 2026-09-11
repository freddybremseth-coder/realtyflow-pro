"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Save, Search } from "lucide-react";

type ReviewItem = {
  id: string;
  brandId: string | null;
  contactId: string;
  customerName: string | null;
  customerEmail: string | null;
  buyerProfileId: string | null;
  buyerProfileVersion: number | null;
  replyPreview: string;
  nextAction: string;
};

type ReviewPayload = { items?: ReviewItem[]; error?: string };

type WorkItem = {
  buyerProfileId: string;
  profileStatus: string;
  purchaseReadiness: string | null;
  summary: string | null;
  budgetAmount: number | null;
  budgetCurrency: string | null;
  budgetIncludesCosts?: boolean | null;
  locationFlexible: boolean;
};

type WorklistOk = { ok: true; result: { items: WorkItem[] } };
type ApiError = { ok: false; error: { message: string } };

type Criterion = {
  id: string;
  criterionType: "hard_requirement" | "preference" | "exclusion" | "missing_information";
  key: string;
  otherKey: string | null;
  operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "not_in" | "contains" | "exists" | "unknown";
  value: unknown;
  weight: number | null;
  severity: "reject" | "major_penalty" | "minor_penalty" | null;
  appliesToPropertyTypes: string[];
  sourceText: string | null;
  customerConfirmed: boolean;
  active: boolean;
};

type CriteriaOk = { ok: true; result: { criteria: Criterion[] } };
type RevisionOk = {
  ok: true;
  result: {
    buyerProfileId: string;
    previousVersion: number;
    version: number;
    criteriaCopied: number;
  };
};

function asInput(value: unknown) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function numberOrNull(value: string) {
  const cleaned = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Ugyldig tall: ${value}`);
  return parsed;
}

function hardRequirement(key: string, operator: Criterion["operator"], value: string | number): Criterion {
  return {
    id: `manual-${key}`,
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

export default function BuyerCriteriaReviewPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [review, setReview] = useState<ReviewItem | null>(null);
  const [profile, setProfile] = useState<WorkItem | null>(null);
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [area, setArea] = useState("");
  const [bedrooms, setBedrooms] = useState("");
  const [bathrooms, setBathrooms] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [propertyType, setPropertyType] = useState("");
  const [resolved, setResolved] = useState<{ version: number; buyerProfileId: string } | null>(null);

  const reviewId = useMemo(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("reviewId") || new URLSearchParams(window.location.search).get("criteriaReviewId") || "";
  }, []);

  function fillFields(active: Criterion[]) {
    const byKey = new Map(active.map((criterion) => [criterion.key, criterion]));
    setArea(asInput(byKey.get("location")?.value));
    setBedrooms(asInput(byKey.get("bedrooms")?.value));
    setBathrooms(asInput(byKey.get("bathrooms")?.value));
    setMaxPrice(asInput(byKey.get("purchase_price")?.value));
    setPropertyType(asInput(byKey.get("property_type")?.value));
  }

  useEffect(() => {
    if (!reviewId) {
      setError("Mangler review-id. Åpne saken fra Nexus Inbox.");
      setLoading(false);
      return;
    }

    void (async () => {
      try {
        const reviewResponse = await fetch(`/api/nexus/buyer-criteria-reviews?reviewId=${encodeURIComponent(reviewId)}&limit=1`, { cache: "no-store" });
        const reviewBody = await reviewResponse.json() as ReviewPayload;
        if (!reviewResponse.ok) throw new Error(reviewBody.error || "Kunne ikke hente kundesvaret.");
        const item = reviewBody.items?.[0];
        if (!item) throw new Error("Review-saken er ikke lenger åpen, eller krever ikke menneskelig tolkning.");
        if (!item.brandId || !item.contactId || !item.buyerProfileId) throw new Error("Saken mangler kobling til aktiv Buyer Profile.");
        setReview(item);

        const worklistParams = new URLSearchParams({ brand: item.brandId, contactId: item.contactId, limit: "50" });
        const worklistResponse = await fetch(`/api/lead-intelligence/worklist?${worklistParams.toString()}`, { cache: "no-store" });
        const worklistBody = await worklistResponse.json() as WorklistOk | ApiError;
        if (!worklistResponse.ok || !worklistBody.ok) throw new Error((worklistBody as ApiError).error?.message || "Kunne ikke hente Buyer Profile.");
        const selected = worklistBody.result.items.find((candidate) => candidate.buyerProfileId === item.buyerProfileId)
          || worklistBody.result.items.find((candidate) => candidate.profileStatus === "approved");
        if (!selected) throw new Error("Fant ingen aktiv Buyer Profile for kunden.");
        setProfile(selected);

        const criteriaResponse = await fetch(`/api/lead-intelligence/buyer-profiles/${selected.buyerProfileId}/revision?brand=${encodeURIComponent(item.brandId)}`, { cache: "no-store" });
        const criteriaBody = await criteriaResponse.json() as CriteriaOk | ApiError;
        if (!criteriaResponse.ok || !criteriaBody.ok) throw new Error((criteriaBody as ApiError).error?.message || "Kunne ikke hente søkekriteriene.");
        const active = criteriaBody.result.criteria.filter((criterion) => criterion.active);
        setCriteria(active);
        fillFields(active);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Ukjent feil ved lasting av review.");
      } finally {
        setLoading(false);
      }
    })();
  }, [reviewId]);

  function replacementCriteria() {
    const overrides: Criterion[] = [];
    const bedroomsValue = numberOrNull(bedrooms);
    const bathroomsValue = numberOrNull(bathrooms);
    const priceValue = numberOrNull(maxPrice);
    if (area.trim()) overrides.push(hardRequirement("location", "eq", area.trim()));
    if (bedroomsValue !== null) overrides.push(hardRequirement("bedrooms", "gte", bedroomsValue));
    if (bathroomsValue !== null) overrides.push(hardRequirement("bathrooms", "gte", bathroomsValue));
    if (priceValue !== null) overrides.push(hardRequirement("purchase_price", "lte", priceValue));
    if (propertyType.trim()) overrides.push(hardRequirement("property_type", "eq", propertyType.trim()));
    if (!overrides.length) throw new Error("Legg inn minst ett bekreftet kriterium.");
    const overridden = new Set(overrides.map((criterion) => criterion.key));
    return [...criteria.filter((criterion) => criterion.active && !overridden.has(criterion.key)), ...overrides];
  }

  async function saveAndContinue() {
    if (!review || !profile) return;
    setSaving(true);
    setError("");
    try {
      const nextCriteria = replacementCriteria();
      const revisionResponse = await fetch(`/api/lead-intelligence/buyer-profiles/${profile.buyerProfileId}/revision`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-correlation-id": `nexus-human-criteria-${Date.now()}` },
        body: JSON.stringify({
          brand: review.brandId,
          summary: profile.summary || "Buyer Profile korrigert etter menneskelig tolkning av kundesvar.",
          purchaseReadiness: profile.purchaseReadiness || "unknown",
          budgetAmount: profile.budgetAmount,
          budgetCurrency: profile.budgetCurrency || "EUR",
          budgetIncludesCosts: profile.budgetIncludesCosts ?? null,
          budgetApproximate: false,
          locationFlexible: profile.locationFlexible,
          revisionNote: "Tvetydig kundesvar tolket manuelt i Nexus Buyer Criteria.",
          editedBy: "Freddy via Nexus Buyer Criteria",
          criteria: nextCriteria.map(({ id: _id, ...criterion }) => criterion),
        }),
      });
      const revisionBody = await revisionResponse.json() as RevisionOk | ApiError;
      if (!revisionResponse.ok || !revisionBody.ok) throw new Error((revisionBody as ApiError).error?.message || "Kunne ikke lagre ny Buyer Profile-versjon.");

      const resolveResponse = await fetch(`/api/nexus/buyer-criteria-reviews/${encodeURIComponent(review.id)}/resolve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ buyerProfileId: revisionBody.result.buyerProfileId }),
      });
      const resolveBody = await resolveResponse.json().catch(() => ({}));
      if (!resolveResponse.ok) {
        throw new Error(`Buyer Profile v${revisionBody.result.version} ble lagret, men review kunne ikke avsluttes: ${resolveBody?.error || "ukjent feil"}`);
      }

      setResolved({ version: revisionBody.result.version, buyerProfileId: revisionBody.result.buyerProfileId });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ukjent feil ved lagring.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main className="mx-auto max-w-5xl p-6"><div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-6"><Loader2 className="h-5 w-5 animate-spin" /> Henter kundesvar og Buyer Profile …</div></main>;

  return <main className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
    <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="text-xs font-black uppercase tracking-[0.2em] text-cyan-700">Nexus Buyer Intelligence</div>
      <h1 className="mt-2 text-3xl font-black text-slate-950">Tolk kundesvar og korriger søkekriterier</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Dette er bare for svar Nexus ikke kan tolke sikkert. Du bestemmer kriteriene én gang; deretter fortsetter Nexus automatisk med ny boligmatching.</p>
    </header>

    {error && <div className="flex gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><div>{error}</div></div>}

    {review && <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
      <div className="text-xs font-black uppercase tracking-wider text-amber-800">Kundens svar</div>
      <div className="mt-2 text-lg font-black text-slate-950">{review.customerName || review.customerEmail || "Kunde"}</div>
      <blockquote className="mt-3 whitespace-pre-wrap rounded-xl border border-amber-200 bg-white p-4 text-sm leading-6 text-slate-800">{review.replyPreview || "Ingen tekst-preview tilgjengelig. Kontroller Customer 360 før du lagrer."}</blockquote>
      <p className="mt-3 text-sm text-amber-900">{review.nextAction}</p>
    </section>}

    {profile && !resolved && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div><div className="text-xs font-black uppercase tracking-wider text-slate-500">Aktiv Buyer Profile</div><div className="mt-1 font-black text-slate-950">Versjon {review?.buyerProfileVersion ?? "–"}</div></div>
        {review?.contactId && <Link href={`/customers/${encodeURIComponent(review.contactId)}`} className="text-sm font-black text-cyan-700">Åpne Customer 360</Link>}
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-5">
        <label className="text-xs font-bold text-slate-600">Område<input className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" value={area} onChange={(event) => setArea(event.target.value)} placeholder="Altea" /></label>
        <label className="text-xs font-bold text-slate-600">Soverom min.<input className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" inputMode="numeric" value={bedrooms} onChange={(event) => setBedrooms(event.target.value)} placeholder="3" /></label>
        <label className="text-xs font-bold text-slate-600">Bad min.<input className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" inputMode="numeric" value={bathrooms} onChange={(event) => setBathrooms(event.target.value)} placeholder="2" /></label>
        <label className="text-xs font-bold text-slate-600">Makspris<input className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" inputMode="decimal" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} placeholder="450000" /></label>
        <label className="text-xs font-bold text-slate-600">Boligtype<input className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" value={propertyType} onChange={(event) => setPropertyType(event.target.value)} placeholder="villa" /></label>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">Feltene er fylt med dagens kriterier. Endre bare det kunden faktisk har ment. Andre aktive kriterier beholdes uendret.</p>

      <details className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <summary className="cursor-pointer text-sm font-black text-slate-800">Vis alle aktive kriterier ({criteria.length})</summary>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">{criteria.map((criterion) => <div key={criterion.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700"><span className="font-black">{criterion.key}</span> · {criterion.operator} · {asInput(criterion.value)}</div>)}</div>
      </details>

      <div className="mt-5 flex justify-end">
        <button onClick={() => void saveAndContinue()} disabled={saving} className="inline-flex items-center rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-50">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Lagre og fortsett automatisk</button>
      </div>
    </section>}

    {resolved && <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-950">
      <div className="flex gap-3"><CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0" /><div><h2 className="text-lg font-black">Kriteriene er lagret og review er avsluttet</h2><p className="mt-1 text-sm leading-6 text-emerald-900">Buyer Profile v{resolved.version} er godkjent. Nexus har fått beskjed om å bruke denne versjonen og kjører automatisk ny boligmatching på neste matching-runde.</p><div className="mt-4 flex flex-wrap gap-2"><Link href="/nexus-os/inbox" className="rounded-xl bg-emerald-950 px-4 py-2 text-sm font-black text-white">Tilbake til Nexus Inbox</Link><Link href={`/lead-intelligence?buyerProfileId=${encodeURIComponent(resolved.buyerProfileId)}`} className="inline-flex items-center rounded-xl border border-emerald-300 bg-white px-4 py-2 text-sm font-black text-emerald-950"><Search className="mr-2 h-4 w-4" />Se matching</Link></div></div></div>
    </section>}
  </main>;
}
