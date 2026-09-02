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
import { channelLearningScope } from "@/lib/marketing/learning-scope";
import {
  approvedAssetHash,
  buildMarketingPlan,
  channelFormatFitness,
  checkClaims,
  contentNoveltyScore,
  contentPublishabilityGate,
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
    /** Eksakt caption som sendes til Meta (vises i approval-kortet, del av hash). */
    caption?: string; accountId?: string; service?: string;
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
  opts: { level?: MarketingRunState["level"]; marketingRunId?: string; correlationId?: string } = {},
): Promise<{ run: MarketingRunState; plan: ReturnType<typeof buildMarketingPlan>; recommendation: Awaited<ReturnType<typeof recommendForGeneration>> | undefined; trace: ActionTraceEntry[] }> {
  const run = createMarketingRun({
    brandId: input.brandId,
    level: opts.level ?? "copilot",
    marketingRunId: opts.marketingRunId,
    correlationId: opts.correlationId,
    now: deps.now?.(),
  });
  const learningScope = input.channels?.length === 1
    ? channelLearningScope(input.brandId, input.channels[0])
    : input.brandId;
  const recommendation = await recommendForGeneration(deps.supabase, { scope: learningScope }).catch(() => undefined);
  const plan = buildMarketingPlan(input, { marketingRunId: run.marketingRunId, correlationId: run.correlationId, recommendation });

  const trace: ActionTraceEntry[] = [
    { step: "learning", actor: "learning", summary: `${Object.keys(plan.favoredDimensions).length} favored dims, ${plan.avoidedDimensions.length} avoided`, detail: { scope: learningScope } },
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
  return { run, plan, recommendation, trace };
}

export interface DispatchResult {
  publicationId: string;
  state: PublicationState | "regenerate" | "skipped";
  mode: string;
  qualityScore: number | null;
  published: boolean;
  approvalId: string | null;
  /** Låst approved_asset_hash (samme som executor re-verifiserer). */
  assetHash?: string;
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
  args: {
    asset: GeneratedAsset; brief: ContentBrief; run: MarketingRunState; history?: ContentHistoryItem[];
    publicationId?: string; brandTerms?: string[]; preapprovedFormat?: boolean; brand?: BrandContext;
    account?: { accountId: string } | null; service?: string | null;
    sourceType?: string; sourceId?: string | null; reuseMode?: string | null; propertyIds?: string[];
  },
): Promise<DispatchResult> {
  const { asset, brief, run } = args;
  const publicationId = args.publicationId ?? `pub_${asset.contentId}_${asset.channel}`;
  const idempotencyKey = publicationIdempotencyKey(run.marketingRunId, publicationId);
  const nowIso = () => new Date(deps.now?.() ?? new Date()).toISOString();
  const caption = [asset.headline, asset.body, asset.cta].filter(Boolean).join("\n");
  const trace: ActionTraceEntry[] = [];

  const persist = async (fields: Record<string, unknown>) => {
    const { error } = await deps.supabase.from("marketing_publications").upsert(
      {
        publication_id: publicationId, idempotency_key: idempotencyKey, marketing_run_id: run.marketingRunId,
        brand_id: run.brandId, campaign_id: brief.campaignId, content_id: asset.contentId, channel: asset.channel,
        service: args.service ?? null, account_id: args.account?.accountId ?? null, publishing_account_id: args.account?.accountId ?? null,
        source_type: args.sourceType ?? "generated", source_id: args.sourceId ?? null, reuse_mode: args.reuseMode ?? null,
        updated_at: nowIso(), ...fields,
      },
      { onConflict: "idempotency_key" },
    );
    if (error) throw new Error(`dispatchGeneratedAsset persist failed: ${error.message}`);
  };

  // 1) Novelty-gate.
  // Check both planning angle and final copy. Brief-only matching preserves the
  // original thematic fatigue guard; caption matching catches a reusable asset
  // whose text is posted verbatim under a newly generated brief.
  const noveltyByBrief = contentNoveltyScore({ genome: asset.genome, angle: brief.angle, campaignId: brief.campaignId }, args.history ?? [], { now: deps.now?.() });
  const noveltyByCaption = contentNoveltyScore({ genome: asset.genome, angle: caption, campaignId: brief.campaignId }, args.history ?? [], { now: deps.now?.() });
  const novelty = noveltyByCaption.similarity > noveltyByBrief.similarity ? noveltyByCaption : noveltyByBrief;
  trace.push({ step: "novelty", actor: "novelty", summary: `${novelty.decision} (novelty ${novelty.noveltyScore})`, detail: { similarity: novelty.similarity } });
  if (novelty.decision === "regenerate") {
    return { publicationId, state: "regenerate", mode: "n/a", qualityScore: null, published: false, approvalId: null, trace };
  }

  // 2) PUBLISHABILITY-gate — intern/meta-tekst blir ALDRI en post. Ingen approval.
  const pubCheck = contentPublishabilityGate(caption);
  trace.push({ step: "publishability", actor: "quality", summary: pubCheck.result });
  if (!pubCheck.publishable) {
    await persist({ state: "paused", asset_hash: null, quality_score: null, autonomy_mode: "n/a", approval_id: null });
    return { publicationId, state: "paused", mode: "n/a", qualityScore: null, published: false, approvalId: null, error: pubCheck.result, trace };
  }

  // 3) Quality-gate. AI-generert innhold får de strengere utfalls-/rollegatene.
  const isGenerated = (args.sourceType ?? "generated") === "generated";
  const quality = contentQualityGate(asset, { brandTerms: args.brandTerms, duplicateFree: true, brand: args.brand, generated: isGenerated });
  trace.push({ step: "quality", actor: "quality", summary: `score ${quality.score}${quality.requiresApproval ? " (sensitive → approval)" : ""}` });

  // 3b) HARD BLOCK (P0): AI-GENERERT innhold kan ALDRI være sin egen fakta-kilde.
  // Faktapåstander/tall (pris/kvm/soverom/statistikk …) uten uavhengig factSources
  // → BLOKKERT FØR approval (krever regenerering eller kilder). Legacy/menneske-
  // forfattet self-source (sourceType != generated + factSources satt) passerer.
  // Kvalitetsgaten er IKKE svekket — dette er en ekstra, strengere port.
  if (isGenerated && quality.requiresApproval) {
    const reason = `FACT_NOT_VERIFIED: AI-generert innhold med uverifiserte fakta (${quality.sensitiveClaimsWithoutSource.join(", ")}) — krever kilder eller regenerering før godkjenning.`;
    trace.push({ step: "fact-gate", actor: "quality", summary: reason });
    await persist({ state: "paused", asset_hash: null, quality_score: quality.score, autonomy_mode: "blocked", approval_id: null });
    return { publicationId, state: "paused", mode: "blocked", qualityScore: quality.score, published: false, approvalId: null, error: reason, trace };
  }

  // 3c) CLAIM-VERIFICATION (P1): målbare/komparative utfallspåstander («lavere
  // energikostnader», «høyere avkastning», «garantert …») krever UAVHENGIG
  // factSource. Brand Brain-positionering teller ikke som kilde. Udekket → blokk.
  if (isGenerated && quality.unsupportedOutcomeClaims.length) {
    const reason = `CLAIM_NOT_VERIFIED: AI-generert utfallspåstand uten uavhengig kilde (${quality.unsupportedOutcomeClaims.join(", ")}) — krever provenance eller omskriving før godkjenning.`;
    trace.push({ step: "claim-gate", actor: "quality", summary: reason });
    await persist({ state: "paused", asset_hash: null, quality_score: quality.score, autonomy_mode: "blocked", approval_id: null });
    return { publicationId, state: "paused", mode: "blocked", qualityScore: quality.score, published: false, approvalId: null, error: reason, trace };
  }

  // 3d) BRAND-ROLE (P1): eierskaps-/rollepåstand («våre boliger») krever at
  // Brand Brain eksplisitt støtter eier-/utbyggerrolle. Zen Eco Homes er
  // rådgiver/formidler → skal si «boligene vi formidler», ikke «våre boliger».
  if (isGenerated && quality.roleViolations.length) {
    const reason = `BRAND_ROLE_MISMATCH: AI-generert eierskapspåstand (${quality.roleViolations.join(", ")}) uten støtte i Brand Brain — omskriv til formidler-/rådgiverrolle før godkjenning.`;
    trace.push({ step: "role-gate", actor: "quality", summary: reason });
    await persist({ state: "paused", asset_hash: null, quality_score: quality.score, autonomy_mode: "blocked", approval_id: null });
    return { publicationId, state: "paused", mode: "blocked", qualityScore: quality.score, published: false, approvalId: null, error: reason, trace };
  }

  // 3e) CHANNEL-FORMAT-FITNESS (P0): en Meta-caption skal ALDRI inneholde
  // produksjonsanvisninger (reel-manus/HOOK/SCENE/Tekst-overlay …). Uansett
  // format — for reel kan manus ligge i eget felt, men captionen må være ren.
  const fitness = channelFormatFitness(caption);
  if (!fitness.ok) {
    trace.push({ step: "format-gate", actor: "quality", summary: fitness.reason });
    await persist({ state: "paused", asset_hash: null, quality_score: quality.score, autonomy_mode: "blocked", approval_id: null });
    return { publicationId, state: "paused", mode: "blocked", qualityScore: quality.score, published: false, approvalId: null, error: fitness.reason, trace };
  }

  // 4) Policy Engine + nivå-tak.
  const action = publishActionFor(asset.channel);
  const decision = resolveMarketingAutonomy(action, run.level, { channel: asset.channel, confidence: quality.score / 100, dataQuality: quality.score / 100, preapprovedFormat: args.preapprovedFormat });
  let mode = decision.mode;
  if (quality.requiresApproval && mode === "live") mode = "manual-review";
  if (args.brand) {
    const claim = checkClaims(caption, args.brand);
    if (!claim.ok) {
      if (mode === "live") mode = "manual-review";
      trace.push({ step: "brand", actor: "quality", summary: `forbudt påstand: ${claim.forbiddenHits.join(", ")} → godkjenning` });
    }
  }
  trace.push({ step: "policy", actor: "policy", summary: `${mode} (policy ${decision.policyMode}, risk ${decision.risk})`, mode });

  // 5) LÅS endelig payload: konto + asset-hash (før approval).
  const assetHash = approvedAssetHash({
    sourceContentId: args.sourceId ?? asset.contentId, finalCopy: caption, finalMedia: JSON.stringify(asset.media ?? {}),
    brandId: run.brandId, accountId: args.account?.accountId ?? "", channel: asset.channel,
    propertyIds: args.propertyIds ?? [], cta: asset.cta ?? "", factSources: asset.factSources ?? [],
  });

  // 6) Persistér endelig publikasjon (all payload låst) FØR approval.
  await persist({ state: "draft", asset_hash: assetHash, quality_score: quality.score, autonomy_mode: mode, approval_id: null });

  // 7) Handling per modus. Approval opprettes SIST, med eksakt caption.
  const guardState = await deps.loadGuardState();
  let state: PublicationState = "draft";
  let published = false;
  let approvalId: string | null = null;
  let error: string | undefined;

  if (mode === "live") {
    const verdict = evaluateGuards(deps.guardConfig ?? DEFAULT_GUARD_CONFIG, guardState, { kind: "publish", channel: asset.channel, brandId: run.brandId, campaignId: brief.campaignId });
    trace.push({ step: "guard", actor: "guard", summary: verdict.allowed ? "OK" : verdict.reason, detail: { tripBreaker: verdict.tripBreaker ?? false } });
    if (verdict.allowed && deps.publisher) {
      const res = await deps.publisher.publish(asset, { idempotencyKey, publicationId, contentId: asset.contentId, campaignId: brief.campaignId, marketingRunId: run.marketingRunId, channel: asset.channel, accountId: args.account?.accountId });
      state = res.state; published = res.state === "published" || res.state === "scheduled";
      trace.push({ step: "publish", actor: "publisher", summary: `publisert (${res.state})` });
    } else {
      state = "paused";
    }
    await persist({ state, asset_hash: assetHash, quality_score: quality.score, autonomy_mode: mode, approval_id: null });
  } else if (mode === "manual-review" || mode === "human-required") {
    if (!deps.requestApproval) {
      state = "paused";
      error = "APPROVAL_SERVICE_UNAVAILABLE";
      trace.push({ step: "approval", actor: "policy", summary: "APPROVAL_SERVICE_UNAVAILABLE — publisering blokkert (fail-closed)", mode });
    } else {
      approvalId = await deps.requestApproval({
        publicationId, contentId: asset.contentId, channel: asset.channel, reason: decision.reason,
        risk: decision.risk, decisionMode: mode, confidence: quality.score / 100,
        caption, accountId: args.account?.accountId, service: args.service ?? undefined,
      });
      state = "draft";
      trace.push({ step: "approval", actor: "policy", summary: `utkast i godkjenningskø (${approvalId})` });
    }
    await persist({ state, asset_hash: assetHash, quality_score: quality.score, autonomy_mode: mode, approval_id: approvalId });
  } else if (mode === "blocked") {
    state = "paused";
    await persist({ state, asset_hash: assetHash, quality_score: quality.score, autonomy_mode: mode, approval_id: null });
  }

  return { publicationId, state, mode, qualityScore: quality.score, published, approvalId, assetHash, error, trace };
}
