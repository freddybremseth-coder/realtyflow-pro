import { SIDEBAR_NAV } from "@/lib/constants";
import { canSeeNavHref, type AccessRole } from "@/lib/access-control";

export type NavigationItem = { label: string; href: string; icon: string };
export type NavigationSectionId = "workspace" | "sales" | "marketing" | "content" | "finance" | "platform" | `workspace:${string}`;
export interface NavigationSection { id: NavigationSectionId; label: string; icon: string; items: NavigationItem[]; }
export type WorkspaceNavigationSource = { brandKey: string; name: string; permissions: string[] };
export const NAVIGATION_FAVORITES_LIMIT = 6;

const REVENUE_READ_PAGES = new Set(["/internal-alerts", "/executive-briefing", "/operating-review", "/weekly-management-review", "/continuous-improvement"]);
const HIDDEN_LEGACY_HREFS = new Set(["/nexus"]);
const OWNER_HIDDEN_HREFS = new Set(["/today", "/communications"]);
const LABEL_OVERRIDES: Record<string,string> = {
  "/nexus-os/today":"I dag", "/personal-intelligence":"AI-rådgiver", "/nexus-os/inbox":"Innboks",
  "/nexus-os/focus":"Mitt fokus", "/nexus-os/communications":"E-post & kommunikasjon",
  "/nexus-os/brand-brain":"Merkevarer & kanaler", "/nexus-os/runtime":"Automatisering – status",
  "/nexus-os/autonomy":"Autopilot-regler", "/nexus-os/outbound-engagement":"Outbound & Engagement", "/connections":"Tilkoblinger", "/nexus-os":"Nexus AI & autopilot",
};
const WORKSPACES_NAV_ITEM: NavigationItem = { label: "Arbeidsområder", href: "/workspaces", icon: "PanelsTopLeft" };
const SALES_APP_NAV_ITEM: NavigationItem = { label: "Sales", href: "/sales", icon: "Users" };
const MARKETING_APP_NAV_ITEM: NavigationItem = { label: "Marketing", href: "/marketing", icon: "Megaphone" };
const CONTENT_APP_NAV_ITEM: NavigationItem = { label: "Content", href: "/content", icon: "Clapperboard" };
const FINANCE_APP_NAV_ITEM: NavigationItem = { label: "Finance", href: "/finance", icon: "Banknote" };
const OPERATIONS_APP_NAV_ITEM: NavigationItem = { label: "Platform / Operations", href: "/operations", icon: "Settings" };
const NEXUS_TODAY_NAV_ITEM: NavigationItem = { label: "I dag", href: "/nexus-os/today", icon: "Sparkles" };
const PERSONAL_INTELLIGENCE_NAV_ITEM: NavigationItem = { label: "AI-rådgiver", href: "/personal-intelligence", icon: "BrainCircuit" };
const PROPERTY_360_NAV_ITEM: NavigationItem = { label: "Property 360", href: "/inventory/property-360", icon: "Target" };
const BRAND_BRAIN_NAV_ITEM: NavigationItem = { label: "Merkevarer & kanaler", href: "/nexus-os/brand-brain", icon: "BrainCircuit" };
const NEXUS_INBOX_NAV_ITEM: NavigationItem = { label: "Innboks", href: "/nexus-os/inbox", icon: "Inbox" };

const GROUPS: Array<{ id: NavigationSectionId; label: string; icon: string; hrefs: string[] }> = [
  { id:"workspace", label:"Hjem", icon:"PanelsTopLeft", hrefs:["/workspaces","/nexus-os/today","/nexus-os/focus","/personal-intelligence","/nexus-os/inbox","/nexus-os/communications","/approvals","/","/today"] },
  { id:"sales", label:"Sales", icon:"Users", hrefs:["/sales","/customers","/sales/corporate-homes","/lead-intelligence","/execution","/automation/nurture","/recovery","/calendar","/booking-admin","/closing","/closing-pack","/after-sales","/communications","/inventory","/inventory/property-360","/scanner","/tomtebase","/areas","/valuation","/document-hub","/care","/care/customers","/care/reports","/care/keys","/service-revenue"] },
  { id:"marketing", label:"Marketing", icon:"Megaphone", hrefs:["/marketing","/growth-hub","/corporate-homes","/social-automation","/nexus-os/brand-brain","/email","/marketing-readiness","/ad-campaigns","/analytics","/reports","/attribution","/reach","/marketing-tasks"] },
  { id:"content", label:"Content", icon:"Clapperboard", hrefs:["/content","/content-studio","/media-studio","/posts","/ai-personal-brand","/content-hub","/image-studio","/website-cms","/publishing","/publishing/forfatterstudio","/book-growth","/youtube-studio","/remaster-freddy"] },
  { id:"finance", label:"Finance", icon:"Banknote", hrefs:["/finance","/revenue-command","/commissions","/billing","/forecast","/monthly-close","/goals","/executive-briefing","/business-overview","/operating-review","/weekly-management-review","/continuous-improvement","/internal-alerts","/revenue-data-health","/care/invoices","/dona-anna","/mondeo"] },
  { id:"platform", label:"Platform / Operations", icon:"Settings", hrefs:["/operations","/business-hub","/platform","/demosites","/saas","/revenue-engine","/team-workload","/nexus-os/account-launch","/nexus-os","/os","/connections","/brands","/settings","/nexus-os/runtime","/nexus-os/autonomy","/nexus-os/outbound-engagement","/automation","/agents","/data-health","/workspace-users","/access-control","/audit-log"] },
];

const ROLE_QUICK_LINKS: Record<AccessRole,string[]> = {
  OWNER:["/workspaces","/sales","/marketing","/content","/finance","/operations"],
  SALES:["/sales","/today","/customers","/communications","/execution","/lead-intelligence"],
  CLOSING:["/sales","/today","/closing","/closing-pack","/execution","/customers"],
  FINANCE:["/finance","/billing","/revenue-command","/monthly-close","/commissions","/forecast"],
  MARKETING:["/marketing","/content","/social-automation","/growth-hub","/analytics","/ad-campaigns"],
  KEYHOLDING:["/sales","/care","/care/customers","/care/reports","/care/invoices","/care/keys"],
  VIEWER:["/revenue-command","/today","/customers","/executive-briefing","/monthly-close","/forecast"],
  WORKSPACE_MEMBER:[],
};

function sourceItems(){ return [...(Object.values(SIDEBAR_NAV) as readonly (readonly NavigationItem[])[]).flat(),NEXUS_TODAY_NAV_ITEM,PERSONAL_INTELLIGENCE_NAV_ITEM,PROPERTY_360_NAV_ITEM,BRAND_BRAIN_NAV_ITEM,NEXUS_INBOX_NAV_ITEM,WORKSPACES_NAV_ITEM,SALES_APP_NAV_ITEM,MARKETING_APP_NAV_ITEM,CONTENT_APP_NAV_ITEM,FINANCE_APP_NAV_ITEM,OPERATIONS_APP_NAV_ITEM]; }
function canSeeItem(role:AccessRole,permissions:string[],href:string){ if(role==="OWNER"&&OWNER_HIDDEN_HREFS.has(href)) return false; if(REVENUE_READ_PAGES.has(href)) return permissions.includes("revenue.read"); return canSeeNavHref(role,href); }
export function buildVisibleNavigation(role:AccessRole,permissions:string[]):NavigationSection[]{ const itemByHref=new Map(sourceItems().map(item=>[item.href,{...item,label:LABEL_OVERRIDES[item.href]||item.label}])); return GROUPS.map(group=>({id:group.id,label:group.label,icon:group.icon,items:group.hrefs.map(href=>itemByHref.get(href)).filter((item):item is NavigationItem=>Boolean(item)).filter(item=>canSeeItem(role,permissions,item.href))})).filter(section=>section.items.length>0); }

export function buildWorkspaceMemberNavigation(workspaces:WorkspaceNavigationSource[]):NavigationSection[]{
  const hasAny=(permissions:string[],wanted:string[])=>wanted.some(permission=>permissions.includes(permission));
  return workspaces
    .filter(workspace=>/^[a-z0-9][a-z0-9-]{1,62}$/.test(workspace.brandKey))
    .map(workspace=>{
      const base=`/workspace/${workspace.brandKey}`;
      const p=workspace.permissions;
      const items:NavigationItem[]=[
        {label:"I dag",href:base,icon:"Target"},
      ];
      if(hasAny(p,["crm.read","crm.joint.read","tasks.joint.read"])) items.push({label:"Kunder & leads",href:`${base}?tab=leads`,icon:"Users"});
      if(p.includes("customer360.read")) items.push({label:"Customer 360",href:`${base}?tab=leads&customer360=1`,icon:"UserRound"});
      if(p.includes("properties.catalog.read")) items.push({label:"Eiendommer",href:`${base}?tab=properties`,icon:"Building2"});
      if(workspace.brandKey==="zeneco"&&p.includes("corporate.read")) items.push({label:"Corporate Homes",href:`${base}?tab=growth&area=corporate`,icon:"Building2"});
      if(p.includes("content.read")) items.push({label:"Nettsideinnhold",href:`${base}?tab=growth&area=content`,icon:"FileText"});
      if(p.includes("email.read")) items.push({label:"E-post & Reach",href:`${base}?tab=growth&area=email`,icon:"Mail"});
      if(p.includes("visibility.read")) items.push({label:"SEO · GEO · AEO",href:`${base}?tab=growth&area=visibility`,icon:"Search"});
      if(p.includes("ads.read")) items.push({label:"Annonser",href:`${base}?tab=growth&area=ads`,icon:"Megaphone"});
      if(hasAny(p,["corporate.plan","visibility.plan","ads.draft","events.plan"])) items.push({label:"Arbeidsplan",href:`${base}?tab=growth&area=plan`,icon:"ClipboardList"});
      if(p.includes("marketing.read")) items.push({label:"SoMe & Content Hub",href:`${base}?tab=growth&focus=social`,icon:"Megaphone"});
      if(p.includes("reels.read")) items.push({label:"Reels Studio",href:`${base}?tab=growth&focus=reels`,icon:"Clapperboard"});
      if(p.includes("youtube.read")) items.push({label:"YouTube Studio",href:`${base}?tab=growth&focus=youtube`,icon:"Clapperboard"});
      if(p.includes("nexus.read")) items.push({label:"Nexus-innsikt",href:`${base}?tab=growth&focus=nexus`,icon:"Sparkles"});
      items.push({label:"Slik jobber vi",href:`${base}?tab=today&training=1`,icon:"BookOpen"});
      return {id:`workspace:${workspace.brandKey}` as NavigationSectionId,label:workspace.name||workspace.brandKey,icon:"Building2",items};
    })
    .filter(section=>section.items.length>0);
}

function splitLocation(value:string){
  const [pathPart,queryPart=""]=value.split("?",2);
  return {path:pathPart||"/",query:new URLSearchParams(queryPart)};
}
export function isNavigationPathActive(location:string,href:string){
  const current=splitLocation(location);
  const target=splitLocation(href);
  const pathMatch=target.path==="/"?current.path==="/":current.path===target.path||current.path.startsWith(`${target.path}/`);
  if(!pathMatch)return false;
  const targetEntries=Array.from(target.query.entries());
  if(targetEntries.length===0){
    if(current.path===target.path&&target.path.startsWith("/workspace/")&&Array.from(current.query.keys()).length>0)return false;
    return true;
  }
  return targetEntries.every(([key,value])=>current.query.get(key)===value);
}
export function activeNavigationSection(pathname:string,sections:NavigationSection[]):NavigationSectionId|null{ let best:{id:NavigationSectionId;length:number}|null=null; for(const section of sections){ for(const item of section.items){ if(!isNavigationPathActive(pathname,item.href)) continue; if(!best||item.href.length>best.length) best={id:section.id,length:item.href.length}; }} return best?.id||null; }
export function filterNavigationSections(sections:NavigationSection[],query:string){ const normalized=query.trim().toLocaleLowerCase("nb-NO"); if(!normalized)return sections; return sections.map(section=>({...section,items:section.items.filter(item=>`${item.label} ${item.href}`.toLocaleLowerCase("nb-NO").includes(normalized))})).filter(section=>section.items.length>0); }
export function normalizeNavigationFavorites(value:unknown,availableHrefs:string[],limit=NAVIGATION_FAVORITES_LIMIT){ const available=new Set(availableHrefs); const rows=Array.isArray(value)?value:[]; const result:string[]=[]; for(const row of rows){ const href=String(row||"").trim(); if(!available.has(href)||result.includes(href))continue; result.push(href); if(result.length>=limit)break; } return result; }
export function toggleNavigationFavorite(favorites:string[],href:string,availableHrefs:string[]){ const current=normalizeNavigationFavorites(favorites,availableHrefs); if(current.includes(href))return current.filter(item=>item!==href); return normalizeNavigationFavorites([href,...current],availableHrefs); }
export function quickNavigationItems(role:AccessRole,sections:NavigationSection[],favorites:string[],limit=NAVIGATION_FAVORITES_LIMIT){ const items=sections.flatMap(section=>section.items); const itemByHref=new Map(items.map(item=>[item.href,item])); const memberDefaults=role==="WORKSPACE_MEMBER"?sections.flatMap(section=>section.items.slice(0,3)).map(item=>item.href):[]; const orderedHrefs=[...normalizeNavigationFavorites(favorites,[...itemByHref.keys()],limit),...ROLE_QUICK_LINKS[role],...memberDefaults]; const result:NavigationItem[]=[]; for(const href of orderedHrefs){ const item=itemByHref.get(href); if(!item||result.some(row=>row.href===href))continue; result.push(item); if(result.length>=limit)break; } return result; }
export function navigationCoverage(){ const sourceHrefs=sourceItems().map(item=>item.href); const groupedHrefs=GROUPS.flatMap(group=>group.hrefs); return {sourceHrefs,groupedHrefs,missing:sourceHrefs.filter(href=>!groupedHrefs.includes(href)&&!HIDDEN_LEGACY_HREFS.has(href)),unknown:groupedHrefs.filter(href=>!sourceHrefs.includes(href)),duplicateGroupedHrefs:groupedHrefs.filter((href,index)=>groupedHrefs.indexOf(href)!==index)}; }
