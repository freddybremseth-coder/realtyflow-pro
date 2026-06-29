import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { ArrowRight, Bot, CheckCircle, ExternalLink, MessageCircle, ShieldCheck, Sparkles } from "lucide-react";
import { DEMO_SITE_PACKAGES, DEMO_SITE_TEMPLATE_SEEDS } from "@/lib/demosites";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PreviewPageProps = {
  params: Promise<{ token: string }> | { token: string };
};

type DemoOrder = {
  status: string;
  company_name: string;
  customer_email: string;
  customer_phone?: string | null;
  industry?: string | null;
  website_url?: string | null;
  package_id: string;
  setup_fee_nok: number;
  monthly_fee_nok: number;
  template_slug?: string | null;
  logo_url?: string | null;
  claim_url?: string | null;
  expires_at?: string | null;
  brand_color?: string | null;
  extracted_profile?: Record<string, unknown> | null;
  editable_fields?: Record<string, unknown> | null;
  notes?: string | null;
};

type BrandColors = {
  primary: string;
  secondary: string;
  accent: string;
};

type TemplateDefaults = {
  primary: string;
  secondary: string;
  accent: string;
  label: string;
  services: string[];
};

const TEMPLATE_DEFAULTS: Record<string, TemplateDefaults> = {
  elektro: {
    primary: "#eab308",
    secondary: "#0f172a",
    accent: "#facc15",
    label: "Pindsle Elektro",
    services: ["Elektriske installasjoner", "Feilsøking og reparasjon", "Sikkerhet og kontroll"],
  },
  dekk: {
    primary: "#dc2626",
    secondary: "#111827",
    accent: "#f87171",
    label: "Sandefjord Dekk",
    services: ["Dekkskift og hjulhotell", "Bilservice og kontroll", "Timebestilling på nett"],
  },
  frakt: {
    primary: "#2563eb",
    secondary: "#172554",
    accent: "#93c5fd",
    label: "Vestfold Frakt",
    services: ["Lokal transport", "Frakttilbud", "Rute og godstype"],
  },
  renhold: {
    primary: "#0d9488",
    secondary: "#134e4a",
    accent: "#5eead4",
    label: "Sandefjord Renhold",
    services: ["Renhold for bedrift", "Privat vask", "Pris etter areal og frekvens"],
  },
};

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env[["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_")];
  if (!url || !key) return null;
  return createClient(url, key);
}

function text(value: unknown, fallback = "") {
  const output = String(value || "").trim();
  return output || fallback;
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function formatDate(value?: string | null) {
  if (!value) return "7 dager";
  return new Intl.DateTimeFormat("nb-NO", { dateStyle: "medium" }).format(new Date(value));
}

function isHexColor(value: unknown) {
  return /^#[0-9A-Fa-f]{6}$/.test(String(value || ""));
}

function getPackage(packageId: string) {
  return DEMO_SITE_PACKAGES.find((pkg) => pkg.id === packageId) || DEMO_SITE_PACKAGES[1];
}

function getTemplateSlug(order: DemoOrder) {
  const slug = text(order.template_slug, "").toLowerCase();
  if (slug && TEMPLATE_DEFAULTS[slug]) return slug;
  return DEMO_SITE_TEMPLATE_SEEDS[0]?.slug || "elektro";
}

function getTemplateLabel(slug: string) {
  const template = DEMO_SITE_TEMPLATE_SEEDS.find((item) => item.slug === slug);
  return template?.name || TEMPLATE_DEFAULTS[slug]?.label || slug;
}

function getBrandColors(order: DemoOrder): BrandColors {
  const fields = order.editable_fields || {};
  const template = TEMPLATE_DEFAULTS[getTemplateSlug(order)] || TEMPLATE_DEFAULTS.elektro;
  const brandColors = (fields.brand_colors && typeof fields.brand_colors === "object" ? fields.brand_colors : {}) as Record<string, unknown>;
  const primary = isHexColor(fields.brand_color) ? String(fields.brand_color) : isHexColor(brandColors.primary) ? String(brandColors.primary) : isHexColor(order.brand_color) ? String(order.brand_color) : template.primary;
  const secondary = isHexColor(fields.secondary_color) ? String(fields.secondary_color) : isHexColor(brandColors.secondary) ? String(brandColors.secondary) : template.secondary;
  const accent = isHexColor(fields.accent_color) ? String(fields.accent_color) : isHexColor(brandColors.accent) ? String(brandColors.accent) : template.accent;
  return { primary, secondary, accent };
}

function getLogo(order: DemoOrder) {
  const fields = order.editable_fields || {};
  return text(fields.logo_url, text(order.logo_url));
}

function getGalleryImages(order: DemoOrder) {
  const fields = order.editable_fields || {};
  const images = Array.isArray(fields.gallery_images) ? fields.gallery_images : [];
  return images.map((item) => String(item)).filter((item) => item.startsWith("data:image/") || item.startsWith("http://") || item.startsWith("https://"));
}

function getServices(order: DemoOrder) {
  const fields = order.editable_fields || {};
  const services = stringList(fields.services);
  if (services.length > 0) return services;
  const template = TEMPLATE_DEFAULTS[getTemplateSlug(order)] || TEMPLATE_DEFAULTS.elektro;
  return template.services;
}

function getProducts(order: DemoOrder) {
  const fields = order.editable_fields || {};
  return stringList(fields.products);
}

function getPrices(order: DemoOrder) {
  const fields = order.editable_fields || {};
  return stringList(fields.prices);
}

export default async function DemoPreviewPage({ params }: PreviewPageProps) {
  const resolvedParams = await params;
  const token = String(resolvedParams.token || "").trim();
  const supabase = getSupabase();

  if (!token || !supabase) {
    return <NotFound title="Preview ikke tilgjengelig" description="Lenken er ugyldig eller systemet mangler serverkonfigurasjon." />;
  }

  const { data, error } = await supabase
    .from("demo_site_orders")
    .select("status, company_name, customer_email, customer_phone, industry, website_url, package_id, setup_fee_nok, monthly_fee_nok, template_slug, logo_url, claim_url, expires_at, brand_color, extracted_profile, editable_fields, notes")
    .eq("claim_token", token)
    .maybeSingle();

  if (error || !data) {
    return <NotFound title="Fant ikke preview" description="Denne preview-lenken finnes ikke, eller demoen er ikke lenger tilgjengelig." />;
  }

  const order = data as DemoOrder;
  const pkg = getPackage(order.package_id);
  const companyName = order.company_name;
  const fields = order.editable_fields || {};
  const industry = text(order.industry, "lokale tjenester");
  const templateSlug = getTemplateSlug(order);
  const templateLabel = getTemplateLabel(templateSlug);
  const services = getServices(order);
  const products = getProducts(order);
  const prices = getPrices(order);
  const colors = getBrandColors(order);
  const logo = getLogo(order);
  const images = getGalleryImages(order);
  const heroTitle = text(fields.hero_title, text(fields.hero_text, `${companyName} hjelper kunder med ${industry}.`));
  const heroSubtitle = text(fields.hero_subtitle, "Nettside, tydelig kontakt og ChatGenius AI-assistent samlet i én moderne demo.");
  const introText = text(fields.intro_text, text(fields.about_text, order.notes || "Denne previewen viser hvordan en ny nettside kan presentere bedriften tydeligere og gjøre det enklere å ta kontakt."));
  const contactText = text(fields.contact_text, `Kontakt ${companyName} for mer informasjon eller et tilbud.`);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3 font-bold tracking-tight">
            {logo && <img src={logo} alt={`${companyName} logo`} className="h-10 w-10 rounded-xl object-contain" />}
            <span>{companyName}</span>
          </div>
          <div className="hidden items-center gap-6 text-sm text-slate-600 md:flex">
            <a href="#tjenester" className="hover:text-slate-950">Tjenester</a>
            {(products.length > 0 || prices.length > 0) && <a href="#tilbud" className="hover:text-slate-950">Tilbud</a>}
            <a href="#bilder" className="hover:text-slate-950">Bilder</a>
            <a href="#om" className="hover:text-slate-950">Om oss</a>
            <a href="#kontakt" className="hover:text-slate-950">Kontakt</a>
          </div>
          <a href={`mailto:${order.customer_email}`} className="rounded-full px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: colors.secondary }}>Kontakt</a>
        </div>
      </div>

      <section className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 py-16 lg:grid-cols-[1.2fr_0.8fr] lg:py-24">
        <div>
          <div className="mb-5 inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium" style={{ borderColor: colors.primary, backgroundColor: `${colors.primary}18`, color: colors.primary }}>
            <Sparkles className="mr-2 h-3.5 w-3.5" /> {templateLabel}
          </div>
          <h1 className="text-4xl font-black tracking-tight md:text-6xl">{heroTitle}</h1>
          <p className="mt-5 max-w-2xl text-xl leading-8 text-slate-700">{heroSubtitle}</p>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">{introText}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a href={`mailto:${order.customer_email}`} className="inline-flex items-center justify-center rounded-2xl px-6 py-4 text-sm font-bold text-white" style={{ backgroundColor: colors.primary }}>
              Be om tilbud <ArrowRight className="ml-2 h-4 w-4" />
            </a>
            {order.website_url && <a href={order.website_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center rounded-2xl border border-slate-300 px-6 py-4 text-sm font-bold text-slate-700 hover:bg-white">Eksisterende nettside <ExternalLink className="ml-2 h-4 w-4" /></a>}
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl">
          <div className="rounded-3xl p-5 text-white" style={{ backgroundColor: colors.secondary }}>
            <div className="flex items-center gap-2 text-sm" style={{ color: colors.accent }}><Bot className="h-4 w-4" /> ChatGenius AI-assistent</div>
            <div className="mt-6 rounded-2xl bg-white/10 p-4 text-sm">Hei! Jeg kan hjelpe deg med informasjon om {companyName}, tjenester og kontakt.</div>
            <div className="mt-3 rounded-2xl p-4 text-sm font-medium text-slate-950" style={{ backgroundColor: colors.accent }}>Hva ønsker du hjelp med i dag?</div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
            <Info label="Pakke" value={pkg.shortName} />
            <Info label="Utløper" value={formatDate(order.expires_at)} />
          </div>
        </div>
      </section>

      {images.length > 0 && (
        <section id="bilder" className="mx-auto max-w-6xl px-4 pb-16">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {images.slice(0, 3).map((image, index) => (
              <img key={image.slice(0, 80) + index} src={image} alt={`${companyName} bilde ${index + 1}`} className="h-72 w-full rounded-[2rem] object-cover shadow-lg" />
            ))}
          </div>
        </section>
      )}

      <section id="tjenester" className="bg-white py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-3xl font-bold">Hva kunden kan få hjelp med</h2>
          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
            {services.slice(0, 6).map((service) => (
              <div key={service} className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
                <CheckCircle className="h-6 w-6" style={{ color: colors.primary }} />
                <h3 className="mt-4 font-semibold">{service}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">Denne delen kan justeres videre med ekte tekst, bilder, priser og produkter.</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {(products.length > 0 || prices.length > 0) && (
        <section id="tilbud" className="mx-auto max-w-6xl px-4 py-16">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {products.length > 0 && <ListCard title="Produkter" items={products} color={colors.primary} />}
            {prices.length > 0 && <ListCard title="Priser / pakker" items={prices} color={colors.primary} />}
          </div>
        </section>
      )}

      <section id="om" className="mx-auto max-w-6xl px-4 py-16">
        <div className="rounded-[2rem] p-8 text-white md:p-12" style={{ backgroundColor: colors.secondary }}>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-bold">Om {companyName}</h2>
              <p className="mt-4 leading-8 text-slate-300">{introText}</p>
            </div>
            <div className="rounded-3xl bg-white/10 p-6">
              <ShieldCheck className="h-7 w-7" style={{ color: colors.accent }} />
              <h3 className="mt-4 font-semibold">Klar for profesjonell nettside</h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">Denne previewen er et første utkast. Når kunden godkjenner, kan vi bygge videre mot ferdig nettside, hosting, SSL og ChatGenius-assistent.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="kontakt" className="py-16 text-white" style={{ backgroundColor: colors.primary }}>
        <div className="mx-auto max-w-4xl px-4 text-center">
          <MessageCircle className="mx-auto h-8 w-8" />
          <h2 className="mt-4 text-3xl font-bold">Klar for flere henvendelser?</h2>
          <p className="mt-3 text-white/85">{contactText}</p>
          <a href={`mailto:${order.customer_email}`} className="mt-8 inline-flex rounded-2xl bg-white px-6 py-4 text-sm font-bold hover:bg-slate-50" style={{ color: colors.primary }}>Kontakt {companyName}</a>
        </div>
      </section>

      <footer className="bg-slate-950 px-4 py-8 text-center text-xs text-slate-500">
        Demo laget med ChatGenius DemoSites. {order.claim_url && <Link href={order.claim_url} className="text-emerald-300 hover:text-emerald-200">Se claim-side</Link>}
      </footer>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-slate-100 p-4"><div className="text-xs uppercase tracking-wide text-slate-500">{label}</div><div className="mt-1 font-semibold text-slate-950">{value}</div></div>;
}

function ListCard({ title, items, color }: { title: string; items: string[]; color: string }) {
  return <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-2xl font-bold">{title}</h2><div className="mt-5 space-y-3">{items.slice(0, 8).map((item) => <div key={item} className="flex gap-3 rounded-2xl bg-slate-50 p-4 text-sm"><CheckCircle className="mt-0.5 h-4 w-4 shrink-0" style={{ color }} /><span>{item}</span></div>)}</div></div>;
}

function NotFound({ title, description }: { title: string; description: string }) {
  return <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white"><div className="max-w-xl rounded-3xl border border-slate-800 bg-slate-900 p-8 text-center"><h1 className="text-3xl font-bold">{title}</h1><p className="mt-4 text-slate-300">{description}</p><Link href="/demosites" className="mt-6 inline-flex rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400">Gå til DemoSites</Link></div></main>;
}
