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
    description: "Astrology and personal insight app with AI-assisted interpretations and user-friendly guidance.",
    category: "ai-chat",
    tech_stack: ["next.js", "supabase", "openai", "astrology"],
    status: "live",
    color: "#8b5cf6",
    pricing_model: "freemium",
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
    description: "Private family operating app for shared overview, tasks, economy, routines and important family workflows.",
    category: "productivity",
    tech_stack: ["next.js", "supabase", "family-crm", "dashboard"],
    status: "live",
    color: "#22c55e",
    pricing_model: "free",
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
    description: "World Cup 2026 football app with matches, standings, predictions and tournament dashboard experience.",
    category: "sport",
    tech_stack: ["next.js", "football-data", "supabase", "analytics"],
    status: "live",
    color: "#0ea5e9",
    pricing_model: "free",
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
    description: "Closed backend for CRM, admin, Business Overview, SaaS, subscriptions, real estate, publishing and brand operations.",
    category: "business",
    tech_stack: ["next.js", "supabase", "vercel", "openai"],
    status: "live",
    color: "#06b6d4",
    pricing_model: "subscription",
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
    description: "Spanish learning app with structured practice, micro-lessons and warm learning flow.",
    category: "education",
    tech_stack: ["next.js", "learning", "language", "ai"],
    status: "live",
    color: "#f97316",
    pricing_model: "freemium",
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
    description: "Productized website packages with public ChatGenius landing page, fixed prices, CRM, preview flow and subscription tracking.",
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
