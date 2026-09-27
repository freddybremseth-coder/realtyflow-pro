import { buildCorporatePartnerOutreach } from "@/lib/corporate-partner-outreach";

export type CorporatePartnerBriefInput = {
  id: string;
  company_name: string;
  organization_number?: string | null;
  domain?: string | null;
  website_url?: string | null;
  partner_type: string;
  city?: string | null;
  industry?: string | null;
  employee_count?: number | null;
  status?: string | null;
  fit_score?: number | null;
  fit_tier?: string | null;
  fit_reasons?: string[] | null;
  evidence_gaps?: string[] | null;
  referral_angle?: string | null;
  source_url?: string | null;
  notes?: string | null;
  next_action?: string | null;
};

const typeLabel: Record<string, string> = {
  accounting_tax: "Regnskap / revisjon / skatt",
  legal: "Juridisk rådgivning",
  management_consulting: "Bedriftsrådgivning",
  hr_recruitment: "HR / rekruttering",
  business_membership: "Nærings- / medlemsorganisasjon",
  corporate_travel: "Bedriftsreise / reiserådgivning",
  wealth_advisory: "Finansiell rådgivning",
  other: "Annet partnermiljø",
};

const valueProposition: Record<string, string[]> = {
  accounting_tax: [
    "Gi bedriftskundene et konkret beslutningsgrunnlag før de vurderer eiendom i Spania.",
    "Zen Corporate Homes håndterer eiendom, områdevalg, shortlist og lokal kjøpsprosess; partneren beholder skatte-/regnskapsrådgivningen.",
    "Samarbeidet kan gi partnerens kunder en tydeligere og tryggere vei fra idé til gjennomførbart case.",
  ],
  legal: [
    "Koble juridisk struktur og risikovurdering med en konkret eiendomsprosess på Costa Blanca.",
    "Zen Corporate Homes håndterer søk, boligshortlist, visninger og lokal koordinering.",
    "Advokatmiljøet kan beholde rollen på selskapsstruktur, avtaler, skatt og juridiske avklaringer.",
  ],
  management_consulting: [
    "Bruk Corporate Homes som et konkret arbeidsgiver-, kultur- eller ledelsestiltak når det passer kundens strategi.",
    "Vi kan levere kostnadsindikasjon, modellvalg, områder og representative boliger til beslutningsgrunnlaget.",
    "Partneren kan bruke konseptet som del av et bredere rådgivningsløp uten å måtte håndtere eiendom selv.",
  ],
  hr_recruitment: [
    "Gi arbeidsgivere et annerledes ansattgode som kan støtte rekruttering, retention og employer branding.",
    "Vi hjelper virksomheten å teste behov, kapasitet, bookingmodell og egnet bolig.",
    "Partneren kan introdusere ideen; Zen Corporate Homes tar den praktiske eiendomsdelen videre.",
  ],
  business_membership: [
    "Gi medlemsbedrifter tilgang til et nytt konsept for ansattgoder og langsiktig selskapseid bolig i Spania.",
    "For organisasjoner kan også en medlemsmodell vurderes der boligen brukes av en større medlemsgruppe.",
    "Vi kan levere webinar, medlemsinnhold, enkel bedriftsvurdering og konkrete boligeksempler.",
  ],
  corporate_travel: [
    "Utvid fra gjentakende hotell-/reisebestillinger til en langsiktig eiermodell for utvalgte virksomheter.",
    "Partneren kjenner reisemønsteret; vi kan teste om fast base i Spania gir mening for kunden.",
    "Vi håndterer eiendom og lokal drift, mens reiseaktøren beholder sin naturlige rolle.",
  ],
  wealth_advisory: [
    "Gi eierledere og selskaper et strukturert eiendomscase der bruksverdi og langsiktig eierskap vurderes samlet.",
    "Vi leverer områdevurdering, boligshortlist, kostnadsindikasjon og praktisk kjøpsprosess.",
    "Partneren beholder rollen på kapital, finans og investeringsmessige vurderinger.",
  ],
  other: [
    "Introduser relevante bedriftskunder eller medlemmer til Zen Corporate Homes.",
    "Vi tar ansvar for behovsavklaring, eiendom, visning og lokal gjennomføring.",
    "Samarbeidet kan starte enkelt med en felles vurdering av ett konkret kundecase.",
  ],
};

const discoveryQuestions: Record<string, string[]> = {
  business_membership: [
    "Har dere medlemsbedrifter som allerede bruker firmahytte, firmaleilighet eller andre personalgoder?",
    "Kunne et webinar eller en medlemsartikkel om selskapseid bolig i Spania være relevant?",
    "Vil dere primært introdusere medlemsbedrifter, eller kan en medlemsbolig også være aktuell for egen organisasjon?",
  ],
  hr_recruitment: [
    "Hvilke typer arbeidsgivere i kundeporteføljen konkurrerer hardest om nøkkelpersonell?",
    "Ser dere etter konkrete nye ansattgoder dere kan introdusere i rådgivningen?",
    "Vil en enkel Corporate Home Assessment være nyttig som førstefilter for interesserte kunder?",
  ],
  default: [
    "Hvilke bedriftskunder i porteføljen kan ha reell nytte av en selskapseid bolig i Spania?",
    "Hvordan kan vi gjøre introduksjonen enkel uten å forstyrre deres eksisterende kunderelasjon?",
    "Er det mest naturlig med introduksjon per case, felles webinar/innhold eller en mer fast partnerordning?",
  ],
};

export function buildCorporatePartnerBrief(input: CorporatePartnerBriefInput) {
  const partnerLabel = typeLabel[input.partner_type] || typeLabel.other;
  const values = valueProposition[input.partner_type] || valueProposition.other;
  const questions = discoveryQuestions[input.partner_type] || discoveryQuestions.default;
  const website = input.website_url || input.domain || null;
  const firstAngle = input.referral_angle || values[0];
  const company = input.company_name;

  const outreachSequence = buildCorporatePartnerOutreach({
    company_name: company,
    partner_type: input.partner_type,
    referral_angle: input.referral_angle,
  });
  const email = outreachSequence[0];


  return {
    title: company + " · partnerdossier",
    generatedAt: new Date().toISOString(),
    company: {
      name: company,
      organizationNumber: input.organization_number || null,
      website,
      sourceUrl: input.source_url || null,
      city: input.city || null,
      industry: input.industry || null,
      employeeCount: input.employee_count ?? null,
      status: input.status || "DISCOVERED",
    },
    fit: {
      tier: input.fit_tier || "UNSCORED",
      score: Number(input.fit_score || 0),
      reasons: Array.isArray(input.fit_reasons) ? input.fit_reasons : [],
      gaps: Array.isArray(input.evidence_gaps) ? input.evidence_gaps : [],
    },
    partner: {
      type: input.partner_type,
      label: partnerLabel,
      referralAngle: firstAngle,
      valueProposition: values,
      discoveryQuestions: questions,
    },
    recommendedMotion: [
      "Kvalitetssjekk virksomheten og partner-fit på selskapsnivå.",
      "Velg riktig partnerbudskap og én konkret samarbeidsvinkel.",
      "Identifiser en relevant person først etter eksplisitt godkjenning.",
      "Send aldri automatisk fra partnerdiscovery; bruk menneskelig kontroll før første kontakt.",
    ],
    email,
    outreachSequence,
    guardrails: [
      "Dossieret er basert på offentlig selskapsdata og intern partnerlogikk.",
      "Ingen personnavn, personlig e-post eller telefon skal legges til automatisk.",
      "E-postsekvensen er kun utkast og sendes ikke automatisk.",
      "Ingen skatte-, juridisk- eller regnskapsmessig konklusjon skal loves på vegne av partneren.",
    ],
  };
}
