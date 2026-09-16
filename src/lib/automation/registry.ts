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

type AutomationSafety =
  | "legacy-neural"
  | "scheduler-safe"
  | "scheduler"
  | "cron-safe"
  | "cron-safe-engine"
  | "cron-api"
  | "cron-safe-review"
  | "nurture"
  | "cron";

type AutomationRegistryRow = readonly [
  path: string,
  name: string,
  category: AutomationCategory,
  owner: string,
  mode: AutomationMode,
  kpi: string,
  purpose: string,
  expectedOutput: string,
  safety: AutomationSafety,
  aliases?: readonly string[],
];

const REGISTRY_ROWS: AutomationRegistryRow[] = [
  ["/api/neural-beat/cron", "Neural Beat hovedcron", "neural-beat", "Re-Master Freddy", "live", "Nye musikkpubliseringer og kanalaktivitet", "Kjører hovedflyten for Neural Beat/Re-Master Freddy.", "Publiserings-/optimaliseringsresultater for musikkkanalen.", "legacy-neural", ["neural-beat", "neural_beat", "remaster"]],
  ["/api/neural-beat/thumbnail-ab", "Thumbnail A/B", "neural-beat", "Re-Master Freddy", "manual-review", "CTR og YouTube-visninger", "Tester og roterer thumbnails for å lære hva som får klikk.", "Thumbnail-testresultater eller forslag til forbedring.", "legacy-neural", ["thumbnail", "thumbnail_ab"]],
  ["/api/neural-beat/shorts-followup", "Shorts follow-up", "neural-beat", "Re-Master Freddy", "live", "Shorts-visninger og abonnentvekst", "Følger opp nyeste låter med ekstra Shorts-innhold.", "Én ekstra Short eller skip-resultat.", "legacy-neural", ["shorts", "shorts_followup"]],
  ["/api/neural-beat/weekly-mix", "Weekly mix", "neural-beat", "Re-Master Freddy", "draft-first", "Ukentlig kanalretensjon", "Lager ukentlig miks/oppsummering for musikkatalogen.", "Weekly mix-plan, draft eller publiseringsresultat.", "legacy-neural", ["weekly_mix", "weekly-mix"]],
  ["/api/cron/email-ingest", "Email ingest", "revenue", "Communications", "live", "Nye innkommende e-poster fanget", "Henter aktive brand-innbokser via IMAP og lagrer nye meldinger som CRM-/revenue-signaler.", "Nye email_messages, revenue events og oppdatert innbokshelse.", "scheduler-safe"],
  ["/api/cron/nexus-criteria-confirmation", "Criteria confirmation", "revenue", "Nexus Buyer Intelligence", "live", "Bekreftede kjøpskriterier", "Sender og behandler bekreftelse av tolket Buyer Profile før matching går videre.", "Bekreftede kriterier, korrigeringsløp eller work item for menneskelig tolkning.", "scheduler-safe", ["criteria_confirmation"]],
  ["/api/cron/email-auto-draft", "Email auto draft", "revenue", "Communications", "draft-first", "Svarutkast klare til review", "Lager kontekstbaserte svarutkast for innkommende e-post uten å sende dem automatisk.", "Nye eller oppdaterte e-postutkast.", "scheduler-safe"],
  ["/api/cron/email-crm-sync", "Email CRM sync", "revenue", "Communications", "live", "E-post koblet til riktig CRM-kontekst", "Kobler e-posttråder og meldinger mot kontakter, leads og salgsobjekter.", "Oppdaterte CRM-relasjoner og synkstatus.", "scheduler-safe"],
  ["/api/cron/nexus-buyer-profile-sync", "Buyer Profile sync", "revenue", "Nexus Buyer Intelligence", "live", "Buyer Profiles med ferske kriterier", "Synkroniserer kundesvar og CRM-evidens inn i Buyer Profile.", "Oppdaterte buyer profiles og kriteriesignaler.", "scheduler-safe", ["buyer_profile_sync"]],
  ["/api/cron/nexus-property-feedback", "Property feedback", "revenue", "Nexus Sales", "live", "Feedback knyttet til matching", "Fanger og strukturerer kundens reaksjoner på boligforslag og visninger.", "Oppdaterte feedback-signaler, kriterier og salgsoppfølging.", "scheduler-safe", ["property_feedback"]],
  ["/api/cron/nexus-viewing-coach", "Viewing coach", "revenue", "Nexus Sales", "draft-first", "Bedre visningsforberedelse", "Forbereder kunde- og boligspesifikk visningsveiledning før neste steg.", "Viewing-coach brief eller work item.", "scheduler-safe", ["viewing_coach"]],
  ["/api/cron/nexus-property-match-prep", "Property match prep", "revenue", "Nexus Sales", "live", "Match-klare Buyer Profiles", "Klargjør profiler og krav før selve property matching-kjeden.", "Match-klare kundesaker eller skip-resultat.", "scheduler-safe", ["property_match_prep"]],
  ["/api/cron/nexus-shortlist-prep", "Shortlist prep", "revenue", "Nexus Sales", "draft-first", "Kvalifiserte boliger per kunde", "Bygger og kvalitetssikrer shortlist fra property matches.", "Shortlist-utkast eller work item for videre review.", "scheduler-safe", ["shortlist_prep"]],
  ["/api/cron/nexus-presentation-prep", "Presentation prep", "revenue", "Nexus Sales", "draft-first", "Kundevennlige boligpresentasjoner", "Klargjør shortlist-data til presentasjon før utsendelse.", "Presentasjonsutkast med valgte boliger og begrunnelser.", "scheduler-safe", ["presentation_prep"]],
  ["/api/cron/nexus-no-match-followup", "No-match follow-up", "revenue", "Nexus Sales", "draft-first", "Flere avklarte kjøpskriterier", "Oppretter oppfølging når systemet ikke finner gode nok boligtreff.", "Oppfølgingsutkast, kriteriespørsmål eller work item.", "scheduler-safe", ["no_match_followup"]],
  ["/api/cron/nexus-send-preflight", "Send preflight", "revenue", "Nexus Sales", "live", "Trygge og komplette anbefalingsutsendelser", "Validerer mottaker, innhold, boligstatus og sendekrav før anbefaling sendes.", "Preflight-godkjenning, blokkering eller korrigeringssignal.", "scheduler-safe", ["send_preflight"]],
  ["/api/cron/nexus-property-recommendation-send", "Property recommendation send", "revenue", "Nexus Sales", "live", "Sendte relevante boligforslag", "Sender ferdig validerte boligforslag til kunden og registrerer resultatet.", "Sendestatus, kommunikasjonsevent og oppdatert salgsflyt.", "scheduler-safe", ["property_recommendation_send"]],
  ["/api/cron/nexus-outcome-snapshot", "Outcome snapshot", "reporting", "Nexus Revenue", "live", "Målbare resultater fra Nexus-flyten", "Tar periodiske snapshots av kommersielle og operative utfall.", "Outcome-snapshots for analyse og læring.", "scheduler-safe", ["outcome_snapshot"]],
  ["/api/cron/nexus-commercial-activation", "Commercial activation", "revenue", "Nexus Revenue", "live", "Flere aktive salgsmuligheter", "Aktiverer kommersielle neste steg når signaler og kriterier er sterke nok.", "Aktiverte opportunities, work items eller skip-resultat.", "scheduler-safe", ["commercial_activation"]],
  ["/api/cron/nexus-revenue-learning", "Nexus revenue learning", "reporting", "Nexus Revenue", "live", "Bedre konvertering fra læringssignaler", "Analyserer utfallet av Nexus-salgskjeden og lagrer læring til neste runde.", "Revenue-learning records og anbefalte justeringer.", "scheduler-safe", ["revenue_learning"]],
  ["/api/cron/communications-learning", "Communications learning", "reporting", "Communications", "live", "Bedre svar- og konverteringsrate", "Lærer av faktiske e-post- og kommunikasjonsutfall på tvers av brands.", "Kommunikasjonslæring, mønstre og anbefalte justeringer.", "cron-safe", ["communications_learning"]],
  ["/api/cron/movement-recommendation-snapshot", "Movement recommendation snapshot", "reporting", "Revenue OS", "live", "Prioriterte neste handlinger", "Lagrer snapshot av anbefalt pipeline-bevegelse og neste kommersielle handling.", "Movement recommendations for dashboard og læring.", "cron-safe", ["movement_recommendation_snapshot"]],
  ["/api/cron/market-data", "Market data", "reporting", "Revenue OS", "live", "Oppdaterte markedsindikatorer", "Holder markedsdata ferske for rapporter og beslutninger.", "Oppdaterte markedsrader eller rapportgrunnlag.", "cron-safe"],
  ["/api/cron/weekly-report", "Weekly report", "reporting", "Revenue OS", "draft-first", "Ukentlig styringsoversikt", "Produserer ukentlig rapportgrunnlag for drift og salg.", "Rapportutkast eller oppdaterte report records.", "cron-safe"],
  ["/api/cron/growth-engine", "Growth Engine", "growth", "Victoria", "draft-first", "Nye veksttiltak og leads", "Genererer prioriterte vekstactions på tvers av brands.", "growth_actions og growth_analysis_logs.", "cron-safe-engine", ["Growth Engine", "Victoria daglig vekstanalyse"]],
  ["/api/cron/saas-scanner", "SaaS scanner", "growth", "DemoSites", "manual-review", "Kvalifiserte DemoSites leads", "Scanner etter SaaS/DemoSites-muligheter.", "Nye eller oppdaterte SaaS opportunities.", "cron-safe"],
  ["/api/cron/saas-entitlements", "SaaS entitlements", "maintenance", "SaaS Platform", "live", "Korrekte plan- og tilgangsrettigheter", "Synkroniserer abonnements-/entitlement-state mot gjeldende SaaS-kunder.", "Oppdaterte entitlements eller skip-resultat.", "cron-safe", ["saas_entitlements"]],
  ["/api/cron/property-scanner", "Property scanner", "property", "Eiendom", "manual-review", "Nye relevante eiendomsobjekter", "Scanner etter eiendomssignaler og nye objekter.", "Property scan-resultater og mulige work items.", "cron-safe"],
  ["/api/cron/property-marketing", "Property marketing", "property", "Eiendom", "draft-first", "Flere kvalifiserte eiendomsleads", "Lager eller oppdaterer markedsføringsmateriale for eiendommer.", "Marketing copy, tasks eller publikasjonssignaler.", "cron-safe"],
  ["/api/cron/property-editorial", "Property editorial", "property", "Eiendom", "draft-first", "Bedre boligtekster og datakvalitet", "Køer og kvalitetssikrer redaksjonelle forbedringer av boligpresentasjoner.", "Oppdaterte eller foreslåtte property-editorial records.", "cron-safe", ["property_editorial"]],
  ["/api/cron/property-conversion-editorial", "Property Conversion V6", "property", "Eiendom", "live", "Andel boliger migrert til Conversion V6", "Prosesserer køen som konverterer eldre boligtekster til verifisert V6-format.", "Nye conversion-v6 tekster, claim-resultater og feilstatus.", "cron-safe", ["property_conversion_editorial", "conversion-v6"]],
  ["/api/cron/property-feed-source-refresh", "Property feed source refresh", "property", "Eiendom", "live", "Ferske kildedata for boliger", "Oppdaterer kilde-/feedgrunnlaget som eiendomsdata og redaksjonelle jobber bygger på.", "Oppdaterte feed sources og freshness-status.", "cron-safe", ["property_feed_source_refresh"]],
  ["/api/cron/auto-publish", "Auto publish", "growth", "Content Hub", "live", "Publiserte innlegg og rekkevidde", "Publiserer planlagt innhold som allerede er klart.", "Publiseringsresultater og eventuelle feil.", "cron-api", ["Publiser planlagt innhold"]],
  ["/api/cron/trending-tags", "Trending tags", "growth", "Content Hub", "draft-first", "Bedre innholdsoppdagelse", "Finner tags og trender som kan forbedre innholdsdistribusjon.", "Tag-anbefalinger eller oppdaterte trenddata.", "cron-safe"],
  ["/api/cron/storage-archive", "Storage archive", "maintenance", "System", "live", "Lavere lagringsrot og tryggere arkiv", "Arkiverer eldre storage-filer og holder systemet ryddig.", "Arkiverte filer eller skip-resultat.", "cron-safe"],
  ["/api/cron/publishing-autopilot", "Publishing Autopilot", "publishing", "Publishing Hub", "manual-review", "Flere bok-/publiseringsoppgaver til review", "Flytter egnede publishing work items fra TO_DO til REVIEW.", "Oppdaterte work items og draft-suggestions.", "cron-safe-review", ["Publishing Autopilot v1 (TO_DO → REVIEW)", "publishing_autopilot_v1"]],
  ["/api/cron/publishing-growth-loop", "Publishing Growth Loop", "publishing", "Publishing Hub", "draft-first", "Publishing-salgssignaler og nye salgsoppgaver", "Analyserer publishing-resultater og lager salgsoppgaver.", "Work items eller anbefalte veksttiltak.", "cron-safe", ["Publishing Growth Loop v1 (analyse -> salgsoppgaver)"]],
  ["/api/cron/publishing-market-watch", "Publishing Market Watch", "publishing", "Publishing Hub", "draft-first", "Bedre bokposisjonering og nisjevalg", "Fanger markedssignaler fra publishing/Amazon-landskapet.", "Market watch insights eller tasks.", "cron-safe", ["Publishing Market Watch v1 (Amazon signaler)"]],
  ["/api/cron/book-distribution", "Book distribution", "publishing", "Publishing Hub", "live", "Bøker distribuert til riktige kanaler", "Prosesserer publiseringsklare bokleveranser og distribusjonsstatus.", "Distribusjonsresultater, statusoppdateringer eller retry-signaler.", "cron-safe", ["book_distribution"]],
  ["/api/cron/marketing-autopilot", "Marketing Autopilot", "growth", "Growth OS", "draft-first", "Flere kvalifiserte publiseringer og leads", "Kjører brand-styrt markedsføringsautopilot og produserer neste innholdstiltak.", "Drafts, publiseringsjobber eller læringssignaler.", "scheduler-safe", ["marketing_autopilot"]],
  ["/api/cron/nexus-opportunity-sync", "Nexus opportunity sync", "revenue", "Nexus Revenue", "live", "CRM-opportunities med korrekt state", "Synkroniserer Nexus-signaler med kommersielle opportunities og pipeline.", "Oppdaterte opportunities og pipeline-state.", "cron-safe", ["opportunity_sync"]],
  ["/api/cron/nexus-mission-autopilot", "Nexus mission autopilot", "revenue", "Nexus", "live", "Fullførte Nexus-missions", "Plukker kjørbare Nexus missions og gjennomfører neste tillatte steg.", "Mission-resultater, work items eller blokkeringsstatus.", "scheduler-safe", ["mission_autopilot"]],
  ["/api/cron/remaster-source-sync", "Re-Master source sync", "neural-beat", "Re-Master Freddy", "live", "Katalogkilder i synk", "Synkroniserer Re-Master Freddy-kilder og kataloggrunnlag før produksjon og publisering.", "Oppdaterte source records og reconciliation-status.", "scheduler-safe", ["remaster_source_sync"]],
  ["/api/cron/remaster-health-monitor", "Re-Master health monitor", "neural-beat", "Re-Master Freddy", "live", "Stabil publiseringspipeline", "Kontrollerer Re-Master pipeline, kanaltilkoblinger og jobber som har stoppet.", "Health-events, recovery-signaler og feilstatus.", "scheduler-safe", ["remaster_health_monitor"]],
  ["/api/cron/remaster-mix-worker", "Re-Master mix worker", "neural-beat", "Re-Master Freddy", "live", "Produserte miks-jobber", "Starter og behandler køede Re-Master mix-produksjoner.", "Startede workflows, ferdige mix-jobber eller feilstatus.", "scheduler", ["remaster_mix_worker"]],
  ["/api/cron/remaster-playlist-recovery", "Re-Master playlist recovery", "neural-beat", "Re-Master Freddy", "live", "Playlister i korrekt state", "Gjenoppretter manglende eller feilroutede playlist-relasjoner.", "Reconciled playlist-state og recovery-resultater.", "scheduler", ["remaster_playlist_recovery"]],
  ["/api/cron/remaster-youtube-public-reconcile", "YouTube public reconcile", "neural-beat", "Re-Master Freddy", "live", "Offentlige videoer med korrekt synlighet", "Reconcilerer forventet og faktisk public-state på Re-Master YouTube.", "Synlighetsendringer, reconciliation-resultater eller avvik.", "scheduler-safe", ["youtube_public_reconcile"]],
  ["/api/cron/marketing-growth-metrics", "Marketing growth metrics", "reporting", "Growth OS", "live", "Ferske vekstmetrikker", "Samler resultatdata fra markedsføring slik at Growth OS kan måle effekt.", "Oppdaterte growth metrics og kanalresultater.", "scheduler-safe", ["marketing_growth_metrics"]],
  ["/api/cron/remaster-analytics-snapshot", "Re-Master analytics snapshot", "reporting", "Re-Master Freddy", "live", "Ferske kanal- og innholdsmetrikker", "Tar daglig snapshot av Re-Master analytics for trend- og effektmåling.", "Analytics snapshots for videoer, kanaler og katalog.", "scheduler-safe", ["remaster_analytics_snapshot"]],
  ["/api/cron/remaster-growth-loop", "Re-Master growth loop", "neural-beat", "Re-Master Freddy", "draft-first", "Målbare forbedringer i views og engagement", "Bruker analytics til å foreslå og aktivere neste Re-Master veksttiltak.", "Growth actions, metadataforbedringer eller nye work items.", "scheduler-safe", ["remaster_growth_loop"]],
  ["/api/cron/lead-nurture", "Lead Nurture", "revenue", "Revenue OS", "dry-run-default", "Svarrate, bookingrate og reaktiverte leads", "Følger opp ferske eller sovende leads med kontrollerte sekvenser.", "Dry-run events som standard, eller sendte e-poster når live er eksplisitt aktivert.", "nurture"],
  ["/api/cron/demosites-followup", "DemoSites follow-up", "growth", "DemoSites", "live", "Demoer konvertert til ordre", "Sender idempotente midway/final-oppfølginger for aktive DemoSites-demoer.", "Sendte oppfølgings-e-poster og followup-status på demoordre.", "cron", ["demosites_followup"]],
];

function safetyLabel(value: AutomationSafety) {
  switch (value) {
    case "legacy-neural":
      return "Cron-secret sjekkes i route; bør standardiseres mot requireCronApi.";
    case "scheduler-safe":
      return "requireNexusSchedulerApi + safe-mode.";
    case "scheduler":
      return "requireNexusSchedulerApi.";
    case "cron-safe-engine":
      return "requireCronApi + safe-mode. Engine eier persistens.";
    case "cron-api":
      return "requireCronApi.";
    case "cron-safe-review":
      return "requireCronApi + safe-mode. Stopper før publisering.";
    case "nurture":
      return "requireCronApi + NURTURE_LIVE gate.";
    case "cron":
      return "Cron-secret sjekkes direkte i route.";
    default:
      return "requireCronApi + safe-mode.";
  }
}

export const AUTOMATION_REGISTRY: Record<string, AutomationRegistryMetadata> = Object.fromEntries(
  REGISTRY_ROWS.map((row) => {
    const [path, name, category, owner, mode, kpi, purpose, expectedOutput, safety, aliases = []] = row;
    const slug = path.split("/").pop() || path;
    const generatedKeys = path.startsWith("/api/cron/") ? [slug, slug.replace(/-/g, "_")] : [];
    const actionKeys = Array.from(new Set([...generatedKeys, ...aliases]));
    return [path, { name, category, owner, mode, kpi, purpose, expectedOutput, safety: safetyLabel(safety), actionKeys }];
  }),
);

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
