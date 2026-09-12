import { buildLeadCustomerPresentationPreview, type LeadCustomerPresentationPreviewProperty } from "@/services/lead-intelligence/presentation-preview";

export interface PropertyRecommendationTemplateInput {
  brandId: string;
  customerName?: string | null;
  presentationJson: unknown;
}

export interface PropertyRecommendationTemplate {
  subject: string;
  bodyText: string;
  bodyHtml: string;
  propertyCount: number;
  areas: string[];
}

interface AreaProfile {
  label: string;
  summary: string;
  highlights: string[];
}

const AREA_PROFILES: Array<{ keys: string[]; profile: AreaProfile }> = [
  { keys: ["albir", "l'alfas del pi", "alfaz del pi", "alfàs del pi"], profile: { label: "Albir", summary: "Et rolig kystområde mellom Benidorm og Altea, kjent for strandpromenade, hverdagsservice og et internasjonalt bomiljø.", highlights: ["rolig kystmiljø", "strand og promenade", "godt med butikker, servering og daglige tjenester"] } },
  { keys: ["altea hills"], profile: { label: "Altea Hills", summary: "Et høytliggende boligområde ved Altea med fokus på utsikt, privatliv og moderne boliger.", highlights: ["høytliggende beliggenhet", "utsikt er vanlig i området", "kort vei til Altea og kysten"] } },
  { keys: ["altea"], profile: { label: "Altea", summary: "En kystby med historisk gamleby, marina, restauranter og et mer avslappet bymiljø enn de største turiststedene.", highlights: ["gamleby og kulturmiljø", "marina og kystliv", "helårsservice"] } },
  { keys: ["benidorm"], profile: { label: "Benidorm", summary: "En større kystby med omfattende helårsservice, strender, restauranter og et bredt aktivitetstilbud.", highlights: ["store sandstrender", "svært godt servicetilbud", "aktivt byliv hele året"] } },
  { keys: ["villajoyosa", "vila joiosa", "la vila joiosa"], profile: { label: "Villajoyosa", summary: "En tradisjonell kystby sør for Benidorm med fargerik gamleby, strand og et mer lokalt preg.", highlights: ["strand nær sentrum", "tradisjonelt bymiljø", "helårsservice og lokalt preg"] } },
  { keys: ["finestrat", "sierra cortina", "balcon de finestrat", "balcón de finestrat"], profile: { label: "Finestrat", summary: "Et område som kombinerer innlandsby, åssider og nyere boligområder nær kysten og Benidorm.", highlights: ["nyere boligområder", "nær kyst og handel", "mulighet for utsikt og roligere omgivelser"] } },
  { keys: ["la nucia", "la nucía"], profile: { label: "La Nucía", summary: "Et populært boligområde litt inn fra kysten, med villaområder, helårsservice og kort vei til Altea, Albir og Benidorm.", highlights: ["villa- og boligområder", "helårsservice", "kort vei til flere kystbyer"] } },
  { keys: ["polop"], profile: { label: "Polop", summary: "En mindre innlandsby ved fjellene bak Costa Blanca, med roligere omgivelser og enkel tilgang til kystområdene.", highlights: ["roligere omgivelser", "fjell- og landskapspreg", "kort kjøreavstand til kysten"] } },
  { keys: ["moraira", "teulada"], profile: { label: "Moraira", summary: "Et mindre kystsamfunn med marina, bukter, restauranter og et etablert internasjonalt boligmarked.", highlights: ["marina og kystliv", "mindre skala enn de store byene", "populært villaområde"] } },
  { keys: ["calpe", "calp"], profile: { label: "Calpe", summary: "En kystby med strender, marina, helårsservice og en blanding av leiligheter, villaer og nyere prosjekter.", highlights: ["strender og marina", "god helårsservice", "bredt boligtilbud"] } },
  { keys: ["javea", "jávea", "xabia", "xàbia"], profile: { label: "Jávea / Xàbia", summary: "Et etablert kystområde med gamleby, havn, strandsoner og mange villaområder i åsene rundt byen.", highlights: ["flere ulike delområder", "havn og strender", "stort villa- og helårsmarked"] } },
  { keys: ["denia", "dénia"], profile: { label: "Dénia", summary: "En levende kystby med havn, gamleby, lange strandsoner og et bredt tilbud av butikker og restauranter.", highlights: ["havn og fergeforbindelser", "lange strandsoner", "stort helårs servicetilbud"] } },
  { keys: ["pinoso", "el pinos"], profile: { label: "Pinoso", summary: "Et innlandsområde vest i Alicante-provinsen med landlige eiendommer, større tomter og et roligere lokalmiljø.", highlights: ["landlig livsstil", "større tomter er vanlig", "lokal byservice og natur rundt"] } },
  { keys: ["aspe"], profile: { label: "Aspe", summary: "En tradisjonell innlandsby nær Alicante-området, omgitt av landbruk og landlige boligområder.", highlights: ["lokalt bymiljø", "landlige eiendommer rundt byen", "praktisk avstand til større byområder"] } },
  { keys: ["novelda"], profile: { label: "Novelda", summary: "En innlandsby i Alicante-provinsen med lokal handel, landbruk og boligområder både i og utenfor sentrum.", highlights: ["helårs lokalsamfunn", "landlig omland", "godt egnet for dem som vil bo utenfor kystsonen"] } },
  { keys: ["biar"], profile: { label: "Biar", summary: "En historisk innlandsby omgitt av fjell og jordbruksland, med et tydelig lokalt preg og roligere tempo.", highlights: ["historisk landsby", "natur og landlige omgivelser", "rolig helårsmiljø"] } },
  { keys: ["villena"], profile: { label: "Villena", summary: "En større innlandsby nordvest i Alicante-provinsen med helårsservice, handel og transportforbindelser til regionen rundt.", highlights: ["godt lokalt servicetilbud", "innlandsbeliggenhet", "større bymiljø enn de små landsbyene rundt"] } },
  { keys: ["sax"], profile: { label: "Sax", summary: "En mindre innlandsby med historisk sentrum, fjellandskap og landlige områder rundt byen.", highlights: ["rolig lokalmiljø", "fjell- og landskapspreg", "landlige boliger i nærområdet"] } },
];

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function firstName(value: string | null | undefined) {
  return String(value || "").trim().split(/\s+/)[0] || "";
}

function normalize(value: string | null | undefined) {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function areaProfileForLocation(location: string | null | undefined): AreaProfile | null {
  const normalized = normalize(location);
  if (!normalized) return null;
  return AREA_PROFILES.find(({ keys }) => keys.some((key) => normalized.includes(normalize(key))))?.profile || null;
}

function brandName(brandId: string) {
  const brand = normalize(brandId);
  if (brand.includes("soleada")) return "Soleada";
  if (brand.includes("pinoso")) return "Pinoso EcoLife";
  return "ZenEco Homes";
}

function brandWebsite(brandId: string) {
  const brand = normalize(brandId);
  if (brand.includes("soleada")) return "soleada.no";
  if (brand.includes("pinoso")) return "pinosoecolife.com";
  return "zenecohomes.com";
}

function propertySummary(property: LeadCustomerPresentationPreviewProperty) {
  const facts = property.facts.filter(Boolean).slice(0, 6);
  return facts.length ? facts.join(" · ") : property.location || "Se boligdetaljer i lenken";
}

function whyItMatches(property: LeadCustomerPresentationPreviewProperty) {
  return property.reasons.filter(Boolean).slice(0, 3);
}

function uniqueAreas(properties: LeadCustomerPresentationPreviewProperty[]) {
  return Array.from(new Set(properties.map((property) => property.location?.trim()).filter((value): value is string => Boolean(value))));
}

export function buildPropertyRecommendationTemplate(input: PropertyRecommendationTemplateInput): PropertyRecommendationTemplate {
  const preview = buildLeadCustomerPresentationPreview(input.presentationJson);
  const properties = preview.properties.filter((property) => Boolean(property.publicUrl));
  const areas = uniqueAreas(properties);
  const greeting = firstName(input.customerName) ? `Hei ${firstName(input.customerName)},` : "Hei,";
  const subjectArea = areas.length === 1 ? ` i ${areas[0]}` : areas.length > 1 ? ` i ${areas.slice(0, 2).join(" og ")}` : "";
  const subject = `${properties.length} bolig${properties.length === 1 ? "" : "er"} som matcher søket ditt${subjectArea}`;

  const intro = properties.length === 1
    ? "Jeg har funnet en bolig som ser ut til å passe godt med kriteriene dine."
    : `Jeg har funnet ${properties.length} boliger som ser ut til å passe godt med kriteriene dine.`;

  const textBlocks = properties.map((property, index) => {
    const area = areaProfileForLocation(property.location);
    const reasons = whyItMatches(property);
    return [
      `${index + 1}. ${property.title}`,
      propertySummary(property),
      reasons.length ? `Hvorfor den matcher: ${reasons.join(" ")}` : null,
      area ? `Om ${area.label}: ${area.summary}` : property.location ? `Om området: Boligen ligger i ${property.location}.` : null,
      area ? `Områdeprofil: ${area.highlights.join(" · ")}` : null,
      property.publicUrl ? `Se bilder, pris og boligdetaljer: ${property.publicUrl}` : null,
    ].filter(Boolean).join("\n");
  });

  const bodyText = [
    greeting,
    "",
    intro,
    "Jeg har prioritert forslagene ut fra opplysningene og ønskene vi har registrert, slik at du slipper å gå gjennom boliger som åpenbart ikke passer.",
    "",
    ...textBlocks.flatMap((block) => [block, ""]),
    "Pris og tilgjengelighet kan endres, så jeg kontrollerer dette på nytt dersom en av boligene er interessant.",
    "",
    "Svar gjerne med nummeret på boligen eller boligene du liker best. Da kan jeg undersøke dem nærmere, sende mer informasjon eller planlegge neste steg.",
    "",
    "Vennlig hilsen",
    "Freddy",
    `${brandName(input.brandId)} · ${brandWebsite(input.brandId)}`,
  ].join("\n");

  const propertyCards = properties.map((property, index) => {
    const area = areaProfileForLocation(property.location);
    const reasons = whyItMatches(property);
    const image = property.imageUrl
      ? `<a href="${escapeHtml(property.publicUrl || "#")}" style="text-decoration:none"><img src="${escapeHtml(property.imageUrl)}" alt="${escapeHtml(property.title)}" style="display:block;width:100%;max-width:680px;height:auto;border-radius:12px 12px 0 0"></a>`
      : "";
    const facts = propertySummary(property);
    const reasonHtml = reasons.length
      ? `<div style="margin-top:14px;padding:12px 14px;background:#f3f7f5;border-radius:8px"><strong>Hvorfor den matcher</strong><br>${escapeHtml(reasons.join(" "))}</div>`
      : "";
    const areaHtml = area
      ? `<div style="margin-top:14px"><strong>Om ${escapeHtml(area.label)}</strong><br>${escapeHtml(area.summary)}<br><span style="color:#666">${escapeHtml(area.highlights.join(" · "))}</span></div>`
      : property.location
        ? `<div style="margin-top:14px"><strong>Om området</strong><br>Boligen ligger i ${escapeHtml(property.location)}.</div>`
        : "";
    return `<div style="margin:0 0 24px 0;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;background:#fff">${image}<div style="padding:18px"><div style="font-size:12px;color:#777;margin-bottom:5px">FORSLAG ${index + 1}</div><div style="font-size:20px;font-weight:700;margin-bottom:8px">${escapeHtml(property.title)}</div><div style="color:#444">${escapeHtml(facts)}</div>${reasonHtml}${areaHtml}<div style="margin-top:18px"><a href="${escapeHtml(property.publicUrl || "#")}" style="display:inline-block;padding:11px 16px;background:#1d4ed8;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Se bilder og alle boligdetaljer</a></div></div></div>`;
  }).join("");

  const bodyHtml = `<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.55;color:#111;max-width:720px;margin:0 auto"><p>${escapeHtml(greeting)}</p><p>${escapeHtml(intro)} Jeg har prioritert forslagene ut fra opplysningene og ønskene vi har registrert, slik at du slipper å gå gjennom boliger som åpenbart ikke passer.</p>${propertyCards}<p style="font-size:13px;color:#666">Pris og tilgjengelighet kan endres, så jeg kontrollerer dette på nytt dersom en av boligene er interessant.</p><p>Svar gjerne med nummeret på boligen eller boligene du liker best. Da kan jeg undersøke dem nærmere, sende mer informasjon eller planlegge neste steg.</p><p>Vennlig hilsen<br><strong>Freddy</strong><br>${escapeHtml(brandName(input.brandId))} · ${escapeHtml(brandWebsite(input.brandId))}</p></div>`;

  return { subject, bodyText, bodyHtml, propertyCount: properties.length, areas };
}
