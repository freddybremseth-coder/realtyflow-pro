export interface NexusCommand {
  id: string;
  label: string;
  description: string;
  href: string;
  keywords: string[];
}

export const NEXUS_COMMANDS: NexusCommand[] = [
  { id: "today", label: "Nexus Today", description: "Se hva som trenger oppmerksomhet nå", href: "/nexus-os/today", keywords: ["i dag", "today", "oppmerksomhet", "prioritet", "neste handling"] },
  { id: "inbox", label: "Nexus Inbox", description: "Se alt som venter på menneskelig vurdering på tvers av system, approvals og marketing", href: "/nexus-os/inbox", keywords: ["inbox", "hva venter på meg", "venter på meg", "trenger handling", "krever handling", "menneskelig vurdering", "beslutningskø", "vis approvals", "approval queue", "marketing blockers", "systemproblemer"] },
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
