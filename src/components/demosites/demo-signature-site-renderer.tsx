import type { CSSProperties, ReactNode } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Check,
  ChevronRight,
  ExternalLink,
  Layers3,
  Mail,
  MapPin,
  MessageCircle,
  MousePointer2,
  Phone,
  Quote,
  Sparkles,
  Star,
  Zap,
} from "lucide-react";
import { DemoChatWidget } from "@/components/demosites/demo-chat-widget";
import { DemoLeadForm } from "@/components/demosites/demo-lead-form";
import { getDemoFontPair } from "@/components/demosites/demo-fonts";
import { DemoReveal } from "@/components/demosites/demo-reveal";
import {
  getDemoSitesPreviewModel,
  withPreviewAlpha,
  type DemoSitesPreviewInput,
  type DemoSitesPreviewMode,
  type DemoSitesPreviewModel,
} from "@/lib/demosites-preview";
import {
  isSignatureDemoSiteLayout,
  type DemoSiteDesign,
  type SignatureDemoSiteLayout,
} from "@/lib/demosites-design";

export type DemoSignatureSiteRendererProps = DemoSitesPreviewInput & {
  mode: DemoSitesPreviewMode;
  design: DemoSiteDesign;
  inquiryToken?: string;
  isLiveSite?: boolean;
  packageId?: string;
  packageName?: string;
  className?: string;
};

type SignatureTheme = {
  page: string;
  header: string;
  headerText: string;
  section: string;
  alternate: string;
  card: string;
  cardText: string;
  muted: string;
  eyebrow: string;
  contact: string;
  footer: string;
  radius: string;
};

const SIGNATURE_THEMES: Record<SignatureDemoSiteLayout, SignatureTheme> = {
  cinematic: {
    page: "bg-[#06080c] text-white",
    header: "border-white/10 bg-[#06080c]/70 backdrop-blur-2xl",
    headerText: "text-white",
    section: "bg-[#080b11] text-white",
    alternate: "bg-[#0d1119] text-white",
    card: "border-white/10 bg-white/[0.055] shadow-2xl shadow-black/20",
    cardText: "text-white",
    muted: "text-white/60",
    eyebrow: "text-white/[0.45]",
    contact: "bg-[#030407] text-white",
    footer: "border-white/10 bg-[#030407] text-white/[0.45]",
    radius: "rounded-[2rem]",
  },
  bento: {
    page: "bg-[#f2f4f0] text-slate-950",
    header: "border-slate-950/10 bg-[#f2f4f0]/85 backdrop-blur-2xl",
    headerText: "text-slate-950",
    section: "bg-[#f2f4f0] text-slate-950",
    alternate: "bg-white text-slate-950",
    card: "border-slate-950/10 bg-white shadow-[0_20px_70px_rgba(15,23,42,0.08)]",
    cardText: "text-slate-950",
    muted: "text-slate-600",
    eyebrow: "text-slate-500",
    contact: "bg-[#111916] text-white",
    footer: "border-slate-950/10 bg-[#f2f4f0] text-slate-500",
    radius: "rounded-[2rem]",
  },
  atelier: {
    page: "bg-[#eee9df] text-[#211f1b]",
    header: "border-[#211f1b]/15 bg-[#eee9df]/85 backdrop-blur-2xl",
    headerText: "text-[#211f1b]",
    section: "bg-[#eee9df] text-[#211f1b]",
    alternate: "bg-[#ded7ca] text-[#211f1b]",
    card: "border-[#211f1b]/15 bg-[#f8f4ec] shadow-[0_25px_80px_rgba(62,52,39,0.12)]",
    cardText: "text-[#211f1b]",
    muted: "text-[#615d55]",
    eyebrow: "text-[#777066]",
    contact: "bg-[#211f1b] text-[#f8f4ec]",
    footer: "border-[#211f1b]/15 bg-[#eee9df] text-[#777066]",
    radius: "rounded-none",
  },
  kinetic: {
    page: "bg-[#050508] text-white",
    header: "border-white/10 bg-black/55 backdrop-blur-2xl",
    headerText: "text-white",
    section: "bg-[#050508] text-white",
    alternate: "bg-[#0b0a11] text-white",
    card: "border-white/10 bg-white/[0.06] shadow-2xl shadow-fuchsia-950/20",
    cardText: "text-white",
    muted: "text-white/60",
    eyebrow: "text-white/[0.45]",
    contact: "bg-black text-white",
    footer: "border-white/10 bg-black text-white/[0.45]",
    radius: "rounded-[1.5rem]",
  },
  panorama: {
    page: "bg-[#eef2f3] text-slate-950",
    header: "border-slate-950/10 bg-[#eef2f3]/85 backdrop-blur-2xl",
    headerText: "text-slate-950",
    section: "bg-[#eef2f3] text-slate-950",
    alternate: "bg-[#dfe7e8] text-slate-950",
    card: "border-slate-950/10 bg-white/85 shadow-[0_25px_90px_rgba(15,23,42,0.12)] backdrop-blur-xl",
    cardText: "text-slate-950",
    muted: "text-slate-600",
    eyebrow: "text-slate-500",
    contact: "bg-[#102127] text-white",
    footer: "border-slate-950/10 bg-[#eef2f3] text-slate-500",
    radius: "rounded-[2.5rem]",
  },
};

type SignatureStyle = CSSProperties & {
  "--signature-primary": string;
  "--signature-secondary": string;
  "--signature-accent": string;
  "--signature-heading": string;
  "--signature-body": string;
};

export function DemoSignatureSiteRenderer({
  mode,
  design,
  inquiryToken,
  isLiveSite = false,
  packageId = "standard",
  packageName,
  className = "",
  ...input
}: DemoSignatureSiteRendererProps) {
  if (!isSignatureDemoSiteLayout(design.layout)) return null;

  const preview = getDemoSitesPreviewModel(input);
  const { companyName, colors, contact, content } = preview;
  const layout = design.layout;
  const theme = SIGNATURE_THEMES[layout];
  const fonts = getDemoFontPair(design.style);
  const packageTier = packageId === "premium" ? 3 : packageId === "basis" ? 1 : 2;
  const showLeadForm = mode === "public" && Boolean(inquiryToken);
  const showOfferSection = packageTier >= 2 && (mode === "internal" || preview.hasCustomProducts || preview.hasCustomPrices);
  const showFaqSection = packageTier >= 2;
  const showTeamSection = packageTier >= 3 && preview.employees.length > 0;
  const ctaHref = mode === "public" ? "#kontakt" : preview.contactHref;
  const oldSiteUrl = isLiveSite ? "" : preview.websiteUrl;
  const images = content.gallery_images.slice(0, 6);
  const services = content.services.length ? content.services.slice(0, 9) : ["Personlig rådgivning", "Rask avklaring", "Trygg levering"];
  const trust = content.trust_points.length ? content.trust_points.slice(0, 5) : ["Tydelig kommunikasjon", "Kort vei til svar", "Lokal kompetanse"];
  const style: SignatureStyle = {
    "--signature-primary": colors.primary,
    "--signature-secondary": colors.secondary,
    "--signature-accent": colors.accent,
    "--signature-heading": fonts.heading,
    "--signature-body": fonts.body,
  };

  return (
    <main className={`signature-site ${fonts.classNames} min-h-screen overflow-hidden ${theme.page} ${className}`} style={style}>
      <style>{`
        .signature-site { font-family: var(--signature-body); }
        .signature-site h1, .signature-site h2, .signature-site h3 { font-family: var(--signature-heading); }
        .signature-orbit { animation: signature-orbit 18s linear infinite; }
        .signature-float { animation: signature-float 7s ease-in-out infinite; }
        .signature-marquee { animation: signature-marquee 22s linear infinite; }
        .signature-image { transition: transform 900ms cubic-bezier(.2,.8,.2,1), filter 900ms cubic-bezier(.2,.8,.2,1); }
        .signature-image:hover { transform: scale(1.035); filter: saturate(1.08); }
        @keyframes signature-orbit { to { transform: rotate(360deg); } }
        @keyframes signature-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-12px); } }
        @keyframes signature-marquee { to { transform: translateX(-50%); } }
        @media (prefers-reduced-motion: reduce) {
          .signature-orbit, .signature-float, .signature-marquee { animation: none !important; }
          .signature-image { transition: none !important; }
        }
      `}</style>

      {mode === "public" && <DemoReveal />}
      {mode === "public" && packageTier >= 2 && inquiryToken && (
        <DemoChatWidget token={inquiryToken} companyName={companyName} accentColor={colors.primary} accentTextColor={colors.primaryText} />
      )}

      <SignatureHeader preview={preview} theme={theme} ctaHref={ctaHref} callToAction={content.call_to_action} layout={layout} />
      <SignatureHero layout={layout} preview={preview} services={services} trust={trust} images={images} ctaHref={ctaHref} oldSiteUrl={oldSiteUrl} mode={mode} />
      <ProofRibbon layout={layout} trust={trust} colors={colors} />

      <section id="tjenester" data-demo-reveal={mode === "public" ? "" : undefined} className={`${theme.section} px-4 py-20 md:py-28`}>
        <div className="mx-auto max-w-7xl">
          <SectionHeading layout={layout} eyebrow="Tjenester" title="Gjort enkelt å velge riktig" text={content.intro_text || content.hero_subtitle} theme={theme} />
          <ServiceGrid layout={layout} services={services} colors={colors} theme={theme} />
        </div>
      </section>

      {images.length > 1 && (
        <section id="bilder" data-demo-reveal={mode === "public" ? "" : undefined} className={`${theme.alternate} px-4 py-20 md:py-28`}>
          <div className="mx-auto max-w-7xl">
            <SectionHeading layout={layout} eyebrow="Utvalgt" title={`Et nærmere blikk på ${companyName}`} text="" theme={theme} />
            <SignatureGallery layout={layout} images={images} companyName={companyName} theme={theme} />
          </div>
        </section>
      )}

      <section id="fordeler" data-demo-reveal={mode === "public" ? "" : undefined} className={`${theme.section} px-4 py-20 md:py-28`}>
        <div className="mx-auto max-w-7xl">
          <SectionHeading layout={layout} eyebrow="Hvorfor oss" title="Trygghet før, under og etter" text="" theme={theme} />
          <TrustGrid layout={layout} trust={trust} colors={colors} theme={theme} />
        </div>
      </section>

      {showOfferSection && (
        <section id="tilbud" data-demo-reveal={mode === "public" ? "" : undefined} className={`${theme.alternate} px-4 py-20 md:py-28`}>
          <div className="mx-auto max-w-7xl">
            <SectionHeading layout={layout} eyebrow="Muligheter" title="Velg løsningen som passer" text="" theme={theme} />
            <OfferGrid layout={layout} products={content.products} prices={content.prices} colors={colors} theme={theme} />
          </div>
        </section>
      )}

      {showFaqSection && (
        <section id="faq" data-demo-reveal={mode === "public" ? "" : undefined} className={`${theme.section} px-4 py-20 md:py-28`}>
          <div className="mx-auto max-w-7xl">
            <SectionHeading layout={layout} eyebrow="FAQ" title="Svar før du trenger å spørre" text="" theme={theme} />
            <FaqGrid layout={layout} faq={content.faq.length ? content.faq : [{ question: "Hvordan kommer vi i gang?", answer: "Ta kontakt, så avklarer vi behov, pris og neste steg." }]} theme={theme} />
          </div>
        </section>
      )}

      {showTeamSection && (
        <section id="ansatte" data-demo-reveal={mode === "public" ? "" : undefined} className={`${theme.alternate} px-4 py-20 md:py-28`}>
          <div className="mx-auto max-w-7xl">
            <SectionHeading layout={layout} eyebrow="Menneskene" title={`Møt teamet hos ${companyName}`} text="" theme={theme} />
            <TeamGrid preview={preview} layout={layout} theme={theme} />
          </div>
        </section>
      )}

      <SignatureContact preview={preview} theme={theme} layout={layout} inquiryToken={inquiryToken} showLeadForm={showLeadForm} />

      <footer className={`border-t px-4 py-8 text-center text-xs ${theme.footer}`}>
        {isLiveSite ? (
          <>
            © {new Date().getFullYear()} {companyName} · Nettside levert av{" "}
            <a href="https://www.chatgenius.pro/demosites/" target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline">ChatGenius.pro</a>
          </>
        ) : (
          <>Signature 2026 demo · {packageName || "Standard"} · {layoutLabel(layout)}</>
        )}
      </footer>
    </main>
  );
}

function SignatureHeader({ preview, theme, ctaHref, callToAction, layout }: { preview: DemoSitesPreviewModel; theme: SignatureTheme; ctaHref: string; callToAction: string; layout: SignatureDemoSiteLayout }) {
  const { companyName, content, colors, contact } = preview;
  return (
    <header className={`sticky top-0 z-40 border-b ${theme.header}`}>
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4">
        <a href="#top" className={`flex min-w-0 items-center gap-3 ${theme.headerText}`}>
          {content.logo_url ? (
            <span className="flex h-11 max-w-[10rem] items-center bg-white px-3 py-1.5 shadow-sm">
              <img src={content.logo_url} alt={`${companyName} logo`} className="max-h-8 max-w-[8rem] object-contain" />
            </span>
          ) : (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center text-sm font-black" style={{ backgroundColor: layout === "atelier" ? "transparent" : colors.primary, color: layout === "atelier" ? colors.primary : colors.primaryText, border: layout === "atelier" ? `1px solid ${colors.primary}` : undefined, borderRadius: layout === "atelier" ? 0 : "1rem" }}>
              {companyName.slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="truncate text-sm font-black uppercase tracking-[0.12em] md:text-base">{companyName}</span>
        </a>
        <nav className={`hidden items-center gap-6 text-sm ${theme.muted} lg:flex`}>
          <a href="#tjenester" className="transition hover:opacity-60">Tjenester</a>
          <a href="#bilder" className="transition hover:opacity-60">Utvalgt</a>
          <a href="#fordeler" className="transition hover:opacity-60">Hvorfor oss</a>
          <a href="#faq" className="transition hover:opacity-60">FAQ</a>
        </nav>
        <div className="flex items-center gap-2">
          {contact.phone && <a href={`tel:${contact.phone}`} className={`hidden text-sm font-semibold ${theme.headerText} md:block`}>{contact.phone}</a>}
          <a href={ctaHref} className="inline-flex items-center justify-center px-4 py-2.5 text-sm font-black shadow-lg transition hover:-translate-y-0.5" style={{ backgroundColor: colors.primary, color: colors.primaryText, borderRadius: layout === "atelier" ? 0 : "999px" }}>
            {callToAction} <ArrowUpRight className="ml-2 h-4 w-4" />
          </a>
        </div>
      </div>
    </header>
  );
}

function SignatureHero({ layout, preview, services, trust, images, ctaHref, oldSiteUrl, mode }: { layout: SignatureDemoSiteLayout; preview: DemoSitesPreviewModel; services: string[]; trust: string[]; images: string[]; ctaHref: string; oldSiteUrl: string; mode: DemoSitesPreviewMode }) {
  const props = { preview, services, trust, images, ctaHref, oldSiteUrl, mode };
  switch (layout) {
    case "cinematic": return <CinematicHero {...props} />;
    case "bento": return <BentoHero {...props} />;
    case "atelier": return <AtelierHero {...props} />;
    case "kinetic": return <KineticHero {...props} />;
    case "panorama": return <PanoramaHero {...props} />;
  }
  return <CinematicHero {...props} />;
}

type HeroProps = { preview: DemoSitesPreviewModel; services: string[]; trust: string[]; images: string[]; ctaHref: string; oldSiteUrl: string; mode: DemoSitesPreviewMode };

function CinematicHero({ preview, services, trust, images, ctaHref, oldSiteUrl, mode }: HeroProps) {
  const { companyName, content, colors } = preview;
  const heroImage = images[0];
  return (
    <section id="top" className="relative flex min-h-[88vh] items-end overflow-hidden bg-black">
      {heroImage ? <img src={heroImage} alt={`${companyName} hovedbilde`} className="signature-image absolute inset-0 h-full w-full object-cover" /> : <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 72% 30%, ${withPreviewAlpha(colors.primary, "66")}, transparent 36%), #07090d` }} />}
      <div className="absolute inset-0 bg-gradient-to-r from-black via-black/65 to-black/15" />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/25" />
      <div className="pointer-events-none absolute -right-24 top-24 h-80 w-80 rounded-full border border-white/15 signature-orbit"><div className="absolute left-1/2 top-0 h-4 w-4 -translate-x-1/2 rounded-full" style={{ backgroundColor: colors.accent }} /></div>
      <div className="relative z-10 mx-auto grid w-full max-w-7xl gap-12 px-4 pb-14 pt-32 lg:grid-cols-[1.2fr_0.8fr] lg:items-end lg:pb-20">
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/30 px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] text-white/80 backdrop-blur-xl"><Sparkles className="h-4 w-4" style={{ color: colors.accent }} />{mode === "internal" ? "Intern preview" : "Signature experience"}</div>
          <h1 className="max-w-5xl text-5xl font-black leading-[0.92] tracking-[-0.05em] text-white md:text-7xl xl:text-[7.5rem]">{content.hero_title}</h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-white/75 md:text-2xl">{content.hero_subtitle}</p>
          <HeroActions ctaHref={ctaHref} oldSiteUrl={oldSiteUrl} label={content.call_to_action} colors={colors} dark square={false} />
        </div>
        <div className="signature-float border border-white/15 bg-white/[0.09] p-6 shadow-2xl shadow-black/30 backdrop-blur-2xl md:p-8" style={{ borderRadius: "2rem" }}>
          <div className="flex items-center justify-between border-b border-white/10 pb-5"><div><p className="text-xs font-bold uppercase tracking-[0.24em] text-white/40">Nå</p><p className="mt-2 text-xl font-black text-white">{services[0]}</p></div><span className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/10"><ArrowUpRight className="h-5 w-5" style={{ color: colors.accent }} /></span></div>
          <div className="mt-5 space-y-4">{trust.slice(0, 3).map((item, index) => <div key={item} className="flex items-start gap-4"><span className="text-xs font-black text-white/[0.35]">0{index + 1}</span><p className="text-sm leading-6 text-white/75">{item}</p></div>)}</div>
        </div>
      </div>
    </section>
  );
}

function BentoHero({ preview, services, trust, images, ctaHref, oldSiteUrl }: HeroProps) {
  const { companyName, content, colors } = preview;
  return (
    <section id="top" className="relative px-4 py-10 md:py-16">
      <div className="pointer-events-none absolute inset-0 opacity-50" style={{ backgroundImage: `radial-gradient(${withPreviewAlpha(colors.primary, "28")} 1px, transparent 1px)`, backgroundSize: "24px 24px" }} />
      <div className="relative mx-auto grid max-w-7xl gap-4 lg:grid-cols-12 lg:grid-rows-[minmax(220px,auto)_minmax(220px,auto)]">
        <div className="rounded-[2.5rem] bg-[#121815] p-7 text-white shadow-2xl lg:col-span-7 lg:row-span-2 lg:p-12">
          <div className="flex items-center justify-between"><span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.2em] text-white/65"><Layers3 className="h-4 w-4" /> Bento 2026</span><span className="text-xs font-semibold text-white/40">01 / 05</span></div>
          <h1 className="mt-14 text-5xl font-black leading-[0.94] tracking-[-0.045em] md:text-7xl">{content.hero_title}</h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-white/70">{content.hero_subtitle}</p>
          <HeroActions ctaHref={ctaHref} oldSiteUrl={oldSiteUrl} label={content.call_to_action} colors={colors} dark square={false} />
        </div>
        <div className="relative min-h-[260px] overflow-hidden rounded-[2.5rem] bg-slate-200 lg:col-span-5">
          {images[0] ? <img src={images[0]} alt={`${companyName} hovedbilde`} className="signature-image absolute inset-0 h-full w-full object-cover" /> : <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})` }} />}
          <div className="absolute inset-x-5 bottom-5 rounded-[1.5rem] border border-white/25 bg-white/85 p-4 text-slate-950 shadow-xl backdrop-blur-xl"><div className="flex items-center justify-between gap-4"><p className="font-black">{services[0]}</p><ArrowUpRight className="h-5 w-5" /></div></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-5">
          <div className="rounded-[2.5rem] p-6 shadow-xl" style={{ backgroundColor: colors.primary, color: colors.primaryText }}><p className="text-xs font-bold uppercase tracking-[0.2em] opacity-60">Direkte</p><p className="mt-10 text-2xl font-black">{services[1] || trust[0]}</p><MousePointer2 className="mt-6 h-6 w-6" /></div>
          <div className="rounded-[2.5rem] border border-slate-950/10 bg-white p-6 shadow-xl"><Quote className="h-6 w-6" style={{ color: colors.primary }} /><p className="mt-8 text-base font-bold leading-7 text-slate-800">{trust[0]}</p></div>
        </div>
      </div>
    </section>
  );
}

function AtelierHero({ preview, services, images, ctaHref, oldSiteUrl }: HeroProps) {
  const { companyName, content, colors } = preview;
  return (
    <section id="top" className="relative overflow-hidden border-b border-[#211f1b]/15 px-4 py-14 md:py-20">
      <div className="pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 text-[11rem] font-medium uppercase leading-none tracking-[-0.08em] text-[#211f1b]/[0.035] xl:block">Atelier</div>
      <div className="relative mx-auto grid max-w-7xl gap-14 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
        <div className="order-2 lg:order-1">
          <div className="flex items-center gap-4 text-xs font-semibold uppercase tracking-[0.32em] text-[#777066]"><span className="h-px w-12 bg-[#211f1b]/35" />Curated business presence</div>
          <h1 className="mt-9 text-5xl font-medium leading-[0.98] tracking-[-0.045em] text-[#211f1b] md:text-7xl xl:text-[6.5rem]">{content.hero_title}</h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-[#615d55]">{content.hero_subtitle}</p>
          <div className="mt-10 flex items-center gap-8 border-y border-[#211f1b]/15 py-5"><div><p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#777066]">Signatur</p><p className="mt-2 font-semibold text-[#211f1b]">{services[0]}</p></div><div className="h-10 w-px bg-[#211f1b]/15" /><div><p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#777066]">Studio</p><p className="mt-2 font-semibold text-[#211f1b]">{companyName}</p></div></div>
          <HeroActions ctaHref={ctaHref} oldSiteUrl={oldSiteUrl} label={content.call_to_action} colors={colors} dark={false} square />
        </div>
        <div className="order-1 relative min-h-[560px] lg:order-2">
          <div className="absolute left-0 top-0 h-[76%] w-[72%] overflow-hidden bg-[#d8d0c2] shadow-2xl">{images[0] ? <img src={images[0]} alt={`${companyName} bilde 1`} className="signature-image h-full w-full object-cover" /> : <div className="h-full w-full" style={{ backgroundColor: colors.primary }} />}</div>
          <div className="absolute bottom-0 right-0 h-[54%] w-[55%] overflow-hidden border-[10px] border-[#eee9df] bg-[#c8c0b2] shadow-2xl">{images[1] ? <img src={images[1]} alt={`${companyName} bilde 2`} className="signature-image h-full w-full object-cover" /> : <div className="h-full w-full" style={{ backgroundColor: colors.secondary }} />}</div>
          <div className="absolute right-[4%] top-[8%] flex h-28 w-28 items-center justify-center rounded-full border border-[#211f1b]/25 bg-[#eee9df]/90 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-[#211f1b] shadow-xl backdrop-blur signature-orbit">Made to<br />be noticed</div>
        </div>
      </div>
    </section>
  );
}

function KineticHero({ preview, services, trust, images, ctaHref, oldSiteUrl }: HeroProps) {
  const { companyName, content, colors } = preview;
  const words = [...services.slice(0, 4), ...trust.slice(0, 2)];
  return (
    <section id="top" className="relative min-h-[86vh] overflow-hidden px-4 py-14">
      <div className="pointer-events-none absolute -left-24 top-20 h-96 w-96 rounded-full blur-3xl" style={{ backgroundColor: withPreviewAlpha(colors.primary, "55") }} />
      <div className="pointer-events-none absolute -right-16 bottom-8 h-[28rem] w-[28rem] rounded-full blur-3xl" style={{ backgroundColor: withPreviewAlpha(colors.accent, "44") }} />
      <div className="signature-orbit pointer-events-none absolute right-[8%] top-[14%] h-52 w-52 rounded-full border border-white/15"><div className="absolute -left-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full" style={{ backgroundColor: colors.primary }} /><div className="absolute -right-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full" style={{ backgroundColor: colors.accent }} /></div>
      <div className="relative mx-auto max-w-7xl">
        <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-5 text-xs font-bold uppercase tracking-[0.25em] text-white/[0.45]"><span>Digital presence / 2026</span><span>{companyName}</span></div>
        <div className="grid gap-12 pt-12 lg:grid-cols-[1fr_340px] lg:items-end">
          <div><div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-white/70"><Zap className="h-4 w-4" style={{ color: colors.accent }} /> Kinetic</div><h1 className="mt-8 max-w-6xl text-5xl font-black uppercase leading-[0.83] tracking-[-0.065em] text-white md:text-8xl xl:text-[9rem]">{content.hero_title}</h1><p className="mt-9 max-w-2xl text-lg leading-8 text-white/65 md:text-xl">{content.hero_subtitle}</p><HeroActions ctaHref={ctaHref} oldSiteUrl={oldSiteUrl} label={content.call_to_action} colors={colors} dark square={false} /></div>
          <div className="relative min-h-[360px] overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.055] p-4 shadow-2xl shadow-fuchsia-950/20 backdrop-blur-xl">{images[0] ? <img src={images[0]} alt={`${companyName} hovedbilde`} className="signature-image h-full min-h-[330px] w-full rounded-[1.4rem] object-cover opacity-85" /> : <div className="h-full min-h-[330px] rounded-[1.4rem]" style={{ background: `linear-gradient(145deg, ${colors.primary}, ${colors.secondary})` }} />}<div className="absolute inset-x-8 bottom-8 rounded-2xl border border-white/15 bg-black/50 p-4 backdrop-blur-xl"><p className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">Featured</p><p className="mt-2 font-black text-white">{services[0]}</p></div></div>
        </div>
      </div>
      <div className="relative mt-14 overflow-hidden border-y border-white/10 py-4"><div className="signature-marquee flex w-max gap-10 whitespace-nowrap text-sm font-black uppercase tracking-[0.22em] text-white/[0.45]">{[...words, ...words].map((word, index) => <span key={`${word}-${index}`} className="inline-flex items-center gap-10">{word} <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: index % 2 ? colors.accent : colors.primary }} /></span>)}</div></div>
    </section>
  );
}

function PanoramaHero({ preview, services, trust, images, ctaHref, oldSiteUrl }: HeroProps) {
  const { companyName, content, colors } = preview;
  return (
    <section id="top" className="px-4 pb-12 pt-8 md:pb-20 md:pt-12">
      <div className="relative mx-auto min-h-[78vh] max-w-[92rem] overflow-hidden rounded-[3rem] bg-slate-900 shadow-[0_40px_120px_rgba(15,23,42,0.24)]">
        {images[0] ? <img src={images[0]} alt={`${companyName} panorama`} className="signature-image absolute inset-0 h-full w-full object-cover" /> : <div className="absolute inset-0" style={{ background: `linear-gradient(125deg, ${colors.secondary}, ${colors.primary})` }} />}
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-950/50 to-transparent" />
        <div className="relative z-10 flex min-h-[78vh] flex-col justify-between p-7 md:p-12 lg:p-16">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.25em] text-white/[0.55]"><span>Panorama / Signature 2026</span><span className="hidden md:block">{companyName}</span></div>
          <div className="grid gap-10 lg:grid-cols-[1fr_360px] lg:items-end"><div><h1 className="max-w-5xl text-5xl font-black leading-[0.92] tracking-[-0.05em] text-white md:text-7xl xl:text-[7rem]">{content.hero_title}</h1><p className="mt-7 max-w-2xl text-lg leading-8 text-white/75 md:text-xl">{content.hero_subtitle}</p><HeroActions ctaHref={ctaHref} oldSiteUrl={oldSiteUrl} label={content.call_to_action} colors={colors} dark square={false} /></div><div className="space-y-3">{services.slice(0, 3).map((service, index) => <a key={service} href="#kontakt" className="group flex items-center justify-between rounded-[1.4rem] border border-white/15 bg-white/[0.1] p-4 text-white shadow-xl backdrop-blur-xl transition hover:bg-white/[0.18]"><div className="flex items-center gap-4"><span className="text-xs font-black text-white/40">0{index + 1}</span><span className="font-bold">{service}</span></div><ChevronRight className="h-5 w-5 transition group-hover:translate-x-1" style={{ color: index === 0 ? colors.accent : "white" }} /></a>)}<div className="mt-5 flex items-center gap-3 rounded-[1.4rem] border border-white/10 bg-black/25 p-4 text-sm text-white/65 backdrop-blur"><BadgeCheck className="h-5 w-5" style={{ color: colors.accent }} />{trust[0]}</div></div></div>
        </div>
      </div>
    </section>
  );
}

function HeroActions({ ctaHref, oldSiteUrl, label, colors, dark, square }: { ctaHref: string; oldSiteUrl: string; label: string; colors: DemoSitesPreviewModel["colors"]; dark: boolean; square: boolean }) {
  return <div className="mt-9 flex flex-col gap-3 sm:flex-row"><a href={ctaHref} className="inline-flex items-center justify-center px-7 py-4 text-sm font-black shadow-xl transition hover:-translate-y-0.5" style={{ backgroundColor: colors.primary, color: colors.primaryText, borderRadius: square ? 0 : "999px" }}>{label} <ArrowRight className="ml-2 h-4 w-4" /></a>{oldSiteUrl && <a href={oldSiteUrl} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center justify-center border px-7 py-4 text-sm font-bold transition ${dark ? "border-white/20 bg-white/[0.07] text-white hover:bg-white/[0.12]" : "border-current bg-transparent hover:bg-black/[0.04]"}`} style={{ borderRadius: square ? 0 : "999px" }}>Eksisterende nettside <ExternalLink className="ml-2 h-4 w-4" /></a>}</div>;
}

function ProofRibbon({ layout, trust, colors }: { layout: SignatureDemoSiteLayout; trust: string[]; colors: DemoSitesPreviewModel["colors"] }) {
  const dark = layout === "cinematic" || layout === "kinetic";
  return <section className={dark ? "border-y border-white/10 bg-black/45 text-white" : "border-y border-slate-950/10 bg-white/35 text-slate-950"}><div className="mx-auto grid max-w-7xl grid-cols-1 gap-px px-4 sm:grid-cols-2 lg:grid-cols-4">{trust.slice(0, 4).map((item, index) => <div key={item} className={`flex items-center gap-3 py-5 ${index > 0 ? dark ? "sm:border-l sm:border-white/10 sm:pl-6" : "sm:border-l sm:border-slate-950/10 sm:pl-6" : ""}`}><BadgeCheck className="h-5 w-5 shrink-0" style={{ color: colors.primary }} /><span className={dark ? "text-sm font-semibold text-white/70" : "text-sm font-semibold text-slate-700"}>{item}</span></div>)}</div></section>;
}

function SectionHeading({ layout, eyebrow, title, text, theme }: { layout: SignatureDemoSiteLayout; eyebrow: string; title: string; text: string; theme: SignatureTheme }) {
  return <div className={layout === "atelier" ? "grid gap-5 border-t border-current/15 pt-5 md:grid-cols-[220px_1fr]" : "max-w-4xl"}><div className={`text-xs font-bold uppercase tracking-[0.28em] ${theme.eyebrow}`}>{eyebrow}</div><div><h2 className={`text-4xl font-black leading-[0.98] tracking-[-0.04em] md:text-6xl ${layout === "atelier" ? "font-medium" : ""}`}>{title}</h2>{text && <p className={`mt-5 max-w-2xl text-base leading-8 md:text-lg ${theme.muted}`}>{text}</p>}</div></div>;
}

function ServiceGrid({ layout, services, colors, theme }: { layout: SignatureDemoSiteLayout; services: string[]; colors: DemoSitesPreviewModel["colors"]; theme: SignatureTheme }) {
  if (layout === "atelier") return <div className="mt-14 border-t border-current/15">{services.map((service, index) => <a key={service} href="#kontakt" className="group grid items-center gap-4 border-b border-current/15 py-6 transition hover:pl-3 md:grid-cols-[80px_1fr_auto]"><span className={`text-xs font-bold ${theme.eyebrow}`}>0{index + 1}</span><h3 className="text-2xl font-medium md:text-4xl">{service}</h3><ArrowUpRight className="h-6 w-6 transition group-hover:rotate-45" style={{ color: colors.primary }} /></a>)}</div>;
  const bentoSpan = layout === "bento";
  return <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{services.map((service, index) => <a key={service} href="#kontakt" className={`${theme.card} ${theme.cardText} ${theme.radius} group border p-6 transition duration-500 hover:-translate-y-1 ${bentoSpan && index === 0 ? "md:col-span-2 lg:col-span-2" : ""}`}><div className="flex items-center justify-between"><span className={`text-xs font-black uppercase tracking-[0.22em] ${theme.eyebrow}`}>0{index + 1}</span><span className="flex h-11 w-11 items-center justify-center rounded-full border border-current/10 transition group-hover:scale-110" style={{ color: colors.primary }}><ArrowUpRight className="h-5 w-5" /></span></div><h3 className={`${bentoSpan && index === 0 ? "max-w-xl text-4xl md:text-5xl" : "text-2xl"} mt-12 font-black leading-tight`}>{service}</h3><p className={`mt-4 max-w-md text-sm leading-7 ${theme.muted}`}>Fortell oss hva du trenger, så får du en tydelig anbefaling og et konkret neste steg.</p></a>)}</div>;
}

function SignatureGallery({ layout, images, companyName, theme }: { layout: SignatureDemoSiteLayout; images: string[]; companyName: string; theme: SignatureTheme }) {
  if (layout === "panorama" || layout === "cinematic") return <div className="mt-14 grid gap-4 lg:grid-cols-[1.4fr_0.6fr]"><img src={images[0]} alt={`${companyName} bilde 1`} className={`signature-image h-[34rem] w-full object-cover ${theme.radius}`} /><div className="grid gap-4">{images.slice(1, 3).map((image, index) => <img key={image} src={image} alt={`${companyName} bilde ${index + 2}`} className={`signature-image h-[16.5rem] w-full object-cover ${theme.radius}`} />)}</div></div>;
  if (layout === "atelier") return <div className="mt-14 grid grid-cols-12 gap-4 md:gap-7">{images.slice(0, 4).map((image, index) => <img key={image} src={image} alt={`${companyName} bilde ${index + 1}`} className={`signature-image object-cover ${index === 0 ? "col-span-8 h-[34rem]" : index === 1 ? "col-span-4 mt-24 h-[27rem]" : index === 2 ? "col-span-5 h-[24rem]" : "col-span-7 h-[30rem]"}`} />)}</div>;
  return <div className="mt-14 grid auto-rows-[16rem] gap-4 md:grid-cols-2 lg:grid-cols-3">{images.slice(0, 5).map((image, index) => <img key={image} src={image} alt={`${companyName} bilde ${index + 1}`} className={`signature-image h-full w-full object-cover ${theme.radius} ${index === 0 ? "md:row-span-2" : ""} ${layout === "bento" && index === 3 ? "lg:col-span-2" : ""}`} />)}</div>;
}

function TrustGrid({ layout, trust, colors, theme }: { layout: SignatureDemoSiteLayout; trust: string[]; colors: DemoSitesPreviewModel["colors"]; theme: SignatureTheme }) {
  return <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-4">{trust.slice(0, 4).map((item, index) => <div key={item} className={`${theme.card} ${theme.radius} border p-6`}><div className="flex items-center justify-between"><Star className="h-5 w-5" style={{ color: colors.accent }} /><span className={`text-xs font-black ${theme.eyebrow}`}>0{index + 1}</span></div><p className={`${layout === "atelier" ? "font-medium" : "font-black"} mt-10 text-xl leading-8`}>{item}</p></div>)}</div>;
}

function OfferGrid({ layout, products, prices, colors, theme }: { layout: SignatureDemoSiteLayout; products: string[]; prices: string[]; colors: DemoSitesPreviewModel["colors"]; theme: SignatureTheme }) {
  const productItems = products.length ? products : ["Skreddersydd løsning", "Personlig oppfølging"];
  const priceItems = prices.length ? prices : ["Pris etter behov", "Be om et konkret tilbud"];
  return <div className="mt-14 grid gap-5 lg:grid-cols-2"><OfferCard title="Løsninger" items={productItems} colors={colors} theme={theme} square={layout === "atelier"} /><OfferCard title="Pris og pakker" items={priceItems} colors={colors} theme={theme} square={layout === "atelier"} /></div>;
}

function OfferCard({ title, items, colors, theme, square }: { title: string; items: string[]; colors: DemoSitesPreviewModel["colors"]; theme: SignatureTheme; square: boolean }) {
  return <div className={`${theme.card} ${square ? "rounded-none" : theme.radius} border p-7 md:p-9`}><h3 className="text-3xl font-black">{title}</h3><div className="mt-8 space-y-3">{items.slice(0, 8).map((item) => <div key={item} className="flex items-start gap-3 border-t border-current/10 py-4"><span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: withPreviewAlpha(colors.primary, "22"), color: colors.primary }}><Check className="h-3.5 w-3.5" /></span><span className={`text-sm leading-6 ${theme.muted}`}>{item}</span></div>)}</div></div>;
}

function FaqGrid({ layout, faq, theme }: { layout: SignatureDemoSiteLayout; faq: Array<{ question: string; answer: string }>; theme: SignatureTheme }) {
  return <div className={`mt-14 grid gap-4 ${layout === "atelier" ? "lg:grid-cols-2" : "md:grid-cols-2 lg:grid-cols-3"}`}>{faq.slice(0, 6).map((item, index) => <div key={`${item.question}-${index}`} className={`${theme.card} ${layout === "atelier" ? "rounded-none" : theme.radius} border p-6`}><span className={`text-xs font-black uppercase tracking-[0.2em] ${theme.eyebrow}`}>0{index + 1}</span><h3 className="mt-6 text-xl font-black leading-7">{item.question}</h3><p className={`mt-4 text-sm leading-7 ${theme.muted}`}>{item.answer}</p></div>)}</div>;
}

function TeamGrid({ preview, layout, theme }: { preview: DemoSitesPreviewModel; layout: SignatureDemoSiteLayout; theme: SignatureTheme }) {
  return <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{preview.employees.map((person) => <div key={`${person.name}-${person.title}`} className={`${theme.card} ${layout === "atelier" ? "rounded-none" : theme.radius} border p-5`}>{person.photo ? <img src={person.photo} alt={person.name} className={`h-72 w-full object-cover ${layout === "atelier" ? "" : "rounded-[1.4rem]"}`} /> : <div className={`flex h-72 items-center justify-center text-5xl font-black ${layout === "atelier" ? "" : "rounded-[1.4rem]"}`} style={{ backgroundColor: withPreviewAlpha(preview.colors.primary, "20"), color: preview.colors.primary }}>{person.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</div>}<h3 className="mt-5 text-xl font-black">{person.name}</h3><p className={`mt-1 text-sm ${theme.muted}`}>{person.title}</p></div>)}</div>;
}

function SignatureContact({ preview, theme, layout, inquiryToken, showLeadForm }: { preview: DemoSitesPreviewModel; theme: SignatureTheme; layout: SignatureDemoSiteLayout; inquiryToken?: string; showLeadForm: boolean }) {
  const { companyName, contact, content, colors } = preview;
  return <section id="kontakt" data-demo-reveal="" className={`${theme.contact} px-4 py-20 md:py-28`}><div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start"><div><div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.26em] text-white/[0.45]"><MessageCircle className="h-4 w-4" style={{ color: colors.accent }} /> Kontakt</div><h2 className={`${layout === "atelier" ? "font-medium" : "font-black"} mt-7 text-4xl leading-[0.98] tracking-[-0.04em] md:text-6xl`}>La oss finne riktig neste steg</h2><p className="mt-6 max-w-xl text-base leading-8 text-white/65">{content.contact_text || `Fortell kort hva du trenger fra ${companyName}, så svarer vi med en tydelig anbefaling.`}</p><div className="mt-9 space-y-3"><ContactItem icon={<Phone className="h-5 w-5" />} label="Telefon" value={contact.phone} href={contact.phone ? `tel:${contact.phone}` : undefined} /><ContactItem icon={<Mail className="h-5 w-5" />} label="E-post" value={contact.email} href={contact.email ? `mailto:${contact.email}` : undefined} /><ContactItem icon={<MapPin className="h-5 w-5" />} label="Adresse" value={contact.address} /></div></div>{showLeadForm ? <DemoLeadForm token={inquiryToken || ""} companyName={companyName} accentColor={colors.primary} accentTextColor={colors.primaryText} /> : <div className={`border border-white/10 bg-white/[0.07] p-6 shadow-2xl backdrop-blur-xl ${layout === "atelier" ? "rounded-none" : "rounded-[2rem]"}`}><div className="flex items-center justify-between border-b border-white/10 pb-5"><div><p className="text-xs font-bold uppercase tracking-[0.22em] text-white/40">Direkte forespørsel</p><p className="mt-2 text-xl font-black">Hva kan vi hjelpe med?</p></div><span className="flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: colors.primary, color: colors.primaryText }}><ArrowUpRight className="h-5 w-5" /></span></div><div className="mt-6 space-y-3">{preview.content.services.slice(0, 3).map((service) => <a key={service} href={preview.contactHref} className="flex items-center justify-between border border-white/10 bg-white/[0.04] p-4 text-sm font-semibold text-white/80 transition hover:bg-white/[0.09]">{service} <ChevronRight className="h-4 w-4" /></a>)}</div><a href={preview.contactHref} className="mt-6 inline-flex w-full items-center justify-center px-6 py-4 text-sm font-black" style={{ backgroundColor: colors.primary, color: colors.primaryText, borderRadius: layout === "atelier" ? 0 : "999px" }}>{content.call_to_action} <ArrowRight className="ml-2 h-4 w-4" /></a></div>}</div></section>;
}

function ContactItem({ icon, label, value, href }: { icon: ReactNode; label: string; value: string; href?: string }) {
  const body = <><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white">{icon}</span><span><span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-white/[0.35]">{label}</span><span className="mt-1 block text-sm font-semibold text-white/80">{value || `Mangler ${label.toLowerCase()}`}</span></span></>;
  return href ? <a href={href} className="flex items-center gap-4">{body}</a> : <div className="flex items-center gap-4">{body}</div>;
}

function layoutLabel(layout: SignatureDemoSiteLayout) {
  switch (layout) {
    case "cinematic": return "Cinematic";
    case "bento": return "Bento";
    case "atelier": return "Atelier";
    case "kinetic": return "Kinetic";
    case "panorama": return "Panorama";
  }
  return "Signature";
}
