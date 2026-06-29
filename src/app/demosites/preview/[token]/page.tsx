import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import {
  ArrowRight,
  Bot,
  CheckCircle,
  ExternalLink,
  Image as ImageIcon,
  Mail,
  MessageCircle,
  Phone,
  ShieldCheck,
  Sparkles,
  Star,
} from "lucide-react";
import {
  DEMO_SITE_PACKAGES,
  DEMO_SITE_TEMPLATE_SEEDS,
  getDemoSiteTemplateDefaults,
  type DemoSiteFaqItem,
  type DemoSiteTemplateDefaults,
} from "@/lib/demosites";

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
  primaryText: string;
  secondaryText: string;
};

type PreviewContent = DemoSiteTemplateDefaults & {
  logo_url: string;
};

type ThemeStyle = CSSProperties & {
  "--brand": string;
  "--brand-soft": string;
  "--secondary": string;
  "--accent": string;
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringList(value: unknown, fallback: string[], maxItems = 8) {
  if (!Array.isArray(value)) return fallback;
  const items = value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, maxItems);
  return items.length ? items : fallback;
}

function faqList(value: unknown, fallback: DemoSiteFaqItem[]) {
  if (!Array.isArray(value)) return fallback;

  const items = value
    .map((item) => {
      if (isPlainObject(item)) {
        const question = text(item.question);
        const answer = text(item.answer);
        return question && answer ? { question, answer } : null;
      }

      const line = text(item);
      if (!line) return null;
      const [question, ...answerParts] = line.split("::");
      const answer = answerParts.join("::").trim();
      return question.trim() && answer ? { question: question.trim(), answer } : null;
    })
    .filter((item): item is DemoSiteFaqItem => Boolean(item))
    .slice(0, 6);

  return items.length ? items : fallback;
}

function imageList(value: unknown, fallback: string[]) {
  const source = Array.isArray(value) ? value : fallback;
  const images = source
    .map((item) => String(item || "").trim())
    .filter((item) => item.startsWith("data:image/") || item.startsWith("http://") || item.startsWith("https://"))
    .slice(0, 6);

  return images.length ? images : fallback;
}

function formatDate(value?: string | null) {
  if (!value) return "7 dager";
  return new Intl.DateTimeFormat("nb-NO", { dateStyle: "medium" }).format(new Date(value));
}

function isHexColor(value: unknown) {
  return /^#[0-9A-Fa-f]{6}$/.test(String(value || ""));
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function readableTextColor(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? "#111827" : "#ffffff";
}

function withAlpha(hex: string, alpha: string) {
  return `${hex}${alpha}`;
}

function getPackage(packageId: string) {
  return DEMO_SITE_PACKAGES.find((pkg) => pkg.id === packageId) || DEMO_SITE_PACKAGES[1];
}

function getTemplateSlug(order: DemoOrder) {
  const fields = order.editable_fields || {};
  const fieldSlug = text(fields.template_slug);
  const orderSlug = text(order.template_slug);
  const slug = (fieldSlug || orderSlug).toLowerCase();
  if (DEMO_SITE_TEMPLATE_SEEDS.some((item) => item.slug === slug)) return slug;
  return DEMO_SITE_TEMPLATE_SEEDS[0]?.slug || "elektro";
}

function getBrandColors(order: DemoOrder, defaults: DemoSiteTemplateDefaults): BrandColors {
  const fields = order.editable_fields || {};
  const brandColors = isPlainObject(fields.brand_colors) ? fields.brand_colors : {};
  const primary = isHexColor(fields.brand_color)
    ? String(fields.brand_color)
    : isHexColor(brandColors.primary)
      ? String(brandColors.primary)
      : isHexColor(order.brand_color)
        ? String(order.brand_color)
        : defaults.brand_color;
  const secondary = isHexColor(fields.secondary_color)
    ? String(fields.secondary_color)
    : isHexColor(brandColors.secondary)
      ? String(brandColors.secondary)
      : defaults.secondary_color;
  const accent = isHexColor(fields.accent_color)
    ? String(fields.accent_color)
    : isHexColor(brandColors.accent)
      ? String(brandColors.accent)
      : defaults.accent_color;

  return {
    primary,
    secondary,
    accent,
    primaryText: readableTextColor(primary),
    secondaryText: readableTextColor(secondary),
  };
}

function getPreviewContent(order: DemoOrder): { content: PreviewContent; colors: BrandColors } {
  const templateSlug = getTemplateSlug(order);
  const defaults = getDemoSiteTemplateDefaults(templateSlug, order.company_name);
  const fields = order.editable_fields || {};
  const colors = getBrandColors(order, defaults);
  const galleryImages = imageList(fields.gallery_images, defaults.gallery_images);

  return {
    colors,
    content: {
      ...defaults,
      hero_title: text(fields.hero_title, text(fields.hero_text, defaults.hero_title)),
      hero_subtitle: text(fields.hero_subtitle, defaults.hero_subtitle),
      intro_text: text(fields.intro_text, text(fields.about_text, order.notes || defaults.intro_text)),
      services: stringList(fields.services, defaults.services, 9),
      products: stringList(fields.products, defaults.products, 8),
      prices: stringList(fields.prices, defaults.prices, 8),
      trust_points: stringList(fields.trust_points, defaults.trust_points, 8),
      faq: faqList(fields.faq, defaults.faq),
      call_to_action: text(fields.call_to_action, defaults.call_to_action),
      contact_text: text(fields.contact_text, defaults.contact_text),
      brand_color: colors.primary,
      secondary_color: colors.secondary,
      accent_color: colors.accent,
      suggested_sections: stringList(fields.suggested_sections, defaults.suggested_sections, 10),
      gallery_images: galleryImages,
      logo_url: text(fields.logo_url, text(order.logo_url)),
    },
  };
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
  const { content, colors } = getPreviewContent(order);
  const contactHref = `mailto:${order.customer_email}`;
  const themeStyle: ThemeStyle = {
    "--brand": colors.primary,
    "--brand-soft": withAlpha(colors.primary, "18"),
    "--secondary": colors.secondary,
    "--accent": colors.accent,
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950" style={themeStyle}>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <a href="#top" className="flex min-w-0 items-center gap-3">
            {content.logo_url ? (
              <img src={content.logo_url} alt={`${companyName} logo`} className="h-11 w-11 shrink-0 rounded-lg border border-slate-200 object-contain p-1" />
            ) : (
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg font-bold" style={{ backgroundColor: colors.primary, color: colors.primaryText }}>
                {companyName.slice(0, 1)}
              </span>
            )}
            <span className="truncate text-base font-bold md:text-lg">{companyName}</span>
          </a>
          <nav className="hidden items-center gap-5 text-sm text-slate-600 lg:flex">
            <a href="#tjenester" className="hover:text-slate-950">Tjenester</a>
            <a href="#fordeler" className="hover:text-slate-950">Hvorfor oss</a>
            <a href="#tilbud" className="hover:text-slate-950">Tilbud</a>
            <a href="#faq" className="hover:text-slate-950">FAQ</a>
            <a href="#kontakt" className="hover:text-slate-950">Kontakt</a>
          </nav>
          <a href={contactHref} className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold" style={{ backgroundColor: colors.secondary, color: colors.secondaryText }}>
            {content.call_to_action}
          </a>
        </div>
      </header>

      <section id="top" className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 py-12 lg:grid-cols-[1.02fr_0.98fr] lg:py-16">
        <div className="flex flex-col justify-center">
          <div className="mb-5 inline-flex w-fit items-center rounded-lg border px-3 py-1 text-xs font-semibold" style={{ borderColor: colors.primary, backgroundColor: withAlpha(colors.primary, "14"), color: colors.secondary }}>
            <Sparkles className="mr-2 h-3.5 w-3.5" /> {content.template_name}
          </div>
          <h1 className="max-w-3xl text-4xl font-black leading-tight md:text-6xl">{content.hero_title}</h1>
          <p className="mt-5 max-w-2xl text-xl leading-8 text-slate-700">{content.hero_subtitle}</p>
          <p className="mt-5 max-w-2xl text-base leading-8 text-slate-600 md:text-lg">{content.intro_text}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a href={contactHref} className="inline-flex items-center justify-center rounded-lg px-6 py-4 text-sm font-bold" style={{ backgroundColor: colors.primary, color: colors.primaryText }}>
              {content.call_to_action} <ArrowRight className="ml-2 h-4 w-4" />
            </a>
            {order.website_url && (
              <a href={order.website_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-6 py-4 text-sm font-bold text-slate-700 hover:border-slate-400">
                Eksisterende nettside <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            )}
          </div>
        </div>

        <div className="grid min-h-[420px] grid-cols-[1fr_0.72fr] gap-3">
          <img src={content.gallery_images[0]} alt={`${companyName} hovedbilde`} className="h-full min-h-[420px] w-full rounded-lg object-cover" />
          <div className="grid gap-3">
            <img src={content.gallery_images[1] || content.gallery_images[0]} alt={`${companyName} detaljbilde`} className="h-full min-h-0 w-full rounded-lg object-cover" />
            <div className="flex flex-col justify-between rounded-lg p-5 text-white" style={{ backgroundColor: colors.secondary }}>
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: colors.accent }}>
                  <ShieldCheck className="h-4 w-4" /> Klar demo
                </div>
                <p className="mt-4 text-sm leading-6 text-white/80">Innhold, farger og seksjoner kan justeres før publisering.</p>
              </div>
              <div className="mt-5 text-xs text-white/60">Preview utløper {formatDate(order.expires_at)}</div>
            </div>
          </div>
        </div>
      </section>

      <section id="tjenester" className="bg-white py-16">
        <div className="mx-auto max-w-6xl px-4">
          <SectionIntro eyebrow="Tjenester" title={`Dette kan ${companyName} hjelpe med`} text="Kundene får rask oversikt over hva bedriften tilbyr, med tydelige veier videre til pris eller kontakt." />
          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
            {content.services.slice(0, 6).map((service) => (
              <FeatureCard key={service} title={service} color={colors.primary} />
            ))}
          </div>
        </div>
      </section>

      <section id="fordeler" className="py-16 text-white" style={{ backgroundColor: colors.secondary }}>
        <div className="mx-auto max-w-6xl px-4">
          <SectionIntro eyebrow="Hvorfor velge oss" title="Tryggere valg før kunden tar kontakt" text="Denne delen løfter frem bevis, arbeidsform og forventninger som gjør beslutningen enklere." inverted />
          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-4">
            {content.trust_points.slice(0, 4).map((point) => (
              <div key={point} className="rounded-lg border border-white/15 bg-white/10 p-5">
                <Star className="h-5 w-5" style={{ color: colors.accent }} />
                <p className="mt-4 text-sm leading-6 text-white/85">{point}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="tilbud" className="mx-auto max-w-6xl px-4 py-16">
        <SectionIntro eyebrow="Produkter og priser" title="Enkelt å forstå neste steg" text="Produkter, pakker og prisnivå kan vises som konkrete valg eller som tydelige prisforespørsler." />
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ListCard title="Produkter / pakker" items={content.products} color={colors.primary} />
          <ListCard title="Priser / prisforespørsel" items={content.prices} color={colors.primary} />
        </div>
      </section>

      <section id="bilder" className="bg-white py-16">
        <div className="mx-auto max-w-6xl px-4">
          <SectionIntro eyebrow="Bilder" title="Vis frem arbeid, miljø og tjenester" text="Bildene kan byttes med kundens egne foto, logo og profilbilder i oppsettet." />
          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
            {content.gallery_images.slice(0, 3).map((image, index) => (
              <img key={image + index} src={image} alt={`${companyName} bilde ${index + 1}`} className="h-72 w-full rounded-lg object-cover" />
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="mx-auto max-w-6xl px-4 py-16">
        <SectionIntro eyebrow="FAQ" title="Svar på vanlige spørsmål" text="Ofte stilte spørsmål reduserer friksjon og gjør flere henvendelser klare nok til å følge opp." />
        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          {content.faq.slice(0, 6).map((item) => (
            <div key={item.question} className="rounded-lg border border-slate-200 bg-white p-5">
              <h3 className="font-bold text-slate-950">{item.question}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-600">{item.answer}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="kontakt" className="bg-slate-950 py-16 text-white">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 lg:grid-cols-[0.95fr_1.05fr]">
          <div>
            <div className="inline-flex items-center rounded-lg px-3 py-1 text-xs font-semibold" style={{ backgroundColor: withAlpha(colors.primary, "28"), color: colors.accent }}>
              <MessageCircle className="mr-2 h-3.5 w-3.5" /> Kontakt
            </div>
            <h2 className="mt-5 text-3xl font-black leading-tight md:text-5xl">Klar for flere riktige henvendelser?</h2>
            <p className="mt-5 max-w-xl text-base leading-8 text-slate-300">{content.contact_text}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href={contactHref} className="inline-flex items-center justify-center rounded-lg px-5 py-3 text-sm font-bold" style={{ backgroundColor: colors.primary, color: colors.primaryText }}>
                <Mail className="mr-2 h-4 w-4" /> {content.call_to_action}
              </a>
              {order.customer_phone && (
                <a href={`tel:${order.customer_phone}`} className="inline-flex items-center justify-center rounded-lg border border-white/20 px-5 py-3 text-sm font-bold text-white hover:bg-white/10">
                  <Phone className="mr-2 h-4 w-4" /> Ring oss
                </a>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-white p-5 text-slate-950">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ backgroundColor: colors.primary, color: colors.primaryText }}>
                  <Bot className="h-5 w-5" />
                </span>
                <div>
                  <div className="font-bold">ChatGenius AI-assistent</div>
                  <div className="text-xs text-slate-500">Svarforslag basert på demoens innhold</div>
                </div>
              </div>
              <span className="rounded-lg bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">Online</span>
            </div>
            <div className="space-y-3 py-5">
              <ChatBubble align="left" color="#f1f5f9">Hei! Jeg kan hjelpe deg med tjenester, priser og kontakt hos {companyName}.</ChatBubble>
              <ChatBubble align="right" color={withAlpha(colors.primary, "20")}>Hva koster dette vanligvis?</ChatBubble>
              <ChatBubble align="left" color="#f8fafc">{content.prices[0]} Du kan også sende inn detaljer, så følger vi opp med et mer presist forslag.</ChatBubble>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
              <ImageIcon className="h-4 w-4" /> Skriv et spørsmål om {companyName}
            </div>
          </div>
        </div>
      </section>

      <footer className="bg-white px-4 py-8 text-center text-xs text-slate-500">
        Demo laget med ChatGenius DemoSites. Pakke: {pkg.shortName}.
      </footer>
    </main>
  );
}

function SectionIntro({ eyebrow, title, text, inverted = false }: { eyebrow: string; title: string; text: string; inverted?: boolean }) {
  return (
    <div className="max-w-3xl">
      <div className={inverted ? "text-sm font-bold text-white/70" : "text-sm font-bold text-slate-500"}>{eyebrow}</div>
      <h2 className={inverted ? "mt-3 text-3xl font-black leading-tight text-white md:text-4xl" : "mt-3 text-3xl font-black leading-tight text-slate-950 md:text-4xl"}>{title}</h2>
      <p className={inverted ? "mt-4 text-base leading-7 text-white/75" : "mt-4 text-base leading-7 text-slate-600"}>{text}</p>
    </div>
  );
}

function FeatureCard({ title, color }: { title: string; color: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-6">
      <CheckCircle className="h-6 w-6" style={{ color }} />
      <h3 className="mt-4 font-bold text-slate-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">Kort, tydelig tekst kan tilpasses med kundens egne ord før siden publiseres.</p>
    </div>
  );
}

function ListCard({ title, items, color }: { title: string; items: string[]; color: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6">
      <h3 className="text-2xl font-black">{title}</h3>
      <div className="mt-5 space-y-3">
        {items.slice(0, 8).map((item) => (
          <div key={item} className="flex gap-3 rounded-lg bg-slate-50 p-4 text-sm">
            <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" style={{ color }} />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChatBubble({ children, align, color }: { children: ReactNode; align: "left" | "right"; color: string }) {
  return (
    <div className={align === "right" ? "ml-auto max-w-[82%] rounded-lg p-3 text-sm leading-6" : "mr-auto max-w-[82%] rounded-lg p-3 text-sm leading-6"} style={{ backgroundColor: color }}>
      {children}
    </div>
  );
}

function NotFound({ title, description }: { title: string; description: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
      <div className="max-w-xl rounded-lg border border-slate-800 bg-slate-900 p-8 text-center">
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="mt-4 text-slate-300">{description}</p>
        <Link href="/demosites" className="mt-6 inline-flex rounded-lg bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400">
          Gå til DemoSites
        </Link>
      </div>
    </main>
  );
}
