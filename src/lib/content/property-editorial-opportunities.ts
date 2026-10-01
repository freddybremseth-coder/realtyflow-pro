export type EditorialPropertyFact = {
  id: string;
  ref: string;
  town: string;
  location: string;
  price: number;
  bedrooms: number | null;
  bathrooms: number | null;
  areaM2: number | null;
  plotM2: number | null;
  propertyType: string;
  imageUrl: string | null;
};

export type PropertyEditorialOpportunity = {
  signature: string;
  opportunityType: "same_price_area_gap" | "cross_area_same_budget" | "property_type_tradeoff" | "budget_band_cluster";
  score: number;
  title: string;
  summary: string;
  editorialAngle: string;
  primaryKeyword: string;
  supportingKeywords: string[];
  audience: string;
  propertyRefs: string[];
  propertyIds: string[];
  imageUrl: string | null;
  evidence: Record<string, unknown>;
  draftMarkdown: string;
};

const NORTH_TOWNS = new Set([
  "albir","alfas del pi","alfaz del pi","altea","benidorm","calpe","calp","finestrat",
  "la nucia","la nucía","moraira","polop","villajoyosa","la villajoyosa","javea","jávea",
  "xabia","xàbia","denia","dénia","teulada",
]);

function clean(value: unknown) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function money(value: number) {
  return "€" + Math.round(value).toLocaleString("nb-NO");
}

function area(value: number | null) {
  return value && value > 0 ? `${Math.round(value)} m²` : "ikke oppgitt";
}

function pct(value: number) {
  return Math.round(value * 100);
}

function townOf(p: EditorialPropertyFact) {
  return p.town || p.location.split(",")[0]?.trim() || "Costa Blanca Nord";
}

const LOCALITY_ALIAS_GROUPS = [
  ["albir","alfas del pi","alfaz del pi"],
  ["javea","xabia"],
  ["calpe","calp"],
  ["la nucia","nucia"],
  ["villajoyosa","la villajoyosa","vila joiosa"],
];

function localityConsistent(p: EditorialPropertyFact) {
  const town = clean(p.town);
  const location = clean(p.location);
  if (!town || !location) return true;
  if (location.includes(town)) return true;
  return LOCALITY_ALIAS_GROUPS.some((group) =>
    group.some((value) => town.includes(clean(value))) &&
    group.some((value) => location.includes(clean(value))),
  );
}

function isNorth(p: EditorialPropertyFact) {
  const town = clean(townOf(p));
  const location = clean(p.location);
  return [...NORTH_TOWNS].some((candidate) => town.includes(clean(candidate)) || location.includes(clean(candidate)));
}

function valid(p: EditorialPropertyFact) {
  return Boolean(
    p.id && p.ref && p.price >= 150_000 && p.price <= 1_500_000 &&
    isNorth(p) && localityConsistent(p),
  );
}

function priceGap(a: EditorialPropertyFact, b: EditorialPropertyFact) {
  const mean = (a.price + b.price) / 2;
  return mean ? Math.abs(a.price - b.price) / mean : 1;
}

function areaGapRatio(a: EditorialPropertyFact, b: EditorialPropertyFact) {
  const aa = a.areaM2 || 0;
  const bb = b.areaM2 || 0;
  if (!aa || !bb) return 0;
  return Math.abs(aa - bb) / Math.max(aa, bb);
}

function sortedRefs(items: EditorialPropertyFact[]) {
  return items.map((item) => item.ref).sort();
}

function markdownTable(items: EditorialPropertyFact[]) {
  const header = "| Ref. | Område | Pris | Type | Sov./bad | Boligareal | Tomt | Ca. €/m² |";
  const divider = "|---|---|---:|---|---|---:|---:|---:|";
  const rows = items.map((p) => {
    const perM2 = p.areaM2 ? Math.round(p.price / p.areaM2) : null;
    return `| [${p.ref}](https://www.zenecohomes.com/eiendommer/${encodeURIComponent(p.ref)}) | ${townOf(p)} | ${money(p.price)} | ${p.propertyType || "Bolig"} | ${p.bedrooms ?? "—"} / ${p.bathrooms ?? "—"} | ${area(p.areaM2)} | ${area(p.plotM2)} | ${perM2 ? money(perM2) : "—"} |`;
  });
  return [header, divider, ...rows].join("\n");
}

function sharedDraft(params: {
  title: string;
  summary: string;
  angle: string;
  items: EditorialPropertyFact[];
  conclusion: string;
}) {
  const date = new Intl.DateTimeFormat("nb-NO").format(new Date());
  return [
    `# ${params.title}`,
    "",
    `> **Markedsøyeblikksbilde · ${date}.** Pris, tilgjengelighet, konkret enhet og leveranse må bekreftes før visning eller reservasjon.`,
    "",
    params.summary,
    "",
    "## Boligene side ved side",
    "",
    markdownTable(params.items),
    "",
    "## Hva er det interessante her?",
    "",
    params.angle,
    "",
    "Det er ikke et argument for å velge den billigste boligen eller den med flest kvadratmeter. Det er et signal om hva som må undersøkes før vi bruker tid på visning.",
    "",
    "## Dette ville vi kontrollert før vi konkluderer",
    "",
    "- Eksakt mikrobeliggenhet, orientering, sol og utsikt.",
    "- Hva oppgitt boligareal faktisk består av, og om arealene er sammenlignbare.",
    "- Terrasse, tomt, parkering, basseng og andre kvaliteter som ikke fanges av pris per m².",
    "- Hva som følger med i leveransen og eventuelle tilvalg.",
    "- Oppdatert pris, tilgjengelighet og betalingsplan.",
    "",
    "## Hva betyr dette for kjøperen?",
    "",
    params.conclusion,
    "",
    "Zen Eco Homes bruker slike sammenligninger for å snevre inn markedet før visning. Målet er ikke flest mulig boliger på en liste, men færre og bedre begrunnede alternativer.",
  ].join("\n");
}

function opportunityFromPair(
  type: PropertyEditorialOpportunity["opportunityType"],
  a: EditorialPropertyFact,
  b: EditorialPropertyFact,
): PropertyEditorialOpportunity | null {
  const gap = priceGap(a, b);
  const areaGap = areaGapRatio(a, b);
  const sameTown = clean(townOf(a)) === clean(townOf(b));
  const differentType = clean(a.propertyType) !== clean(b.propertyType);
  const refs = sortedRefs([a, b]);

  if (type === "same_price_area_gap") {
    if (gap > 0.03 || areaGap < 0.22 || !a.areaM2 || !b.areaM2) return null;
    const bigger = a.areaM2 >= b.areaM2 ? a : b;
    const smaller = bigger.id === a.id ? b : a;
    const deltaArea = Math.abs((a.areaM2 || 0) - (b.areaM2 || 0));
    const score = Math.min(99, Math.round(68 + areaGap * 35 + (sameTown ? 8 : 0) + (gap < 0.01 ? 5 : 0)));
    const title = sameTown
      ? `${townOf(a)}: nesten samme pris – ${Math.round(bigger.areaM2 || 0)} mot ${Math.round(smaller.areaM2 || 0)} m²`
      : `Nesten samme pris: ${townOf(a)} mot ${townOf(b)} – ${deltaArea} m² forskjell`;
    const summary = `${a.ref} til ${money(a.price)} og ${b.ref} til ${money(b.price)} ligger bare ${money(Math.abs(a.price-b.price))} fra hverandre, men publisert boligflate skiller ${deltaArea} m².`;
    const angle = `Prisgapet er bare ${pct(gap)} %, mens forskjellen i oppgitt boligflate er ${pct(areaGap)} %. Det gjør dette til en sterk kjøperartikkel: vi kan vise hvorfor arealdefinisjon, mikrobeliggenhet og leveranse må kontrolleres før €/m² brukes som fasit.`;
    return {
      signature: `${type}:${refs.join(":")}`,
      opportunityType: type,
      score,
      title,
      summary,
      editorialAngle: angle,
      primaryKeyword: `bolig ${townOf(a)} pris`,
      supportingKeywords: ["Costa Blanca Nord", "boligbudsjett Spania", "pris per kvadratmeter", ...refs],
      audience: "Norske boligkjøpere som sammenligner konkrete boliger på Costa Blanca Nord.",
      propertyRefs: refs,
      propertyIds: [a.id,b.id].sort(),
      imageUrl: bigger.imageUrl || smaller.imageUrl,
      evidence: { price_gap_pct: gap, area_gap_pct: areaGap, same_town: sameTown, properties: [a,b] },
      draftMarkdown: sharedDraft({
        title, summary, angle, items: [a,b].sort((x,y)=>x.price-y.price),
        conclusion: "Når prisene er nesten like, bør beslutningen flyttes fra budsjett til kvalitetene som faktisk skiller boligene. Normaliser dataene først, og prioriter deretter én eller begge til visning.",
      }),
    };
  }

  if (type === "property_type_tradeoff") {
    if (gap > 0.035 || !differentType) return null;
    const score = Math.min(96, Math.round(66 + (1-gap)*10 + (sameTown ? 10 : 0) + Math.min(areaGap,0.5)*18));
    const title = sameTown
      ? `${townOf(a)}: ${a.propertyType || "bolig"} eller ${b.propertyType || "bolig"} til nesten samme pris?`
      : `${townOf(a)} eller ${townOf(b)} – ulik boligtype til nesten samme budsjett`;
    const summary = `${a.ref} og ${b.ref} koster nesten det samme, men representerer to forskjellige boligtyper. Det gir en direkte sammenligning av hva kjøperen faktisk prioriterer.`;
    const angle = `Prisforskjellen er bare ${pct(gap)} %. I stedet for å spørre hvilken bolig som er “best”, kan artikkelen vise hva kjøperen bytter mellom: boligtype, areal, uteplass, drift og beliggenhet.`;
    return {
      signature: `${type}:${refs.join(":")}`,
      opportunityType: type,
      score,
      title,
      summary,
      editorialAngle: angle,
      primaryKeyword: `${a.propertyType || "bolig"} eller ${b.propertyType || "bolig"} Costa Blanca`,
      supportingKeywords: [townOf(a), townOf(b), "Costa Blanca Nord", "boligvalg Spania", ...refs],
      audience: "Norske kjøpere som står mellom ulike boligtyper innen samme budsjett.",
      propertyRefs: refs,
      propertyIds: [a.id,b.id].sort(),
      imageUrl: a.imageUrl || b.imageUrl,
      evidence: { price_gap_pct: gap, area_gap_pct: areaGap, same_town: sameTown, properties: [a,b] },
      draftMarkdown: sharedDraft({
        title, summary, angle, items: [a,b].sort((x,y)=>x.price-y.price),
        conclusion: "Når kjøpesummen er omtrent lik, er boligtypen ofte den egentlige beslutningen. Sammenlign hverdagen, driften og beliggenheten før du lar noen få kvadratmeter avgjøre.",
      }),
    };
  }

  if (type === "cross_area_same_budget") {
    if (gap > 0.04 || sameTown) return null;
    const score = Math.min(94, Math.round(64 + (1-gap)*8 + Math.min(areaGap,0.6)*18 + (differentType ? 6 : 0)));
    const title = `Samme budsjett: ${townOf(a)} eller ${townOf(b)} – hva kjøper du egentlig?`;
    const summary = `${a.ref} i ${townOf(a)} og ${b.ref} i ${townOf(b)} ligger innenfor ${pct(gap)} % i pris, men gir forskjellige områder, arealer og eventuelt boligtyper.`;
    const angle = "Dette er en ren beslutningsartikkel: samme pengebeløp kjøper to forskjellige hverdager. Den bør forklare hva kjøperen får og hva som ofres i hvert område.";
    return {
      signature: `${type}:${refs.join(":")}`,
      opportunityType: type,
      score,
      title,
      summary,
      editorialAngle: angle,
      primaryKeyword: `${townOf(a)} eller ${townOf(b)} bolig`,
      supportingKeywords: ["Costa Blanca Nord", "boligbudsjett Spania", townOf(a), townOf(b), ...refs],
      audience: "Norske kjøpere som ikke har låst område, men har et tydelig budsjett.",
      propertyRefs: refs,
      propertyIds: [a.id,b.id].sort(),
      imageUrl: a.imageUrl || b.imageUrl,
      evidence: { price_gap_pct: gap, area_gap_pct: areaGap, properties: [a,b] },
      draftMarkdown: sharedDraft({
        title, summary, angle, items: [a,b].sort((x,y)=>x.price-y.price),
        conclusion: "Samme budsjett bør ikke gi en tilfeldig liste på tvers av Costa Blanca. Bruk sammenligningen til å velge hvilken hverdag og hvilke kompromisser som passer før dere går videre til visning.",
      }),
    };
  }

  return null;
}


export type PropertyEditorialOpportunityDisplay = {
  id: string;
  opportunityType: string;
  score: number;
  title: string;
  propertyRefs: string[];
  evidence?: Record<string, unknown> | null;
};

function displayOpportunityTowns(item: PropertyEditorialOpportunityDisplay) {
  const rows = Array.isArray(item.evidence?.properties) ? item.evidence?.properties : [];
  return Array.from(new Set(
    rows
      .map((row) => {
        if (!row || typeof row !== "object" || Array.isArray(row)) return "";
        const value = (row as Record<string, unknown>).town || (row as Record<string, unknown>).location;
        return clean(value);
      })
      .filter(Boolean),
  ));
}

export function selectDiversePropertyEditorialOpportunities<T extends PropertyEditorialOpportunityDisplay>(
  input: T[],
  limit = 8,
): T[] {
  const wanted = Math.max(1, limit);
  const sorted = [...input].sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  const selected: T[] = [];
  const selectedIds = new Set<string>();
  const pairKeys = new Set<string>();
  const refUse = new Map<string, number>();
  const townUse = new Map<string, number>();

  const trySelect = (item: T, params: { maxRefUse: number; maxTownUse: number }) => {
    if (selectedIds.has(item.id)) return false;
    const refs = Array.from(new Set((item.propertyRefs || []).filter(Boolean))).sort();
    const pairKey = refs.join(":");
    if (!pairKey || pairKeys.has(pairKey)) return false;
    if (refs.some(ref => (refUse.get(ref) || 0) >= params.maxRefUse)) return false;

    const towns = displayOpportunityTowns(item);
    if (towns.some(town => (townUse.get(town) || 0) >= params.maxTownUse)) return false;

    selected.push(item);
    selectedIds.add(item.id);
    pairKeys.add(pairKey);
    for (const ref of refs) refUse.set(ref, (refUse.get(ref) || 0) + 1);
    for (const town of towns) townUse.set(town, (townUse.get(town) || 0) + 1);
    return true;
  };

  // First pass: maximum editorial breadth. One property should only anchor one visible card.
  for (const item of sorted) {
    if (selected.length >= wanted) break;
    trySelect(item, { maxRefUse: 1, maxTownUse: 2 });
  }

  // Second pass: fill remaining slots without letting one property or area dominate.
  for (const item of sorted) {
    if (selected.length >= wanted) break;
    trySelect(item, { maxRefUse: 2, maxTownUse: 3 });
  }

  return selected.slice(0, wanted);
}

function budgetBandClusterOpportunity(items: EditorialPropertyFact[]): PropertyEditorialOpportunity | null {
  if (items.length !== 3 || items.some((item) => !valid(item))) return null;
  const sorted = [...items].sort((a, b) => a.price - b.price);
  const meanPrice = sorted.reduce((sum, item) => sum + item.price, 0) / sorted.length;
  const spread = meanPrice ? (sorted[2].price - sorted[0].price) / meanPrice : 1;
  if (spread > 0.04) return null;

  const towns = Array.from(new Set(sorted.map((item) => townOf(item))));
  const types = Array.from(new Set(sorted.map((item) => clean(item.propertyType)).filter(Boolean)));
  const areas = sorted.map((item) => item.areaM2 || 0).filter(Boolean);
  const areaSpread = areas.length >= 2 ? (Math.max(...areas) - Math.min(...areas)) / Math.max(...areas) : 0;
  const meaningfulDifference = towns.length >= 2 || types.length >= 2 || areaSpread >= 0.22;
  if (!meaningfulDifference) return null;

  const refs = sortedRefs(sorted);
  const roundedBand = Math.max(50_000, Math.round(meanPrice / 25_000) * 25_000);
  const budgetLabel = money(roundedBand);
  const score = Math.min(98, Math.round(
    74 + (0.04 - spread) * 120 + Math.min(areaSpread, 0.7) * 15 + Math.min(3, towns.length) * 2 + Math.min(3, types.length) * 2
  ));

  const townList = towns.slice(0, 3).join(", ").replace(/, ([^,]*)$/, " eller $1");
  const title = towns.length >= 3
    ? `Rundt ${budgetLabel}: ${townList} – hva får du?`
    : towns.length === 1
      ? `${towns[0]} rundt ${budgetLabel}: tre boliger – tre forskjellige regnestykker`
      : `Rundt ${budgetLabel}: ${towns.join(" eller ")} – tre ulike kjøp`;

  const differenceParts = [
    towns.length >= 2 ? "område" : "",
    types.length >= 2 ? "boligtype" : "",
    "areal og øvrige kvaliteter",
  ].filter(Boolean).join(", ");
  const summary = `${refs.join(", ")} ligger i et prisbånd på bare ${pct(spread)} %, men skiller seg i ${differenceParts}.`;
  const angle = `Dette er et sterkt budsjett-case fordi tre konkrete boliger ligger tett i pris, samtidig som kjøperen får reelle alternativer å velge mellom. Prisintervallet er ${money(sorted[0].price)}–${money(sorted[2].price)}.`;
  const primaryTown = towns[0] || "Costa Blanca Nord";

  return {
    signature: `budget_band_cluster:${refs.join(":")}`,
    opportunityType: "budget_band_cluster",
    score,
    title,
    summary,
    editorialAngle: angle,
    primaryKeyword: `bolig ${budgetLabel} ${primaryTown}`,
    supportingKeywords: ["Costa Blanca Nord", "boligbudsjett Spania", "hva får du for pengene", ...towns, ...refs],
    audience: "Norske boligkjøpere som har et tydelig budsjett og vil forstå hvilke kompromisser det faktisk kjøper.",
    propertyRefs: refs,
    propertyIds: sorted.map((item) => item.id).sort(),
    imageUrl: sorted.find((item) => item.imageUrl)?.imageUrl || null,
    evidence: { price_band_pct: spread, area_spread_pct: areaSpread, towns, property_types: types, properties: sorted },
    draftMarkdown: sharedDraft({
      title, summary, angle, items: sorted,
      conclusion: "Når tre boliger ligger så tett i pris, bør du bruke dem til å avklare hva budsjettet skal kjøpe: mer plass, bedre beliggenhet, enklere drift eller en annen boligtype. Deretter snevres visningslisten inn.",
    }),
  };
}
export function detectPropertyEditorialOpportunities(
  input: EditorialPropertyFact[],
  limit = 24,
): PropertyEditorialOpportunity[] {
  const properties = input.filter(valid);
  const candidates: PropertyEditorialOpportunity[] = [];

  for (let i = 0; i < properties.length; i += 1) {
    for (let j = i + 1; j < properties.length; j += 1) {
      const a = properties[i];
      const b = properties[j];
      const gap = priceGap(a,b);
      if (gap > 0.05) continue;
      const sameTown = clean(townOf(a)) === clean(townOf(b));
      const sameBeds = a.bedrooms != null && a.bedrooms === b.bedrooms;

      if (sameTown && sameBeds) {
        const areaGap = opportunityFromPair("same_price_area_gap", a, b);
        if (areaGap) candidates.push(areaGap);
      }
      const tradeoff = opportunityFromPair("property_type_tradeoff", a, b);
      if (tradeoff) candidates.push(tradeoff);
      if (!sameTown) {
        const crossArea = opportunityFromPair("cross_area_same_budget", a, b);
        if (crossArea) candidates.push(crossArea);
      }
    }
  }

  const byPrice = [...properties].sort((a, b) => a.price - b.price || a.ref.localeCompare(b.ref));
  for (let i = 0; i + 2 < byPrice.length; i += 1) {
    const triple = [byPrice[i], byPrice[i + 1], byPrice[i + 2]];
    const cluster = budgetBandClusterOpportunity(triple);
    if (cluster) candidates.push(cluster);
  }
  const bestBySignature = new Map<string, PropertyEditorialOpportunity>();
  for (const candidate of candidates) {
    const current = bestBySignature.get(candidate.signature);
    if (!current || candidate.score > current.score) bestBySignature.set(candidate.signature, candidate);
  }

  const pairKeyCount = new Map<string, number>();
  const townUse = new Map<string, number>();
  return [...bestBySignature.values()]
    .sort((a,b)=>b.score-a.score || a.title.localeCompare(b.title))
    .filter((candidate) => {
      const pairKey = candidate.propertyRefs.join(":");
      const used = pairKeyCount.get(pairKey) || 0;
      if (used >= 1) return false;

      const evidenceProperties = Array.isArray(candidate.evidence.properties)
        ? candidate.evidence.properties
        : [];
      const towns = Array.from(new Set(
        evidenceProperties
          .map((row) => row && typeof row === "object" ? clean(townOf(row as EditorialPropertyFact)) : "")
          .filter(Boolean),
      ));
      if (towns.some((town) => (townUse.get(town) || 0) >= 3)) return false;

      pairKeyCount.set(pairKey, used + 1);
      for (const town of towns) townUse.set(town, (townUse.get(town) || 0) + 1);
      return true;
    })
    .slice(0, Math.max(1, limit));
}
