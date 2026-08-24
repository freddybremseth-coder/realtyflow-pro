/**
 * Phase 7 — Autonomous Loop-orkestrator (bak DI, byggetrygg).
 *
 * Binder den kontrollerte sløyfen sammen og persisterer den, men eier INGEN
 * egen autonomi: planlegging leser learning (recommendForGeneration), hvert
 * asset går gjennom novelty-gate → quality-gate → Policy Engine (nivå-tak) →
 * runaway-guards. På copilot blir publisering ALLTID utkast som krever
 * godkjenning — aldri auto-publisert. Ekte kanal-API-er er en publisher-DI-søm
 * (ikke brukt på copilot). Publikasjoner er idempotente (ingen dobbel-posting).
 */

import { recommendForGeneration } from "@/services/marketing/learning-adapter";
import {
  buildMarketingPlan,
  checkClaims,
  contentNoveltyScore,
  contentQualityGate,
  createMarketingRun,
  DEFAULT_GUARD_CONFIG,
  evaluateGuards,
  publicationIdempotencyKey,
  resolveMarketingAutonomy,
  type BrandContext,
  type ContentBrief,
  type ContentHistoryItem,
  type DirectorInput,
  type GeneratedAsset,
  type GuardConfig,
  type GuardState,
  type MarketingAction,
  type MarketingRunState,
  type PublicationState,
} from "@/lib/marketing/autonomous";
import type { MarketingChannel } from "@/lib/marketing/genome";
import type { MarketingSupabaseLike } from "@/services/marketing/adapters";

export interface ActionTraceEntry {
  step: string;
  actor: "director" | "learning" | "creative" | "novelty" | "quality" | "policy" | "guard" | "publisher";
  summary: string;
  mode?: string;
  detail?: Record<string, unknown>;
}

/** Ekte kanal-publisering — DI-søm. Ikke brukt på copilot (kun godkjente/live). */
export interface PublishContext {
  scheduledFor?: string | null;
  idempotencyKey: string;
  publicationId?: string;
  contentId?: string;
  campaignId?: string;
  marketingRunId?: string;
  correlationId?: string;
  channel?: string;
  /** Eksplisitt konto (external_id) — publisher velger aldri selv (P0). */
  accountId?: string;
}
export interface ChannelPublisher {
  publish(asset: GeneratedAsset, opts: PublishContext): Promise<{ state: PublicationState; externalId?: string; dryRun?: boolean }>;
}

export interface OrchestratorDeps {
  supabase: MarketingSupabaseLike;
  guardConfig?: GuardConfig;
  loadGuardState: () => Promise<GuardState>;
  publisher?: ChannelPublisher;
  /**
   * Opprett godkjenningsforespørsel når publisering krever menneske. Returner
   * approvalId. FAIL-CLOSED: er denne ikke konfigurert for en kundevendt
   * manual-review/human-required-handling, blir publikasjonen paused med
   * APPROVAL_SERVICE_UNAVAILABLE — ikke et stille draft.
   */
  requestApproval?: (input: {
    publicationId: string; contentId: string; channel: string; reason: string;
    risk?: "low" | "medium" | "high" | "critical"; decisionMode?: string; confidence?: number; estimatedOpportunityEur?: number;
  }) => Promise<string>;
  now?: () => Date;
}

function publishActionFor(channel: MarketingChannel): MarketingAction {
  return channel === "website" || channel === "linkedin" ? "publish_article" : "publish_social";
}

/**
 * Planleggingssteg: les learning, bygg plan, persistér run. Sideeffektfritt
 * utover å skrive marketing_runs.
 */
export async function planMarketingRun(
  deps: OrchestratorDeps,
  input: DirectorInput,
  opts: { level?: MarketingRunState["level"] } = {},
): Promise<{ run: MarketingRunState; plan: ReturnType<typeof buildMarketingPlan>; trace: ActionTraceEntry[] }> {
  const run = createMarketingRun({ brandId: input.brandId, level: opts.level ?? "copilot", now: deps.now?.() });
  const recommendation = await recommendForGeneration(deps.supabase, { scope: input.brandId }).catch(() => undefined);
  const plan = buildMarketingPlan(input, { marketingRunId: run.marketingRunId, correlationId: run.correlationId, recommendation });

  const trace: ActionTraceEntry[] = [
    { step: "learning", actor: "learning", summary: `${Object.keys(plan.favoredDimensions).length} favored dims, ${plan.avoidedDimensions.length} avoided` },
    { step: "plan", actor: "director", summary: `plan laget (${plan.production.exploit}/${plan.production.adjacent}/${plan.production.experiment}), mål ${plan.goals[0]?.kind}` },
  ];

  const { error } = await deps.supabase.from("marketing_runs").upsert(
    {
      marketing_run_id: run.marketingRunId,
      correlation_id: run.correlationId,
      brand_id: run.brandId,
      level: run.level,
      stage: run.stage,
      checkpoints: run.checkpoints,
      plan,
      action_trace: trace,
      updated_at: new Date(deps.now?.() ?? new Date()).toISOString(),
    },
    { onConflict: "marketing_run_id" },
  );
  if (error) throw new Error(`planMarketingRun persist failed: ${error.message}`);
  return { run, plan, trace };
}

export interface DispatchResult {
  publicationId: string;
  state: PublicationState | "regenerate" | "skipped";
  mode: string;
  qualityScore: number | null;
  published: boolean;
  approvalId: string | null;
  /** Satt ved fail-closed-tilstander, f.eks. APPROVAL_SERVICE_UNAVAILABLE. */
  error?: string;
  trace: ActionTraceEntry[];
}

/**
 * Dispatch ett generert asset gjennom portene. Persisterer en publikasjon
 * (idempotent). Publiserer KUN når nivå + policy + guards alle tillater det —
 * på copilot betyr det aldri for kundevendt innhold.
 */
export async function dispatchGeneratedAsset(
  deps: OrchestratorDeps,
  args: { asset: GeneratedAsset; brief: ContentBrief; run: MarketingRunState; history?: ContentHistoryItem[]; publicationId?: string; brandTerms?: string[]; preapprovedFormat?: boolean; brand?: BrandContext },
): Promise<DispatchResult> {
  const { asset, brief, run } = args;
  const publicationId = args.publicationId ?? `pub_${asset.contentId}_${asset.channel}`;
  const trace: ActionTraceEntry[] = [];

  // 1) Novelty-gate.
  const novelty = contentNoveltyScore({ genome: asset.genome, angle: brief.angle, campaignId: brief.campaignId }, args.history ?? [], { now: deps.now?.() });
  trace.push({ step: "novelty", actor: "novelty", summary: `${novelty.decision} (novelty ${novelty.noveltyScore})`, detail: { similarity: novelty.similarity } });
  if (novelty.decision === "regenerate") {
    return { publicationId, state: "regenerate", mode: "n/a", qualityScore: null, published: false, approvalId: null, trace };
  }

  // 2) Quality-gate.
  const quality = contentQualityGate(asset, { brandTerms: args.brandTerms, duplicateFree: true });
  trace.push({ step: "quality", actor: "quality", summary: `score ${quality.score}${quality.requiresApproval ? " (sensitive → approval)" : ""}` });

  // 3) Policy Engine + nivå-tak.
  const action = publishActionFor(asset.channel);
  const decision = resolveMarketingAutonomy(action, run.level, { channel: asset.channel, confidence: quality.score / 100, dataQuality: quality.score / 100, preapprovedFormat: args.preapprovedFormat });
  let mode = decision.mode;
  // Sensitive fakta uten kilde kan aldri gå live.
  if (quality.requiresApproval && mode === "live") mode = "manual-review";
  // Brand Brain: forbudte påstander kan aldri gå live (fail-safe).
  if (args.brand) {
    const claim = checkClaims([asset.headline, asset.body, asset.cta].filter(Boolean).join(" "), args.brand);
    if (!claim.ok) {
      if (mode === "live") mode = "manual-review";
      trace.push({ step: "brand", actor: "quality", summary: `forbudt påstand: ${claim.forbiddenHits.join(", ")} → godkjenning` });
    }
  }
  trace.push({ step: "policy", actor: "policy", summary: `${mode} (policy ${decision.policyMode}, risk ${decision.risk})`, mode });

  // 4) Runaway-guards (kun relevant hvis vi faktisk skal publisere).
  const guardState = await deps.loadGuardState();
  let state: PublicationState = "draft";
  let published = false;
  let approvalId: string | null = null;
  let error: string | undefined;

  if (mode === "live") {
    const verdict = evaluateGuards(deps.guardConfig ?? DEFAULT_GUARD_CONFIG, guardState, { kind: "publish", channel: asset.channel, brandId: run.brandId, campaignId: brief.campaignId });
    trace.push({ step: "guard", actor: "guard", summary: verdict.allowed ? "OK" : verdict.reason, detail: { tripBreaker: verdict.tripBreaker ?? false } });
    if (verdict.allowed && deps.publisher) {
      const idk = publicationIdempotencyKey(run.marketingRunId, publicationId);
      const res = await deps.publisher.publish(asset, { idempotencyKey: idk });
      state = res.state;
      published = res.state === "published" || res.state === "scheduled";
      trace.push({ step: "publish", actor: "publisher", summary: `publisert (${res.state})` });
    } else {
      state = "paused";
    }
  } else if (mode === "manual-review" || mode === "human-required") {
    // FAIL-CLOSED: kundevendt handling UTEN approval-tjeneste blir ikke et stille
    // draft — den pauses eksplisitt med APPROVAL_SERVICE_UNAVAILABLE.
    if (!deps.requestApproval) {
      state = "paused";
      error = "APPROVAL_SERVICE_UNAVAILABLE";
      trace.push({ step: "approval", actor: "policy", summary: "APPROVAL_SERVICE_UNAVAILABLE — publisering blokkert (fail-closed)", mode });
    } else {
      approvalId = await deps.requestApproval({
        publicationId, contentId: asset.contentId, channel: asset.channel, reason: decision.reason,
        risk: decision.risk, decisionMode: mode, confidence: quality.score / 100,
      });
      state = "draft";
      trace.push({ step: "approval", actor: "policy", summary: `utkast i godkjenningskø (${approvalId})` });
    }
  } else if (mode === "blocked") {
    state = "paused";
  }

  // 5) Persistér publikasjon (idempotent på idempotency_key).
  const idempotencyKey = publicationIdempotencyKey(run.marketingRunId, publicationId);
  const { error: persistErr } = await deps.supabase.from("marketing_publications").upsert(
    {
      publication_id: publicationId,
      idempotency_key: idempotencyKey,
      marketing_run_id: run.marketingRunId,
      brand_id: run.brandId,
      campaign_id: brief.campaignId,
      content_id: asset.contentId,
      channel: asset.channel,
      state,
      approval_id: approvalId,
      quality_score: quality.score,
      autonomy_mode: mode,
      updated_at: new Date(deps.now?.() ?? new Date()).toISOString(),
    },
    { onConflict: "idempotency_key" },
  );
  if (persistErr) throw new Error(`dispatchGeneratedAsset persist failed: ${persistErr.message}`);

  return { publicationId, state, mode, qualityScore: quality.score, published, approvalId, error, trace };
}
