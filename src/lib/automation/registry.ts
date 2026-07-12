import vercelConfig from "../../../vercel.json";

export type AutomationCategory =
  | "revenue"
  | "growth"
  | "publishing"
  | "property"
  | "neural-beat"
  | "maintenance"
  | "reporting";

export type AutomationMode = "live" | "draft-first" | "manual-review" | "dry-run-default";
export type AutomationHealth = "healthy" | "attention" | "stale" | "unknown";

export interface VercelCronDefinition {
  path: string;
  schedule: string;
}

export interface AutomationRegistryMetadata {
  name: string;
  category: AutomationCategory;
  owner: string;
  mode: AutomationMode;
  kpi: string;
  purpose: string;
  expectedOutput: string;
  safety: string;
  actionKeys?: string[];
}

export interface AutomationRunLike {
  id?: string;
  status?: string | null;
  input?: Record<string, any> | null;
  output?: Record<string, any> | null;
  error?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
}

export interface AutomationLogLike {
  id?: string;
  action?: string | null;
  status?: string | null;
  details?: Record<string, any> | null;
  created_at?: string | null;
}

export interface AutomationRegistryItem {
  path: string;
  schedule: string;
  scheduleLabel: string;
  name: string;
  category: AutomationCategory;
  owner: string;
  mode: AutomationMode;
  kpi: string;
  purpose: string;
  expectedOutput: string;
  safety: string;
  lastRunAt: string | null;
  lastStatus: "success" | "error" | "running" | "cancelled" | "unknown";
  lastError: string | null;
  health: AutomationHealth;
  staleAfterHours: number;
}

export interface AutomationRegistrySummary {
  total: number;
  live: number;
  draftFirst: number;
  manualReview: number;
  dryRunDefault: number;
  healthy: number;
  attention: number;
  stale: number;
  unknown: number;
}

export const AUTOMATION_REGISTRY: Record<string, AutomationRegistryMetadata> = {
  "/api/neural-beat/cron": {
    name: "Neural Beat hovedcron",
    category: "neural-beat",
    owner: "Re-Master Freddy",
    mode: "live",
    kpi: "Nye musikkpubliseringer og kanalaktivitet",
    purpose: "Kjører hovedflyten for Neural Beat/Re-Master Freddy.",
    expectedOutput: "Publiserings-/optimaliseringsresultater for musikkkanalen.",
    safety: "Cron-secret sjekkes i route; bør standardiseres mot requireCronApi.",
    actionKeys: ["neural-beat", "neural_beat", "remaster"],
  },
  "/api/neural-beat/thumbnail-ab": {
    name: "Thumbnail A/B",
    category: "neural-beat",
    owner: "Re-Master Freddy",
    mode: "manual-review",
    kpi: "CTR og YouTube-visninger",
    purpose: "Tester og roterer thumbnails for å lære hva som får klikk.",
    expectedOutput: "Thumbnail-testresultater eller forslag til forbedring.",
    safety: "Cron-secret sjekkes i route; bør standardiseres mot requireCronApi.",
    actionKeys: ["thumbnail", "thumbnail_ab"],
  },
  "/api/neural-beat/shorts-followup": {
    name: "Shorts follow-up",
    category: "neural-beat",
    owner: "Re-Master Freddy",
    mode: "live",
    kpi: "Shorts-visninger og abonnentvekst",
    purpose: "Følger opp nyeste låter med ekstra Shorts-innhold.",
    expectedOutput: "Én ekstra Short eller skip-resultat.",
    safety: "Cron-secret sjekkes i route; bør standardiseres mot requireCronApi.",
    actionKeys: ["shorts", "shorts_followup"],
  },
  "/api/neural-beat/weekly-mix": {
    name: "Weekly mix",
    category: "neural-beat",
    owner: "Re-Master Freddy",
    mode: "draft-first",
    kpi: "Ukentlig kanalretensjon",
    purpose: "Lager ukentlig miks/oppsummering for musikkatalogen.",
    expectedOutput: "Weekly mix-plan, draft eller publiseringsresultat.",
    safety: "Cron-secret sjekkes i route; bør standardiseres mot requireCronApi.",
    actionKeys: ["weekly_mix", "weekly-mix"],
  },
  "/api/cron/market-data": {
    name: "Market data",
    category: "reporting",
    owner: "Revenue OS",
    mode: "live",
    kpi: "Oppdaterte markedsindikatorer",
    purpose: "Holder markedsdata ferske for rapporter og beslutninger.",
    expectedOutput: "Oppdaterte markedsrader eller rapportgrunnlag.",
    safety: "requireCronApi + safe-mode.",
    actionKeys: ["market_data", "market-data"],
  },
  "/api/cron/weekly-report": {
    name: "Weekly report",
    category: "reporting",
    owner: "Revenue OS",
    mode: "draft-first",
    kpi: "Ukentlig styringsoversikt",
    purpose: "Produserer ukentlig rapportgrunnlag for drift og salg.",
    expectedOutput: "Rapportutkast eller oppdaterte report records.",
    safety: "requireCronApi + safe-mode.",
    actionKeys: ["weekly_report", "weekly-report"],
  },
  "/api/cron/growth-engine": {
    name: "Growth Engine",
    category: "growth",
    owner: "Victoria",
    mode: "draft-first",
    kpi: "Nye veksttiltak og leads",
    purpose: "Genererer prioriterte vekstactions på tvers av brands.",
    expectedOutput: "growth_actions og growth_analysis_logs.",
    safety: "requireCronApi + safe-mode. Engine eier persistens.",
    actionKeys: ["Growth Engine", "Victoria daglig vekstanalyse", "growth-engine"],
  },
  "/api/cron/saas-scanner": {
    name: "SaaS scanner",
    category: "growth",
    owner: "DemoSites",
    mode: "manual-review",
    kpi: "Kvalifiserte DemoSites leads",
    purpose: "Scanner etter SaaS/DemoSites-muligheter.",
    expectedOutput: "Nye eller oppdaterte SaaS opportunities.",
    safety: "requireCronApi + safe-mode.",
    actionKeys: ["saas_scanner", "saas-scanner"],
  },
  "/api/cron/property-scanner": {
    name: "Property scanner",
    category: "property",
    owner: "Eiendom",
    mode: "manual-review",
    kpi: "Nye relevante eiendomsobjekter",
    purpose: "Scanner etter eiendomssignaler og nye objekter.",
    expectedOutput: "Property scan-resultater og mulige work items.",
    safety: "requireCronApi + safe-mode.",
    actionKeys: ["property_scanner", "property-scanner"],
  },
  "/api/cron/property-marketing": {
    name: "Property marketing",
    category: "property",
    owner: "Eiendom",
    mode: "draft-first",
    kpi: "Flere kvalifiserte eiendomsleads",
    purpose: "Lager eller oppdaterer markedsføringsmateriale for eiendommer.",
    expectedOutput: "Marketing copy, tasks eller publikasjonssignaler.",
    safety: "requireCronApi + safe-mode.",
    actionKeys: ["property_marketing", "property-marketing"],
  },
  "/api/cron/auto-publish": {
    name: "Auto publish",
    category: "growth",
    owner: "Content Hub",
    mode: "live",
    kpi: "Publiserte innlegg og rekkevidde",
    purpose: "Publiserer planlagt innhold som allerede er klart.",
    expectedOutput: "Publiseringsresultater og eventuelle feil.",
    safety: "requireCronApi.",
    actionKeys: ["Publiser planlagt innhold", "auto-publish"],
  },
  "/api/cron/engagement-tracker": {
    name: "Engagement tracker",
    category: "growth",
    owner: "Content Hub",
    mode: "live",
    kpi: "Engagement-rate og læring fra innhold",
    purpose: "Henter engagement fra SoMe/YouTube for læringssløyfen.",
    expectedOutput: "Oppdaterte engagement metrics.",
    safety: "requireCronApi + safe-mode.",
    actionKeys: ["Hent SoMe/YouTube engagement", "engagement-tracker"],
  },
  "/api/cron/trending-tags": {
    name: "Trending tags",
    category: "growth",
    owner: "Content Hub",
    mode: "draft-first",
    kpi: "Bedre innholdsoppdagelse",
    purpose: "Finner tags og trender som kan forbedre innholdsdistribusjon.",
    expectedOutput: "Tag-anbefalinger eller oppdaterte trenddata.",
    safety: "requireCronApi + safe-mode.",
    actionKeys: ["trending_tags", "trending-tags"],
  },
  "/api/cron/storage-archive": {
    name: "Storage archive",
    category: "maintenance",
    owner: "System",
    mode: "live",
    kpi: "Lavere lagringsrot og tryggere arkiv",
    purpose: "Arkiverer eldre storage-filer og holder systemet ryddig.",
    expectedOutput: "Arkiverte filer eller skip-resultat.",
    safety: "requireCronApi + safe-mode.",
    actionKeys: ["storage_archive", "storage-archive"],
  },
  "/api/cron/publishing-autopilot": {
    name: "Publishing Autopilot",
    category: "publishing",
    owner: "Publishing Hub",
    mode: "manual-review",
    kpi: "Flere bok-/publiseringsoppgaver til review",
    purpose: "Flytter egnede publishing work items fra TO_DO til REVIEW.",
    expectedOutput: "Oppdaterte work items og draft-suggestions.",
    safety: "requireCronApi + safe-mode. Stopper før publisering.",
    actionKeys: ["Publishing Autopilot v1 (TO_DO → REVIEW)", "publishing_autopilot_v1", "publishing-autopilot"],
  },
  "/api/cron/publishing-growth-loop": {
    name: "Publishing Growth Loop",
    category: "publishing",
    owner: "Publishing Hub",
    mode: "draft-first",
    kpi: "Publishing-salgssignaler og nye salgsoppgaver",
    purpose: "Analyserer publishing-resultater og lager salgsoppgaver.",
    expectedOutput: "Work items eller anbefalte veksttiltak.",
    safety: "requireCronApi + safe-mode.",
    actionKeys: ["Publishing Growth Loop v1 (analyse -> salgsoppgaver)", "publishing-growth-loop"],
  },
  "/api/cron/publishing-market-watch": {
    name: "Publishing Market Watch",
    category: "publishing",
    owner: "Publishing Hub",
    mode: "draft-first",
    kpi: "Bedre bokposisjonering og nisjevalg",
    purpose: "Fanger markedssignaler fra publishing/Amazon-landskapet.",
    expectedOutput: "Market watch insights eller tasks.",
    safety: "requireCronApi + safe-mode.",
    actionKeys: ["Publishing Market Watch v1 (Amazon signaler)", "publishing-market-watch"],
  },
  "/api/cron/lead-nurture": {
    name: "Lead Nurture",
    category: "revenue",
    owner: "Revenue OS",
    mode: "dry-run-default",
    kpi: "Svarrate, bookingrate og reaktiverte leads",
    purpose: "Følger opp ferske eller sovende leads med kontrollerte sekvenser.",
    expectedOutput: "Dry-run events som standard, eller sendte e-poster når live er eksplisitt aktivert.",
    safety: "requireCronApi + NURTURE_LIVE gate.",
    actionKeys: ["lead_nurture", "lead-nurture"],
  },
};

const crons = (vercelConfig.crons || []) as VercelCronDefinition[];

export function getConfiguredVercelCrons(): VercelCronDefinition[] {
  return crons.map((cron) => ({ path: cron.path, schedule: cron.schedule }));
}

export function cronScheduleLabel(schedule: string) {
  const [minute, hour, dayOfMonth, month, dayOfWeek] = schedule.split(/\s+/);
  if (dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    return `Daglig ${hour.padStart(2, "0")}:${minute.padStart(2, "0")} UTC`;
  }
  if (dayOfMonth === "*" && month === "*" && dayOfWeek !== "*") {
    const days: Record<string, string> = {
      "0": "søndag",
      "1": "mandag",
      "2": "tirsdag",
      "3": "onsdag",
      "4": "torsdag",
      "5": "fredag",
      "6": "lørdag",
    };
    return `Ukentlig ${days[dayOfWeek] || `dag ${dayOfWeek}`} ${hour.padStart(2, "0")}:${minute.padStart(2, "0")} UTC`;
  }
  return schedule;
}

export function staleAfterHours(schedule: string) {
  const [, , dayOfMonth, month, dayOfWeek] = schedule.split(/\s+/);
  if (dayOfMonth === "*" && month === "*" && dayOfWeek !== "*") return 8 * 24;
  return 36;
}

function safeTime(value?: string | null) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function text(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function outputSteps(run: AutomationRunLike) {
  const outputs = run.output?.outputs;
  return Array.isArray(outputs) ? outputs : [];
}

function runMatches(run: AutomationRunLike, path: string, metadata: AutomationRegistryMetadata) {
  const keys = [path, metadata.name, ...(metadata.actionKeys || [])].map(text).filter(Boolean);
  const input = run.input || {};
  const haystack = [
    input.path,
    input.route,
    input.name,
    input.action,
    ...outputSteps(run).flatMap((item: any) => [
      item?.step?.path,
      item?.step?.type,
      item?.result?.path,
    ]),
  ].map(text);

  return keys.some((key) => haystack.some((value) => value.includes(key)));
}

function logMatches(log: AutomationLogLike, path: string, metadata: AutomationRegistryMetadata) {
  const keys = [path, metadata.name, ...(metadata.actionKeys || [])].map(text).filter(Boolean);
  const haystack = [log.action, log.details?.path, log.details?.route, log.details?.name].map(text);
  return keys.some((key) => haystack.some((value) => value.includes(key)));
}

function latestRunFor(
  path: string,
  metadata: AutomationRegistryMetadata,
  runs: AutomationRunLike[],
  logs: AutomationLogLike[],
) {
  const runCandidates = runs
    .filter((run) => runMatches(run, path, metadata))
    .map((run) => ({
      at: safeTime(run.finished_at || run.started_at),
      status: run.status || "unknown",
      error: run.error || null,
    }));

  const logCandidates = logs
    .filter((log) => logMatches(log, path, metadata))
    .map((log) => ({
      at: safeTime(log.created_at),
      status: log.status || "unknown",
      error: String(log.details?.error || "") || null,
    }));

  return [...runCandidates, ...logCandidates]
    .filter((item): item is { at: number; status: string; error: string | null } => Boolean(item.at))
    .sort((a, b) => b.at - a.at)[0] || null;
}

function statusFor(value: string): AutomationRegistryItem["lastStatus"] {
  const normalized = text(value);
  if (normalized === "success") return "success";
  if (normalized === "error" || normalized === "failed") return "error";
  if (normalized === "running") return "running";
  if (normalized === "cancelled" || normalized === "canceled") return "cancelled";
  return "unknown";
}

function healthFor(
  latest: ReturnType<typeof latestRunFor>,
  schedule: string,
  now: Date,
): AutomationHealth {
  if (!latest) return "unknown";
  const status = statusFor(latest.status);
  if (status === "error" || status === "cancelled") return "attention";
  if (status === "running") return "healthy";
  const ageHours = (now.getTime() - latest.at) / 3_600_000;
  if (ageHours > staleAfterHours(schedule)) return "stale";
  return "healthy";
}

export function buildAutomationRegistry(
  runs: AutomationRunLike[] = [],
  logs: AutomationLogLike[] = [],
  now = new Date(),
): { items: AutomationRegistryItem[]; summary: AutomationRegistrySummary; warnings: string[] } {
  const warnings: string[] = [];
  const items = getConfiguredVercelCrons().map((cron) => {
    const metadata = AUTOMATION_REGISTRY[cron.path];
    if (!metadata) {
      warnings.push(`Missing registry metadata for ${cron.path}`);
    }
    const resolved = metadata || {
      name: cron.path,
      category: "maintenance" as const,
      owner: "System",
      mode: "manual-review" as const,
      kpi: "Ukjent",
      purpose: "Mangler registry-metadata.",
      expectedOutput: "Ukjent",
      safety: "Ukjent",
    };
    const latest = latestRunFor(cron.path, resolved, runs, logs);
    return {
      path: cron.path,
      schedule: cron.schedule,
      scheduleLabel: cronScheduleLabel(cron.schedule),
      ...resolved,
      lastRunAt: latest ? new Date(latest.at).toISOString() : null,
      lastStatus: latest ? statusFor(latest.status) : "unknown",
      lastError: latest?.error || null,
      health: healthFor(latest, cron.schedule, now),
      staleAfterHours: staleAfterHours(cron.schedule),
    } satisfies AutomationRegistryItem;
  });

  const summary: AutomationRegistrySummary = {
    total: items.length,
    live: items.filter((item) => item.mode === "live").length,
    draftFirst: items.filter((item) => item.mode === "draft-first").length,
    manualReview: items.filter((item) => item.mode === "manual-review").length,
    dryRunDefault: items.filter((item) => item.mode === "dry-run-default").length,
    healthy: items.filter((item) => item.health === "healthy").length,
    attention: items.filter((item) => item.health === "attention").length,
    stale: items.filter((item) => item.health === "stale").length,
    unknown: items.filter((item) => item.health === "unknown").length,
  };

  return { items, summary, warnings };
}
