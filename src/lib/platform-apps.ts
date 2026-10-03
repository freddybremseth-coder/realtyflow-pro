import type { AccessPermission, AccessRole } from "@/lib/access-control";

export type RealtyFlowAppId = "sales" | "marketing" | "content" | "finance" | "operations";

export type RealtyFlowAppModule = {
  label: string;
  href: string;
  description: string;
};

export type RealtyFlowAppDefinition = {
  id: RealtyFlowAppId;
  label: string;
  href: string;
  description: string;
  icon: "Users" | "Megaphone" | "Clapperboard" | "Banknote" | "Settings";
  permission: AccessPermission | "OWNER_ONLY";
  modules: RealtyFlowAppModule[];
};

export const REALTYFLOW_APPS: readonly RealtyFlowAppDefinition[] = [
  {
    id: "sales",
    label: "Sales",
    href: "/sales",
    description: "Leads, kunder, eiendommer, visninger, closing og oppfølging.",
    icon: "Users",
    permission: "revenue.read",
    modules: [
      { label: "I dag", href: "/nexus-os/today", description: "Prioriterte salgsoppgaver og signaler." },
      { label: "Kunder", href: "/customers", description: "Kundekort, historikk og oppfølging." },
      { label: "Lead Intelligence", href: "/lead-intelligence", description: "Strukturer behov og bygg kvalitetssikrede kundeløp." },
      { label: "Eiendommer", href: "/inventory", description: "Boliger, matching og tilgjengelighet." },
      { label: "Kalender", href: "/calendar", description: "Visninger, møter, samtaler og avtaler." },
      { label: "Closing", href: "/closing", description: "Fra reservasjon og kontrakt til nøkkel." },
    ],
  },
  {
    id: "marketing",
    label: "Marketing",
    href: "/marketing",
    description: "Kampanjer, distribusjon, vekst, SEO og kanaloppfølging.",
    icon: "Megaphone",
    permission: "marketing.read",
    modules: [
      { label: "Growth Hub", href: "/growth-hub", description: "Vekstmuligheter og markedsprioritering." },
      { label: "Social Automation", href: "/social-automation", description: "Sosiale kanaler, planlegging og automasjon." },
      { label: "Marketing Readiness", href: "/marketing-readiness", description: "Klarhet, datakvalitet og markedsgates." },
      { label: "Ad Campaigns", href: "/ad-campaigns", description: "Betalte kampanjer og kampanjegrunnlag." },
      { label: "Analytics", href: "/analytics", description: "Rekkevidde, konvertering og kanalresultater." },
      { label: "Attribution", href: "/attribution", description: "Koble markedsføring til leads, salg og inntekt." },
    ],
  },
  {
    id: "content",
    label: "Content",
    href: "/content",
    description: "Artikler, bilder, Reels, video, YouTube og publisering.",
    icon: "Clapperboard",
    permission: "marketing.read",
    modules: [
      { label: "Content Studio", href: "/content-studio", description: "Planlegg og produser innhold." },
      { label: "Media Studio", href: "/media-studio", description: "Bilder, video og generative mediejobber." },
      { label: "Content Hub", href: "/content-hub", description: "Samlet innholdsarkiv og produksjonsflyt." },
      { label: "YouTube Studio", href: "/youtube-studio", description: "Video, YouTube og kanalpublisering." },
      { label: "Re-Master Freddy", href: "/remaster-freddy", description: "Spesialisert medieproduksjon og gjenbrukbare studioflyter." },
      { label: "Website CMS", href: "/website-cms", description: "Publisert webinnhold og nettsider." },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    href: "/finance",
    description: "Inntekter, kostnader, provisjon, faktura, cashflow og lønnsomhet.",
    icon: "Banknote",
    permission: "finance.read",
    modules: [
      { label: "Finance overview", href: "/revenue-command", description: "Samlet økonomi- og inntektsoversikt." },
      { label: "Fakturering", href: "/billing", description: "Faktura og betalingsoppfølging." },
      { label: "Commission & Cash", href: "/commissions", description: "Provisjoner, forventet og mottatt cash." },
      { label: "Forecast", href: "/forecast", description: "Inntekts- og cashflowprognoser." },
      { label: "Månedsrapport", href: "/monthly-close", description: "Periodisering og ledelsesrapportering." },
      { label: "Doña Anna", href: "/dona-anna", description: "Driftsøkonomi for gård og produkter." },
    ],
  },
  {
    id: "operations",
    label: "Platform / Operations",
    href: "/operations",
    description: "Nexus, brukere, integrasjoner, automasjoner, systemstatus og kontroll.",
    icon: "Settings",
    permission: "OWNER_ONLY",
    modules: [
      { label: "Nexus OS", href: "/nexus-os", description: "AI, regler og operativ styring." },
      { label: "Brukere & tilgang", href: "/workspace-users", description: "Roller, merkevarer og modultilgang." },
      { label: "Connections", href: "/connections", description: "Integrasjoner og kanaltilkoblinger." },
      { label: "Automation Center", href: "/automation", description: "Automatiserte arbeidsflyter." },
      { label: "Systemstatus", href: "/os", description: "RealtyFlow OS status og drift." },
      { label: "Audit Log", href: "/audit-log", description: "Endringer, hendelser og kontrollspor." },
    ],
  },
] as const;

export const REALTYFLOW_APP_BY_ID = Object.fromEntries(
  REALTYFLOW_APPS.map((app) => [app.id, app]),
) as Record<RealtyFlowAppId, RealtyFlowAppDefinition>;

export function appVisibleForRole(app: RealtyFlowAppDefinition, role: AccessRole, permissions: string[]) {
  if (app.permission === "OWNER_ONLY") return role === "OWNER";
  return role === "OWNER" || permissions.includes(app.permission);
}
