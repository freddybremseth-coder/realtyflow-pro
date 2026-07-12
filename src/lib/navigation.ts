import { SIDEBAR_NAV } from "@/lib/constants";
import { canSeeNavHref, type AccessRole } from "@/lib/access-control";

export type NavigationItem = { label: string; href: string; icon: string };
export type NavigationSectionId =
  | "workspace"
  | "sales"
  | "deals"
  | "management"
  | "properties"
  | "marketing"
  | "platform"
  | "admin";

export interface NavigationSection {
  id: NavigationSectionId;
  label: string;
  icon: string;
  items: NavigationItem[];
}

export const NAVIGATION_FAVORITES_LIMIT = 6;

const REVENUE_READ_PAGES = new Set([
  "/internal-alerts",
  "/executive-briefing",
  "/operating-review",
  "/weekly-management-review",
  "/continuous-improvement",
]);

const GROUPS: Array<{
  id: NavigationSectionId;
  label: string;
  icon: string;
  hrefs: string[];
}> = [
  {
    id: "workspace",
    label: "Arbeidsdag",
    icon: "PanelsTopLeft",
    hrefs: [
      "/executive-briefing",
      "/today",
      "/customers",
      "/execution",
      "/internal-alerts",
      "/revenue-command",
    ],
  },
  {
    id: "sales",
    label: "Salg & kunder",
    icon: "Users",
    hrefs: [
      "/pipeline",
      "/lead-intelligence",
      "/approvals",
      "/communications",
      "/recovery",
      "/after-sales",
    ],
  },
  {
    id: "deals",
    label: "Closing & inntekt",
    icon: "Handshake",
    hrefs: [
      "/closing",
      "/closing-pack",
      "/commissions",
      "/forecast",
      "/service-revenue",
      "/team-workload",
      "/calendar",
      "/booking-admin",
    ],
  },
  {
    id: "management",
    label: "Ledelse & analyse",
    icon: "BarChart3",
    hrefs: [
      "/goals",
      "/monthly-close",
      "/attribution",
      "/operating-review",
      "/weekly-management-review",
      "/continuous-improvement",
      "/revenue-data-health",
      "/",
      "/business-overview",
    ],
  },
  {
    id: "properties",
    label: "Eiendom",
    icon: "Building2",
    hrefs: [
      "/inventory",
      "/scanner",
      "/tomtebase",
      "/areas",
      "/valuation",
      "/document-hub",
    ],
  },
  {
    id: "marketing",
    label: "Marked & vekst",
    icon: "Megaphone",
    hrefs: [
      "/content-studio",
      "/website-cms",
      "/content-hub",
      "/image-studio",
      "/ad-campaigns",
      "/marketing-tasks",
      "/youtube-studio",
      "/neural-beat",
      "/publishing",
      "/growth-hub",
      "/reports",
      "/analytics",
    ],
  },
  {
    id: "platform",
    label: "Plattform & automasjon",
    icon: "Boxes",
    hrefs: [
      "/saas",
      "/demosites",
      "/revenue-engine",
      "/automation",
      "/automation/nurture",
      "/agents",
      "/email",
    ],
  },
  {
    id: "admin",
    label: "System & admin",
    icon: "Settings",
    hrefs: [
      "/access-control",
      "/audit-log",
      "/brands",
      "/business-hub",
      "/mondeo",
      "/data-health",
      "/settings",
    ],
  },
];

const ROLE_QUICK_LINKS: Record<AccessRole, string[]> = {
  OWNER: [
    "/executive-briefing",
    "/today",
    "/customers",
    "/execution",
    "/internal-alerts",
    "/monthly-close",
  ],
  SALES: [
    "/today",
    "/customers",
    "/execution",
    "/pipeline",
    "/communications",
    "/recovery",
  ],
  CLOSING: [
    "/closing",
    "/closing-pack",
    "/execution",
    "/customers",
    "/internal-alerts",
    "/commissions",
  ],
  FINANCE: [
    "/monthly-close",
    "/commissions",
    "/goals",
    "/closing",
    "/audit-log",
    "/internal-alerts",
  ],
  MARKETING: [
    "/attribution",
    "/ad-campaigns",
    "/analytics",
    "/communications",
    "/goals",
    "/executive-briefing",
  ],
  KEYHOLDING: [
    "/service-revenue",
    "/execution",
    "/customers",
    "/communications",
    "/internal-alerts",
    "/today",
  ],
  VIEWER: [
    "/executive-briefing",
    "/revenue-command",
    "/customers",
    "/monthly-close",
    "/forecast",
    "/weekly-management-review",
  ],
};

function sourceItems() {
  return (Object.values(SIDEBAR_NAV) as readonly (readonly NavigationItem[])[]).flat();
}

function canSeeItem(role: AccessRole, permissions: string[], href: string) {
  if (REVENUE_READ_PAGES.has(href)) return permissions.includes("revenue.read");
  return canSeeNavHref(role, href);
}

export function buildVisibleNavigation(role: AccessRole, permissions: string[]): NavigationSection[] {
  const itemByHref = new Map(sourceItems().map((item) => [item.href, { ...item }]));
  return GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    icon: group.icon,
    items: group.hrefs
      .map((href) => itemByHref.get(href))
      .filter((item): item is NavigationItem => Boolean(item))
      .filter((item) => canSeeItem(role, permissions, item.href)),
  })).filter((section) => section.items.length > 0);
}

export function isNavigationPathActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function activeNavigationSection(
  pathname: string,
  sections: NavigationSection[],
): NavigationSectionId | null {
  return sections.find((section) => section.items.some((item) => isNavigationPathActive(pathname, item.href)))?.id || null;
}

export function filterNavigationSections(sections: NavigationSection[], query: string) {
  const normalized = query.trim().toLocaleLowerCase("nb-NO");
  if (!normalized) return sections;
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) =>
        `${item.label} ${item.href}`.toLocaleLowerCase("nb-NO").includes(normalized),
      ),
    }))
    .filter((section) => section.items.length > 0);
}

export function normalizeNavigationFavorites(
  value: unknown,
  availableHrefs: string[],
  limit = NAVIGATION_FAVORITES_LIMIT,
) {
  const available = new Set(availableHrefs);
  const rows = Array.isArray(value) ? value : [];
  const result: string[] = [];
  for (const row of rows) {
    const href = String(row || "").trim();
    if (!available.has(href) || result.includes(href)) continue;
    result.push(href);
    if (result.length >= limit) break;
  }
  return result;
}

export function toggleNavigationFavorite(
  favorites: string[],
  href: string,
  availableHrefs: string[],
) {
  const current = normalizeNavigationFavorites(favorites, availableHrefs);
  if (current.includes(href)) return current.filter((item) => item !== href);
  return normalizeNavigationFavorites([href, ...current], availableHrefs);
}

export function quickNavigationItems(
  role: AccessRole,
  sections: NavigationSection[],
  favorites: string[],
  limit = NAVIGATION_FAVORITES_LIMIT,
) {
  const items = sections.flatMap((section) => section.items);
  const itemByHref = new Map(items.map((item) => [item.href, item]));
  const orderedHrefs = [
    ...normalizeNavigationFavorites(favorites, [...itemByHref.keys()], limit),
    ...ROLE_QUICK_LINKS[role],
  ];
  const result: NavigationItem[] = [];
  for (const href of orderedHrefs) {
    const item = itemByHref.get(href);
    if (!item || result.some((row) => row.href === href)) continue;
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

export function navigationCoverage() {
  const sourceHrefs = sourceItems().map((item) => item.href);
  const groupedHrefs = GROUPS.flatMap((group) => group.hrefs);
  return {
    sourceHrefs,
    groupedHrefs,
    missing: sourceHrefs.filter((href) => !groupedHrefs.includes(href)),
    unknown: groupedHrefs.filter((href) => !sourceHrefs.includes(href)),
    duplicateGroupedHrefs: groupedHrefs.filter((href, index) => groupedHrefs.indexOf(href) !== index),
  };
}
