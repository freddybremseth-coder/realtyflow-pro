import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  researchCorporateCompanySignals,
  signalEvidencePatch,
  type CorporateCompanySignal,
  type CorporateSignalEvidence,
} from "@/lib/corporate-company-signals";
import { rescoreCorporateProspect } from "@/lib/corporate-prospects";
import { researchWeb } from "@/services/ai/research";

export type CorporateIntelligenceScope = "ACCOUNT" | "MARKET" | "REGULATORY";
export type CorporateIntelligenceDirection = "POSITIVE" | "NEUTRAL" | "NEGATIVE";

export type CorporateIntelligenceFindingInput = {
  prospectId?: string | null;
  scope: CorporateIntelligenceScope;
  signalType: string;
  title: string;
  summary: string;
  whyItMatters?: string | null;
  sourceUrl: string;
  sourceTitle?: string | null;
  sourceKind?: "company_web" | "company_pdf" | "external_article" | "official_data" | "official_regulation" | "web";
  sourcePublishedAt?: string | null;
  direction?: CorporateIntelligenceDirection;
  relevance?: number;
  strength?: number;
  freshness?: number;
  sourceAuthority?: number;
  confidence?: number;
  fitDelta?: number;
  timingDelta?: number;
  intentDelta?: number;
  financialCapacityDelta?: number;
  evidence?: Record<string, unknown>;
};

const COMPANY_SIGNAL_META: Record<CorporateCompanySignal, any> = {
  employee_benefit_signal: { title: "Selskapet omtaler ansattgoder", why: "Et etablert språk for ansattgoder gjør Corporate Home lettere å posisjonere som en konkret medarbeiderfordel.", direction: "POSITIVE", relevance: 92, strength: 72, fit: 8, timing: 3, intent: 1, financial: 0 },
  remote_workforce_signal: { title: "Hybrid eller distribuert arbeidsmodell", why: "En distribuert organisasjon kan ha større behov for samlingsarenaer og tydelige fellesskaps-/People-tiltak.", direction: "POSITIVE", relevance: 82, strength: 62, fit: 5, timing: 4, intent: 1, financial: 0 },
  retreat_signal: { title: "Selskapet omtaler samlinger, kickoff eller retreat", why: "Dokumentert bruk av samlinger styrker management-retreat og hotellalternativ som mulig inngang.", direction: "POSITIVE", relevance: 96, strength: 82, fit: 7, timing: 8, intent: 3, financial: 0 },
  existing_cabin_signal: { title: "Eksisterende firmahytte-, reise- eller personalordning", why: "Kunden kjenner allerede kategorien og kan lettere sammenligne dagens ordning med et Corporate Home i Spania.", direction: "POSITIVE", relevance: 98, strength: 88, fit: 10, timing: 7, intent: 4, financial: 0 },
  hiring_growth_signal: { title: "Rekruttering eller vekst i arbeidsstyrken", why: "Vekst øker ofte behovet for rekruttering, retention, onboarding og kulturbygging.", direction: "POSITIVE", relevance: 86, strength: 72, fit: 5, timing: 8, intent: 1, financial: 2 },
  international_growth_signal: { title: "Internasjonal ekspansjon eller nye markeder", why: "Internasjonal vekst kan gjøre en fast base, relokasjon eller samlingsarena mer relevant.", direction: "POSITIVE", relevance: 78, strength: 68, fit: 4, timing: 6, intent: 1, financial: 3 },
  new_office_signal: { title: "Nytt kontor eller ny lokasjon", why: "Ny lokasjon er et ferskt organisatorisk endringssignal og kan gi behov for samlinger, onboarding og kulturarbeid.", direction: "POSITIVE", relevance: 76, strength: 66, fit: 3, timing: 7, intent: 1, financial: 2 },
  leadership_change_signal: { title: "Endring i ledelsen", why: "Ny leder kan endre prioriteringer. Dette er et timing-signal, men må brukes forsiktig og uten å anta kjøpsvilje.", direction: "NEUTRAL", relevance: 68, strength: 58, fit: 0, timing: 6, intent: 0, financial: 0 },
  acquisition_signal: { title: "Oppkjøp eller fusjon", why: "Integrasjon etter oppkjøp kan skape behov for samlinger og kulturbygging, samtidig som beslutningsprosessen kan være i endring.", direction: "NEUTRAL", relevance: 74, strength: 72, fit: 2, timing: 5, intent: 0, financial: 2 },
  financial_strength_signal: { title: "Sterke finansielle resultater eller vekst", why: "Dokumentert økonomisk styrke kan øke sannsynligheten for at et langsiktig Corporate Home-case er finansielt realistisk.", direction: "POSITIVE", relevance: 78, strength: 78, fit: 3, timing: 4, intent: 0, financial: 10 },
  cost_cutting_signal: { title: "Kostnadskutt eller effektiviseringsprogram", why: "Kostnadsfokus svekker timing for et nytt kapitalintensivt initiativ og tilsier en mer forsiktig eller utsatt salgsbevegelse.", direction: "NEGATIVE", relevance: 92, strength: 82, fit: -2, timing: -12, intent: -4, financial: -8 },
  restructuring_signal: { title: "Nedbemanning eller restrukturering", why: "Restrukturering er et sterkt negativt timing-signal. Kontoen bør normalt ikke presses med et nytt ansattgode eller eiendomsinitiativ.", direction: "NEGATIVE", relevance: 98, strength: 92, fit: -4, timing: -18, intent: -7, financial: -10 },
  member_benefit_signal: { title: "Selskapet eller organisasjonen omtaler medlemsfordeler", why: "Medlemsfordeler støtter medlemsbolig eller kunde-/partnerfordel som primær hypotese.", direction: "POSITIVE", relevance: 94, strength: 76, fit: 9, timing: 4, intent: 2, financial: 0 },
  culture_employer_brand_signal: { title: "Employer branding, kultur eller medarbeideropplevelse", why: "Et eksplisitt People-/kulturfokus styrker relevansen for ansattfordel og samlingsbruk.", direction: "POSITIVE", relevance: 90, strength: 72, fit: 7, timing: 5, intent: 1, financial: 0 },
};

const EXTERNAL_SIGNAL_TYPES = [
  "hiring_growth","international_expansion","new_office","leadership_change","acquisition",
  "financial_strength","cost_cutting","restructuring","employee_benefits","employer_branding",
  "team_retreat","member_benefits","travel_connectivity","housing_market","foreign_buyer_demand",
  "hotel_cost","tax_rule","property_rule","tourist_rental_rule","corporate_governance",
];

function clean(value: unknown, max = 4000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function clamp(value: unknown, min = 0, max = 100, fallback = 50) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
}

function safeUrl(value: unknown) {
  const raw = clean(value, 1200);
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    return ["https:", "http:"].includes(parsed.protocol) ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function normalizeUrlForFingerprint(value: string) {
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    ["utm_source","utm_medium","utm_campaign","utm_term","utm_content","gclid","fbclid"].forEach((key) => parsed.searchParams.delete(key));
    return parsed.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return value.toLowerCase().trim();
  }
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function findingFingerprint(input: CorporateIntelligenceFindingInput) {
  return digest([input.scope, input.signalType.toLowerCase(), normalizeUrlForFingerprint(input.sourceUrl)].join("|"));
}

function findingContentHash(input: CorporateIntelligenceFindingInput) {
  return digest([input.title, input.summary, input.whyItMatters || "", input.direction || "NEUTRAL", input.sourcePublishedAt || ""].join("|"));
}

function parsePublishedAt(value: unknown) {
  const raw = clean(value, 100);
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

export function extractCorporateResearchJsonArray(text: string): any[] {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] || text;
  const candidate = fenced.split(/\nKilder:\s*\n/i)[0];
  const start = candidate.indexOf("[");
  if (start < 0) return [];

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < candidate.length; index += 1) {
    const char = candidate[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "[") depth += 1;
    if (char === "]") {
      depth -= 1;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(candidate.slice(start, index + 1));
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      }
    }
  }
  return [];
}

function normalizeExternalFinding(value: any, scope: CorporateIntelligenceScope, prospectId?: string | null): CorporateIntelligenceFindingInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const sourceUrl = safeUrl(value.sourceUrl || value.source_url);
  const title = clean(value.title, 400);
  const summary = clean(value.summary, 2400);
  const signalType = clean(value.signalType || value.signal_type, 100).toLowerCase();
  if (!sourceUrl || !title || !summary || !signalType) return null;

  const directionRaw = clean(value.direction, 20).toUpperCase();
  const direction: CorporateIntelligenceDirection =
    directionRaw === "POSITIVE" || directionRaw === "NEGATIVE" ? directionRaw : "NEUTRAL";

  const rawKind = clean(value.sourceKind || value.source_kind, 40);
  const sourceKind = ["external_article","official_data","official_regulation","web"].includes(rawKind)
    ? rawKind as CorporateIntelligenceFindingInput["sourceKind"]
    : scope === "REGULATORY" ? "official_regulation" : scope === "MARKET" ? "official_data" : "external_article";

  return {
    prospectId: prospectId || null,
    scope,
    signalType,
    title,
    summary,
    whyItMatters: clean(value.whyItMatters || value.why_it_matters, 2400) || null,
    sourceUrl,
    sourceTitle: clean(value.sourceTitle || value.source_title, 500) || null,
    sourceKind,
    sourcePublishedAt: parsePublishedAt(value.publishedAt || value.source_published_at),
    direction,
    relevance: clamp(value.relevance, 0, 100, 70),
    strength: clamp(value.strength, 0, 100, 65),
    freshness: clamp(value.freshness, 0, 100, 70),
    sourceAuthority: clamp(value.sourceAuthority || value.source_authority, 0, 100, 70),
    confidence: clamp(value.confidence, 0, 100, 70),
    fitDelta: clamp(value.fitDelta || value.fit_delta, -25, 25, 0),
    timingDelta: clamp(value.timingDelta || value.timing_delta, -25, 25, 0),
    intentDelta: clamp(value.intentDelta || value.intent_delta, -25, 25, 0),
    financialCapacityDelta: clamp(value.financialCapacityDelta || value.financial_capacity_delta, -25, 25, 0),
    evidence: { research_note: clean(value.evidence || value.quote || value.fact, 1600) || undefined },
  };
}

async function persistFinding(supabase: SupabaseClient, runId: string, input: CorporateIntelligenceFindingInput) {
  const fingerprint = findingFingerprint(input);
  const nextHash = findingContentHash(input);
  let query = supabase
    .from("corporate_intelligence_findings")
    .select("id,content_hash,first_seen_at,review_status,review_note,reviewed_at,reviewed_by_email")
    .eq("scope", input.scope)
    .eq("fingerprint", fingerprint);

  query = input.prospectId ? query.eq("prospect_id", input.prospectId) : query.is("prospect_id", null);
  const { data: existing, error: readError } = await query.maybeSingle();
  if (readError) throw readError;

  const changeStatus = !existing ? "NEW" : existing.content_hash === nextHash ? "UNCHANGED" : "CHANGED";
  const now = new Date().toISOString();
  const payload = {
    prospect_id: input.prospectId || null,
    run_id: runId,
    scope: input.scope,
    signal_type: input.signalType,
    title: input.title,
    summary: input.summary,
    why_it_matters: input.whyItMatters || null,
    source_url: input.sourceUrl,
    source_title: input.sourceTitle || null,
    source_kind: input.sourceKind || "web",
    source_published_at: input.sourcePublishedAt || null,
    observed_at: now,
    first_seen_at: existing?.first_seen_at || now,
    last_seen_at: now,
    fingerprint,
    content_hash: nextHash,
    change_status: changeStatus,
    direction: input.direction || "NEUTRAL",
    relevance: clamp(input.relevance),
    strength: clamp(input.strength),
    freshness: clamp(input.freshness),
    source_authority: clamp(input.sourceAuthority),
    confidence: clamp(input.confidence),
    fit_delta: clamp(input.fitDelta, -25, 25, 0),
    timing_delta: clamp(input.timingDelta, -25, 25, 0),
    intent_delta: clamp(input.intentDelta, -25, 25, 0),
    financial_capacity_delta: clamp(input.financialCapacityDelta, -25, 25, 0),
    evidence: input.evidence || {},
    active: true,
    updated_at: now,
    ...(existing && existing.content_hash !== nextHash ? {
      review_status: "PENDING",
      review_note: null,
      reviewed_at: null,
      reviewed_by_email: null,
    } : {}),
  };

  if (existing?.id) {
    const { data, error } = await supabase.from("corporate_intelligence_findings").update(payload).eq("id", existing.id).select("*").single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase.from("corporate_intelligence_findings").insert(payload).select("*").single();
  if (error) throw error;
  return data;
}

const EVENT_SIGNALS = new Set<CorporateCompanySignal>([
  "hiring_growth_signal",
  "international_growth_signal",
  "new_office_signal",
  "leadership_change_signal",
  "acquisition_signal",
  "financial_strength_signal",
  "cost_cutting_signal",
  "restructuring_signal",
]);

function ownSignalScore(signal: CorporateCompanySignal, evidence: CorporateSignalEvidence, meta: any) {
  const currentYear = new Date().getUTCFullYear();
  const eventYear = Number(evidence.event_year || 0) || null;
  const eventSignal = EVENT_SIGNALS.has(signal);

  if (!eventSignal) {
    return {
      relevance: meta.relevance,
      freshness: 75,
      confidence: 90,
      fit: meta.fit,
      timing: Math.round(Number(meta.timing || 0) * 0.5),
      intent: 0,
      financial: 0,
      historical: false,
      dated: false,
    };
  }

  if (!eventYear) {
    return {
      relevance: Math.min(Number(meta.relevance || 50), 55),
      freshness: 30,
      confidence: 65,
      fit: 0,
      timing: 0,
      intent: 0,
      financial: 0,
      historical: false,
      dated: false,
    };
  }

  const age = Math.max(0, currentYear - eventYear);
  const stale = age >= 2;
  return {
    relevance: stale ? Math.min(Number(meta.relevance || 50), age >= 3 ? 45 : 60) : meta.relevance,
    freshness: age === 0 ? 92 : age === 1 ? 72 : age === 2 ? 45 : 20,
    confidence: 90,
    fit: stale ? Math.round(Number(meta.fit || 0) * 0.25) : meta.fit,
    timing: stale ? 0 : meta.timing,
    intent: stale ? 0 : meta.intent,
    financial: stale ? 0 : meta.financial,
    historical: stale,
    dated: true,
  };
}

function ownSiteFindings(prospectId: string, signals: Partial<Record<CorporateCompanySignal, CorporateSignalEvidence>>) {
  return Object.entries(signals).flatMap(([signalKey, evidence]) => {
    if (!evidence) return [];
    const signal = signalKey as CorporateCompanySignal;
    const meta = COMPANY_SIGNAL_META[signal];
    if (!meta) return [];
    const score = ownSignalScore(signal, evidence, meta);
    const yearNote = evidence.event_year ? " (" + evidence.event_year + ")" : "";
    const freshnessNote = score.historical
      ? " Historisk signal; brukes som kontekst og skal ikke drive dagens timing."
      : EVENT_SIGNALS.has(signal) && !score.dated
        ? " Dato er ikke bekreftet; brukes som svakt kontekstuelt signal."
        : "";

    return [{
      prospectId,
      scope: "ACCOUNT" as const,
      signalType: signal,
      title: meta.title + yearNote,
      summary: "Fant " + evidence.matched_terms.map((term) => "«" + term + "»").join(", ") + " på selskapets egen kilde." + freshnessNote,
      whyItMatters: meta.why + freshnessNote,
      sourceUrl: evidence.source_url,
      sourceKind: evidence.source_kind || "company_web",
      direction: meta.direction,
      relevance: score.relevance,
      strength: meta.strength,
      freshness: score.freshness,
      sourceAuthority: 95,
      confidence: score.confidence,
      fitDelta: score.fit,
      timingDelta: score.timing,
      intentDelta: score.intent,
      financialCapacityDelta: score.financial,
      evidence: {
        matched_terms: evidence.matched_terms,
        checked_at: evidence.checked_at,
        context_snippets: evidence.context_snippets || [],
        event_year: evidence.event_year || null,
        event_date_precision: evidence.event_date_precision || null,
        historical: score.historical,
        temporal_confidence: score.dated ? "DATED" : EVENT_SIGNALS.has(signal) ? "UNDATED_EVENT" : "CURRENT_PAGE_STATE",
      },
    } as CorporateIntelligenceFindingInput];
  });
}

function externalAccountPrompt(company: Record<string, any>) {
  const companyName = clean(company.company_name, 240);
  const domain = clean(company.domain || company.website_url, 500);
  const orgNo = clean(company.organization_number, 50);
  return [
    "Research selskapet \"" + companyName + "\"" + (orgNo ? " (org.nr. " + orgNo + ")" : "") + (domain ? ", offisielt domene " + domain : "") + " for Zen Corporate Homes.",
    "Finn KUN offentlig, profesjonell informasjon på selskapsnivå. Ikke finn eller returner private/sensitive personopplysninger og ikke gjør kontaktberikelse.",
    "Prioriter ferske kilder fra de siste 12 månedene, men ta med siste årsrapport/strategirapport når relevant.",
    "Se spesielt etter disse signaltypene: " + EXTERNAL_SIGNAL_TYPES.slice(0, 12).join(", ") + ".",
    "Returner KUN en JSON-array med maks 8 dokumenterbare funn. Hvert objekt skal ha: signalType,title,summary,whyItMatters,sourceUrl,sourceTitle,publishedAt,sourceKind,direction,relevance,strength,freshness,sourceAuthority,confidence,fitDelta,timingDelta,intentDelta,financialCapacityDelta,evidence.",
    "Regler: Ikke konkluder med kjøpsvilje uten eksplisitt evidens. Lederskifte er timing, ikke intent. Nedbemanning/kostnadskutt trekker normalt timing ned. Sterke resultater kan styrke financialCapacity, ikke automatisk intent. Bruk eksakt sourceUrl. Hvis ingen dokumenterbare funn: [].",
  ].join("\n\n");
}

function watchPrompt(scope: "MARKET" | "REGULATORY") {
  if (scope === "MARKET") {
    return [
      "Finn de viktigste ferske, dokumenterbare markedssignalene for Zen Corporate Homes og norske bedrifter som vurderer bolig på Costa Blanca.",
      "Prioriter offisielle eller primære kilder, særlig INE, Registradores og Aena, deretter andre sterke fagkilder.",
      "Se etter boligpriser, utenlandsk kjøperandel, transaksjoner, flytilgjengelighet Alicante/Valencia, relevante hotell-/overnattingskostnader og andre endringer som påvirker business case eller områdevalg.",
      "Returner KUN JSON-array med maks 8 funn med feltene signalType,title,summary,whyItMatters,sourceUrl,sourceTitle,publishedAt,sourceKind,direction,relevance,strength,freshness,sourceAuthority,confidence,fitDelta,timingDelta,intentDelta,financialCapacityDelta,evidence.",
      "sourceKind skal være official_data eller external_article. Ikke presenter prisvekst som garanti eller fremtidig avkastning. Hvis ingen vesentlige nye funn: [].",
    ].join("\n\n");
  }
  return [
    "Finn de viktigste ferske regulatoriske/skatte-/juridiske endringene som kan påvirke Zen Corporate Homes eller norske bedrifter som eier/bruker bolig i Spania.",
    "Prioriter BOE, Agencia Tributaria, Skatteetaten og andre offisielle myndighetskilder.",
    "Se etter bedriftshytte/ansattfordel, eierstruktur, dokumentasjon av bruk, bolig/sameie, turistutleie, skatt og andre regler med praktisk betydning.",
    "Returner KUN JSON-array med maks 8 funn med feltene signalType,title,summary,whyItMatters,sourceUrl,sourceTitle,publishedAt,sourceKind,direction,relevance,strength,freshness,sourceAuthority,confidence,fitDelta,timingDelta,intentDelta,financialCapacityDelta,evidence.",
    "sourceKind skal være official_regulation eller official_data. Ikke gi juridiske/skattefaglige konklusjoner utover kilden; marker behov for ekstern rådgiver i whyItMatters når relevant. Hvis ingen vesentlige nye funn: [].",
  ].join("\n\n");
}

async function createRun(supabase: SupabaseClient, scope: CorporateIntelligenceScope, prospectId: string | null, trigger: "cron" | "manual", createdByEmail?: string | null) {
  const { data, error } = await supabase.from("corporate_intelligence_runs").insert({
    prospect_id: prospectId,
    scope,
    trigger,
    status: "RUNNING",
    created_by_email: createdByEmail || null,
  }).select("id").single();
  if (error || !data) throw error || new Error("INTELLIGENCE_RUN_CREATE_FAILED");
  return String(data.id);
}

async function finishRun(supabase: SupabaseClient, runId: string, input: Record<string, any>) {
  await supabase.from("corporate_intelligence_runs").update({
    status: input.status,
    provider: input.provider || null,
    completed_at: new Date().toISOString(),
    source_count: input.sourceCount || 0,
    finding_count: input.findingCount || 0,
    new_count: input.newCount || 0,
    changed_count: input.changedCount || 0,
    warnings: input.warnings || [],
    summary: input.summary || {},
  }).eq("id", runId);
}

export async function runAccountDeepResearch(
  supabase: SupabaseClient,
  prospectId: string,
  options: { trigger?: "cron" | "manual"; createdByEmail?: string | null } = {},
) {
  const trigger = options.trigger || "cron";
  const runId = await createRun(supabase, "ACCOUNT", prospectId, trigger, options.createdByEmail);
  const warnings: string[] = [];
  let provider = "company_crawl";

  try {
    const { data: company, error } = await supabase
      .from("corporate_prospects")
      .select("id,company_name,organization_number,domain,organization_type,country_code,website_url,industry,employee_count,employee_band,member_count,decision_roles,source_url,evidence,fit_score,fit_tier,status")
      .eq("id", prospectId).eq("brand_id", "zeneco").maybeSingle();
    if (error) throw error;
    if (!company) throw new Error("ACCOUNT_NOT_FOUND");

    const website = clean(company.website_url || company.domain, 800);
    const ownResearch = website
      ? await researchCorporateCompanySignals(/^https?:\/\//i.test(website) ? website : "https://" + website)
      : null;
    const ownFindings = ownResearch ? ownSiteFindings(prospectId, ownResearch.signals) : [];
    if (ownResearch?.warnings?.length) warnings.push(...ownResearch.warnings);

    let externalFindings: CorporateIntelligenceFindingInput[] = [];
    const external = await researchWeb(externalAccountPrompt(company), { maxTokens: 3200, maxSearches: 7 });
    provider = external.provider === "none" ? provider : provider + "+" + external.provider;
    if (external.provider === "none") {
      warnings.push("Ekstern webresearch leverte ikke data. Resultatet er basert på selskapets egne kilder og bør regnes som degraded research.");
    }
    if (external.text) {
      externalFindings = extractCorporateResearchJsonArray(external.text)
        .map((item) => normalizeExternalFinding(item, "ACCOUNT", prospectId))
        .filter((item): item is CorporateIntelligenceFindingInput => Boolean(item))
        .slice(0, 8);
      if (!externalFindings.length) warnings.push("Ekstern webresearch ga ingen strukturerte funn.");
    }

    const persisted: Array<Record<string, any>> = [];
    for (const finding of [...ownFindings, ...externalFindings]) {
      persisted.push(await persistFinding(supabase, runId, finding) as Record<string, any>);
    }

    if (ownResearch) {
      const existingEvidence = company.evidence && typeof company.evidence === "object" && !Array.isArray(company.evidence)
        ? company.evidence as Record<string, unknown> : {};
      const reviewOverrides =
        existingEvidence.corporate_intelligence_review_overrides &&
        typeof existingEvidence.corporate_intelligence_review_overrides === "object" &&
        !Array.isArray(existingEvidence.corporate_intelligence_review_overrides)
          ? { ...existingEvidence.corporate_intelligence_review_overrides as Record<string, unknown> }
          : {};
      for (const row of persisted) {
        const signalType = String(row.signal_type || "");
        if (!signalType) continue;
        const reviewStatus = String(row.review_status || "PENDING").toUpperCase();
        reviewOverrides[signalType] = reviewStatus;
      }

      const nextEvidence = {
        ...existingEvidence,
        ...signalEvidencePatch(ownResearch),
        corporate_intelligence_review_overrides: reviewOverrides,
        corporate_intelligence_summary: {
          checked_at: new Date().toISOString(),
          provider,
          finding_count: persisted.length,
          new_count: persisted.filter((row) => row.change_status === "NEW").length,
          changed_count: persisted.filter((row) => row.change_status === "CHANGED").length,
          negative_count: persisted.filter((row) => row.direction === "NEGATIVE").length,
        },
      };
      const score = rescoreCorporateProspect({ ...company, evidence: nextEvidence });
      await supabase.from("corporate_prospects").update({ evidence: nextEvidence, ...score, updated_at: new Date().toISOString() }).eq("id", prospectId);
    }

    const sourceCount = new Set(persisted.map((row) => row.source_url).filter(Boolean)).size;
    const newCount = persisted.filter((row) => row.change_status === "NEW").length;
    const changedCount = persisted.filter((row) => row.change_status === "CHANGED").length;
    await finishRun(supabase, runId, {
      status: "SUCCESS", provider, sourceCount, findingCount: persisted.length, newCount, changedCount,
      warnings: [...new Set(warnings)].slice(0, 12),
      summary: {
        positive: persisted.filter((row) => row.direction === "POSITIVE").length,
        negative: persisted.filter((row) => row.direction === "NEGATIVE").length,
        material_changes: persisted.filter((row) => row.change_status === "NEW" || row.change_status === "CHANGED").length,
        degraded_research: external.provider === "none",
      },
    });

    return { success: true, runId, scope: "ACCOUNT" as const, prospectId, provider, sourceCount, findingCount: persisted.length, newCount, changedCount, warnings: [...new Set(warnings)].slice(0, 12), findings: persisted, externalAction: false as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Corporate Account Intelligence failed";
    await finishRun(supabase, runId, { status: "ERROR", provider, warnings: [message] });
    throw error;
  }
}

export async function runCorporateWatch(
  supabase: SupabaseClient,
  scope: "MARKET" | "REGULATORY",
  options: { trigger?: "cron" | "manual"; createdByEmail?: string | null } = {},
) {
  const trigger = options.trigger || "cron";
  const runId = await createRun(supabase, scope, null, trigger, options.createdByEmail);
  const warnings: string[] = [];

  try {
    const research = await researchWeb(watchPrompt(scope), { maxTokens: 3200, maxSearches: 8 });
    if (research.provider === "none") {
      warnings.push("Ekstern webresearch leverte ikke data; watch-kjøringen er degraded.");
    }
    const normalized = extractCorporateResearchJsonArray(research.text)
      .map((item) => normalizeExternalFinding(item, scope, null))
      .filter((item): item is CorporateIntelligenceFindingInput => Boolean(item))
      .slice(0, 8);

    if (research.text && !normalized.length) warnings.push("Webresearch ga ingen strukturerte funn.");
    const persisted: Array<Record<string, any>> = [];
    for (const finding of normalized) persisted.push(await persistFinding(supabase, runId, finding) as Record<string, any>);

    const sourceCount = new Set(persisted.map((row) => row.source_url).filter(Boolean)).size;
    const newCount = persisted.filter((row) => row.change_status === "NEW").length;
    const changedCount = persisted.filter((row) => row.change_status === "CHANGED").length;
    await finishRun(supabase, runId, {
      status: "SUCCESS", provider: research.provider, sourceCount, findingCount: persisted.length, newCount, changedCount, warnings,
      summary: {
        material_changes: persisted.filter((row) => row.change_status === "NEW" || row.change_status === "CHANGED").length,
        high_relevance: persisted.filter((row) => Number(row.relevance || 0) >= 80).length,
      },
    });

    return { success: true, runId, scope, prospectId: null, provider: research.provider, sourceCount, findingCount: persisted.length, newCount, changedCount, warnings, findings: persisted, externalAction: false as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Corporate watch failed";
    await finishRun(supabase, runId, { status: "ERROR", warnings: [message] });
    throw error;
  }
}

export function summarizeIntelligenceForAccount(findings: Array<Record<string, any>>) {
  const active = findings.filter((row) => row.active !== false);
  const reviewable = active.filter((row) => !["IGNORED","OUTDATED"].includes(String(row.review_status || "PENDING")));
  const effective = reviewable.filter((row) => {
    const evidence = row.evidence && typeof row.evidence === "object" && !Array.isArray(row.evidence)
      ? row.evidence as Record<string, unknown>
      : {};
    return evidence.historical !== true;
  });

  const deltas = effective.reduce((acc, row) => {
    acc.fit += Number(row.fit_delta || 0);
    acc.timing += Number(row.timing_delta || 0);
    acc.intent += Number(row.intent_delta || 0);
    acc.financialCapacity += Number(row.financial_capacity_delta || 0);
    return acc;
  }, { fit: 0, timing: 0, intent: 0, financialCapacity: 0 });

  const material = effective
    .filter((row) => ["NEW","CHANGED"].includes(String(row.change_status || "")))
    .sort((a,b) => Number(b.relevance || 0) * Number(b.confidence || 0) - Number(a.relevance || 0) * Number(a.confidence || 0));

  return {
    total: active.length,
    effectiveTotal: effective.length,
    reviewPending: active.filter((row) => String(row.review_status || "PENDING") === "PENDING").length,
    confirmed: active.filter((row) => String(row.review_status || "") === "CONFIRMED").length,
    ignoredOrOutdated: active.filter((row) => ["IGNORED","OUTDATED"].includes(String(row.review_status || ""))).length,
    historical: active.filter((row) => {
      const evidence = row.evidence && typeof row.evidence === "object" && !Array.isArray(row.evidence)
        ? row.evidence as Record<string, unknown>
        : {};
      return evidence.historical === true;
    }).length,
    materialChanges: material.length,
    negativeSignals: effective.filter((row) => row.direction === "NEGATIVE").length,
    deltas: {
      fit: clamp(deltas.fit, -25, 25, 0),
      timing: clamp(deltas.timing, -25, 25, 0),
      intent: clamp(deltas.intent, -25, 25, 0),
      financialCapacity: clamp(deltas.financialCapacity, -25, 25, 0),
    },
    topChanges: material.slice(0, 5),
  };
}
