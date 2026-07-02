export type DemoSitePackageId = "basis" | "standard" | "premium";

export type DemoSiteStatus =
  | "lead"
  | "draft_preview"
  | "ordered"
  | "in_setup"
  | "preview_ready"
  | "approved"
  | "deployed"
  | "paused"
  | "expired"
  | "cancelled";

export type DemoSiteBillingStatus =
  | "not_invoiced"
  | "pending"
  | "paid"
  | "overdue"
  | "cancelled";

export interface DemoSitePackage {
  id: DemoSitePackageId;
  name: string;
  shortName: string;
  tagline: string;
  setupFeeNok: number;
  monthlyFeeNok: number;
  maxPages: string;
  recommended?: boolean;
  features: string[];
  salesAngle: string;
}

export const DEMO_SITE_PACKAGES: DemoSitePackage[] = [
  {
    id: "basis",
    name: "Basis – Digital Tilstedeværelse",
    shortName: "Basis",
    tagline: "Ny, pen nettside som fungerer på mobil – uten avansert AI.",
    setupFeeNok: 4_900,
    monthlyFeeNok: 490,
    maxPages: "Opptil 4 undersider",
    features: [
      "Ferdig oppsett av demo-mal",
      "Logo, farger, tekst og bilder byttes for kunden",
      "Hosting, SSL og standard kontaktskjema",
      "Småjusteringer opptil 1 gang per måned",
    ],
    salesAngle:
      "Lav terskel for bedrifter som bare trenger en profesjonell nettside raskt.",
  },
  {
    id: "standard",
    name: "Standard – Lead-Maskinen",
    shortName: "Standard",
    tagline: "Beste selger: nettside + ChatGenius AI-resepsjonist.",
    setupFeeNok: 7_900,
    monthlyFeeNok: 990,
    maxPages: "Opptil 7 undersider",
    recommended: true,
    features: [
      "Alt i Basis-pakken",
      "ChatGenius AI-resepsjonist trent på bedriftens info",
      "Samler inn leads, forespørsler og kontaktinfo",
      "Sender leads videre på e-post/SMS når integrasjon er aktivert",
      "Grunnleggende lokal Google-optimalisering",
    ],
    salesAngle:
      "Hvis én ekstra kunde finner bedriften på Google eller legger igjen nummer i chatten, er pakken raskt tjent inn.",
  },
  {
    id: "premium",
    name: "Premium – Digital Resepsjonist",
    shortName: "Premium",
    tagline: "For bedrifter med mange henvendelser og behov for mer automasjon.",
    setupFeeNok: 14_900,
    monthlyFeeNok: 1_990,
    maxPages: "Ubegrenset antall sider",
    features: [
      "Komplett nettside med utvidet struktur",
      "Avansert ChatGenius-bot med dypere kunnskap",
      "Klargjort for booking, produktinfo, prislister og avtaler",
      "Prioritert support med raske endringer",
    ],
    salesAngle:
      "Gir kunden en digital resepsjonist som svarer etter stengetid og fanger opp henvendelser som ellers forsvinner.",
  },
];

export const DEMO_SITE_EDITABLE_FIELDS = [
  "logo",
  "brand_color",
  "address",
  "contact_info",
  "prices",
  "services",
  "products",
  "hero_text",
  "about_text",
  "section_texts",
  "opening_hours",
  "images",
] as const;

export const DEMO_SITE_TEMPLATE_SEEDS = [
  {
    slug: "elektro",
    name: "Pindsle Elektro",
    category: "trades",
    description: "Håndverker/elektriker-mal med fastpriser, lokale tjenester og AI-chat for jobbforespørsler.",
    repoUrl: "https://github.com/freddybremseth-coder/demosites/blob/main/elektro.html",
    previewUrl: "https://realtyflow.chatgenius.pro/saas/elektro.html",
  },
  {
    slug: "dekk",
    name: "Sandefjord Dekk",
    category: "auto",
    description: "Bil, dekk og verksted-mal med timeforespørsel, reg.nr og sesongbaserte tjenester.",
    repoUrl: "https://github.com/freddybremseth-coder/demosites/blob/main/dekk.html",
    previewUrl: "https://realtyflow.chatgenius.pro/saas/dekk.html",
  },
  {
    slug: "frakt",
    name: "Vestfold Frakt",
    category: "transport",
    description: "Transport/logistikk-mal med fra-til-rute, godstype og tilbudsforespørsel.",
    repoUrl: "https://github.com/freddybremseth-coder/demosites/blob/main/frakt.html",
    previewUrl: "https://realtyflow.chatgenius.pro/saas/frakt.html",
  },
  {
    slug: "renhold",
    name: "Sandefjord Renhold",
    category: "cleaning",
    description: "Renholdsmal for privat og bedrift med areal, frekvens og enkel prisforespørsel.",
    repoUrl: "https://github.com/freddybremseth-coder/demosites/blob/main/renhold.html",
    previewUrl: "https://realtyflow.chatgenius.pro/saas/renhold.html",
  },
  {
    slug: "ai-teknologi",
    name: "Neon AI Studio",
    category: "technology",
    description: "AI- og teknologimal med neon glass, automatisering, pilotløp og tydelig demo-/workshop-forespørsel.",
    repoUrl: "https://github.com/freddybremseth-coder/demosites",
    previewUrl: "https://realtyflow.chatgenius.pro/saas?template=ai-teknologi",
  },
];

export type DemoSiteFaqItem = {
  question: string;
  answer: string;
};

export interface DemoSiteTemplateDefaults {
  template_slug: string;
  template_name: string;
  hero_title: string;
  hero_subtitle: string;
  intro_text: string;
  services: string[];
  products: string[];
  prices: string[];
  trust_points: string[];
  faq: DemoSiteFaqItem[];
  call_to_action: string;
  contact_text: string;
  brand_color: string;
  secondary_color: string;
  accent_color: string;
  suggested_sections: string[];
  gallery_images: string[];
}

type DemoSiteTemplateDefaultBase = Omit<DemoSiteTemplateDefaults, "template_slug">;

const DEFAULT_COMPANY_NAME = "Bedriften";
const GENERIC_TEMPLATE_SLUG = "local-service";

const GENERIC_SERVICE_GALLERY_IMAGES = [
  "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=1200&q=80",
];

const DEMO_SITE_TEMPLATE_ALIASES: Record<string, string> = {
  "restaurant-cafe": "restaurant",
  cafe: "kafe",
  "real-estate-agent": "eiendomsmegler",
  "estate-agent": "eiendomsmegler",
  realtor: "eiendomsmegler",
  "beauty-clinic": "klinikk",
  beauty: "klinikk",
  skjonnhet: "klinikk",
  "skjonnhet-klinikk": "klinikk",
  overnatting: "hotell",
  "hotell-overnatting": "hotell",
  anlegg: "bygg",
  "bygg-anlegg": "bygg",
  ai: "ai-teknologi",
  "ai-tech": "ai-teknologi",
  teknologi: "ai-teknologi",
  teknobedrift: "ai-teknologi",
  tech: "ai-teknologi",
  software: "ai-teknologi",
  saas: "ai-teknologi",
  automasjon: "ai-teknologi",
};

function normalizeDemoSiteTemplateSlug(value: string | null | undefined) {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return DEMO_SITE_TEMPLATE_ALIASES[slug] || slug;
}

const DEMO_SITE_TEMPLATE_DEFAULTS: Record<string, DemoSiteTemplateDefaultBase> = {
  "local-service": {
    template_name: "Lokal servicebedrift",
    hero_title: "{companyName} hjelper lokale kunder raskt videre",
    hero_subtitle: "Profesjonell nettside med tydelige tjenester, enkel kontakt, tilbudsforespørsel og ChatGenius-assistent.",
    intro_text:
      "{companyName} kan vise frem tjenester, priser, kontaktinfo og kundeløfter på en ryddig nettside som gjør det enkelt å be om hjelp eller tilbud.",
    services: [
      "Tjenester for lokale privat- og bedriftskunder",
      "Behovsavklaring og anbefalt neste steg",
      "Tilbud på oppdrag, avtaler eller faste leveranser",
      "Rask kontakt via skjema, telefon eller e-post",
      "Oppfølging fra første forespørsel til levert jobb",
      "ChatGenius-assistent som fanger opp spørsmål etter stengetid",
    ],
    products: [
      "Nettside med tydelig tjenesteoversikt",
      "Kontaktskjema og tilbudsforespørsel",
      "ChatGenius-assistent for vanlige spørsmål",
      "Lokal profil med bilder, priser og trygghetspunkter",
    ],
    prices: [
      "Gratis første vurdering av forespørsel",
      "Pris etter behov, omfang og ønsket levering",
      "Fast tilbud kan gis før oppstart",
      "Serviceavtale kan avtales for gjentakende behov",
    ],
    trust_points: [
      "Tydelig kommunikasjon før kunden bestemmer seg",
      "Oversiktlige tjenester og forventninger",
      "Lokalt tilgjengelig kontaktpunkt",
      "Profesjonell nettside og ChatGenius-assistent som svarer raskt",
    ],
    faq: [
      {
        question: "Hvordan ber jeg om tilbud?",
        answer: "Send en kort beskrivelse av behovet ditt, så tar bedriften kontakt med forslag til neste steg.",
      },
      {
        question: "Kan jeg stille spørsmål før jeg bestemmer meg?",
        answer: "Ja. Nettsiden og ChatGenius-assistenten gjør det enkelt å få svar før du sender en forespørsel.",
      },
      {
        question: "Hva bør jeg oppgi i kontaktskjemaet?",
        answer: "Beskriv hva du trenger hjelp med, ønsket tidspunkt og hvordan du vil bli kontaktet.",
      },
    ],
    call_to_action: "Be om tilbud",
    contact_text: "Fortell kort hva du trenger hjelp med, så følger {companyName} opp med kontakt, pris eller anbefalt neste steg.",
    brand_color: "#2563eb",
    secondary_color: "#0f172a",
    accent_color: "#22c55e",
    suggested_sections: ["Hero", "Tjenester", "Tilbud", "Priser", "Trygghet", "FAQ", "Kontakt", "ChatGenius"],
    gallery_images: GENERIC_SERVICE_GALLERY_IMAGES,
  },
  "ai-teknologi": {
    template_name: "AI og teknologi",
    hero_title: "{companyName} bygger smartere digitale arbeidsflyter",
    hero_subtitle: "AI-agenter, automasjon, integrasjoner og dataløsninger som gjør teamet raskere, tryggere og mer skalerbart.",
    intro_text:
      "{companyName} kan presentere AI-løsninger, teknologi, pilotløp og rådgivning på en moderne side som gjør det lett å booke workshop, se demo eller starte en kontrollert pilot.",
    services: [
      "AI-agenter for kundeservice, salg og interne prosesser",
      "Automatisering av manuelle arbeidsflyter",
      "API-integrasjoner mellom CRM, nettside og fagsystemer",
      "Dataplattform, dashboards og innsikt for ledelsen",
      "Prototype, MVP og pilotlansering på få uker",
      "Sikkerhetsvurdering, GDPR og praktisk AI-governance",
    ],
    products: [
      "AI-workshop for ledergruppe eller team",
      "Pilotpakke for automatisering",
      "Integrasjonspakke for CRM og nettside",
      "Drift, videreutvikling og teknisk sparring",
    ],
    prices: [
      "AI-workshop fra kr 12 900",
      "Pilotprosjekt prises etter scope og datagrunnlag",
      "Integrasjoner prises etter systemer og kompleksitet",
      "Fast rådgivningsavtale kan avtales for videre utvikling",
    ],
    trust_points: [
      "Starter med avgrenset pilot før større investering",
      "Tydelig kartlegging av risiko, data og ansvar",
      "Integrasjoner bygges rundt eksisterende arbeidsflyt",
      "Måling av effekt før løsningen skaleres videre",
    ],
    faq: [
      {
        question: "Hvordan starter vi med AI uten å ta for stor risiko?",
        answer: "Begynn med en workshop og en avgrenset pilot. Da kan verdi, data og sikkerhet vurderes før dere skalerer.",
      },
      {
        question: "Kan løsningen kobles til systemene vi allerede bruker?",
        answer: "Ja. Integrasjoner mot CRM, nettside, skjemaer og fagsystemer kan planlegges etter behov og tilgang.",
      },
      {
        question: "Hva bør vi ha klart før en AI-workshop?",
        answer: "Ta med mål, eksempler på manuelle prosesser og spørsmål rundt data, sikkerhet og ønsket effekt.",
      },
    ],
    call_to_action: "Book AI-workshop",
    contact_text: "Fortell kort hvilken prosess, dataflyt eller kundeopplevelse dere vil forbedre, så kan {companyName} foreslå riktig workshop, demo eller pilot.",
    brand_color: "#22d3ee",
    secondary_color: "#020617",
    accent_color: "#a78bfa",
    suggested_sections: ["Hero", "AI-tjenester", "Pilot", "Integrasjoner", "Priser", "Trygghet", "FAQ", "Kontakt", "ChatGenius"],
    gallery_images: [
      "https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1200&q=80",
    ],
  },
  elektro: {
    template_name: "Pindsle Elektro",
    hero_title: "{companyName} fikser strømmen trygt og raskt",
    hero_subtitle: "Lokale elektrikere for service, feilsøking, elbillader, belysning og småjobber hjemme eller på jobb.",
    intro_text:
      "{companyName} gjør det enkelt å bestille elektriker. Kundene får tydelig oversikt over tjenester, raske svar og en trygg vei til befaring eller pristilbud.",
    services: [
      "Feilsøking og reparasjon av elektriske feil",
      "Montering av elbillader og nye kurser",
      "Belysning, stikkontakter og smarte løsninger",
      "El-sjekk, internkontroll og dokumentasjon",
      "Akutte småjobber for bolig og næring",
      "Oppgradering av sikringsskap",
    ],
    products: [
      "Elbillader med montering",
      "LED-belysning inne og ute",
      "Smarte termostater og styring",
      "Sikringsskap og jordfeilautomater",
    ],
    prices: [
      "Gratis vurdering av forespørsel",
      "Serviceoppdrag fra kr 1 490",
      "Elbillader-pakke etter befaring",
      "Fastpris kan avtales før arbeidet starter",
    ],
    trust_points: [
      "Autorisert elektriker med dokumentert arbeid",
      "Ryddig kommunikasjon fra første henvendelse",
      "Tydelige priser og anbefalinger før oppstart",
      "Lokalkjent team med kort responstid",
    ],
    faq: [
      {
        question: "Kan jeg få pris før elektrikeren kommer?",
        answer: "Ja. Beskriv jobben kort, så får du et estimat eller forslag om befaring før arbeid avtales.",
      },
      {
        question: "Hjelper dere med småjobber?",
        answer: "Ja, småjobber som stikkontakter, lamper, termostater og feilsøking er typiske oppdrag.",
      },
      {
        question: "Får jeg dokumentasjon etterpå?",
        answer: "Arbeid som krever dokumentasjon leveres med nødvendig samsvarserklæring og relevant underlag.",
      },
    ],
    call_to_action: "Be om elektriker",
    contact_text: "Send en kort beskrivelse av jobben, så tar {companyName} kontakt med forslag til neste steg.",
    brand_color: "#eab308",
    secondary_color: "#111827",
    accent_color: "#facc15",
    suggested_sections: ["Hero", "Tjenester", "Elbillader", "Priser", "Trygghet", "FAQ", "Kontakt", "ChatGenius"],
    gallery_images: [
      "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1544724569-5f546fd6f2b5?auto=format&fit=crop&w=1200&q=80",
    ],
  },
  dekk: {
    template_name: "Sandefjord Dekk",
    hero_title: "{companyName} gjør bilen klar for sesongen",
    hero_subtitle: "Dekkskift, hjulhotell, dekkpakker og enkel timeforespørsel for travle bileiere.",
    intro_text:
      "{companyName} kan presentere dekk, felg, verkstedtjenester og sesongkampanjer på en side som gjør det lett å bestille tid.",
    services: [
      "Dekkskift med enkel timebestilling",
      "Hjulhotell med vask og kontroll",
      "Salg av sommerdekk, vinterdekk og helårsdekk",
      "Balansering, omlegging og punkteringsreparasjon",
      "Bremse- og sikkerhetssjekk ved behov",
      "Råd om mønsterdybde og riktig dekkvalg",
    ],
    products: [
      "Sommerdekk fra kjente merker",
      "Vinterdekk og piggfrie alternativer",
      "Felgpakker tilpasset bilmodell",
      "Hjulhotell for privat og firmabiler",
    ],
    prices: [
      "Dekkskift fra kr 599",
      "Hjulhotell fra kr 1 490 per sesong",
      "Omlegging og balansering etter dimensjon",
      "Dekkpakker prises etter bil og behov",
    ],
    trust_points: [
      "Rask sesongflyt med tydelige ledige tider",
      "Kontroll av mønsterdybde og synlig slitasje",
      "Trygg lagring på hjulhotell",
      "Kunden får råd før nye dekk kjøpes",
    ],
    faq: [
      {
        question: "Når bør jeg bytte dekk?",
        answer: "Bestill tid før sesongtoppen. Da får du bedre kapasitet og kan kontrollere dekkene i god tid.",
      },
      {
        question: "Kan dere lagre hjulene mine?",
        answer: "Ja, hjulhotell kan inkludere lagring, vask og kontroll av dekkene mellom sesongene.",
      },
      {
        question: "Kan jeg få forslag til riktige dekk?",
        answer: "Ja. Oppgi bilmodell eller registreringsnummer, så kan riktig dimensjon og alternativ foreslås.",
      },
    ],
    call_to_action: "Bestill dekktime",
    contact_text: "Legg igjen bilmodell eller registreringsnummer, så hjelper {companyName} deg med riktig tid og dekkvalg.",
    brand_color: "#dc2626",
    secondary_color: "#111827",
    accent_color: "#f97316",
    suggested_sections: ["Hero", "Dekkskift", "Hjulhotell", "Dekkpakker", "Priser", "FAQ", "Kontakt", "ChatGenius"],
    gallery_images: [
      "https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1517524008697-84bbe3c3fd98?auto=format&fit=crop&w=1200&q=80",
    ],
  },
  frakt: {
    template_name: "Vestfold Frakt",
    hero_title: "{companyName} flytter varer dit de skal",
    hero_subtitle: "Transport, bud, distribusjon og tilbudsforespørsel for lokale bedrifter som trenger presis levering.",
    intro_text:
      "{companyName} kan samle ruter, godstyper, kapasitet og kontakt i en tydelig landingsside som gjør tilbudsforespørsler enklere å håndtere.",
    services: [
      "Lokal og regional varetransport",
      "Budkjøring med avtalt hentetid",
      "Distribusjon for butikker og nettbutikker",
      "Flytting av mindre gods og utstyr",
      "Fast ruteavtale for bedrifter",
      "Tilbud basert på fra-til, volum og tidsvindu",
    ],
    products: [
      "Ekspressbud samme dag",
      "Fast ukentlig distribusjon",
      "Pall, pakker og smågods",
      "Bedriftsavtale med prioritet",
    ],
    prices: [
      "Pris beregnes etter rute og volum",
      "Bud lokalt fra kr 690",
      "Fast avtale gir forutsigbar månedspris",
      "Tilbud sendes etter kort behovsavklaring",
    ],
    trust_points: [
      "Tydelig avklaring av hentested, levering og frist",
      "Erfarne sjåfører med lokalkunnskap",
      "Mulighet for faste ruter og gjentakende oppdrag",
      "Ryddig kommunikasjon når levering haster",
    ],
    faq: [
      {
        question: "Hva trenger dere for å gi pris?",
        answer: "Fra-adresse, til-adresse, størrelse/vekt, ønsket tidspunkt og eventuelle bærehjelp-behov.",
      },
      {
        question: "Tar dere hasteoppdrag?",
        answer: "Ja, hvis kapasiteten er ledig kan ekspressbud eller samme-dag levering avtales.",
      },
      {
        question: "Kan bedrifter få fast avtale?",
        answer: "Ja. Faste ruter og gjentakende transport kan settes opp med egen pris og prioritet.",
      },
    ],
    call_to_action: "Få frakttilbud",
    contact_text: "Send fra-til, godstype og ønsket tidspunkt, så kommer {companyName} raskt tilbake med forslag.",
    brand_color: "#2563eb",
    secondary_color: "#172554",
    accent_color: "#38bdf8",
    suggested_sections: ["Hero", "Transporttjenester", "Ruter", "Pakker", "Priser", "FAQ", "Kontakt", "ChatGenius"],
    gallery_images: [
      "https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1494412651409-8963ce7935a7?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1200&q=80",
    ],
  },
  renhold: {
    template_name: "Sandefjord Renhold",
    hero_title: "{companyName} leverer renhold du merker",
    hero_subtitle: "Renhold for hjem, kontor, flyttevask og faste avtaler med enkel prisforespørsel.",
    intro_text:
      "{companyName} kan vise tjenester, frekvens, kvalitet og kontakt på en side som gjør det lett å be om pris uten lange skjemaer.",
    services: [
      "Fast kontorrenhold for små og mellomstore bedrifter",
      "Privat renhold ukentlig eller annenhver uke",
      "Flyttevask med tydelig sjekkliste",
      "Trappevask og fellesarealer",
      "Hovedrengjøring og sesongvask",
      "Skreddersydd renholdsplan etter areal",
    ],
    products: [
      "Fast renholdsavtale",
      "Flyttevask-pakke",
      "Kontorrenhold med kvalitetsrunde",
      "Ekstra hovedvask ved behov",
    ],
    prices: [
      "Pris etter areal, frekvens og oppgaver",
      "Privat renhold fra kr 490 per time",
      "Flyttevask prises etter størrelse",
      "Fast avtale gir forutsigbar månedspris",
    ],
    trust_points: [
      "Tydelig renholdsplan før oppstart",
      "Faste kontaktpunkter og ryddig oppfølging",
      "Fleksibel frekvens for hjem og bedrift",
      "Kvalitetssjekk og enkel endring av avtale",
    ],
    faq: [
      {
        question: "Hvordan får jeg riktig pris?",
        answer: "Oppgi areal, type lokale, ønsket frekvens og spesielle behov. Da kan prisen vurderes raskt.",
      },
      {
        question: "Tilbyr dere faste avtaler?",
        answer: "Ja, både private og bedrifter kan få fast renholdsplan med avtalt frekvens.",
      },
      {
        question: "Kan jeg bestille flyttevask?",
        answer: "Ja. Flyttevask kan prises etter størrelse, tilstand og ønsket tidspunkt.",
      },
    ],
    call_to_action: "Be om renholdspris",
    contact_text: "Fortell kort om areal, frekvens og type renhold, så følger {companyName} opp med prisforslag.",
    brand_color: "#0d9488",
    secondary_color: "#134e4a",
    accent_color: "#22c55e",
    suggested_sections: ["Hero", "Renholdstjenester", "Avtaler", "Priser", "Trygghet", "FAQ", "Kontakt", "ChatGenius"],
    gallery_images: [
      "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=1200&q=80",
    ],
  },
  restaurant: {
    template_name: "Restaurant",
    hero_title: "{companyName} serverer gode opplevelser rundt bordet",
    hero_subtitle: "Meny, åpningstider, selskaper, bordforespørsel og enkel kontakt samlet på en appetittlig nettside.",
    intro_text:
      "{companyName} kan vise frem meny, atmosfære, bordforespørsel og dagens tilbud på en side som gjør det lett å velge stedet før besøket.",
    services: [
      "Lunsj, middag og sesongbaserte retter",
      "Bordforespørsel for små og større grupper",
      "Selskaper, møter og private arrangementer",
      "Takeaway eller catering når det tilbys",
      "Dagens meny og aktuelle kampanjer",
    ],
    products: [
      "A la carte-meny",
      "Dagens rett og ukens anbefaling",
      "Selskapsmeny for grupper",
      "Drikke og dessertutvalg",
    ],
    prices: [
      "Lunsjretter fra kr 189",
      "Middagsretter fra kr 269",
      "Selskapsmeny prises per person",
      "Tilbud tilpasses gruppe, dato og behov",
    ],
    trust_points: [
      "Tydelig meny og åpningstider",
      "Enkel bord- og selskapsforespørsel",
      "Rask oppfølging fra restaurantteamet",
      "ChatGenius kan svare på vanlige spørsmål etter stengetid",
    ],
    faq: [
      {
        question: "Kan jeg sende bordforespørsel?",
        answer: "Ja. Oppgi dato, tidspunkt og antall personer, så kan restauranten bekrefte kapasitet.",
      },
      {
        question: "Tar dere imot selskaper?",
        answer: "Ja, selskaper og grupper kan få forslag til meny, tidspunkt og praktisk oppsett.",
      },
      {
        question: "Hvor finner jeg meny og åpningstider?",
        answer: "Meny, åpningstider og kontaktinfo kan ligge samlet på nettsiden og i ChatGenius-assistenten.",
      },
    ],
    call_to_action: "Send bordforespørsel",
    contact_text: "Fortell dato, tidspunkt og antall gjester, så følger {companyName} opp med ledighet og forslag.",
    brand_color: "#b45309",
    secondary_color: "#1f2937",
    accent_color: "#f59e0b",
    suggested_sections: ["Hero", "Meny", "Selskaper", "Dagens tilbud", "Priser", "FAQ", "Kontakt", "ChatGenius"],
    gallery_images: [
      "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1200&q=80",
    ],
  },
  frisor: {
    template_name: "Frisor",
    hero_title: "{companyName} gir deg en frisyre som passer hverdagen",
    hero_subtitle: "Klipp, farge, styling, behandlinger og enkel timeforespørsel for nye og faste kunder.",
    intro_text:
      "{companyName} kan presentere salongen, behandlinger, priser og ledige timer på en nettside som gjør booking enklere.",
    services: ["Dame- og herreklipp", "Farge, striping og glossing", "Styling til hverdag og anledning", "Barneklipp og raske oppfriskninger", "Veiledning om hårpleie"],
    products: ["Klippetime", "Fargebehandling", "Kur og pleieprodukter", "Stylingtime"],
    prices: ["Klipp fra kr 590", "Farge fra kr 1 390", "Kur og styling etter behov", "Endelig pris avklares før behandling"],
    trust_points: ["Erfarne frisører og personlig veiledning", "Tydelige priser før oppstart", "Enkel timeforespørsel på mobil", "Mulighet for svar på vanlige spørsmål via ChatGenius"],
    faq: [
      { question: "Kan jeg spørre om riktig behandling først?", answer: "Ja. Beskriv håret og ønsket resultat, så kan salongen anbefale riktig time." },
      { question: "Hvor lang tid tar en fargetime?", answer: "Det avhenger av hårlengde og ønsket resultat. Salongen kan gi estimat før booking." },
    ],
    call_to_action: "Book frisortime",
    contact_text: "Send ønsket behandling, tidspunkt og gjerne bilde eller kort beskrivelse, så tar {companyName} kontakt.",
    brand_color: "#be185d",
    secondary_color: "#4a044e",
    accent_color: "#f9a8d4",
    suggested_sections: ["Hero", "Behandlinger", "Priser", "Salong", "Trygghet", "FAQ", "Kontakt", "ChatGenius"],
    gallery_images: [
      "https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1522337660859-02fbefca4702?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1580618672591-eb180b1a973f?auto=format&fit=crop&w=1200&q=80",
    ],
  },
  tannlege: {
    template_name: "Tannlege",
    hero_title: "{companyName} gjør tannlegebesøket tryggere og enklere",
    hero_subtitle: "Undersøkelse, akutt hjelp, tannrens, estetikk og timeforespørsel med rolig og tydelig informasjon.",
    intro_text:
      "{companyName} kan samle behandlinger, priser, akuttkontakt og pasientinformasjon på en nettside som skaper tillit før timen.",
    services: ["Tannundersøkelse og røntgen", "Tannrens og forebyggende behandling", "Akutt tannhjelp ved smerter", "Fyllinger, kroner og estetiske behandlinger", "Råd for tannhelse hjemme"],
    products: ["Førstegangsundersøkelse", "Tannrens", "Akuttime", "Estetisk konsultasjon"],
    prices: ["Undersøkelse fra kr 990", "Tannrens prises etter behov", "Akutt vurdering etter kapasitet", "Behandlingsplan gis før større arbeid"],
    trust_points: ["Rolig forklaring før behandling", "Tydelig prisoversikt og behandlingsplan", "Enkel akuttkontakt", "Pasientvennlig informasjon på mobil"],
    faq: [
      { question: "Kan jeg be om akuttime?", answer: "Ja. Beskriv smerter eller problem kort, så vurderer klinikken ledig kapasitet." },
      { question: "Får jeg pris før behandling?", answer: "Ved større behandling får du plan og prisoverslag før arbeidet starter." },
    ],
    call_to_action: "Bestill tannlegetime",
    contact_text: "Fortell hva du trenger hjelp med, så tar {companyName} kontakt med forslag til time eller neste steg.",
    brand_color: "#0891b2",
    secondary_color: "#164e63",
    accent_color: "#67e8f9",
    suggested_sections: ["Hero", "Behandlinger", "Akutt hjelp", "Priser", "Trygghet", "FAQ", "Kontakt", "ChatGenius"],
    gallery_images: GENERIC_SERVICE_GALLERY_IMAGES,
  },
  bilverksted: {
    template_name: "Bilverksted",
    hero_title: "{companyName} holder bilen trygg og klar",
    hero_subtitle: "Service, reparasjon, EU-kontroll, feilsok og timeforespørsel for bileiere som vil ha oversikt.",
    intro_text:
      "{companyName} kan vise tjenester, priser, kampanjer og verkstedkontakt på en nettside som gjør det enkelt å bestille tid.",
    services: ["Service og oljeskift", "EU-kontroll og etterkontroll", "Bremser, understell og slitedeler", "Feilsok og verksteddiagnose", "Dekk, hjul og sesongklargjøring"],
    products: ["Servicepakke", "EU-kontroll", "Bremsekontroll", "Sesongsjekk"],
    prices: ["Service fra kr 1 990", "EU-kontroll etter gjeldende pris", "Feilsok prises etter tid", "Fastpris kan gis etter vurdering"],
    trust_points: ["Tydelig avtale før arbeidet starter", "Forklaring av funn og anbefalinger", "Enkel timeforespørsel med bilinfo", "Ryddig oppfølging fra verkstedet"],
    faq: [
      { question: "Hva bør jeg oppgi når jeg bestiller?", answer: "Oppgi bilmodell, registreringsnummer, kilometerstand og hva du trenger hjelp med." },
      { question: "Kan dere gi pris før reparasjon?", answer: "Ja, etter en vurdering kan verkstedet gi pris eller anbefalt neste steg." },
    ],
    call_to_action: "Bestill verkstedtime",
    contact_text: "Send bilmodell, registreringsnummer og ønsket hjelp, så følger {companyName} opp med tid eller prisforslag.",
    brand_color: "#ea580c",
    secondary_color: "#1c1917",
    accent_color: "#facc15",
    suggested_sections: ["Hero", "Verkstedtjenester", "Service", "Priser", "Trygghet", "FAQ", "Kontakt", "ChatGenius"],
    gallery_images: GENERIC_SERVICE_GALLERY_IMAGES,
  },
  rorlegger: {
    template_name: "Rorlegger",
    hero_title: "{companyName} hjelper når vann, varme og bad må fungere",
    hero_subtitle: "Service, lekkasjer, bad, varmtvann, befaring og tilbudsforespørsel for private og bedrifter.",
    intro_text:
      "{companyName} kan presentere rørleggertjenester, hastehjelp, prosjekter og kontakt på en nettside som gjør veien til hjelp kort.",
    services: ["Lekkasje, service og reparasjoner", "Bad, vaskerom og oppgradering", "Varmtvannsbereder og sanitærutstyr", "Rørinspeksjon og rådgivning", "Befaring og tilbud på prosjekt"],
    products: ["Servicebesøk", "Baderomsprosjekt", "Varmtvannsbereder", "Vedlikeholdsavtale"],
    prices: ["Serviceoppdrag fra kr 1 690", "Befaring etter avtale", "Prosjekt prises etter omfang", "Fastpris kan avtales før oppstart"],
    trust_points: ["Rask respons ved praktiske problemer", "Tydelig forklaring av anbefalt løsning", "Ryddig tilbud før større arbeid", "Lokalkjent fagperson med relevant erfaring"],
    faq: [
      { question: "Kan jeg be om befaring?", answer: "Ja. Beskriv behovet og legg gjerne ved bilder, så kan rørleggeren foreslå befaring." },
      { question: "Hva gjør jeg ved lekkasje?", answer: "Steng vannet hvis mulig og kontakt fagperson raskt med adresse og kort beskrivelse." },
    ],
    call_to_action: "Be om rorleggerhjelp",
    contact_text: "Send kort hva saken gjelder, adresseområde og bilder ved behov, så tar {companyName} kontakt.",
    brand_color: "#0284c7",
    secondary_color: "#0f172a",
    accent_color: "#38bdf8",
    suggested_sections: ["Hero", "Rorleggertjenester", "Bad", "Service", "Priser", "FAQ", "Kontakt", "ChatGenius"],
    gallery_images: GENERIC_SERVICE_GALLERY_IMAGES,
  },
  snekker: {
    template_name: "Snekker",
    hero_title: "{companyName} bygger, reparerer og tilpasser med presisjon",
    hero_subtitle: "Snekkerarbeid, terrasser, innredning, vedlikehold og befaring med tydelige tilbud.",
    intro_text:
      "{companyName} kan vise referanser, tjenester, prosess og kontakt på en nettside som gjør det enkelt å starte et prosjekt.",
    services: ["Terrasse, levegg og uteprosjekter", "Innvendig tilpasning og listverk", "Reparasjon, vedlikehold og småjobber", "Dører, gulv og enkel ombygging", "Befaring og prosjektplan"],
    products: ["Befaringstime", "Terrasseprosjekt", "Innvendig oppgradering", "Vedlikeholdspakke"],
    prices: ["Befaring etter avtale", "Timearbeid eller fastpris etter oppdrag", "Materialer avklares før oppstart", "Tilbud sendes etter behovsavklaring"],
    trust_points: ["Ryddig prosess fra befaring til levering", "Tydelig avtale om materialer og omfang", "Praktiske råd før kunden bestemmer seg", "Lokal oppfølging og god kommunikasjon"],
    faq: [
      { question: "Tar dere småjobber?", answer: "Ja, mindre reparasjoner og tilpasninger kan ofte løses som egne oppdrag." },
      { question: "Kan jeg få fastpris?", answer: "Ja, når omfanget er tydelig kan bedriften gi fastpris eller ramme for arbeidet." },
    ],
    call_to_action: "Be om befaring",
    contact_text: "Beskriv prosjektet kort og legg gjerne ved bilder, så følger {companyName} opp med forslag.",
    brand_color: "#92400e",
    secondary_color: "#1c1917",
    accent_color: "#fbbf24",
    suggested_sections: ["Hero", "Snekkerarbeid", "Prosjekter", "Priser", "Referanser", "FAQ", "Kontakt", "ChatGenius"],
    gallery_images: GENERIC_SERVICE_GALLERY_IMAGES,
  },
  eiendomsmegler: {
    template_name: "Eiendomsmegler",
    hero_title: "{companyName} hjelper deg trygt gjennom boligvalget",
    hero_subtitle: "Verdivurdering, salg, kjøpsrådgivning, områdekunnskap og leadfangst for boliginteresserte.",
    intro_text:
      "{companyName} kan presentere profil, områder, tjenester og kontaktskjema på en side som bygger tillit før første samtale.",
    services: ["Verdivurdering og salgsvurdering", "Boligsalg fra plan til overtakelse", "Kjøpsrådgivning og områdeinnsikt", "Oppfølging av interessenter", "Rådgivning før visning eller budrunde"],
    products: ["Gratis verdivurdering", "Salgspakke", "Kjøperrådgivning", "Områdeguide"],
    prices: ["Verdivurdering kan tilbys gratis", "Salgshonorar avtales per oppdrag", "Rådgivning prises etter behov", "Tilbud gis etter første samtale"],
    trust_points: ["Tydelig prosess og forventningsavklaring", "Lokal markedskunnskap", "Rask oppfølging av nye henvendelser", "ChatGenius kan kvalifisere boligbehov"],
    faq: [
      { question: "Kan jeg be om verdivurdering?", answer: "Ja. Legg igjen boligtype, område og kontaktinfo, så kan megleren følge opp." },
      { question: "Hjelper dere kjøpere også?", answer: "Ja, rådgivning kan tilpasses både salg, kjøp og områdevalg." },
    ],
    call_to_action: "Book boligsamtale",
    contact_text: "Fortell om bolig, område eller planene dine, så tar {companyName} kontakt med forslag til neste steg.",
    brand_color: "#0f766e",
    secondary_color: "#0f172a",
    accent_color: "#14b8a6",
    suggested_sections: ["Hero", "Tjenester", "Områder", "Verdivurdering", "Trygghet", "FAQ", "Kontakt", "ChatGenius"],
    gallery_images: GENERIC_SERVICE_GALLERY_IMAGES,
  },
  advokat: {
    template_name: "Advokat",
    hero_title: "{companyName} gir tydelig juridisk hjelp når valgene betyr mye",
    hero_subtitle: "Rådgivning, kontrakter, tvister, familie, eiendom og første kontakt med trygg forventningsavklaring.",
    intro_text:
      "{companyName} kan vise fagområder, prosess, kontakt og vanlige spørsmål på en nettside som gjør terskelen lavere.",
    services: ["Juridisk rådgivning og vurdering", "Kontrakter og avtalegjennomgang", "Eiendom, arv eller familie etter fagområde", "Tvister og forhandlinger", "Første avklaring av sak og behov"],
    products: ["Innledende samtale", "Dokumentgjennomgang", "Rådgivningspakke", "Saksoppfølging"],
    prices: ["Første vurdering etter avtale", "Timepris eller fastpris der saken passer", "Pris avklares før oppdrag", "Rettshjelp vurderes ved relevante saker"],
    trust_points: ["Konfidensiell og ryddig dialog", "Tydelig avklaring av sak og risiko", "Praktiske råd før neste steg", "Profesjonell presentasjon av fagområder"],
    faq: [
      { question: "Hva bør jeg sende inn først?", answer: "Skriv kort hva saken gjelder, frister og hvilke dokumenter som finnes." },
      { question: "Får jeg vite pris før oppdrag?", answer: "Ja, advokaten kan avklare timepris, ramme eller fastpris før oppdraget starter." },
    ],
    call_to_action: "Be om juridisk vurdering",
    contact_text: "Beskriv saken kort og legg ved frister hvis relevant, så følger {companyName} opp konfidensielt.",
    brand_color: "#4338ca",
    secondary_color: "#111827",
    accent_color: "#a5b4fc",
    suggested_sections: ["Hero", "Fagområder", "Prosess", "Priser", "Trygghet", "FAQ", "Kontakt", "ChatGenius"],
    gallery_images: GENERIC_SERVICE_GALLERY_IMAGES,
  },
  fysioterapi: {
    template_name: "Fysioterapi",
    hero_title: "{companyName} hjelper kroppen tilbake i bedre flyt",
    hero_subtitle: "Undersøkelse, behandling, trening, rehabilitering og enkel timeforespørsel for nye pasienter.",
    intro_text:
      "{companyName} kan vise behandlinger, kompetanse, priser og praktisk info på en side som gjør det enkelt å ta kontakt.",
    services: ["Undersøkelse og behandlingsplan", "Manuell behandling og øvelser", "Rehabilitering etter skade", "Idrettsrelaterte plager", "Forebyggende trening og veiledning"],
    products: ["Førstegangskonsultasjon", "Oppfølgingstime", "Treningsprogram", "Rehabiliteringsløp"],
    prices: ["Førstegangstime fra kr 790", "Oppfølging fra kr 620", "Pakker etter behandlingsplan", "Pris avklares ved booking"],
    trust_points: ["Tydelig plan etter første vurdering", "Praktiske øvelser kunden kan følge", "Enkel booking og oppfølging", "Trygg informasjon før første time"],
    faq: [
      { question: "Trenger jeg henvisning?", answer: "Det kommer an på avtaleform og behandling. Klinikken kan forklare hva som gjelder." },
      { question: "Hva bør jeg ta med?", answer: "Ta med relevant informasjon om plagen, tidligere behandling og klær du kan bevege deg i." },
    ],
    call_to_action: "Book fysiotime",
    contact_text: "Fortell kort om plagen og ønsket tidspunkt, så tar {companyName} kontakt med forslag til time.",
    brand_color: "#16a34a",
    secondary_color: "#14532d",
    accent_color: "#86efac",
    suggested_sections: ["Hero", "Behandlinger", "Rehabilitering", "Priser", "Trygghet", "FAQ", "Kontakt", "ChatGenius"],
    gallery_images: GENERIC_SERVICE_GALLERY_IMAGES,
  },
  klinikk: {
    template_name: "Skjonnhet og klinikk",
    hero_title: "{companyName} tilbyr behandlinger med ro, kvalitet og trygghet",
    hero_subtitle: "Behandlinger, konsultasjon, priser, før- og etterinformasjon og enkel bookingforespørsel.",
    intro_text:
      "{companyName} kan presentere behandlinger, resultater, trygghet og kontakt på en nettside som hjelper kunden å velge riktig.",
    services: ["Hudpleie og konsultasjon", "Velvære- og skjønnhetsbehandlinger", "Behandlingsplan etter behov", "Produktveiledning og oppfølging", "Booking og spørsmål før time"],
    products: ["Konsultasjon", "Hudpleiebehandling", "Behandlingspakke", "Produktanbefaling"],
    prices: ["Konsultasjon fra kr 490", "Behandling fra kr 990", "Pakker prises etter behov", "Endelig pris avklares før behandling"],
    trust_points: ["Trygg forklaring før behandling", "Tydelige priser og forventninger", "Rolig kundereise fra spørsmål til booking", "Profesjonell presentasjon av behandlinger"],
    faq: [
      { question: "Kan jeg få råd før jeg booker?", answer: "Ja. Beskriv hva du ønsker hjelp med, så kan klinikken anbefale riktig behandling." },
      { question: "Når får jeg pris?", answer: "Pris kan avklares før behandling basert på ønsket resultat og behov." },
    ],
    call_to_action: "Book konsultasjon",
    contact_text: "Fortell hva du ønsker hjelp med, så følger {companyName} opp med anbefaling og ledig tid.",
    brand_color: "#db2777",
    secondary_color: "#4c0519",
    accent_color: "#fbcfe8",
    suggested_sections: ["Hero", "Behandlinger", "Priser", "Trygghet", "Resultater", "FAQ", "Kontakt", "ChatGenius"],
    gallery_images: GENERIC_SERVICE_GALLERY_IMAGES,
  },
  hotell: {
    template_name: "Hotell og overnatting",
    hero_title: "{companyName} gir gjestene et godt sted å lande",
    hero_subtitle: "Rom, fasiliteter, opphold, møter, lokale opplevelser og enkel forespørsel om tilgjengelighet.",
    intro_text:
      "{companyName} kan vise rom, stemning, fasiliteter og kontakt på en nettside som gjør det lettere å velge overnatting.",
    services: ["Rom og overnatting", "Frokost og fasiliteter", "Møte- eller selskapsforespørsel", "Lokale tips og opplevelser", "Direkte kontakt om tilgjengelighet"],
    products: ["Standardrom", "Familierom", "Møtepakke", "Weekendopphold"],
    prices: ["Rom fra kr 1 190 per natt", "Frokost kan inkluderes", "Gruppepris etter dato og behov", "Tilbud sendes ved forespørsel"],
    trust_points: ["Tydelige rom- og fasilitetsbeskrivelser", "Enkel forespørsel før booking", "Rask oppfølging av grupper og møter", "ChatGenius kan svare på vanlige gjestespørsmål"],
    faq: [
      { question: "Kan jeg spørre om ledige rom?", answer: "Ja. Oppgi dato, antall gjester og rombehov, så kan hotellet svare." },
      { question: "Tar dere grupper eller møter?", answer: "Ja, send dato, antall personer og behov, så kan det lages forslag." },
    ],
    call_to_action: "Sjekk tilgjengelighet",
    contact_text: "Send dato, antall gjester og ønsket romtype, så følger {companyName} opp med tilgjengelighet.",
    brand_color: "#7c3aed",
    secondary_color: "#1e1b4b",
    accent_color: "#c4b5fd",
    suggested_sections: ["Hero", "Rom", "Fasiliteter", "Priser", "Opplevelser", "FAQ", "Kontakt", "ChatGenius"],
    gallery_images: GENERIC_SERVICE_GALLERY_IMAGES,
  },
  kafe: {
    template_name: "Kafe",
    hero_title: "{companyName} er stedet for kaffe, lunsj og små pauser",
    hero_subtitle: "Meny, kaker, kaffe, åpningstider, arrangementer og enkel kontakt for gjester og grupper.",
    intro_text:
      "{companyName} kan vise frem meny, atmosfære, dagens tilbud og kontakt på en nettside som gjør besøket lett å planlegge.",
    services: ["Kaffe, bakst og lunsj", "Dagens tilbud og sesongmeny", "Takeaway når det tilbys", "Små arrangementer og grupper", "Åpningstider og praktisk info"],
    products: ["Kaffe og varme drikker", "Lunsjretter", "Kaker og bakst", "Gavekort eller cateringforespørsel"],
    prices: ["Kaffe fra kr 45", "Lunsj fra kr 149", "Kaker prises per stykk eller bestilling", "Grupper får tilbud etter behov"],
    trust_points: ["Oppdatert meny og åpningstider", "Enkel kontakt for grupper og bestillinger", "Tydelig lokal profil", "ChatGenius kan svare på vanlige spørsmål"],
    faq: [
      { question: "Kan jeg se dagens meny?", answer: "Ja, dagens utvalg kan vises på nettsiden og oppdateres ved behov." },
      { question: "Kan jeg spørre om gruppebord?", answer: "Ja. Oppgi dato, tidspunkt og antall personer, så kan kafeen svare." },
    ],
    call_to_action: "Se dagens tilbud",
    contact_text: "Send spørsmål om meny, gruppebord eller bestilling, så tar {companyName} kontakt.",
    brand_color: "#a16207",
    secondary_color: "#292524",
    accent_color: "#fbbf24",
    suggested_sections: ["Hero", "Meny", "Dagens tilbud", "Kaker", "Åpningstider", "FAQ", "Kontakt", "ChatGenius"],
    gallery_images: GENERIC_SERVICE_GALLERY_IMAGES,
  },
  bygg: {
    template_name: "Bygg og anlegg",
    hero_title: "{companyName} tar prosjekter fra plan til ferdig levert",
    hero_subtitle: "Bygg, rehabilitering, anlegg, befaring, prosjektplan og tilbudsforespørsel for private og bedrifter.",
    intro_text:
      "{companyName} kan presentere prosjekter, tjenester, kapasitet og kontakt på en nettside som gjør første dialog enklere.",
    services: ["Rehabilitering og byggprosjekter", "Grunnarbeid og anlegg etter kapasitet", "Befaring og prosjektavklaring", "Prosjektledelse og koordinering", "Vedlikehold og oppgradering"],
    products: ["Prosjektbefaring", "Rehabiliteringspakke", "Anleggsvurdering", "Service- og vedlikeholdsavtale"],
    prices: ["Befaring etter avtale", "Prosjekt prises etter omfang", "Tilbud gis etter behovsavklaring", "Fast ramme kan avtales før oppstart"],
    trust_points: ["Tydelig prosjektavklaring før tilbud", "Praktisk kommunikasjon underveis", "Erfaring med lokale forhold", "Ryddig dokumentasjon av avtalt omfang"],
    faq: [
      { question: "Kan jeg be om prosjektbefaring?", answer: "Ja. Beskriv prosjekt, adresseområde og ønsket tid, så kan bedriften vurdere kapasitet." },
      { question: "Hvordan får jeg tilbud?", answer: "Etter kort behovsavklaring eller befaring kan det lages tilbud basert på omfang." },
    ],
    call_to_action: "Be om prosjektprat",
    contact_text: "Beskriv prosjektet, ønsket tidsrom og adresseområde, så følger {companyName} opp.",
    brand_color: "#ca8a04",
    secondary_color: "#111827",
    accent_color: "#facc15",
    suggested_sections: ["Hero", "Prosjekter", "Tjenester", "Befaring", "Priser", "FAQ", "Kontakt", "ChatGenius"],
    gallery_images: GENERIC_SERVICE_GALLERY_IMAGES,
  },
};

function personalizeTemplateText(value: string, companyName: string) {
  return value.split("{companyName}").join(companyName || DEFAULT_COMPANY_NAME);
}

function copyTemplateList(values: string[], companyName: string) {
  return values.map((value) => personalizeTemplateText(value, companyName));
}

export function getDemoSiteTemplateDefaults(templateSlug: string | null | undefined, companyName = DEFAULT_COMPANY_NAME): DemoSiteTemplateDefaults {
  const normalizedSlug = normalizeDemoSiteTemplateSlug(templateSlug);
  const slug = DEMO_SITE_TEMPLATE_DEFAULTS[normalizedSlug] ? normalizedSlug : GENERIC_TEMPLATE_SLUG;
  const defaults = DEMO_SITE_TEMPLATE_DEFAULTS[slug];
  const displayName = companyName.trim() || DEFAULT_COMPANY_NAME;
  const templateSeed = DEMO_SITE_TEMPLATE_SEEDS.find((template) => template.slug === slug);

  return {
    template_slug: slug,
    template_name: templateSeed?.name || defaults.template_name,
    hero_title: personalizeTemplateText(defaults.hero_title, displayName),
    hero_subtitle: personalizeTemplateText(defaults.hero_subtitle, displayName),
    intro_text: personalizeTemplateText(defaults.intro_text, displayName),
    services: copyTemplateList(defaults.services, displayName),
    products: copyTemplateList(defaults.products, displayName),
    prices: copyTemplateList(defaults.prices, displayName),
    trust_points: copyTemplateList(defaults.trust_points, displayName),
    faq: defaults.faq.map((item) => ({
      question: personalizeTemplateText(item.question, displayName),
      answer: personalizeTemplateText(item.answer, displayName),
    })),
    call_to_action: personalizeTemplateText(defaults.call_to_action, displayName),
    contact_text: personalizeTemplateText(defaults.contact_text, displayName),
    brand_color: defaults.brand_color,
    secondary_color: defaults.secondary_color,
    accent_color: defaults.accent_color,
    suggested_sections: [...defaults.suggested_sections],
    gallery_images: [...defaults.gallery_images],
  };
}

export function getDemoSitePackage(id: string | null | undefined) {
  return DEMO_SITE_PACKAGES.find((pkg) => pkg.id === id) || DEMO_SITE_PACKAGES[1];
}

export function formatNok(value: number) {
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export function slugifyCompanyName(value: string) {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " og ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return slug || `demosite-${Date.now().toString(36)}`;
}

export function buildDefaultTemplateFields(input: {
  companyName: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  websiteUrl?: string;
  industry?: string;
  notes?: string;
  templateSlug?: string | null;
}) {
  const templateDefaults = getDemoSiteTemplateDefaults(input.templateSlug, input.companyName);

  return {
    ...templateDefaults,
    logo: "Hentes fra opplastet logo eller kundens eksisterende nettside når scraper er koblet på.",
    address: "Legg inn kundens adresse før publisering.",
    contact_info: {
      company: input.companyName,
      contact_person: input.customerName || "",
      email: input.customerEmail || "",
      phone: input.customerPhone || "",
      website: input.websiteUrl || "",
    },
    brand_colors: {
      primary: templateDefaults.brand_color,
      secondary: templateDefaults.secondary_color,
      accent: templateDefaults.accent_color,
    },
    hero_text: templateDefaults.hero_title,
    about_text: input.notes || templateDefaults.intro_text,
    section_texts: {
      problem: "Mange lokale bedrifter mister henvendelser fordi nettsiden er utdatert eller vanskelig på mobil.",
      solution: templateDefaults.hero_subtitle,
      call_to_action: templateDefaults.call_to_action,
    },
    opening_hours: "Legges inn manuelt eller hentes fra kundens profil senere.",
    images: templateDefaults.gallery_images,
  };
}

export interface DemoSiteProfileAnalyzeInput {
  companyName?: string | null;
  websiteUrl?: string | null;
  industry?: string | null;
  notes?: string | null;
  requestedPackageId?: string | null;
}

export interface DemoSiteProfileAnalyzeResult {
  slug: string;
  recommendedPackage: DemoSitePackage;
  templateSlug: string;
  readinessScore: number;
  missingFields: string[];
  suggestedNextSteps: string[];
}

const DEFAULT_ANALYZED_TEMPLATE_SLUG = "local-service";

const TEMPLATE_KEYWORDS: Array<{ slug: string; keywords: string[] }> = [
  {
    slug: "ai-teknologi",
    keywords: [
      "kunstig intelligens",
      "artificial intelligence",
      "ai",
      "ai service",
      "ai-service",
      "ai tjenester",
      "ai-tjenester",
      "ai løsning",
      "ai-løsning",
      "ai-agent",
      "ai agent",
      "ai-workshop",
      "ai automasjon",
      "ai automation",
      "generativ ai",
      "generative ai",
      "llm",
      "automatisering",
      "automasjon",
      "maskinlaering",
      "maskinlæring",
      "dataplattform",
      "software",
      "saas",
      "api-integrasjon",
      "integrasjoner",
      "teknologi",
      "chatbot",
      "prototype",
      "mvp",
    ],
  },
  {
    slug: "elektro",
    keywords: ["elektro", "elektriker", "strøm", "electric", "electrician", "installasjon"],
  },
  {
    slug: "bilverksted",
    keywords: ["bilverksted", "verksted", "bilservice", "eu-kontroll", "mekaniker", "oljeskift", "bremser"],
  },
  {
    slug: "dekk",
    keywords: ["dekk", "dekkskift", "dekkhotell", "hjulhotell", "felg", "hjul", "tire", "tyre"],
  },
  {
    slug: "frakt",
    keywords: ["frakt", "transport", "logistikk", "flytting", "cargo", "delivery", "logistics"],
  },
  {
    slug: "renhold",
    keywords: ["renhold", "vask", "cleaning", "rengjøring", "cleaner", "maid"],
  },
  {
    slug: "restaurant",
    keywords: ["restaurant", "servering", "meny", "middag", "lunsj", "bordbestilling", "catering"],
  },
  {
    slug: "frisor",
    keywords: ["frisør", "frisor", "salong", "hår", "hair", "klipp", "farge"],
  },
  {
    slug: "tannlege",
    keywords: ["tannlege", "tannklinikk", "dental", "tannrens", "akutt tann"],
  },
  {
    slug: "rorlegger",
    keywords: ["rørlegger", "rorlegger", "vvs", "bad", "lekkasje", "varmtvann"],
  },
  {
    slug: "snekker",
    keywords: ["snekker", "tømrer", "tomrer", "terrasse", "trearbeid"],
  },
  {
    slug: "eiendomsmegler",
    keywords: ["eiendomsmegler", "megler", "boligsalg", "verdivurdering", "real estate"],
  },
  {
    slug: "advokat",
    keywords: ["advokat", "juridisk", "lawyer", "kontrakt", "rettshjelp"],
  },
  {
    slug: "fysioterapi",
    keywords: ["fysioterapi", "fysioterapeut", "rehabilitering", "fysio", "trening"],
  },
  {
    slug: "klinikk",
    keywords: ["klinikk", "skjønnhet", "skjonnhet", "hudpleie", "beauty", "behandling"],
  },
  {
    slug: "hotell",
    keywords: ["hotell", "overnatting", "hotel", "rom", "gjest", "booking"],
  },
  {
    slug: "kafe",
    keywords: ["kafé", "kafe", "kaffe", "bakeri", "bakst", "lunsj"],
  },
  {
    slug: "bygg",
    keywords: [
      "bygg og anlegg",
      "byggfirma",
      "byggmester",
      "entreprenør",
      "entreprenor",
      "totalentreprise",
      "grunnarbeid",
      "gravearbeid",
      "betong",
      "nybygg",
      "tilbygg",
      "anleggsarbeid",
      "rehabilitering av bygg",
      "prosjektledelse bygg",
    ],
  },
];

function normalizeProfileText(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeProfileSearchText(value: string | null | undefined) {
  return normalizeProfileText(value)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function profileTextHasKeyword(profileText: string, keyword: string) {
  const normalizedKeyword = normalizeProfileSearchText(keyword);
  if (!normalizedKeyword) return false;
  const keywordPattern = normalizedKeyword.split(/\s+/).map(escapeRegex).join("\\s+");
  return new RegExp(`(^|\\s)${keywordPattern}(?=\\s|$)`).test(profileText);
}

function getTemplateKeywordWeight(templateSlug: string, keyword: string) {
  const normalizedKeyword = normalizeProfileSearchText(keyword);
  if (!normalizedKeyword) return 0;

  if (templateSlug === "bygg" && ["bygg", "anlegg", "prosjekt", "rehabilitering"].includes(normalizedKeyword)) return 1;
  if (templateSlug === "ai-teknologi" && normalizedKeyword === "ai") return 2;
  if (normalizedKeyword.includes(" ")) return 5;
  if (normalizedKeyword.length > 8) return 5;
  return 4;
}

function scoreTemplateMatch(profileText: string, template: { slug: string; keywords: string[] }) {
  let score = profileTextHasKeyword(profileText, template.slug) ? 3 : 0;
  let matchedKeywords = 0;
  const matchedKeywordValues: string[] = [];

  for (const keyword of template.keywords) {
    if (!profileTextHasKeyword(profileText, keyword)) continue;
    score += getTemplateKeywordWeight(template.slug, keyword);
    matchedKeywords += 1;
    matchedKeywordValues.push(keyword);
  }

  return { score, matchedKeywords, matchedKeywordValues };
}

const TEMPLATE_MATCH_MINIMUMS: Record<string, { score: number; keywords: number }> = {
  "ai-teknologi": { score: 5, keywords: 1 },
  bygg: { score: 8, keywords: 2 },
  hotell: { score: 8, keywords: 2 },
  klinikk: { score: 8, keywords: 2 },
};

const BUILDING_SPECIFIC_KEYWORDS = new Set([
  "bygg og anlegg",
  "byggfirma",
  "byggmester",
  "entreprenør",
  "entreprenor",
  "totalentreprise",
  "grunnarbeid",
  "gravearbeid",
  "betong",
  "nybygg",
  "tilbygg",
  "anleggsarbeid",
  "rehabilitering av bygg",
  "prosjektledelse bygg",
]);

function isConfidentTemplateMatch(match: ReturnType<typeof scoreTemplateMatch> & { template: { slug: string } }) {
  const minimum = TEMPLATE_MATCH_MINIMUMS[match.template.slug] || { score: 5, keywords: 1 };
  if (match.score < minimum.score || match.matchedKeywords < minimum.keywords) return false;

  if (match.template.slug === "ai-teknologi") {
    const normalizedMatches = match.matchedKeywordValues.map(normalizeProfileSearchText);
    return normalizedMatches.some((keyword) => keyword !== "ai") || match.matchedKeywords >= 2;
  }

  if (match.template.slug === "bygg") {
    return match.matchedKeywordValues.some((keyword) => BUILDING_SPECIFIC_KEYWORDS.has(normalizeProfileSearchText(keyword)));
  }

  return true;
}

export function analyzeDemoSiteProfile(input: DemoSiteProfileAnalyzeInput): DemoSiteProfileAnalyzeResult {
  const companyName = (input.companyName || "").trim();
  const profileText = normalizeProfileSearchText(
    [companyName, input.industry, input.notes].filter(Boolean).join(" "),
  );
  const matchedTemplate = TEMPLATE_KEYWORDS.map((template) => ({ template, ...scoreTemplateMatch(profileText, template) }))
    .filter(isConfidentTemplateMatch)
    .sort((a, b) => b.score - a.score)[0]?.template;

  const missingFields = [
    !companyName && "companyName",
    !input.websiteUrl && "websiteUrl",
    !input.industry && "industry",
    !input.notes && "notes",
  ].filter((field): field is string => Boolean(field));

  const hasWebsite = Boolean(input.websiteUrl && input.websiteUrl.trim().length > 0);
  const recommendedPackage = getDemoSitePackage(
    input.requestedPackageId || (hasWebsite && missingFields.length <= 1 ? "standard" : "basis"),
  );
  const readinessScore = Math.max(0, Math.min(100, 100 - missingFields.length * 20));

  return {
    slug: slugifyCompanyName(companyName || input.industry || "demosite"),
    recommendedPackage,
    templateSlug: matchedTemplate?.slug || DEFAULT_ANALYZED_TEMPLATE_SLUG,
    readinessScore,
    missingFields,
    suggestedNextSteps: missingFields.length
      ? missingFields.map((field) => `Legg inn ${field} før demoen klargjøres.`)
      : ["Klargjør demo med valgt mal og anbefalt pakke."],
  };
}
