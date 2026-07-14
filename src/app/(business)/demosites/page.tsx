"use client";

import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle, CreditCard, ExternalLink, FileText, Globe, History, ImageIcon, Link2, Loader2, MonitorSmartphone, Palette, PlusCircle, Rocket, Search, Send, Sparkles, Trash2, Wallet, XCircle } from "lucide-react";
import { DemoSitePreviewRenderer } from "@/components/demosites/demo-site-preview-renderer";
import { TempDemoCard } from "@/components/demosites/temp-demo-card";
import { LeadPipelineCard } from "@/components/demosites/lead-pipeline-card";
import { buildVersionedImportReviewEditableFields, getImportReviewVersions, IMPORT_REVIEW_VERSIONS_KEY, type ImportReviewVersion } from "@/lib/demosites-import-review-versions";
import { DEMO_SITE_PACKAGES, DEMO_SITE_TEMPLATE_SEEDS, formatNok, type DemoSiteBillingStatus, type DemoSitePackageId, type DemoSiteStatus } from "@/lib/demosites";

type DemoSiteOrder = {
  id: string;
  order_number: string;
  status: DemoSiteStatus;
  billing_status: DemoSiteBillingStatus;
  customer_name: string;
  customer_email: string;
  customer_phone?: string | null;
  company_name: string;
  industry?: string | null;
  website_url?: string | null;
  package_id: DemoSitePackageId;
  setup_fee_nok: number;
  monthly_fee_nok: number;
  setup_cost_nok: number;
  monthly_cost_nok: number;
  template_slug?: string | null;
  target_subdomain?: string | null;
  preview_url?: string | null;
  claim_url?: string | null;
  claimed_at?: string | null;
  expires_at?: string | null;
  production_url?: string | null;
  claim_token?: string | null;
  logo_url?: string | null;
  brand_color?: string | null;
  editable_fields?: Record<string, unknown> | null;
  notes?: string | null;
  created_at?: string;
};

type DemoSiteTemplate = { slug: string; name: string; description?: string; preview_url?: string };
type DemoSiteSummary = { totalOrders: number; activeOrders: number; paidOrders: number; bookedSetupRevenue: number; activeMrr: number; setupCosts: number; monthlyCosts: number; netSetup: number; netMrr: number; arr: number };
type DemoSiteEvent = { id: string; order_id: string; event_type: string; title: string; description?: string | null; created_at?: string };
type WebsiteImportMode = "new" | "existing";
type WebsiteImportFormState = { website_url: string; company_name: string; mode: WebsiteImportMode; order_id: string };
type WebsiteImportContactState = { customer_name: string; customer_email: string; customer_phone: string };
type ImportedFaqItem = { question?: string; answer?: string };
type ImportReviewQualityLevel = "ready" | "improve" | "missing";
type TemplateDetection = {
  selected_template_slug?: string;
  confidence_level?: "high" | "medium" | "low" | string;
  reason?: string;
  matched_keywords?: string[];
  score?: number;
  fallback_used?: boolean;
  considered_templates?: Array<{
    template_slug?: string;
    score?: number;
    matched_keywords?: string[];
    accepted?: boolean;
  }>;
};
type ImportedProfile = {
  company_name?: string;
  website_url?: string;
  title?: string;
  description?: string;
  summary?: string;
  detected_industry?: string;
  recommended_template_slug?: string;
  logo_url?: string;
  image_urls?: string[];
  colors?: { primary?: string; secondary?: string; accent?: string };
  services?: string[];
  products?: string[];
  prices?: string[];
  trust_points?: string[];
  faq?: ImportedFaqItem[];
  contact?: { email?: string; phone?: string; address?: string };
  confidence_score?: number;
  source_pages?: string[];
  template_detection?: TemplateDetection;
};
type WebsiteImportResult = { profile: ImportedProfile; editable_fields: Record<string, unknown>; warnings: string[]; import_id?: string | null };
type WebsiteImportReviewPatch = { profile?: Partial<ImportedProfile>; editable_fields?: Record<string, unknown> };
type ImportReviewQualityItem = { id: string; label: string; status: ImportReviewQualityLevel; detail: string; critical?: boolean };
type ImportReviewQuality = { readyCount: number; totalCount: number; criticalMissing: boolean; items: ImportReviewQualityItem[] };
type WebsiteImportSuccess = { title: string; order?: DemoSiteOrder | null };
type WebsiteImportHistoryItem = {
  id: string;
  website_url: string;
  company_name?: string | null;
  detected_industry?: string | null;
  recommended_template_slug?: string | null;
  confidence_score?: number | string | null;
  profile?: ImportedProfile | null;
  editable_fields?: Record<string, unknown> | null;
  warnings?: string[] | null;
  source_pages?: string[] | null;
  created_order_id?: string | null;
  applied_order_id?: string | null;
  status?: "analyzed" | "created_demo" | "applied_to_demo" | "discarded" | string;
  created_at?: string;
  updated_at?: string;
};

type OrderFormState = {
  company_name: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  industry: string;
  website_url: string;
  package_id: DemoSitePackageId;
  template_slug: string;
  setup_cost_nok: string;
  monthly_cost_nok: string;
  notes: string;
};

const EMPTY_SUMMARY: DemoSiteSummary = { totalOrders: 0, activeOrders: 0, paidOrders: 0, bookedSetupRevenue: 0, activeMrr: 0, setupCosts: 0, monthlyCosts: 0, netSetup: 0, netMrr: 0, arr: 0 };
const DEFAULT_TEMPLATE_SLUG = DEMO_SITE_TEMPLATE_SEEDS[0]?.slug || "elektro";
const DEFAULT_TEMPLATES = DEMO_SITE_TEMPLATE_SEEDS as DemoSiteTemplate[];
const INITIAL_FORM: OrderFormState = { company_name: "", customer_name: "", customer_email: "", customer_phone: "", industry: "", website_url: "", package_id: "standard", template_slug: DEFAULT_TEMPLATE_SLUG, setup_cost_nok: "0", monthly_cost_nok: "0", notes: "" };
const INITIAL_IMPORT_FORM: WebsiteImportFormState = { website_url: "", company_name: "", mode: "new", order_id: "" };
const INITIAL_IMPORT_CONTACT: WebsiteImportContactState = { customer_name: "", customer_email: "", customer_phone: "" };
const IMPORT_REVIEW_MANUAL_SOURCE = "manual";

const statusLabel: Record<DemoSiteStatus, string> = { lead: "Lead", draft_preview: "Midlertidig demo", ordered: "Bestilt", in_setup: "Oppsett", preview_ready: "Preview", approved: "Godkjent", deployed: "Live", paused: "Pauset", expired: "Utløpt", cancelled: "Kansellert" };
const billingLabel: Record<DemoSiteBillingStatus, string> = { not_invoiced: "Ikke fakturert", pending: "Venter", paid: "Betalt", overdue: "Forfalt", cancelled: "Stoppet" };
const importStatusLabel: Record<string, string> = { analyzed: "Analysert", created_demo: "Demo opprettet", applied_to_demo: "Brukt på demo", discarded: "Forkastet" };

function formatDate(value?: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("nb-NO", { dateStyle: "medium" }).format(new Date(value));
}

function formatDateTime(value?: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("nb-NO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function getEditableFields(order: DemoSiteOrder) {
  return order.editable_fields && typeof order.editable_fields === "object" ? order.editable_fields : {};
}

function editableFieldList(order: DemoSiteOrder) {
  const fields = Object.keys(getEditableFields(order));
  return fields.length ? fields : ["logo", "adresse", "kontaktinfo", "priser", "tjenester", "produkter", "tekstfelt", "farger"];
}

function getAssetSummary(order: DemoSiteOrder) {
  const fields = getEditableFields(order);
  const galleryImages = Array.isArray(fields.gallery_images) ? fields.gallery_images : [];
  const hasLogo = Boolean(order.logo_url || fields.logo_url);
  return { hasLogo, imageCount: galleryImages.length };
}

function customerPreviewUrl(order: DemoSiteOrder) {
  if (order.preview_url?.includes("/demosites/preview/")) return order.preview_url;
  if (order.claim_url?.includes("/demosites/claim/")) return order.claim_url.replace("/demosites/claim/", "/demosites/preview/");
  return order.preview_url || "";
}

function getPreviewToken(order: DemoSiteOrder) {
  if (order.claim_token) return order.claim_token;
  const tokenMatch = [order.preview_url, order.claim_url]
    .map((url) => String(url || "").match(/\/demosites\/(?:preview|claim)\/([^/?#]+)/)?.[1])
    .find(Boolean);
  return tokenMatch || "";
}

function getTemplateLabel(templates: DemoSiteTemplate[], slug?: string | null) {
  if (!slug) return "Ikke valgt";
  return templates.find((template) => template.slug === slug)?.name || slug;
}

function getColorSwatches(colors?: ImportedProfile["colors"]) {
  if (!colors) return [];
  return [
    { label: "Primær", value: colors.primary },
    { label: "Sekundær", value: colors.secondary },
    { label: "Aksent", value: colors.accent },
  ].filter((item): item is { label: string; value: string } => Boolean(item.value));
}

function getImportOrderLinks(order?: DemoSiteOrder | null) {
  if (!order) return { previewUrl: "", setupUrl: "", claimUrl: "" };
  return {
    previewUrl: customerPreviewUrl(order),
    setupUrl: order.id ? `/demosites/setup/${order.id}` : "",
    claimUrl: order.claim_url || "",
  };
}

function getImportFallbackEmail(companyName: string) {
  const slug = companyName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "kunde";
  return `demosites-import+${slug}@chatgenius.pro`;
}

function getApiErrorMessage(data: Record<string, unknown>) {
  return [data.error, data.details, data.code].filter(Boolean).join(" ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasPreviewValue(value: unknown) {
  if (Array.isArray(value)) return value.filter(Boolean).length > 0;
  if (isRecord(value)) return Object.values(value).some((item) => String(item || "").trim().length > 0);
  return String(value || "").trim().length > 0;
}

function previewSourceLabel(source: unknown, value: unknown) {
  if (source === IMPORT_REVIEW_MANUAL_SOURCE) return "Redigert";
  if (source === "website") return "Fra nettside";
  if (source === "template") return "Fra mal";
  if (source === "missing") return "Mangler – bruker standard";
  return hasPreviewValue(value) ? "Fra mal" : "Mangler – bruker standard";
}

function previewValueSummary(value: unknown) {
  if (Array.isArray(value)) {
    const list = value.map((item) => String(item || "").trim()).filter(Boolean);
    if (!list.length) return "Bruker standard fra valgt mal.";
    return `${list[0]}${list.length > 1 ? ` + ${list.length - 1} til` : ""}`;
  }
  if (isRecord(value)) {
    const count = Object.values(value).filter((item) => String(item || "").trim()).length;
    return count ? `${count} felt fylt ut` : "Bruker standard fra valgt mal.";
  }
  return String(value || "").trim() || "Bruker standard fra valgt mal.";
}

function normalizeImportHistorySearch(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function buildImportResultFromHistory(importItem: WebsiteImportHistoryItem): WebsiteImportResult | null {
  if (!importItem.profile || !importItem.editable_fields) return null;
  const templateDetection = isRecord(importItem.profile.template_detection)
    ? importItem.profile.template_detection
    : isRecord(importItem.editable_fields.profile_import_template_detection)
      ? importItem.editable_fields.profile_import_template_detection
      : undefined;
  return {
    profile: {
      ...importItem.profile,
      company_name: importItem.profile.company_name || importItem.company_name || "",
      website_url: importItem.profile.website_url || importItem.website_url,
      detected_industry: importItem.profile.detected_industry || importItem.detected_industry || undefined,
      recommended_template_slug: importItem.profile.recommended_template_slug || importItem.recommended_template_slug || undefined,
      confidence_score: importItem.profile.confidence_score ?? (Number(importItem.confidence_score) || undefined),
      source_pages: importItem.profile.source_pages || importItem.source_pages || [],
      template_detection: templateDetection,
    },
    editable_fields: importItem.editable_fields,
    warnings: Array.isArray(importItem.warnings) ? importItem.warnings : [],
    import_id: importItem.id,
  };
}

function buildContactFromImportProfile(importItem: WebsiteImportHistoryItem): WebsiteImportContactState {
  const profile = importItem.profile;
  return {
    customer_name: profile?.company_name || importItem.company_name || "",
    customer_email: profile?.contact?.email || "",
    customer_phone: profile?.contact?.phone || "",
  };
}

function isUsedImportHistoryItem(importItem: WebsiteImportHistoryItem) {
  return Boolean(
    importItem.status === "created_demo" ||
    importItem.status === "applied_to_demo" ||
    importItem.created_order_id ||
    importItem.applied_order_id,
  );
}

function getImportHistoryOrderId(importItem: WebsiteImportHistoryItem) {
  return importItem.created_order_id || importItem.applied_order_id || "";
}

function cloneImportResult(result: WebsiteImportResult): WebsiteImportResult {
  return JSON.parse(JSON.stringify(result)) as WebsiteImportResult;
}

function stringField(value: unknown) {
  return typeof value === "string" ? value : "";
}

function listFieldToText(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean).join("\n") : "";
}

function textToListField(value: string) {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function faqToText(items?: unknown) {
  const list = Array.isArray(items) ? items : [];
  return list
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (!isRecord(item)) return "";
      return [item.question || "", item.answer || ""].map((part) => String(part || "").trim()).filter(Boolean).join(" | ");
    })
    .filter(Boolean)
    .join("\n");
}

function textToFaq(value: string): ImportedFaqItem[] {
  return value.split(/\r?\n/).map((line) => {
    const [question = "", ...answerParts] = line.split("|");
    return { question: question.trim(), answer: answerParts.join("|").trim() };
  }).filter((item) => item.question || item.answer);
}

function withManualImportReviewSources(fields: Record<string, unknown>, editedKeys: string[]) {
  if (!editedKeys.length) return fields;
  const currentSources = isRecord(fields.profile_import_field_sources) ? fields.profile_import_field_sources : {};
  const nextSources = { ...currentSources };
  editedKeys.forEach((key) => {
    if (key !== "profile_import_field_sources") nextSources[key] = IMPORT_REVIEW_MANUAL_SOURCE;
  });
  return { ...fields, profile_import_field_sources: nextSources };
}

function getImportReviewValue(result: WebsiteImportResult, key: string) {
  const fields = result.editable_fields || {};
  const profile = result.profile || {};
  if (key === "company_name") return profile.company_name || "";
  if (key === "recommended_template_slug") return profile.recommended_template_slug || fields.template_slug || "";
  if (key === "logo_url") return fields.logo_url || profile.logo_url || "";
  if (key === "brand_color") return fields.brand_color || profile.colors?.primary || "";
  if (key === "secondary_color") return fields.secondary_color || profile.colors?.secondary || "";
  if (key === "accent_color") return fields.accent_color || profile.colors?.accent || "";
  if (fields[key] !== undefined) return fields[key];
  return (profile as Record<string, unknown>)[key];
}

function getImportReviewList(result: WebsiteImportResult, key: string) {
  const value = getImportReviewValue(result, key);
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  if (typeof value === "string") return textToListField(value);
  if (key === "gallery_images") return getImportReviewList({ ...result, editable_fields: { ...result.editable_fields, gallery_images: result.profile.image_urls || [] } }, "gallery_images");
  return [];
}

function getImportReviewFaqList(result: WebsiteImportResult) {
  const value = getImportReviewValue(result, "faq") || result.profile.faq || [];
  if (!Array.isArray(value)) return [];
  return value.filter((item) => {
    if (typeof item === "string") return item.trim().length > 0;
    if (!isRecord(item)) return false;
    return String(item.question || item.answer || "").trim().length > 0;
  });
}

function getImportReviewStatus(hasValue: boolean, hasPartial = false): ImportReviewQualityLevel {
  if (hasValue) return "ready";
  if (hasPartial) return "improve";
  return "missing";
}

function getImportReviewQuality(result: WebsiteImportResult): ImportReviewQuality {
  const services = getImportReviewList(result, "services");
  const products = getImportReviewList(result, "products");
  const prices = getImportReviewList(result, "prices");
  const trustPoints = getImportReviewList(result, "trust_points");
  const galleryImages = getImportReviewList(result, "gallery_images");
  const faq = getImportReviewFaqList(result);

  const items: ImportReviewQualityItem[] = [
    {
      id: "company_name",
      label: "Bedriftsnavn",
      status: getImportReviewStatus(Boolean(String(getImportReviewValue(result, "company_name") || "").trim())),
      detail: "Brukes i hero, CRM og demooppsett.",
      critical: true,
    },
    {
      id: "recommended_template_slug",
      label: "Demo-mal",
      status: getImportReviewStatus(Boolean(String(getImportReviewValue(result, "recommended_template_slug") || "").trim())),
      detail: "Avgjør bransjeuttrykk og standardfelter.",
      critical: true,
    },
    {
      id: "hero_title",
      label: "Hero-tittel",
      status: getImportReviewStatus(Boolean(String(getImportReviewValue(result, "hero_title") || "").trim())),
      detail: "Første store budskap i preview.",
      critical: true,
    },
    {
      id: "hero_subtitle",
      label: "Hero-undertittel",
      status: getImportReviewStatus(Boolean(String(getImportReviewValue(result, "hero_subtitle") || "").trim())),
      detail: "Forklarer tilbudet raskt.",
    },
    {
      id: "intro_text",
      label: "Intro",
      status: getImportReviewStatus(Boolean(String(getImportReviewValue(result, "intro_text") || "").trim())),
      detail: "Gjør demoen mindre generisk.",
      critical: true,
    },
    {
      id: "services",
      label: "Minst 3 tjenester",
      status: getImportReviewStatus(services.length >= 3, services.length > 0),
      detail: `${services.length} tjeneste${services.length === 1 ? "" : "r"} funnet.`,
      critical: true,
    },
    {
      id: "products_or_prices",
      label: "Pakker eller priser",
      status: getImportReviewStatus(products.length > 0 || prices.length > 0),
      detail: `${products.length} pakke${products.length === 1 ? "" : "r"}, ${prices.length} prislinje${prices.length === 1 ? "" : "r"}.`,
    },
    {
      id: "trust_points",
      label: "Minst 2 trygghetspunkter",
      status: getImportReviewStatus(trustPoints.length >= 2, trustPoints.length > 0),
      detail: `${trustPoints.length} punkt${trustPoints.length === 1 ? "" : "er"} funnet.`,
    },
    {
      id: "call_to_action",
      label: "CTA",
      status: getImportReviewStatus(Boolean(String(getImportReviewValue(result, "call_to_action") || "").trim())),
      detail: "Forteller kunden hva neste steg er.",
    },
    {
      id: "contact_text",
      label: "Kontakttekst",
      status: getImportReviewStatus(Boolean(String(getImportReviewValue(result, "contact_text") || "").trim())),
      detail: "Brukes i kontaktseksjonen.",
    },
    {
      id: "logo_url",
      label: "Logo",
      status: getImportReviewStatus(Boolean(String(getImportReviewValue(result, "logo_url") || "").trim())),
      detail: "Gir demoen tydelig kundepreg.",
    },
    {
      id: "gallery_images",
      label: "Minst 1 bilde",
      status: getImportReviewStatus(galleryImages.length > 0),
      detail: `${galleryImages.length} bilde${galleryImages.length === 1 ? "" : "r"} funnet.`,
    },
    {
      id: "brand_color",
      label: "Brand-farge",
      status: getImportReviewStatus(Boolean(String(getImportReviewValue(result, "brand_color") || "").trim())),
      detail: "Brukes som primærfarge i preview.",
    },
    {
      id: "faq",
      label: "Minst 2 FAQ",
      status: getImportReviewStatus(faq.length >= 2, faq.length > 0),
      detail: `${faq.length} spørsmål/svar funnet.`,
    },
  ];

  return {
    readyCount: items.filter((item) => item.status === "ready").length,
    totalCount: items.length,
    criticalMissing: items.some((item) => item.critical && item.status !== "ready"),
    items,
  };
}

export default function DemoSitesPage() {
  const [orders, setOrders] = useState<DemoSiteOrder[]>([]);
  const [templates, setTemplates] = useState<DemoSiteTemplate[]>(DEFAULT_TEMPLATES);
  const [events, setEvents] = useState<DemoSiteEvent[]>([]);
  const [summary, setSummary] = useState<DemoSiteSummary>(EMPTY_SUMMARY);
  const [form, setForm] = useState<OrderFormState>(INITIAL_FORM);
  const [importForm, setImportForm] = useState<WebsiteImportFormState>(INITIAL_IMPORT_FORM);
  const [importContact, setImportContact] = useState<WebsiteImportContactState>(INITIAL_IMPORT_CONTACT);
  const [importResult, setImportResult] = useState<WebsiteImportResult | null>(null);
  const [originalImportResult, setOriginalImportResult] = useState<WebsiteImportResult | null>(null);
  const [importHistory, setImportHistory] = useState<WebsiteImportHistoryItem[]>([]);
  const [importHistoryWarning, setImportHistoryWarning] = useState<string | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importSaving, setImportSaving] = useState(false);
  const [importReviewSaving, setImportReviewSaving] = useState(false);
  const [importReviewMessage, setImportReviewMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<WebsiteImportSuccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DemoSiteOrder | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const [enrichingOrderId, setEnrichingOrderId] = useState<string | null>(null);
  const [regeneratingOrderId, setRegeneratingOrderId] = useState<string | null>(null);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);

  const loadImportHistory = useCallback(async () => {
    setImportHistoryWarning(null);
    try {
      const response = await fetch("/api/saas/demosites/imports?limit=25", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Kunne ikke hente importhistorikk.");
      setImportHistory(Array.isArray(data.imports) ? data.imports : []);
      setImportHistoryWarning(data.warning || null);
    } catch (err) {
      setImportHistoryWarning(err instanceof Error ? err.message : "Kunne ikke hente importhistorikk.");
      setImportHistory([]);
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/saas/demosites", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunne ikke hente DemoSites CRM.");
      setOrders(Array.isArray(data.orders) ? data.orders : []);
      setTemplates(Array.isArray(data.templates) && data.templates.length ? data.templates : DEFAULT_TEMPLATES);
      setEvents(Array.isArray(data.events) ? data.events : []);
      setSummary(data.summary || EMPTY_SUMMARY);
      if (data.error) setError(data.error);
      await loadImportHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke hente DemoSites CRM.");
    } finally {
      setLoading(false);
    }
  }, [loadImportHistory]);

  useEffect(() => { loadData(); }, [loadData]);

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/saas/demosites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, setup_cost_nok: Number(form.setup_cost_nok) || 0, monthly_cost_nok: Number(form.monthly_cost_nok) || 0 }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Bestilling feilet.");
      setForm(INITIAL_FORM);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bestilling feilet.");
    } finally {
      setSaving(false);
    }
  }

  async function updateOrder(order: DemoSiteOrder, patch: Partial<DemoSiteOrder>) {
    const response = await fetch("/api/saas/demosites", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: order.id, ...patch }) });
    const data = await response.json();
    if (!response.ok) setError(data.error || "Oppdatering feilet.");
    await loadData();
  }

  async function enrichOrder(order: DemoSiteOrder) {
    setEnrichingOrderId(order.id);
    setError(null);
    try {
      const response = await fetch("/api/saas/demosites/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: order.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Berikelse feilet.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Berikelse feilet.");
    } finally {
      setEnrichingOrderId(null);
    }
  }

  // "Lag nye bilder": throw away the current gallery (bad photos from the
  // customer's old site) and rebuild it with fresh AI-generated images.
  async function regenerateOrderImages(order: DemoSiteOrder) {
    if (!window.confirm(`Erstatte alle bildene i demoen til ${order.company_name} med nye AI-genererte bilder?`)) return;
    setRegeneratingOrderId(order.id);
    setError(null);
    try {
      const response = await fetch("/api/saas/demosites/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: order.id, regenerate_images: true, images_only: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Bildegenerering feilet.");
      if (data.result && !data.result.generatedImages) {
        setError("Ingen nye bilder ble generert — sjekk at GEMINI_API_KEY er satt.");
      }
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bildegenerering feilet.");
    } finally {
      setRegeneratingOrderId(null);
    }
  }

  function openDeleteOrder(order: DemoSiteOrder) {
    setDeleteTarget(order);
    setDeleteConfirmText("");
    setDeleteMessage(null);
    setError(null);
  }

  function closeDeleteOrder() {
    if (deletingOrderId) return;
    setDeleteTarget(null);
    setDeleteConfirmText("");
  }

  async function deleteOrder() {
    if (!deleteTarget || deleteConfirmText !== "SLETT") return;
    const order = deleteTarget;
    setDeletingOrderId(order.id);
    setError(null);
    setDeleteMessage(null);
    try {
      const response = await fetch(`/api/saas/demosites?id=${encodeURIComponent(order.id)}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(getApiErrorMessage(data) || data.error || "Sletting feilet.");

      setOrders((current) => current.filter((item) => item.id !== order.id));
      setEvents((current) => current.filter((event) => event.order_id !== order.id));
      setSummary(data.summary || EMPTY_SUMMARY);
      setImportForm((current) => (current.order_id === order.id ? { ...current, order_id: "" } : current));
      setDeleteTarget(null);
      setDeleteConfirmText("");
      setDeleteMessage("Demo slettet.");
      await loadImportHistory();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ukjent feil.";
      setError(`Kunne ikke slette demo: ${message}`);
    } finally {
      setDeletingOrderId(null);
    }
  }

  async function analyzeWebsiteImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setImportLoading(true);
    setImportError(null);
    setImportSuccess(null);
    setImportReviewMessage(null);
    setImportResult(null);
    setOriginalImportResult(null);
    try {
      const response = await fetch("/api/saas/demosites/profile-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          website_url: importForm.website_url,
          company_name: importForm.company_name || undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Kunne ikke analysere nettsiden.");
      if (!data.profile || !data.editable_fields) throw new Error("Analysen mangler profil eller redigerbare felt.");
      const nextResult = {
        profile: data.profile as ImportedProfile,
        editable_fields: data.editable_fields as Record<string, unknown>,
        warnings: Array.isArray(data.warnings) ? data.warnings : [],
        import_id: data.import_id || null,
      };
      setImportResult(nextResult);
      setOriginalImportResult(cloneImportResult(nextResult));
      setImportContact({
        customer_name: nextResult.profile.company_name || importForm.company_name || "",
        customer_email: nextResult.profile.contact?.email || "",
        customer_phone: nextResult.profile.contact?.phone || "",
      });
      await loadImportHistory();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Kunne ikke analysere nettsiden.");
    } finally {
      setImportLoading(false);
    }
  }

  function useSavedImport(importItem: WebsiteImportHistoryItem, mode: WebsiteImportMode = "new") {
    const nextResult = buildImportResultFromHistory(importItem);
    if (!nextResult) {
      setImportError("Analysen mangler lagret profil eller redigerbare felt.");
      return;
    }

    const nextContact = buildContactFromImportProfile(importItem);
    setImportResult(nextResult);
    setOriginalImportResult(cloneImportResult(nextResult));
    setImportError(null);
    setImportSuccess(null);
    setImportReviewMessage(null);
    setImportForm((prev) => ({
      ...prev,
      website_url: nextResult.profile.website_url || prev.website_url,
      company_name: nextResult.profile.company_name || prev.company_name,
      mode,
    }));
    setImportContact(nextContact);
  }

  async function patchImportHistory(importId: string | null | undefined, patch: Record<string, unknown>) {
    if (!importId) return;
    try {
      const response = await fetch("/api/saas/demosites/imports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: importId, ...patch }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        console.error("DemoSites import history update failed:", data);
        return;
      }
      await loadImportHistory();
    } catch (err) {
      console.error("DemoSites import history update failed:", err);
    }
  }

  async function discardImport(importItem: WebsiteImportHistoryItem) {
    const label = importItem.company_name || importItem.website_url || "denne analysen";
    if (!window.confirm(`Slette analysen for ${label}? Dette kan ikke angres.`)) return;

    try {
      const response = await fetch(`/api/saas/demosites/imports?id=${encodeURIComponent(String(importItem.id || ""))}`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Kunne ikke slette analysen.");
      await loadImportHistory();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Kunne ikke slette analysen.");
      return;
    }

    if (importResult?.import_id === importItem.id) {
      setImportResult(null);
      setOriginalImportResult(null);
      setImportSuccess(null);
      setImportReviewMessage(null);
    }
  }

  async function createDemoFromImport(resultOverride?: WebsiteImportResult, contactOverride?: WebsiteImportContactState) {
    const activeResult = resultOverride || importResult;
    if (!activeResult) return;
    const activeContact = contactOverride || importContact;
    const profile = activeResult.profile;
    const companyName = (profile.company_name || importForm.company_name || "").trim();
    const customerName = (activeContact.customer_name || companyName).trim();
    const importedCustomerEmail = activeContact.customer_email.trim();
    const customerEmail = importedCustomerEmail || getImportFallbackEmail(companyName);
    if (!companyName) {
      setImportError("Kunne ikke opprette demo fra analyse: analysen mangler bedriftsnavn.");
      return;
    }

    setImportSaving(true);
    setImportError(null);
    setImportSuccess(null);
    try {
      const response = await fetch("/api/saas/demosites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "in_setup",
          company_name: companyName,
          customer_name: customerName,
          customer_email: customerEmail,
          customer_phone: activeContact.customer_phone || profile.contact?.phone || undefined,
          industry: profile.detected_industry || undefined,
          website_url: profile.website_url || importForm.website_url,
          source_url: profile.website_url || importForm.website_url,
          package_id: "standard",
          template_slug: profile.recommended_template_slug || DEFAULT_TEMPLATE_SLUG,
          logo_url: profile.logo_url || activeResult.editable_fields.logo_url || undefined,
          brand_color: profile.colors?.primary || activeResult.editable_fields.brand_color || undefined,
          extracted_profile: profile,
          editable_fields: activeResult.editable_fields,
          notes: [
            `Importert fra nettsideanalyse: ${profile.website_url || importForm.website_url}`,
            !importedCustomerEmail && "Ingen offentlig e-post funnet; intern importadresse brukt for CRM-rad. Ingen automatisk kundekontakt er sendt.",
          ].filter(Boolean).join("\n"),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        console.error("DemoSites import create failed:", data);
        throw new Error(getApiErrorMessage(data) || "Ukjent API-feil.");
      }
      const createdOrder = (data.order || null) as DemoSiteOrder | null;
      await patchImportHistory(activeResult.import_id, { created_order_id: createdOrder?.id || null, status: "created_demo" });
      setImportSuccess({ title: `${companyName} er opprettet som ny demo.`, order: createdOrder });
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ukjent feil.";
      setImportError(`Kunne ikke opprette demo fra analyse: ${message}`);
    } finally {
      setImportSaving(false);
    }
  }

  async function createDemoFromSavedImport(importItem: WebsiteImportHistoryItem) {
    if (isUsedImportHistoryItem(importItem)) {
      setImportError("Denne analysen er allerede brukt til demo.");
      return;
    }

    const nextResult = buildImportResultFromHistory(importItem);
    if (!nextResult) {
      setImportError("Analysen mangler lagret profil eller redigerbare felt.");
      return;
    }

    const nextContact = buildContactFromImportProfile(importItem);
    setImportResult(nextResult);
    setOriginalImportResult(cloneImportResult(nextResult));
    setImportError(null);
    setImportSuccess(null);
    setImportReviewMessage(null);
    setImportForm((prev) => ({
      ...prev,
      website_url: nextResult.profile.website_url || prev.website_url,
      company_name: nextResult.profile.company_name || prev.company_name,
      mode: "new",
    }));
    setImportContact(nextContact);
    await createDemoFromImport(nextResult, nextContact);
  }

  function updateImportReview(patch: WebsiteImportReviewPatch) {
    const previousCompanyName = importResult?.profile.company_name || "";
    setImportResult((current) => {
      if (!current) return current;
      const editedKeys = Object.keys(patch.editable_fields || {});
      const nextEditableFields = withManualImportReviewSources(
        {
          ...current.editable_fields,
          ...(patch.editable_fields || {}),
        },
        editedKeys,
      );

      return {
        ...current,
        profile: {
          ...current.profile,
          ...(patch.profile || {}),
        },
        editable_fields: nextEditableFields,
      };
    });
    if (patch.profile?.company_name !== undefined) {
      const nextCompanyName = patch.profile.company_name || "";
      setImportForm((prev) => ({ ...prev, company_name: nextCompanyName }));
      setImportContact((prev) => (
        !prev.customer_name || prev.customer_name === previousCompanyName
          ? { ...prev, customer_name: nextCompanyName }
          : prev
      ));
    }
    setImportReviewMessage(null);
    setImportError(null);
  }

  function resetImportReview() {
    if (!originalImportResult) return;
    const nextResult = cloneImportResult(originalImportResult);
    setImportResult(nextResult);
    setImportContact({
      customer_name: nextResult.profile.company_name || "",
      customer_email: nextResult.profile.contact?.email || "",
      customer_phone: nextResult.profile.contact?.phone || "",
    });
    setImportForm((prev) => ({
      ...prev,
      website_url: nextResult.profile.website_url || prev.website_url,
      company_name: nextResult.profile.company_name || prev.company_name,
    }));
    setImportReviewMessage(null);
    setImportError(null);
  }

  function restoreImportReviewVersion(version: ImportReviewVersion) {
    const nextProfile = version.profile as ImportedProfile;
    setImportResult((current) => {
      if (!current) return current;
      const existingVersions = getImportReviewVersions(current.editable_fields);
      const nextEditableFields = {
        ...version.editable_fields,
        ...(existingVersions.length ? { [IMPORT_REVIEW_VERSIONS_KEY]: existingVersions } : {}),
      };

      return {
        ...current,
        profile: nextProfile,
        editable_fields: nextEditableFields,
        warnings: version.warnings,
      };
    });
    setImportContact({
      customer_name: nextProfile.company_name || "",
      customer_email: nextProfile.contact?.email || "",
      customer_phone: nextProfile.contact?.phone || "",
    });
    setImportForm((prev) => ({
      ...prev,
      website_url: nextProfile.website_url || prev.website_url,
      company_name: nextProfile.company_name || "",
    }));
    setImportReviewMessage("Versjon gjenopprettet. Husk å lagre hvis du vil gjøre den aktiv.");
    setImportError(null);
  }

  async function saveImportReviewChanges() {
    if (!importResult) return;
    if (!importResult.import_id) {
      setImportError("Analysen mangler import-ID og kan ikke lagres i historikk. Lokale endringer beholdes.");
      return;
    }

    setImportReviewSaving(true);
    setImportReviewMessage(null);
    setImportError(null);
    try {
      const versionedEditableFields = buildVersionedImportReviewEditableFields({
        current: {
          profile: importResult.profile,
          editable_fields: importResult.editable_fields,
          warnings: importResult.warnings,
        },
        previous: originalImportResult
          ? {
              profile: originalImportResult.profile,
              editable_fields: originalImportResult.editable_fields,
              warnings: originalImportResult.warnings,
            }
          : null,
      });
      const nextResult: WebsiteImportResult = {
        ...importResult,
        editable_fields: versionedEditableFields.editable_fields,
      };
      const profile = nextResult.profile;
      const response = await fetch("/api/saas/demosites/imports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: importResult.import_id,
          company_name: profile.company_name || null,
          detected_industry: profile.detected_industry || null,
          recommended_template_slug: profile.recommended_template_slug || null,
          confidence_score: profile.confidence_score ?? null,
          profile,
          editable_fields: nextResult.editable_fields,
          warnings: nextResult.warnings,
          source_pages: profile.source_pages || [],
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        console.error("DemoSites import review save failed:", data);
        throw new Error(getApiErrorMessage(data) || "Kunne ikke lagre endringer i analyse.");
      }
      setImportResult(nextResult);
      setOriginalImportResult(cloneImportResult(nextResult));
      setImportReviewMessage("Endringer lagret i analyse.");
      await loadImportHistory();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ukjent feil.";
      setImportError(`Kunne ikke lagre endringer i analyse: ${message}`);
    } finally {
      setImportReviewSaving(false);
    }
  }

  async function applyImportToSelectedOrder() {
    if (!importResult || !importForm.order_id) return;
    const selectedOrder = orders.find((order) => order.id === importForm.order_id);
    if (!selectedOrder) {
      setImportError("Velg en demo som skal oppdateres.");
      return;
    }

    const profile = importResult.profile;
    setImportSaving(true);
    setImportError(null);
    setImportSuccess(null);
    try {
      const response = await fetch("/api/saas/demosites", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedOrder.id,
          company_name: profile.company_name || selectedOrder.company_name,
          industry: profile.detected_industry || selectedOrder.industry,
          website_url: profile.website_url || selectedOrder.website_url,
          source_url: profile.website_url || selectedOrder.website_url,
          template_slug: profile.recommended_template_slug || selectedOrder.template_slug || DEFAULT_TEMPLATE_SLUG,
          logo_url: profile.logo_url || importResult.editable_fields.logo_url || selectedOrder.logo_url,
          brand_color: profile.colors?.primary || importResult.editable_fields.brand_color || selectedOrder.brand_color,
          extracted_profile: profile,
          editable_fields: {
            ...getEditableFields(selectedOrder),
            ...importResult.editable_fields,
          },
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        console.error("DemoSites import update failed:", data);
        throw new Error(getApiErrorMessage(data) || "Kunne ikke oppdatere valgt demo.");
      }
      const updatedOrder = (data.order || selectedOrder) as DemoSiteOrder;
      await patchImportHistory(importResult.import_id, { applied_order_id: updatedOrder.id, status: "applied_to_demo" });
      setImportSuccess({ title: `${updatedOrder.company_name} er oppdatert fra analysen.`, order: updatedOrder });
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ukjent feil.";
      setImportError(`Kunne ikke oppdatere valgt demo: ${message}`);
    } finally {
      setImportSaving(false);
    }
  }

  const orderNameById = new Map(orders.map((order) => [order.id, order.company_name]));
  const templateOptions = templates.length ? templates : DEFAULT_TEMPLATES;

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-purple-400" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold text-white"><MonitorSmartphone className="text-purple-400" /> DemoSites CRM</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">Bestillingsflyt, kundeoversikt, preview-URL og MRR for nettsidepakker på ChatGenius.pro.</p>
        </div>
        <a href="https://github.com/freddybremseth-coder/demosites" target="_blank" rel="noopener noreferrer"><Button variant="outline" className="border-slate-600">Demosites repo <ExternalLink className="ml-2 h-4 w-4" /></Button></a>
      </div>

      {error && <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100"><AlertCircle className="mr-2 inline h-4 w-4" />{error}</div>}
      {deleteMessage && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100"><CheckCircle className="mr-2 inline h-4 w-4" />{deleteMessage}</div>}

      <WebsiteImportCard
        form={importForm}
        contact={importContact}
        result={importResult}
        success={importSuccess}
        history={importHistory}
        historyWarning={importHistoryWarning}
        error={importError}
        loading={importLoading}
        saving={importSaving}
        orders={orders}
        templates={templateOptions}
        onAnalyze={analyzeWebsiteImport}
        onCreate={createDemoFromImport}
        onApplyToOrder={applyImportToSelectedOrder}
        onUseSavedImport={useSavedImport}
        onCreateFromSavedImport={createDemoFromSavedImport}
        onDiscardImport={discardImport}
        onReviewChange={updateImportReview}
        onSaveReview={saveImportReviewChanges}
        onResetReview={resetImportReview}
        onRestoreReviewVersion={restoreImportReviewVersion}
        onDiscard={() => {
          setImportResult(null);
          setOriginalImportResult(null);
          setImportSuccess(null);
          setImportError(null);
          setImportReviewMessage(null);
        }}
        onFormChange={(patch) => setImportForm((prev) => ({ ...prev, ...patch }))}
        onContactChange={(patch) => setImportContact((prev) => ({ ...prev, ...patch }))}
        reviewSaving={importReviewSaving}
        reviewMessage={importReviewMessage}
        canResetReview={Boolean(originalImportResult)}
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
        <Metric label="Bestillinger" value={String(summary.totalOrders)} />
        <Metric label="Aktive" value={String(summary.activeOrders)} />
        <Metric label="Betalt" value={String(summary.paidOrders)} />
        <Metric label="MRR" value={formatNok(summary.activeMrr)} />
        <Metric label="Netto MRR" value={formatNok(summary.netMrr)} />
        <Metric label="ARR" value={formatNok(summary.arr)} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {DEMO_SITE_PACKAGES.map((pkg) => <Card key={pkg.id} className={`border-slate-700/50 bg-slate-800/50 ${pkg.recommended ? "ring-1 ring-purple-500/60" : ""}`}><CardHeader><CardTitle className="text-white">{pkg.shortName}</CardTitle><CardDescription>{pkg.tagline}</CardDescription></CardHeader><CardContent><div className="text-2xl font-bold text-white">{formatNok(pkg.setupFeeNok)}</div><div className="text-sm text-emerald-300">+ {formatNok(pkg.monthlyFeeNok)} / mnd</div><p className="mt-3 text-xs text-slate-400">{pkg.salesAngle}</p></CardContent></Card>)}
      </div>

      <TempDemoCard onCreated={loadData} />

      <LeadPipelineCard />

      <Card className="border-slate-700/50 bg-slate-800/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white"><CheckCircle className="h-5 w-5 text-emerald-300" />Siste hendelser</CardTitle>
          <CardDescription>Logg fra DemoSites: demo opprettet, oppdatert, claimet eller utløpt.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {events.length === 0 ? <div className="rounded-lg border border-dashed border-slate-700 p-6 text-center text-sm text-slate-400">Ingen hendelser ennå.</div> : events.slice(0, 8).map((event) => (
            <div key={event.id} className="rounded-xl border border-slate-700 bg-slate-950/50 p-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-sm font-semibold text-white">{event.title}</div>
                  <div className="mt-1 text-xs text-slate-400">{orderNameById.get(event.order_id) || "DemoSites"} · {event.description || event.event_type}</div>
                </div>
                <div className="shrink-0 text-xs text-slate-500">{formatDateTime(event.created_at)}</div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[420px_1fr]">
        <Card className="border-purple-500/20 bg-slate-800/50">
          <CardHeader><CardTitle className="flex items-center gap-2 text-white"><Send className="h-5 w-5 text-purple-300" />Ny bestilling</CardTitle><CardDescription>Få valg, enkel bestilling og automatisk forslag til preview-subdomene.</CardDescription></CardHeader>
          <CardContent>
            <form onSubmit={createOrder} className="space-y-3">
              <Input label="Bedriftsnavn" required value={form.company_name} onChange={(value) => setForm((prev) => ({ ...prev, company_name: value }))} />
              <Input label="Kontaktperson" required value={form.customer_name} onChange={(value) => setForm((prev) => ({ ...prev, customer_name: value }))} />
              <Input label="E-post" required type="email" value={form.customer_email} onChange={(value) => setForm((prev) => ({ ...prev, customer_email: value }))} />
              <Input label="Telefon" value={form.customer_phone} onChange={(value) => setForm((prev) => ({ ...prev, customer_phone: value }))} />
              <Input label="Bransje" value={form.industry} onChange={(value) => setForm((prev) => ({ ...prev, industry: value }))} />
              <Input label="Eksisterende nettside" value={form.website_url} onChange={(value) => setForm((prev) => ({ ...prev, website_url: value }))} />
              <div className="grid grid-cols-2 gap-3">
                <Select label="Pakke" value={form.package_id} onChange={(value) => setForm((prev) => ({ ...prev, package_id: value as DemoSitePackageId }))} options={DEMO_SITE_PACKAGES.map((pkg) => ({ value: pkg.id, label: pkg.shortName }))} />
                <Select label="Mal" value={form.template_slug} onChange={(value) => setForm((prev) => ({ ...prev, template_slug: value }))} options={templateOptions.map((template) => ({ value: template.slug, label: template.name }))} />
              </div>
              <div className="grid grid-cols-2 gap-3"><Input label="Setup-kost" type="number" value={form.setup_cost_nok} onChange={(value) => setForm((prev) => ({ ...prev, setup_cost_nok: value }))} /><Input label="Mnd-kost" type="number" value={form.monthly_cost_nok} onChange={(value) => setForm((prev) => ({ ...prev, monthly_cost_nok: value }))} /></div>
              <textarea value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} rows={3} className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-purple-500" placeholder="Logo, farger, tjenester, produkter, priser og tekst som skal endres" />
              <Button type="submit" disabled={saving} className="w-full bg-purple-600 hover:bg-purple-500">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Opprett bestilling</Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-slate-700/50 bg-slate-800/50">
          <CardHeader><CardTitle className="flex items-center gap-2 text-white"><Globe className="h-5 w-5 text-blue-300" />Kunder og bestillinger</CardTitle><CardDescription>Her ser du demo, claim-lenke, betaling, valgt pakke, utløpsdato og bilde/logo-status.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {orders.length === 0 ? <div className="rounded-lg border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400">Ingen bestillinger ennå.</div> : orders.map((order) => {
              const assetSummary = getAssetSummary(order);
              const previewUrl = customerPreviewUrl(order);
              return (
                <div key={order.id} className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between"><div><h3 className="text-lg font-semibold text-white">{order.company_name}</h3><p className="text-xs text-slate-500">{order.order_number} · {order.customer_name} · {order.customer_email} · {formatDate(order.created_at)}</p></div><div className="flex flex-wrap gap-2"><Badge>{statusLabel[order.status]}</Badge><Badge variant="outline" className="border-slate-600 text-slate-300">{billingLabel[order.billing_status]}</Badge>{order.claimed_at && <Badge className="bg-emerald-600 text-white">Claimet</Badge>}{assetSummary.hasLogo && <Badge className="bg-blue-600 text-white">Logo</Badge>}{assetSummary.imageCount > 0 && <Badge className="bg-purple-600 text-white">{assetSummary.imageCount} bilde{assetSummary.imageCount === 1 ? "" : "r"}</Badge>}</div></div>
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-6"><Info label="Pakke" value={order.package_id} /><Info label="Pris" value={`${formatNok(order.setup_fee_nok)} + ${formatNok(order.monthly_fee_nok)}/mnd`} /><Info label="Preview" value={previewUrl ? "Åpne preview" : "Ikke klar"} href={previewUrl || undefined} /><Info label="Claim" value={order.claim_url ? "Åpne claim" : "Ikke klar"} href={order.claim_url || undefined} /><Info label="Claimet" value={formatDate(order.claimed_at) || "Ikke claimet"} /><Info label="Utløper" value={formatDate(order.expires_at) || "Ikke satt"} /></div>
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3"><Info label="Logo" value={assetSummary.hasLogo ? "Lagt inn" : "Mangler"} /><Info label="Bilder" value={`${assetSummary.imageCount} av 3`} /><Info label="Farger" value={getEditableFields(order).brand_colors ? "Lagt inn" : "Standard"} /></div>
                  <div className="mt-3 flex flex-wrap gap-1.5">{editableFieldList(order).slice(0, 8).map((field) => <Badge key={field} variant="outline" className="border-slate-600 text-[10px] text-slate-300">{field}</Badge>)}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {previewUrl && <a href={previewUrl} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="outline" className="border-cyan-500/50 text-cyan-100">Åpne preview</Button></a>}
                    {previewUrl?.includes("/demosites/preview/") && (
                      <a href={previewUrl.replace("/demosites/preview/", "/demosites/present/")} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" className="bg-amber-500 text-slate-950 hover:bg-amber-400">Presenter for kunde</Button>
                      </a>
                    )}
                    <Button size="sm" variant="outline" className="border-fuchsia-500/50 text-fuchsia-200" disabled={enrichingOrderId === order.id || regeneratingOrderId === order.id} onClick={() => enrichOrder(order)}>
                      {enrichingOrderId === order.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}
                      Berik med AI
                    </Button>
                    <Button size="sm" variant="outline" className="border-sky-500/50 text-sky-200" disabled={regeneratingOrderId === order.id || enrichingOrderId === order.id} onClick={() => regenerateOrderImages(order)}>
                      {regeneratingOrderId === order.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="mr-1 h-3.5 w-3.5" />}
                      Lag nye bilder
                    </Button>
                    {order.claim_url && <a href={order.claim_url} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="outline" className="border-slate-600">Åpne claim</Button></a>}
                    {order.production_url && <a href={order.production_url} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="outline" className="border-emerald-500/50 text-emerald-100">Åpne live</Button></a>}
                    <a href={`/demosites/setup/${order.id}`}><Button size="sm" variant="outline" className="border-slate-600">Oppsett</Button></a>
                    <Button size="sm" variant="outline" className="border-purple-500/40 text-purple-200" onClick={() => updateOrder(order, { status: "preview_ready" })}>Sett preview klar</Button>
                    <Button size="sm" variant="outline" className="border-emerald-500/40 text-emerald-200" onClick={() => updateOrder(order, { status: "approved" })}><CheckCircle className="mr-1 h-3.5 w-3.5" />Godkjent</Button>
                    <Button size="sm" className="bg-green-600 hover:bg-green-500" onClick={() => updateOrder(order, { status: "deployed" })}><Rocket className="mr-1 h-3.5 w-3.5" />Sett live-status</Button>
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500" onClick={() => updateOrder(order, { billing_status: "paid" })}><CreditCard className="mr-1 h-3.5 w-3.5" />Betalt</Button>
                    <Button size="sm" variant="outline" className="border-red-500/50 text-red-200 hover:bg-red-500/10" disabled={deletingOrderId === order.id} onClick={() => openDeleteOrder(order)}>
                      {deletingOrderId === order.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1 h-3.5 w-3.5" />}
                      Slett
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {deleteTarget && (
        <DeleteDemoOrderModal
          order={deleteTarget}
          confirmText={deleteConfirmText}
          deleting={deletingOrderId === deleteTarget.id}
          onConfirmTextChange={setDeleteConfirmText}
          onCancel={closeDeleteOrder}
          onDelete={deleteOrder}
        />
      )}
    </div>
  );
}

function DeleteDemoOrderModal({
  order,
  confirmText,
  deleting,
  onConfirmTextChange,
  onCancel,
  onDelete,
}: {
  order: DemoSiteOrder;
  confirmText: string;
  deleting: boolean;
  onConfirmTextChange: (value: string) => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const previewToken = getPreviewToken(order);
  const isApprovedOrLive = order.status === "approved" || order.status === "deployed";
  const canDelete = confirmText === "SLETT" && !deleting;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4">
      <div className="w-full max-w-lg rounded-xl border border-red-500/40 bg-slate-950 p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-500/15 text-red-200">
            <Trash2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Slett demo</h2>
            <p className="mt-1 text-sm leading-6 text-slate-300">
              Er du sikker på at du vil slette denne demoen? Dette kan ikke angres.
            </p>
          </div>
        </div>

        {isApprovedOrLive && (
          <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-100">
            <AlertCircle className="mr-2 inline h-4 w-4" />
            Denne demoen kan være godkjent eller live. Sletting kan påvirke aktiv preview.
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-3 rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-sm md:grid-cols-2">
          <Info label="Bedrift" value={order.company_name || "Ukjent"} />
          <Info label="Ordrenummer" value={order.order_number || "Ukjent"} />
          <Info label="Status" value={statusLabel[order.status] || order.status} />
          <Info label="Preview-token" value={previewToken || "Ikke funnet"} />
        </div>

        <div className="mt-4">
          <Input label="Skriv SLETT for å bekrefte" value={confirmText} onChange={onConfirmTextChange} placeholder="SLETT" />
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" className="border-slate-700 text-slate-200" disabled={deleting} onClick={onCancel}>
            Avbryt
          </Button>
          <Button type="button" className="bg-red-600 text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60" disabled={!canDelete} onClick={onDelete}>
            {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
            Slett demo
          </Button>
        </div>
      </div>
    </div>
  );
}

type WebsiteImportCardProps = {
  form: WebsiteImportFormState;
  contact: WebsiteImportContactState;
  result: WebsiteImportResult | null;
  success: WebsiteImportSuccess | null;
  history: WebsiteImportHistoryItem[];
  historyWarning: string | null;
  error: string | null;
  loading: boolean;
  saving: boolean;
  orders: DemoSiteOrder[];
  templates: DemoSiteTemplate[];
  onAnalyze: (event: FormEvent<HTMLFormElement>) => void;
  onCreate: () => void;
  onApplyToOrder: () => void;
  onUseSavedImport: (importItem: WebsiteImportHistoryItem, mode?: WebsiteImportMode) => void;
  onCreateFromSavedImport: (importItem: WebsiteImportHistoryItem) => void;
  onDiscardImport: (importItem: WebsiteImportHistoryItem) => void;
  onReviewChange: (patch: WebsiteImportReviewPatch) => void;
  onSaveReview: () => void;
  onResetReview: () => void;
  onRestoreReviewVersion: (version: ImportReviewVersion) => void;
  onDiscard: () => void;
  onFormChange: (patch: Partial<WebsiteImportFormState>) => void;
  onContactChange: (patch: Partial<WebsiteImportContactState>) => void;
  reviewSaving: boolean;
  reviewMessage: string | null;
  canResetReview: boolean;
};

function WebsiteImportCard({
  form,
  contact,
  result,
  success,
  history,
  historyWarning,
  error,
  loading,
  saving,
  orders,
  templates,
  onAnalyze,
  onCreate,
  onApplyToOrder,
  onUseSavedImport,
  onCreateFromSavedImport,
  onDiscardImport,
  onReviewChange,
  onSaveReview,
  onResetReview,
  onRestoreReviewVersion,
  onDiscard,
  onFormChange,
  onContactChange,
  reviewSaving,
  reviewMessage,
  canResetReview,
}: WebsiteImportCardProps) {
  const profile = result?.profile;
  const sourcePages = profile?.source_pages || [];
  const colorSwatches = getColorSwatches(profile?.colors);
  const successLinks = getImportOrderLinks(success?.order);
  const selectedTemplateLabel = getTemplateLabel(templates, profile?.recommended_template_slug);
  const reviewQuality = result ? getImportReviewQuality(result) : null;
  const existingOrderOptions = [
    { value: "", label: "Velg demo" },
    ...orders.map((order) => ({ value: order.id, label: `${order.company_name} (${order.order_number})` })),
  ];

  return (
    <Card className="border-cyan-500/20 bg-slate-800/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Search className="h-5 w-5 text-cyan-300" />
          Importer fra nettside
        </CardTitle>
        <CardDescription>Analyser en offentlig bedriftsnettside, se forslagene og opprett eller oppdater demo manuelt.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={onAnalyze} className="grid grid-cols-1 gap-3 lg:grid-cols-[1.4fr_1fr_220px_auto] lg:items-end">
          <Input label="Nettside-URL" required type="url" value={form.website_url} onChange={(value) => onFormChange({ website_url: value })} placeholder="https://example.com" />
          <Input label="Bedriftsnavn" value={form.company_name} onChange={(value) => onFormChange({ company_name: value })} placeholder="Valgfritt" />
          <Select
            label="Handling"
            value={form.mode}
            onChange={(value) => onFormChange({ mode: value as WebsiteImportMode })}
            options={[
              { value: "new", label: "Ny demo" },
              { value: "existing", label: "Oppdater eksisterende demo" },
            ]}
          />
          <Button type="submit" disabled={loading} className="h-10 bg-cyan-600 hover:bg-cyan-500">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            {loading ? "Analyserer nettside..." : "Analyser nettside"}
          </Button>
        </form>

        {form.mode === "existing" && (
          <div className="max-w-xl">
            <Select label="Valgt demo" value={form.order_id} onChange={(value) => onFormChange({ order_id: value })} options={existingOrderOptions} />
          </div>
        )}

        {error && <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100"><AlertCircle className="mr-2 inline h-4 w-4" />{error}</div>}

        <ImportHistoryList
          history={history}
          warning={historyWarning}
          orders={orders}
          templates={templates}
          mode={form.mode}
          saving={saving}
          onUseSavedImport={onUseSavedImport}
          onCreateFromSavedImport={onCreateFromSavedImport}
          onDiscardImport={onDiscardImport}
        />

        {success && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
            <CheckCircle className="mr-2 inline h-4 w-4" />
            {success.title}
            <div className="mt-3 flex flex-wrap gap-2">
              {successLinks.previewUrl && <a href={successLinks.previewUrl} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="outline" className="border-emerald-500/50 text-emerald-100">Åpne preview</Button></a>}
              {successLinks.setupUrl && <a href={successLinks.setupUrl}><Button size="sm" variant="outline" className="border-slate-600 text-slate-100">Oppsett</Button></a>}
              {successLinks.claimUrl && <a href={successLinks.claimUrl} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="outline" className="border-slate-600 text-slate-100">Åpne claim</Button></a>}
            </div>
          </div>
        )}

        {profile && (
          <div className="space-y-4 rounded-xl border border-slate-700 bg-slate-950/50 p-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-semibold text-white">{profile.company_name || "Bedrift"}</h2>
                  <Badge className="bg-cyan-600 text-white">{Math.round(Number(profile.confidence_score) || 0)}% confidence</Badge>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                  <span>{profile.detected_industry || "Bransje ikke funnet"}</span>
                  <span>{selectedTemplateLabel}</span>
                  {profile.website_url && <a href={profile.website_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-cyan-200 hover:text-cyan-100"><ExternalLink className="h-3 w-3" />Nettside</a>}
                </div>
              </div>
              {profile.logo_url && (
                <div className="flex h-16 w-36 items-center justify-center rounded-lg border border-slate-700 bg-white p-2">
                  <img src={profile.logo_url} alt={`${profile.company_name || "Bedrift"} logo`} className="max-h-12 max-w-32 object-contain" />
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
              <ReviewInfo label="Bedriftsnavn" value={profile.company_name || "Ikke funnet"} />
              <ReviewInfo label="Foreslått bransje" value={profile.detected_industry || "Ikke funnet"} />
              <ReviewInfo label="Foreslått demo-mal" value={selectedTemplateLabel} />
              <ReviewInfo label="Kildesider" value={`${sourcePages.length} side${sourcePages.length === 1 ? "" : "r"}`} />
            </div>

            <TemplateDetectionPanel detection={profile.template_detection} templates={templates} />

            {colorSwatches.length > 0 && (
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><Palette className="h-3.5 w-3.5" />Farger</div>
                <div className="flex flex-wrap gap-2">
                  {colorSwatches.map((swatch) => <ColorSwatch key={swatch.label} label={swatch.label} value={swatch.value} />)}
                </div>
              </div>
            )}

            <ReviewText icon={<FileText className="h-4 w-4" />} label="Summary" value={profile.summary || profile.description || "Ingen oppsummering funnet."} />
            <EditableImportReviewFields
              result={result}
              templates={templates}
              saving={reviewSaving}
              message={reviewMessage}
              canReset={canResetReview}
              onChange={onReviewChange}
              onSave={onSaveReview}
              onReset={onResetReview}
            />
            <ImportReviewVersionHistoryPanel result={result} onRestoreVersion={onRestoreReviewVersion} />
            {reviewQuality && <ImportReviewQualityPanel quality={reviewQuality} />}
            <PreviewUsagePanel result={result} />
            <ImportReviewLivePreviewPanel result={result} templates={templates} />

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <ReviewList title="Services" items={profile.services} />
              <ReviewList title="Products" items={profile.products} />
              <ReviewList title="Prices" items={profile.prices} />
              <ReviewList title="Trust points" items={profile.trust_points} />
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <FaqList items={profile.faq} />
              <ContactPanel contact={profile.contact} />
            </div>

            {sourcePages.length > 0 && (
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><Link2 className="h-3.5 w-3.5" />Source pages</div>
                <div className="space-y-1">
                  {sourcePages.map((url) => (
                    <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="block truncate rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-xs text-cyan-200 hover:text-cyan-100">
                      {url}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {profile.image_urls && profile.image_urls.length > 0 && (
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><ImageIcon className="h-3.5 w-3.5" />Bilder</div>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  {profile.image_urls.slice(0, 4).map((url) => <img key={url} src={url} alt="" className="h-20 w-full rounded-lg border border-slate-800 object-cover" />)}
                </div>
              </div>
            )}

            {result.warnings.length > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                <div className="mb-2 font-semibold">Warnings</div>
                <ul className="space-y-1">
                  {result.warnings.map((warning) => <li key={warning}>• {warning}</li>)}
                </ul>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Input label="Kontaktperson" value={contact.customer_name} onChange={(value) => onContactChange({ customer_name: value })} />
              <Input label="Kontakt-e-post" type="email" value={contact.customer_email} onChange={(value) => onContactChange({ customer_email: value })} />
              <Input label="Telefon" value={contact.customer_phone} onChange={(value) => onContactChange({ customer_phone: value })} />
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={onCreate} disabled={saving} className="bg-emerald-600 hover:bg-emerald-500">
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                  Opprett demo fra analyse
                </Button>
                {form.mode === "existing" && (
                  <Button type="button" onClick={onApplyToOrder} disabled={saving || !form.order_id} variant="outline" className="border-cyan-500/50 text-cyan-100">
                    Bruk på valgt demo
                  </Button>
                )}
                <Button type="button" onClick={onDiscard} disabled={saving} variant="outline" className="border-slate-600">
                  <XCircle className="mr-2 h-4 w-4" />
                  Forkast
                </Button>
              </div>
              {reviewQuality?.criticalMissing && (
                <div className="text-xs text-amber-200">
                  Du kan opprette demo nå, men noen viktige felt mangler.
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const PREVIEW_USAGE_FIELDS = [
  { key: "hero_title", label: "Hero-tittel" },
  { key: "hero_subtitle", label: "Hero-undertittel" },
  { key: "intro_text", label: "Intro" },
  { key: "services", label: "Tjenester" },
  { key: "products", label: "Produkter/pakker" },
  { key: "prices", label: "Priser" },
  { key: "trust_points", label: "Trygghetspunkter" },
  { key: "call_to_action", label: "CTA" },
  { key: "contact_text", label: "Kontakttekst" },
  { key: "logo_url", label: "Logo" },
  { key: "gallery_images", label: "Bilder" },
  { key: "brand_color", label: "Primærfarge" },
  { key: "secondary_color", label: "Sekundærfarge" },
  { key: "accent_color", label: "Aksentfarge" },
];

function getImportReviewVersionFieldLabel(field: string) {
  const previewField = PREVIEW_USAGE_FIELDS.find((item) => item.key === field);
  if (previewField) return previewField.label;
  const labels: Record<string, string> = {
    company_name: "Bedriftsnavn",
    detected_industry: "Bransje",
    recommended_template_slug: "Demo-mal",
    confidence_score: "Confidence",
    summary: "Oppsummering",
    description: "Beskrivelse",
    image_urls: "Bilder",
    colors: "Farger",
    warnings: "Advarsler",
    profile_import_field_sources: "Kildeetiketter",
  };
  return labels[field] || field.replace(/_/g, " ");
}

function getImportReviewVersionChangeSummary(fields: string[]) {
  if (!fields.length) return "Tidligere aktivt forslag";
  const labels = fields.slice(0, 4).map(getImportReviewVersionFieldLabel);
  const rest = fields.length - labels.length;
  return `Endret etterpå: ${labels.join(", ")}${rest > 0 ? ` + ${rest} til` : ""}`;
}

function ImportReviewVersionHistoryPanel({
  result,
  onRestoreVersion,
}: {
  result: WebsiteImportResult;
  onRestoreVersion: (version: ImportReviewVersion) => void;
}) {
  const versions = getImportReviewVersions(result.editable_fields);

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <History className="h-4 w-4 text-cyan-300" />
            Tidligere lagrede versjoner
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Gjenopprett en tidligere lagret versjon lokalt, sjekk preview og lagre hvis den skal være aktiv.
          </p>
        </div>
        <span className="shrink-0 rounded-md border border-slate-700 bg-slate-950/70 px-2 py-1 text-xs font-semibold text-slate-300">
          {versions.length} av 10 lagret
        </span>
      </div>

      {versions.length === 0 ? (
        <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-400">
          Ingen tidligere lagrede versjoner ennå. Når du lagrer nye endringer, beholdes forrige aktive versjon her.
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {versions.map((version) => (
            <div key={version.id} className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-950/50 p-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-semibold text-slate-100">{version.label}</div>
                  <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
                    {formatDateTime(version.saved_at) || "Ukjent tidspunkt"}
                  </span>
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  {getImportReviewVersionChangeSummary(version.changed_fields)}
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="shrink-0 border-cyan-500/50 text-cyan-100"
                title="Gjenoppretter lokalt. Lagre etterpå hvis denne versjonen skal være aktiv."
                onClick={() => onRestoreVersion(version)}
              >
                Gjenopprett
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EditableImportReviewFields({
  result,
  templates,
  saving,
  message,
  canReset,
  onChange,
  onSave,
  onReset,
}: {
  result: WebsiteImportResult;
  templates: DemoSiteTemplate[];
  saving: boolean;
  message: string | null;
  canReset: boolean;
  onChange: (patch: WebsiteImportReviewPatch) => void;
  onSave: () => void;
  onReset: () => void;
}) {
  const profile = result.profile;
  const fields = result.editable_fields || {};
  const colors = profile.colors || {};
  const galleryImages = fields.gallery_images || profile.image_urls || [];

  const updateEditableField = (key: string, value: unknown, profilePatch?: Partial<ImportedProfile>) => {
    onChange({ profile: profilePatch, editable_fields: { [key]: value } });
  };

  const updateListField = (key: "services" | "products" | "prices" | "trust_points", value: string) => {
    const list = textToListField(value);
    onChange({ profile: { [key]: list } as Partial<ImportedProfile>, editable_fields: { [key]: list } });
  };

  const updateColor = (key: "primary" | "secondary" | "accent", editableKey: "brand_color" | "secondary_color" | "accent_color", value: string) => {
    onChange({
      profile: { colors: { ...colors, [key]: value } },
      editable_fields: { [editableKey]: value },
    });
  };

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-sm font-semibold text-white">Rediger importforslag</div>
          <p className="mt-1 text-xs text-slate-400">Korriger tekst, tjenester, priser, logo, bilder og farger før demoen opprettes eller oppdateres.</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={!canReset || saving} className="border-slate-700 text-slate-200" onClick={onReset}>
            Tilbakestill fra analyse
          </Button>
          <Button type="button" size="sm" disabled={saving} title={!result.import_id ? "Analysen mangler import-ID og kan ikke lagres i historikk." : undefined} className="bg-cyan-600 hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60" onClick={onSave}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
            Lagre endringer i analyse
          </Button>
        </div>
      </div>

      {message && (
        <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-100">
          {message}
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Input label="Bedriftsnavn" value={profile.company_name || ""} onChange={(value) => onChange({ profile: { company_name: value } })} />
        <Input label="Foreslått bransje" value={profile.detected_industry || ""} onChange={(value) => onChange({ profile: { detected_industry: value } })} />
        <Select
          label="Foreslått demo-mal"
          value={profile.recommended_template_slug || ""}
          onChange={(value) => onChange({ profile: { recommended_template_slug: value }, editable_fields: { template_slug: value } })}
          options={[{ value: "", label: "Ikke valgt" }, ...templates.map((template) => ({ value: template.slug, label: template.name }))]}
        />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
        <Input label="Hero-tittel" value={stringField(fields.hero_title)} onChange={(value) => updateEditableField("hero_title", value)} />
        <Input label="Logo-URL" type="url" value={stringField(fields.logo_url) || profile.logo_url || ""} onChange={(value) => updateEditableField("logo_url", value, { logo_url: value })} />
        <Textarea label="Hero-undertittel" value={stringField(fields.hero_subtitle)} onChange={(value) => updateEditableField("hero_subtitle", value)} rows={3} />
        <Textarea label="Intro" value={stringField(fields.intro_text)} onChange={(value) => updateEditableField("intro_text", value, { summary: value })} rows={3} />
        <Textarea label="Tjenester" value={listFieldToText(fields.services || profile.services)} onChange={(value) => updateListField("services", value)} rows={5} placeholder="Én tjeneste per linje" />
        <Textarea label="Produkter/pakker" value={listFieldToText(fields.products || profile.products)} onChange={(value) => updateListField("products", value)} rows={5} placeholder="Én pakke per linje" />
        <Textarea label="Priser" value={listFieldToText(fields.prices || profile.prices)} onChange={(value) => updateListField("prices", value)} rows={5} placeholder="Én prislinje per linje" />
        <Textarea label="Trygghetspunkter" value={listFieldToText(fields.trust_points || profile.trust_points)} onChange={(value) => updateListField("trust_points", value)} rows={5} placeholder="Én trygghetstekst per linje" />
        <Textarea label="FAQ" value={faqToText((Array.isArray(fields.faq) ? fields.faq : profile.faq) as ImportedFaqItem[] | undefined)} onChange={(value) => {
          const faq = textToFaq(value);
          onChange({ profile: { faq }, editable_fields: { faq } });
        }} rows={5} placeholder="Spørsmål | Svar" />
        <Textarea label="Bilder" value={listFieldToText(galleryImages)} onChange={(value) => {
          const images = textToListField(value);
          onChange({ profile: { image_urls: images }, editable_fields: { gallery_images: images } });
        }} rows={5} placeholder="Én bilde-URL per linje" />
        <Textarea label="CTA" value={stringField(fields.call_to_action)} onChange={(value) => updateEditableField("call_to_action", value)} rows={3} />
        <Textarea label="Kontakttekst" value={stringField(fields.contact_text)} onChange={(value) => updateEditableField("contact_text", value)} rows={3} />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
        <Input label="Primærfarge" value={stringField(fields.brand_color) || colors.primary || ""} onChange={(value) => updateColor("primary", "brand_color", value)} placeholder="#0f172a" />
        <Input label="Sekundærfarge" value={stringField(fields.secondary_color) || colors.secondary || ""} onChange={(value) => updateColor("secondary", "secondary_color", value)} placeholder="#64748b" />
        <Input label="Aksentfarge" value={stringField(fields.accent_color) || colors.accent || ""} onChange={(value) => updateColor("accent", "accent_color", value)} placeholder="#22c55e" />
      </div>
    </div>
  );
}

function getQualitySummary(quality: ImportReviewQuality): { label: string; className: string } {
  if (quality.readyCount === quality.totalCount) return { label: "Klar", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-100" };
  if (quality.criticalMissing) return { label: "Mangler", className: "border-red-500/40 bg-red-500/10 text-red-100" };
  return { label: "Bør forbedres", className: "border-amber-500/40 bg-amber-500/10 text-amber-100" };
}

function getQualityItemStyle(status: ImportReviewQualityLevel) {
  if (status === "ready") return { label: "Klar", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100", icon: <CheckCircle className="h-4 w-4 text-emerald-300" /> };
  if (status === "improve") return { label: "Bør forbedres", className: "border-amber-500/30 bg-amber-500/10 text-amber-100", icon: <AlertCircle className="h-4 w-4 text-amber-300" /> };
  return { label: "Mangler", className: "border-red-500/30 bg-red-500/10 text-red-100", icon: <XCircle className="h-4 w-4 text-red-300" /> };
}

function ImportReviewQualityPanel({ quality }: { quality: ImportReviewQuality }) {
  const summary = getQualitySummary(quality);

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold text-white">Kvalitetssjekk</div>
            <span className={`rounded-md border px-2 py-1 text-[10px] font-semibold ${summary.className}`}>{summary.label}</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Preview bruker de redigerte feltene slik de står her.
          </p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm font-semibold text-slate-100">
          {quality.readyCount} av {quality.totalCount} punkter klare
        </div>
      </div>

      {quality.criticalMissing && (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
          <AlertCircle className="mr-2 inline h-4 w-4" />
          Demo kan opprettes, men bør kvalitetssikres først.
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
        {quality.items.map((item) => {
          const style = getQualityItemStyle(item.status);
          return (
            <div key={item.id} className={`rounded-lg border p-3 ${style.className}`}>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0">{style.icon}</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-semibold text-slate-100">{item.label}</span>
                    {item.critical && <span className="rounded bg-slate-950/50 px-1.5 py-0.5 text-[10px] text-slate-300">Viktig</span>}
                  </div>
                  <div className="mt-1 text-[11px] leading-4 text-slate-300">{item.detail}</div>
                  <div className="mt-2 text-[10px] font-semibold uppercase tracking-wide">{style.label}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PreviewUsagePanel({ result }: { result: WebsiteImportResult }) {
  const fields = result.editable_fields || {};
  const sources = isRecord(fields.profile_import_field_sources) ? fields.profile_import_field_sources : {};

  return (
    <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-3">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-cyan-100">Brukes i preview</div>
      <div className="mb-3 text-xs text-cyan-100/80">Preview bruker de redigerte feltene slik de står her.</div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
        {PREVIEW_USAGE_FIELDS.map((field) => {
          const value = fields[field.key];
          const sourceLabel = previewSourceLabel(sources[field.key], value);
          return (
            <div key={field.key} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="text-xs font-semibold text-slate-200">{field.label}</div>
                <span className="shrink-0 rounded-md bg-slate-800 px-2 py-1 text-[10px] font-semibold text-slate-300">{sourceLabel}</span>
              </div>
              <div className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">{previewValueSummary(value)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ImportReviewLivePreviewPanel({ result, templates }: { result: WebsiteImportResult; templates: DemoSiteTemplate[] }) {
  const [showFullPreview, setShowFullPreview] = useState(false);
  const resetKey = `${result.import_id || ""}:${result.profile.website_url || ""}`;
  const templateSlug = String(getImportReviewValue(result, "recommended_template_slug") || "").trim();

  useEffect(() => {
    setShowFullPreview(false);
  }, [resetKey]);

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <MonitorSmartphone className="h-4 w-4 text-cyan-300" />
            Forhåndsvis demo
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">
            Dette er en intern forhåndsvisning basert på redigerte felter. Ingen demo er opprettet ennå.
          </p>
          <p className="mt-1 text-xs font-medium text-cyan-100">
            Opprettet demo vil bruke de samme redigerte feltene som vises her.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" className="shrink-0 border-cyan-500/50 text-cyan-100" onClick={() => setShowFullPreview((value) => !value)}>
          {showFullPreview ? "Skjul full forhåndsvisning" : "Vis full forhåndsvisning"}
        </Button>
      </div>

      <DemoSitePreviewRenderer
        mode="internal"
        compact
        showFull={showFullPreview}
        companyName={result.profile.company_name}
        templateSlug={templateSlug}
        templateLabel={getTemplateLabel(templates, templateSlug)}
        websiteUrl={result.profile.website_url}
        profile={result.profile}
        editableFields={result.editable_fields}
        fallbackMode="placeholders"
        className="mt-4"
      />
    </div>
  );
}

function ImportHistoryList({
  history,
  warning,
  orders,
  templates,
  mode,
  saving,
  onUseSavedImport,
  onCreateFromSavedImport,
  onDiscardImport,
}: {
  history: WebsiteImportHistoryItem[];
  warning: string | null;
  orders: DemoSiteOrder[];
  templates: DemoSiteTemplate[];
  mode: WebsiteImportMode;
  saving: boolean;
  onUseSavedImport: (importItem: WebsiteImportHistoryItem, mode?: WebsiteImportMode) => void;
  onCreateFromSavedImport: (importItem: WebsiteImportHistoryItem) => void;
  onDiscardImport: (importItem: WebsiteImportHistoryItem) => void;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [usageFilter, setUsageFilter] = useState("all");

  const resetFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setUsageFilter("all");
  };

  const applySearch = () => setSearch((value) => value.trim());
  const normalizedSearch = normalizeImportHistorySearch(search);
  const filteredHistory = history.filter((item) => {
    const status = item.status || "analyzed";
    const used = isUsedImportHistoryItem(item);
    const templateSlug = item.recommended_template_slug || item.profile?.recommended_template_slug || "";
    const fields = isRecord(item.editable_fields) ? item.editable_fields : {};
    const searchText = normalizeImportHistorySearch([
      item.company_name,
      item.profile?.company_name,
      item.website_url,
      item.profile?.website_url,
      item.detected_industry,
      item.profile?.detected_industry,
      templateSlug,
      getTemplateLabel(templates, templateSlug),
      fields.hero_title,
      fields.hero_subtitle,
      fields.intro_text,
      fields.services,
      fields.products,
      fields.prices,
      fields.call_to_action,
      item.profile?.summary,
      item.profile?.source_pages,
      item.source_pages,
      item.warnings,
    ].filter(Boolean).join(" "));

    if (normalizedSearch && !searchText.includes(normalizedSearch)) return false;
    if (statusFilter !== "all" && status !== statusFilter) return false;
    if (usageFilter === "active" && (used || status === "discarded")) return false;
    if (usageFilter === "used" && !used) return false;
    return true;
  });

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">Siste analyser</h3>
          <p className="mt-1 text-xs text-slate-400">Tidligere nettsideanalyser kan brukes igjen uten ny crawling.</p>
        </div>
        {warning && <span className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-100">{warning}</span>}
      </div>

      <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/70 p-3">
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-[1fr_auto_auto_180px_180px] lg:items-end">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-300">Søk</span>
            <input
              type="search"
              value={search}
              placeholder="Skriv firmanavn, nettside eller bransje..."
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applySearch();
                }
                if (event.key === "Escape") resetFilters();
              }}
              className="h-10 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-sm text-white outline-none focus:border-purple-500"
            />
          </label>
          <Button type="button" onClick={applySearch} className="h-10 bg-cyan-600 hover:bg-cyan-500">
            Søk
          </Button>
          <Button type="button" variant="outline" onClick={resetFilters} className="h-10 border-slate-700 text-slate-200">
            Nullstill
          </Button>
          <Select
            label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "all", label: "Alle statuser" },
              { value: "analyzed", label: "Analysert" },
              { value: "created_demo", label: "Demo opprettet" },
              { value: "applied_to_demo", label: "Brukt på demo" },
              { value: "discarded", label: "Forkastet" },
            ]}
          />
          <Select
            label="Vis"
            value={usageFilter}
            onChange={setUsageFilter}
            options={[
              { value: "active", label: "Skjul brukte" },
              { value: "all", label: "Vis alle" },
              { value: "used", label: "Kun brukte" },
            ]}
          />
        </div>
        <div className="mt-2 text-xs text-slate-500">{filteredHistory.length} av {history.length} analyser vises</div>
      </div>

      {history.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-slate-700 p-4 text-sm text-slate-500">Ingen lagrede analyser ennå.</div>
      ) : filteredHistory.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-slate-700 p-4">
          <div className="text-sm text-slate-400">Noen analyser finnes, men filtrene skjuler dem.</div>
          <Button type="button" size="sm" variant="outline" onClick={resetFilters} className="mt-3 border-cyan-500/50 text-cyan-100">
            Vis alle analyser
          </Button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {filteredHistory.map((item) => {
            const warningCount = Array.isArray(item.warnings) ? item.warnings.length : 0;
            const confidence = Math.round(Number(item.confidence_score) || Number(item.profile?.confidence_score) || 0);
            const templateSlug = item.recommended_template_slug || item.profile?.recommended_template_slug || "";
            const used = isUsedImportHistoryItem(item);
            const relatedOrderId = getImportHistoryOrderId(item);
            const relatedOrder = relatedOrderId ? orders.find((order) => order.id === relatedOrderId) || null : null;
            const relatedOrderLinks = getImportOrderLinks(relatedOrder);
            return (
              <div key={item.id} className={`rounded-lg border border-slate-800 p-3 ${used ? "bg-slate-900/40 opacity-70" : "bg-slate-900/70"}`}>
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="truncate text-sm font-semibold text-slate-100">{item.company_name || item.profile?.company_name || "Ukjent bedrift"}</div>
                      <Badge className="bg-slate-700 text-slate-100">{importStatusLabel[item.status || "analyzed"] || item.status || "Analysert"}</Badge>
                      {confidence > 0 && <Badge className="bg-cyan-600 text-white">{confidence}%</Badge>}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                      <span>{item.detected_industry || item.profile?.detected_industry || "Bransje ikke funnet"}</span>
                      <span>{getTemplateLabel(templates, templateSlug)}</span>
                      {item.created_at && <span>{formatDateTime(item.created_at)}</span>}
                      {warningCount > 0 && <span>{warningCount} {warningCount === 1 ? "advarsel" : "advarsler"}</span>}
                    </div>
                    {used && relatedOrder ? (
                      <div className="mt-2 text-xs text-slate-400">Tilknyttet demo: {relatedOrder.order_number}</div>
                    ) : used ? (
                      <div className="mt-2 text-xs text-slate-500">Demoen er slettet eller ikke lastet i listen.</div>
                    ) : null}
                    <a href={item.website_url} target="_blank" rel="noopener noreferrer" className="mt-2 block truncate text-xs text-cyan-200 hover:text-cyan-100">
                      {item.website_url}
                    </a>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" className="border-cyan-500/50 text-cyan-100" onClick={() => onUseSavedImport(item, mode)}>
                      Bruk analyse
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={used || saving}
                      title={used ? "Denne analysen er allerede brukt til demo." : "Opprett demo fra denne analysen."}
                      className="bg-emerald-600 hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => onCreateFromSavedImport(item)}
                    >
                      {used ? "Demo finnes" : "Opprett demo"}
                    </Button>
                    {relatedOrderLinks.previewUrl && (
                      <a href={relatedOrderLinks.previewUrl} target="_blank" rel="noopener noreferrer">
                        <Button type="button" size="sm" variant="outline" className="border-emerald-500/50 text-emerald-100">
                          Åpne preview
                        </Button>
                      </a>
                    )}
                    {relatedOrderLinks.setupUrl && (
                      <a href={relatedOrderLinks.setupUrl}>
                        <Button type="button" size="sm" variant="outline" className="border-slate-600 text-slate-100">
                          Oppsett
                        </Button>
                      </a>
                    )}
                    <Button type="button" size="sm" variant="outline" className="border-red-500/50 text-red-200 hover:bg-red-500/10" onClick={() => onDiscardImport(item)}>
                      Forkast
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function getTemplateDetectionTone(level?: string) {
  if (level === "high") return { label: "Høy trygghet", badge: "bg-emerald-600 text-white", border: "border-emerald-500/30 bg-emerald-500/10", text: "text-emerald-100" };
  if (level === "medium") return { label: "Middels trygghet", badge: "bg-amber-500 text-slate-950", border: "border-amber-500/30 bg-amber-500/10", text: "text-amber-100" };
  return { label: "Lav trygghet", badge: "bg-slate-700 text-slate-100", border: "border-slate-700 bg-slate-900/70", text: "text-slate-200" };
}

function TemplateDetectionPanel({ detection, templates }: { detection?: TemplateDetection | null; templates: DemoSiteTemplate[] }) {
  if (!detection || !isRecord(detection)) return null;

  const tone = getTemplateDetectionTone(detection.confidence_level);
  const matchedKeywords = Array.isArray(detection.matched_keywords) ? detection.matched_keywords.filter(Boolean).slice(0, 8) : [];
  const consideredTemplates = Array.isArray(detection.considered_templates)
    ? detection.considered_templates.filter((item) => item && item.template_slug).slice(0, 3)
    : [];
  const selectedTemplate = getTemplateLabel(templates, detection.selected_template_slug || "");

  return (
    <div className={`rounded-lg border p-3 ${tone.border}`}>
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold text-white">Hvorfor denne malen?</div>
            <Badge className={tone.badge}>{tone.label}</Badge>
            {detection.fallback_used && <Badge className="bg-slate-800 text-slate-200">Standard moderne mal</Badge>}
          </div>
          <p className={`mt-1 max-w-3xl text-xs leading-5 ${tone.text}`}>
            {detection.reason || `Valgt mal: ${selectedTemplate}.`}
          </p>
        </div>
        <div className="text-xs text-slate-400">Score {Number(detection.score || 0)}</div>
      </div>

      {matchedKeywords.length > 0 ? (
        <div className="mt-3">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Signaler fra nettsiden</div>
          <div className="flex flex-wrap gap-1.5">
            {matchedKeywords.map((keyword) => (
              <span key={keyword} className="rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1 text-[11px] text-slate-200">
                {keyword}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs text-slate-400">Ingen tydelige bransjesignaler funnet. Admin kan velge en annen mal manuelt.</p>
      )}

      {consideredTemplates.length > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
          {consideredTemplates.map((item) => (
            <div key={`${item.template_slug}-${item.score}`} className="rounded-lg border border-slate-800 bg-slate-950/50 p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-semibold text-slate-200">{getTemplateLabel(templates, item.template_slug || "")}</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] ${item.accepted ? "bg-emerald-500/20 text-emerald-100" : "bg-slate-800 text-slate-400"}`}>
                  {item.accepted ? "Tydelig" : "Svakt"}
                </span>
              </div>
              <div className="mt-1 text-[11px] text-slate-500">Score {Number(item.score || 0)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewInfo({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-slate-900/70 p-3"><div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div><div className="mt-1 truncate text-sm text-slate-200">{value}</div></div>;
}

function ReviewText({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3"><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{icon}{label}</div><p className="text-sm leading-6 text-slate-300">{value}</p></div>;
}

function ReviewList({ title, items }: { title: string; items?: string[] }) {
  const list = Array.isArray(items) ? items.filter(Boolean).slice(0, 8) : [];
  return <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3"><div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>{list.length === 0 ? <div className="text-sm text-slate-500">Ingen tydelige treff.</div> : <ul className="space-y-1.5">{list.map((item) => <li key={item} className="text-sm text-slate-300">• {item}</li>)}</ul>}</div>;
}

function FaqList({ items }: { items?: ImportedFaqItem[] }) {
  const list = Array.isArray(items) ? items.filter((item) => item?.question || item?.answer).slice(0, 6) : [];
  return <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3"><div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">FAQ</div>{list.length === 0 ? <div className="text-sm text-slate-500">Ingen tydelige spørsmål funnet.</div> : <div className="space-y-2">{list.map((item) => <div key={`${item.question || ""}-${item.answer || ""}`}><div className="text-sm font-medium text-slate-200">{item.question || "Spørsmål"}</div>{item.answer && <div className="mt-1 text-xs leading-5 text-slate-400">{item.answer}</div>}</div>)}</div>}</div>;
}

function ContactPanel({ contact }: { contact?: ImportedProfile["contact"] }) {
  const items = [
    contact?.email && `E-post: ${contact.email}`,
    contact?.phone && `Telefon: ${contact.phone}`,
    contact?.address && `Adresse: ${contact.address}`,
  ].filter((item): item is string => Boolean(item));
  return <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3"><div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Public contact info</div>{items.length === 0 ? <div className="text-sm text-slate-500">Ingen tydelig kontaktinfo funnet.</div> : <ul className="space-y-1.5">{items.map((item) => <li key={item} className="text-sm text-slate-300">{item}</li>)}</ul>}</div>;
}

function ColorSwatch({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2"><span className="h-5 w-5 rounded-full border border-white/20" style={{ backgroundColor: value }} /><span className="text-xs text-slate-300">{label}: {value}</span></div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <Card className="border-slate-700/50 bg-slate-800/50"><CardContent className="p-4 text-center"><Wallet className="mx-auto mb-2 h-5 w-5 text-purple-300" /><div className="text-xl font-bold text-white">{value}</div><div className="text-xs text-slate-500">{label}</div></CardContent></Card>; }
function Input({ label, value, onChange, required, type = "text", placeholder }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string; placeholder?: string }) { return <div><label className="mb-1 block text-xs font-medium text-slate-300">{label}</label><input required={required} type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-sm text-white outline-none focus:border-purple-500" /></div>; }
function Textarea({ label, value, onChange, rows = 3, placeholder }: { label: string; value: string; onChange: (value: string) => void; rows?: number; placeholder?: string }) { return <div><label className="mb-1 block text-xs font-medium text-slate-300">{label}</label><textarea rows={rows} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-purple-500" /></div>; }
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) { return <div><label className="mb-1 block text-xs font-medium text-slate-300">{label}</label><select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-sm text-white outline-none focus:border-purple-500">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>; }
function Info({ label, value, href }: { label: string; value: string; href?: string }) { return <div className="rounded-lg bg-slate-950/60 p-3"><div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>{href ? <a href={href} target="_blank" rel="noopener noreferrer" className="mt-1 flex items-center gap-1 truncate text-sm text-purple-300 hover:text-purple-200">{value}<ExternalLink className="h-3 w-3" /></a> : <div className="mt-1 truncate text-sm text-slate-300">{value}</div>}</div>; }
