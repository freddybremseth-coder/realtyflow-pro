export type RealtyFlowAppId = "sales" | "marketing" | "content" | "finance";
export type RealtyFlowNavigationSectionId = "workspace" | RealtyFlowAppId | "platform";

export type RealtyFlowAppLink = {
  label: string;
  href: string;
  description: string;
};

export type RealtyFlowAppDefinition = {
  id: RealtyFlowAppId;
  label: string;
  navLabel: string;
  href: string;
  icon: string;
  description: string;
  promise: string;
  links: RealtyFlowAppLink[];
};

export const REALTYFLOW_APPS: RealtyFlowAppDefinition[] = [
  {
    id: "sales",
    label: "Sales",
    navLabel: "Sales · kunder & eiendom",
    href: "/sales",
    icon: "Users",
    description: "Leads, CRM, eiendommer, visninger, closing, Care og kundeoppfølging i én salgsflate.",
    promise: "Fra første signal til gjennomført salg og videre oppfølging.",
    links: [
      { label: "CRM & kunder", href: "/customers", description: "Leads, kundekort, pipeline og oppfølging." },
      { label: "Eiendommer", href: "/inventory", description: "Boliger, Property 360, områder og dokumentasjon." },
      { label: "AI Lead Inbox", href: "/lead-intelligence", description: "Kvalifiser og arbeid videre med nye henvendelser." },
      { label: "Closing", href: "/closing", description: "Fra reservasjon og kontrakt til nøkkel." },
      { label: "Care", href: "/care", description: "Kunder, eiendommer, rapporter og løpende service." },
    ],
  },
  {
    id: "marketing",
    label: "Marketing",
    navLabel: "Marketing · vekst & distribusjon",
    href: "/marketing",
    icon: "Megaphone",
    description: "Kampanjer, SEO/AEO/GEO, sosiale kanaler, e-post, annonser og måling samlet rundt etterspørsel.",
    promise: "Skap, distribuer og mål etterspørsel på tvers av merkevarer og kanaler.",
    links: [
      { label: "Growth Hub", href: "/growth-hub", description: "Vekstplan, signaler og prioriteringer." },
      { label: "Social Automation", href: "/social-automation", description: "Facebook, Instagram og kanalautomatisering." },
      { label: "E-post & Reach", href: "/reach", description: "Nyhetsbrev, kampanjer og abonnentoppfølging." },
      { label: "Annonser", href: "/ad-campaigns", description: "Kampanjer, brief og annonsearbeid." },
      { label: "Analytics", href: "/analytics", description: "Effekt, trafikk, attribusjon og læring." },
    ],
  },
  {
    id: "content",
    label: "Content",
    navLabel: "Content · studio & publisering",
    href: "/content",
    icon: "Clapperboard",
    description: "Artikler, bilder, Reels, YouTube, bøker og publiserbart materiale i én produksjonsflate.",
    promise: "Lag innhold én gang, gjenbruk det riktig og send det videre til Marketing.",
    links: [
      { label: "Content Studio", href: "/content-studio", description: "Artikler, guider og brand-innhold." },
      { label: "Content Hub", href: "/content-hub", description: "Samlet bibliotek for gjenbrukbart innhold." },
      { label: "AI Media Studio", href: "/media-studio", description: "Video, media og produksjonsverktøy." },
      { label: "YouTube Studio", href: "/youtube-studio", description: "Video og Shorts fra ferdig innhold." },
      { label: "Bøker & publishing", href: "/publishing", description: "Forfatterstudio, Book OS og utgivelser." },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    navLabel: "Finance · økonomi & lønnsomhet",
    href: "/finance",
    icon: "Banknote",
    description: "Inntekter, kostnader, provisjoner, fakturering, forecast, ROI og virksomhetsøkonomi.",
    promise: "Koble aktivitet og salg til faktisk inntekt, kostnad og lønnsomhet.",
    links: [
      { label: "Inntektsoversikt", href: "/revenue-command", description: "Pipeline, inntekter og kommersiell status." },
      { label: "Commission & Cash", href: "/commissions", description: "Provisjon, opptjent og innbetalt." },
      { label: "Fakturering", href: "/billing", description: "Faktura, bilag og økonomiflyt." },
      { label: "Revenue Forecast", href: "/forecast", description: "Forecast og forventet inntekt." },
      { label: "Månedsrapport", href: "/monthly-close", description: "Kontrollert månedsavslutning og rapportering." },
    ],
  },
];

export const REALTYFLOW_PLATFORM = {
  id: "platform" as const,
  label: "Platform / Operations",
  navLabel: "Platform · Nexus & drift",
  href: "/operations",
  icon: "Settings",
  description: "Shared Core, Nexus, brukere, brands, integrasjoner, automasjoner, datakvalitet og systemdrift.",
  promise: "Administrer plattformen uten å blande teknisk drift inn i de daglige arbeidsappene.",
  links: [
    { label: "Nexus OS", href: "/nexus-os", description: "AI, prioriteringer, regler og kontroll." },
    { label: "Brukere & tilgang", href: "/workspace-users", description: "Roller, merkevarer og modulrettigheter." },
    { label: "Tilkoblinger", href: "/connections", description: "Kanaler, integrasjoner og eksterne tjenester." },
    { label: "Data Health", href: "/data-health", description: "Datakvalitet, skjema og integrasjonshelse." },
    { label: "Automation Center", href: "/automation", description: "Arbeidsflyter, agenter og systemautomatisering." },
  ],
};

export const REALTYFLOW_NAVIGATION_GROUPS: Array<{
  id: RealtyFlowNavigationSectionId;
  label: string;
  icon: string;
  hrefs: string[];
}> = [
  {
    id: "workspace",
    label: "Hjem",
    icon: "PanelsTopLeft",
    hrefs: ["/workspaces", "/nexus-os/today", "/nexus-os/focus", "/personal-intelligence", "/nexus-os/inbox", "/nexus-os/communications", "/approvals", "/", "/today"],
  },
  {
    id: "sales",
    label: "Sales",
    icon: "Users",
    hrefs: ["/sales", "/customers", "/lead-intelligence", "/execution", "/automation/nurture", "/recovery", "/calendar", "/booking-admin", "/closing", "/closing-pack", "/after-sales", "/communications", "/inventory", "/inventory/property-360", "/scanner", "/tomtebase", "/areas", "/valuation", "/document-hub", "/care", "/care/customers", "/care/reports", "/care/keys", "/service-revenue"],
  },
  {
    id: "marketing",
    label: "Marketing",
    icon: "Megaphone",
    hrefs: ["/marketing", "/growth-hub", "/corporate-homes", "/social-automation", "/nexus-os/brand-brain", "/email", "/reach", "/marketing-readiness", "/ad-campaigns", "/analytics", "/reports", "/attribution", "/marketing-tasks"],
  },
  {
    id: "content",
    label: "Content",
    icon: "Clapperboard",
    hrefs: ["/content", "/content-studio", "/media-studio", "/posts", "/ai-personal-brand", "/content-hub", "/image-studio", "/website-cms", "/publishing", "/publishing/forfatterstudio", "/book-growth", "/youtube-studio", "/remaster-freddy"],
  },
  {
    id: "finance",
    label: "Finance",
    icon: "Banknote",
    hrefs: ["/finance", "/revenue-command", "/commissions", "/billing", "/forecast", "/monthly-close", "/goals", "/executive-briefing", "/business-overview", "/operating-review", "/weekly-management-review", "/continuous-improvement", "/internal-alerts", "/revenue-data-health", "/care/invoices", "/dona-anna", "/mondeo"],
  },
  {
    id: "platform",
    label: "Platform / Operations",
    icon: "Settings",
    hrefs: ["/operations", "/platform", "/saas", "/demosites", "/revenue-engine", "/business-hub", "/team-workload", "/nexus-os", "/os", "/connections", "/brands", "/settings", "/nexus-os/runtime", "/nexus-os/autonomy", "/nexus-os/outbound-engagement", "/nexus-os/account-launch", "/automation", "/agents", "/data-health", "/workspace-users", "/access-control", "/audit-log"],
  },
];

export function realtyFlowAppById(id: RealtyFlowAppId) {
  return REALTYFLOW_APPS.find((app) => app.id === id);
}
