import type { CSSProperties, ReactNode } from "react";
import {
  ArrowRight,
  Bot,
  CheckCircle,
  ExternalLink,
  Image as ImageIcon,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  ShieldCheck,
  Sparkles,
  Star,
} from "lucide-react";
import {
  DEMO_SITES_PREVIEW_PLACEHOLDERS,
  formatPreviewDate,
  getDemoSitesPreviewModel,
  withPreviewAlpha,
  type DemoSitesPreviewInput,
  type DemoSitesPreviewMode,
  type DemoSitesPreviewColors,
} from "@/lib/demosites-preview";

type ThemeStyle = CSSProperties & {
  "--brand": string;
  "--brand-soft": string;
  "--secondary": string;
  "--accent": string;
};

export type DemoSitePreviewRendererProps = DemoSitesPreviewInput & {
  mode: DemoSitesPreviewMode;
  compact?: boolean;
  showFull?: boolean;
  packageName?: string;
  className?: string;
};

type PreviewBusinessCopy = {
  navOffer: string;
  heroBadge: string;
  heroStatusTitle: string;
  heroStatusText: string;
  heroPrimaryService: string;
  galleryEyebrow: string;
  galleryTitle: string;
  galleryText: string;
  servicesEyebrow: string;
  servicesTitle: string;
  servicesText: string;
  serviceCardText: string;
  trustEyebrow: string;
  trustTitle: string;
  trustText: string;
  offerEyebrow: string;
  offerTitle: string;
  offerText: string;
  productsTitle: string;
  pricesTitle: string;
  faqText: string;
  contactTitle: string;
  contactText: string;
  chatQuestion: string;
  metricServiceLabel: string;
  metricOfferLabel: string;
  metricContactLabel: string;
};

export function DemoSitePreviewRenderer({
  mode,
  compact = false,
  showFull = false,
  packageName,
  className = "",
  ...input
}: DemoSitePreviewRendererProps) {
  const preview = getDemoSitesPreviewModel(input);
  const { content, colors, contact, companyName } = preview;
  const copy = getPreviewBusinessCopy(preview.templateSlug, companyName);
  const fullPreview = mode === "public" || showFull || !compact;
  const imageLimit = fullPreview ? 6 : 3;
  const serviceLimit = fullPreview ? 9 : 3;
  const images = content.gallery_images.slice(0, imageLimit);
  const services = content.services.slice(0, serviceLimit);
  const rootStyle: ThemeStyle = {
    "--brand": colors.primary,
    "--brand-soft": withPreviewAlpha(colors.primary, "18"),
    "--secondary": colors.secondary,
    "--accent": colors.accent,
  };
  const rootClass =
    mode === "public"
      ? `min-h-screen bg-[#f6f8fb] text-slate-950 ${className}`
      : `overflow-hidden rounded-lg border border-slate-700 bg-slate-50 text-slate-950 shadow-xl ${className}`;
  const maxWidthClass = mode === "public" ? "mx-auto max-w-6xl" : "max-w-none";
  const heroPaddingClass = mode === "public" ? "px-4 py-10 lg:py-14" : "p-4 lg:p-5";
  const heroTitleClass = mode === "public" ? "max-w-3xl text-4xl font-black leading-[0.98] tracking-normal md:text-6xl" : "text-3xl font-black leading-tight tracking-normal md:text-4xl";
  const Root = mode === "public" ? "main" : "div";

  return (
    <Root className={rootClass} style={rootStyle}>
      <header className={mode === "public" ? "sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur" : "border-b border-slate-200 bg-white"}>
        <div className={`${maxWidthClass} flex items-center justify-between gap-4 px-4 py-4`}>
          <a href="#top" className="flex min-w-0 items-center gap-3">
            {content.logo_url ? (
              <span className="flex h-10 max-w-[9rem] shrink-0 items-center rounded-lg border border-slate-200 bg-white px-2 py-1 shadow-sm">
                <img src={content.logo_url} alt={`${companyName} logo`} className="max-h-8 w-auto max-w-[7.5rem] object-contain" />
              </span>
            ) : (
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg font-bold" style={{ backgroundColor: colors.primary, color: colors.primaryText }}>
                {companyName.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="truncate text-base font-bold md:text-lg">{companyName}</span>
          </a>
          {mode === "public" && (
            <nav className="hidden items-center gap-5 text-sm text-slate-600 lg:flex">
              <a href="#tjenester" className="hover:text-slate-950">Tjenester</a>
              <a href="#fordeler" className="hover:text-slate-950">Hvorfor oss</a>
              <a href="#tilbud" className="hover:text-slate-950">{copy.navOffer}</a>
              <a href="#faq" className="hover:text-slate-950">FAQ</a>
              <a href="#kontakt" className="hover:text-slate-950">Kontakt</a>
            </nav>
          )}
          <a href={preview.contactHref} className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold" style={{ backgroundColor: colors.secondary, color: colors.secondaryText }}>
            {content.call_to_action}
          </a>
        </div>
      </header>

      <section id="top" className={`${maxWidthClass} grid grid-cols-1 gap-10 ${heroPaddingClass} lg:grid-cols-[1.02fr_0.98fr]`}>
        <div className="flex flex-col justify-center">
          <div className="mb-5 inline-flex w-fit items-center rounded-lg border px-3 py-1 text-xs font-semibold" style={{ borderColor: colors.primary, backgroundColor: withPreviewAlpha(colors.primary, "14"), color: colors.secondary }}>
            <Sparkles className="mr-2 h-3.5 w-3.5" /> {mode === "internal" ? "Intern preview" : copy.heroBadge}
          </div>
          <h1 className={heroTitleClass}>{content.hero_title}</h1>
          <p className="mt-5 max-w-2xl text-xl leading-8 text-slate-700">{content.hero_subtitle}</p>
          <p className="mt-5 max-w-2xl text-base leading-8 text-slate-600 md:text-lg">{content.intro_text}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a href={preview.contactHref} className="inline-flex items-center justify-center rounded-lg px-6 py-4 text-sm font-bold" style={{ backgroundColor: colors.primary, color: colors.primaryText }}>
              {content.call_to_action} <ArrowRight className="ml-2 h-4 w-4" />
            </a>
            {preview.websiteUrl && (
              <a href={preview.websiteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-6 py-4 text-sm font-bold text-slate-700 hover:border-slate-400">
                Eksisterende nettside <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            )}
          </div>
          <div className="mt-7 grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
            <HeroMetric label={copy.metricServiceLabel} value={String(content.services.length || "3+")} />
            <HeroMetric label={copy.metricOfferLabel} value={content.products[0] || content.prices[0] || copy.heroPrimaryService} />
            <HeroMetric label={copy.metricContactLabel} value={contact.phone || contact.email ? "Direkte" : "Klar"} />
          </div>
          {mode === "public" && preview.isImported && (
            <p className="mt-4 max-w-2xl text-xs font-medium text-slate-500">
              Demo basert på offentlig informasjon fra nettsiden.
            </p>
          )}
        </div>

        <HeroMediaPanel
          colors={colors}
          companyName={companyName}
          copy={copy}
          expiresAt={preview.expiresAt}
          images={images}
          mode={mode}
          primaryService={services[0] || content.products[0] || copy.heroPrimaryService}
        />
      </section>

      {images.length > 0 && (
        <section id="bilder" className="bg-white py-12">
          <div className={`${maxWidthClass} px-4`}>
            <SectionIntro eyebrow={copy.galleryEyebrow} title={copy.galleryTitle} text={preview.isImported ? copy.galleryText : "Bilder og faglige detaljer gir siden mer troverdighet før kunden tar kontakt."} />
            <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
              {images.slice(0, 3).map((image, index) => (
                <PreviewImage key={`${image}-${index}`} image={image} alt={`${companyName} bilde ${index + 1}`} className="h-72 w-full rounded-lg object-cover" color={colors.primary} />
              ))}
            </div>
          </div>
        </section>
      )}

      <section id="tjenester" className="bg-white py-16">
        <div className={`${maxWidthClass} px-4`}>
          <SectionIntro eyebrow={copy.servicesEyebrow} title={copy.servicesTitle} text={fullPreview ? copy.servicesText : "Kompakt preview viser de viktigste valgene først."} />
          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
            {(services.length ? services : [DEMO_SITES_PREVIEW_PLACEHOLDERS.service]).map((service, index) => (
              <FeatureCard key={`${service}-${index}`} title={service} color={colors.primary} description={copy.serviceCardText} placeholder={!services.length} />
            ))}
          </div>
        </div>
      </section>

      {fullPreview && (
        <>
          <section id="fordeler" className="py-16 text-white" style={{ backgroundColor: colors.secondary }}>
            <div className={`${maxWidthClass} px-4`}>
              <SectionIntro eyebrow={copy.trustEyebrow} title={copy.trustTitle} text={copy.trustText} inverted />
              <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-4">
                {(content.trust_points.length ? content.trust_points.slice(0, 4) : [DEMO_SITES_PREVIEW_PLACEHOLDERS.trustPoint]).map((point, index) => (
                  <div key={`${point}-${index}`} className={content.trust_points.length ? "rounded-lg border border-white/15 bg-white/10 p-5" : "rounded-lg border border-dashed border-white/25 bg-white/5 p-5 text-white/60"}>
                    <Star className="h-5 w-5" style={{ color: colors.accent }} />
                    <p className="mt-4 text-sm leading-6 text-white/85">{point}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section id="tilbud" className={`${maxWidthClass} px-4 py-16`}>
            <SectionIntro eyebrow={copy.offerEyebrow} title={copy.offerTitle} text={copy.offerText} />
            <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ListCard title={copy.productsTitle} items={content.products} emptyText={DEMO_SITES_PREVIEW_PLACEHOLDERS.product} color={colors.primary} />
              <ListCard title={copy.pricesTitle} items={content.prices} emptyText={DEMO_SITES_PREVIEW_PLACEHOLDERS.price} color={colors.primary} />
            </div>
          </section>

          <section id="faq" className={`${maxWidthClass} px-4 py-16`}>
            <SectionIntro eyebrow="FAQ" title="Svar på vanlige spørsmål" text={copy.faqText} />
            <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
              {(content.faq.length ? content.faq.slice(0, 6) : [{ question: DEMO_SITES_PREVIEW_PLACEHOLDERS.faqQuestion, answer: DEMO_SITES_PREVIEW_PLACEHOLDERS.faqAnswer }]).map((item, index) => (
                <div key={`${item.question}-${index}`} className={content.faq.length ? "rounded-lg border border-slate-200 bg-white p-5" : "rounded-lg border border-dashed border-slate-300 bg-slate-100 p-5"}>
                  <h3 className="font-bold text-slate-950">{item.question || "Mangler spørsmål"}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{item.answer || "Mangler svar"}</p>
                </div>
              ))}
            </div>
          </section>

          <section id="kontakt" className="bg-slate-950 py-16 text-white">
            <div className={`${maxWidthClass} grid grid-cols-1 gap-8 px-4 lg:grid-cols-[0.95fr_1.05fr]`}>
              <div>
                <div className="inline-flex items-center rounded-lg px-3 py-1 text-xs font-semibold" style={{ backgroundColor: withPreviewAlpha(colors.primary, "28"), color: colors.accent }}>
                  <MessageCircle className="mr-2 h-3.5 w-3.5" /> Kontakt
                </div>
                <h2 className="mt-5 text-3xl font-black leading-tight md:text-5xl">{copy.contactTitle}</h2>
                <p className="mt-5 max-w-xl text-base leading-8 text-slate-300">{content.contact_text || copy.contactText}</p>
                <div className="mt-6 grid gap-2 text-sm text-slate-300">
                  <ContactLine icon={<Phone className="h-4 w-4" />} label="Telefon" value={contact.phone} href={contact.phone ? `tel:${contact.phone}` : undefined} />
                  <ContactLine icon={<Mail className="h-4 w-4" />} label="E-post" value={contact.email} href={contact.email ? `mailto:${contact.email}` : undefined} />
                  <ContactLine icon={<MapPin className="h-4 w-4" />} label="Adresse" value={contact.address} />
                  {contact.website && <ContactLine icon={<ExternalLink className="h-4 w-4" />} label="Nettside" value={contact.website} href={contact.website} />}
                </div>
                {mode === "public" && preview.isImported && preview.sourcePages.length > 0 && (
                  <p className="mt-4 text-xs text-slate-500">Kilder brukt i analysen: {preview.sourcePages.length} offentlig side{preview.sourcePages.length === 1 ? "" : "r"}.</p>
                )}
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <a href={preview.contactHref} className="inline-flex items-center justify-center rounded-lg px-5 py-3 text-sm font-bold" style={{ backgroundColor: colors.primary, color: colors.primaryText }}>
                    <Mail className="mr-2 h-4 w-4" /> {content.call_to_action}
                  </a>
                  {contact.phone && (
                    <a href={`tel:${contact.phone}`} className="inline-flex items-center justify-center rounded-lg border border-white/20 px-5 py-3 text-sm font-bold text-white hover:bg-white/10">
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
                  <span className="rounded-lg bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">{mode === "internal" ? "Preview" : "Online"}</span>
                </div>
                <div className="space-y-3 py-5">
                  <ChatBubble align="left" color="#f1f5f9">Hei! Jeg kan hjelpe deg med tjenester, priser og kontakt hos {companyName}.</ChatBubble>
                  <ChatBubble align="right" color={withPreviewAlpha(colors.primary, "20")}>{mode === "internal" ? "Hva er neste steg?" : copy.chatQuestion}</ChatBubble>
                  <ChatBubble align="left" color="#f8fafc">{preview.chatPrice} Du kan også sende inn detaljer, så følger vi opp med et mer presist forslag.</ChatBubble>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
                  <ImageIcon className="h-4 w-4" /> Skriv et spørsmål om {companyName}
                </div>
              </div>
            </div>
          </section>

          {mode === "internal" && colors.missing.length > 0 && (
            <div className="border-t border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              Mangler fargefelt: {colors.missing.join(", ")}. Midlertidige preview-farger vises her.
            </div>
          )}
        </>
      )}

      {mode === "public" && (
        <footer className="bg-white px-4 py-8 text-center text-xs text-slate-500">
          Demo laget med ChatGenius DemoSites. Pakke: {packageName || "Standard"}.
        </footer>
      )}
    </Root>
  );
}

function PreviewImage({ image, alt, className, color }: { image?: string; alt: string; className: string; color: string }) {
  if (image) return <img src={image} alt={alt} className={className} />;

  return (
    <div className={`${className} flex items-center justify-center border border-dashed border-slate-300 bg-slate-100 text-sm font-semibold text-slate-500`}>
      <ImageIcon className="mr-2 h-4 w-4" style={{ color }} />
      Mangler bilde
    </div>
  );
}

function HeroMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white/75 p-3 shadow-sm">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-1 line-clamp-2 text-sm font-black leading-5 text-slate-950">{value}</div>
    </div>
  );
}

function HeroMediaPanel({
  colors,
  companyName,
  copy,
  expiresAt,
  images,
  mode,
  primaryService,
}: {
  colors: DemoSitesPreviewColors;
  companyName: string;
  copy: PreviewBusinessCopy;
  expiresAt: string;
  images: string[];
  mode: DemoSitesPreviewMode;
  primaryService: string;
}) {
  const mainImage = images[0];
  const heroImageClass = mode === "public" ? "h-full min-h-[420px] w-full rounded-lg object-cover" : "h-full min-h-[300px] w-full rounded-lg object-cover";

  if (mainImage) {
    return (
      <div className="relative overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
        <PreviewImage image={mainImage} alt={`${companyName} hovedbilde`} className={heroImageClass} color={colors.secondary} />
        <div className="absolute inset-x-4 bottom-4 rounded-lg border border-white/70 bg-white/95 p-4 shadow-xl backdrop-blur">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: colors.secondary, color: colors.secondaryText }}>
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <div className="text-sm font-black text-slate-950">{copy.heroStatusTitle}</div>
              <p className="mt-1 text-sm leading-6 text-slate-600">{copy.heroStatusText}</p>
              <div className="mt-3 text-xs font-semibold text-slate-500">
                {mode === "internal" ? `${images.length} bilde${images.length === 1 ? "" : "r"} i preview` : `Preview utløper ${formatPreviewDate(expiresAt)}`}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[360px] flex-col justify-between rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <div className="inline-flex items-center rounded-lg px-3 py-1 text-xs font-semibold" style={{ backgroundColor: withPreviewAlpha(colors.primary, "16"), color: colors.secondary }}>
          <ShieldCheck className="mr-2 h-3.5 w-3.5" />
          {copy.heroStatusTitle}
        </div>
        <h3 className="mt-5 max-w-lg text-3xl font-black leading-tight text-slate-950">{primaryService}</h3>
        <p className="mt-4 max-w-lg text-base leading-7 text-slate-600">{copy.heroStatusText}</p>
      </div>
      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
        {[copy.heroPrimaryService, copy.navOffer, "Kontakt"].map((item) => (
          <div key={item} className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-800">
            <CheckCircle className="mb-3 h-5 w-5" style={{ color: colors.primary }} />
            {item}
          </div>
        ))}
      </div>
    </div>
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

function ContactLine({ icon, label, value, href }: { icon: ReactNode; label: string; value: string; href?: string }) {
  const hasValue = Boolean(value);
  const content = (
    <>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white">{icon}</span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
        <span className="block break-words text-slate-200">{value || `Mangler ${label.toLowerCase()}`}</span>
      </span>
    </>
  );

  if (href && hasValue) {
    return (
      <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel={href.startsWith("http") ? "noopener noreferrer" : undefined} className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/5 p-3 hover:bg-white/10">
        {content}
      </a>
    );
  }

  return <div className={hasValue ? "flex items-start gap-3 rounded-lg border border-white/10 bg-white/5 p-3" : "flex items-start gap-3 rounded-lg border border-dashed border-white/15 bg-white/5 p-3 text-slate-500"}>{content}</div>;
}

function FeatureCard({ title, color, description, placeholder = false }: { title: string; color: string; description: string; placeholder?: boolean }) {
  return (
    <div className={placeholder ? "rounded-lg border border-dashed border-slate-300 bg-slate-100 p-6 text-slate-500" : "rounded-lg border border-slate-200 bg-slate-50 p-6"}>
      <CheckCircle className="h-6 w-6" style={{ color }} />
      <h3 className="mt-4 font-bold text-slate-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{placeholder ? "Legg inn konkrete tjenester for å gjøre demoen mer salgsklar." : description}</p>
    </div>
  );
}

function ListCard({ title, items, emptyText, color }: { title: string; items: string[]; emptyText: string; color: string }) {
  const visibleItems = items.length ? items : [emptyText];
  return (
    <div className={items.length ? "rounded-lg border border-slate-200 bg-white p-6" : "rounded-lg border border-dashed border-slate-300 bg-white p-6"}>
      <h3 className="text-2xl font-black">{title}</h3>
      <div className="mt-5 space-y-3">
        {visibleItems.slice(0, 8).map((item, index) => (
          <div key={`${item}-${index}`} className={items.length ? "flex gap-3 rounded-lg bg-slate-50 p-4 text-sm" : "flex gap-3 rounded-lg bg-slate-100 p-4 text-sm text-slate-500"}>
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

function getPreviewBusinessCopy(templateSlug: string, companyName: string): PreviewBusinessCopy {
  const slug = templateSlug.toLowerCase();

  if (slug.includes("dekk") || slug.includes("bilverksted")) {
    return {
      navOffer: "Dekk og verksted",
      heroBadge: "Dekk, felg og verksted",
      heroStatusTitle: "Klar for timebestilling",
      heroStatusText: "Kunden ser tjenester, produktvalg og neste steg uten å lete.",
      heroPrimaryService: "Dekkskift, hjulhotell og verkstedtjenester",
      galleryEyebrow: "Verksted og produkter",
      galleryTitle: "Dekk, felg og bilpleie i samme uttrykk",
      galleryText: "Bilder og produktfoto gir siden et kjent preg og gjør det enklere å velge riktig dekk, felg eller service.",
      servicesEyebrow: "Tjenester",
      servicesTitle: "Dekk, felg og verkstedtjenester",
      servicesText: "Gjør det enkelt å velge dekkskift, hjulhotell, olje, felg eller verkstedtime.",
      serviceCardText: "Vises som et klart valg for timebestilling, prisforespørsel og rådgivning.",
      trustEyebrow: "Trygghet",
      trustTitle: "Trygt bilhold starter med tydelige valg",
      trustText: "Denne delen bygger tillit rundt erfaring, produkter, levering og oppfølging.",
      offerEyebrow: "Tilbud",
      offerTitle: "Tydelige valg for bilkunden",
      offerText: "Produkter, tjenester og prislinjer presenteres som konkrete veier til tilbud eller time.",
      productsTitle: "Tjenester og produktgrupper",
      pricesTitle: "Pris og timebestilling",
      faqText: "Svarene gjør det enklere å spørre om riktig dekkdimensjon, tidspunkt og pris.",
      contactTitle: `Klar for flere timebestillinger hos ${companyName}?`,
      contactText: "Gjør det enkelt å bestille time, be om tilbud eller spørre om dekk og verkstedtjenester.",
      chatQuestion: "Kan jeg få tilbud på dekk?",
      metricServiceLabel: "Tjenester",
      metricOfferLabel: "Første valg",
      metricContactLabel: "Bestilling",
    };
  }

  if (slug.includes("restaurant") || slug.includes("kafe")) {
    return {
      navOffer: "Meny",
      heroBadge: "Restaurant og gjesteopplevelse",
      heroStatusTitle: "Klar for bordbestilling",
      heroStatusText: "Gjestene får meny, åpningstider og kontakt samlet på ett sted.",
      heroPrimaryService: "Meny, booking og selskap",
      galleryEyebrow: "Stemning",
      galleryTitle: "Mat, lokale og atmosfære",
      galleryText: "Bilder fra nettsiden løfter mat, lokale og opplevelsen gjestene kan forvente.",
      servicesEyebrow: "For gjester",
      servicesTitle: "Meny, booking og servering",
      servicesText: "Gjør det enkelt å se hva stedet tilbyr og hvordan gjesten tar neste steg.",
      serviceCardText: "Gjør valget enklere for gjester som vil booke bord, se meny eller ta kontakt.",
      trustEyebrow: "Opplevelse",
      trustTitle: "Flere gjester velger når opplevelsen er tydelig",
      trustText: "Denne delen løfter kvalitet, service, atmosfære og praktisk informasjon.",
      offerEyebrow: "Meny og pakker",
      offerTitle: "Fra menyvalg til reservasjon",
      offerText: "Meny, arrangementer og prisnivå vises på en måte som gjør booking enklere.",
      productsTitle: "Meny og konsepter",
      pricesTitle: "Priser og reservasjon",
      faqText: "Svar på spørsmål om åpningstider, allergener, grupper og booking.",
      contactTitle: `Gjør det enkelt å besøke ${companyName}`,
      contactText: "La gjestene booke bord, spørre om menyen eller kontakte stedet direkte.",
      chatQuestion: "Kan jeg booke bord?",
      metricServiceLabel: "Menyvalg",
      metricOfferLabel: "Booking",
      metricContactLabel: "Kontakt",
    };
  }

  if (slug.includes("renhold")) {
    return {
      navOffer: "Avtaler",
      heroBadge: "Renhold og befaring",
      heroStatusTitle: "Klar for befaring",
      heroStatusText: "Kunden ser tjenester, avtaler og kontaktvei før de ber om pristilbud.",
      heroPrimaryService: "Renhold, befaring og faste avtaler",
      galleryEyebrow: "Arbeid og resultat",
      galleryTitle: "Rent uttrykk for profesjonelt renhold",
      galleryText: "Bilder fra nettsiden kan støtte tillit, kvalitet og forventet resultat.",
      servicesEyebrow: "Renhold",
      servicesTitle: "Renholdstjenester og avtaler",
      servicesText: "Gjør det enkelt å velge riktig type renhold og be om befaring.",
      serviceCardText: "Knytter tjenesten til befaring, prisforespørsel og faste avtaler.",
      trustEyebrow: "Kvalitet",
      trustTitle: "Tilliten bygges før første befaring",
      trustText: "Denne delen løfter punktlighet, kvalitet, HMS og oppfølging.",
      offerEyebrow: "Pakker",
      offerTitle: "Tydelige avtaler og prisforespørsel",
      offerText: "Vis renholdspakker, faste avtaler og neste steg for pristilbud.",
      productsTitle: "Renholdspakker",
      pricesTitle: "Prisforespørsel",
      faqText: "Svar på spørsmål om frekvens, befaring, lokaler og oppstart.",
      contactTitle: `Klar for flere befaringer hos ${companyName}?`,
      contactText: "Gjør det enkelt å be om befaring, beskrive behov og få et presist tilbud.",
      chatQuestion: "Kan jeg få gratis befaring?",
      metricServiceLabel: "Tjenester",
      metricOfferLabel: "Avtale",
      metricContactLabel: "Befaring",
    };
  }

  if (slug.includes("hotell")) {
    return {
      navOffer: "Rom og opphold",
      heroBadge: "Hotell og overnatting",
      heroStatusTitle: "Klar for booking",
      heroStatusText: "Gjesten får rom, fasiliteter og kontakt samlet i en rolig kjøpsflyt.",
      heroPrimaryService: "Rom, opphold og fasiliteter",
      galleryEyebrow: "Opphold",
      galleryTitle: "Rom, fasiliteter og nærområde",
      galleryText: "Bilder fra nettsiden gjør det enklere å se opplevelsen før booking.",
      servicesEyebrow: "Opphold",
      servicesTitle: "Rom, fasiliteter og gjesteopplevelse",
      servicesText: "Gjør det enkelt å se hva oppholdet inkluderer og hvordan gjesten booker.",
      serviceCardText: "Vises som et tydelig valg for booking, spørsmål eller gruppeforespørsel.",
      trustEyebrow: "Trygg booking",
      trustTitle: "Riktig informasjon gir tryggere booking",
      trustText: "Denne delen løfter komfort, beliggenhet, service og praktiske fordeler.",
      offerEyebrow: "Tilgjengelighet",
      offerTitle: "Fra interesse til bestilling",
      offerText: "Romtyper, pakker og prislinjer presenteres med tydelig vei videre.",
      productsTitle: "Rom og pakker",
      pricesTitle: "Pris og tilgjengelighet",
      faqText: "Svar på spørsmål om innsjekk, parkering, frokost og booking.",
      contactTitle: `Gjør det enkelt å booke hos ${companyName}`,
      contactText: "Samle booking, spørsmål og praktisk informasjon i én tydelig kontaktflate.",
      chatQuestion: "Har dere ledige rom?",
      metricServiceLabel: "Opphold",
      metricOfferLabel: "Booking",
      metricContactLabel: "Kontakt",
    };
  }

  if (slug.includes("eiendomsmegler")) {
    return {
      navOffer: "Verdivurdering",
      heroBadge: "Eiendom og verdivurdering",
      heroStatusTitle: "Klar for verdivurdering",
      heroStatusText: "Selgere får rask vei til rådgivning, verdivurdering og neste steg.",
      heroPrimaryService: "Verdivurdering, salg og rådgivning",
      galleryEyebrow: "Eiendom",
      galleryTitle: "Boliger, områder og meglerprofil",
      galleryText: "Bilder fra nettsiden kan bygge tillit rundt marked, lokalkunnskap og salgsprosess.",
      servicesEyebrow: "Megling",
      servicesTitle: "Verdivurdering og boligsalg",
      servicesText: "Gjør det enkelt å forstå prosessen og bestille en uforpliktende vurdering.",
      serviceCardText: "Knytter tjenesten til verdivurdering, rådgivning og trygg oppfølging.",
      trustEyebrow: "Tillit",
      trustTitle: "Flere selgere tar kontakt når prosessen er tydelig",
      trustText: "Denne delen løfter lokalkunnskap, erfaring og trygg gjennomføring.",
      offerEyebrow: "Tjenester",
      offerTitle: "Fra vurdering til salg",
      offerText: "Presenter meglerpakker, rådgivning og neste steg uten unødvendig friksjon.",
      productsTitle: "Meglingstjenester",
      pricesTitle: "Neste steg",
      faqText: "Svar på spørsmål om verdivurdering, kostnader, prosess og dokumenter.",
      contactTitle: `Bestill verdivurdering hos ${companyName}`,
      contactText: "Gjør det enkelt å sende inn boliginfo og få rask oppfølging.",
      chatQuestion: "Kan jeg bestille verdivurdering?",
      metricServiceLabel: "Tjenester",
      metricOfferLabel: "Vurdering",
      metricContactLabel: "Kontakt",
    };
  }

  if (slug.includes("elektro") || slug.includes("rorlegger") || slug.includes("snekker") || slug.includes("bygg")) {
    return {
      navOffer: "Befaring",
      heroBadge: "Fagarbeid og befaring",
      heroStatusTitle: "Klar for tilbudsforespørsel",
      heroStatusText: "Kunden ser tjenester, prosess og kontaktvei før de ber om tilbud.",
      heroPrimaryService: "Befaring, tilbud og fagarbeid",
      galleryEyebrow: "Prosjekter",
      galleryTitle: "Arbeid, prosess og ferdige resultater",
      galleryText: "Bilder fra nettsiden kan vise kvalitet, type prosjekter og hva kunden kan forvente.",
      servicesEyebrow: "Fagområder",
      servicesTitle: "Tjenester, befaring og prosjekter",
      servicesText: "Gjør det enkelt å forstå hva bedriften leverer og be om et presist tilbud.",
      serviceCardText: "Knytter tjenesten til befaring, tilbud og tydelig oppfølging.",
      trustEyebrow: "Kvalitet",
      trustTitle: "Trygghet før kunden bestiller befaring",
      trustText: "Denne delen løfter erfaring, sertifiseringer, kvalitet og gjennomføring.",
      offerEyebrow: "Prosess",
      offerTitle: "Fra behov til konkret tilbud",
      offerText: "Tjenester, pakker og prislinjer vises med tydelig vei videre til befaring.",
      productsTitle: "Tjenester og prosjekter",
      pricesTitle: "Pris og befaring",
      faqText: "Svar på spørsmål om oppstart, befaring, pris, tid og dokumentasjon.",
      contactTitle: `Klar for flere befaringer hos ${companyName}?`,
      contactText: "Gjør det enkelt å beskrive behov, sende inn kontaktinfo og få et godt tilbud.",
      chatQuestion: "Kan jeg få tilbud på jobben?",
      metricServiceLabel: "Tjenester",
      metricOfferLabel: "Befaring",
      metricContactLabel: "Kontakt",
    };
  }

  if (slug.includes("advokat")) {
    return {
      navOffer: "Rådgivning",
      heroBadge: "Juridisk rådgivning",
      heroStatusTitle: "Klar for henvendelser",
      heroStatusText: "Klienten får fagområder, prosess og kontaktvei presentert ryddig.",
      heroPrimaryService: "Rådgivning, saksvurdering og oppfølging",
      galleryEyebrow: "Fagprofil",
      galleryTitle: "Fagområder og trygg rådgivning",
      galleryText: "Bilder og innhold fra nettsiden brukes diskret for å bygge tillit.",
      servicesEyebrow: "Fagområder",
      servicesTitle: "Juridiske tjenester og rådgivning",
      servicesText: "Gjør det enkelt å forstå fagområder og sende inn en relevant henvendelse.",
      serviceCardText: "Vises som et tydelig fagområde med lav terskel for kontakt.",
      trustEyebrow: "Tillit",
      trustTitle: "Profesjonell trygghet før første samtale",
      trustText: "Denne delen løfter erfaring, diskresjon, prosess og oppfølging.",
      offerEyebrow: "Saksvurdering",
      offerTitle: "Fra spørsmål til riktig rådgivning",
      offerText: "Fagområder, vurderinger og neste steg presenteres uten unødvendig friksjon.",
      productsTitle: "Fagområder",
      pricesTitle: "Time, vurdering og kontakt",
      faqText: "Svar på spørsmål om saksvurdering, dokumenter, kostnader og oppstart.",
      contactTitle: `Gjør det enkelt å kontakte ${companyName}`,
      contactText: "Samle fagområder, kontaktinfo og neste steg for en trygg første henvendelse.",
      chatQuestion: "Kan jeg få en vurdering?",
      metricServiceLabel: "Fagområder",
      metricOfferLabel: "Vurdering",
      metricContactLabel: "Kontakt",
    };
  }

  if (slug.includes("tannlege") || slug.includes("fysioterapi") || slug.includes("klinikk") || slug.includes("frisor") || slug.includes("skjonnhet")) {
    return {
      navOffer: "Behandling",
      heroBadge: "Klinikk og pasientflyt",
      heroStatusTitle: "Klar for timebestilling",
      heroStatusText: "Pasientene får behandlinger, trygghet og kontakt samlet i en ryddig flyt.",
      heroPrimaryService: "Behandling, rådgivning og timebestilling",
      galleryEyebrow: "Klinikk",
      galleryTitle: "Lokaler, behandling og faglig trygghet",
      galleryText: "Bilder fra nettsiden kan støtte trygghet før pasienten bestiller time.",
      servicesEyebrow: "Behandlinger",
      servicesTitle: "Behandlinger og oppfølging",
      servicesText: "Gjør det enkelt å velge riktig behandling og kontakte klinikken.",
      serviceCardText: "Vises som et tydelig valg for timebestilling eller spørsmål om behandling.",
      trustEyebrow: "Trygghet",
      trustTitle: "Pasienter velger lettere når informasjonen er tydelig",
      trustText: "Denne delen løfter fagkompetanse, trygg oppfølging og praktisk informasjon.",
      offerEyebrow: "Timer",
      offerTitle: "Fra behov til time",
      offerText: "Behandlinger og priser presenteres med tydelig vei videre til booking.",
      productsTitle: "Behandlinger",
      pricesTitle: "Priser og time",
      faqText: "Svar på spørsmål om behandling, pris, varighet og oppmøte.",
      contactTitle: `Gjør det enkelt å bestille time hos ${companyName}`,
      contactText: "Samle timebestilling, spørsmål og kontaktinfo på ett sted.",
      chatQuestion: "Kan jeg bestille time?",
      metricServiceLabel: "Behandlinger",
      metricOfferLabel: "Time",
      metricContactLabel: "Kontakt",
    };
  }

  return {
    navOffer: "Tilbud",
    heroBadge: "Lokal bedrift",
    heroStatusTitle: "Klar for nye henvendelser",
    heroStatusText: "Kunden får oversikt over tjenester, priser og kontakt uten å måtte lete.",
    heroPrimaryService: "Tjenester, priser og kontakt",
    galleryEyebrow: "Fra bedriften",
    galleryTitle: "Et uttrykk som føles kjent for kunden",
    galleryText: "Bilder fra nettsiden brukes som støtte for tillit, tjenester og neste steg.",
    servicesEyebrow: "Tjenester",
    servicesTitle: `Tjenester fra ${companyName}`,
    servicesText: "Gjør det enkelt å forstå hva bedriften tilbyr og sende riktig forespørsel.",
    serviceCardText: "Gjør det enklere for kunden å velge riktig tjeneste og ta kontakt.",
    trustEyebrow: "Hvorfor velge oss",
    trustTitle: "Tillit før første kontakt",
    trustText: "Denne delen løfter erfaring, kvalitet, tilgjengelighet og oppfølging.",
    offerEyebrow: "Tilbud",
    offerTitle: "Tydelige valg og neste steg",
    offerText: "Produkter, pakker og prislinjer presenteres så kunden raskt kan gå videre.",
    productsTitle: "Produkter og pakker",
    pricesTitle: "Pris og forespørsel",
    faqText: "Svar på spørsmål som ofte avgjør om kunden tar kontakt nå.",
    contactTitle: `Klar for flere riktige henvendelser hos ${companyName}?`,
    contactText: "Gjør det enkelt å spørre, beskrive behov og be om et tilbud.",
    chatQuestion: "Hva er neste steg?",
    metricServiceLabel: "Tjenester",
    metricOfferLabel: "Tilbud",
    metricContactLabel: "Kontakt",
  };
}
