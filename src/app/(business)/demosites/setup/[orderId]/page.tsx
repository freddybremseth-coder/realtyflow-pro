"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, ExternalLink, Loader2, Save, Settings, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OrderFeesCard } from "@/components/demosites/order-fees-card";
import { DEMO_SITE_TEMPLATE_SEEDS, getDemoSiteTemplateDefaults, type DemoSiteFaqItem } from "@/lib/demosites";
import {
  DEMO_SITE_LAYOUTS,
  DEMO_SITE_STYLES,
  isSignatureDemoSiteLayout,
  resolveDemoSiteDesign,
  type DemoSiteLayout,
  type DemoSiteStyleId,
} from "@/lib/demosites-design";

type SetupOrder = {
  id: string;
  company_name: string;
  status: string;
  template_slug?: string | null;
  preview_url?: string | null;
  claim_url?: string | null;
  production_url?: string | null;
  editable_fields?: Record<string, unknown> | null;
};

type FeesOrder = {
  id: string;
  setup_fee_nok: number;
  monthly_fee_nok: number;
  setup_cost_nok: number;
  monthly_cost_nok: number;
};

type DemoSiteTemplate = { slug: string; name: string; description?: string | null };
type SetupForm = {
  template_slug: string;
  layout_variant: DemoSiteLayout;
  style_preset: DemoSiteStyleId;
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
  layout_variant: "split",
  style_preset: "modern",
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

const text = (value: unknown) => (typeof value === "string" ? value : "");
const lines = (value: unknown) => (Array.isArray(value) ? value.map((item) => String(item || "")).join("\n") : "");

function faqText(value: unknown) {
  if (!Array.isArray(value)) return "";
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return String(item || "").trim();
      const faq = item as Partial<DemoSiteFaqItem>;
      return faq.question && faq.answer ? `${faq.question} :: ${faq.answer}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

function parseFaq(value: string) {
  return value
    .split("\n")
    .map((line) => {
      const [question, ...rest] = line.split("::");
      const answer = rest.join("::").trim();
      return question.trim() && answer ? { question: question.trim(), answer } : null;
    })
    .filter((item): item is DemoSiteFaqItem => Boolean(item));
}

function buildForm(fields: Record<string, unknown>, templateSlug: string): SetupForm {
  const design = resolveDemoSiteDesign({ templateSlug, editableFields: fields });
  return {
    template_slug: templateSlug,
    layout_variant: design.layout,
    style_preset: design.style,
    hero_title: text(fields.hero_title),
    hero_subtitle: text(fields.hero_subtitle),
    intro_text: text(fields.intro_text),
    services: lines(fields.services),
    products: lines(fields.products),
    prices: lines(fields.prices),
    trust_points: lines(fields.trust_points),
    faq: faqText(fields.faq),
    call_to_action: text(fields.call_to_action),
    contact_text: text(fields.contact_text),
    logo_url: text(fields.logo_url),
    brand_color: text(fields.brand_color),
    secondary_color: text(fields.secondary_color),
    accent_color: text(fields.accent_color),
    gallery_images: lines(fields.gallery_images),
  };
}

function resetForTemplate(form: SetupForm, templateSlug: string, companyName: string): SetupForm {
  const previous = getDemoSiteTemplateDefaults(form.template_slug, companyName);
  const next = getDemoSiteTemplateDefaults(templateSlug, companyName);
  const keepTitle = Boolean(form.hero_title.trim() && form.hero_title.trim() !== previous.hero_title);
  return {
    ...form,
    template_slug: templateSlug,
    hero_title: keepTitle ? form.hero_title : next.hero_title,
    hero_subtitle: next.hero_subtitle,
    intro_text: next.intro_text,
    services: next.services.join("\n"),
    products: next.products.join("\n"),
    prices: next.prices.join("\n"),
    trust_points: next.trust_points.join("\n"),
    faq: faqText(next.faq),
    call_to_action: next.call_to_action,
    contact_text: next.contact_text,
    brand_color: next.brand_color,
    secondary_color: next.secondary_color,
    accent_color: next.accent_color,
  };
}

function previewUrl(order: SetupOrder | null) {
  if (!order) return "";
  if (order.preview_url?.includes("/demosites/preview/")) return order.preview_url;
  if (order.claim_url?.includes("/demosites/claim/")) return order.claim_url.replace("/demosites/claim/", "/demosites/preview/");
  return order.preview_url || "";
}

export default function DemoSitesSetupEditorPage() {
  const { orderId } = useParams<{ orderId: string }>();
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
      const templateSlug = loadedOrder?.template_slug || loadedTemplates[0]?.slug || DEFAULT_TEMPLATE_SLUG;
      const fields = setupData.setup_content && typeof setupData.setup_content === "object" ? setupData.setup_content : {};
      setTemplates(loadedTemplates);
      setOrder(loadedOrder);
      setFees(feesData.order || null);
      setForm(buildForm(fields, templateSlug));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Kunne ikke hente oppsett.");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => void loadData(), [loadData]);

  async function saveSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/saas/demosites/setup", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId, ...form, faq: parseFaq(form.faq) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunne ikke lagre oppsett.");
      setMessage("Oppsett og designkonsept lagret.");
      await loadData();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Kunne ikke lagre oppsett.");
    } finally {
      setSaving(false);
    }
  }

  const selectedTemplate = templates.find((item) => item.slug === form.template_slug);
  const selectedLayout = DEMO_SITE_LAYOUTS.find((item) => item.id === form.layout_variant);
  const selectedStyle = DEMO_SITE_STYLES.find((item) => item.id === form.style_preset);
  const customerPreview = previewUrl(order);

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
          {customerPreview && <a href={customerPreview} target="_blank" rel="noopener noreferrer"><Button variant="outline" className="border-cyan-500/50 text-cyan-100">Åpne kunde-preview <ExternalLink className="ml-2 h-4 w-4" /></Button></a>}
          {order?.claim_url && <a href={order.claim_url} target="_blank" rel="noopener noreferrer"><Button variant="outline" className="border-slate-600">Åpne claim</Button></a>}
        </div>
      </div>

      {error && <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">{error}</div>}
      {message && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">{message}</div>}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_420px]">
        <Card className="border-cyan-500/20 bg-slate-800/50">
          <CardHeader><CardTitle className="text-white">Innhold og design på demosiden</CardTitle><CardDescription>Velg bransjemal, visuelt konsept, typografi, logo, tekst, farger og bilder.</CardDescription></CardHeader>
          <CardContent>
            <form onSubmit={saveSetup} className="space-y-4">
              <Select label="Demo-mal / bransje" value={form.template_slug} onChange={(value) => setForm((current) => resetForTemplate(current, value, order?.company_name || "Bedriften"))} options={templates.map((item) => ({ value: item.slug, label: item.name }))} />
              <p className="text-xs leading-5 text-slate-400">Bransjemalen styrer innholdsforslag. Designkonseptet styrer den visuelle komposisjonen og beholdes når du bytter bransje.</p>
              {selectedTemplate?.description && <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-3 text-xs text-cyan-100">{selectedTemplate.description}</div>}

              <div className="rounded-2xl border border-fuchsia-400/20 bg-gradient-to-br from-fuchsia-500/10 to-cyan-400/5 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-black text-white"><Sparkles className="h-4 w-4 text-fuchsia-300" />Visuelt uttrykk</div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Select label="Designkonsept" value={form.layout_variant} onChange={(value) => setForm((current) => ({ ...current, layout_variant: value as DemoSiteLayout }))} options={DEMO_SITE_LAYOUTS.map((item) => ({ value: item.id, label: `${item.group === "signature" ? "Signature · " : ""}${item.label}` }))} />
                  <Select label="Typografi / stemning" value={form.style_preset} onChange={(value) => setForm((current) => ({ ...current, style_preset: value as DemoSiteStyleId }))} options={DEMO_SITE_STYLES.map((item) => ({ value: item.id, label: item.label }))} />
                </div>
                <div className={`mt-3 rounded-xl border p-3 text-xs leading-5 ${isSignatureDemoSiteLayout(form.layout_variant) ? "border-fuchsia-300/25 bg-fuchsia-400/10 text-fuchsia-100" : "border-white/10 bg-white/[0.035] text-slate-300"}`}>
                  <strong>{selectedLayout?.label || form.layout_variant}</strong>{selectedLayout?.description ? ` — ${selectedLayout.description}` : ""}
                  {isSignatureDemoSiteLayout(form.layout_variant) && <span className="ml-2 rounded-full bg-fuchsia-300 px-2 py-0.5 text-[10px] font-black text-slate-950">WOW 2026</span>}
                </div>
              </div>

              <Input label="Logo URL" value={form.logo_url} onChange={(value) => setForm((current) => ({ ...current, logo_url: value }))} />
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <Input label="Primærfarge" value={form.brand_color} placeholder="#0ea5e9" onChange={(value) => setForm((current) => ({ ...current, brand_color: value }))} />
                <Input label="Sekundærfarge" value={form.secondary_color} placeholder="#111827" onChange={(value) => setForm((current) => ({ ...current, secondary_color: value }))} />
                <Input label="Aksentfarge" value={form.accent_color} placeholder="#22c55e" onChange={(value) => setForm((current) => ({ ...current, accent_color: value }))} />
              </div>
              <Input label="Hovedtittel" value={form.hero_title} onChange={(value) => setForm((current) => ({ ...current, hero_title: value }))} />
              <Input label="Undertittel" value={form.hero_subtitle} onChange={(value) => setForm((current) => ({ ...current, hero_subtitle: value }))} />
              <Textarea label="Intro tekst" value={form.intro_text} onChange={(value) => setForm((current) => ({ ...current, intro_text: value }))} />
              <Textarea label="Tjenester" value={form.services} hint="Én linje per tjeneste" onChange={(value) => setForm((current) => ({ ...current, services: value }))} />
              <Textarea label="Produkter" value={form.products} hint="Én linje per produkt" onChange={(value) => setForm((current) => ({ ...current, products: value }))} />
              <Textarea label="Priser / pakker" value={form.prices} hint="Én linje per pris eller pakke" onChange={(value) => setForm((current) => ({ ...current, prices: value }))} />
              <Textarea label="Hvorfor velge oss" value={form.trust_points} hint="Én linje per tillitspunkt" onChange={(value) => setForm((current) => ({ ...current, trust_points: value }))} />
              <Textarea label="FAQ" value={form.faq} hint="Én linje per spørsmål: Spørsmål :: Svar" onChange={(value) => setForm((current) => ({ ...current, faq: value }))} />
              <Input label="Call to action" value={form.call_to_action} onChange={(value) => setForm((current) => ({ ...current, call_to_action: value }))} />
              <Textarea label="Kontakttekst" value={form.contact_text} onChange={(value) => setForm((current) => ({ ...current, contact_text: value }))} />
              <Textarea label="Bilde-URL-er" value={form.gallery_images} hint="Én bilde-URL per linje" onChange={(value) => setForm((current) => ({ ...current, gallery_images: value }))} />
              <Button type="submit" disabled={saving} className="bg-cyan-600 hover:bg-cyan-500">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Lagre oppsett</Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {fees && <OrderFeesCard orderId={orderId} setupFeeNok={fees.setup_fee_nok} monthlyFeeNok={fees.monthly_fee_nok} setupCostNok={fees.setup_cost_nok} monthlyCostNok={fees.monthly_cost_nok} onSaved={loadData} />}
          <Card className="border-slate-700/50 bg-slate-800/50">
            <CardHeader><CardTitle className="text-white">Status</CardTitle><CardDescription>Valget brukes både i kunde-preview og etter publisering.</CardDescription></CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-300">
              <div>Status: {order?.status || "-"}</div>
              <div>Bransjemal: {selectedTemplate?.name || form.template_slug}</div>
              <div>Design: {selectedLayout?.label || form.layout_variant} · {selectedStyle?.label || form.style_preset}</div>
              {customerPreview ? <a href={customerPreview} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-200">Åpne kunde-preview <ExternalLink className="h-3 w-3" /></a> : <div className="text-xs text-slate-500">Preview-lenke mangler</div>}
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

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <label className="block"><span className="mb-1 block text-xs font-medium text-slate-300">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-sm text-white outline-none focus:border-cyan-500">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

function Textarea({ label, value, onChange, hint }: { label: string; value: string; onChange: (value: string) => void; hint?: string }) {
  return <label className="block"><span className="mb-1 block text-xs font-medium text-slate-300">{label}</span><textarea value={value} onChange={(event) => onChange(event.target.value)} rows={4} className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500" />{hint && <span className="mt-1 block text-[11px] text-slate-500">{hint}</span>}</label>;
}
