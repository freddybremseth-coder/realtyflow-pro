import { CheckCircle2, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type LeadIntelligencePresentationPreview = {
  summary: string | null;
  budget: {
    amount: number | null;
    currency: string | null;
    includesCosts: boolean | null;
    approximate: boolean | null;
  } | null;
  needs: string[];
  verification: string[];
  properties: Array<{
    propertyId: string | null;
    reference: string | null;
    title: string;
    location: string | null;
    imageUrl: string | null;
    publicUrl: string | null;
    facts: string[];
    decision: string | null;
    systemEligibility: string | null;
    score: number | null;
    dataQualityScore: number | null;
    reasons: string[];
    concerns: string[];
    questionsToVerify: string[];
  }>;
};

function formatCurrency(value: number | null, currency = "EUR") {
  if (value === null) return null;
  try {
    return new Intl.NumberFormat("nb-NO", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return new Intl.NumberFormat("nb-NO", {
      maximumFractionDigits: 0,
    }).format(value);
  }
}

function uniquePresentationItems(values: Array<string | null | undefined>, limit = 6) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))).slice(0, limit);
}

export function leadIntelligenceMatchAnchor(propertyId: string | null) {
  return propertyId ? `lead-intelligence-match-${propertyId}` : null;
}

export function leadIntelligenceMatchReturnUrl(baseReturnTo: string | null | undefined, propertyId: string | null) {
  const anchor = leadIntelligenceMatchAnchor(propertyId);
  if (!anchor) return baseReturnTo || null;
  const withoutHash = (baseReturnTo || "/lead-intelligence").split("#")[0] || "/lead-intelligence";
  return `${withoutHash}#${anchor}`;
}

export function internalInventoryPropertyUrl(propertyId: string | null, returnTo?: string | null) {
  if (!propertyId) return null;
  const params = new URLSearchParams({ propertyId });
  if (returnTo) params.set("returnTo", returnTo);
  return `/inventory?${params.toString()}`;
}

export function PropertyNavigationLinks({
  propertyId,
  publicUrl,
  returnTo,
}: {
  propertyId: string | null;
  publicUrl?: string | null;
  returnTo?: string | null;
}) {
  const realtyFlowUrl = internalInventoryPropertyUrl(propertyId, returnTo);

  if (!publicUrl && !realtyFlowUrl) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
        Lenke mangler i eiendomsdata
      </div>
    );
  }

  return (
    <div className="flex shrink-0 flex-wrap gap-2">
      {realtyFlowUrl && (
        <Button asChild size="sm" variant="outline">
          <a href={realtyFlowUrl}>
            <ExternalLink className="mr-2 h-4 w-4" />
            Åpne boligkort
          </a>
        </Button>
      )}
      {publicUrl && (
        <Button asChild size="sm" variant="secondary">
          <a href={publicUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-2 h-4 w-4" />
            Åpne kundelenke
          </a>
        </Button>
      )}
    </div>
  );
}

function PresentationPreviewList({
  title,
  items,
  emptyLabel,
  tone = "default",
}: {
  title: string;
  items: string[];
  emptyLabel: string;
  tone?: "default" | "warning";
}) {
  const dotClass = tone === "warning" ? "bg-amber-300" : "bg-emerald-300";
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      {items.length > 0 ? (
        <ul className="mt-2 space-y-2 text-sm leading-relaxed text-slate-200">
          {items.map((item) => (
            <li key={item} className="flex gap-2">
              <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-slate-500">{emptyLabel}</p>
      )}
    </section>
  );
}

function PresentationDraftReadiness({
  preview,
}: {
  preview: LeadIntelligencePresentationPreview;
}) {
  const missingCustomerLinks = preview.properties.filter((property) => !property.publicUrl);
  const propertyCount = preview.properties.length;
  const verificationItems = uniquePresentationItems([
    ...preview.verification,
    ...preview.properties.flatMap((property) => property.questionsToVerify),
    ...preview.properties.flatMap((property) => property.concerns),
  ], 8);
  const hasProperties = preview.properties.length > 0;
  const allCustomerLinksReady = hasProperties && missingCustomerLinks.length === 0;
  const hasLeanShortlist = propertyCount > 0 && propertyCount <= 5;
  const canUseManually = hasProperties && verificationItems.length === 0 && allCustomerLinksReady;
  const needsShortlistTrim = propertyCount > 5;
  const readinessLabel = canUseManually ? "Klar for manuell deling" : "Må kvalitetssikres";
  const nextActions = uniquePresentationItems([
    !hasProperties ? "Lag et shortlist-utkast med minst én godkjent bolig." : null,
    needsShortlistTrim ? "Vurder å korte ned utkastet til 3–5 boliger før kunden får det." : null,
    missingCustomerLinks.length > 0 ? "Kontroller eller legg inn kundelenker for boligene som mangler offentlig lenke." : null,
    verificationItems.length > 0 ? "Avklar punktene under før teksten brukes mot kunde." : null,
    hasProperties ? "Åpne boligkortene i RealtyFlow og kontroller pris, tilgjengelighet og nøkkelfakta manuelt." : null,
    canUseManually ? "Les gjennom e-postteksten og kopier den manuelt når du er fornøyd." : null,
  ], 6);

  return (
    <section className="mt-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-100">Før deling med kunde</p>
          <p className="mt-1 text-xs text-slate-500">
            Dette er en intern kvalitetssjekk for manuell bruk. Den sender ikke e-post og publiserer ikke presentasjon.
          </p>
        </div>
        <Badge variant={canUseManually ? "success" : "warning"}>
          {readinessLabel}
        </Badge>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-4">
        <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Utvalg</p>
          <p className="mt-2 text-sm text-slate-200">
            {hasProperties
              ? `${propertyCount} bolig${propertyCount === 1 ? "" : "er"} i utkastet.`
              : "Ingen boliger i utkastet."}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {hasLeanShortlist ? "Passer som kort kundeliste." : "3–5 boliger er vanligvis mest oversiktlig."}
          </p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Kundelenker</p>
          <p className="mt-2 text-sm text-slate-200">
            {allCustomerLinksReady
              ? "Alle boligkort har ekstern nettsidelenke."
              : `${missingCustomerLinks.length} bolig${missingCustomerLinks.length === 1 ? "" : "er"} mangler kundelenke.`}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            RealtyFlow-lenker er bare interne for Freddy.
          </p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Avklaringer</p>
          <p className="mt-2 text-sm text-slate-200">
            {verificationItems.length === 0
              ? "Ingen åpne avklaringer er lagret i utkastet."
              : `${verificationItems.length} punkt${verificationItems.length === 1 ? "" : "er"} må vurderes før sending.`}
          </p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sikkerhet</p>
          <p className="mt-2 text-sm text-slate-200">E-poststatus: draft.</p>
          <p className="mt-1 text-xs text-slate-500">Ingen send-knapp finnes i denne fasen.</p>
        </div>
      </div>

      {nextActions.length > 0 && (
        <div className="mt-3 rounded-lg border border-primary-500/20 bg-primary-500/10 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-200">Anbefalt neste handling</p>
          <ul className="mt-2 space-y-1 text-xs text-primary-50">
            {nextActions.map((item) => (
              <li key={item} className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary-200" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {verificationItems.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-amber-100">
          {verificationItems.slice(0, 5).map((item) => (
            <li key={item} className="rounded border border-amber-500/20 bg-amber-500/10 px-2 py-1">
              {item}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function InternalPresentationPreview({
  preview,
  returnTo,
  anchorCards = false,
  highlightedMatchId = null,
}: {
  preview: LeadIntelligencePresentationPreview;
  returnTo?: string | null;
  anchorCards?: boolean;
  highlightedMatchId?: string | null;
}) {
  return (
    <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950/80 p-4 text-sm text-slate-200 sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-base font-semibold text-slate-100">Intern presentasjons-preview</p>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Viser trygg preview fra lagret presentasjon. Den er ikke publisert og sendes ikke.
          </p>
        </div>
        {preview.budget?.amount !== null && preview.budget?.amount !== undefined && (
          <Badge variant="secondary">
            Budsjett {formatCurrency(preview.budget.amount, preview.budget.currency || "EUR")}
          </Badge>
        )}
      </div>

      {preview.needs.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Behov</p>
          <ul className="mt-2 grid gap-2 text-sm text-slate-200 md:grid-cols-2">
            {preview.needs.map((item) => (
              <li key={item} className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 leading-relaxed">
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      <PresentationDraftReadiness preview={preview} />

      <div className="mt-3 space-y-3">
        {preview.properties.length === 0 ? (
          <p className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            Presentasjonen inneholder ingen boligkort. Lag et nytt presentasjonsutkast fra en lagret shortlist.
          </p>
        ) : (
          preview.properties.map((property, index) => (
            <div
              key={`${property.propertyId || property.reference || property.title}-${index}`}
              id={anchorCards ? leadIntelligenceMatchAnchor(property.propertyId) || undefined : undefined}
              className={`scroll-mt-28 rounded-xl border bg-slate-900/70 transition-all duration-500 ${
                anchorCards && property.propertyId && highlightedMatchId === property.propertyId
                  ? "border-primary-300 ring-2 ring-primary-300/70"
                  : "border-slate-800"
              }`}
            >
              <div className="grid gap-0 xl:grid-cols-[minmax(220px,320px),1fr]">
                {property.imageUrl && (
                  <img
                    src={property.imageUrl}
                    alt={property.title}
                    className="h-48 w-full object-cover xl:h-full"
                    loading="lazy"
                  />
                )}
                <div className="space-y-4 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-base font-semibold leading-snug text-slate-100">{property.title}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {[
                          property.reference ? `Ref ${property.reference}` : null,
                          property.location,
                          property.score === null ? null : `Score ${property.score}`,
                          property.dataQualityScore === null ? null : `Data ${property.dataQualityScore}`,
                        ].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <PropertyNavigationLinks
                      propertyId={property.propertyId}
                      publicUrl={property.publicUrl}
                      returnTo={leadIntelligenceMatchReturnUrl(returnTo, property.propertyId)}
                    />
                  </div>

                  {property.facts.length > 0 && (
                    <p className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm leading-relaxed text-slate-300">
                      {property.facts.join(" · ")}
                    </p>
                  )}

                  <div className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-3">
                    <PresentationPreviewList title="Hvorfor aktuell" items={property.reasons} emptyLabel="Ingen grunner lagret." />
                    <PresentationPreviewList
                      title="Risiko/avvik"
                      items={property.concerns}
                      emptyLabel="Ingen tydelige avvik."
                      tone="warning"
                    />
                    <PresentationPreviewList
                      title="Må verifiseres"
                      items={property.questionsToVerify}
                      emptyLabel="Ingen åpne verifikasjonsspørsmål."
                      tone="warning"
                    />
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {preview.verification.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-200">Må avklares før deling</p>
          <ul className="mt-2 space-y-1 text-xs text-amber-100">
            {preview.verification.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
