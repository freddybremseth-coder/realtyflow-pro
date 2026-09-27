export type CorporatePartnerOutreachInput = {
  company_name: string;
  partner_type: string;
  referral_angle?: string | null;
};

export type CorporatePartnerOutreachStep = {
  key: "initial" | "followup" | "close_loop";
  dayOffset: number;
  subject: string;
  body: string;
};

const PARTNER_PAGE = "https://www.zenecohomes.com/bedriftshytte-spania/partnere";

const partnerLabel: Record<string, string> = {
  accounting_tax: "regnskap, revisjon eller skatterådgivning",
  legal: "juridisk rådgivning",
  management_consulting: "bedriftsrådgivning",
  hr_recruitment: "HR, rekruttering eller People-rådgivning",
  business_membership: "nærings- eller medlemsorganisasjon",
  corporate_travel: "bedriftsreise eller reiserådgivning",
  wealth_advisory: "finansiell rådgivning",
  other: "rådgivning til norske virksomheter",
};

function trackingUrl(partnerType: string, content: string) {
  const url = new URL(PARTNER_PAGE);
  url.searchParams.set("utm_source", "realtyflow");
  url.searchParams.set("utm_medium", "partner_outreach");
  url.searchParams.set("utm_campaign", "zeneco_corporate_partner_no");
  url.searchParams.set("utm_content", `${partnerType || "other"}_${content}`);
  return url.toString();
}

function audienceSentence(type: string) {
  if (type === "business_membership") {
    return "Dere møter medlemsbedrifter og beslutningstakere som kan være på jakt etter konkrete medlems- eller ansattfordeler.";
  }
  if (type === "hr_recruitment") {
    return "Dere møter arbeidsgivere som konkurrerer om mennesker og vurderer konkrete tiltak for rekruttering og retention.";
  }
  if (type === "accounting_tax" || type === "legal" || type === "wealth_advisory") {
    return "Dere har allerede tillit hos virksomheter som tar større økonomiske og organisatoriske beslutninger.";
  }
  return "Dere møter norske virksomheter som kan ha behov for konkrete ansattgoder, ledelsesopphold eller langsiktige firmaløsninger.";
}

export function buildCorporatePartnerOutreach(
  input: CorporatePartnerOutreachInput,
): CorporatePartnerOutreachStep[] {
  const company = input.company_name.trim();
  const type = input.partner_type || "other";
  const label = partnerLabel[type] || partnerLabel.other;
  const initialUrl = trackingUrl(type, "initial");
  const followupUrl = trackingUrl(type, "followup");
  const closeUrl = trackingUrl(type, "close_loop");

  return [
    {
      key: "initial",
      dayOffset: 0,
      subject: "Mulig samarbeid om bedriftsbolig i Spania",
      body: `Hei,

Jeg jobber med Zen Corporate Homes, en del av Zen Eco Homes på Costa Blanca.

Jeg tar kontakt med ${company} fordi dere arbeider med ${label}. ${audienceSentence(type)}

Vi hjelper norske bedrifter og organisasjoner som vurderer å eie en leilighet eller villa i Spania for ansatte, ledelse eller medlemmer.

Partnerideen er enkel: dere beholder kunderelasjonen og deres faglige rolle. Vi håndterer behovsavklaring, områdevalg, boligshortlist, visning og den lokale eiendomsprosessen på Costa Blanca. Kundens egne kvalifiserte rådgivere beholder ansvaret for skatt, juss og regnskap.

Hvis dette kan være relevant for kundene eller medlemmene deres, tar jeg gjerne en kort og uforpliktende samtale.

Mer om partneropplegget:
${initialUrl}

Med vennlig hilsen
Freddy Bremseth
Zen Corporate Homes
Zen Eco Homes`,
    },
    {
      key: "followup",
      dayOffset: 7,
      subject: "Et konkret partneropplegg for norske bedriftskunder",
      body: `Hei,

Jeg følger kort opp meldingen om Zen Corporate Homes.

Når en bedrift viser interesse, starter vi ikke med å selge en tilfeldig bolig. Vi lager først et enkelt Corporate Home Assessment med brukere, budsjett, modell, aktuelle områder og et begrenset boliggrunnlag.

Det gjør at ${company} kan introdusere konseptet uten å bygge egen eiendoms- eller Spania-tjeneste.

${input.referral_angle ? `En mulig samarbeidsvinkel for dere er: ${input.referral_angle}\n\n` : ""}Samarbeidsmodell, ansvarsdeling og eventuell honorering avtales skriftlig før konkrete henvisninger.

Se partneropplegget:
${followupUrl}

Hvis dette er interessant, tar jeg gjerne en kort samtale.

Med vennlig hilsen
Freddy Bremseth
Zen Corporate Homes
Zen Eco Homes`,
    },
    {
      key: "close_loop",
      dayOffset: 21,
      subject: "Skal jeg legge bort partnerideen?",
      body: `Hei,

Jeg ville bare avslutte denne tråden ryddig.

Hvis et samarbeid rundt norske bedrifter som vurderer firmabolig eller bedriftshytte i Spania ikke er relevant for ${company}, trenger dere ikke gjøre noe.

Hvis ideen kan være aktuell nå eller senere, finner dere en kort oversikt her:
${closeUrl}

Da tar jeg gjerne en uforpliktende prat når det passer.

Med vennlig hilsen
Freddy Bremseth
Zen Corporate Homes
Zen Eco Homes`,
    },
  ];
}

export const CORPORATE_PARTNER_OUTREACH_RULES = {
  language: "nb-NO",
  automaticSendingAllowed: false,
  personalEnrichmentAllowed: false,
  approvalRequiredBeforeRecipientLookup: true,
  stopAfterReply: true,
  stopAfterPartnerInquiry: true,
  sequenceDays: [0, 7, 21],
} as const;
