"use client";

import React, { useMemo, useState } from "react";
import type { SEOControlReport } from "@/services/agents/seo-control-report";
import { planVisibilityReviewItems } from "@/services/agents/visibility-review-items";

const names: Record<string, string> = {
  zeneco: "Zen Eco Homes", pinosoecolife: "PinosoEcolife",
  freddyb: "Freddy Bremseth", freddypublishing: "Books",
  freddyart: "Art", remasterfreddy: "Remaster",
  donaanna: "Doña Anna", chatgenius: "ChatGenius", zenecocare: "Care",
};
const statusText: Record<string, string> = {
  UNKNOWN: "Ufullstendige data", ACTION_REQUIRED: "Teknisk funn",
  REVIEW_RECOMMENDED: "Bør vurderes", OBSERVED_NO_BLOCKERS: "Ingen klassifiserte blokkeringer i utvalget",
};
export function VisibilityOverview({ report }: { report: SEOControlReport | null | undefined }) {
  const [brand, setBrand] = useState("all");
  const sites = report?.sites ?? [];
  const filtered = useMemo(() => brand === "all" ? sites : sites.filter(site => site.brandId === brand), [sites, brand]);
  const proposals = useMemo(() => planVisibilityReviewItems(report), [report]);
  const visibleProposals = useMemo(() => brand === "all" ? proposals : proposals.filter(item => item.brandId === brand), [proposals, brand]);
  return <section aria-label="Visibility – teknisk oversikt" className="mt-6 rounded-xl border border-slate-300 bg-white p-4 text-slate-950">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="text-lg font-bold">Nexus Visibility · Teknisk oversikt</h3>
        <p className="mt-1 text-sm text-slate-700">Observasjoner fra en begrenset, skrivebeskyttet nettstedskontroll. Ikke en fullstendig SEO-audit eller publiseringsgodkjenning.</p>
      </div>
      <label className="flex items-center gap-2 text-sm">
        Merkevare
        <select aria-label="Velg merkevare for Visibility" value={brand} onChange={event => setBrand(event.target.value)}
          className="rounded-md border border-slate-400 bg-white px-3 py-2 text-slate-950">
          <option value="all">Alle merkevarer</option>
          {sites.map(site => <option key={site.brandId} value={site.brandId}>{names[site.brandId] ?? site.brandId}</option>)}
        </select>
      </label>
    </header>
    {!report && <p role="status" className="mt-4 text-sm text-amber-800">Ingen kontrollrapport tilgjengelig. Status er ukjent.</p>}
    {report && sites.length === 0 && <p role="status" className="mt-4 text-sm">Ingen nettsteder er kontrollert.</p>}
    {report && sites.length > 0 && <div className="mt-4 grid gap-3 md:grid-cols-2">
      {filtered.map(site => {
        const audit = site.visibilityDiagnostic;
        return <article key={site.brandId} className="rounded-lg border border-slate-200 p-4">
          <div className="flex flex-wrap justify-between gap-2">
            <h4 className="font-semibold">{names[site.brandId] ?? site.brandId}</h4>
            <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold">{audit ? (statusText[audit.diagnosticStatus] ?? "Ukjent") : "Krever ny kontroll"}</span>
          </div>
          <p className="mt-2 text-xs text-slate-600">{site.pagesChecked} {site.pagesChecked === 1 ? "observert side" : "observerte sider"} · {audit?.issues.length ?? "ukjent"} klassifiserte funn</p>
          {audit?.incomplete && <p className="mt-2 text-xs text-amber-800">Kontrollen er ufullstendig. Ikke konkluder om nettstedets totale tilstand.</p>}
          {audit && audit.issues.length > 0 && <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
            {audit?.issues.map((issue, index) => <li key={issue.code + index}><strong>{issue.code.replaceAll("_", " ")}</strong>: {issue.evidence}</li>)}
          </ul>}
          {!audit && <p role="status" className="mt-3 text-sm text-amber-800">Rapporten ble lagret før Visibility-kontrollen ble lagt til. Kjør en ny SEO-kontroll for denne merkevaren.</p>}
          {audit && !audit.incomplete && audit.issues.length === 0 && <p className="mt-3 text-sm text-slate-700">Ingen klassifiserte funn i det begrensede utvalget. Dette er ikke en fullstendig SEO-kontroll.</p>}
          {audit && audit.incomplete && audit.issues.length === 0 && <p className="mt-3 text-sm text-amber-800">Ingen funn registrert, men datagrunnlaget er ufullstendig og kan ikke friskmelde siden.</p>}
          <p className="mt-3 text-xs text-slate-500">Sist kontrollert: {site.checkedAt ? new Date(site.checkedAt).toLocaleString("nb-NO") : "Ukjent"}</p>
        </article>;
      })}
    </div>}
    {report && visibleProposals.length > 0 && <section aria-label="Visibility – foreslåtte undersøkelser" className="mt-6 border-t border-slate-200 pt-4">
      <h4 className="font-bold">Dette bør undersøkes · {visibleProposals.length}</h4>
      <p className="mt-1 text-sm text-slate-700">Prioriterte undersøkelser basert på begrensede observasjoner. Dette er ikke opprettede oppgaver, ferdigbekreftede feil eller forslag som kan publiseres direkte.</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {visibleProposals.map(item => <article key={item.key} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold">{names[item.brandId] ?? item.brandId}</span>
            <span className="rounded border border-slate-300 px-2 py-1">{item.priority === "HIGH" ? "Høy kontrollprioritet" : item.priority === "MEDIUM" ? "Bør undersøkes" : "Manglende datagrunnlag"}</span>
          </div>
          <h5 className="mt-2 font-semibold">{item.title}</h5>
          {item.affectedUrl && <p className="mt-1 break-all text-xs text-slate-700">Side: {item.affectedUrl}</p>}
          <p className="mt-2 text-sm"><strong>Observasjon:</strong> {item.evidence}</p>
          <p className="mt-2 text-sm"><strong>Neste kontroll:</strong> {item.nextStep}</p>
          <p className="mt-2 text-xs text-slate-600">Skrivebeskyttet · ingen publiseringsgodkjenning</p>
        </article>)}
      </div>
    </section>}
  </section>;
}
