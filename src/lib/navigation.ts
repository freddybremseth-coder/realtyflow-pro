import { SIDEBAR_NAV } from "@/lib/constants";
import { canSeeNavHref, type AccessRole } from "@/lib/access-control";

export type NavigationItem = { label: string; href: string; icon: string };
export type NavigationSectionId = "workspace" | "customers" | "properties" | "marketing" | "publishing" | "care" | "revenue" | "business" | "admin";
export interface NavigationSection { id: NavigationSectionId; label: string; icon: string; items: NavigationItem[]; }
export const NAVIGATION_FAVORITES_LIMIT = 6;

const REVENUE_READ_PAGES = new Set(["/internal-alerts", "/executive-briefing", "/operating-review", "/weekly-management-review", "/continuous-improvement"]);
const HIDDEN_LEGACY_HREFS = new Set(["/nexus"]);
const OWNER_HIDDEN_HREFS = new Set(["/today", "/communications"]);
const LABEL_OVERRIDES: Record<string,string> = {
  "/nexus-os/today":"I dag", "/personal-intelligence":"AI-rådgiver", "/nexus-os/inbox":"Innboks",
  "/nexus-os/focus":"Mitt fokus", "/nexus-os/communications":"E-post & kommunikasjon",
  "/nexus-os/brand-brain":"Merkevarer & kanaler", "/nexus-os/runtime":"Automatisering – status",
  "/nexus-os/autonomy":"Autopilot-regler", "/connections":"Tilkoblinger", "/nexus-os":"Nexus AI & autopilot",
};
const NEXUS_TODAY_NAV_ITEM: NavigationItem = { label: "I dag", href: "/nexus-os/today", icon: "Sparkles" };
const PERSONAL_INTELLIGENCE_NAV_ITEM: NavigationItem = { label: "AI-rådgiver", href: "/personal-intelligence", icon: "BrainCircuit" };
const PROPERTY_360_NAV_ITEM: NavigationItem = { label: "Property 360", href: "/inventory/property-360", icon: "Target" };
const BRAND_BRAIN_NAV_ITEM: NavigationItem = { label: "Merkevarer & kanaler", href: "/nexus-os/brand-brain", icon: "BrainCircuit" };
const NEXUS_INBOX_NAV_ITEM: NavigationItem = { label: "Innboks", href: "/nexus-os/inbox", icon: "Inbox" };

const GROUPS: Array<{ id: NavigationSectionId; label: string; icon: string; hrefs: string[] }> = [
  { id:"workspace", label:"Hjem", icon:"PanelsTopLeft", hrefs:["/nexus-os/today","/nexus-os/focus","/personal-intelligence","/nexus-os/inbox","/nexus-os/communications","/approvals","/","/today"] },
  { id:"customers", label:"Kunder & salg", icon:"Users", hrefs:["/customers","/lead-intelligence","/execution","/automation/nurture","/recovery","/calendar","/booking-admin","/closing","/closing-pack","/after-sales","/communications"] },
  { id:"properties", label:"Eiendom", icon:"Building2", hrefs:["/inventory","/inventory/property-360","/scanner","/tomtebase","/areas","/valuation","/document-hub"] },
  { id:"marketing", label:"Markedsføring & innhold", icon:"Megaphone", hrefs:["/growth-hub","/social-automation","/nexus-os/brand-brain","/content-studio","/media-studio","/posts","/ai-personal-brand","/content-hub","/image-studio","/website-cms","/email","/marketing-readiness","/ad-campaigns","/analytics","/reports","/attribution","/reach","/marketing-tasks"] },
  { id:"publishing", label:"Bøker & media", icon:"BookOpen", hrefs:["/publishing","/publishing/forfatterstudio","/book-growth","/youtube-studio","/remaster-freddy"] },
  { id:"care", label:"Care", icon:"KeyRound", hrefs:["/care","/care/customers","/care/reports","/care/invoices","/care/keys","/service-revenue"] },
  { id:"revenue", label:"Drift, økonomi & ledelse", icon:"Handshake", hrefs:["/revenue-command","/commissions","/billing","/forecast","/monthly-close","/goals","/executive-briefing","/business-overview","/operating-review","/weekly-management-review","/continuous-improvement","/internal-alerts","/team-workload","/revenue-data-health"] },
  { id:"business", label:"Virksomheter", icon:"Briefcase", hrefs:["/business-hub","/mondeo","/dona-anna","/platform","/demosites","/saas","/revenue-engine","/nexus-os/account-launch"] },
  { id:"admin", label:"System & autopilot", icon:"Settings", hrefs:["/nexus-os","/os","/connections","/brands","/settings","/nexus-os/runtime","/nexus-os/autonomy","/automation","/agents","/data-health","/access-control","/audit-log"] },
];

const ROLE_QUICK_LINKS: Record<AccessRole,string[]> = {
  OWNER:["/nexus-os/today","/customers","/nexus-os/communications","/inventory","/social-automation","/personal-intelligence"],
  SALES:["/today","/customers","/communications","/execution","/lead-intelligence","/recovery"],
  CLOSING:["/today","/closing","/closing-pack","/execution","/customers","/approvals"],
  FINANCE:["/billing","/dona-anna","/revenue-command","/monthly-close","/commissions","/forecast","/goals","/internal-alerts"],
  MARKETING:["/social-automation","/growth-hub","/marketing-readiness","/analytics","/ad-campaigns","/content-studio"],
  KEYHOLDING:["/care","/care/customers","/care/reports","/care/invoices","/care/keys","/communications"],
  VIEWER:["/revenue-command","/today","/customers","/executive-briefing","/monthly-close","/forecast"],
};

function sourceItems(){ return [...(Object.values(SIDEBAR_NAV) as readonly (readonly NavigationItem[])[]).flat(),NEXUS_TODAY_NAV_ITEM,PERSONAL_INTELLIGENCE_NAV_ITEM,PROPERTY_360_NAV_ITEM,BRAND_BRAIN_NAV_ITEM,NEXUS_INBOX_NAV_ITEM]; }
function canSeeItem(role:AccessRole,permissions:string[],href:string){ if(role==="OWNER"&&OWNER_HIDDEN_HREFS.has(href)) return false; if(REVENUE_READ_PAGES.has(href)) return permissions.includes("revenue.read"); return canSeeNavHref(role,href); }
export function buildVisibleNavigation(role:AccessRole,permissions:string[]):NavigationSection[]{ const itemByHref=new Map(sourceItems().map(item=>[item.href,{...item,label:LABEL_OVERRIDES[item.href]||item.label}])); return GROUPS.map(group=>({id:group.id,label:group.label,icon:group.icon,items:group.hrefs.map(href=>itemByHref.get(href)).filter((item):item is NavigationItem=>Boolean(item)).filter(item=>canSeeItem(role,permissions,item.href))})).filter(section=>section.items.length>0); }
export function isNavigationPathActive(pathname:string,href:string){ if(href==="/") return pathname==="/"; return pathname===href||pathname.startsWith(`${href}/`); }
export function activeNavigationSection(pathname:string,sections:NavigationSection[]):NavigationSectionId|null{ let best:{id:NavigationSectionId;length:number}|null=null; for(const section of sections){ for(const item of section.items){ if(!isNavigationPathActive(pathname,item.href)) continue; if(!best||item.href.length>best.length) best={id:section.id,length:item.href.length}; }} return best?.id||null; }
export function filterNavigationSections(sections:NavigationSection[],query:string){ const normalized=query.trim().toLocaleLowerCase("nb-NO"); if(!normalized)return sections; return sections.map(section=>({...section,items:section.items.filter(item=>`${item.label} ${item.href}`.toLocaleLowerCase("nb-NO").includes(normalized))})).filter(section=>section.items.length>0); }
export function normalizeNavigationFavorites(value:unknown,availableHrefs:string[],limit=NAVIGATION_FAVORITES_LIMIT){ const available=new Set(availableHrefs); const rows=Array.isArray(value)?value:[]; const result:string[]=[]; for(const row of rows){ const href=String(row||"").trim(); if(!available.has(href)||result.includes(href))continue; result.push(href); if(result.length>=limit)break; } return result; }
export function toggleNavigationFavorite(favorites:string[],href:string,availableHrefs:string[]){ const current=normalizeNavigationFavorites(favorites,availableHrefs); if(current.includes(href))return current.filter(item=>item!==href); return normalizeNavigationFavorites([href,...current],availableHrefs); }
export function quickNavigationItems(role:AccessRole,sections:NavigationSection[],favorites:string[],limit=NAVIGATION_FAVORITES_LIMIT){ const items=sections.flatMap(section=>section.items); const itemByHref=new Map(items.map(item=>[item.href,item])); const orderedHrefs=[...normalizeNavigationFavorites(favorites,[...itemByHref.keys()],limit),...ROLE_QUICK_LINKS[role]]; const result:NavigationItem[]=[]; for(const href of orderedHrefs){ const item=itemByHref.get(href); if(!item||result.some(row=>row.href===href))continue; result.push(item); if(result.length>=limit)break; } return result; }
export function navigationCoverage(){ const sourceHrefs=sourceItems().map(item=>item.href); const groupedHrefs=GROUPS.flatMap(group=>group.hrefs); return {sourceHrefs,groupedHrefs,missing:sourceHrefs.filter(href=>!groupedHrefs.includes(href)&&!HIDDEN_LEGACY_HREFS.has(href)),unknown:groupedHrefs.filter(href=>!sourceHrefs.includes(href)),duplicateGroupedHrefs:groupedHrefs.filter((href,index)=>groupedHrefs.indexOf(href)!==index)}; }
