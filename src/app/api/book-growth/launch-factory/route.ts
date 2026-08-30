import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/api-admin";
import { BOOK_LAUNCH_FREQUENCY_POLICY, proposeBookLaunch } from "@/services/ai/book-launch-planner";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("generate"), editionId: z.string().uuid() }),
  z.object({ action: z.literal("decide"), campaignId: z.string().uuid(), decision: z.enum(["approved", "rejected"]) }),
  z.object({
    action: z.literal("activate"),
    campaignId: z.string().uuid(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    timezone: z.enum(["Europe/Madrid", "Europe/Oslo", "UTC"]),
  }),
  z.object({
    action: z.literal("edit_item"),
    itemId: z.string().uuid(),
    reason: z.string().trim().min(1).max(1000),
    payload: z.object({
      offsetDay: z.number().int().min(0).max(29),
      channel: z.enum(["facebook", "instagram", "email", "website"]),
      contentType: z.string().trim().min(1).max(120),
      purpose: z.string().trim().min(1).max(1000),
      headline: z.string().trim().min(1).max(240),
      body: z.string().trim().min(1).max(8000),
      cta: z.enum(["view_book", "read_sample", "buy_book", "browse_series"]),
      sourceClaim: z.string().trim().min(1).max(1000),
    }).strict(),
  }),
  z.object({
    action: z.literal("decide_item"),
    itemId: z.string().uuid(),
    decision: z.enum(["submitted", "approved", "returned", "cancelled"]),
    note: z.string().trim().max(1000).optional(),
  }),
  z.object({ action: z.literal("prepare_handoff"), itemId: z.string().uuid() }),
  z.object({
    action: z.literal("decide_handoff"),
    handoffId: z.string().uuid(),
    decision: z.enum(["queue", "withdraw"]),
    note: z.string().trim().max(1000).optional(),
  }),
  z.object({ action: z.literal("run_preflight"), handoffId: z.string().uuid() }),
  z.object({ action: z.literal("set_website_target"), targetUrl: z.literal("https://books.freddybremseth.com") }),
]);

function unavailable(message: string) {
  return /publishing_launch_(campaigns|activations|calendar_items|calendar_item_versions|calendar_item_decisions|channel_handoffs|channel_preflights|channel_settings)|publishing_(stage|activate|edit|decide|prepare|run|set)_launch|schema cache|does not exist|relation/i.test(message);
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const sb = getServiceSupabase();
  if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const [worksRes, editionsRes, revisionsRes, packagesRes, assetsRes, campaignsRes, activationsRes, calendarRes, versionsRes, itemDecisionsRes, handoffsRes, preflightsRes, socialRes, emailRes, channelSettingsRes] = await Promise.all([
    sb.from("publishing_catalog_works").select("id,canonical_title,series_name,status").neq("status", "archived"),
    sb.from("publishing_catalog_editions").select("id,work_id,title,subtitle,language,format,status").neq("status", "retired"),
    sb.from("publishing_catalog_revisions").select("id,edition_id,revision_number,is_canonical,status").eq("is_canonical", true),
    sb.from("publishing_channel_metadata_packages").select("id,edition_id,revision_id,channel,status,payload,payload_fingerprint").eq("status", "approved"),
    sb.from("publishing_catalog_assets").select("id,edition_id,revision_id,asset_type,status,is_canonical,storage_bucket,storage_path,external_url,fingerprint").eq("is_canonical", true).eq("status", "verified"),
    sb.from("publishing_launch_campaigns").select("id,work_id,edition_id,revision_id,version,status,plan,frequency_policy,generated_by,model,prompt_version,approved_by,approved_at,created_at").order("version", { ascending: false }),
    sb.from("publishing_launch_activations").select("id,campaign_id,edition_id,revision_id,start_date,timezone,status,activated_by,activated_at"),
    sb.from("publishing_launch_calendar_items").select("id,activation_id,campaign_id,source_item_index,channel,content_type,scheduled_for,local_date,timezone,status,payload,current_version,submitted_by,submitted_at,approved_by,approved_at").order("scheduled_for", { ascending: true }),
    sb.from("publishing_launch_calendar_item_versions").select("id,calendar_item_id,version,payload,created_by,change_reason,created_at").order("version", { ascending: false }),
    sb.from("publishing_launch_calendar_item_decisions").select("id,calendar_item_id,item_version,decision,actor,note,created_at").order("created_at", { ascending: false }),
    sb.from("publishing_launch_channel_handoffs").select("id,calendar_item_id,item_version,attempt,channel,status,payload_snapshot,prepared_by,prepared_at,queued_by,queued_at,withdrawn_by,withdrawn_at,note,created_at,updated_at").order("created_at", { ascending: false }),
    sb.from("publishing_launch_channel_preflights").select("id,handoff_id,calendar_item_id,run_number,status,checks,blocker_codes,evaluated_by,evaluated_at").order("run_number", { ascending: false }),
    sb.from("social_channels").select("id,brand_id,platform,display_name,is_active").in("brand_id", ["freddypublishing", "freddy_publishing"]).in("platform", ["facebook", "instagram"]).eq("is_active", true),
    sb.from("brand_email_configs").select("id,brand_id,email_address,display_name,is_active,health_status,health_message,auto_fetch_paused_by_system,last_success_at").in("brand_id", ["freddypublishing", "freddy_publishing"]).eq("is_active", true),
    sb.from("publishing_launch_channel_settings").select("id,brand_id,channel,target_url,status,updated_at").eq("brand_id", "freddypublishing"),
  ]);
  const error = worksRes.error || editionsRes.error || revisionsRes.error || packagesRes.error || assetsRes.error || campaignsRes.error || activationsRes.error || calendarRes.error || versionsRes.error || itemDecisionsRes.error || handoffsRes.error || preflightsRes.error || socialRes.error || emailRes.error || channelSettingsRes.error;
  if (error) {
    const missingMigration = unavailable(error.message);
    return NextResponse.json(
      { available: false, error: missingMigration ? "Fase 4.4-migreringen er ikke installert ennå." : error.message },
      { status: missingMigration ? 503 : 500 },
    );
  }

  const works = worksRes.data ?? [];
  const revisions = revisionsRes.data ?? [];
  const packages = packagesRes.data ?? [];
  const assets = assetsRes.data ?? [];
  const campaigns = campaignsRes.data ?? [];
  const activations = activationsRes.data ?? [];
  const calendarItems = calendarRes.data ?? [];
  const itemVersions = versionsRes.data ?? [];
  const itemDecisions = itemDecisionsRes.data ?? [];
  const handoffs = handoffsRes.data ?? [];
  const preflights = preflightsRes.data ?? [];
  const socialChannels = socialRes.data ?? [];
  const socialIds = socialChannels.map((row: any) => row.id);
  const tokenRes = socialIds.length
    ? await sb.from("oauth_tokens").select("social_channel_id,scopes,expires_at").in("social_channel_id", socialIds)
    : { data: [], error: null };
  if (tokenRes.error) return NextResponse.json({ available: false, error: tokenRes.error.message }, { status: 500 });
  const tokenByChannel = new Map((tokenRes.data ?? []).map((row: any) => [String(row.social_channel_id), row]));
  const connectionCenter: Array<{ channel: string; connected: boolean; label: string | null; manageHref: string | null }> = ["facebook", "instagram"].map((channel) => {
    const rows = socialChannels.filter((row: any) => row.platform === channel);
    const connected = rows.some((row: any) => tokenByChannel.has(String(row.id)));
    return { channel, connected, label: rows[0]?.display_name || null, manageHref: `/api/oauth/facebook?brand_id=freddypublishing&return_to=/book-growth/launch-factory&capability=publishing` };
  });
  const emailRows = emailRes.data ?? [];
  const healthyEmail = emailRows.find((row: any) => !row.auto_fetch_paused_by_system && !["degraded", "paused", "error"].includes(String(row.health_status || "healthy")));
  connectionCenter.push({ channel: "email", connected: Boolean(healthyEmail), label: healthyEmail?.email_address || emailRows[0]?.email_address || null, manageHref: "/nexus-os/communications" });
  const website: any = (channelSettingsRes.data ?? []).find((row: any) => row.channel === "website");
  connectionCenter.push({ channel: "website", connected: website?.status === "active" && website?.target_url === "https://books.freddybremseth.com", label: website?.target_url || null, manageHref: null });
  const workById = new Map(works.map((row: any) => [String(row.id), row]));

  const rows = (editionsRes.data ?? []).map((edition: any) => {
    const work: any = workById.get(String(edition.work_id)) ?? {};
    const revision: any = revisions.find((row: any) => row.edition_id === edition.id) ?? null;
    const editionPackages = revision ? packages.filter((row: any) => row.edition_id === edition.id && row.revision_id === revision.id) : [];
    const editionAssets = assets.filter((row: any) => row.edition_id === edition.id && (!row.revision_id || row.revision_id === revision?.id));
    const allEditionCampaigns = campaigns.filter((row: any) => row.edition_id === edition.id);
    const editionCampaigns = allEditionCampaigns.filter((row: any) => row.revision_id === revision?.id);
    const proposed: any = editionCampaigns.find((row: any) => row.status === "proposed") ?? null;
    const approved: any = editionCampaigns.find((row: any) => row.status === "approved") ?? null;
    const activation: any = activations.find((row: any) => row.edition_id === edition.id && ["active", "paused"].includes(row.status)) ?? null;
    const activatedCampaign: any = activation ? allEditionCampaigns.find((row: any) => row.id === activation.campaign_id) ?? null : null;
    const activationIsCurrent = Boolean(activation && revision && activation.revision_id === revision.id);
    const campaign: any = activatedCampaign || proposed || approved;
    const calendar = activation ? calendarItems.filter((row: any) => row.activation_id === activation.id).map((item: any) => ({
      ...item,
      versions: itemVersions.filter((row: any) => row.calendar_item_id === item.id),
      decisions: itemDecisions.filter((row: any) => row.calendar_item_id === item.id),
      handoffs: handoffs.filter((row: any) => row.calendar_item_id === item.id).map((handoff: any) => ({
        ...handoff,
        preflights: preflights.filter((row: any) => row.handoff_id === handoff.id),
      })),
    })) : [];
    const packageChannels = new Set(editionPackages.map((row: any) => row.channel));
    const hasEpub = editionAssets.some((row: any) => row.asset_type === "epub" && row.revision_id === revision?.id);
    const hasCover = editionAssets.some((row: any) => row.asset_type === "cover");
    const missing = [
      !revision ? "canonical_revision" : null,
      packageChannels.size < 4 ? "approved_channel_metadata" : null,
      !hasEpub ? "canonical_epub" : null,
      !hasCover ? "canonical_cover" : null,
    ].filter(Boolean);
    const readyItemCount = calendar.filter((item: any) => item.status === "ready_for_review").length;
    const draftItemCount = calendar.filter((item: any) => item.status === "draft").length;
    const preparedHandoffCount = calendar.reduce((total: number, item: any) => total + item.handoffs.filter((row: any) => row.status === "prepared").length, 0);
    const queuedHandoffCount = calendar.reduce((total: number, item: any) => total + item.handoffs.filter((row: any) => row.status === "queued").length, 0);
    const nextAction = activation
      ? !activationIsCurrent
        ? { code: "calendar_review", label: "Kontroller kalender fra tidligere revisjon" }
        : readyItemCount > 0
          ? { code: "calendar_review", label: `${readyItemCount} utkast venter på godkjenning` }
          : draftItemCount > 0
            ? { code: "calendar_review", label: `${draftItemCount} utkast må redigeres eller sendes til vurdering` }
            : preparedHandoffCount > 0
              ? { code: "handoff_review", label: `${preparedHandoffCount} kanalutkast kan legges i intern kø` }
              : queuedHandoffCount > 0
                ? { code: "handoff_queued", label: `${queuedHandoffCount} innhold ligger i intern kanalkø` }
                : { code: "calendar_reviewed", label: "Godkjent innhold kan klargjøres for kanal" }
      : missing.length
        ? { code: "complete_package", label: "Fullfør godkjent publiseringspakke" }
        : proposed
        ? { code: "review_campaign", label: "Vurder én samlet lanseringskampanje", campaignId: proposed.id }
        : approved && !activation
          ? { code: "activate_campaign", label: "Velg startdato og aktiver kalenderutkast", campaignId: approved.id }
          : { code: "generate_campaign", label: "Lag 30-dagers lanseringskampanje med OpenAI" };
    return {
      editionId: edition.id,
      workId: edition.work_id,
      title: work.canonical_title || edition.title,
      seriesName: work.series_name || null,
      language: edition.language,
      format: edition.format,
      revision,
      packages: editionPackages,
      assets: editionAssets,
      campaign,
      activation,
      activationIsCurrent,
      calendar,
      missing,
      readyForCampaign: missing.length === 0,
      nextAction,
    };
  }).sort((a: any, b: any) => Number(b.readyForCampaign) - Number(a.readyForCampaign) || a.title.localeCompare(b.title));

  return NextResponse.json({
    available: true,
    frequencyPolicy: BOOK_LAUNCH_FREQUENCY_POLICY,
    connectionCenter,
    summary: {
      editions: rows.length,
      packageReady: rows.filter((row: any) => row.readyForCampaign).length,
      awaitingApproval: rows.filter((row: any) => row.nextAction.code === "review_campaign").length,
      approved: rows.filter((row: any) => row.nextAction.code === "activate_campaign").length,
      activeCalendars: rows.filter((row: any) => Boolean(row.activation)).length,
      draftItems: rows.reduce((total: number, row: any) => total + row.calendar.filter((item: any) => item.status === "draft").length, 0),
      reviewItems: rows.reduce((total: number, row: any) => total + row.calendar.filter((item: any) => item.status === "ready_for_review").length, 0),
      approvedItems: rows.reduce((total: number, row: any) => total + row.calendar.filter((item: any) => item.status === "approved").length, 0),
      preparedHandoffs: handoffs.filter((row: any) => row.status === "prepared").length,
      queuedHandoffs: handoffs.filter((row: any) => row.status === "queued").length,
      readyPreflights: handoffs.filter((handoff: any) => handoff.status === "queued" && preflights.find((row: any) => row.handoff_id === handoff.id)?.status === "ready").length,
      blockedPreflights: handoffs.filter((handoff: any) => handoff.status === "queued" && preflights.find((row: any) => row.handoff_id === handoff.id)?.status === "blocked").length,
    },
    editions: rows,
  });
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ugyldig fase 4-handling", issues: parsed.error.issues }, { status: 400 });
  const sb = getServiceSupabase();
  if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  if (parsed.data.action === "decide") {
    const { data, error } = await sb.rpc("publishing_decide_launch_campaign", {
      p_campaign_id: parsed.data.campaignId,
      p_decision: parsed.data.decision,
      p_actor: "admin_ui",
    });
    if (error) return NextResponse.json({ error: error.message }, { status: unavailable(error.message) ? 503 : 409 });
    return NextResponse.json({ ok: true, action: "decide", result: data });
  }

  if (parsed.data.action === "activate") {
    const { data, error } = await sb.rpc("publishing_activate_launch_campaign", {
      p_campaign_id: parsed.data.campaignId,
      p_start_date: parsed.data.startDate,
      p_timezone: parsed.data.timezone,
      p_actor: "admin_ui",
    });
    if (error) return NextResponse.json({ error: error.message }, { status: unavailable(error.message) ? 503 : 409 });
    return NextResponse.json({ ok: true, action: "activate", result: data });
  }

  if (parsed.data.action === "edit_item") {
    const { data, error } = await sb.rpc("publishing_edit_launch_calendar_item", {
      p_item_id: parsed.data.itemId,
      p_payload: parsed.data.payload,
      p_actor: "admin_ui",
      p_reason: parsed.data.reason,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: unavailable(error.message) ? 503 : 409 });
    return NextResponse.json({ ok: true, action: "edit_item", result: data });
  }

  if (parsed.data.action === "decide_item") {
    const { data, error } = await sb.rpc("publishing_decide_launch_calendar_item", {
      p_item_id: parsed.data.itemId,
      p_decision: parsed.data.decision,
      p_actor: "admin_ui",
      p_note: parsed.data.note || null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: unavailable(error.message) ? 503 : 409 });
    return NextResponse.json({ ok: true, action: "decide_item", result: data });
  }

  if (parsed.data.action === "prepare_handoff") {
    const { data, error } = await sb.rpc("publishing_prepare_launch_channel_handoff", {
      p_item_id: parsed.data.itemId,
      p_actor: "admin_ui",
    });
    if (error) return NextResponse.json({ error: error.message }, { status: unavailable(error.message) ? 503 : 409 });
    return NextResponse.json({ ok: true, action: "prepare_handoff", result: data });
  }

  if (parsed.data.action === "decide_handoff") {
    const { data, error } = await sb.rpc("publishing_decide_launch_channel_handoff", {
      p_handoff_id: parsed.data.handoffId,
      p_decision: parsed.data.decision,
      p_actor: "admin_ui",
      p_note: parsed.data.note || null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: unavailable(error.message) ? 503 : 409 });
    return NextResponse.json({ ok: true, action: "decide_handoff", result: data });
  }

  if (parsed.data.action === "run_preflight") {
    const { data, error } = await sb.rpc("publishing_run_launch_channel_preflight", {
      p_handoff_id: parsed.data.handoffId,
      p_actor: "admin_ui",
    });
    if (error) return NextResponse.json({ error: error.message }, { status: unavailable(error.message) ? 503 : 409 });
    return NextResponse.json({ ok: true, action: "run_preflight", result: data });
  }

  if (parsed.data.action === "set_website_target") {
    const { data, error } = await sb.rpc("publishing_set_launch_website_target", {
      p_target_url: parsed.data.targetUrl,
      p_actor: "admin_ui",
    });
    if (error) return NextResponse.json({ error: error.message }, { status: unavailable(error.message) ? 503 : 409 });
    return NextResponse.json({ ok: true, action: "set_website_target", result: data });
  }

  const editionId = parsed.data.editionId;
  const [{ data: edition, error: editionError }, { data: revision, error: revisionError }, { data: packages, error: packagesError }, { data: assets, error: assetsError }] = await Promise.all([
    sb.from("publishing_catalog_editions").select("id,work_id,title,subtitle,language").eq("id", editionId).maybeSingle(),
    sb.from("publishing_catalog_revisions").select("id,edition_id,is_canonical").eq("edition_id", editionId).eq("is_canonical", true).maybeSingle(),
    sb.from("publishing_channel_metadata_packages").select("id,edition_id,revision_id,channel,status,payload").eq("edition_id", editionId).eq("status", "approved"),
    sb.from("publishing_catalog_assets").select("id,edition_id,revision_id,asset_type,status,is_canonical").eq("edition_id", editionId).eq("status", "verified").eq("is_canonical", true),
  ]);
  const lookupError = editionError || revisionError || packagesError || assetsError;
  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 });
  if (!edition || !revision) return NextResponse.json({ error: "Kanonisk utgave eller revisjon mangler" }, { status: 409 });
  const exactPackages = (packages ?? []).filter((row: any) => row.revision_id === revision.id);
  if (new Set(exactPackages.map((row: any) => row.channel)).size !== 4) return NextResponse.json({ error: "Fire godkjente kanalmetadata-pakker kreves" }, { status: 409 });
  const exactAssets = (assets ?? []).filter((row: any) => !row.revision_id || row.revision_id === revision.id);
  if (!exactAssets.some((row: any) => row.asset_type === "epub" && row.revision_id === revision.id) || !exactAssets.some((row: any) => row.asset_type === "cover")) {
    return NextResponse.json({ error: "Verifisert kanonisk EPUB og cover kreves" }, { status: 409 });
  }
  const { data: work, error: workError } = await sb.from("publishing_catalog_works").select("id,canonical_title,series_name").eq("id", edition.work_id).maybeSingle();
  if (workError) return NextResponse.json({ error: workError.message }, { status: 500 });
  const common: any = exactPackages[0]?.payload ?? {};
  try {
    const generated = await proposeBookLaunch({
      title: common.title || work?.canonical_title || edition.title,
      subtitle: common.subtitle || edition.subtitle,
      author: common.author || "Freddy Bremseth",
      language: common.language || edition.language,
      description: common.description || "",
      audiences: Array.isArray(common.audiences) ? common.audiences : [],
      themes: Array.isArray(common.themes) ? common.themes : [],
      keywords: Array.isArray(common.keywords) ? common.keywords : [],
      seriesName: work?.series_name,
    });
    const planFingerprint = createHash("sha256").update(JSON.stringify({
      revisionId: revision.id,
      packageIds: exactPackages.map((row: any) => row.id).sort(),
      assetIds: exactAssets.map((row: any) => row.id).sort(),
      plan: generated.plan,
      frequencyPolicy: BOOK_LAUNCH_FREQUENCY_POLICY,
    })).digest("hex");
    const { data, error } = await sb.rpc("publishing_stage_launch_campaign", {
      p_work_id: edition.work_id,
      p_edition_id: editionId,
      p_revision_id: revision.id,
      p_source_package_ids: exactPackages.map((row: any) => row.id),
      p_source_asset_ids: exactAssets.map((row: any) => row.id),
      p_plan: generated.plan,
      p_frequency_policy: BOOK_LAUNCH_FREQUENCY_POLICY,
      p_plan_fingerprint: planFingerprint,
      p_actor: `openai:${generated.model}`,
      p_model: generated.model,
      p_prompt_version: "book-launch-v1",
    });
    if (error) return NextResponse.json({ error: error.message }, { status: unavailable(error.message) ? 503 : 409 });
    return NextResponse.json({ ok: true, action: "generate", result: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "OpenAI kunne ikke lage lanseringskampanjen" }, { status: 502 });
  }
}
