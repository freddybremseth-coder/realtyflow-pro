import { normalizeCorporateProspect } from "@/lib/corporate-prospects";

export type BrregIndustryProfile =
  | "core"
  | "technology"
  | "consulting"
  | "construction"
  | "energy"
  | "finance"
  | "industry"
  | "all";

const PROFILE_PREFIXES: Record<Exclude<BrregIndustryProfile, "all">, string[]> = {
  core: ["62", "63.1", "58.2", "70.2", "71.1", "71.2", "41", "42", "43", "35", "64", "66", "69.2"],
  technology: ["62", "63.1", "58.2"],
  consulting: ["70.2", "71.1", "71.2", "69.2"],
  construction: ["41", "42", "43"],
  energy: ["35"],
  finance: ["64", "66", "69.2"],
  industry: [
    "10", "11", "12", "13", "14", "15", "16", "17", "18", "19",
    "20", "21", "22", "23", "24", "25", "26", "27", "28", "29",
    "30", "31", "32", "33",
  ],
};

export type BrregEntity = {
  organisasjonsnummer?: string;
  navn?: string;
  hjemmeside?: string;
  antallAnsatte?: number | null;
  harRegistrertAntallAnsatte?: boolean;
  organisasjonsform?: { kode?: string; beskrivelse?: string };
  naeringskode1?: { kode?: string; beskrivelse?: string };
  naeringskode2?: { kode?: string; beskrivelse?: string };
  naeringskode3?: { kode?: string; beskrivelse?: string };
  forretningsadresse?: {
    adresse?: string[];
    postnummer?: string;
    poststed?: string;
    kommune?: string;
    kommunenummer?: string;
    landkode?: string;
  };
  registrertIForetaksregisteret?: boolean;
  registrertIMvaregisteret?: boolean;
  sisteInnsendteAarsregnskap?: string | number | null;
  konkurs?: boolean;
  underAvvikling?: boolean;
  underTvangsavviklingEllerTvangsopplosning?: boolean;
  slettedato?: string | null;
  aktivitet?: string[];
  vedtektsfestetFormaal?: string[];
};

function normalizeHomepage(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function industryCodes(entity: BrregEntity) {
  return [entity.naeringskode1?.kode, entity.naeringskode2?.kode, entity.naeringskode3?.kode]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

export function matchesBrregIndustryProfile(entity: BrregEntity, profile: BrregIndustryProfile) {
  if (profile === "all") return true;
  const prefixes = PROFILE_PREFIXES[profile];
  return industryCodes(entity).some((code) => prefixes.some((prefix) => code.startsWith(prefix)));
}

export function isUsableBrregCorporateEntity(entity: BrregEntity) {
  return Boolean(
    entity.organisasjonsnummer &&
    entity.navn &&
    !entity.konkurs &&
    !entity.underAvvikling &&
    !entity.underTvangsavviklingEllerTvangsopplosning &&
    !entity.slettedato,
  );
}

export function brregEntityToProspect(entity: BrregEntity) {
  const orgnr = String(entity.organisasjonsnummer || "").trim();
  const sourceUrl = orgnr
    ? `https://data.brreg.no/enhetsregisteret/api/enheter/${encodeURIComponent(orgnr)}`
    : "https://data.brreg.no/enhetsregisteret/api/enheter";
  const website = normalizeHomepage(entity.hjemmeside);
  const address = entity.forretningsadresse || {};
  const primaryIndustry = entity.naeringskode1?.beskrivelse || entity.aktivitet?.[0] || null;

  return normalizeCorporateProspect({
    company_name: entity.navn,
    organization_number: orgnr,
    domain: website,
    organization_type: "company",
    country_code: address.landkode || "NO",
    city: address.poststed || address.kommune || null,
    industry: primaryIndustry,
    employee_count: entity.antallAnsatte ?? null,
    website_url: website,
    source_type: "brreg_open_data",
    source_url: sourceUrl,
    status: "DISCOVERED",
    evidence: {
      provider: "Brønnøysundregistrene · Enhetsregisteret åpne data",
      organization_form: entity.organisasjonsform || null,
      industry_codes: industryCodes(entity),
      registered_business_register: Boolean(entity.registrertIForetaksregisteret),
      registered_vat: Boolean(entity.registrertIMvaregisteret),
      latest_annual_accounts: entity.sisteInnsendteAarsregnskap ?? null,
      has_registered_employee_count: entity.harRegistrertAntallAnsatte ?? null,
      business_address: address,
      activity: entity.aktivitet || [],
      statutory_purpose: entity.vedtektsfestetFormaal || [],
    },
  });
}

export function parseBrregIndustryProfile(value: unknown): BrregIndustryProfile {
  const normalized = String(value || "core").trim().toLowerCase();
  const allowed: BrregIndustryProfile[] = [
    "core",
    "technology",
    "consulting",
    "construction",
    "energy",
    "finance",
    "industry",
    "all",
  ];
  return allowed.includes(normalized as BrregIndustryProfile)
    ? (normalized as BrregIndustryProfile)
    : "core";
}

export const BRREG_OPEN_DATA_SOURCE = {
  name: "Brønnøysundregistrene · Enhetsregisteret åpne data",
  docs: "https://data.brreg.no/enhetsregisteret/api/dokumentasjon/no/index.html",
  endpoint: "https://data.brreg.no/enhetsregisteret/api/enheter",
} as const;


export async function discoverBrregCandidates(input: {
  minEmployees?: number;
  maxEmployees?: number;
  profile?: BrregIndustryProfile;
  limit?: number;
  scanPages?: number;
}) {
  const minEmployees = Math.max(5, Math.round(input.minEmployees ?? 15));
  const maxEmployees = Math.max(minEmployees, Math.round(input.maxEmployees ?? 500));
  const profile = input.profile ?? "core";
  const limit = Math.min(100, Math.max(1, Math.round(input.limit ?? 50)));
  const scanPages = Math.min(6, Math.max(1, Math.round(input.scanPages ?? 4)));
  const collected: BrregEntity[] = [];
  const warnings: string[] = [];

  for (let page = 0; page < scanPages && collected.length < limit; page += 1) {
    const query = new URLSearchParams({
      fraAntallAnsatte: String(minEmployees),
      tilAntallAnsatte: String(maxEmployees),
      konkurs: "false",
      registrertIForetaksregisteret: "true",
      sort: "antallAnsatte,DESC",
      size: "100",
      page: String(page),
    });

    const url = `${BRREG_OPEN_DATA_SOURCE.endpoint}?${query.toString()}`;
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Accept: "application/vnd.brreg.enhetsregisteret.enhet.v2+json",
          "User-Agent": "RealtyFlow Corporate Homes/1.0",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
      });
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : "Brønnøysund-kall feilet.");
      break;
    }

    if (!response.ok) {
      warnings.push(`Brønnøysund svarte ${response.status} på side ${page + 1}.`);
      break;
    }

    const body = await response.json().catch(() => null);
    const entities = Array.isArray(body?._embedded?.enheter)
      ? body._embedded.enheter as BrregEntity[]
      : [];

    for (const entity of entities) {
      if (!isUsableBrregCorporateEntity(entity)) continue;
      if (!matchesBrregIndustryProfile(entity, profile)) continue;
      collected.push(entity);
      if (collected.length >= limit) break;
    }

    if (!entities.length) break;
  }

  return {
    candidates: collected
      .map((entity) => brregEntityToProspect(entity))
      .sort((a, b) => Number(b.fit_score || 0) - Number(a.fit_score || 0)),
    warnings,
    query: { minEmployees, maxEmployees, profile, limit, scanPages },
  };
}
