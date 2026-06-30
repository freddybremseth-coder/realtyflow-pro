"use client";

import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle, CreditCard, ExternalLink, FileText, Globe, ImageIcon, Link2, Loader2, MonitorSmartphone, Palette, PlusCircle, Rocket, Search, Send, Wallet, XCircle } from "lucide-react";
import { TempDemoCard } from "@/components/demosites/temp-demo-card";
import { LeadPipelineCard } from "@/components/demosites/lead-pipeline-card";
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
};
type WebsiteImportResult = { profile: ImportedProfile; editable_fields: Record<string, unknown>; warnings: string[] };
type WebsiteImportSuccess = { title: string; order?: DemoSiteOrder | null };

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

const statusLabel: Record<DemoSiteStatus, string> = { lead: "Lead", draft_preview: "Midlertidig demo", ordered: "Bestilt", in_setup: "Oppsett", preview_ready: "Preview", approved: "Godkjent", deployed: "Live", paused: "Pauset", expired: "Utløpt", cancelled: "Kansellert" };
const billingLabel: Record<DemoSiteBillingStatus, string> = { not_invoiced: "Ikke fakturert", pending: "Venter", paid: "Betalt", overdue: "Forfalt", cancelled: "Stoppet" };

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

export default function DemoSitesPage() {
  const [orders, setOrders] = useState<DemoSiteOrder[]>([]);
  const [templates, setTemplates] = useState<DemoSiteTemplate[]>(DEFAULT_TEMPLATES);
  const [events, setEvents] = useState<DemoSiteEvent[]>([]);
  const [summary, setSummary] = useState<DemoSiteSummary>(EMPTY_SUMMARY);
  const [form, setForm] = useState<OrderFormState>(INITIAL_FORM);
  const [importForm, setImportForm] = useState<WebsiteImportFormState>(INITIAL_IMPORT_FORM);
  const [importContact, setImportContact] = useState<WebsiteImportContactState>(INITIAL_IMPORT_CONTACT);
  const [importResult, setImportResult] = useState<WebsiteImportResult | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importSaving, setImportSaving] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<WebsiteImportSuccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke hente DemoSites CRM.");
    } finally {
      setLoading(false);
    }
  }, []);

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

  async function analyzeWebsiteImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setImportLoading(true);
    setImportError(null);
    setImportSuccess(null);
    setImportResult(null);
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
      };
      setImportResult(nextResult);
      setImportContact({
        customer_name: nextResult.profile.company_name || importForm.company_name || "",
        customer_email: nextResult.profile.contact?.email || "",
        customer_phone: nextResult.profile.contact?.phone || "",
      });
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Kunne ikke analysere nettsiden.");
    } finally {
      setImportLoading(false);
    }
  }

  async function createDemoFromImport() {
    if (!importResult) return;
    const profile = importResult.profile;
    const companyName = (profile.company_name || importForm.company_name || "").trim();
    const customerName = (importContact.customer_name || companyName).trim();
    const importedCustomerEmail = importContact.customer_email.trim();
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
          customer_phone: importContact.customer_phone || profile.contact?.phone || undefined,
          industry: profile.detected_industry || undefined,
          website_url: profile.website_url || importForm.website_url,
          source_url: profile.website_url || importForm.website_url,
          package_id: "standard",
          template_slug: profile.recommended_template_slug || DEFAULT_TEMPLATE_SLUG,
          logo_url: profile.logo_url || importResult.editable_fields.logo_url || undefined,
          brand_color: profile.colors?.primary || importResult.editable_fields.brand_color || undefined,
          extracted_profile: profile,
          editable_fields: importResult.editable_fields,
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
      setImportSuccess({ title: `${companyName} er opprettet som ny demo.`, order: createdOrder });
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ukjent feil.";
      setImportError(`Kunne ikke opprette demo fra analyse: ${message}`);
    } finally {
      setImportSaving(false);
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

      <WebsiteImportCard
        form={importForm}
        contact={importContact}
        result={importResult}
        success={importSuccess}
        error={importError}
        loading={importLoading}
        saving={importSaving}
        orders={orders}
        templates={templateOptions}
        onAnalyze={analyzeWebsiteImport}
        onCreate={createDemoFromImport}
        onApplyToOrder={applyImportToSelectedOrder}
        onDiscard={() => {
          setImportResult(null);
          setImportSuccess(null);
          setImportError(null);
        }}
        onFormChange={(patch) => setImportForm((prev) => ({ ...prev, ...patch }))}
        onContactChange={(patch) => setImportContact((prev) => ({ ...prev, ...patch }))}
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
                    {order.claim_url && <a href={order.claim_url} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="outline" className="border-slate-600">Åpne claim</Button></a>}
                    {order.production_url && <a href={order.production_url} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="outline" className="border-emerald-500/50 text-emerald-100">Åpne live</Button></a>}
                    <a href={`/demosites/setup/${order.id}`}><Button size="sm" variant="outline" className="border-slate-600">Oppsett</Button></a>
                    <Button size="sm" variant="outline" className="border-purple-500/40 text-purple-200" onClick={() => updateOrder(order, { status: "preview_ready" })}>Sett preview klar</Button>
                    <Button size="sm" variant="outline" className="border-emerald-500/40 text-emerald-200" onClick={() => updateOrder(order, { status: "approved" })}><CheckCircle className="mr-1 h-3.5 w-3.5" />Godkjent</Button>
                    <Button size="sm" className="bg-green-600 hover:bg-green-500" onClick={() => updateOrder(order, { status: "deployed" })}><Rocket className="mr-1 h-3.5 w-3.5" />Sett live-status</Button>
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500" onClick={() => updateOrder(order, { billing_status: "paid" })}><CreditCard className="mr-1 h-3.5 w-3.5" />Betalt</Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

type WebsiteImportCardProps = {
  form: WebsiteImportFormState;
  contact: WebsiteImportContactState;
  result: WebsiteImportResult | null;
  success: WebsiteImportSuccess | null;
  error: string | null;
  loading: boolean;
  saving: boolean;
  orders: DemoSiteOrder[];
  templates: DemoSiteTemplate[];
  onAnalyze: (event: FormEvent<HTMLFormElement>) => void;
  onCreate: () => void;
  onApplyToOrder: () => void;
  onDiscard: () => void;
  onFormChange: (patch: Partial<WebsiteImportFormState>) => void;
  onContactChange: (patch: Partial<WebsiteImportContactState>) => void;
};

function WebsiteImportCard({
  form,
  contact,
  result,
  success,
  error,
  loading,
  saving,
  orders,
  templates,
  onAnalyze,
  onCreate,
  onApplyToOrder,
  onDiscard,
  onFormChange,
  onContactChange,
}: WebsiteImportCardProps) {
  const profile = result?.profile;
  const sourcePages = profile?.source_pages || [];
  const colorSwatches = getColorSwatches(profile?.colors);
  const successLinks = getImportOrderLinks(success?.order);
  const selectedTemplateLabel = getTemplateLabel(templates, profile?.recommended_template_slug);
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

            {colorSwatches.length > 0 && (
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><Palette className="h-3.5 w-3.5" />Farger</div>
                <div className="flex flex-wrap gap-2">
                  {colorSwatches.map((swatch) => <ColorSwatch key={swatch.label} label={swatch.label} value={swatch.value} />)}
                </div>
              </div>
            )}

            <ReviewText icon={<FileText className="h-4 w-4" />} label="Summary" value={profile.summary || profile.description || "Ingen oppsummering funnet."} />
            <PreviewUsagePanel result={result} />

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

function PreviewUsagePanel({ result }: { result: WebsiteImportResult }) {
  const fields = result.editable_fields || {};
  const sources = isRecord(fields.profile_import_field_sources) ? fields.profile_import_field_sources : {};

  return (
    <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-3">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-cyan-100">Brukes i preview</div>
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
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) { return <div><label className="mb-1 block text-xs font-medium text-slate-300">{label}</label><select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-sm text-white outline-none focus:border-purple-500">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>; }
function Info({ label, value, href }: { label: string; value: string; href?: string }) { return <div className="rounded-lg bg-slate-950/60 p-3"><div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>{href ? <a href={href} target="_blank" rel="noopener noreferrer" className="mt-1 flex items-center gap-1 truncate text-sm text-purple-300 hover:text-purple-200">{value}<ExternalLink className="h-3 w-3" /></a> : <div className="mt-1 truncate text-sm text-slate-300">{value}</div>}</div>; }
