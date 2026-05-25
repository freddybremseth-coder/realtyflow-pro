import { BRANDS } from "@/lib/constants";

export type WebsiteCmsDestination = {
  id: string;
  label: string;
  path: string;
  contentType: "post" | "article" | "guide" | "magazine" | "recipe" | "page";
  description?: string;
};

export type WebsiteCmsConfig = {
  brandId: string;
  brandName: string;
  website: string;
  destinations: WebsiteCmsDestination[];
  defaultDestinationId: string;
  webhookUrl: string;
  webhookSecret: string;
};

const DEFAULT_DESTINATIONS: WebsiteCmsDestination[] = [
  { id: "blogg", label: "Blogg", path: "/blogg", contentType: "post" },
  { id: "artikler", label: "Artikler", path: "/artikler", contentType: "article" },
  { id: "guider", label: "Guider", path: "/guider", contentType: "guide" },
];

const BRAND_DESTINATIONS: Record<string, WebsiteCmsDestination[]> = {
  donaanna: [
    { id: "magasin", label: "Magasin", path: "/magasin", contentType: "magazine" },
    { id: "artikler", label: "Artikler", path: "/artikler", contentType: "article" },
    { id: "blogg", label: "Blogg", path: "/blogg", contentType: "post" },
    { id: "oppskrifter", label: "Oppskrifter", path: "/oppskrifter", contentType: "recipe" },
  ],
  zeneco: [
    { id: "magasin", label: "Magasin", path: "/magasin", contentType: "magazine" },
    { id: "artikler", label: "Artikler", path: "/artikler", contentType: "article" },
    { id: "omradeguider", label: "Områdeguider", path: "/omradeguider", contentType: "guide" },
    { id: "kjoperguider", label: "Kjøperguider", path: "/kjoperguider", contentType: "guide" },
  ],
  pinosoecolife: [
    { id: "magasin", label: "Magasin", path: "/magasin", contentType: "magazine" },
    { id: "artikler", label: "Artikler", path: "/artikler", contentType: "article" },
    { id: "boligartikler", label: "Boligartikler", path: "/boligartikler", contentType: "article" },
    { id: "guider", label: "Guider", path: "/guider", contentType: "guide" },
  ],
  soleada: [
    { id: "magasin", label: "Magasin", path: "/magasin", contentType: "magazine" },
    { id: "artikler", label: "Artikler", path: "/artikler", contentType: "article" },
    { id: "omradeguider", label: "Områdeguider", path: "/omradeguider", contentType: "guide" },
    { id: "kjoperguider", label: "Kjøperguider", path: "/kjoperguider", contentType: "guide" },
  ],
  chatgenius: [
    { id: "artikler", label: "Artikler", path: "/artikler", contentType: "article" },
    { id: "blogg", label: "Blogg", path: "/blogg", contentType: "post" },
    { id: "case", label: "Case", path: "/case", contentType: "article" },
    { id: "ressurser", label: "Ressurser", path: "/ressurser", contentType: "guide" },
  ],
  freddyb: [
    { id: "artikler", label: "Artikler", path: "/artikler", contentType: "article" },
    { id: "blogg", label: "Blogg", path: "/blogg", contentType: "post" },
    { id: "ressurser", label: "Ressurser", path: "/ressurser", contentType: "guide" },
  ],
  freddypublishing: [
    { id: "magasin", label: "Magasin", path: "/magasin", contentType: "magazine" },
    { id: "artikler", label: "Artikler", path: "/artikler", contentType: "article" },
    { id: "bokressurser", label: "Bokressurser", path: "/bokressurser", contentType: "guide" },
    { id: "leadmagneter", label: "Lead magnets", path: "/lead-magnets", contentType: "page" },
  ],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function slugifyCmsTitle(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

function cleanPath(path: string) {
  const trimmed = path.trim();
  if (!trimmed) return "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function safeContentType(value: string): WebsiteCmsDestination["contentType"] {
  if (["post", "article", "guide", "magazine", "recipe", "page"].includes(value)) {
    return value as WebsiteCmsDestination["contentType"];
  }
  return "article";
}

export function parseDestinationLines(value: unknown): WebsiteCmsDestination[] {
  if (typeof value !== "string") return [];
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^https?:\/\//i.test(line))
    .map((line) => {
      const [labelPart, pathPart, typePart, idPart] = line.split("|").map((part) => part.trim());
      const label = labelPart || "Artikler";
      if (/^https?:\/\//i.test(label)) return null;
      const id = idPart || slugifyCmsTitle(label) || "artikler";
      if (!id || /^https?/i.test(id)) return null;
      return {
        id,
        label,
        path: /^https?:\/\//i.test(pathPart || "") ? `/${id}` : cleanPath(pathPart || `/${id}`),
        contentType: safeContentType(typePart || "article"),
      };
    })
    .filter((item): item is WebsiteCmsDestination => Boolean(item));
}

export function destinationsToLines(destinations: WebsiteCmsDestination[]) {
  return destinations
    .map((destination) => `${destination.label}|${destination.path}|${destination.contentType}|${destination.id}`)
    .join("\n");
}

function normalizeDestinations(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!isRecord(item)) return null;
      const label = String(item.label || item.name || "").trim();
      if (!label) return null;
      if (/^https?:\/\//i.test(label)) return null;
      const id = String(item.id || slugifyCmsTitle(label)).trim();
      if (!id || /^https?/i.test(id)) return null;
      const destination: WebsiteCmsDestination = {
        id,
        label,
        path: /^https?:\/\//i.test(String(item.path || ""))
          ? `/${id}`
          : cleanPath(String(item.path || `/${id}`)),
        contentType: safeContentType(String(item.contentType || item.type || "article")),
      };
      if (item.description) destination.description = String(item.description);
      return destination;
    })
    .filter((item): item is WebsiteCmsDestination => Boolean(item));
}

function uniqueDestinations(destinations: WebsiteCmsDestination[]) {
  const seen = new Set<string>();
  const out: WebsiteCmsDestination[] = [];
  for (const destination of destinations) {
    if (seen.has(destination.id)) continue;
    seen.add(destination.id);
    out.push(destination);
  }
  return out;
}

function envSuffix(brandId: string) {
  return brandId.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

function envValue(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key];
    if (value) return value;
  }
  return "";
}

export function getDefaultWebsiteDestinations(brandId: string) {
  return BRAND_DESTINATIONS[brandId] || DEFAULT_DESTINATIONS;
}

export function resolveWebsiteCmsConfig(
  brandId: string,
  rawSettings?: Record<string, unknown> | null,
  fallbackWebsite?: string,
): WebsiteCmsConfig {
  const brand = BRANDS.find((item) => item.id === brandId);
  const settings = rawSettings || {};
  const nested = isRecord(settings.website_cms) ? settings.website_cms : {};
  const suffix = envSuffix(brandId);
  const customDestinations = [
    ...normalizeDestinations(nested.destinations),
    ...parseDestinationLines(settings.websiteCmsDestinationsText),
  ];
  const destinations = uniqueDestinations([
    ...customDestinations,
    ...getDefaultWebsiteDestinations(brandId),
  ]);
  const defaultDestinationId = String(
    nested.default_destination ||
      settings.websiteCmsDefaultDestination ||
      destinations[0]?.id ||
      "artikler",
  );

  return {
    brandId,
    brandName: String(settings.custom_name || brand?.name || brandId),
    website: String(settings.website || fallbackWebsite || brand?.website || ""),
    destinations,
    defaultDestinationId,
    webhookUrl: String(
      nested.webhook_url ||
        settings.websiteCmsWebhookUrl ||
        envValue(`REALTYFLOW_CMS_WEBHOOK_${suffix}`, `WEBSITE_CMS_WEBHOOK_${suffix}`),
    ),
    webhookSecret: String(
      nested.webhook_secret ||
        settings.websiteCmsWebhookSecret ||
        envValue(`REALTYFLOW_CMS_SECRET_${suffix}`, `WEBSITE_CMS_SECRET_${suffix}`),
    ),
  };
}
