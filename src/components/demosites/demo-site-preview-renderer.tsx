import type { CSSProperties, ReactNode } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  CalendarCheck,
  Car,
  CheckCircle,
  ClipboardCheck,
  Clock,
  Cpu,
  ExternalLink,
  Hammer,
  Home,
  Hotel,
  Image as ImageIcon,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Scale,
  ShieldCheck,
  Sparkles,
  Star,
  Stethoscope,
  Truck,
  Utensils,
  Wrench,
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
import {
  getDemoSitePreviewIndustryVisual,
  isDemoSiteTechnologyTemplate,
  type DemoSitesPreviewIndustryVariant,
  type DemoSitesPreviewIndustryVisual,
} from "@/lib/demosites-preview-visuals";
import { resolveDemoSiteDesign, type DemoSiteDesign } from "@/lib/demosites-design";
import { getDemoFontPair } from "@/components/demosites/demo-fonts";
import { DemoReveal } from "@/components/demosites/demo-reveal";
import { DemoLeadForm } from "@/components/demosites/demo-lead-form";

type ThemeStyle = CSSProperties & {
  "--brand": string;
  "--brand-soft": string;
  "--secondary": string;
  "--accent": string;
  "--demo-font-heading": string;
  "--demo-font-body": string;
};

export type DemoSitePreviewRendererProps = DemoSitesPreviewInput & {
  mode: DemoSitesPreviewMode;
  compact?: boolean;
  showFull?: boolean;
  packageName?: string;
  className?: string;
  /** Layout/style override — falls back to saved fields + industry defaults. */
  design?: DemoSiteDesign;
  /** Claim token: enables the working contact form on public previews. */
  inquiryToken?: string;
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
  proofLabel?: string;
  proofItems?: string[];
  processTitle?: string;
  processSteps?: string[];
};

type ResolvedPreviewBusinessCopy = Omit<PreviewBusinessCopy, "proofLabel" | "proofItems" | "processTitle" | "processSteps"> & {
  proofLabel: string;
  proofItems: string[];
  processTitle: string;
  processSteps: string[];
};

export function DemoSitePreviewRenderer({
  mode,
  compact = false,
  showFull = false,
  packageName,
  className = "",
  design: designProp,
  inquiryToken,
  ...input
}: DemoSitePreviewRendererProps) {
  const preview = getDemoSitesPreviewModel(input);
  const { content, colors, contact, companyName } = preview;
  const copy = resolvePreviewBusinessCopy(getPreviewBusinessCopy(preview.templateSlug, companyName));
  const visual = getDemoSitePreviewIndustryVisual(preview.templateSlug);
  const fullPreview = mode === "public" || showFull || !compact;
  const imageLimit = fullPreview ? 6 : 3;
  const serviceLimit = fullPreview ? 9 : 3;
  const images = content.gallery_images.slice(0, imageLimit);
  const services = content.services.slice(0, serviceLimit);
  const useNeonGlass = visual.variant === "neon";
  const useDarkHero = useNeonGlass || prefersDarkBusinessHero(preview.templateSlug);
  const visualSection = getPreviewVisualSectionClasses(visual.variant, useNeonGlass);
  const heroBackground = useDarkHero ? getHeroBackground(colors) : "#ffffff";
  const design =
    designProp ||
    resolveDemoSiteDesign({
      templateSlug: preview.templateSlug,
      editableFields: input.editableFields,
    });
  const fonts = getDemoFontPair(design.style);
  const heroImage = images[0] || "";
  // AI copy occasionally writes the same sentence for subtitle and intro —
  // never show the same paragraph twice.
  const heroIntroText = content.intro_text.trim() === content.hero_subtitle.trim() ? "" : content.intro_text;
  const layout: DemoSiteDesign["layout"] = heroImage ? design.layout : "split";
  const revealAttr = mode === "public" ? { "data-demo-reveal": "" } : {};
  // Public CTAs lead to the contact section (form + phone + e-mail) instead
  // of launching the phone app directly — callers still get a "Ring oss"
  // button and the phone number in the top strip.
  const ctaHref = mode === "public" ? "#kontakt" : preview.contactHref;
  const showLeadForm = mode === "public" && Boolean(inquiryToken);
  const rootStyle: ThemeStyle = {
    "--brand": colors.primary,
    "--brand-soft": withPreviewAlpha(colors.primary, "18"),
    "--secondary": colors.secondary,
    "--accent": colors.accent,
    "--demo-font-heading": fonts.heading,
    "--demo-font-body": fonts.body,
    fontFamily: fonts.body,
  };
  const rootClass =
    mode === "public"
      ? useNeonGlass
        ? `min-h-screen bg-[#020617] text-white ${className}`
        : `min-h-screen bg-[#f8fafc] text-slate-950 ${className}`
      : useNeonGlass
        ? `overflow-hidden rounded-lg border border-cyan-300/20 bg-[#020617] text-white shadow-2xl shadow-cyan-950/40 ${className}`
        : `overflow-hidden rounded-lg border border-slate-700 bg-slate-50 text-slate-950 shadow-xl ${className}`;
  const maxWidthClass = mode === "public" ? "mx-auto max-w-7xl" : "max-w-none";
  const heroPaddingClass = mode === "public" ? "px-4 py-12 lg:py-20" : "p-4 lg:p-6";
  const heroTitleClass = mode === "public" ? "max-w-3xl text-4xl font-black leading-[0.96] tracking-normal md:text-6xl xl:text-7xl" : "text-3xl font-black leading-tight tracking-normal md:text-4xl";
  const heroTextClass = useDarkHero ? "text-white" : "text-slate-950";
  const heroMutedClass = useDarkHero ? "text-slate-300" : "text-slate-700";
  const heroSoftClass = useDarkHero ? "text-slate-400" : "text-slate-600";
  const headerClass =
    mode === "public"
      ? useNeonGlass
        ? "sticky top-0 z-30 border-b border-white/10 bg-slate-950/80 text-white shadow-lg shadow-cyan-950/20 backdrop-blur-xl"
        : "sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur"
      : useNeonGlass
        ? "border-b border-white/10 bg-slate-950/85 text-white"
        : "border-b border-slate-200 bg-white";
  const headerCtaStyle: CSSProperties = useNeonGlass
    ? { background: `linear-gradient(135deg, ${colors.primary}, ${colors.accent})`, color: "#020617" }
    : { backgroundColor: colors.secondary, color: colors.secondaryText };
  const Root = mode === "public" ? "main" : "div";

  return (
    <Root className={`demo-design-root ${fonts.classNames} ${rootClass}`} style={rootStyle}>
      <style>{`
        .demo-design-root { font-family: var(--demo-font-body); }
        .demo-design-root h1, .demo-design-root h2, .demo-design-root h3 { font-family: var(--demo-font-heading); }
      `}</style>
      {mode === "public" && <DemoReveal />}
      {mode === "public" && <BusinessTopStrip contact={contact} copy={copy} colors={colors} neonGlass={useNeonGlass} />}

      <header className={headerClass}>
        <div className={`${maxWidthClass} flex items-center justify-between gap-4 px-4 py-4`}>
          <a href="#top" className="flex min-w-0 items-center gap-3">
            {content.logo_url ? (
              <span className={useNeonGlass ? "flex h-10 max-w-[9rem] shrink-0 items-center rounded-lg border border-white/15 bg-white px-2 py-1 shadow-lg shadow-cyan-950/30" : "flex h-10 max-w-[9rem] shrink-0 items-center rounded-lg border border-slate-200 bg-white px-2 py-1 shadow-sm"}>
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
            <nav className={useNeonGlass ? "hidden items-center gap-5 text-sm text-slate-300 lg:flex" : "hidden items-center gap-5 text-sm text-slate-600 lg:flex"}>
              <a href="#tjenester" className={useNeonGlass ? "hover:text-cyan-200" : "hover:text-slate-950"}>Tjenester</a>
              <a href="#fordeler" className={useNeonGlass ? "hover:text-cyan-200" : "hover:text-slate-950"}>Hvorfor oss</a>
              <a href="#tilbud" className={useNeonGlass ? "hover:text-cyan-200" : "hover:text-slate-950"}>{copy.navOffer}</a>
              <a href="#faq" className={useNeonGlass ? "hover:text-cyan-200" : "hover:text-slate-950"}>FAQ</a>
              <a href="#kontakt" className={useNeonGlass ? "hover:text-cyan-200" : "hover:text-slate-950"}>Kontakt</a>
            </nav>
          )}
          <a href={ctaHref} className={useNeonGlass ? "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-black shadow-lg shadow-cyan-500/20" : "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold"} style={headerCtaStyle}>
            {content.call_to_action}
          </a>
        </div>
      </header>

      {layout === "fullbleed" ? (
        <FullbleedHero
          badge={mode === "internal" ? "Intern preview" : copy.heroBadge}
          callToAction={content.call_to_action}
          companyName={companyName}
          contactHref={ctaHref}
          colors={colors}
          heroImage={heroImage}
          heroTitle={content.hero_title}
          heroSubtitle={content.hero_subtitle}
          introText={heroIntroText}
          mode={mode}
          websiteUrl={preview.websiteUrl}
        />
      ) : layout === "editorial" ? (
        <EditorialHero
          badge={mode === "internal" ? "Intern preview" : copy.heroBadge}
          callToAction={content.call_to_action}
          companyName={companyName}
          contactHref={ctaHref}
          colors={colors}
          images={images}
          heroTitle={content.hero_title}
          heroSubtitle={content.hero_subtitle}
          introText={heroIntroText}
          mode={mode}
          primaryService={services[0] || content.products[0] || copy.heroPrimaryService}
          websiteUrl={preview.websiteUrl}
        />
      ) : (
      <section id="top" className={useNeonGlass ? "relative overflow-hidden border-b border-cyan-300/20" : useDarkHero ? "border-b border-slate-800" : "border-b border-slate-200 bg-white"} style={{ backgroundColor: heroBackground }}>
        {useNeonGlass && <NeonGridBackground colors={colors} />}
        <div className={`${maxWidthClass} grid grid-cols-1 gap-10 ${heroPaddingClass} lg:grid-cols-[1.02fr_0.98fr]`}>
        <div className="flex flex-col justify-center">
          <div className={useNeonGlass ? "mb-5 inline-flex w-fit items-center rounded-lg border border-cyan-300/30 bg-white/10 px-3 py-1 text-xs font-bold text-cyan-100 shadow-lg shadow-cyan-950/30 backdrop-blur" : "mb-5 inline-flex w-fit items-center rounded-lg border px-3 py-1 text-xs font-semibold"} style={useNeonGlass ? undefined : { borderColor: colors.primary, backgroundColor: withPreviewAlpha(colors.primary, useDarkHero ? "28" : "14"), color: useDarkHero ? colors.accent : colors.secondary }}>
            <Sparkles className="mr-2 h-3.5 w-3.5" /> {mode === "internal" ? "Intern preview" : copy.heroBadge}
          </div>
          <h1 className={`${heroTitleClass} ${heroTextClass}`}>{content.hero_title}</h1>
          <p className={`mt-5 max-w-2xl text-xl leading-8 ${heroMutedClass}`}>{content.hero_subtitle}</p>
          {heroIntroText && <p className={`mt-5 max-w-2xl text-base leading-8 md:text-lg ${heroSoftClass}`}>{heroIntroText}</p>}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a href={ctaHref} className={useNeonGlass ? "inline-flex items-center justify-center rounded-lg px-6 py-4 text-sm font-black shadow-xl shadow-cyan-500/20" : "inline-flex items-center justify-center rounded-lg px-6 py-4 text-sm font-bold"} style={useNeonGlass ? { background: `linear-gradient(135deg, ${colors.primary}, ${colors.accent})`, color: "#020617" } : { backgroundColor: colors.primary, color: colors.primaryText }}>
              {content.call_to_action} <ArrowRight className="ml-2 h-4 w-4" />
            </a>
            {preview.websiteUrl && (
              <a href={preview.websiteUrl} target="_blank" rel="noopener noreferrer" className={useDarkHero ? "inline-flex items-center justify-center rounded-lg border border-white/15 bg-white/10 px-6 py-4 text-sm font-bold text-white hover:bg-white/15" : "inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-6 py-4 text-sm font-bold text-slate-700 hover:border-slate-400"}>
                Eksisterende nettside <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            )}
          </div>
          <div className="mt-7 grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
            <HeroMetric label={copy.metricServiceLabel} value={String(content.services.length || "3+")} dark={useDarkHero} />
            <HeroMetric label={copy.metricOfferLabel} value={content.products[0] || content.prices[0] || copy.heroPrimaryService} dark={useDarkHero} />
            <HeroMetric label={copy.metricContactLabel} value={contact.phone || contact.email ? "Direkte" : "Klar"} dark={useDarkHero} />
          </div>
          {mode === "public" && preview.isImported && (
            <p className={`mt-4 max-w-2xl text-xs font-medium ${useDarkHero ? "text-slate-500" : "text-slate-500"}`}>
              Demo basert på offentlig informasjon fra nettsiden.
            </p>
          )}
        </div>

        <HeroMediaPanel
          colors={colors}
          companyName={companyName}
          expiresAt={preview.expiresAt}
          images={images}
          mode={mode}
          primaryService={services[0] || content.products[0] || copy.heroPrimaryService}
          services={services}
          neonGlass={useNeonGlass}
          useDarkHero={useDarkHero}
          visual={visual}
        />
        </div>
      </section>
      )}

      {/* Coaching strips (what the site SHOULD communicate) are internal
          guidance for editors — never shown to the end customer. */}
      {fullPreview && mode === "internal" && (
        <ProcessStrip
          colors={colors}
          copy={copy}
          maxWidthClass={maxWidthClass}
          neonGlass={useNeonGlass}
        />
      )}

      {fullPreview && mode === "internal" && (
        <IndustrySignalStrip
          colors={colors}
          maxWidthClass={maxWidthClass}
          neonGlass={useNeonGlass}
          visual={visual}
        />
      )}

      {(layout === "fullbleed" ? images.slice(1) : images).length > 0 && (
        <section id="bilder" {...revealAttr} className={useNeonGlass ? "border-b border-white/10 bg-[#020617] py-12 text-white" : "bg-white py-12"}>
          <div className={`${maxWidthClass} px-4`}>
            <SectionIntro
              eyebrow={mode === "public" ? "Bilder" : copy.galleryEyebrow}
              title={mode === "public" ? `Se noe av det vi gjør hos ${companyName}` : copy.galleryTitle}
              text={mode === "public" ? "" : preview.isImported ? copy.galleryText : "Bilder og faglige detaljer gir siden mer troverdighet før kunden tar kontakt."}
              inverted={useNeonGlass}
            />
            <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
              {(layout === "fullbleed" ? images.slice(1) : images).slice(0, 3).map((image, index) => (
                <PreviewImage key={`${image}-${index}`} image={image} alt={`${companyName} bilde ${index + 1}`} className={useNeonGlass ? "h-80 w-full rounded-lg border border-white/10 bg-slate-900 object-cover shadow-xl shadow-cyan-950/20" : "h-80 w-full rounded-lg bg-slate-100 object-cover"} color={colors.primary} />
              ))}
            </div>
          </div>
        </section>
      )}

      <section id="tjenester" {...revealAttr} className={visualSection.services}>
        <div className={`${maxWidthClass} px-4`}>
          <SectionIntro
            eyebrow={copy.servicesEyebrow}
            title={copy.servicesTitle}
            text={mode === "public" ? "" : fullPreview ? copy.servicesText : "Kompakt preview viser de viktigste valgene først."}
            inverted={visualSection.invertedServices}
          />
          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
            {(services.length ? services : [DEMO_SITES_PREVIEW_PLACEHOLDERS.service]).map((service, index) => (
              <FeatureCard key={`${service}-${index}`} title={service} color={colors.primary} description={mode === "public" ? "Fortell oss kort hva du trenger, så får du pris og tidspunkt raskt." : getServiceCardDescription(service, preview.templateSlug, copy)} placeholder={!services.length} dark={visualSection.darkCards} variant={visual.variant} />
            ))}
          </div>
        </div>
      </section>

      {fullPreview && (
        <>
          <section id="fordeler" {...revealAttr} className={useNeonGlass ? "border-b border-white/10 py-16 text-white" : "py-16 text-white"} style={{ backgroundColor: useNeonGlass ? "#030712" : colors.secondary }}>
            <div className={`${maxWidthClass} px-4`}>
              <SectionIntro eyebrow={copy.trustEyebrow} title={copy.trustTitle} text={mode === "public" ? "" : copy.trustText} inverted />
              <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-4">
                {(content.trust_points.length ? content.trust_points.slice(0, 4) : copy.proofItems).map((point, index) => (
                  <div key={`${point}-${index}`} className={content.trust_points.length ? "rounded-lg border border-white/15 bg-white/10 p-5 shadow-lg shadow-cyan-950/10 backdrop-blur" : "rounded-lg border border-white/15 bg-white/5 p-5 text-white/80"}>
                    <Star className="h-5 w-5" style={{ color: colors.accent }} />
                    <p className="mt-4 text-sm leading-6 text-white/85">{point}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section id="tilbud" {...revealAttr} className={useNeonGlass ? "bg-[#020617] py-16 text-white" : `${maxWidthClass} px-4 py-16`}>
            <div className={useNeonGlass ? `${maxWidthClass} px-4` : ""}>
            <SectionIntro eyebrow={copy.offerEyebrow} title={copy.offerTitle} text={mode === "public" ? "" : copy.offerText} inverted={useNeonGlass} />
            <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ListCard title={copy.productsTitle} items={content.products} emptyText={DEMO_SITES_PREVIEW_PLACEHOLDERS.product} color={colors.primary} dark={useNeonGlass} />
              <ListCard title={copy.pricesTitle} items={content.prices} emptyText={DEMO_SITES_PREVIEW_PLACEHOLDERS.price} color={colors.primary} dark={useNeonGlass} />
            </div>
            </div>
          </section>

          <section id="faq" {...revealAttr} className={useNeonGlass ? "border-y border-white/10 bg-[#06111f] py-16 text-white" : `${maxWidthClass} px-4 py-16`}>
            <div className={useNeonGlass ? `${maxWidthClass} px-4` : ""}>
            <SectionIntro eyebrow="FAQ" title="Svar på vanlige spørsmål" text={mode === "public" ? "" : copy.faqText} inverted={useNeonGlass} />
            <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
              {(content.faq.length ? content.faq.slice(0, 6) : [{ question: DEMO_SITES_PREVIEW_PLACEHOLDERS.faqQuestion, answer: DEMO_SITES_PREVIEW_PLACEHOLDERS.faqAnswer }]).map((item, index) => (
                <div key={`${item.question}-${index}`} className={useNeonGlass ? content.faq.length ? "rounded-lg border border-white/10 bg-white/[0.07] p-5 shadow-lg shadow-cyan-950/10 backdrop-blur" : "rounded-lg border border-dashed border-white/20 bg-white/[0.04] p-5" : content.faq.length ? "rounded-lg border border-slate-200 bg-white p-5" : "rounded-lg border border-dashed border-slate-300 bg-slate-100 p-5"}>
                  <h3 className={useNeonGlass ? "font-bold text-white" : "font-bold text-slate-950"}>{item.question || "Mangler spørsmål"}</h3>
                  <p className={useNeonGlass ? "mt-3 text-sm leading-6 text-slate-300" : "mt-3 text-sm leading-6 text-slate-600"}>{item.answer || "Mangler svar"}</p>
                </div>
              ))}
            </div>
            </div>
          </section>

          <section id="kontakt" {...revealAttr} className={useNeonGlass ? "bg-[#020617] py-16 text-white" : "bg-slate-950 py-16 text-white"}>
            <div className={`${maxWidthClass} grid grid-cols-1 gap-8 px-4 lg:grid-cols-[0.95fr_1.05fr]`}>
              <div>
                <div className="inline-flex items-center rounded-lg px-3 py-1 text-xs font-semibold" style={{ backgroundColor: withPreviewAlpha(colors.primary, "28"), color: colors.accent }}>
                  <MessageCircle className="mr-2 h-3.5 w-3.5" /> Kontakt
                </div>
                <h2 className="mt-5 text-3xl font-black leading-tight md:text-5xl">{copy.contactTitle}</h2>
                <p className="mt-5 max-w-xl text-base leading-8 text-slate-300">{content.contact_text || (mode === "public" ? "Send oss en melding eller ring — vi svarer raskt." : copy.contactText)}</p>
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
                  {!showLeadForm && (
                    <a href={preview.contactHref} className="inline-flex items-center justify-center rounded-lg px-5 py-3 text-sm font-bold" style={{ backgroundColor: colors.primary, color: colors.primaryText }}>
                      <Mail className="mr-2 h-4 w-4" /> {content.call_to_action}
                    </a>
                  )}
                  {contact.phone && (
                    <a href={`tel:${contact.phone}`} className={showLeadForm ? "inline-flex items-center justify-center rounded-lg px-5 py-3 text-sm font-bold" : "inline-flex items-center justify-center rounded-lg border border-white/20 px-5 py-3 text-sm font-bold text-white hover:bg-white/10"} style={showLeadForm ? { backgroundColor: colors.primary, color: colors.primaryText } : undefined}>
                      <Phone className="mr-2 h-4 w-4" /> Ring oss{showLeadForm ? ` ${contact.phone}` : ""}
                    </a>
                  )}
                  {showLeadForm && contact.email && (
                    <a href={`mailto:${contact.email}`} className="inline-flex items-center justify-center rounded-lg border border-white/20 px-5 py-3 text-sm font-bold text-white hover:bg-white/10">
                      <Mail className="mr-2 h-4 w-4" /> Send e-post
                    </a>
                  )}
                </div>
              </div>

              {showLeadForm ? (
                <DemoLeadForm
                  token={inquiryToken || ""}
                  companyName={companyName}
                  accentColor={colors.primary}
                  accentTextColor={colors.primaryText}
                />
              ) : (
              <div className={useNeonGlass ? "rounded-lg border border-cyan-300/20 bg-white/[0.08] p-5 text-white shadow-2xl shadow-cyan-950/30 backdrop-blur" : "rounded-lg border border-white/10 bg-white p-5 text-slate-950"}>
                <div className={useNeonGlass ? "flex items-center justify-between border-b border-white/10 pb-4" : "flex items-center justify-between border-b border-slate-200 pb-4"}>
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ backgroundColor: colors.primary, color: colors.primaryText }}>
                      <Bot className="h-5 w-5" />
                    </span>
                    <div>
                      <div className={useNeonGlass ? "font-bold text-white" : "font-bold"}>ChatGenius AI-assistent</div>
                      <div className={useNeonGlass ? "text-xs text-slate-400" : "text-xs text-slate-500"}>Svarforslag basert på demoens innhold</div>
                    </div>
                  </div>
                  <span className="rounded-lg bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">{mode === "internal" ? "Preview" : "Online"}</span>
                </div>
                <div className="space-y-3 py-5">
                  <ChatBubble align="left" color={useNeonGlass ? "rgba(255,255,255,0.10)" : "#f1f5f9"} dark={useNeonGlass}>Hei! Jeg kan hjelpe deg med tjenester, priser og kontakt hos {companyName}.</ChatBubble>
                  <ChatBubble align="right" color={withPreviewAlpha(colors.primary, useNeonGlass ? "2e" : "20")} dark={useNeonGlass}>{mode === "internal" ? "Hva er neste steg?" : copy.chatQuestion}</ChatBubble>
                  <ChatBubble align="left" color={useNeonGlass ? "rgba(255,255,255,0.08)" : "#f8fafc"} dark={useNeonGlass}>{preview.chatPrice} Du kan også sende inn detaljer, så følger vi opp med et mer presist forslag.</ChatBubble>
                </div>
                <div className={useNeonGlass ? "flex items-center gap-2 rounded-lg border border-white/10 bg-white/10 px-3 py-3 text-sm text-slate-300" : "flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500"}>
                  <ImageIcon className="h-4 w-4" /> Skriv et spørsmål om {companyName}
                </div>
              </div>
              )}
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
        <footer className={useNeonGlass ? "border-t border-white/10 bg-[#020617] px-4 py-8 text-center text-xs text-slate-500" : "bg-white px-4 py-8 text-center text-xs text-slate-500"}>
          Demo laget med ChatGenius DemoSites. Pakke: {packageName || "Standard"}.
        </footer>
      )}
    </Root>
  );
}

type HeroLayoutProps = {
  badge: string;
  callToAction: string;
  companyName: string;
  contactHref: string;
  colors: DemoSitesPreviewColors;
  heroTitle: string;
  heroSubtitle: string;
  introText: string;
  mode: DemoSitesPreviewMode;
  websiteUrl: string;
};

/** Image-first hero: the customer's own photo full-bleed with overlaid copy. */
function FullbleedHero({
  badge,
  callToAction,
  companyName,
  contactHref,
  colors,
  heroImage,
  heroTitle,
  heroSubtitle,
  introText,
  mode,
  websiteUrl,
}: HeroLayoutProps & { heroImage: string }) {
  const minHeight = mode === "public" ? "min-h-[78vh]" : "min-h-[420px]";
  return (
    <section id="top" className={`relative flex ${minHeight} items-end overflow-hidden border-b border-slate-200`}>
      <img src={heroImage} alt={`${companyName} hovedbilde`} className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/15" />
      <div className="absolute inset-x-0 bottom-0 h-1.5" style={{ background: `linear-gradient(90deg, ${colors.primary}, ${colors.accent})` }} />
      <div className={`relative z-10 w-full ${mode === "public" ? "mx-auto max-w-7xl px-4 pb-16 pt-40" : "px-5 pb-8 pt-24"}`}>
        <div className="mb-5 inline-flex w-fit items-center rounded-full border border-white/25 bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-white backdrop-blur">
          <Sparkles className="mr-2 h-3.5 w-3.5" style={{ color: colors.accent }} /> {badge}
        </div>
        <h1 className={mode === "public" ? "max-w-4xl text-4xl font-black leading-[1.02] text-white drop-shadow-lg md:text-6xl xl:text-7xl" : "max-w-3xl text-3xl font-black leading-tight text-white md:text-4xl"}>
          {heroTitle}
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-white/90 md:text-xl">{heroSubtitle}</p>
        {introText && <p className="mt-3 max-w-2xl text-sm leading-7 text-white/70 md:text-base">{introText}</p>}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <a href={contactHref} className="inline-flex items-center justify-center rounded-lg px-7 py-4 text-sm font-bold shadow-2xl" style={{ backgroundColor: colors.primary, color: colors.primaryText }}>
            {callToAction} <ArrowRight className="ml-2 h-4 w-4" />
          </a>
          {websiteUrl && (
            <a href={websiteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center rounded-lg border border-white/30 bg-white/10 px-7 py-4 text-sm font-bold text-white backdrop-blur hover:bg-white/20">
              Eksisterende nettside <ExternalLink className="ml-2 h-4 w-4" />
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

/** Magazine hero: oversized typography, thin rules, image strip below. */
function EditorialHero({
  badge,
  callToAction,
  companyName,
  contactHref,
  colors,
  images,
  heroTitle,
  heroSubtitle,
  introText,
  mode,
  primaryService,
  websiteUrl,
}: HeroLayoutProps & { images: string[]; primaryService: string }) {
  const heroImages = images.slice(0, 3);
  return (
    <section id="top" className="border-b border-slate-200 bg-white">
      <div className={`${mode === "public" ? "mx-auto max-w-7xl px-4 py-14 lg:py-20" : "p-5"}`}>
        <div className="flex items-center justify-between border-b pb-4" style={{ borderColor: withPreviewAlpha(colors.primary, "33") }}>
          <span className="text-xs font-semibold uppercase tracking-[0.35em]" style={{ color: colors.primary }}>{badge}</span>
          <span className="hidden text-xs font-medium uppercase tracking-[0.25em] text-slate-400 sm:block">{companyName}</span>
        </div>
        <h1 className={mode === "public" ? "mt-10 max-w-5xl text-5xl font-medium leading-[1.04] tracking-tight text-slate-950 md:text-7xl xl:text-8xl" : "mt-6 max-w-3xl text-3xl font-medium leading-tight text-slate-950 md:text-5xl"}>
          {heroTitle}
        </h1>
        <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p className="max-w-2xl text-xl leading-9 text-slate-700">{heroSubtitle}</p>
            {introText && <p className="mt-4 max-w-2xl text-base leading-8 text-slate-500">{introText}</p>}
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href={contactHref} className="inline-flex items-center justify-center rounded-lg px-7 py-4 text-sm font-bold" style={{ backgroundColor: colors.primary, color: colors.primaryText }}>
                {callToAction} <ArrowRight className="ml-2 h-4 w-4" />
              </a>
              {websiteUrl && (
                <a href={websiteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-7 py-4 text-sm font-bold text-slate-700 hover:border-slate-500">
                  Eksisterende nettside <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              )}
            </div>
          </div>
          <div className="flex flex-col justify-end gap-3 border-l pl-8 text-sm text-slate-500" style={{ borderColor: withPreviewAlpha(colors.primary, "26") }}>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em]" style={{ color: colors.accent }}>Spesialitet</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{primaryService}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em]" style={{ color: colors.accent }}>Neste steg</p>
              <p className="mt-1 text-slate-700">{callToAction}</p>
            </div>
          </div>
        </div>
        {heroImages.length > 0 && (
          <div className={`mt-12 grid gap-4 ${heroImages.length === 1 ? "grid-cols-1" : heroImages.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
            {heroImages.map((image, index) => (
              <img
                key={`${image}-${index}`}
                src={image}
                alt={`${companyName} bilde ${index + 1}`}
                className={`w-full rounded-lg object-cover ${index === 0 ? "h-72 md:h-96" : "h-72 md:h-96"}`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function BusinessTopStrip({ contact, copy, colors, neonGlass = false }: { contact: ReturnType<typeof getDemoSitesPreviewModel>["contact"]; copy: ResolvedPreviewBusinessCopy; colors: DemoSitesPreviewColors; neonGlass?: boolean }) {
  return (
    <div className={neonGlass ? "border-b border-white/10 bg-[#020617] text-xs text-slate-300" : "border-b border-slate-200 bg-slate-950 text-xs text-slate-300"}>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: colors.accent }} />
          <span className="truncate">{contact.address || "Lokal bedrift"}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" style={{ color: colors.accent }} />Rask respons</span>
          <span className="inline-flex items-center gap-1.5"><BadgeCheck className="h-3.5 w-3.5" style={{ color: colors.accent }} />{copy.proofLabel}</span>
          {contact.phone && <a href={`tel:${contact.phone}`} className="font-semibold text-white hover:text-slate-200">{contact.phone}</a>}
        </div>
      </div>
    </div>
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

function HeroMetric({ label, value, dark = false }: { label: string; value: string; dark?: boolean }) {
  return (
    <div className={dark ? "rounded-lg border border-white/10 bg-white/10 p-3 shadow-sm backdrop-blur" : "rounded-lg border border-slate-200 bg-white/75 p-3 shadow-sm"}>
      <div className={dark ? "text-xs font-semibold text-slate-400" : "text-xs font-semibold text-slate-500"}>{label}</div>
      <div className={dark ? "mt-1 line-clamp-2 text-sm font-black leading-5 text-white" : "mt-1 line-clamp-2 text-sm font-black leading-5 text-slate-950"}>{value}</div>
    </div>
  );
}

function HeroMediaPanel({
  colors,
  companyName,
  expiresAt,
  images,
  mode,
  neonGlass,
  primaryService,
  services = [],
  useDarkHero,
  visual,
}: {
  colors: DemoSitesPreviewColors;
  companyName: string;
  expiresAt: string;
  images: string[];
  mode: DemoSitesPreviewMode;
  neonGlass: boolean;
  primaryService: string;
  services?: string[];
  useDarkHero: boolean;
  visual: DemoSitesPreviewIndustryVisual;
}) {
  const mainImage = images[0];
  // Real services beat generic industry chips — a demo must always sell,
  // never explain what it "should" communicate.
  const panelChips = (services.length ? services : visual.signalItems).slice(0, 3);
  const heroImageClass = mode === "public" ? "h-full min-h-[460px] w-full rounded-lg object-cover" : "h-full min-h-[300px] w-full rounded-lg object-cover";

  if (neonGlass) {
    return (
      <NeonTechnologyPanel
        colors={colors}
        companyName={companyName}
        expiresAt={expiresAt}
        images={images}
        mode={mode}
        visual={visual}
      />
    );
  }

  if (mainImage) {
    // Public mode: the customer's photo speaks for itself — only a small
    // service chip, never editor guidance text.
    if (mode === "public") {
      return (
        <div className={useDarkHero ? "relative overflow-hidden rounded-lg bg-slate-900 shadow-2xl ring-1 ring-white/10" : "relative overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200"}>
          <PreviewImage image={mainImage} alt={`${companyName} hovedbilde`} className={heroImageClass} color={colors.secondary} />
          <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-lg bg-white/95 px-3 py-1.5 text-xs font-bold text-slate-900 shadow-lg backdrop-blur">
            <ShieldCheck className="h-3.5 w-3.5" style={{ color: colors.primary }} />
            {primaryService}
          </div>
        </div>
      );
    }

    return (
      <div className={useDarkHero ? "relative overflow-hidden rounded-lg bg-slate-900 shadow-2xl ring-1 ring-white/10" : "relative overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200"}>
        <PreviewImage image={mainImage} alt={`${companyName} hovedbilde`} className={heroImageClass} color={colors.secondary} />
        <div className="absolute inset-x-4 bottom-4 rounded-lg border border-white/70 bg-white/95 p-4 shadow-xl backdrop-blur">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: colors.secondary, color: colors.secondaryText }}>
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <div className="text-sm font-black text-slate-950">{primaryService}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {panelChips.map((item) => (
                  <span key={item} className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
                    {item}
                  </span>
                ))}
              </div>
              <div className="mt-3 text-xs font-semibold text-slate-500">
                {`${images.length} bilde${images.length === 1 ? "" : "r"} i preview`}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={useDarkHero ? "flex min-h-[380px] flex-col justify-between rounded-lg border border-white/10 bg-white/10 p-6 text-white shadow-2xl backdrop-blur" : "flex min-h-[380px] flex-col justify-between rounded-lg border border-slate-200 bg-white p-6 shadow-sm"}>
      <div>
        <div className="inline-flex items-center rounded-lg px-3 py-1 text-xs font-semibold" style={{ backgroundColor: withPreviewAlpha(colors.primary, useDarkHero ? "28" : "16"), color: useDarkHero ? colors.accent : colors.secondary }}>
          <VisualVariantIcon variant={visual.variant} className="mr-2 h-3.5 w-3.5" />
          {visual.label}
        </div>
        <h3 className={useDarkHero ? "mt-5 max-w-lg text-3xl font-black leading-tight text-white" : "mt-5 max-w-lg text-3xl font-black leading-tight text-slate-950"}>{primaryService}</h3>
      </div>
      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
        {panelChips.map((item) => (
          <div key={item} className={useDarkHero ? "rounded-lg border border-white/10 bg-white/10 p-4 text-sm font-bold text-white" : "rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-800"}>
            <VisualVariantIcon variant={visual.variant} className="mb-3 h-5 w-5" style={{ color: colors.primary }} />
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function NeonGridBackground({ colors }: { colors: DemoSitesPreviewColors }) {
  return (
    <>
      <div
        className="pointer-events-none absolute inset-0 opacity-35"
        style={{
          backgroundImage: `linear-gradient(${withPreviewAlpha(colors.primary, "22")} 1px, transparent 1px), linear-gradient(90deg, ${withPreviewAlpha(colors.accent, "1f")} 1px, transparent 1px)`,
          backgroundSize: "54px 54px",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `linear-gradient(115deg, ${withPreviewAlpha(colors.primary, "1f")} 0%, transparent 36%, ${withPreviewAlpha(colors.accent, "19")} 70%, transparent 100%)`,
        }}
      />
    </>
  );
}

function NeonTechnologyPanel({
  colors,
  companyName,
  expiresAt,
  images,
  mode,
  visual,
}: {
  colors: DemoSitesPreviewColors;
  companyName: string;
  expiresAt: string;
  images: string[];
  mode: DemoSitesPreviewMode;
  visual: DemoSitesPreviewIndustryVisual;
}) {
  const signals = visual.signalItems;
  const stack = visual.panelStages;

  return (
    <div className="relative min-h-[420px] overflow-hidden rounded-lg border border-cyan-300/20 bg-slate-950 p-5 text-white shadow-2xl shadow-cyan-950/40">
      <NeonGridBackground colors={colors} />
      <div className="relative flex h-full min-h-[380px] flex-col justify-between">
        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex items-center rounded-lg border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold text-cyan-100 backdrop-blur">
            <Bot className="mr-2 h-3.5 w-3.5" />
            {visual.label}
          </div>
          <div className="rounded-lg border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-200">
            {mode === "internal" ? "Ikke publisert" : `Aktiv til ${formatPreviewDate(expiresAt)}`}
          </div>
        </div>

        <div className="my-8 rounded-lg border border-white/10 bg-white/[0.08] p-5 shadow-2xl shadow-cyan-950/30 backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-cyan-200">Pipeline</p>
              <h3 className="mt-2 text-3xl font-black leading-tight text-white">{mode === "internal" ? visual.heroPanelTitle : "Fra idé til levert løsning"}</h3>
            </div>
            <div className="rounded-lg border border-white/10 bg-slate-950/70 px-4 py-3 text-right">
              <div className="text-xs text-slate-400">Status</div>
              <div className="text-sm font-black text-emerald-200">Pilotklar</div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            {stack.map((item, index) => (
              <div key={item} className="rounded-lg border border-white/10 bg-slate-950/55 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-slate-400">0{index + 1}</span>
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: index % 2 === 0 ? colors.primary : colors.accent }} />
                </div>
                <div className="mt-4 text-sm font-black text-white">{item}</div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full" style={{ width: `${64 + index * 8}%`, background: `linear-gradient(90deg, ${colors.primary}, ${colors.accent})` }} />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-4 text-sm leading-6 text-cyan-50">
            {mode === "internal" ? `${visual.heroPanelText} ` : ""}For {companyName} betyr det kort vei fra ide til testbar pilot, med data og sikkerhet med fra start.
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {signals.map((item) => (
            <div key={item} className="rounded-lg border border-white/10 bg-white/[0.07] p-4 text-sm font-bold text-white backdrop-blur">
              <Sparkles className="mb-3 h-5 w-5" style={{ color: colors.primary }} />
              {item}
            </div>
          ))}
        </div>

        {images.length > 0 && (
          <div className="mt-4 text-xs font-semibold text-slate-500">
            {images.length} bilde{images.length === 1 ? "" : "r"} brukes videre i demoen.
          </div>
        )}
      </div>
    </div>
  );
}

function ProcessStrip({ colors, copy, maxWidthClass, neonGlass = false }: { colors: DemoSitesPreviewColors; copy: ResolvedPreviewBusinessCopy; maxWidthClass: string; neonGlass?: boolean }) {
  const icons = [<ClipboardCheck key="need" className="h-5 w-5" />, <Wrench key="work" className="h-5 w-5" />, <CalendarCheck key="next" className="h-5 w-5" />];

  return (
    <section className={neonGlass ? "border-b border-white/10 bg-[#020617] text-white" : "border-b border-slate-200 bg-white"}>
      <div className={`${maxWidthClass} grid grid-cols-1 gap-4 px-4 py-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center`}>
        <div>
          <div className={neonGlass ? "text-xs font-bold uppercase tracking-wide text-cyan-200" : "text-xs font-bold uppercase tracking-wide text-slate-500"}>{copy.proofLabel}</div>
          <h2 className={neonGlass ? "mt-2 text-2xl font-black leading-tight text-white md:text-3xl" : "mt-2 text-2xl font-black leading-tight text-slate-950 md:text-3xl"}>{copy.processTitle}</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {copy.processSteps.map((step, index) => (
            <div key={step} className={neonGlass ? "flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.07] p-4 shadow-lg shadow-cyan-950/10 backdrop-blur" : "flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4"}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white" style={{ backgroundColor: colors.primary, color: colors.primaryText }}>
                {icons[index] || <CheckCircle className="h-5 w-5" />}
              </span>
              <span className={neonGlass ? "text-sm font-semibold leading-6 text-slate-200" : "text-sm font-semibold leading-6 text-slate-700"}>{step}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function IndustrySignalStrip({ colors, maxWidthClass, neonGlass = false, visual }: { colors: DemoSitesPreviewColors; maxWidthClass: string; neonGlass?: boolean; visual: DemoSitesPreviewIndustryVisual }) {
  const classes = getPreviewVisualSignalClasses(visual.variant, neonGlass);

  return (
    <section className={classes.section}>
      <div className={`${maxWidthClass} grid grid-cols-1 gap-5 px-4 py-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center`}>
        <div>
          <div className={classes.label}>{visual.label}</div>
          <h2 className={classes.title}>{visual.signalTitle}</h2>
          <p className={classes.text}>{visual.signalText}</p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {visual.signalItems.map((item, index) => (
            <div key={item} className={classes.item}>
              <div className="flex items-center justify-between gap-3">
                <span className={classes.itemIndex}>0{index + 1}</span>
                <span className={classes.iconWrap} style={{ backgroundColor: withPreviewAlpha(colors.primary, neonGlass ? "28" : "18"), color: neonGlass ? colors.accent : colors.primary }}>
                  <VisualVariantIcon variant={visual.variant} className="h-5 w-5" />
                </span>
              </div>
              <div className={classes.itemTitle}>{item}</div>
              <div className={classes.itemLine} style={{ background: `linear-gradient(90deg, ${colors.primary}, ${colors.accent})` }} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SectionIntro({ eyebrow, title, text, inverted = false }: { eyebrow: string; title: string; text: string; inverted?: boolean }) {
  return (
    <div className="max-w-3xl">
      <div className={inverted ? "text-sm font-bold text-white/70" : "text-sm font-bold text-slate-500"}>{eyebrow}</div>
      <h2 className={inverted ? "mt-3 text-3xl font-black leading-tight text-white md:text-4xl" : "mt-3 text-3xl font-black leading-tight text-slate-950 md:text-4xl"}>{title}</h2>
      {text ? <p className={inverted ? "mt-4 text-base leading-7 text-white/75" : "mt-4 text-base leading-7 text-slate-600"}>{text}</p> : null}
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

function FeatureCard({
  title,
  color,
  description,
  placeholder = false,
  dark = false,
  variant,
}: {
  title: string;
  color: string;
  description: string;
  placeholder?: boolean;
  dark?: boolean;
  variant: DemoSitesPreviewIndustryVariant;
}) {
  return (
    <div className={dark ? placeholder ? "rounded-lg border border-dashed border-white/20 bg-white/[0.04] p-6 text-slate-400" : "rounded-lg border border-white/10 bg-white/[0.07] p-6 text-white shadow-lg shadow-cyan-950/10 backdrop-blur transition hover:-translate-y-1 hover:border-cyan-300/30 hover:bg-white/[0.1]" : placeholder ? "rounded-lg border border-dashed border-slate-300 bg-white p-6 text-slate-500" : "rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"}>
      <span className="flex h-11 w-11 items-center justify-center rounded-lg" style={{ backgroundColor: withPreviewAlpha(color, dark ? "24" : "16"), color }}>
        <VisualVariantIcon variant={variant} className="h-6 w-6" />
      </span>
      <h3 className={dark ? "mt-4 font-bold text-white" : "mt-4 font-bold text-slate-950"}>{title}</h3>
      <p className={dark ? "mt-2 text-sm leading-6 text-slate-300" : "mt-2 text-sm leading-6 text-slate-600"}>{placeholder ? "Legg inn konkrete tjenester for å gjøre demoen mer salgsklar." : description}</p>
    </div>
  );
}

function ListCard({ title, items, emptyText, color, dark = false }: { title: string; items: string[]; emptyText: string; color: string; dark?: boolean }) {
  const visibleItems = items.length ? items : [emptyText];
  return (
    <div className={dark ? items.length ? "rounded-lg border border-white/10 bg-white/[0.07] p-6 shadow-lg shadow-cyan-950/10 backdrop-blur" : "rounded-lg border border-dashed border-white/20 bg-white/[0.04] p-6" : items.length ? "rounded-lg border border-slate-200 bg-white p-6" : "rounded-lg border border-dashed border-slate-300 bg-white p-6"}>
      <h3 className="text-2xl font-black">{title}</h3>
      <div className="mt-5 space-y-3">
        {visibleItems.slice(0, 8).map((item, index) => (
          <div key={`${item}-${index}`} className={dark ? items.length ? "flex gap-3 rounded-lg border border-white/10 bg-slate-950/45 p-4 text-sm text-slate-200" : "flex gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-400" : items.length ? "flex gap-3 rounded-lg bg-slate-50 p-4 text-sm" : "flex gap-3 rounded-lg bg-slate-100 p-4 text-sm text-slate-500"}>
            <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" style={{ color }} />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChatBubble({ children, align, color, dark = false }: { children: ReactNode; align: "left" | "right"; color: string; dark?: boolean }) {
  return (
    <div className={`${align === "right" ? "ml-auto" : "mr-auto"} max-w-[82%] rounded-lg p-3 text-sm leading-6 ${dark ? "border border-white/10 text-slate-100" : "text-slate-800"}`} style={{ backgroundColor: color }}>
      {children}
    </div>
  );
}

function VisualVariantIcon({ variant, className, style }: { variant: DemoSitesPreviewIndustryVariant; className?: string; style?: CSSProperties }) {
  switch (variant) {
    case "auto":
      return <Car className={className} style={style} />;
    case "hospitality":
      return <Utensils className={className} style={style} />;
    case "clean":
      return <Sparkles className={className} style={style} />;
    case "trade":
      return <Hammer className={className} style={style} />;
    case "clinic":
      return <Stethoscope className={className} style={style} />;
    case "professional":
      return <Scale className={className} style={style} />;
    case "stay":
      return <Hotel className={className} style={style} />;
    case "property":
      return <Home className={className} style={style} />;
    case "logistics":
      return <Truck className={className} style={style} />;
    case "neon":
      return <Cpu className={className} style={style} />;
    default:
      return <CheckCircle className={className} style={style} />;
  }
}

function getPreviewVisualSectionClasses(variant: DemoSitesPreviewIndustryVariant, neonGlass: boolean) {
  if (neonGlass) {
    return {
      services: "border-b border-white/10 bg-[#06111f] py-16 text-white",
      invertedServices: true,
      darkCards: true,
    };
  }

  if (variant === "auto" || variant === "trade" || variant === "logistics") {
    return {
      services: "border-b border-slate-800 bg-slate-950 py-16 text-white",
      invertedServices: true,
      darkCards: true,
    };
  }

  if (variant === "hospitality") {
    return {
      services: "bg-[#fff7ed] py-16",
      invertedServices: false,
      darkCards: false,
    };
  }

  if (variant === "clean" || variant === "clinic") {
    return {
      services: "bg-[#f0fdfa] py-16",
      invertedServices: false,
      darkCards: false,
    };
  }

  if (variant === "professional" || variant === "property" || variant === "stay") {
    return {
      services: "bg-[#f8fafc] py-16",
      invertedServices: false,
      darkCards: false,
    };
  }

  return {
    services: "bg-[#f8fafc] py-16",
    invertedServices: false,
    darkCards: false,
  };
}

function getPreviewVisualSignalClasses(variant: DemoSitesPreviewIndustryVariant, neonGlass: boolean) {
  if (neonGlass) {
    return {
      section: "border-b border-white/10 bg-[#020617] text-white",
      label: "text-xs font-bold uppercase tracking-wide text-cyan-200",
      title: "mt-2 text-2xl font-black leading-tight text-white md:text-3xl",
      text: "mt-3 max-w-2xl text-sm leading-6 text-slate-300",
      item: "rounded-lg border border-cyan-300/20 bg-white/[0.07] p-5 shadow-lg shadow-cyan-950/20 backdrop-blur",
      itemIndex: "text-xs font-bold text-cyan-200",
      iconWrap: "flex h-10 w-10 items-center justify-center rounded-lg",
      itemTitle: "mt-5 text-sm font-black text-white",
      itemLine: "mt-4 h-1 rounded-full",
    };
  }

  if (variant === "auto" || variant === "trade" || variant === "logistics") {
    return {
      section: "border-b border-slate-800 bg-slate-950 text-white",
      label: "text-xs font-bold uppercase tracking-wide text-slate-400",
      title: "mt-2 text-2xl font-black leading-tight text-white md:text-3xl",
      text: "mt-3 max-w-2xl text-sm leading-6 text-slate-300",
      item: "rounded-lg border border-white/10 bg-white/[0.06] p-5 shadow-lg shadow-slate-950/20",
      itemIndex: "text-xs font-bold text-slate-400",
      iconWrap: "flex h-10 w-10 items-center justify-center rounded-lg",
      itemTitle: "mt-5 text-sm font-black text-white",
      itemLine: "mt-4 h-1 rounded-full",
    };
  }

  if (variant === "hospitality") {
    return {
      section: "border-b border-orange-100 bg-[#fff7ed] text-slate-950",
      label: "text-xs font-bold uppercase tracking-wide text-orange-700",
      title: "mt-2 text-2xl font-black leading-tight text-slate-950 md:text-3xl",
      text: "mt-3 max-w-2xl text-sm leading-6 text-slate-700",
      item: "rounded-lg border border-orange-100 bg-white p-5 shadow-sm",
      itemIndex: "text-xs font-bold text-orange-700",
      iconWrap: "flex h-10 w-10 items-center justify-center rounded-lg",
      itemTitle: "mt-5 text-sm font-black text-slate-950",
      itemLine: "mt-4 h-1 rounded-full",
    };
  }

  if (variant === "clean" || variant === "clinic") {
    return {
      section: "border-b border-teal-100 bg-[#f0fdfa] text-slate-950",
      label: "text-xs font-bold uppercase tracking-wide text-teal-700",
      title: "mt-2 text-2xl font-black leading-tight text-slate-950 md:text-3xl",
      text: "mt-3 max-w-2xl text-sm leading-6 text-slate-700",
      item: "rounded-lg border border-teal-100 bg-white p-5 shadow-sm",
      itemIndex: "text-xs font-bold text-teal-700",
      iconWrap: "flex h-10 w-10 items-center justify-center rounded-lg",
      itemTitle: "mt-5 text-sm font-black text-slate-950",
      itemLine: "mt-4 h-1 rounded-full",
    };
  }

  return {
    section: "border-b border-slate-200 bg-white text-slate-950",
    label: "text-xs font-bold uppercase tracking-wide text-slate-500",
    title: "mt-2 text-2xl font-black leading-tight text-slate-950 md:text-3xl",
    text: "mt-3 max-w-2xl text-sm leading-6 text-slate-600",
    item: "rounded-lg border border-slate-200 bg-slate-50 p-5 shadow-sm",
    itemIndex: "text-xs font-bold text-slate-500",
    iconWrap: "flex h-10 w-10 items-center justify-center rounded-lg",
    itemTitle: "mt-5 text-sm font-black text-slate-950",
    itemLine: "mt-4 h-1 rounded-full",
  };
}

function resolvePreviewBusinessCopy(copy: PreviewBusinessCopy): ResolvedPreviewBusinessCopy {
  return {
    ...copy,
    proofLabel: copy.proofLabel || "Trygt valg",
    proofItems: copy.proofItems?.length ? copy.proofItems : ["Ryddig oversikt", "Tydelig neste steg", "Direkte kontakt"],
    processTitle: copy.processTitle || "Fra behov til neste steg",
    processSteps: copy.processSteps?.length
      ? copy.processSteps.slice(0, 3)
      : ["Velg riktig tjeneste", "Se pris, pakke eller neste steg", "Send forespørsel når det passer"],
  };
}

function prefersDarkBusinessHero(templateSlug: string) {
  const slug = templateSlug.toLowerCase();
  return ["dekk", "bilverksted", "elektro", "rorlegger", "snekker", "bygg", "frakt"].some((keyword) => slug.includes(keyword));
}

function getHeroBackground(colors: DemoSitesPreviewColors) {
  return colors.secondaryText === "#ffffff" ? colors.secondary : "#111827";
}

function getServiceCardDescription(service: string, templateSlug: string, copy: ResolvedPreviewBusinessCopy) {
  const value = service.toLowerCase();
  const slug = templateSlug.toLowerCase();

  if (isDemoSiteTechnologyTemplate(slug)) {
    if (value.includes("agent")) return "Presenter AI-agenten som et konkret verktøy for kundeservice, salg eller interne oppgaver.";
    if (value.includes("automatisering") || value.includes("automasjon")) return "Vis hvilke manuelle steg som kan kuttes ned, måles og skaleres trygt.";
    if (value.includes("api") || value.includes("integrasjon")) return "Gjør tekniske koblinger forståelige med tydelig verdi for arbeidsflyten.";
    if (value.includes("data") || value.includes("dashboard")) return "Knytter data, innsikt og beslutninger sammen i en lettlest demo.";
    if (value.includes("pilot") || value.includes("mvp") || value.includes("prototype")) return "Gir kunden en trygg vei fra idé til testbar løsning uten stort førstesteg.";
    if (value.includes("sikker") || value.includes("gdpr")) return "Bygger tillit rundt data, ansvar og kontroll før løsningen tas i bruk.";
    return "Vises som et tydelig teknologivalg med vei til workshop, demo eller pilot.";
  }

  if (slug.includes("dekk") || slug.includes("bilverksted")) {
    if (value.includes("hjulhotell")) return "Trygg lagring, sesongbytte og enkel oppfølging når dekkene skal på igjen.";
    if (value.includes("dekkskift") || value.includes("dekk")) return "Tydelig vei til timebestilling, riktig dimensjon og tilbud på dekk.";
    if (value.includes("eu") || value.includes("kontroll")) return "Presenter kontroll, frister og verkstedoppfølging på en ryddig måte.";
    if (value.includes("service") || value.includes("verksted")) return "Gjør det enkelt å beskrive behov og få riktig verkstedtime.";
    return "Knyttes til timebestilling, prisforespørsel og praktisk rådgivning for bilen.";
  }

  if (slug.includes("restaurant") || slug.includes("kafe")) {
    if (value.includes("meny")) return "Viser hva gjesten kan forvente før de booker bord eller tar kontakt.";
    if (value.includes("bord") || value.includes("booking")) return "Kort vei fra interesse til reservasjon, med tydelig kontaktflate.";
    return "Presenteres som et konkret valg for gjester som vil se meny, booke eller spørre.";
  }

  if (slug.includes("renhold")) {
    if (value.includes("befaring")) return "Gjør det lett å be om befaring og få et presist renholdstilbud.";
    if (value.includes("kontor") || value.includes("bedrift")) return "Løfter faste avtaler, kvalitet og ryddig oppfølging for bedrifter.";
    if (value.includes("flytte") || value.includes("privat")) return "Viser hva som inngår, forventet resultat og hvordan kunden bestiller.";
    return "Kobler renholdstjenesten til befaring, avtale og rask prisforespørsel.";
  }

  if (slug.includes("hotell")) {
    return "Gjør rom, fasiliteter og bookingvalg enklere å forstå før gjesten tar kontakt.";
  }

  if (slug.includes("eiendomsmegler")) {
    return "Knytter tjenesten til verdivurdering, rådgivning og trygg oppfølging.";
  }

  if (slug.includes("advokat")) {
    return "Presenter fagområdet med lav terskel for en trygg første henvendelse.";
  }

  if (slug.includes("tannlege") || slug.includes("fysioterapi") || slug.includes("klinikk") || slug.includes("frisor") || slug.includes("skjonnhet")) {
    return "Gjør det enkelt å forstå behandlingen, stille spørsmål og bestille time.";
  }

  return copy.serviceCardText;
}

function getPreviewBusinessCopy(templateSlug: string, companyName: string): PreviewBusinessCopy {
  const slug = templateSlug.toLowerCase();

  if (isDemoSiteTechnologyTemplate(slug)) {
    return {
      navOffer: "Pilot og demo",
      heroBadge: "AI, automasjon og teknologi",
      heroStatusTitle: "Klar for AI-pilot",
      heroStatusText: "Kunden ser hva som kan automatiseres, hvordan teknologien kobles på og hvilket første steg som er trygt å ta.",
      heroPrimaryService: "AI-agenter, integrasjoner og pilotløp",
      galleryEyebrow: "Teknologiprofil",
      galleryTitle: "Et visuelt uttrykk for en moderne teknobedrift",
      galleryText: "Bilder, farger og glasspaneler løfter AI, dataflyt og produktfølelse uten å gjøre siden rotete.",
      servicesEyebrow: "AI-tjenester",
      servicesTitle: "Fra manuell prosess til smart arbeidsflyt",
      servicesText: "Gjør AI, automasjon og integrasjoner forståelig for ledere som vil starte kontrollert.",
      serviceCardText: "Knyttes til workshop, demo, pilot eller teknisk avklaring.",
      trustEyebrow: "Trygg teknologi",
      trustTitle: "Nytt og fancy, men fortsatt forankret i drift",
      trustText: "Denne delen viser hvordan AI-løsningen kan bygges rundt sikkerhet, data, integrasjoner og målbar effekt.",
      offerEyebrow: "Pakketering",
      offerTitle: "Tydelige veier fra idé til pilot",
      offerText: "Workshop, pilot og integrasjoner presenteres som konkrete kjøpsvalg, ikke bare teknisk buzz.",
      productsTitle: "AI-pakker og leveranser",
      pricesTitle: "Pris og pilotstart",
      faqText: "Svar på spørsmål om data, sikkerhet, integrasjoner, scope og hvordan et pilotløp starter.",
      contactTitle: `Start en smartere tech-dialog med ${companyName}`,
      contactText: "Gjør det enkelt å booke workshop, se demo eller beskrive en prosess som bør automatiseres.",
      chatQuestion: "Kan vi starte med en AI-pilot?",
      metricServiceLabel: "AI-flyt",
      metricOfferLabel: "Pilot",
      metricContactLabel: "Demo",
      proofLabel: "Sikker innovasjon",
      proofItems: ["Avgrenset pilot før skalering", "Data og GDPR vurderes tidlig", "Integrasjoner planlegges ryddig", "Effekt måles før videre investering"],
      processTitle: "Fra AI-idé til testbar løsning",
      processSteps: ["Kartlegg prosess og datagrunnlag", "Velg workshop, demo eller pilot", "Mål effekt før løsningen skaleres"],
    };
  }

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
      proofLabel: "Trygt verkstedvalg",
      proofItems: ["Riktig dekk og dimensjon", "Ryddig timebestilling", "Klar pris- eller tilbudsvei", "Direkte kontakt med verkstedet"],
      processTitle: "Slik blir bilkunden klar til å bestille",
      processSteps: ["Velg dekkskift, hjulhotell eller verksted", "Se aktuelle pakker, priser og neste steg", "Send forespørsel eller bestill time direkte"],
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
      proofLabel: "Klar gjesteflyt",
      proofItems: ["Menyen er lett å finne", "Booking og kontakt er tydelig", "Stemning og bilder vises tidlig", "Praktisk info er samlet"],
      processTitle: "Fra sulten gjest til booking",
      processSteps: ["Se meny, stemning og tilbud", "Finn bord, takeaway eller selskap", "Book eller ta kontakt uten friksjon"],
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
      proofLabel: "Godkjent og ryddig",
      proofItems: ["Tjenester er konkret forklart", "Befaring er lett å bestille", "Fast avtale blir tydelig", "Kontaktinfo er enkel å bruke"],
      processTitle: "Fra renholdsbehov til befaring",
      processSteps: ["Velg privat, bedrift eller spesialrenhold", "Beskriv lokalet og ønsket frekvens", "Be om befaring eller pristilbud"],
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
      proofLabel: "Trygg booking",
      proofItems: ["Rom og fasiliteter er tydelige", "Bookingveien er kort", "Praktisk info er samlet", "Bilder bygger forventning"],
      processTitle: "Fra oppholdsønske til booking",
      processSteps: ["Se rom, fasiliteter og opplevelser", "Sjekk pris eller tilgjengelighet", "Send bookingforespørsel direkte"],
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
      proofLabel: "Trygg salgsprosess",
      proofItems: ["Lokalkunnskap kommer frem", "Verdivurdering er lett å bestille", "Prosessen er forklart", "Kontaktveien er tydelig"],
      processTitle: "Fra boligspørsmål til verdivurdering",
      processSteps: ["Se tjenester og meglerprofil", "Send boliginfo eller spørsmål", "Bestill verdivurdering"],
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
      proofLabel: "Faglig trygghet",
      proofItems: ["Tjenester er lette å forstå", "Befaring er tydelig neste steg", "Prosjektinfo kan sendes inn", "Kontaktveien er samlet"],
      processTitle: "Fra behov til faglig tilbud",
      processSteps: ["Velg fagområde eller type prosjekt", "Beskriv jobben og ønsket tidspunkt", "Be om befaring eller tilbud"],
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
      proofLabel: "Profesjonell rådgivning",
      proofItems: ["Fagområder vises ryddig", "Første henvendelse blir enkel", "Prosess og forventninger forklares", "Kontakt skjer kontrollert"],
      processTitle: "Fra juridisk spørsmål til riktig rådgivning",
      processSteps: ["Velg fagområde eller problemstilling", "Send en kort beskrivelse", "Få riktig oppfølging videre"],
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
      proofLabel: "Trygg timebestilling",
      proofItems: ["Behandlinger er lette å velge", "Pris og varighet kan vises", "Klinikken føles trygg", "Kontaktinfo er tydelig"],
      processTitle: "Fra behov til time",
      processSteps: ["Velg behandling eller spørsmål", "Se praktisk info og neste steg", "Bestill time eller send forespørsel"],
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
    proofLabel: "Lokal og profesjonell",
    proofItems: ["Tjenestene er tydelige", "Neste steg er enkelt", "Kontaktinfo er samlet", "Demoen føles som bedriften"],
    processTitle: "Fra interesse til riktig henvendelse",
    processSteps: ["Se hva bedriften tilbyr", "Velg pakke, pris eller neste steg", "Send forespørsel direkte"],
  };
}
