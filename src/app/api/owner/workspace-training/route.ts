import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext } from "@/lib/api-admin";
import { getPlatformSupabase } from "@/lib/platform/supabase";
import {
  editableTrainingContent,
  trainingBaseForBrand,
  TRAINING_BRANDS,
  validateTrainingContent,
} from "@/lib/workspaces/training-overrides";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const noStore = { "Cache-Control": "private, no-store" };
const allowed = (brand: string) => TRAINING_BRANDS.some(item => item === brand);

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: noStore });
}
async function ownerOnly(request: NextRequest) {
  const context = await getRequestAccessContext(request);
  if (!context) return { context: null, response: reply({ error: "AUTH_REQUIRED" }, 401) };
  if (context.role !== "OWNER" || context.source === "remaster-proxy")
    return { context: null, response: reply({ error: "OWNER_ONLY" }, 403) };
  return { context, response: null };
}
function safeWrite(request: NextRequest) {
  const origin = request.headers.get("origin");
  return request.headers.get("content-type")?.toLowerCase().startsWith("application/json") &&
    (!origin || origin === new URL(request.url).origin) &&
    request.headers.get("sec-fetch-site") !== "cross-site";
}

export async function GET(request: NextRequest) {
  const auth = await ownerOnly(request);
  if (!auth.context) return auth.response!;
  const brandKey = new URL(request.url).searchParams.get("brandKey") || "zeneco";
  if (!allowed(brandKey)) return reply({ error: "BRAND_NOT_ALLOWED" }, 404);
  const supabase = getPlatformSupabase();
  if (!supabase) return reply({ error: "TRAINING_UNAVAILABLE" }, 503);
  const { data, error } = await supabase
    .from("workspace_training_overrides")
    .select("article_id,content,updated_at,updated_by")
    .eq("brand_key", brandKey);
  if (error) return reply({ error: "TRAINING_UNAVAILABLE" }, 503);

  // Snapshot is owner-only and filtered strictly to this brand. An employee's
  // training preview must use their actual scoped permission set.
  const { data: snapshot } = await supabase.rpc("workspace_user_admin_snapshot");
  const members = Array.isArray(snapshot?.users)
    ? snapshot.users.flatMap((person: any) => {
        if (person.status !== "active") return [];
        const membership = Array.isArray(person.memberships) ? person.memberships.find(
          (item: any) => item.brand_key === brandKey && item.status === "active",
        ) : null;
        if (!membership) return [];
        return [{
          email: String(person.email || ""), name: String(person.display_name || person.email || ""),
          permissions: Array.isArray(membership.permissions)
            ? membership.permissions.filter((p: unknown) => typeof p === "string") : [],
        }];
      }) : [];
  return reply({
    ok: true, brandKey,
    articles: trainingBaseForBrand(brandKey).map(article => ({
      ...article, editable: editableTrainingContent(article),
    })),
    overrides: Array.isArray(data) ? data : [],
    members,
  });
}

export async function POST(request: NextRequest) {
  const auth = await ownerOnly(request);
  if (!auth.context) return auth.response!;
  if (!safeWrite(request)) return reply({ error: "UNSAFE_REQUEST" }, 400);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return reply({ error: "INVALID_BODY" }, 400);
  const brandKey = typeof body.brandKey === "string" ? body.brandKey : "";
  const articleId = typeof body.articleId === "string" ? body.articleId : "";
  const action = body.action;
  if (!allowed(brandKey) || !trainingBaseForBrand(brandKey).some(article => article.id === articleId))
    return reply({ error: "INVALID_BRAND_OR_ARTICLE" }, 400);
  if (action !== "save" && action !== "reset") return reply({ error: "INVALID_ACTION" }, 400);
  if (action === "save" && !validateTrainingContent(body.content))
    return reply({ error: "INVALID_CONTENT" }, 400);
  const supabase = getPlatformSupabase();
  if (!supabase) return reply({ error: "TRAINING_UNAVAILABLE" }, 503);
  if (action === "reset") {
    const { error } = await supabase.from("workspace_training_overrides").delete()
      .eq("brand_key", brandKey).eq("article_id", articleId);
    if (error) return reply({ error: "SAVE_FAILED" }, 503);
    return reply({ ok: true, reset: true });
  }
  const { error } = await supabase.from("workspace_training_overrides").upsert({
    brand_key: brandKey,
    article_id: articleId,
    content: {
      title: body.content.title,
      shortTitle: body.content.shortTitle,
      summary: body.content.summary,
      readMinutes: body.content.readMinutes,
      sections: body.content.sections,
    },
    updated_by: auth.context.email,
    updated_at: new Date().toISOString(),
  }, { onConflict: "brand_key,article_id" });
  if (error) return reply({ error: "SAVE_FAILED" }, 503);
  return reply({ ok: true, saved: true });
}
