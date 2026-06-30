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
      ? `min-h-screen bg-slate-50 text-slate-950 ${className}`
      : `overflow-hidden rounded-lg border border-slate-700 bg-slate-50 text-slate-950 shadow-xl ${className}`;
  const maxWidthClass = mode === "public" ? "mx-auto max-w-6xl" : "max-w-none";
  const heroPaddingClass = mode === "public" ? "px-4 py-12 lg:py-16" : "p-4 lg:p-5";
  const heroTitleClass = mode === "public" ? "max-w-3xl text-4xl font-black leading-tight md:text-6xl" : "text-3xl font-black leading-tight md:text-4xl";
  const heroGridClass =
    mode === "public"
      ? "grid min-h-[420px] grid-cols-[1fr_0.72fr] gap-3"
      : "grid min-h-[260px] grid-cols-1 gap-3 sm:grid-cols-[1fr_0.72fr]";
  const heroImageClass =
    mode === "public"
      ? "h-full min-h-[420px] w-full rounded-lg object-cover"
      : "h-full min-h-[260px] w-full rounded-lg object-cover";
  const secondaryImageClass =
    mode === "public"
      ? "h-full min-h-0 w-full rounded-lg object-cover"
      : "h-40 min-h-0 w-full rounded-lg object-cover";
  const Root = mode === "public" ? "main" : "div";

  return (
    <Root className={rootClass} style={rootStyle}>
      <header className="border-b border-slate-200 bg-white">
        <div className={`${maxWidthClass} flex items-center justify-between gap-4 px-4 py-4`}>
          <a href="#top" className="flex min-w-0 items-center gap-3">
            {content.logo_url ? (
              <span className="flex h-12 max-w-[11rem] shrink-0 items-center rounded-lg border border-slate-200 bg-white px-2 py-1">
                <img src={content.logo_url} alt={`${companyName} logo`} className="max-h-10 w-auto max-w-[9.5rem] object-contain" />
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
              <a href="#tilbud" className="hover:text-slate-950">Tilbud</a>
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
          {content.logo_url && mode === "public" && (
            <div className="mb-5 flex">
              <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <img src={content.logo_url} alt={`${companyName} logo`} className="max-h-16 w-auto max-w-[14rem] object-contain" />
              </div>
            </div>
          )}
          <div className="mb-5 inline-flex w-fit items-center rounded-lg border px-3 py-1 text-xs font-semibold" style={{ borderColor: colors.primary, backgroundColor: withPreviewAlpha(colors.primary, "14"), color: colors.secondary }}>
            <Sparkles className="mr-2 h-3.5 w-3.5" /> {mode === "internal" ? "Intern preview" : content.template_name}
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
          {mode === "public" && preview.isImported && (
            <p className="mt-4 max-w-2xl text-xs font-medium text-slate-500">
              Demo basert på offentlig informasjon fra nettsiden.
            </p>
          )}
        </div>

        <div className={heroGridClass}>
          <PreviewImage image={images[0]} alt={`${companyName} hovedbilde`} className={heroImageClass} color={colors.secondary} />
          <div className="grid gap-3">
            <PreviewImage image={images[1] || images[0]} alt={`${companyName} detaljbilde`} className={secondaryImageClass} color={colors.primary} />
            <div className="flex flex-col justify-between rounded-lg p-5 text-white" style={{ backgroundColor: colors.secondary }}>
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: colors.accent }}>
                  <ShieldCheck className="h-4 w-4" /> {mode === "internal" ? "Klar til kvalitetssjekk" : "Klar demo"}
                </div>
                <p className="mt-4 text-sm leading-6 text-white/80">
                  {mode === "internal" ? "Innhold, bilder og farger speiler import-reviewen akkurat nå." : "Innhold, farger og seksjoner kan justeres før publisering."}
                </p>
              </div>
              <div className="mt-5 text-xs text-white/60">
                {mode === "internal" ? `${images.length} bilde${images.length === 1 ? "" : "r"} i preview` : `Preview utløper ${formatPreviewDate(preview.expiresAt)}`}
              </div>
            </div>
          </div>
        </div>
      </section>

      {images.length > 0 && (
        <section id="bilder" className="bg-white py-12">
          <div className={`${maxWidthClass} px-4`}>
            <SectionIntro eyebrow="Bilder" title={mode === "internal" ? "Visuell profil" : "Visuell profil fra demoen"} text={preview.isImported ? "Bilder fra nettsideanalysen vises tidlig, slik at previewen raskt føles som kundens egen." : "Bildene kan byttes med kundens egne foto, logo og profilbilder i oppsettet."} />
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
          <SectionIntro eyebrow="Tjenester" title={`Dette kan ${companyName} hjelpe med`} text={fullPreview ? "Kundene får rask oversikt over hva bedriften tilbyr, med tydelige veier videre til pris eller kontakt." : "Kompakt preview viser de tre første tjenestene. Full preview viser alle."} />
          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
            {(services.length ? services : [DEMO_SITES_PREVIEW_PLACEHOLDERS.service]).map((service, index) => (
              <FeatureCard key={`${service}-${index}`} title={service} color={colors.primary} placeholder={!services.length} />
            ))}
          </div>
        </div>
      </section>

      {fullPreview && (
        <>
          <section id="fordeler" className="py-16 text-white" style={{ backgroundColor: colors.secondary }}>
            <div className={`${maxWidthClass} px-4`}>
              <SectionIntro eyebrow="Hvorfor velge oss" title="Tryggere valg før kunden tar kontakt" text="Denne delen løfter frem bevis, arbeidsform og forventninger som gjør beslutningen enklere." inverted />
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
            <SectionIntro eyebrow="Produkter og priser" title="Enkelt å forstå neste steg" text="Produkter, pakker og prisnivå kan vises som konkrete valg eller som tydelige prisforespørsler." />
            <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ListCard title="Produkter / pakker" items={content.products} emptyText={DEMO_SITES_PREVIEW_PLACEHOLDERS.product} color={colors.primary} />
              <ListCard title="Priser / prisforespørsel" items={content.prices} emptyText={DEMO_SITES_PREVIEW_PLACEHOLDERS.price} color={colors.primary} />
            </div>
          </section>

          <section id="faq" className={`${maxWidthClass} px-4 py-16`}>
            <SectionIntro eyebrow="FAQ" title="Svar på vanlige spørsmål" text="Ofte stilte spørsmål reduserer friksjon og gjør flere henvendelser klare nok til å følge opp." />
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
                <h2 className="mt-5 text-3xl font-black leading-tight md:text-5xl">Klar for flere riktige henvendelser?</h2>
                <p className="mt-5 max-w-xl text-base leading-8 text-slate-300">{content.contact_text}</p>
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
                  <ChatBubble align="right" color={withPreviewAlpha(colors.primary, "20")}>{mode === "internal" ? "Hva er neste steg?" : "Hva koster dette vanligvis?"}</ChatBubble>
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

function FeatureCard({ title, color, placeholder = false }: { title: string; color: string; placeholder?: boolean }) {
  return (
    <div className={placeholder ? "rounded-lg border border-dashed border-slate-300 bg-slate-100 p-6 text-slate-500" : "rounded-lg border border-slate-200 bg-slate-50 p-6"}>
      <CheckCircle className="h-6 w-6" style={{ color }} />
      <h3 className="mt-4 font-bold text-slate-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">Kort, tydelig tekst kan tilpasses med kundens egne ord før siden publiseres.</p>
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
