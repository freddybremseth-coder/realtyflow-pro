export type CorporatePartnerType =
  | "accounting_tax"
  | "legal"
  | "management_consulting"
  | "hr_recruitment"
  | "business_membership"
  | "corporate_travel"
  | "wealth_advisory"
  | "other";

export type CorporatePartnerCandidate = {
  company_name: string;
  organization_number: string | null;
  domain: string | null;
  partner_type: CorporatePartnerType;
  country_code: string;
  city: string | null;
  industry: string | null;
  employee_count: number | null;
  website_url: string | null;
  fit_score: number;
  fit_tier: "A" | "B" | "C" | "UNSCORED";
  fit_reasons: string[];
  evidence_gaps: string[];
  referral_angle: string;
  source_type: string;
  source_url: string | null;
  evidence: Record<string, unknown>;
  status: "DISCOVERED";
  next_action: string;
};

type BrregEntity = {
  organisasjonsnummer?: string;
  navn?: string;
  hjemmeside?: string;
  antallAnsatte?: number | null;
  organisasjonsform?: { kode?: string; beskrivelse?: string };
  naeringskode1?: { kode?: string; beskrivelse?: string };
  naeringskode2?: { kode?: string; beskrivelse?: string };
  naeringskode3?: { kode?: string; beskrivelse?: string };
  forretningsadresse?: {
    poststed?: string;
    kommune?: string;
    landkode?: string;
    kommunenummer?: string;
  };
  registrertIForetaksregisteret?: boolean;
  registrertIMvaregisteret?: boolean;
  sisteInnsendteAarsregnskap?: string | number | null;
  konkurs?: boolean;
  underAvvikling?: boolean;
  underTvangsavviklingEllerTvangsopplosning?: boolean;
  slettedato?: string | null;
};

export const CORPORATE_PARTNER_TARGET = 100;
export const CORPORATE_PARTNER_DAILY_BATCH = 15;

export const corporatePartnerProfiles: Array<{
  type: CorporatePartnerType;
  label: string;
  nace: string[];
  baseScore: number;
  referralAngle: string;
}> = [
  {
    type: "accounting_tax",
    label: "Regnskap / revisjon / skatterådgivning",
    nace: ["69.2"],
    baseScore: 34,
    referralAngle: "Kan introdusere konseptet til bedriftskunder som vurderer ansattgoder, eierskap eller langsiktig kapitalbruk.",
  },
  {
    type: "legal",
    label: "Advokat / juridisk rådgivning",
    nace: ["69.1"],
    baseScore: 32,
    referralAngle: "Kan identifisere bedriftskunder som trenger juridisk struktur rundt eierskap, bruk og grensekryssende kjøp.",
  },
  {
    type: "management_consulting",
    label: "Bedriftsrådgivning",
    nace: ["70.2"],
    baseScore: 32,
    referralAngle: "Kan introdusere Corporate Homes som del av arbeidsgiverstrategi, ledelse, organisasjonsutvikling eller kapitalplanlegging.",
  },
  {
    type: "hr_recruitment",
    label: "HR / rekruttering / bemanning",
    nace: ["78"],
    baseScore: 30,
    referralAngle: "Kan introdusere løsningen til arbeidsgivere som konkurrerer om spesialister og ønsker tydeligere ansattgoder.",
  },
  {
    type: "business_membership",
    label: "Arbeidsgiver- / nærings- / profesjonsorganisasjon",
    nace: ["94.1"],
    baseScore: 20,
    referralAngle: "Kan formidle konseptet til medlemsbedrifter eller selv vurdere en medlemsmodell.",
  },
  {
    type: "corporate_travel",
    label: "Bedriftsreise / reiserådgivning",
    nace: ["79.1", "79.9"],
    baseScore: 22,
    referralAngle: "Kan identifisere virksomheter med gjentakende Spania-reiser, retreats eller internasjonale opphold.",
  },
  {
    type: "wealth_advisory",
    label: "Finansiell rådgivning / formuesforvaltning",
    nace: ["66.1", "66.2"],
    baseScore: 22,
    referralAngle: "Kan introdusere selskap med eierledere eller virksomheter som vurderer langsiktige eiendomsinvesteringer.",
  },
];

function normalizeHomepage(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function validEntity(entity: BrregEntity) {
  return Boolean(
    entity.organisasjonsnummer &&
    entity.navn &&
    !entity.konkurs &&
    !entity.underAvvikling &&
    !entity.underTvangsavviklingEllerTvangsopplosning &&
    !entity.slettedato,
  );
}

function primaryIndustry(entity: BrregEntity) {
  return entity.naeringskode1?.beskrivelse || entity.naeringskode2?.beskrivelse || entity.naeringskode3?.beskrivelse || null;
}

function businessMembershipRelevance(entity: BrregEntity) {
  const haystack = [
    entity.navn,
    entity.naeringskode1?.beskrivelse,
    entity.naeringskode2?.beskrivelse,
    entity.naeringskode3?.beskrivelse,
  ].filter(Boolean).join(" ").toLowerCase();

  const broadBusinessTerms = [
    "arbeidsgiver",
    "nærings",
    "bedrift",
    "virke",
    "handel",
    "finans",
    "bank",
    "forsikring",
    "teknologi",
    "industri",
    "advokat",
    "jurist",
    "regnskap",
    "revisor",
    "ingeniør",
    "arkitekt",
    "eiendom",
    "reiseliv",
    "profesjon",
    "forbund",
  ];
  const narrowSectorTerms = [
    "avl",
    "husdyr",
    "svin",
    "storfe",
    "sau",
    "skog",
    "fiske",
    "fiskeri",
    "landbruk",
    "bonde",
    "frø",
    "plante",
  ];

  const broadHits = broadBusinessTerms.filter((term) => haystack.includes(term));
  const narrowHits = narrowSectorTerms.filter((term) => haystack.includes(term));
  return { broadHits, narrowHits };
}

function scorePartner(entity: BrregEntity, profile: (typeof corporatePartnerProfiles)[number]) {
  let score = profile.baseScore;
  const reasons = [`Relevant partnersegment: ${profile.label}`];
  const gaps: string[] = [];
  const website = normalizeHomepage(entity.hjemmeside);
  const employees = Number(entity.antallAnsatte ?? 0);

  if (website) {
    score += 20;
    reasons.push("Offentlig nettside registrert");
  } else {
    gaps.push("Nettside mangler i Enhetsregisteret");
  }

  if (employees >= 10 && employees <= 199) {
    score += 22;
    reasons.push(`${employees} ansatte gir sannsynlig kundebase og intern kapasitet`);
  } else if (employees >= 2 && employees < 10) {
    score += 14;
    reasons.push(`${employees} ansatte – mindre, men relevant rådgivermiljø`);
  } else if (employees >= 200) {
    score += 16;
    reasons.push(`${employees} ansatte – stor potensiell distribusjonsflate`);
  } else if (profile.type === "business_membership") {
    score += 10;
    reasons.push("Medlemsorganisasjoner kan være relevante selv med få registrerte ansatte");
  } else {
    gaps.push("Størrelse må vurderes nærmere");
  }

  if (profile.type === "business_membership") {
    const relevance = businessMembershipRelevance(entity);
    if (relevance.broadHits.length) {
      score += 22;
      reasons.push(`Bred arbeidsgiver-/nærings-/profesjonsrelevans: ${relevance.broadHits.slice(0, 3).join(", ")}`);
    } else {
      gaps.push("Bred medlems-/arbeidsgiverrelevans er ikke dokumentert");
    }
    if (relevance.narrowHits.length && !relevance.broadHits.length) {
      score -= 15;
      gaps.push("Smal bransjeorganisasjon – lavere henvisningsprioritet");
    }
  }

  if (entity.registrertIForetaksregisteret) {
    score += 6;
    reasons.push("Registrert i Foretaksregisteret");
  }

  if (entity.sisteInnsendteAarsregnskap) {
    score += 5;
    reasons.push("Årsregnskap registrert");
  }

  score = Math.max(0, Math.min(100, score));
  const tier: CorporatePartnerCandidate["fit_tier"] =
    score >= 75 ? "A" : score >= 58 ? "B" : score >= 40 ? "C" : "UNSCORED";
  return { score, tier, reasons, gaps };
}

export function partnerCandidateFromBrreg(
  entity: BrregEntity,
  profile: (typeof corporatePartnerProfiles)[number],
): CorporatePartnerCandidate | null {
  if (!validEntity(entity)) return null;
  const orgnr = String(entity.organisasjonsnummer || "").trim();
  const website = normalizeHomepage(entity.hjemmeside);
  const score = scorePartner(entity, profile);
  const address = entity.forretningsadresse || {};

  return {
    company_name: String(entity.navn || "").trim(),
    organization_number: orgnr || null,
    domain: website,
    partner_type: profile.type,
    country_code: address.landkode || "NO",
    city: address.poststed || address.kommune || null,
    industry: primaryIndustry(entity),
    employee_count: Number.isFinite(Number(entity.antallAnsatte)) ? Number(entity.antallAnsatte) : null,
    website_url: website,
    fit_score: score.score,
    fit_tier: score.tier,
    fit_reasons: score.reasons,
    evidence_gaps: score.gaps,
    referral_angle: profile.referralAngle,
    source_type: "brreg_partner_channel",
    source_url: orgnr ? `https://data.brreg.no/enhetsregisteret/api/enheter/${encodeURIComponent(orgnr)}` : null,
    evidence: {
      provider: "Brønnøysundregistrene · Enhetsregisteret åpne data",
      industry_codes: [entity.naeringskode1?.kode, entity.naeringskode2?.kode, entity.naeringskode3?.kode].filter(Boolean),
      organization_form: entity.organisasjonsform || null,
      registered_business_register: Boolean(entity.registrertIForetaksregisteret),
      registered_vat: Boolean(entity.registrertIMvaregisteret),
      latest_annual_accounts: entity.sisteInnsendteAarsregnskap ?? null,
      partner_profile: profile.type,
      company_level_only: true,
      personal_enrichment_performed: false,
    },
    status: "DISCOVERED",
    next_action: "Vurder virksomhetens kundebase og partner-fit. Identifiser personlig kontakt først etter eksplisitt godkjenning.",
  };
}

export async function discoverCorporatePartnerCandidates(input: {
  perProfile?: number;
  profiles?: CorporatePartnerType[];
}) {
  const perProfile = Math.min(50, Math.max(3, Math.round(input.perProfile ?? 12)));
  const selected = corporatePartnerProfiles.filter((profile) =>
    !input.profiles?.length || input.profiles.includes(profile.type),
  );
  const candidates: CorporatePartnerCandidate[] = [];
  const warnings: string[] = [];

  for (const profile of selected) {
    const query = new URLSearchParams({
      naeringskode: profile.nace.join(","),
      konkurs: "false",
      sort: "antallAnsatte,DESC",
      size: String(Math.min(100, perProfile * 4)),
      page: "0",
    });

    const url = `https://data.brreg.no/enhetsregisteret/api/enheter?${query.toString()}`;
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/vnd.brreg.enhetsregisteret.enhet.v2+json",
          "User-Agent": "RealtyFlow Corporate Homes Partner Discovery/1.0",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) {
        warnings.push(`${profile.label}: Brønnøysund svarte ${response.status}.`);
        continue;
      }
      const body = await response.json().catch(() => null);
      const entities = Array.isArray(body?._embedded?.enheter) ? body._embedded.enheter as BrregEntity[] : [];
      let accepted = 0;
      for (const entity of entities) {
        const candidate = partnerCandidateFromBrreg(entity, profile);
        if (!candidate || !["A", "B"].includes(candidate.fit_tier)) continue;
        candidates.push(candidate);
        accepted += 1;
        if (accepted >= perProfile) break;
      }
    } catch (error) {
      warnings.push(`${profile.label}: ${error instanceof Error ? error.message : "Brønnøysund-kall feilet."}`);
    }
  }

  const deduped = new Map<string, CorporatePartnerCandidate>();
  for (const candidate of candidates) {
    const key = candidate.organization_number || candidate.domain || candidate.company_name.toLowerCase();
    const existing = deduped.get(key);
    if (!existing || candidate.fit_score > existing.fit_score) deduped.set(key, candidate);
  }

  return {
    candidates: [...deduped.values()].sort((a, b) => b.fit_score - a.fit_score),
    warnings,
    profiles: selected.map((profile) => profile.type),
  };
}
