import { NextRequest, NextResponse } from "next/server";
import { requireBrandWorkspace } from "@/lib/workspaces/require-brand-workspace";
import { assertPublishableForStatus } from "@/services/publishing/publishability-guard";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status, headers: noStore });
}

export async function POST(request: NextRequest, { params }: { params: { brandKey: string } }) {
  const origin = request.headers.get("origin");
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json") ||
      (origin && origin !== new URL(request.url).origin) ||
      request.headers.get("sec-fetch-site") === "cross-site") {
    return fail(403, "INVALID_REQUEST_ORIGIN", "Forespørselen kunne ikke godkjennes.");
  }
  const access = await requireBrandWorkspace(request, params.brandKey, "marketing.publish");
  if (!access.value) return access.response;
  if (!access.value.verifiedUserId) {
    return fail(403, "STAFF_ONLY", "Denne planleggingsflyten gjelder medarbeidere.");
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return fail(400, "INVALID_SCHEDULE", "Ugyldig planlegging.");
  }
  const publicationId = typeof body.publicationId === "string" ? body.publicationId : "";
  const platforms = Array.isArray(body.platforms)
    ? body.platforms.map((x: unknown) => String(x).trim().toLowerCase()) : [];
  const scheduledAt = typeof body.scheduledAt === "string" ? body.scheduledAt : "";
  const when = new Date(scheduledAt);
  if (!uuid.test(publicationId) || platforms.length < 1 || platforms.length > 2 ||
      new Set(platforms).size !== platforms.length ||
      platforms.some((p: string) => !["facebook", "instagram"].includes(p)) ||
      !scheduledAt || Number.isNaN(when.getTime()) || when.getTime() < Date.now() + 60000) {
    return fail(400, "INVALID_SCHEDULE", "Velg Facebook/Instagram og et tidspunkt minst ett minutt frem i tid.");
  }

  // The staff-specific snapshot only lists drafts created and audited for this actor.
  const { data: snapshot, error: snapshotError } = await access.value.supabase.rpc(
    "workspace_brand_social_publish_snapshot", {
      p_brand_key: params.brandKey,
      p_user_id: access.value.verifiedUserId,
      p_email: access.value.verifiedEmail,
    },
  );
  if (snapshotError || !snapshot) return fail(503, "SCHEDULE_SCOPE_UNAVAILABLE", "Kunne ikke kontrollere utkasttilgangen.");
  const owned = Array.isArray(snapshot.publications) &&
    snapshot.publications.find((x: { id?: string; plannedPlatforms?: string[] }) => x.id === publicationId);
  if (!owned || platforms.some((p: string) => !owned.plannedPlatforms?.includes(p))) {
    return fail(403, "DRAFT_NOT_AUTHORIZED", "Planlegg et nytt utkast som er lagret av deg for denne merkevaren.");
  }
  const { data: channels, error: channelsError } = await access.value.supabase
    .from("social_channels").select("platform")
    .eq("brand_id", params.brandKey).eq("is_active", true).in("platform", platforms);
  if (channelsError || platforms.some((platform: string) =>
    (channels || []).filter((channel: { platform: string }) => channel.platform === platform).length !== 1)) {
    return fail(409, "CHANNEL_SCOPE_INVALID", "Målkanalen er ikke entydig eller aktiv. Kontroller kanaltilkoblingen.");
  }
  const { data: row, error: readError } = await access.value.supabase
    .from("content_publications")
    .select("id,status,description,thumbnail_url,ai_image_url,visual_format")
    .eq("id", publicationId).eq("brand_id", params.brandKey).eq("status", "draft").maybeSingle();
  if (readError || !row) return fail(409, "DRAFT_CHANGED", "Utkastet er endret eller er ikke lenger et utkast.");
  if (row.visual_format === "carousel") {
    return fail(409, "CAROUSEL_SCHEDULING_NOT_READY", "Planlegging av karuseller er ikke aktivert.");
  }
  if (platforms.includes("instagram") && !(row.ai_image_url || row.thumbnail_url)) {
    return fail(409, "INSTAGRAM_IMAGE_REQUIRED", "Instagram krever godkjent bilde.");
  }
  const guard = assertPublishableForStatus({
    content: row.description || "", targetStatus: "scheduled", platform: platforms[0],
  });
  if (!guard.ok) return fail(422, "PUBLISHABILITY_FAILED", "Rett innholdet før planlegging: " + guard.reason);
  const freshAccess = await requireBrandWorkspace(request, params.brandKey, "marketing.publish");
  if (!freshAccess.value || freshAccess.value.verifiedUserId !== access.value.verifiedUserId) {
    return fail(403, "ACCESS_REVOKED", "Publiseringsrettigheten er ikke lenger aktiv.");
  }
  const { data: changed, error: writeError } = await freshAccess.value.supabase
    .from("content_publications")
    .update({
      status: "scheduled",
      scheduled_at: when.toISOString(),
      scheduled_platforms: platforms,
      publish_attempts: 0,
      last_publish_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", publicationId).eq("brand_id", params.brandKey).eq("status", "draft")
    .select("id,status,scheduled_at").maybeSingle();
  if (writeError || !changed) return fail(409, "SCHEDULE_SAVE_FAILED", "Planleggingen ble ikke lagret. Kontroller status.");
  return NextResponse.json({ ok: true, publication: changed }, { headers: noStore });
}
