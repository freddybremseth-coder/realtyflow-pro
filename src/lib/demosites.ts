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

const DEMO_SITE_TEMPLATE_DEFAULTS: Record<string, DemoSiteTemplateDefaultBase> = {
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
};

function personalizeTemplateText(value: string, companyName: string) {
  return value.split("{companyName}").join(companyName || DEFAULT_COMPANY_NAME);
}

function copyTemplateList(values: string[], companyName: string) {
  return values.map((value) => personalizeTemplateText(value, companyName));
}

export function getDemoSiteTemplateDefaults(templateSlug: string | null | undefined, companyName = DEFAULT_COMPANY_NAME): DemoSiteTemplateDefaults {
  const normalizedSlug = String(templateSlug || "").toLowerCase().trim();
  const slug = DEMO_SITE_TEMPLATE_DEFAULTS[normalizedSlug] ? normalizedSlug : "elektro";
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

const TEMPLATE_KEYWORDS: Array<{ slug: string; keywords: string[] }> = [
  {
    slug: "elektro",
    keywords: ["elektro", "elektriker", "strøm", "electric", "electrician", "installasjon"],
  },
  {
    slug: "dekk",
    keywords: ["dekk", "bil", "verksted", "auto", "car", "tire", "tyre", "garage"],
  },
  {
    slug: "frakt",
    keywords: ["frakt", "transport", "logistikk", "flytting", "cargo", "delivery", "logistics"],
  },
  {
    slug: "renhold",
    keywords: ["renhold", "vask", "cleaning", "rengjøring", "cleaner", "maid"],
  },
];

function normalizeProfileText(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function analyzeDemoSiteProfile(input: DemoSiteProfileAnalyzeInput): DemoSiteProfileAnalyzeResult {
  const companyName = (input.companyName || "").trim();
  const profileText = normalizeProfileText(
    [companyName, input.websiteUrl, input.industry, input.notes].filter(Boolean).join(" "),
  );

  const matchedTemplate = TEMPLATE_KEYWORDS.find((template) =>
    template.keywords.some((keyword) => profileText.includes(keyword)),
  );

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
  const defaultTemplateSlug = DEMO_SITE_TEMPLATE_SEEDS[0]?.slug || "elektro";
  const readinessScore = Math.max(0, Math.min(100, 100 - missingFields.length * 20));

  return {
    slug: slugifyCompanyName(companyName || input.industry || "demosite"),
    recommendedPackage,
    templateSlug: matchedTemplate?.slug || defaultTemplateSlug,
    readinessScore,
    missingFields,
    suggestedNextSteps: missingFields.length
      ? missingFields.map((field) => `Legg inn ${field} før demoen klargjøres.`)
      : ["Klargjør demo med valgt mal og anbefalt pakke."],
  };
}
