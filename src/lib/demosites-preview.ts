import {
  getDemoSiteTemplateDefaults,
  type DemoSiteFaqItem,
  type DemoSiteTemplateDefaults,
} from "@/lib/demosites";

export type DemoSitesPreviewMode = "internal" | "public";
export type DemoSitesPreviewFallbackMode = "defaults" | "placeholders";

export type DemoSitesPreviewProfile = {
  company_name?: string;
  website_url?: string;
  recommended_template_slug?: string;
  logo_url?: string;
  image_urls?: string[];
  colors?: { primary?: string; secondary?: string; accent?: string };
  services?: string[];
  products?: string[];
  prices?: string[];
  trust_points?: string[];
  faq?: DemoSiteFaqItem[];
  contact?: { email?: string; phone?: string; address?: string; website?: string };
  source_pages?: string[];
};

export type DemoSitesPreviewContact = {
  email: string;
  phone: string;
  address: string;
  website: string;
};

export type DemoSitesPreviewColors = {
  primary: string;
  secondary: string;
  accent: string;
  primaryText: string;
  secondaryText: string;
  missing: string[];
};

export type DemoSitesPreviewContent = DemoSiteTemplateDefaults & {
  logo_url: string;
};

export type DemoSitesPreviewEmployee = {
  name: string;
  title: string;
  email?: string;
  phone?: string;
  photo?: string;
};

export type DemoSitesPreviewModel = {
  companyName: string;
  templateSlug: string;
  templateLabel: string;
  websiteUrl: string;
  expiresAt: string;
  sourcePages: string[];
  isImported: boolean;
  content: DemoSitesPreviewContent;
  colors: DemoSitesPreviewColors;
  contact: DemoSitesPreviewContact;
  contactHref: string;
  chatPrice: string;
  /** True when products/prices came from the customer, not template filler. */
  hasCustomProducts: boolean;
  hasCustomPrices: boolean;
  /** Premium: team members (from crawl/AI or edited in the CRM). */
  employees: DemoSitesPreviewEmployee[];
};

export type DemoSitesPreviewInput = {
  companyName?: string | null;
  templateSlug?: string | null;
  templateLabel?: string | null;
  websiteUrl?: string | null;
  expiresAt?: string | null;
  logoUrl?: string | null;
  brandColor?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  profile?: DemoSitesPreviewProfile | Record<string, unknown> | null;
  extractedProfile?: Record<string, unknown> | null;
  editableFields?: Record<string, unknown> | null;
  notes?: string | null;
  fallbackMode?: DemoSitesPreviewFallbackMode;
};

const PLACEHOLDERS = {
  companyName: "Mangler bedriftsnavn",
  heroTitle: "Mangler hero-tittel",
  heroSubtitle: "Mangler hero-undertittel",
  introText: "Mangler intro",
  service: "Mangler tjenester",
  product: "Mangler produkter eller pakker",
  price: "Mangler priser",
  trustPoint: "Mangler trygghetspunkter",
  cta: "Mangler CTA",
  contactText: "Mangler kontakttekst",
  faqQuestion: "Mangler FAQ",
  faqAnswer: "Legg inn minst to spørsmål og svar for en tryggere demo.",
};

export function isPreviewRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function previewText(value: unknown, fallback = "") {
  const output = String(value || "").trim();
  return output || fallback;
}

function normalizeListKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function uniqueStringItems(values: string[], maxItems = 8, exclude: string[] = []) {
  const seen = new Set(exclude.map((item) => normalizeListKey(item)).filter(Boolean));
  const output: string[] = [];

  for (const value of values) {
    const item = String(value || "").trim();
    const key = normalizeListKey(item);
    if (!item || !key || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
    if (output.length >= maxItems) break;
  }

  return output;
}

function listFromUnknown(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item || ""));
  if (typeof value === "string") return value.split(/\r?\n/);
  return [];
}

function stringList(values: unknown[], fallback: string[], maxItems = 8, exclude: string[] = []) {
  const source = values.flatMap(listFromUnknown);
  const items = uniqueStringItems(source, maxItems, exclude);
  if (items.length) return items;
  return uniqueStringItems(fallback, maxItems, exclude);
}

function faqList(values: unknown[], fallback: DemoSiteFaqItem[]) {
  const items = values
    .flatMap((value) => {
      if (Array.isArray(value)) return value;
      if (typeof value === "string") return value.split(/\r?\n/);
      return [];
    })
    .map((item) => {
      if (isPreviewRecord(item)) {
        const question = previewText(item.question);
        const answer = previewText(item.answer);
        return question || answer ? { question, answer } : null;
      }

      const line = previewText(item);
      if (!line) return null;
      const separator = line.includes("::") ? "::" : "|";
      const [question = "", ...answerParts] = line.split(separator);
      const answer = answerParts.join(separator).trim();
      return question.trim() || answer ? { question: question.trim(), answer } : null;
    })
    .filter((item): item is DemoSiteFaqItem => Boolean(item))
    .slice(0, 6);

  return items.length ? items : fallback;
}

export function previewImageUrl(value: unknown) {
  const url = previewText(value);
  if (url.startsWith("data:image/") || url.startsWith("http://") || url.startsWith("https://")) return url;
  return "";
}

function normalizePreviewUrl(value: string) {
  return value.trim().toLowerCase().replace(/[#?].*$/, "").replace(/\/+$/, "");
}

function isLikelyLogoImage(value: string) {
  const normalized = normalizePreviewUrl(value);
  return /(^|[-_/])(logo|favicon|apple-touch-icon|brandmark|wordmark|symbol)([-_.]|\d|\/|$)/i.test(normalized);
}

function imageList(values: unknown[], fallback: string[], exclude: string[] = []) {
  const excluded = new Set(exclude.map(normalizePreviewUrl).filter(Boolean));
  const images = uniqueStringItems(
    values
      .flatMap(listFromUnknown)
      .map(previewImageUrl)
      .filter((url) => {
        if (!url) return false;
        const normalized = normalizePreviewUrl(url);
        return !excluded.has(normalized) && !isLikelyLogoImage(url);
      }),
    6,
  );

  return images.length ? images : fallback;
}

export function formatPreviewDate(value?: string | null) {
  if (!value) return "7 dager";
  return new Intl.DateTimeFormat("nb-NO", { dateStyle: "medium" }).format(new Date(value));
}

export function isHexColor(value: unknown) {
  return /^#[0-9A-Fa-f]{6}$/.test(previewText(value));
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

export function readableTextColor(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? "#111827" : "#ffffff";
}

export function withPreviewAlpha(hex: string, alpha: string) {
  return `${hex}${alpha}`;
}

function isInternalImportEmail(value: string) {
  return /^demosites-import\+[^@\s]+@chatgenius\.pro$/i.test(value.trim());
}

function getRecordValue(record: Record<string, unknown>, key: string) {
  return record[key];
}

function getProfileRecord(input: DemoSitesPreviewInput) {
  return isPreviewRecord(input.profile) ? input.profile : {};
}

function getExtractedProfileRecord(input: DemoSitesPreviewInput) {
  return isPreviewRecord(input.extractedProfile) ? input.extractedProfile : {};
}

function getTemplateSlug(input: DemoSitesPreviewInput, fields: Record<string, unknown>, profile: Record<string, unknown>) {
  return (
    previewText(fields.template_slug) ||
    previewText(input.templateSlug) ||
    previewText(profile.recommended_template_slug) ||
    "local-service"
  ).toLowerCase();
}

/**
 * Imported company names sometimes arrive as the old site's <title>
 * ("Flyttehjelp, varetransport og bortkjøring - få frakttilbud"). A name
 * that long reads terribly in headings like "Tjenester fra …", so slogan
 * halves after "-"/"|"/"–" are stripped when the name looks like a title.
 */
function cleanCompanyName(value: string) {
  let name = value.trim();
  if (name.length > 34) {
    const separatorMatch = name.match(/^(.{3,60}?)\s+[-–—|·]\s+.+$/);
    if (separatorMatch) name = separatorMatch[1].trim();
  }
  if (name.length > 60) name = `${name.slice(0, 57).trim()}…`;
  return name;
}

function getCompanyName(input: DemoSitesPreviewInput, profile: Record<string, unknown>, fallbackMode: DemoSitesPreviewFallbackMode) {
  const value = previewText(input.companyName) || previewText(profile.company_name);
  if (value) return cleanCompanyName(value);
  return fallbackMode === "placeholders" ? PLACEHOLDERS.companyName : "Bedriften";
}

function getFallbackText(
  fallbackMode: DemoSitesPreviewFallbackMode,
  defaultValue: string,
  placeholder: string,
) {
  return fallbackMode === "placeholders" ? placeholder : defaultValue;
}

function getTextField(
  fields: Record<string, unknown>,
  keys: string[],
  fallback: string,
) {
  for (const key of keys) {
    const value = previewText(getRecordValue(fields, key));
    if (value) return value;
  }
  return fallback;
}

function getColor(
  valueCandidates: unknown[],
  fallback: string,
  fallbackMode: DemoSitesPreviewFallbackMode,
  missingLabel: string,
  missing: string[],
) {
  for (const value of valueCandidates) {
    if (isHexColor(value)) return previewText(value);
  }
  if (fallbackMode === "placeholders") missing.push(missingLabel);
  return fallback;
}

function getContactInfo(input: DemoSitesPreviewInput, fields: Record<string, unknown>, profile: Record<string, unknown>) {
  const contactInfo = isPreviewRecord(fields.contact_info) ? fields.contact_info : {};
  const extractedProfile = getExtractedProfileRecord(input);
  const extractedContact = isPreviewRecord(extractedProfile.contact) ? extractedProfile.contact : {};
  const profileContact = isPreviewRecord(profile.contact) ? profile.contact : {};
  const orderEmail = previewText(input.customerEmail);
  const fieldEmail = previewText(contactInfo.email) || previewText(profileContact.email) || previewText(extractedContact.email);
  const email = fieldEmail || (orderEmail && !isInternalImportEmail(orderEmail) ? orderEmail : "");

  return {
    email,
    phone: previewText(contactInfo.phone) || previewText(profileContact.phone) || previewText(extractedContact.phone) || previewText(input.customerPhone),
    address: previewText(contactInfo.address) || previewText(profileContact.address) || previewText(extractedContact.address),
    website: previewText(contactInfo.website) || previewText(profileContact.website) || previewText(input.websiteUrl) || previewText(profile.website_url),
  };
}

function getSourcePages(input: DemoSitesPreviewInput, fields: Record<string, unknown>, profile: Record<string, unknown>) {
  const extractedProfile = getExtractedProfileRecord(input);
  return stringList(
    [fields.profile_import_source_pages, profile.source_pages, extractedProfile.source_pages],
    [],
    5,
  );
}

function getPrimaryContactHref(contact: DemoSitesPreviewContact) {
  if (contact.email) return `mailto:${contact.email}`;
  if (contact.phone) return `tel:${contact.phone}`;
  if (contact.website) return contact.website;
  return "#kontakt";
}

function isImportedPreview(input: DemoSitesPreviewInput, sourcePages: string[]) {
  return Boolean(sourcePages.length || input.extractedProfile || input.notes?.toLowerCase().includes("importert fra nettsideanalyse"));
}

export function getDemoSitesPreviewModel(input: DemoSitesPreviewInput): DemoSitesPreviewModel {
  const fallbackMode = input.fallbackMode || "defaults";
  const fields = input.editableFields || {};
  const profile = getProfileRecord(input);
  const templateSlug = getTemplateSlug(input, fields, profile);
  const companyName = getCompanyName(input, profile, fallbackMode);
  const defaults = getDemoSiteTemplateDefaults(templateSlug, companyName === PLACEHOLDERS.companyName ? "Bedriften" : companyName);
  const extractedProfile = getExtractedProfileRecord(input);
  const brandColors = isPreviewRecord(fields.brand_colors) ? fields.brand_colors : {};
  const profileColors = isPreviewRecord(profile.colors) ? profile.colors : {};
  const missingColors: string[] = [];
  const primary = getColor(
    [fields.brand_color, brandColors.primary, input.brandColor, profileColors.primary],
    fallbackMode === "placeholders" ? "#0f766e" : defaults.brand_color,
    fallbackMode,
    "Primærfarge",
    missingColors,
  );
  const secondary = getColor(
    [fields.secondary_color, brandColors.secondary, profileColors.secondary],
    fallbackMode === "placeholders" ? "#1e293b" : defaults.secondary_color,
    fallbackMode,
    "Sekundærfarge",
    missingColors,
  );
  const accent = getColor(
    [fields.accent_color, brandColors.accent, profileColors.accent],
    fallbackMode === "placeholders" ? "#f59e0b" : defaults.accent_color,
    fallbackMode,
    "Aksentfarge",
    missingColors,
  );
  // Mirror of the enrichment-side service sanitizer: stored lists from old
  // crawls can contain review titles, dates and route descriptions that must
  // never render as service cards.
  const looksLikeService = (value: string) => {
    if (value.length < 3 || value.length > 60) return false;
    if (/\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/.test(value)) return false;
    if (/\bfra\b.*\btil\b/i.test(value) && /\d/.test(value)) return false;
    if (/\d{4}\s+[A-ZÆØÅ]/.test(value)) return false;
    if (/^[A-ZÆØÅ][a-zæøå]+ og [A-ZÆØÅ][a-zæøå]+\b/.test(value)) return false;
    if ((value.match(/[.!?]/g) || []).length > 0) return false;
    if (value.split(/\s+/).length > 6) return false;
    return true;
  };
  const rawServices = stringList(
    [fields.services, profile.services],
    fallbackMode === "placeholders" ? [] : defaults.services,
    9,
  );
  const cleanedServices = rawServices.filter(looksLikeService);
  const services = cleanedServices.length >= 2
    ? cleanedServices
    : fallbackMode === "placeholders"
      ? rawServices
      : uniqueStringItems([...cleanedServices, ...defaults.services], 9);
  // Track whether products/prices are REAL customer data — public demos
  // hide the offer section entirely when it would only show template filler
  // ("Tilbud på Nettside med tydelig tjenesteoversikt…").
  const customProducts = stringList([fields.products, profile.products], [], 8, services);
  const customPrices = stringList([fields.prices, profile.prices], [], 8);
  const products = customProducts.length
    ? customProducts
    : fallbackMode === "placeholders"
      ? []
      : uniqueStringItems(defaults.products, 8, services);
  const prices = customPrices.length
    ? customPrices
    : fallbackMode === "placeholders"
      ? []
      : uniqueStringItems(defaults.prices, 8);

  const employees: DemoSitesPreviewEmployee[] = [];
  if (Array.isArray(fields.employees)) {
    for (const item of fields.employees) {
      if (!isPreviewRecord(item)) continue;
      const name = previewText(item.name);
      if (!name) continue;
      employees.push({
        name,
        title: previewText(item.title) || previewText(item.role) || "Medarbeider",
        email: previewText(item.email) || undefined,
        phone: previewText(item.phone) || undefined,
        photo: previewImageUrl(item.photo) || undefined,
      });
      if (employees.length >= 8) break;
    }
  }
  const logoUrl = previewImageUrl(fields.logo_url) || previewImageUrl(input.logoUrl) || previewImageUrl(profile.logo_url);
  const galleryImages = imageList(
    [fields.gallery_images, profile.image_urls],
    fallbackMode === "placeholders" ? [] : defaults.gallery_images,
    logoUrl ? [logoUrl] : [],
  );
  const trustPoints = stringList(
    [fields.trust_points, profile.trust_points],
    fallbackMode === "placeholders" ? [] : defaults.trust_points,
    8,
  );
  const faq = faqList(
    [fields.faq, profile.faq],
    fallbackMode === "placeholders" ? [] : defaults.faq,
  );
  const sourcePages = getSourcePages(input, fields, profile);
  const contact = getContactInfo(input, fields, profile);
  const websiteUrl = previewText(input.websiteUrl) || previewText(profile.website_url) || contact.website;
  const content = {
    ...defaults,
    hero_title: getTextField(fields, ["hero_title", "hero_text"], getFallbackText(fallbackMode, defaults.hero_title, PLACEHOLDERS.heroTitle)),
    hero_subtitle: getTextField(fields, ["hero_subtitle"], getFallbackText(fallbackMode, defaults.hero_subtitle, PLACEHOLDERS.heroSubtitle)),
    intro_text: getTextField(fields, ["intro_text", "about_text"], getFallbackText(fallbackMode, previewText(input.notes, defaults.intro_text), PLACEHOLDERS.introText)),
    services,
    products,
    prices,
    trust_points: trustPoints,
    faq,
    call_to_action: getTextField(fields, ["call_to_action"], getFallbackText(fallbackMode, defaults.call_to_action, PLACEHOLDERS.cta)),
    contact_text: getTextField(fields, ["contact_text"], getFallbackText(fallbackMode, defaults.contact_text, PLACEHOLDERS.contactText)),
    brand_color: primary,
    secondary_color: secondary,
    accent_color: accent,
    suggested_sections: stringList([fields.suggested_sections], defaults.suggested_sections, 10),
    gallery_images: galleryImages,
    logo_url: logoUrl,
  };

  return {
    companyName,
    templateSlug: defaults.template_slug,
    templateLabel: input.templateLabel || defaults.template_name,
    websiteUrl,
    expiresAt: previewText(input.expiresAt),
    sourcePages,
    isImported: isImportedPreview({ ...input, extractedProfile }, sourcePages),
    content,
    colors: {
      primary,
      secondary,
      accent,
      primaryText: readableTextColor(primary),
      secondaryText: readableTextColor(secondary),
      missing: missingColors,
    },
    contact,
    contactHref: getPrimaryContactHref(contact),
    chatPrice: prices[0] || products[0] || services[0] || "Send inn detaljer, så følger vi opp med et mer presist forslag.",
    hasCustomProducts: customProducts.length > 0,
    hasCustomPrices: customPrices.length > 0,
    employees,
  };
}

export const DEMO_SITES_PREVIEW_PLACEHOLDERS = PLACEHOLDERS;
