"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, ExternalLink, Loader2, Save, Settings } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OrderFeesCard } from "@/components/demosites/order-fees-card";
import { DEMO_SITE_TEMPLATE_SEEDS, getDemoSiteTemplateDefaults, type DemoSiteFaqItem } from "@/lib/demosites";

type SetupOrder = {
  id: string;
  company_name: string;
  status: string;
  template_slug?: string | null;
  preview_url?: string | null;
  claim_url?: string | null;
  production_url?: string | null;
  logo_url?: string | null;
  editable_fields?: Record<string, unknown> | null;
};

type FeesOrder = {
  id: string;
  setup_fee_nok: number;
  monthly_fee_nok: number;
  setup_cost_nok: number;
  monthly_cost_nok: number;
};

type DemoSiteTemplate = {
  slug: string;
  name: string;
  category?: string | null;
  description?: string | null;
};

type SetupForm = {
  template_slug: string;
  hero_title: string;
  hero_subtitle: string;
  intro_text: string;
  services: string;
  products: string;
  prices: string;
  trust_points: string;
  faq: string;
  call_to_action: string;
  contact_text: string;
  logo_url: string;
  brand_color: string;
  secondary_color: string;
  accent_color: string;
  gallery_images: string;
};

const DEFAULT_TEMPLATE_SLUG = DEMO_SITE_TEMPLATE_SEEDS[0]?.slug || "elektro";
const DEFAULT_TEMPLATES = DEMO_SITE_TEMPLATE_SEEDS as DemoSiteTemplate[];

const EMPTY_FORM: SetupForm = {
  template_slug: DEFAULT_TEMPLATE_SLUG,
  hero_title: "",
  hero_subtitle: "",
  intro_text: "",
  services: "",
  products: "",
  prices: "",
  trust_points: "",
  faq: "",
  call_to_action: "",
  contact_text: "",
  logo_url: "",
  brand_color: "",
  secondary_color: "",
  accent_color: "",
  gallery_images: "",
};

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function listValue(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item || "")).join("\n") : "";
}

function faqValue(value: unknown) {
  if (!Array.isArray(value)) return "";

  return value
    .map((item) => {
      if (item && typeof item === "object") {
        const faq = item as Partial<DemoSiteFaqItem>;
        const question = stringValue(faq.question).trim();
        const answer = stringValue(faq.answer).trim();
        return question && answer ? `${question} :: ${answer}` : "";
      }

      return String(item || "").trim();
    })
    .filter(Boolean)
    .join("\n");
}

function parseFaqValue(value: string) {
  return value
    .split("\n")
    .map((line) => {
      const [question, ...answerParts] = line.split("::");
      const answer = answerParts.join("::").trim();
      return question.trim() && answer ? { question: question.trim(), answer } : null;
    })
    .filter((item): item is DemoSiteFaqItem => Boolean(item));
}

function getCompanyName(order?: SetupOrder | null) {
  return order?.company_name || "Bedriften";
}

function buildForm(fields: Record<string, unknown>, selectedTemplateSlug: string): SetupForm {
  return {
    template_slug: selectedTemplateSlug || DEFAULT_TEMPLATE_SLUG,
    hero_title: stringValue(fields.hero_title),
    hero_subtitle: stringValue(fields.hero_subtitle),
    intro_text: stringValue(fields.intro_text),
    services: listValue(fields.services),
    products: listValue(fields.products),
    prices: listValue(fields.prices),
    trust_points: listValue(fields.trust_points),
    faq: faqValue(fields.faq),
    call_to_action: stringValue(fields.call_to_action),
    contact_text: stringValue(fields.contact_text),
    logo_url: stringValue(fields.logo_url),
    brand_color: stringValue(fields.brand_color),
    secondary_color: stringValue(fields.secondary_color),
    accent_color: stringValue(fields.accent_color),
    gallery_images: listValue(fields.gallery_images),
  };
}

function buildTemplateResetForm(previousForm: SetupForm, nextTemplateSlug: string, companyName: string): SetupForm {
  const previousDefaults = getDemoSiteTemplateDefaults(previousForm.template_slug, companyName);
  const nextDefaults = getDemoSiteTemplateDefaults(nextTemplateSlug, companyName);
  const previousHeroTitle = previousForm.hero_title.trim();
  const keepCustomHeroTitle = Boolean(previousHeroTitle && previousHeroTitle !== previousDefaults.hero_title);

  return {
    ...previousForm,
    template_slug: nextTemplateSlug,
    hero_title: keepCustomHeroTitle ? previousForm.hero_title : nextDefaults.hero_title,
    hero_subtitle: nextDefaults.hero_subtitle,
    intro_text: nextDefaults.intro_text,
    services: nextDefaults.services.join("\n"),
    products: nextDefaults.products.join("\n"),
    prices: nextDefaults.prices.join("\n"),
    trust_points: nextDefaults.trust_points.join("\n"),
    faq: faqValue(nextDefaults.faq),
    call_to_action: nextDefaults.call_to_action,
    contact_text: nextDefaults.contact_text,
    brand_color: nextDefaults.brand_color,
    secondary_color: nextDefaults.secondary_color,
    accent_color: nextDefaults.accent_color,
  };
}

function customerPreviewUrl(order?: SetupOrder | null) {
  if (!order) return "";
  if (order.preview_url?.includes("/demosites/preview/")) return order.preview_url;
  if (order.claim_url?.includes("/demosites/claim/")) return order.claim_url.replace("/demosites/claim/", "/demosites/preview/");
  return order.preview_url || "";
}

export default function DemoSitesSetupEditorPage() {
  const params = useParams<{ orderId: string }>();
  const orderId = params.orderId;
  const [order, setOrder] = useState<SetupOrder | null>(null);
  const [fees, setFees] = useState<FeesOrder | null>(null);
  const [templates, setTemplates] = useState<DemoSiteTemplate[]>(DEFAULT_TEMPLATES);
  const [form, setForm] = useState<SetupForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [setupResponse, feesResponse, templatesResponse] = await Promise.all([
        fetch(`/api/saas/demosites/setup?order_id=${encodeURIComponent(orderId)}`, { cache: "no-store" }),
        fetch(`/api/saas/demosites/fees?order_id=${encodeURIComponent(orderId)}`, { cache: "no-store" }),
        fetch("/api/saas/demosites", { cache: "no-store" }),
      ]);

      const setupData = await setupResponse.json();
      const feesData = await feesResponse.json();
      const templatesData = await templatesResponse.json().catch(() => ({}));
      if (!setupResponse.ok) throw new Error(setupData.error || "Kunne ikke hente oppsett.");
      if (!feesResponse.ok) throw new Error(feesData.error || "Kunne ikke hente priser.");

      const loadedTemplates = Array.isArray(templatesData.templates) && templatesData.templates.length ? templatesData.templates : DEFAULT_TEMPLATES;
      const loadedOrder = setupData.order || null;
      const selectedTemplateSlug = loadedOrder?.template_slug || loadedTemplates[0]?.slug || DEFAULT_TEMPLATE_SLUG;
      const fields = setupData.setup_content && typeof setupData.setup_content === "object" ? setupData.setup_content : {};
      setTemplates(loadedTemplates);
      setOrder(loadedOrder);
      setFees(feesData.order || null);
      setForm(buildForm(fields, selectedTemplateSlug));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke hente oppsett.");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { loadData(); }, [loadData]);

  async function saveSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/saas/demosites/setup", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId, ...form, faq: parseFaqValue(form.faq) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunne ikke lagre oppsett.");
      setMessage("Oppsett lagret.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke lagre oppsett.");
    } finally {
      setSaving(false);
    }
  }

  function handleTemplateChange(templateSlug: string) {
    setForm((prev) => buildTemplateResetForm(prev, templateSlug, getCompanyName(order)));
    setMessage(null);
    setError(null);
  }

  const selectedTemplate = templates.find((template) => template.slug === form.template_slug);
  const previewUrl = customerPreviewUrl(order);

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-cyan-300" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <a href="/demosites" className="mb-3 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"><ArrowLeft className="h-4 w-4" />Tilbake til DemoSites CRM</a>
          <h1 className="flex items-center gap-3 text-3xl font-bold text-white"><Settings className="text-cyan-300" /> Oppsett</h1>
          <p className="mt-2 text-sm text-slate-400">{order?.company_name || orderId}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {previewUrl && <a href={previewUrl} target="_blank" rel="noopener noreferrer"><Button variant="outline" className="border-cyan-500/50 text-cyan-100">Åpne kunde-preview <ExternalLink className="ml-2 h-4 w-4" /></Button></a>}
          {order?.claim_url && <a href={order.claim_url} target="_blank" rel="noopener noreferrer"><Button variant="outline" className="border-slate-600">Åpne claim</Button></a>}
        </div>
      </div>

      {error && <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">{error}</div>}
      {message && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">{message}</div>}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_420px]">
        <Card className="border-cyan-500/20 bg-slate-800/50">
          <CardHeader>
            <CardTitle className="text-white">Innhold på demosiden</CardTitle>
            <CardDescription>Velg demo-mal og endre logo, tekst, farger og bilder for denne demoen.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={saveSetup} className="space-y-4">
              <Select label="Demo-mal" value={form.template_slug} onChange={handleTemplateChange} options={templates.map((template) => ({ value: template.slug, label: template.name }))} />
              <p className="text-xs leading-5 text-slate-400">Bytter du mal, oppdateres standard tekst, tjenester, priser og farger. Logo, bilder og kundedata beholdes.</p>
              {selectedTemplate?.description && <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-3 text-xs text-cyan-100">{selectedTemplate.description}</div>}
              <Input label="Logo URL" value={form.logo_url} onChange={(value) => setForm((prev) => ({ ...prev, logo_url: value }))} />
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <Input label="Primærfarge" value={form.brand_color} onChange={(value) => setForm((prev) => ({ ...prev, brand_color: value }))} placeholder="#0ea5e9" />
                <Input label="Sekundærfarge" value={form.secondary_color} onChange={(value) => setForm((prev) => ({ ...prev, secondary_color: value }))} placeholder="#111827" />
                <Input label="Aksentfarge" value={form.accent_color} onChange={(value) => setForm((prev) => ({ ...prev, accent_color: value }))} placeholder="#22c55e" />
              </div>
              <Input label="Hovedtittel" value={form.hero_title} onChange={(value) => setForm((prev) => ({ ...prev, hero_title: value }))} />
              <Input label="Undertittel" value={form.hero_subtitle} onChange={(value) => setForm((prev) => ({ ...prev, hero_subtitle: value }))} />
              <Textarea label="Intro tekst" value={form.intro_text} onChange={(value) => setForm((prev) => ({ ...prev, intro_text: value }))} />
              <Textarea label="Tjenester" value={form.services} onChange={(value) => setForm((prev) => ({ ...prev, services: value }))} hint="Én linje per tjeneste" />
              <Textarea label="Produkter" value={form.products} onChange={(value) => setForm((prev) => ({ ...prev, products: value }))} hint="Én linje per produkt" />
              <Textarea label="Priser / pakker" value={form.prices} onChange={(value) => setForm((prev) => ({ ...prev, prices: value }))} hint="Én linje per pris eller pakke" />
              <Textarea label="Hvorfor velge oss" value={form.trust_points} onChange={(value) => setForm((prev) => ({ ...prev, trust_points: value }))} hint="Én linje per tillitspunkt" />
              <Textarea label="FAQ" value={form.faq} onChange={(value) => setForm((prev) => ({ ...prev, faq: value }))} hint="Én linje per spørsmål: Spørsmål :: Svar" />
              <Input label="Call to action" value={form.call_to_action} onChange={(value) => setForm((prev) => ({ ...prev, call_to_action: value }))} />
              <Textarea label="Kontakttekst" value={form.contact_text} onChange={(value) => setForm((prev) => ({ ...prev, contact_text: value }))} />
              <Textarea label="Bilde-URL-er" value={form.gallery_images} onChange={(value) => setForm((prev) => ({ ...prev, gallery_images: value }))} hint="Én bilde-URL per linje" />
              <Button type="submit" disabled={saving} className="bg-cyan-600 hover:bg-cyan-500">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Lagre oppsett
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {fees && <OrderFeesCard orderId={orderId} setupFeeNok={fees.setup_fee_nok} monthlyFeeNok={fees.monthly_fee_nok} setupCostNok={fees.setup_cost_nok} monthlyCostNok={fees.monthly_cost_nok} onSaved={loadData} />}
          <Card className="border-slate-700/50 bg-slate-800/50">
            <CardHeader>
              <CardTitle className="text-white">Status</CardTitle>
              <CardDescription>Oppsettet lagres på bestillingen og brukes i kundens preview.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-300">
              <div>Status: {order?.status || "-"}</div>
              <div>Valgt mal: {selectedTemplate?.name || form.template_slug || "-"}</div>
              {previewUrl ? <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-200">Åpne kunde-preview <ExternalLink className="h-3 w-3" /></a> : <div className="text-xs text-slate-500">Preview-lenke mangler</div>}
              {order?.production_url && <a href={order.production_url} target="_blank" rel="noopener noreferrer" className="block text-emerald-300 hover:text-emerald-200">Åpne live-side</a>}
              <div className="break-all text-xs text-slate-500">Order ID: {orderId}</div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, placeholder = "" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="block"><span className="mb-1 block text-xs font-medium text-slate-300">{label}</span><input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-sm text-white outline-none focus:border-cyan-500" /></label>;
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) {
  return <label className="block"><span className="mb-1 block text-xs font-medium text-slate-300">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-sm text-white outline-none focus:border-cyan-500">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

function Textarea({ label, value, onChange, hint }: { label: string; value: string; onChange: (value: string) => void; hint?: string }) {
  return <label className="block"><span className="mb-1 block text-xs font-medium text-slate-300">{label}</span><textarea value={value} onChange={(event) => onChange(event.target.value)} rows={4} className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500" />{hint && <span className="mt-1 block text-[11px] text-slate-500">{hint}</span>}</label>;
}
