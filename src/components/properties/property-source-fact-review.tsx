"use client";

import { useMemo } from "react";

type Fact = { label: string; value: string; evidence: string };
export function extractPropertySourceFacts(source: string): Fact[] {
  const text = source.replace(/\s+/g, " ").trim();
  if (!text || text.length > 50000) return [];
  const rules: { label: string; re: RegExp; unit?: string }[] = [
    { label: "Antall enheter", re: /(?:totalt|består av|omfatter|med)\s+(\d{1,4})\s+(?:boliger|leiligheter|enheter)/i, unit: " enheter" },
    { label: "Antall enheter", re: /(\d{1,4})\s+(?:boliger|leiligheter|enheter)\s+(?:i prosjektet|totalt)/i, unit: " enheter" },
    { label: "Ferdigstillelse omtalt", re: /(?:forventet|planlagt|estimert)\s+(?:ferdigstillelse|overlevering|innflytting)\s*(?:er|:|i)?\s*((?:[1-4]\.\s*kvartal\s*)?20\d{2}|(?:vår|sommer|høst|vinter)\s*20\d{2})/i },
    { label: "Avstand til strand", re: /(\d{2,5})\s*(?:m|meter)\s+(?:fra|til)\s+(?:stranden|strand|sjøen|havet)/i, unit: " m" },
  ];
  const facts: Fact[] = [];
  for (const rule of rules) {
    const match = text.match(rule.re);
    if (!match || facts.some(f => f.label === rule.label)) continue;
    const start = Math.max(0, (match.index || 0) - 65);
    const end = Math.min(text.length, (match.index || 0) + match[0].length + 65);
    facts.push({ label: rule.label, value: match[1] + (rule.unit || ""), evidence: text.slice(start, end) });
  }
  return facts;
}

export function PropertySourceFactReview({ source, onUse }: { source: string; onUse: (text: string) => void }) {
  const facts = useMemo(() => extractPropertySourceFacts(source), [source]);
  return <section className="space-y-3 rounded-lg border border-amber-700/40 bg-slate-900/70 p-3">
    <h3 className="font-semibold text-white">Forslag fra kildebeskrivelsen</h3>
    <p className="text-xs text-slate-400">Enkle teksttreff, ikke AI-verifiserte fakta. Les kildeutdraget og kontroller mot utbygger før informasjon brukes. Ingenting lagres automatisk.</p>
    {facts.length === 0 && <p className="text-sm text-slate-400">Ingen sikre tekstmønstre funnet. Les originalbeskrivelsen manuelt.</p>}
    {facts.map(fact => <div className="rounded border border-slate-700 p-3" key={fact.label}>
      <p className="text-sm font-semibold text-white">{fact.label}: {fact.value}</p>
      <p className="mt-1 text-xs text-slate-400">Kilde: «{fact.evidence}»</p>
      <button type="button" className="mt-2 min-h-10 rounded border border-cyan-600 px-3 text-sm text-cyan-200" onClick={() => onUse(`${fact.label}: ${fact.value}`)}>Bruk som notat i redigeringen</button>
    </div>)}
  </section>;
}
