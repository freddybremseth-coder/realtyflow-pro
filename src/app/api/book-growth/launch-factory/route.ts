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
]);

function unavailable(message: string) {
  return /publishing_launch_campaigns|publishing_stage_launch_campaign|schema cache|does not exist|relation/i.test(message);
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const sb = getServiceSupabase();
  if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const [worksRes, editionsRes, revisionsRes, packagesRes, assetsRes, campaignsRes] = await Promise.all([
    sb.from("publishing_catalog_works").select("id,canonical_title,series_name,status").neq("status", "archived"),
    sb.from("publishing_catalog_editions").select("id,work_id,title,subtitle,language,format,status").neq("status", "retired"),
    sb.from("publishing_catalog_revisions").select("id,edition_id,revision_number,is_canonical,status").eq("is_canonical", true),
    sb.from("publishing_channel_metadata_packages").select("id,edition_id,revision_id,channel,status,payload,payload_fingerprint").eq("status", "approved"),
    sb.from("publishing_catalog_assets").select("id,edition_id,revision_id,asset_type,status,is_canonical,storage_bucket,storage_path,external_url,fingerprint").eq("is_canonical", true).eq("status", "verified"),
    sb.from("publishing_launch_campaigns").select("id,work_id,edition_id,revision_id,version,status,plan,frequency_policy,generated_by,model,prompt_version,approved_by,approved_at,created_at").order("version", { ascending: false }),
  ]);
  const error = worksRes.error || editionsRes.error || revisionsRes.error || packagesRes.error || assetsRes.error || campaignsRes.error;
  if (error) return NextResponse.json({ available: false, error: unavailable(error.message) ? "Fase 4.0-migreringen er ikke installert ennå." : error.message }, { status: unavailable(error.message) ? 503 : 500 });
  const works = worksRes.data ?? []; const revisions = revisionsRes.data ?? []; const packages = packagesRes.data ?? []; const assets = assetsRes.data ?? []; const campaigns = campaignsRes.data ?? [];
  const workById = new Map(works.map((row: any) => [String(row.id), row]));
  const rows = (editionsRes.data ?? []).map((edition: any) => {
    const work: any = workById.get(String(edition.work_id)) ?? {};
    const revision: any = revisions.find((row: any) => row.edition_id === edition.id) ?? null;
    const editionPackages = revision ? packages.filter((row: any) => row.edition_id === edition.id && row.revision_id === revision.id) : [];
    const editionAssets = assets.filter((row: any) => row.edition_id === edition.id && (!row.revision_id || row.revision_id === revision?.id));
    const editionCampaigns = campaigns.filter((row: any) => row.edition_id === edition.id && row.revision_id === revision?.id);
    const proposed: any = editionCampaigns.find((row: any) => row.status === "proposed") ?? null;
    const approved: any = editionCampaigns.find((row: any) => row.status === "approved") ?? null;
    const packageChannels = new Set(editionPackages.map((row: any) => row.channel));
    const hasEpub = editionAssets.some((row: any) => row.asset_type === "epub" && row.revision_id === revision?.id);
    const hasCover = editionAssets.some((row: any) => row.asset_type === "cover");
    const missing = [!revision ? "canonical_revision" : null, packageChannels.size < 4 ? "approved_channel_metadata" : null, !hasEpub ? "canonical_epub" : null, !hasCover ? "canonical_cover" : null].filter(Boolean);
    const nextAction = missing.length ? { code: "complete_package", label: "Fullfør godkjent publiseringspakke" }
      : proposed ? { code: "review_campaign", label: "Vurder én samlet lanseringskampanje", campaignId: proposed.id }
        : approved ? { code: "ready", label: "Lanseringskampanjen er godkjent, men ikke aktivert" }
          : { code: "generate_campaign", label: "Lag 30-dagers lanseringskampanje med OpenAI" };
    return { editionId: edition.id, workId: edition.work_id, title: work.canonical_title || edition.title, seriesName: work.series_name || null, language: edition.language, format: edition.format, revision, packages: editionPackages, assets: editionAssets, campaign: proposed || approved, missing, readyForCampaign: missing.length === 0, nextAction };
  }).sort((a: any, b: any) => Number(b.readyForCampaign) - Number(a.readyForCampaign) || a.title.localeCompare(b.title));
  return NextResponse.json({ available: true, frequencyPolicy: BOOK_LAUNCH_FREQUENCY_POLICY, summary: { editions: rows.length, packageReady: rows.filter((row: any) => row.readyForCampaign).length, awaitingApproval: rows.filter((row: any) => row.nextAction.code === "review_campaign").length, approved: rows.filter((row: any) => row.nextAction.code === "ready").length }, editions: rows });
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ugyldig fase 4-handling", issues: parsed.error.issues }, { status: 400 });
  const sb = getServiceSupabase();
  if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  if (parsed.data.action === "decide") {
    const { data, error } = await sb.rpc("publishing_decide_launch_campaign", { p_campaign_id: parsed.data.campaignId, p_decision: parsed.data.decision, p_actor: "admin_ui" });
    if (error) return NextResponse.json({ error: error.message }, { status: unavailable(error.message) ? 503 : 409 });
    return NextResponse.json({ ok: true, action: "decide", result: data });
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
  if (!exactAssets.some((row: any) => row.asset_type === "epub" && row.revision_id === revision.id) || !exactAssets.some((row: any) => row.asset_type === "cover")) return NextResponse.json({ error: "Verifisert kanonisk EPUB og cover kreves" }, { status: 409 });
  const { data: work, error: workError } = await sb.from("publishing_catalog_works").select("id,canonical_title,series_name").eq("id", edition.work_id).maybeSingle();
  if (workError) return NextResponse.json({ error: workError.message }, { status: 500 });
  const common: any = exactPackages[0]?.payload ?? {};
  try {
    const generated = await proposeBookLaunch({ title: common.title || work?.canonical_title || edition.title, subtitle: common.subtitle || edition.subtitle, author: common.author || "Freddy Bremseth", language: common.language || edition.language, description: common.description || "", audiences: Array.isArray(common.audiences) ? common.audiences : [], themes: Array.isArray(common.themes) ? common.themes : [], keywords: Array.isArray(common.keywords) ? common.keywords : [], seriesName: work?.series_name });
    const planFingerprint = createHash("sha256").update(JSON.stringify({ revisionId: revision.id, packageIds: exactPackages.map((row: any) => row.id).sort(), assetIds: exactAssets.map((row: any) => row.id).sort(), plan: generated.plan, frequencyPolicy: BOOK_LAUNCH_FREQUENCY_POLICY })).digest("hex");
    const { data, error } = await sb.rpc("publishing_stage_launch_campaign", { p_work_id: edition.work_id, p_edition_id: editionId, p_revision_id: revision.id, p_source_package_ids: exactPackages.map((row: any) => row.id), p_source_asset_ids: exactAssets.map((row: any) => row.id), p_plan: generated.plan, p_frequency_policy: BOOK_LAUNCH_FREQUENCY_POLICY, p_plan_fingerprint: planFingerprint, p_actor: `openai:${generated.model}`, p_model: generated.model, p_prompt_version: "book-launch-v1" });
    if (error) return NextResponse.json({ error: error.message }, { status: unavailable(error.message) ? 503 : 409 });
    return NextResponse.json({ ok: true, action: "generate", result: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "OpenAI kunne ikke lage lanseringskampanjen" }, { status: 502 });
  }
}
