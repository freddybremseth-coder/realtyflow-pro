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
    slug: "local-service",
    name: "Lokal servicebedrift",
    category: "service",
    description: "Rask mal for håndverkere, flyttebyrå, verksted, renhold og lokale tjenestebedrifter.",
    repoUrl: "https://github.com/freddybremseth-coder/demosites",
    previewUrl: "https://realtyflow.chatgenius.pro/saas?template=local-service",
  },
  {
    slug: "restaurant-cafe",
    name: "Restaurant / kafé",
    category: "hospitality",
    description: "Mat, meny, åpningstider, bordbestilling og enkel leadfangst.",
    repoUrl: "https://github.com/freddybremseth-coder/demosites",
    previewUrl: "https://realtyflow.chatgenius.pro/saas?template=restaurant-cafe",
  },
  {
    slug: "real-estate-agent",
    name: "Eiendomsmegler / rådgiver",
    category: "real-estate",
    description: "Profil, områder, tjenester, boligønskeskjema og ChatGenius lead-assistent.",
    repoUrl: "https://github.com/freddybremseth-coder/demosites",
    previewUrl: "https://realtyflow.chatgenius.pro/saas?template=real-estate-agent",
  },
];

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
}) {
  return {
    logo: "Hentes fra opplastet logo eller kundens eksisterende nettside når scraper er koblet på.",
    brand_color: "Foreslått fra logo/profil. Kan overstyres manuelt.",
    address: "Legg inn kundens adresse før publisering.",
    contact_info: {
      company: input.companyName,
      contact_person: input.customerName || "",
      email: input.customerEmail || "",
      phone: input.customerPhone || "",
      website: input.websiteUrl || "",
    },
    services: [],
    products: [],
    prices: [],
    hero_text: `${input.companyName} hjelper lokale kunder med ${input.industry || "sine tjenester"}.`,
    about_text: input.notes || "Kort tekst om bedriften, erfaring, trygghet og hvorfor kunden bør ta kontakt.",
    section_texts: {
      problem: "Mange lokale bedrifter mister henvendelser fordi nettsiden er utdatert eller vanskelig på mobil.",
      solution: "Denne nettsiden gjør det enkelt å forstå tilbudet, ta kontakt og legge igjen forespørsel.",
      call_to_action: "Be om tilbud i dag.",
    },
    opening_hours: "Legges inn manuelt eller hentes fra kundens profil senere.",
    images: [],
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
    slug: "real-estate-agent",
    keywords: ["eiendom", "megler", "bolig", "property", "real estate", "villa", "leilighet"],
  },
  {
    slug: "restaurant-cafe",
    keywords: ["restaurant", "kafe", "cafe", "mat", "menu", "meny", "bar", "tapas"],
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

  const readinessScore = Math.max(0, Math.min(100, 100 - missingFields.length * 20));

  return {
    slug: slugifyCompanyName(companyName || input.industry || "demosite"),
    recommendedPackage,
    templateSlug: matchedTemplate?.slug || "local-service",
    readinessScore,
    missingFields,
    suggestedNextSteps: missingFields.length
      ? missingFields.map((field) => `Legg inn ${field} før demoen klargjøres.`)
      : ["Klargjør demo med valgt mal og anbefalt pakke."],
  };
}
