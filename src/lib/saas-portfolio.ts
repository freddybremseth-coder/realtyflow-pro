export const SAAS_PORTFOLIO_PRIORITY = [
  "astro",
  "family",
  "vm2026",
  "realtyflow",
  "spanish",
  "demosites",
] as const;

export const ARCHIVED_SAAS_APP_SLUGS = [
  "olivia",
  "donaanna",
  "socialmusichub",
  "appointment",
] as const;

export const SAAS_PORTFOLIO_APPS = [
  {
    slug: "astro",
    name: "Astro",
    domain: "astro.chatgenius.pro",
    description: "Public demo app for AI-assisted astrology, guidance and personal insight flows.",
    category: "ai-chat",
    tech_stack: ["next.js", "ai", "demo", "chatgenius"],
    status: "live",
    color: "#8b5cf6",
    pricing_model: "demo",
    price_monthly: 0,
    currency: "USD",
    repo_url: "https://github.com/freddybremseth-coder/AstroMason",
    live_url: "https://astro.chatgenius.pro",
    dev_platform: "codex",
  },
  {
    slug: "family",
    name: "Family",
    domain: "family.chatgenius.pro",
    description: "Public demo app for family overview, tasks, calendar and sample household flows.",
    category: "productivity",
    tech_stack: ["react", "demo", "dashboard", "chatgenius"],
    status: "live",
    color: "#22c55e",
    pricing_model: "demo",
    price_monthly: 0,
    currency: "USD",
    repo_url: "https://github.com/freddybremseth-coder/family",
    live_url: "https://family.chatgenius.pro",
    dev_platform: "codex",
  },
  {
    slug: "vm2026",
    name: "VM2026",
    domain: "vm2026.chatgenius.pro",
    description: "Football World Cup 2026 demo app with matches, standings and tournament dashboard experience.",
    category: "sport",
    tech_stack: ["next.js", "football", "dashboard", "chatgenius"],
    status: "live",
    color: "#0ea5e9",
    pricing_model: "demo",
    price_monthly: 0,
    currency: "USD",
    repo_url: "https://github.com/freddybremseth-coder/VM2026",
    live_url: "https://vm2026.chatgenius.pro",
    dev_platform: "codex",
  },
  {
    slug: "realtyflow",
    name: "RealtyFlow",
    domain: "realtyflow.chatgenius.pro",
    description: "Private business operating system for CRM, SaaS control, subscriptions, internal overview and DemoSites production.",
    category: "business",
    tech_stack: ["next.js", "supabase", "vercel", "admin"],
    status: "live",
    color: "#06b6d4",
    pricing_model: "internal",
    price_monthly: 0,
    currency: "USD",
    repo_url: "https://github.com/freddybremseth-coder/realtyflow-pro",
    live_url: "https://realtyflow.chatgenius.pro",
    dev_platform: "codex",
  },
  {
    slug: "spanish",
    name: "Spanish",
    domain: "spanish.chatgenius.pro",
    description: "Public demo app for Spanish learning with micro-lessons, practice and progress flow.",
    category: "education",
    tech_stack: ["next.js", "learning", "language", "chatgenius"],
    status: "live",
    color: "#f97316",
    pricing_model: "demo",
    price_monthly: 0,
    currency: "USD",
    repo_url: null,
    live_url: "https://spanish.chatgenius.pro",
    dev_platform: "codex",
  },
  {
    slug: "demosites",
    name: "DemoSites",
    domain: "chatgenius.pro",
    description: "Productized website packages with public landing page, internal CRM, demo generation and subscription tracking.",
    category: "marketing",
    tech_stack: ["static-site", "realtyflow", "supabase", "chatgenius"],
    status: "live",
    color: "#a855f7",
    pricing_model: "subscription",
    price_monthly: 490,
    currency: "NOK",
    repo_url: "https://github.com/freddybremseth-coder/demosites",
    live_url: "https://chatgenius.pro/demosites/",
    dev_platform: "codex",
  },
] as const;

export function sortSaasPortfolio<T extends { slug?: string | null; status?: string | null }>(apps: T[]) {
  const order = new Map(SAAS_PORTFOLIO_PRIORITY.map((slug, index) => [slug, index]));
  return [...apps].sort((a, b) => {
    const aOrder = order.get(String(a.slug || "")) ?? 999;
    const bOrder = order.get(String(b.slug || "")) ?? 999;
    if (aOrder !== bOrder) return aOrder - bOrder;
    if (a.status === "live" && b.status !== "live") return -1;
    if (a.status !== "live" && b.status === "live") return 1;
    return String(a.slug || "").localeCompare(String(b.slug || ""));
  });
}
