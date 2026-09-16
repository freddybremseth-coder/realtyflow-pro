export interface NexusCommand {
  id: string;
  label: string;
  description: string;
  href: string;
  keywords: string[];
}

export const NEXUS_COMMANDS: NexusCommand[] = [
  { id: "daily", label: "Nexus Daily", description: "Se dagens salgsbrief med HOT leads, kundesvar og Min side-aktivitet", href: "/nexus-os/daily", keywords: ["nexus daily", "daglig brief", "daglig oppdatering", "hvem skal jeg kontakte", "hot leads", "min side nå", "kundesvar i dag", "salgsbrief"] },
  { id: "today", label: "Nexus Today", description: "Se hva som trenger oppmerksomhet nå", href: "/nexus-os/today", keywords: ["i dag", "today", "oppmerksomhet", "prioritet", "neste handling"] },
  { id: "reply-command", label: "Reply Command", description: "Se aktive kundesvar, svar-SLA, AI-utkast og aktuelle boliger som bør foreslås", href: "/nexus-os/replies", keywords: ["reply command", "svar nå", "kundesvar", "e-post svar", "email replies", "svarfrist", "sla", "aktive kunder", "hvem må jeg svare", "hvem bør svares", "boligforslag"] },
  { id: "email-readiness", label: "Email Readiness", description: "Kontroller e-postkontoer og kjør sikker preview/apply av historisk Inbox og Sent", href: "/nexus-os/communications/readiness", keywords: ["email readiness", "e-post readiness", "historisk e-post", "historiske eposter", "backfill", "importer epost", "inbox sent", "mailhistorikk", "gmail historikk"] },
  { id: "email-link-health", label: "Email Link Health", description: "Kontroller og godkjenn sikker kobling mellom e-poster og CRM-kunder", href: "/nexus-os/email-link-health", keywords: ["email link health", "e-post crm", "epost crm", "match epost kunde", "match email customer", "avstem epost", "kobling epost kunde", "crm epost historikk"] },
  { id: "portal-engagement", label: "Min side aktivitet", description: "Se inviterte og aktive portalbrukere, nylig boliginteresse og kundemeldinger", href: "/nexus-os/portal-engagement", keywords: ["min side", "kundeportal", "portal", "aktiv kunde", "portalaktivitet", "interessert bolig", "siste aktivitet", "portal engagement", "magic link", "inviterte kunder"] },
  { id: "inbox", label: "Nexus Inbox", description: "Se alt som venter på menneskelig vurdering på tvers av system, approvals og marketing", href: "/nexus-os/inbox", keywords: ["inbox", "hva venter på meg", "venter på meg", "trenger handling", "krever handling", "menneskelig vurdering", "beslutningskø", "vis approvals", "approval queue", "marketing blockers", "systemproblemer"] },
  { id: "revenue-command", label: "Revenue Command", description: "Se persistent pipeline health, lekkasje, Director-missions og faktisk agent-fullmakt", href: "/nexus-os/revenue-command", keywords: ["revenue command", "command center", "hvor lekker pipeline", "pipeline health", "stale closing", "hva skal teamet gjøre", "lederteam", "director missions", "execution queue", "salgsledelse"] },
  { id: "commercial-targets", label: "Commercial Targets", description: "Sett eksplisitte mål per merkevare og business-pipeline med evidensgater", href: "/nexus-os/commercial-targets", keywords: ["mål", "commercial targets", "targets", "lead target", "lead mål", "revenue goals", "sales goals", "salgsmål", "opportunities per uke", "conversions per måned", "vekstmål"] },
  { id: "mission-operations", label: "Mission Operations", description: "Start, følg og styr governed Nexus-missions med durable run- og approval-state", href: "/nexus-os/mission-operations", keywords: ["mission operations", "start mission", "fortsett mission", "mission state", "venter approval", "venter godkjenning", "approval missions", "execution state", "governed execution", "mission queue"] },
  { id: "mission-control", label: "Mission Control", description: "Se hvilke missions Nexus-teamet prioriterer for salg, closing og vekst", href: "/nexus-os/mission-control", keywords: ["mission control", "missions", "superselgere", "super selgere", "hva skal teamet gjøre", "closer missions", "sales team", "revenue team", "growth team", "close salg", "selvgående salg"] },
  { id: "agents", label: "AI Agents", description: "Se alle registrerte agenter, capabilities og faktisk registrert aktivitet", href: "/agents", keywords: ["agenter", "agents", "ai agents", "agent fleet", "alex marketing", "jordan sales", "sam seo", "victoria ceo", "sofia scheduler", "elena email", "nova youtube", "morgan business"] },
  { id: "automation-registry", label: "Automation Registry", description: "Se kanonisk oversikt over Nexus-automations, eier, modus, KPI og health", href: "/nexus-os/automation-registry", keywords: ["automation registry", "automasjoner", "automatiseringer", "cron", "workers", "systemjobber", "hvilke automasjoner", "hva kjører"] },
  { id: "business-pipelines", label: "Business Pipelines", description: "Se separate pipelines for eiendom, bøker, AI, rådgivning, commerce og media", href: "/nexus-os/business-pipelines", keywords: ["pipelines", "business pipeline", "business model", "forretningsmodell", "bok pipeline", "publishing pipeline", "ai pipeline", "rådgivning pipeline", "eiendom pipeline", "sales pipeline", "ulike pipelines"] },
  { id: "customers", label: "Kunder", description: "Åpne CRM og kundetriage", href: "/customers", keywords: ["kunde", "kundene", "crm", "kontakt", "lead"] },
  { id: "lead-intelligence", label: "AI Lead Inbox", description: "Se Lead Intelligence og buyer profiles", href: "/lead-intelligence", keywords: ["lead", "buyer", "kjøper", "intelligence", "inbox"] },
  { id: "inventory", label: "Eiendommer", description: "Åpne eiendomsporteføljen", href: "/inventory", keywords: ["bolig", "eiendom", "property", "inventory", "portefølje"] },
  { id: "property-360", label: "Property 360", description: "Finn bolig og se beste matchende kjøpere", href: "/inventory/property-360", keywords: ["property 360", "best buyers", "beste kjøpere", "match", "boligmatch"] },
  { id: "brand-brain", label: "Brand & Channel Brain", description: "Se Freddy-brandene, kanalstatus, blockers og publiseringsregler", href: "/nexus-os/brand-brain", keywords: ["brand brain", "channel brain", "merkevarer", "brands", "kanaler", "kanalstatus", "freddy publishing kanaler", "freddy ai", "ai products", "mangler facebook", "mangler kanal", "blocked channel", "publiseringsregler"] },
  { id: "social", label: "Marketing Autopilot", description: "Se autopilot, planlagt og publisert innhold", href: "/social-automation", keywords: ["facebook", "instagram", "sosiale medier", "social", "autopilot", "publisering"] },
  { id: "publishing", label: "Publishing Hub", description: "Åpne Freddy Publishing og bokarbeid", href: "/publishing", keywords: ["bok", "bøker", "publishing", "amazon", "kindle", "forfatter"] },
  { id: "approvals", label: "Approval Center", description: "Administrer handlinger som venter på godkjenning", href: "/approvals", keywords: ["approval center", "godkjenningssenter", "administrer approvals", "godkjenning"] },
  { id: "nexus", label: "Nexus OS", description: "Åpne Nexus OS kontrollsenter", href: "/nexus-os", keywords: ["nexus", "os", "director", "autonomy", "kontroll"] },
];

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("nb-NO");
}

export function filterNexusCommands(query: string, limit = 7) {
  const normalized = normalize(query);
  if (!normalized) return NEXUS_COMMANDS.slice(0, limit);

  return NEXUS_COMMANDS.map((command) => {
    const label = normalize(command.label);
    const description = normalize(command.description);
    const keywords = command.keywords.map(normalize);
    let score = 0;
    if (label === normalized) score += 100;
    if (label.startsWith(normalized)) score += 50;
    if (label.includes(normalized)) score += 30;
    if (keywords.some((keyword) => keyword === normalized)) score += 45;
    if (keywords.some((keyword) => keyword.includes(normalized))) score += 20;
    if (normalized.length > 3 && keywords.some((keyword) => normalized.includes(keyword))) score += 35;
    if (description.includes(normalized)) score += 10;
    return { command, score };
  })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.command.label.localeCompare(b.command.label, "nb"))
    .slice(0, limit)
    .map((row) => row.command);
}
