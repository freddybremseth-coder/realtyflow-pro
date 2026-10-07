export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { requireNexusSchedulerApi } from "@/lib/nexus/scheduler-auth";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { channelLearningScope } from "@/lib/marketing/learning-scope";
import { allocateChannelProduction, shouldProduceChannelWithinOutcomeQuota } from "@/lib/marketing/autonomous";
import {
  isSystemNextActionRequest,
  nextActionPublicationMode,
  resolveAutopilotRunChannels,
} from "@/lib/marketing/next-action-execution";
import { summarizeMarketingAutopilotHeartbeat } from "@/lib/marketing/autopilot-heartbeat";
import {
  autopilotRunIdentity,
  autopilotTargetHour,
  localAutopilotSlot,
  isPlannedAutopilotDay,
  parseLearnedAutopilotHour,
  shouldRunAutopilotSlot,
} from "@/lib/marketing/autopilot-safety";
import { recommendForGeneration } from "@/services/marketing/learning-adapter";
import { loadBrandContext } from "@/services/marketing/brand-brain-adapter";
import { createCampaignDraft, getServiceSupabase } from "@/services/marketing/campaign-production";
import { generateAutopilotInstagramImage } from "@/services/marketing/autopilot-media";
import { enqueueNextBestMarketingAction } from "@/services/marketing/next-action-executor";
import {
  autopilotEditorialMasterIdea,
  loadAutopilotEditorialSource,
} from "@/services/marketing/social-autopilot-source";
import {
  resolveAutopilotPostsPerWeek,
  selectAutopilotSocialConcept,
} from "@/lib/marketing/social-concepts";
import { pinosoAutopilotIdea } from "@/lib/marketing/pinoso-marketing-skills";
import {
  loadRemasterPromotionSource,
  markRemasterPromotionSourcePlanned,
  remasterPromotionMasterIdea,
  remasterPromotionMediaUrl,
  remasterPromotionMediaType,
} from "@/services/marketing/remaster-promotion-source";
import {
  loadSEOTopicSource,
  markSEOTopicSourcePlanned,
  seoTopicMasterIdea,
} from "@/services/marketing/seo-topic-source";

const SUPPORTED_CHANNELS = new Set(["instagram", "facebook"]);
const EXCLUDED_BRANDS = new Set(["soleada"]);
const RECOVERABLE_PROPERTY_COPY_ERRORS = [
  "FACT_NOT_VERIFIED",
  "CLAIM_NOT_VERIFIED",
  "BRAND_ROLE_MISMATCH",
  "CHANNEL_FORMAT_MISMATCH",
] as const;
type RunRequest = { id: string; brand_ids: string[] | null; channels: string[] | null; requested_by: string | null };
type CampaignRun = Awaited<ReturnType<typeof createCampaignDraft>>;

function configuredChannels(metadata: Record<string, unknown> | null | undefined): Array<"instagram" | "facebook"> {
  const raw = metadata?.autopilot_channels ?? metadata?.autopilot_scope;
  const values = Array.isArray(raw) ? raw.map(String) : typeof raw === "string" ? raw.split(",") : [];
  return Array.from(new Set(values.map((v) => v.trim().toLowerCase()).filter((v): v is "instagram" | "facebook" => SUPPORTED_CHANNELS.has(v))));
}

function isRecoverablePropertyCopyError(error: string | null | undefined): boolean {
  if (!error) return false;
  return RECOVERABLE_PROPERTY_COPY_ERRORS.some((prefix) => error.includes(prefix));
}

function safeFallbackIdentity(identity: ReturnType<typeof autopilotRunIdentity> | undefined) {
  if (!identity) return undefined;
  return {
    marketingRunId: `${identity.marketingRunId}_safe`,
    correlationId: `${identity.correlationId}_safe`,
  };
}

async function hasRecentAutoPublication(supabase: any, brandId: string, channel: string) {
  const since = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("marketing_publications")
    .select("publication_id")
    .eq("brand_id", brandId)
    .eq("channel", channel)
    .in("state", ["draft", "approved", "publishing", "published", "scheduled"])
    .gte("created_at", since)
    .limit(1);
  if (error) throw new Error(`RECENT_PUBLICATION_CHECK_FAILED: ${error.message}`);
  return !!data?.length;
}


async function loadWeeklyProductionCounts(
  supabase: any,
  brandId: string,
  channels: Array<"instagram" | "facebook">,
): Promise<Partial<Record<"instagram" | "facebook", number>> | null> {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("marketing_publications")
    .select("channel")
    .eq("brand_id", brandId)
    .in("channel", channels)
    .in("state", ["draft", "approved", "publishing", "published", "scheduled"])
    .gte("created_at", since)
    .limit(500);
  if (error) return null;
  const counts: Partial<Record<"instagram" | "facebook", number>> = {};
  for (const row of data ?? []) {
    const channel = String(row.channel ?? "").toLowerCase();
    if (channel !== "instagram" && channel !== "facebook") continue;
    counts[channel] = (counts[channel] ?? 0) + 1;
  }
  return counts;
}

async function markFailedControlledAutoPublications(
  supabase: any,
  brandId: string,
  run: { results: Array<{ publicationId: string; state?: string; mode?: string; error?: string }> },
) {
  const blockedIds = Array.from(new Set(run.results
    .filter((item) => Boolean(item.error) && item.mode === "blocked" && item.publicationId && item.publicationId !== "-")
    .map((item) => item.publicationId)));
  const failedIds = Array.from(new Set(run.results
    .filter((item) => item.state === "failed" && item.publicationId && item.publicationId !== "-")
    .map((item) => item.publicationId)));

  // A quality/policy block is not a provider failure. dispatchGeneratedAsset
  // already persists it as paused; keep that canonical state for Attention and
  // audit instead of rewriting it to failed and making Instagram look broken.
  if (!failedIds.length) return { failedIds: [] as string[], blockedIds, error: null as string | null };
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("marketing_publications")
    .update({ state: "failed", updated_at: now })
    .eq("brand_id", brandId)
    .in("publication_id", failedIds);
  return { failedIds, blockedIds, error: error ? `FAILED_PUBLICATION_STATE_UPDATE: ${error.message}` : null };
}

async function recordAutopilotHeartbeat(supabase: any, status: string, details: Record<string, unknown>) {
  try {
    await supabase.from("automation_logs").insert({
      action: "marketing_autopilot",
      agent_name: "nexus_marketing_autopilot",
      status,
      details,
    });
  } catch {
    // Observability is best-effort and must never block publishing.
  }
}

async function claimRunRequest(supabase: any): Promise<RunRequest | null> {
  const now = new Date().toISOString();
  await supabase.from("marketing_autopilot_run_requests").update({ status: "expired", completed_at: now }).eq("status", "pending").lt("expires_at", now);
  const { data } = await supabase.from("marketing_autopilot_run_requests").select("id,brand_ids,channels,requested_by").eq("status", "pending").gt("expires_at", now).order("requested_at", { ascending: true }).limit(1).maybeSingle();
  if (!data?.id) return null;
  const { data: claimed } = await supabase.from("marketing_autopilot_run_requests").update({ status: "claimed", claimed_at: now }).eq("id", data.id).eq("status", "pending").select("id,brand_ids,channels,requested_by").maybeSingle();
  return claimed?.id ? claimed as RunRequest : null;
}

function ideaForBrand(plan: any, guidance: string, dayIndex: number, localDate: string, channel: "instagram" | "facebook") {
  const role = String(plan?.metadata?.brand_role ?? "");
  const sources = Array.isArray(plan?.source_types) ? plan.source_types.join(", ") : "approved brand sources";
  const channelSafety = " Ikke skriv ‘lenke i bio’, ‘link in bio’, ‘se lenken i profilen’ eller tilsvarende med mindre en slik kanal-lenke er eksplisitt verifisert i brand-data. Bruk heller en direkte, sann CTA som ‘send oss en melding’ eller ‘kontakt oss’.";
  if (role === "real_estate" && String(plan?.brand_id ?? "") === "pinosoecolife") {
    return pinosoAutopilotIdea({ dayIndex, localDate, channel, guidance });
  }
  if (role === "real_estate") return `Presenter én aktuell bolig fra RealtyFlow Inventory på en troverdig, nyttig og salgsutløsende måte. Bruk kun verifiserte Inventory-fakta og brandets godkjente tone, CTA og rolle.${channelSafety}${guidance}`;
  if (role === "food_agriculture") return `Lag nyttig og visuelt merkevareinnhold basert på verifiserte kilder (${sources}). Prioriter gård, oliven, høsting, opprinnelse, EVOO, matbruk eller oppskrifter. Ikke fremsett helse- eller sykdomspåstander uten uavhengig dokumentasjon/review.${channelSafety}${guidance}`;
  if (role === "saas_b2b") return `Lag konkret B2B-innhold basert på verifiserte produktkilder (${sources}). Ikke finn på funksjoner, priser, kundetall eller resultater. Bruk en tydelig nytteverdi og relevant CTA.${channelSafety}${guidance}`;
  if (role === "personal_author") return `Lag forfatter- og bokinnhold basert på verifisert bokkatalog, bokutdrag, covers, artikler og nettsider. Ikke finn på anmeldelser, salgstall eller bokinnhold.${channelSafety}${guidance}`;
  if (role === "creator_media") return `Lag creator/media-innhold kun fra originalt eller autorisert materiale (${sources}). Ikke bruk eller antyd rettigheter til tredjepartsinnhold.${channelSafety}${guidance}`;
  return `Lag nyttig merkevareinnhold fra verifiserte brandkilder (${sources}). Ikke finn på fakta, priser, resultater eller claims.${channelSafety}${guidance}`;
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireNexusSchedulerApi(request);
  if (unauthorized) return unauthorized;
  const safeMode = await evaluateCronSafeMode("/api/cron/marketing-autopilot");
  if (safeMode.skip) return NextResponse.json({ success: true, skipped: true, mode: safeMode.mode, reason: safeMode.reason });

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  const timeZone = process.env.MARKETING_LEARNING_TIMEZONE || "Europe/Madrid";
  const { hour: localHour, dayIndex, localDate } = localAutopilotSlot(new Date(), timeZone);
  const queuedNextAction = await enqueueNextBestMarketingAction(supabase as any).catch((error) => ({
    queued: false as const,
    reason: `NEXT_ACTION_QUEUE_ERROR: ${error instanceof Error ? error.message : String(error)}`,
  }));
  const runRequest = await claimRunRequest(supabase).catch(() => null);
  const requestedBrands = new Set((runRequest?.brand_ids ?? []).map((v) => String(v).trim().toLowerCase()).filter(Boolean));
  const requestedChannels = new Set((runRequest?.channels ?? []).map((v) => String(v).trim().toLowerCase()).filter(Boolean));
  const manualRun = !!runRequest;
  const systemNextActionRun = isSystemNextActionRequest(runRequest?.requested_by);

  try {
    const { data: plans, error } = await supabase.from("marketing_brand_growth_plans").select("brand_id,status,autonomy_mode,metadata,source_types,posting_strategy").eq("status", "active").eq("autonomy_mode", "controlled_auto");
    if (error) throw new Error(error.message);
    const results: Array<Record<string, unknown>> = [];
    for (const plan of plans ?? []) {
      const brandId = String(plan.brand_id ?? "").trim().toLowerCase();
      if (!brandId || EXCLUDED_BRANDS.has(brandId)) continue;
      if (manualRun && !systemNextActionRun && requestedBrands.size && !requestedBrands.has(brandId)) continue;
      const preapprovedChannels = configuredChannels((plan.metadata ?? {}) as Record<string, unknown>);
      const requestedRunChannels = resolveAutopilotRunChannels({
        brandId,
        configuredChannels: preapprovedChannels,
        requestedChannels: manualRun ? Array.from(requestedChannels) : [],
        systemNextAction: systemNextActionRun,
        supportedChannels: SUPPORTED_CHANNELS,
      });
      const channels = systemNextActionRun
        ? Array.from(new Set([...preapprovedChannels, ...requestedRunChannels]))
        : requestedRunChannels;
      if (!channels.length) {
        results.push({
          brandId,
          skipped: true,
          reason: systemNextActionRun
            ? "requested_channel_not_pilot_or_supported"
            : "No requested/preapproved autopilot channels",
        });
        continue;
      }

      const brandRecommendation = !manualRun
        ? await recommendForGeneration(supabase as any, { scope: brandId }).catch(() => undefined)
        : undefined;
      const outcomeAllocation = allocateChannelProduction(100, channels, brandRecommendation);
      const outcomeQuotaActive = outcomeAllocation.some((item) => item.outcomeTier !== "none");
      const weeklyProductionCounts = await loadWeeklyProductionCounts(supabase, brandId, channels);
      const weeklyTarget = resolveAutopilotPostsPerWeek({
        metadata: (plan.metadata ?? {}) as Record<string, unknown>,
        postingStrategy: (plan.posting_strategy ?? {}) as Record<string, unknown>,
      });
      const orderedChannels = outcomeQuotaActive
        ? channels.slice().sort((a, b) =>
            (outcomeAllocation.find((item) => item.channel === b)?.count ?? 0)
            - (outcomeAllocation.find((item) => item.channel === a)?.count ?? 0),
          )
        : channels;

      for (const channel of orderedChannels) {
        const forcedRunForChannel = manualRun
          && requestedChannels.has(channel)
          && (!requestedBrands.size || requestedBrands.has(brandId));
        const requestedPublicationMode = systemNextActionRun && forcedRunForChannel
          ? nextActionPublicationMode({ configuredChannels: preapprovedChannels, targetChannel: channel })
          : null;
        if (!forcedRunForChannel && !weeklyProductionCounts) {
          results.push({ brandId, channel, skipped: true, reason: "weekly_production_history_unavailable" });
          continue;
        }
        const weeklyCount = weeklyProductionCounts?.[channel] ?? 0;
        if (!forcedRunForChannel && weeklyCount >= weeklyTarget) {
          results.push({
            brandId,
            channel,
            skipped: true,
            reason: "adaptive_weekly_target_reached",
            weeklyCount,
            weeklyTarget,
          });
          continue;
        }
        if (
          !forcedRunForChannel
          && outcomeQuotaActive
          && weeklyProductionCounts
          && !shouldProduceChannelWithinOutcomeQuota({
            channel,
            allocation: outcomeAllocation,
            actualCounts: weeklyProductionCounts,
          })
        ) {
          results.push({
            brandId,
            channel,
            skipped: true,
            reason: "outcome_weekly_quota_reached",
            weeklyProductionCounts,
            outcomeAllocation,
          });
          continue;
        }
        if (!forcedRunForChannel && !isPlannedAutopilotDay(dayIndex, plan?.posting_strategy?.days)) {
          results.push({ brandId, channel, skipped: true, reason: "not_configured_publishing_day", localDate });
          continue;
        }
        if (await hasRecentAutoPublication(supabase, brandId, channel)) { results.push({ brandId, channel, skipped: true, reason: "recent_auto_publication_exists" }); continue; }
        const recommendation = await recommendForGeneration(supabase as any, { scope: channelLearningScope(brandId, channel) }).catch(() => undefined);
        const learnedHour = parseLearnedAutopilotHour(recommendation?.favor?.publishHour?.value);
        const targetHour = autopilotTargetHour(dayIndex, learnedHour);
        if (!forcedRunForChannel && !shouldRunAutopilotSlot(localHour, targetHour)) { results.push({ brandId, channel, skipped: true, reason: learnedHour == null ? "exploration_time_slot_not_due" : "learned_time_slot_not_due", localHour, learnedHour, targetHour }); continue; }

        try {
          const guidance = recommendation ? ` Bruk dokumentert læring når den finnes. Favoriserte signaler: ${JSON.stringify(recommendation.favor)}. Unngå: ${JSON.stringify(recommendation.avoid)}.` : "";
          const role = String(plan?.metadata?.brand_role ?? "");
          const isRemasterCreator = brandId === "remasterfreddy" && role === "creator_media";
          const remasterSource = isRemasterCreator
            ? await loadRemasterPromotionSource(supabase, channel, { cooldownDays: 14 })
            : null;
          const editorialPlan = !isRemasterCreator
            ? await loadAutopilotEditorialSource(supabase as any, {
                brandId,
                channel,
                cooldownDays: 14,
              }).catch((error) => {
                console.warn("[Marketing Autopilot] editorial source lookup failed:", error instanceof Error ? error.message : error);
                return { source: null, recommendedCategory: null, strategyReason: null };
              })
            : { source: null, recommendedCategory: null, strategyReason: null };
          const useInventoryProperty = role === "real_estate"
            && (!editorialPlan.source || editorialPlan.recommendedCategory === "property");
          const editorialSource = useInventoryProperty ? null : editorialPlan.source;
          const seoTopicSource = !isRemasterCreator && !editorialSource && !useInventoryProperty
            ? await loadSEOTopicSource(supabase, brandId, channel)
            : null;
          if (isRemasterCreator && !remasterSource) {
            results.push({ brandId, channel, skipped: true, reason: "no_eligible_remaster_song_source", cooldownDays: 14 });
            continue;
          }

          const socialCategory = useInventoryProperty
            ? "property"
            : editorialSource?.socialCategory ?? editorialPlan.recommendedCategory ?? "market_insight";
          const concept = selectAutopilotSocialConcept({
            weeklyCount,
            channel,
            socialCategory,
            mediaCount: editorialSource?.imageUrls.length ?? 0,
          });
          const runIdentity = forcedRunForChannel ? undefined : autopilotRunIdentity(brandId, channel, localDate, targetHour);
          const masterIdea = remasterSource
            ? remasterPromotionMasterIdea(remasterSource, guidance)
            : editorialSource
              ? autopilotEditorialMasterIdea(editorialSource, {
                  conceptLabel: concept.label,
                  channel,
                  learningGuidance: [
                    editorialPlan.strategyReason ? `Strategihensyn: ${editorialPlan.strategyReason}` : "",
                    guidance,
                  ].filter(Boolean).join(" "),
                })
              : seoTopicSource
                ? seoTopicMasterIdea(seoTopicSource, guidance)
                : ideaForBrand(plan, guidance, dayIndex, localDate, channel);
          let mediaUrl = remasterSource
            ? remasterPromotionMediaUrl(remasterSource)
            : editorialSource?.imageUrls[0];
          let mediaUrls = editorialSource?.imageUrls ?? [];
          const mediaType = remasterSource
            ? remasterPromotionMediaType(remasterSource)
            : concept.visualFormat === "carousel" && mediaUrls.length >= 3
              ? "carousel" as const
              : mediaUrl ? "image" as const : undefined;
          let generatedMedia: Record<string, unknown> | null = null;

          // Instagram cannot publish text-only content. SaaS brands historically
          // reached this point with mode=live but media=null, leaving hundreds of
          // dead drafts. Use RealtyFlow's existing Media Studio before campaign
          // generation so the normal claim/quality/publisher gates still apply.
          if (!mediaUrl && channel === "instagram" && !useInventoryProperty) {
            const brandContext = await loadBrandContext(supabase as any, brandId).catch(() => null);
            const contentKey = runIdentity?.marketingRunId ?? `manual:${runRequest?.id ?? localDate}:${brandId}:${channel}`;
            try {
              const media = await generateAutopilotInstagramImage(supabase as any, {
                brandId,
                contentKey,
                theme: masterIdea,
                audience: brandContext?.audience,
                visualDirection: brandContext?.visualDirection,
              });
              mediaUrl = media.imageUrl;
              mediaUrls = [media.imageUrl];
              generatedMedia = {
                generated: true,
                jobId: media.jobId,
                assetId: media.assetId,
                provider: media.provider,
                reused: media.existing,
              };
            } catch (mediaError) {
              results.push({
                brandId,
                channel,
                skipped: true,
                reason: "instagram_media_generation_failed",
                error: mediaError instanceof Error ? mediaError.message : String(mediaError),
              });
              continue;
            }
          }

          const baseInput = {
            brandId,
            channel,
            useInventoryProperty,
            masterIdea,
            mediaUrl,
            mediaUrls,
            mediaType,
            sourceFacts: editorialSource?.facts,
            sourceId: editorialSource?.sourceId,
            socialCategory,
            conceptId: concept.id,
            visualFormat: useInventoryProperty ? undefined : concept.visualFormat,
            topic: seoTopicSource ? String(seoTopicSource.payload.genome_topic) : undefined,
            requiredCtaUrl: channel === "facebook"
              ? (editorialSource?.sourceUrl ?? seoTopicSource?.source_url)
              : undefined,
            goal: { kind: role === "real_estate" ? "qualified_leads" as const : "awareness" as const, target: 10, horizonDays: 30 },
            publishingCapacityPerWeek: weeklyTarget,
            reuseCooldownDays: 14,
            requirePublicationHistory: true,
          };

          const initialRun = await createCampaignDraft(supabase as any, baseInput, runIdentity);
          let run: CampaignRun = initialRun;
          let recovery: Record<string, unknown> | null = null;

          // Controlled-auto real estate gets one deterministic recovery path:
          // keep the hard claim/role/format gates intact, but if AI prose is
          // rejected by one of them, recompose from the SAME Inventory property
          // using whitelisted facts only. Use a distinct stable run identity so
          // failed AI copy remains auditable and the safe asset has one canonical row.
          const recoverable = role === "real_estate"
            ? initialRun.results.find((item) =>
                !!item.propertyId
                && item.mode === "blocked"
                && isRecoverablePropertyCopyError(item.error),
              )
            : undefined;
          if (recoverable?.propertyId) {
            const fallbackIdentity = safeFallbackIdentity(runIdentity);
            run = await createCampaignDraft(supabase as any, {
              ...baseInput,
              propertyId: recoverable.propertyId,
              deterministicInventoryCopy: true,
            }, fallbackIdentity);
            recovery = {
              triggered: true,
              reason: recoverable.error ?? "blocked_generated_copy",
              propertyId: recoverable.propertyId,
              propertyRef: recoverable.propertyRef ?? null,
              initialMarketingRunId: initialRun.marketingRunId,
              fallbackMarketingRunId: run.marketingRunId,
            };
          }

          const failureState = await markFailedControlledAutoPublications(supabase, brandId, run);
          const generated = run.results.some((item) => !item.error);
          if (generated && weeklyProductionCounts) {
            weeklyProductionCounts[channel] = (weeklyProductionCounts[channel] ?? 0) + 1;
          }
          let sourceMarked = false;
          let sourceMarkError: string | null = null;
          if (remasterSource && generated) {
            try {
              await markRemasterPromotionSourcePlanned(supabase, remasterSource.id);
              sourceMarked = true;
            } catch (markError) {
              sourceMarkError = markError instanceof Error ? markError.message : String(markError);
            }
          } else if (seoTopicSource && generated) {
            try {
              await markSEOTopicSourcePlanned(supabase, seoTopicSource.id);
              sourceMarked = true;
            } catch (markError) {
              sourceMarkError = markError instanceof Error ? markError.message : String(markError);
            }
          }

          results.push({
            brandId,
            channel,
            marketingRunId: run.marketingRunId,
            manualRun,
            systemNextActionRun,
            forcedRunForChannel,
            requestedPublicationMode,
            localHour,
            learnedHour,
            targetHour,
            recommendation: recommendation?.favor ?? {},
            weeklyCount,
            weeklyTarget,
            socialCategory,
            concept: {
              id: concept.id,
              label: concept.label,
              creativeStyle: concept.creativeStyle,
              visualFormat: concept.visualFormat,
              goal: concept.goal,
            },
            generatedMedia,
            recovery,
            failureState,
            source: remasterSource ? {
              sourceQueueId: remasterSource.id,
              sourceType: "song",
              songId: remasterSource.source_id,
              title: remasterSource.title,
              youtubeUrl: remasterSource.payload?.youtube_url ?? remasterSource.source_url,
              sourceMarked,
              sourceMarkError,
            } : editorialSource ? {
              sourceId: editorialSource.sourceId,
              sourceType: editorialSource.sourceType,
              contentId: editorialSource.contentId,
              areaId: editorialSource.areaId,
              kind: editorialSource.kind,
              title: editorialSource.title,
              canonicalUrl: editorialSource.sourceUrl,
              socialCategory: editorialSource.socialCategory,
              imageCount: editorialSource.imageUrls.length,
              sourceMarked: false,
              sourceMarkError: null,
            } : seoTopicSource ? {
              sourceQueueId: seoTopicSource.id,
              sourceType: "seo_topic",
              topicId: seoTopicSource.payload.topic_id ?? seoTopicSource.source_id,
              genomeTopic: seoTopicSource.payload.genome_topic,
              title: seoTopicSource.title,
              canonicalUrl: seoTopicSource.source_url,
              sourceMarked,
              sourceMarkError,
            } : null,
            publications: run.results.map((item) => ({ publicationId: item.publicationId, state: item.state, mode: item.mode, qualityScore: item.qualityScore, error: item.error ?? null })),
          });
        } catch (err) { results.push({ brandId, channel, error: err instanceof Error ? err.message : String(err) }); }
      }
    }

    const payload = {
      success: true,
      manualRun,
      systemNextActionRun,
      runRequestId: runRequest?.id ?? null,
      requestedBy: runRequest?.requested_by ?? null,
      queuedNextAction,
      brands: Array.from(new Set(results.map((r) => String(r.brandId ?? "")).filter(Boolean))),
      localHour,
      timeZone,
      results,
    };
    const heartbeat = summarizeMarketingAutopilotHeartbeat(results);
    await recordAutopilotHeartbeat(supabase, heartbeat.status, {
      manual_run: manualRun,
      system_next_action_run: systemNextActionRun,
      run_request_id: runRequest?.id ?? null,
      requested_by: runRequest?.requested_by ?? null,
      queued_next_action: queuedNextAction,
      local_hour: localHour,
      time_zone: timeZone,
      brands: heartbeat.brands,
      channels: heartbeat.channels,
      result_count: heartbeat.resultCount,
      skipped: heartbeat.skipped,
      errored: heartbeat.errored,
      publication_results: heartbeat.publicationResults,
      publication_errors: heartbeat.publicationErrors,
      source_marked: heartbeat.sourceMarked,
    });
    if (runRequest?.id) await supabase.from("marketing_autopilot_run_requests").update({ status: "completed", completed_at: new Date().toISOString(), result: payload }).eq("id", runRequest.id);
    return NextResponse.json(payload);
  } catch (error) {
    await recordAutopilotHeartbeat(supabase, "error", {
      manual_run: manualRun,
      system_next_action_run: systemNextActionRun,
      run_request_id: runRequest?.id ?? null,
      requested_by: runRequest?.requested_by ?? null,
      queued_next_action: queuedNextAction,
      error_type: error instanceof Error ? error.name : "unknown",
    });
    if (runRequest?.id) await supabase.from("marketing_autopilot_run_requests").update({ status: "failed", completed_at: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) }).eq("id", runRequest.id);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Marketing autopilot failed",
      manualRun,
      systemNextActionRun,
      runRequestId: runRequest?.id ?? null,
      queuedNextAction,
    }, { status: 500 });
  }
}
