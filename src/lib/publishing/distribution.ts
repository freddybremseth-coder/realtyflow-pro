export const PUBLISHING_CHANNEL_IDS = [
  "amazon_kdp",
  "apple_books",
  "google_play_books",
  "kobo_writing_life",
  "publishdrive",
  "direct_store",
] as const;

export type PublishingChannelId = (typeof PUBLISHING_CHANNEL_IDS)[number];
export type DeliveryMode = "manual_portal" | "vendor_cli" | "partner_api" | "aggregator" | "internal_api";
export type CapabilityMode = "automated" | "file_import" | "manual" | "partner_only" | "unavailable";

export type PublishingChannelDefinition = {
  id: PublishingChannelId;
  name: string;
  deliveryMode: DeliveryMode;
  deliveryLabel: string;
  automatedDelivery: boolean;
  requiresConnection: boolean;
  approvalRequired: boolean;
  capabilities: {
    publish: CapabilityMode;
    metadata: CapabilityMode;
    pricing: CapabilityMode;
    sales: CapabilityMode;
    discovery: CapabilityMode;
    advertising: CapabilityMode;
  };
  notes: string;
  documentationUrl: string;
};

export const PUBLISHING_CHANNELS: Record<PublishingChannelId, PublishingChannelDefinition> = {
  amazon_kdp: {
    id: "amazon_kdp",
    name: "Amazon KDP",
    deliveryMode: "manual_portal",
    deliveryLabel: "KDP Bookshelf",
    automatedDelivery: false,
    requiresConnection: false,
    approvalRequired: true,
    capabilities: {
      publish: "manual",
      metadata: "manual",
      pricing: "manual",
      sales: "file_import",
      discovery: "partner_only",
      advertising: "partner_only",
    },
    notes: "RealtyFlow kan klargjøre EPUB, omslag og metadata. Selve KDP-innsendingen gjøres i Bookshelf.",
    documentationUrl: "https://kdp.amazon.com/en_US/help/topic/G200635650",
  },
  apple_books: {
    id: "apple_books",
    name: "Apple Books",
    deliveryMode: "vendor_cli",
    deliveryLabel: "Apple Transporter",
    automatedDelivery: true,
    requiresConnection: true,
    approvalRequired: true,
    capabilities: {
      publish: "automated",
      metadata: "automated",
      pricing: "automated",
      sales: "automated",
      discovery: "unavailable",
      advertising: "unavailable",
    },
    notes: "Transporter kan levere bokpakker, og Reporter kan hente salgsrapporter når Apple-kontoen er koblet til.",
    documentationUrl: "https://help.apple.com/itc/transporteruserguide/",
  },
  google_play_books: {
    id: "google_play_books",
    name: "Google Play Books",
    deliveryMode: "manual_portal",
    deliveryLabel: "Partner Center / ONIX",
    automatedDelivery: false,
    requiresConnection: false,
    approvalRequired: true,
    capabilities: {
      publish: "manual",
      metadata: "file_import",
      pricing: "file_import",
      sales: "file_import",
      discovery: "automated",
      advertising: "unavailable",
    },
    notes: "Google Books API er for katalog og søk. Utgiverlevering skjer via Partner Center, regneark eller ONIX.",
    documentationUrl: "https://support.google.com/books/partner/answer/3297509",
  },
  kobo_writing_life: {
    id: "kobo_writing_life",
    name: "Kobo Writing Life",
    deliveryMode: "manual_portal",
    deliveryLabel: "Kobo Writing Life",
    automatedDelivery: false,
    requiresConnection: false,
    approvalRequired: true,
    capabilities: {
      publish: "manual",
      metadata: "manual",
      pricing: "manual",
      sales: "file_import",
      discovery: "unavailable",
      advertising: "unavailable",
    },
    notes: "Direkte utgivelse klargjøres av RealtyFlow og fullføres i Kobo-portalen, eller via en godkjent aggregator.",
    documentationUrl: "https://kobowritinglife.zendesk.com/hc/en-us/articles/360059385791",
  },
  publishdrive: {
    id: "publishdrive",
    name: "PublishDrive",
    deliveryMode: "aggregator",
    deliveryLabel: "PublishDrive partnerintegrasjon",
    automatedDelivery: true,
    requiresConnection: true,
    approvalRequired: true,
    capabilities: {
      publish: "partner_only",
      metadata: "partner_only",
      pricing: "partner_only",
      sales: "partner_only",
      discovery: "unavailable",
      advertising: "partner_only",
    },
    notes: "Aggregator-sporet kan gi bred distribusjon, men API-/partneradgang må godkjennes og kobles til først.",
    documentationUrl: "https://publishdrive.com/publishdrive-api.html",
  },
  direct_store: {
    id: "direct_store",
    name: "books.freddybremseth.com",
    deliveryMode: "internal_api",
    deliveryLabel: "RealtyFlow Direct Store",
    automatedDelivery: true,
    requiresConnection: false,
    approvalRequired: true,
    capabilities: {
      publish: "automated",
      metadata: "automated",
      pricing: "automated",
      sales: "automated",
      discovery: "automated",
      advertising: "unavailable",
    },
    notes: "Egen kanal. Godkjente bokpakker publiseres automatisk med privat EPUB-lagring, butikkmetadata og salgsmåling.",
    documentationUrl: "https://books.freddybremseth.com",
  },
};

export type KdpSelectEnrollment = "enrolled" | "not_enrolled" | "unknown";

export type DistributionPackage = {
  title: string;
  language: string;
  chapterCount: number;
  hasEpubSource: boolean;
  hasCover: boolean;
  hasDescription: boolean;
  keywordCount: number;
  categoryCount: number;
  rightsConfirmed: boolean;
  aiDisclosureReviewed: boolean;
  kdpSelectEnrollment: KdpSelectEnrollment;
  selectedChannels: PublishingChannelId[];
};

export type PreflightFinding = {
  code: string;
  severity: "blocker" | "warning" | "info";
  message: string;
};

export type DistributionPreflight = {
  channel: PublishingChannelId;
  ready: boolean;
  findings: PreflightFinding[];
};

function finding(code: string, severity: PreflightFinding["severity"], message: string): PreflightFinding {
  return { code, severity, message };
}

export function evaluateDistributionPreflight(
  channel: PublishingChannelId,
  book: DistributionPackage,
  options: { connectionReady?: boolean; phase?: "prepare" | "submit" } = {},
): DistributionPreflight {
  const definition = PUBLISHING_CHANNELS[channel];
  const phase = options.phase ?? "prepare";
  const findings: PreflightFinding[] = [];

  if (!book.title.trim()) findings.push(finding("TITLE_MISSING", "blocker", "Boken mangler tittel."));
  if (!book.language.trim()) findings.push(finding("LANGUAGE_MISSING", "blocker", "Boken mangler språk."));
  if (book.chapterCount < 1 || !book.hasEpubSource) {
    findings.push(finding("EPUB_SOURCE_MISSING", "blocker", "Boken mangler ferdig kapittelinnhold for EPUB."));
  }
  if (!book.hasCover) findings.push(finding("COVER_MISSING", "blocker", "Boken mangler ferdig omslag."));
  if (!book.hasDescription || book.keywordCount < 1 || book.categoryCount < 1) {
    findings.push(finding("SALES_METADATA_INCOMPLETE", "blocker", "Beskrivelse, søkeord og kategori må være klare."));
  }
  if (!book.rightsConfirmed) findings.push(finding("RIGHTS_NOT_CONFIRMED", "blocker", "Publiseringsrettigheter må bekreftes."));
  if (!book.aiDisclosureReviewed) {
    findings.push(finding("AI_DISCLOSURE_NOT_REVIEWED", "blocker", "Bruk av AI-generert innhold må gjennomgås og oppgis korrekt for målkanalen."));
  }

  const wideChannels = book.selectedChannels.filter((id) => id !== "amazon_kdp");
  if (book.selectedChannels.includes("amazon_kdp") && wideChannels.length > 0) {
    if (book.kdpSelectEnrollment === "enrolled") {
      findings.push(finding("KDP_SELECT_EXCLUSIVITY_CONFLICT", "blocker", "KDP Select-eksklusivitet er i konflikt med bred e-bokdistribusjon."));
    } else if (book.kdpSelectEnrollment === "unknown") {
      findings.push(finding("KDP_SELECT_STATUS_UNKNOWN", "warning", "Bekreft at e-boken ikke er bundet av KDP Select før bred distribusjon."));
    }
  }

  if (phase === "submit" && definition.requiresConnection && !options.connectionReady) {
    findings.push(finding("CHANNEL_NOT_CONNECTED", "blocker", `${definition.name} er ikke koblet til RealtyFlow.`));
  }
  if (!definition.automatedDelivery) {
    findings.push(finding("MANUAL_HANDOFF_REQUIRED", "info", `${definition.name} krever manuell ferdigstilling i ${definition.deliveryLabel}.`));
  }

  return {
    channel,
    ready: !findings.some((item) => item.severity === "blocker"),
    findings,
  };
}

export function isPublishingChannelId(value: unknown): value is PublishingChannelId {
  return typeof value === "string" && (PUBLISHING_CHANNEL_IDS as readonly string[]).includes(value);
}
