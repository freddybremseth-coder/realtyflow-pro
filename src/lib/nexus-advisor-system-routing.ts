import type { AgentCapability } from "@/services/agents/base-agent";
import { AUTOMATION_REGISTRY } from "@/lib/automation/registry";

export type NexusAdvisorSystemRoute = {
  kind: "agent" | "automation" | "module";
  id: string;
  label: string;
  owner: string;
  mode?: string;
  href?: string;
  purpose: string;
  availableTasks?: string[];
  safety?: string;
};

const MODULE_ROUTES: NexusAdvisorSystemRoute[] = [
  { kind: "module", id: "agents", label: "AI Agents", owner: "AgentOrchestrator", href: "/agents", purpose: "Eksisterende agent-flåte for spesialisert analyse, salg, SEO, business, YouTube, scheduling og innholdsarbeid." },
  { kind: "module", id: "automation-registry", label: "Automation Registry", owner: "Nexus OS", href: "/nexus-os/automation-registry", purpose: "Kanonisk oversikt over eksisterende automasjoner, eier, modus, KPI, output og sikkerhetsgate." },
  { kind: "module", id: "mission-operations", label: "Mission Operations", owner: "Nexus", href: "/nexus-os/mission-operations", purpose: "Governed execution for durable Nexus-missions." },
  { kind: "module", id: "email-readiness", label: "Email Readiness", owner: "Communications", href: "/nexus-os/communications/readiness", purpose: "Kontrollert preview/apply-flyt for historisk Inbox/Sent-backfill." },
  { kind: "module", id: "email-link-health", label: "Email Link Health", owner: "Communications", href: "/nexus-os/email-link-health", purpose: "Review-flyt for linked/exact_candidate/ambiguous/unlinked e-postidentitet før CRM-kobling." },
  { kind: "module", id: "nexus-inbox", label: "Nexus Inbox", owner: "Nexus OS", href: "/nexus-os/inbox", purpose: "Kanonisk kø for arbeid som krever menneskelig review eller approval." },
];

const EMAIL_CHAIN_PATHS = [
  "/api/cron/email-ingest",
  "/api/cron/email-auto-draft",
  "/api/cron/email-crm-sync",
  "/api/cron/nexus-buyer-profile-sync",
  "/api/cron/nexus-criteria-confirmation",
  "/api/cron/nexus-property-match-prep",
  "/api/cron/nexus-shortlist-prep",
  "/api/cron/nexus-presentation-prep",
  "/api/cron/nexus-no-match-followup",
  "/api/cron/nexus-send-preflight",
  "/api/cron/nexus-property-recommendation-send",
] as const;

const AGENT_DOMAIN_ALIASES: Array<{ match: RegExp; aliases: string[] }> = [
  { match: /marketing/i, aliases: ["marketing", "markedsforing", "kampanje", "campaign", "innhold", "content", "facebook", "instagram", "social", "sosiale medier"] },
  { match: /seo/i, aliases: ["seo", "sokeord", "sok", "google", "organisk", "on page", "onpage", "metadata", "synlighet"] },
  { match: /sales/i, aliases: ["sales", "salg", "lead", "leads", "pipeline", "konverter", "konvertering", "kunde", "crm"] },
  { match: /business/i, aliases: ["business", "forretning", "forretningsstrategi", "marked", "markedsanalyse", "vekst", "partner", "partnerskap", "posisjonering"] },
  { match: /navigator|multi.domain/i, aliases: ["multi domain", "tverrfaglig", "tverr", "cross brand", "brands", "merkevarer", "synergi", "portefolje"] },
  { match: /youtube/i, aliases: ["youtube", "video", "shorts", "thumbnail", "miniatyr", "kanal", "tags", "videotittel", "videobeskrivelse"] },
  { match: /ceo/i, aliases: ["ceo", "leder", "ledelse", "prioriter", "prioritering", "deleger", "koordinering", "status", "strategi"] },
  { match: /scheduler|scheduling/i, aliases: ["scheduler", "scheduling", "planlegg", "planlegging", "kalender", "publiseringstid", "posting time", "tidspunkt", "ukeplan"] },
];

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function messageLooksLikeEmailCrmWork(message: string) {
  const text = normalize(message);
  const email = /\b(e post(?:er)?|epost(?:er)?|email(?:s)?|mail(?:er)?|innboks(?:en)?|gmail)\b/.test(text);
  const crm = /\b(crm|kunde|kunder|kontakt|kontakter|buyer profile|kjoperprofil|match)\b/.test(text);
  const bulk = /\b(alle|historikk|historiske|gjennom|avstem|synk|oppdater|legg inn|import)\b/.test(text);
  return email && (crm || bulk);
}

function automationRoute(path: string): NexusAdvisorSystemRoute | null {
  const row = AUTOMATION_REGISTRY[path];
  if (!row) return null;
  return { kind: "automation", id: path, label: row.name, owner: row.owner, mode: row.mode, purpose: row.purpose, safety: row.safety };
}

function scoreAutomation(message: string, path: string) {
  const row = AUTOMATION_REGISTRY[path];
  if (!row) return 0;
  const text = normalize(message);
  if (!text) return 0;
  const haystack = normalize([row.name, row.owner, row.purpose, row.expectedOutput, ...(row.actionKeys || [])].join(" "));
  const tokens = text.split(" ").filter((token) => token.length >= 3);
  return tokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0);
}

function aliasesForAgent(agent: AgentCapability) {
  const identity = `${agent.agentName} ${agent.role}`;
  return AGENT_DOMAIN_ALIASES
    .filter((row) => row.match.test(identity))
    .flatMap((row) => row.aliases);
}

function scoreAgent(message: string, agent: AgentCapability) {
  const text = normalize(message);
  if (!text) return 0;
  const aliases = aliasesForAgent(agent).map(normalize);
  const haystack = normalize([agent.agentName, agent.role, ...agent.expertise, ...agent.availableTasks, ...aliases].join(" "));
  const tokens = text.split(" ").filter((token) => token.length >= 3);
  const tokenScore = tokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0);
  const aliasScore = aliases.reduce((score, alias) => score + (alias && text.includes(alias) ? 4 : 0), 0);
  return tokenScore + aliasScore;
}

export function buildNexusAdvisorSystemRouting(message: string, agents: AgentCapability[]) {
  const scoredAgents = agents
    .map((agent) => ({ agent, score: scoreAgent(message, agent) }))
    .sort((a, b) => b.score - a.score || a.agent.agentName.localeCompare(b.agent.agentName));

  const allAgents: NexusAdvisorSystemRoute[] = scoredAgents.map(({ agent }) => ({
    kind: "agent" as const,
    id: agent.agentName,
    label: agent.agentName,
    owner: "AgentOrchestrator",
    purpose: agent.role,
    availableTasks: agent.availableTasks,
  }));

  const relevantAgents: NexusAdvisorSystemRoute[] = scoredAgents
    .filter((row) => row.score > 0)
    .slice(0, 5)
    .map(({ agent }) => ({
      kind: "agent" as const,
      id: agent.agentName,
      label: agent.agentName,
      owner: "AgentOrchestrator",
      purpose: agent.role,
      availableTasks: agent.availableTasks,
    }));

  const scoredAutomations = Object.keys(AUTOMATION_REGISTRY)
    .map((path) => ({ path, score: scoreAutomation(message, path) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, 8)
    .map((row) => automationRoute(row.path))
    .filter((row): row is NexusAdvisorSystemRoute => Boolean(row));

  const emailChain = messageLooksLikeEmailCrmWork(message)
    ? EMAIL_CHAIN_PATHS.map((path) => automationRoute(path)).filter((row): row is NexusAdvisorSystemRoute => Boolean(row))
    : [];

  const automationMap = new Map<string, NexusAdvisorSystemRoute>();
  for (const row of [...emailChain, ...scoredAutomations]) automationMap.set(row.id, row);

  return {
    policy: {
      advisorRole: "orchestrator_only",
      rule: "Bruk eksisterende agent, automation, mission eller modul når systemet allerede eier oppgaven. Ikke lag en parallell write-path i rådgiveren.",
      directBulkCrmMutationFromAdvisor: false,
      directCustomerSendFromAdvisor: false,
      existingReviewAndApprovalGatesRemainAuthoritative: true,
    },
    relevantAgents,
    allAgents,
    relevantAutomations: [...automationMap.values()],
    modules: MODULE_ROUTES,
    emailCrmChain: messageLooksLikeEmailCrmWork(message)
      ? {
          order: [
            "Email Readiness / historisk backfill ved behov",
            "Email Link Health / identitets-review",
            "Email CRM sync",
            "Buyer Profile sync",
            "Criteria confirmation",
            "Property match prep",
            "Shortlist prep",
            "Presentation prep",
            "Send preflight",
            "Property recommendation send",
          ],
          note: "Rådgiveren skal rute til eksisterende systemdeler. CRM-identitet, kriterier og kundesend følger eksisterende evidence/review/approval-gater.",
        }
      : null,
  };
}
