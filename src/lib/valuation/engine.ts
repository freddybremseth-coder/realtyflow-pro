export type ComparableInput = {
  address?: string;
  location?: string;
  price?: number;
  area?: number;
  bedrooms?: number;
  bathrooms?: number;
  condition?: string;
  source?: string;
  url?: string;
  date?: string;
};

export type ValuationInput = {
  ref?: string;
  title?: string;
  type?: string;
  location?: string;
  bedrooms?: number;
  bathrooms?: number;
  area?: number;
  plotSize?: number;
  yearBuilt?: number;
  condition?: string;
  amenities?: string[];
  sellerName?: string;
  sellerEmail?: string;
  sellerPhone?: string;
  sellerNotes?: string;
  askingPrice?: number;
  marketData?: string;
  comparables?: ComparableInput[];
};

export type ValuationFactor = {
  label: string;
  impact: "positive" | "neutral" | "negative";
  detail: string;
  adjustmentPct?: number;
};

export type ValuationComparable = ComparableInput & {
  pricePerM2: number;
  adjustedPricePerM2: number;
  weight: number;
};

export type ValuationResult = {
  low: number;
  agent: number;
  high: number;
  pricePerM2: number;
  confidence: number;
  sourceScore: number;
  methodology: string[];
  factors: ValuationFactor[];
  comparable: ValuationComparable[];
  marketSignals: string[];
  pricingStrategy: string;
  sellerReport: string;
  emailSubject: string;
  emailHtml: string;
  dataSources: string[];
};

const LOCATION_BASELINES: Record<string, number> = {
  altea: 3350,
  albir: 3300,
  benidorm: 3150,
  finestrat: 3200,
  calpe: 3100,
  moraira: 3600,
  javea: 3450,
  xabia: 3450,
  denia: 2850,
  torrevieja: 2100,
  orihuela: 2300,
  "orihuela costa": 2450,
  villamartin: 2350,
  cartagena: 1850,
  "los alcazares": 2200,
  "san javier": 2100,
  murcia: 1700,
};

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function normalizeValuationInput(raw: Record<string, unknown>): ValuationInput {
  const amenities = Array.isArray(raw.amenities)
    ? raw.amenities.map(String)
    : Array.isArray(raw.selectedAmenities)
      ? raw.selectedAmenities.map(String)
      : [];

  const comparables = Array.isArray(raw.comparables)
    ? raw.comparables.map((item) => {
        const source = typeof item === "object" && item ? item as Record<string, unknown> : {};
        return {
          address: String(source.address || ""),
          location: String(source.location || ""),
          price: toNumber(source.price),
          area: toNumber(source.area),
          bedrooms: toNumber(source.bedrooms),
          bathrooms: toNumber(source.bathrooms),
          condition: String(source.condition || ""),
          source: String(source.source || ""),
          url: String(source.url || ""),
          date: String(source.date || ""),
        };
      })
    : [];

  return {
    ref: String(raw.ref || ""),
    title: String(raw.title || ""),
    type: String(raw.type || "Villa"),
    location: String(raw.location || ""),
    bedrooms: toNumber(raw.bedrooms),
    bathrooms: toNumber(raw.bathrooms),
    area: toNumber(raw.area),
    plotSize: toNumber(raw.plotSize || raw.plot_size),
    yearBuilt: toNumber(raw.yearBuilt || raw.year_built),
    condition: String(raw.condition || "God"),
    amenities,
    sellerName: String(raw.sellerName || ""),
    sellerEmail: String(raw.sellerEmail || ""),
    sellerPhone: String(raw.sellerPhone || ""),
    sellerNotes: String(raw.sellerNotes || ""),
    askingPrice: toNumber(raw.askingPrice),
    marketData: String(raw.marketData || ""),
    comparables,
  };
}

function formatEuro(value: number) {
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function getBaselinePricePerM2(input: ValuationInput) {
  const haystack = `${input.location || ""}`.toLowerCase();
  const match = Object.entries(LOCATION_BASELINES).find(([key]) => haystack.includes(key));
  let baseline = match?.[1] || 2600;

  const type = (input.type || "").toLowerCase();
  if (/villa|enebolig/.test(type)) baseline *= 1.12;
  if (/penthouse/.test(type)) baseline *= 1.15;
  if (/tomt/.test(type)) baseline *= 0.42;
  if (/rekkehus|bungalow/.test(type)) baseline *= 0.95;

  return Math.round(baseline);
}

function extractMarketSignals(marketData?: string) {
  if (!marketData?.trim()) return [];
  return marketData
    .split(/\n|\. /)
    .map((line) => line.trim())
    .filter((line) => line.length > 18)
    .slice(0, 8);
}

function extractMarketPricePerM2(marketData?: string) {
  if (!marketData) return undefined;
  const pattern = /(\d[\d\s.,]{2,})\s*(?:€|eur)?\s*\/?\s*m(?:2|²|sqm|kvm)/gi;
  const matches: RegExpExecArray[] = [];
  let match = pattern.exec(marketData);
  while (match) {
    matches.push(match);
    match = pattern.exec(marketData);
  }
  const values = matches
    .map((item) => toNumber(item[1]))
    .filter((value): value is number => Boolean(value && value > 500 && value < 15000));
  if (!values.length) return undefined;
  values.sort((a, b) => a - b);
  return Math.round(values[Math.floor(values.length / 2)]);
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function comparableWeight(comp: ComparableInput, input: ValuationInput) {
  let weight = 1;
  if (comp.location && input.location && comp.location.toLowerCase().includes(input.location.toLowerCase())) weight += 0.4;
  if (comp.area && input.area) {
    const diff = Math.abs(comp.area - input.area) / input.area;
    if (diff < 0.15) weight += 0.4;
    else if (diff > 0.35) weight -= 0.25;
  }
  if (comp.bedrooms && input.bedrooms && comp.bedrooms === input.bedrooms) weight += 0.15;
  if (comp.source && /casafari|idealista|notariado|registradores|tinsa/i.test(comp.source)) weight += 0.2;
  return Math.max(0.45, Math.min(1.8, weight));
}

function conditionAdjustment(condition?: string) {
  const normalized = (condition || "").toLowerCase();
  if (/ny|new|obra nueva|meget god/.test(normalized)) return 0.08;
  if (/god|buena/.test(normalized)) return 0.02;
  if (/middels|normal/.test(normalized)) return -0.03;
  if (/oppussing|renover|reform/.test(normalized)) return -0.13;
  return 0;
}

function amenityAdjustment(amenities: string[] = []) {
  const joined = amenities.join(" ").toLowerCase();
  let adjustment = 0;
  if (/havutsikt|sea|mar/.test(joined)) adjustment += 0.10;
  if (/basseng|pool/.test(joined)) adjustment += 0.05;
  if (/garasje|parking/.test(joined)) adjustment += 0.025;
  if (/heis|elevator/.test(joined)) adjustment += 0.02;
  if (/nær sjø|strand|beach/.test(joined)) adjustment += 0.04;
  if (/golf/.test(joined)) adjustment += 0.025;
  if (/hage|terrasse/.test(joined)) adjustment += 0.025;
  return Math.min(adjustment, 0.24);
}

export function calculateValuation(input: ValuationInput): ValuationResult {
  const area = Math.max(input.area || 0, 1);
  const baseline = getBaselinePricePerM2(input);
  const marketPricePerM2 = extractMarketPricePerM2(input.marketData);
  const marketSignals = extractMarketSignals(input.marketData);

  const comparable = (input.comparables || [])
    .filter((comp) => comp.price && comp.area && comp.price > 30000 && comp.area > 15)
    .map((comp) => {
      const rawPricePerM2 = Math.round((comp.price || 0) / (comp.area || 1));
      const weight = comparableWeight(comp, input);
      const adjustedPricePerM2 = Math.round(rawPricePerM2 * (1 + conditionAdjustment(input.condition) - conditionAdjustment(comp.condition)));
      return { ...comp, pricePerM2: rawPricePerM2, adjustedPricePerM2, weight };
    });

  const comparableMedian = median(comparable.map((comp) => comp.adjustedPricePerM2));
  const sourceParts = [
    { value: baseline, weight: 0.22 },
    ...(marketPricePerM2 ? [{ value: marketPricePerM2, weight: 0.28 }] : []),
    ...(comparableMedian ? [{ value: comparableMedian, weight: 0.5 }] : []),
  ];
  const weightedBase = Math.round(
    sourceParts.reduce((sum, part) => sum + part.value * part.weight, 0) /
    sourceParts.reduce((sum, part) => sum + part.weight, 0),
  );

  const adjustment = conditionAdjustment(input.condition) + amenityAdjustment(input.amenities);
  const pricePerM2 = Math.round(weightedBase * (1 + adjustment));
  const agent = Math.round((pricePerM2 * area) / 1000) * 1000;

  const sourceScore = Math.min(100, 38 + comparable.length * 11 + (marketPricePerM2 ? 18 : 0) + (marketSignals.length ? 8 : 0));
  const confidence = Math.min(96, Math.max(48, sourceScore - (input.location ? 0 : 10) - (input.area ? 0 : 12)));
  const spread = confidence > 84 ? 0.08 : confidence > 70 ? 0.11 : 0.16;
  const low = Math.round(agent * (1 - spread) / 1000) * 1000;
  const high = Math.round(agent * (1 + spread) / 1000) * 1000;

  const factors: ValuationFactor[] = [
    {
      label: "Datagrunnlag",
      impact: confidence >= 75 ? "positive" : "neutral",
      detail: `${comparable.length} sammenlignbare objekter, ${marketPricePerM2 ? "markedspris per m2 hentet fra innlimte data" : "standard lokal baseline brukt"}.`,
    },
    {
      label: "Beliggenhet",
      impact: baseline > 2900 ? "positive" : baseline < 2100 ? "negative" : "neutral",
      detail: `${input.location || "Ikke oppgitt"} er vurdert med lokal baseline ${baseline.toLocaleString("nb-NO")} €/m2.`,
    },
    {
      label: "Tilstand og standard",
      impact: conditionAdjustment(input.condition) > 0 ? "positive" : conditionAdjustment(input.condition) < 0 ? "negative" : "neutral",
      detail: `${input.condition || "Ikke oppgitt"} gir ${(conditionAdjustment(input.condition) * 100).toFixed(0)}% justering.`,
      adjustmentPct: Math.round(conditionAdjustment(input.condition) * 100),
    },
    {
      label: "Fasiliteter",
      impact: amenityAdjustment(input.amenities) > 0.06 ? "positive" : "neutral",
      detail: `${input.amenities?.length || 0} registrerte kvaliteter gir ${(amenityAdjustment(input.amenities) * 100).toFixed(0)}% samlet premium.`,
      adjustmentPct: Math.round(amenityAdjustment(input.amenities) * 100),
    },
  ];

  if (input.askingPrice) {
    const delta = (input.askingPrice - agent) / agent;
    factors.push({
      label: "Prisantydning mot estimat",
      impact: Math.abs(delta) < 0.05 ? "neutral" : delta > 0 ? "negative" : "positive",
      detail: `Oppgitt pris ligger ${(delta * 100).toFixed(1)}% ${delta > 0 ? "over" : "under"} anbefalt meglerverdi.`,
    });
  }

  const pricingStrategy = confidence >= 80
    ? `Anbefalt lanseringspris er ${formatEuro(agent)} med forhandlingsrom opp til ${formatEuro(high)} dersom responsen er sterk de første 14 dagene.`
    : `Anbefalt intervall er ${formatEuro(low)}-${formatEuro(high)}. Hent 2-3 ekstra sammenlignbare objekter eller CASAFARI/Idealista-data før endelig pris settes.`;

  const seller = input.sellerName || "selger";
  const sellerReport = [
    `Hei ${seller},`,
    "",
    `Basert på eiendommens beliggenhet, areal, standard og tilgjengelige markedsdata vurderer vi realistisk markedsverdi til ca. ${formatEuro(agent)}.`,
    `Vårt anbefalte prisintervall er ${formatEuro(low)} til ${formatEuro(high)}. Dette intervallet tar høyde for forskjeller i standard, utsikt, uteareal, etterspørsel og hvor raskt markedet responderer i området.`,
    "",
    pricingStrategy,
    "",
    "For å gjøre vurderingen mest mulig presis bruker vi en kombinasjon av lokale prisnivåer per m2, sammenlignbare annonser/salg, markedsrapporter og kvalitativ vurdering av eiendommens salgbarhet.",
    "",
    "Vurderingen er ikke en formell takst, men en profesjonell markedsvurdering for prissetting og salgsstrategi.",
  ].join("\n");

  const emailSubject = `Prisvurdering for ${input.title || input.location || "eiendommen"}`;
  const emailHtml = sellerReport
    .split("\n")
    .map((line) => line ? `<p>${line.replace(/</g, "&lt;")}</p>` : "<br>")
    .join("") +
    `<hr><p><strong>Anbefalt verdi:</strong> ${formatEuro(agent)}<br><strong>Intervall:</strong> ${formatEuro(low)} - ${formatEuro(high)}<br><strong>Sikkerhet:</strong> ${confidence}%</p>`;

  return {
    low,
    agent,
    high,
    pricePerM2,
    confidence,
    sourceScore,
    methodology: [
      "Lokal baseline per m2 for området",
      "Innlimte markedsdata fra kilder som Idealista, CASAFARI, Tinsa, Notariado eller egne rapporter",
      "Sammenlignbare eiendommer vektet etter likhet i beliggenhet, areal, type og datakilde",
      "Kvalitativ justering for standard, utsikt, basseng, parkering, uteareal og nærhet til sjø/golf",
    ],
    factors,
    comparable,
    marketSignals,
    pricingStrategy,
    sellerReport,
    emailSubject,
    emailHtml,
    dataSources: [
      "RealtyFlow scanner/CRM",
      ...(marketPricePerM2 || marketSignals.length ? ["Innlimte markedsdata"] : []),
      ...(comparable.length ? ["Sammenlignbare objekter"] : []),
      "Lokal RealtyFlow baseline",
    ],
  };
}
