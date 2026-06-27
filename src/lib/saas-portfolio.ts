export type SaasPortfolioApp = {
  slug: string;
  name: string;
  domain: string;
  liveUrl: string;
  status: "live" | "demo" | "internal" | "archived";
};

export const SAAS_PORTFOLIO_APPS: SaasPortfolioApp[] = [
  { slug: "astro", name: "Astro", domain: "astro.chatgenius.pro", liveUrl: "https://astro.chatgenius.pro", status: "demo" },
  { slug: "family", name: "Family", domain: "family.chatgenius.pro", liveUrl: "https://family.chatgenius.pro", status: "demo" },
  { slug: "vm2026", name: "VM2026", domain: "vm2026.chatgenius.pro", liveUrl: "https://vm2026.chatgenius.pro", status: "demo" },
  { slug: "realtyflow", name: "RealtyFlow", domain: "realtyflow.chatgenius.pro", liveUrl: "https://realtyflow.chatgenius.pro", status: "internal" },
  { slug: "spanish", name: "Spanish", domain: "spanish.chatgenius.pro", liveUrl: "https://spanish.chatgenius.pro", status: "demo" },
  { slug: "demosites", name: "DemoSites", domain: "chatgenius.pro", liveUrl: "https://chatgenius.pro/demosites/", status: "live" },
];

export const ARCHIVED_SAAS_APP_SLUGS = ["olivia", "donaanna", "socialmusichub", "appointment"];

export function sortSaasPortfolio<T extends { slug?: string | null }>(apps: T[]) {
  const order = new Map<string, number>(SAAS_PORTFOLIO_APPS.map((app, index) => [app.slug, index]));
  return [...apps].sort((a, b) => {
    const aOrder = order.get(String(a.slug || "")) ?? 999;
    const bOrder = order.get(String(b.slug || "")) ?? 999;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return String(a.slug || "").localeCompare(String(b.slug || ""));
  });
}
