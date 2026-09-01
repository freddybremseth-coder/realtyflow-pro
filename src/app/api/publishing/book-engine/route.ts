import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { guardLearningOriginProduction, type LearningOriginGuardMode } from "@/lib/publishing/book-engine-learning-origin-guard";
import { GET as coreGET, POST as corePOST } from "./core";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

const GUARDED_MODES = new Set<LearningOriginGuardMode>(["generate_seo", "generate_author", "continue"]);

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(request: NextRequest) {
  return coreGET(request);
}

export async function POST(request: NextRequest) {
  const body = await request.clone().json().catch(() => ({} as Record<string, unknown>));
  const mode = String(body.mode || "create") as LearningOriginGuardMode;
  if (!GUARDED_MODES.has(mode)) return corePOST(request);

  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const id = String(body.id || "").trim();
  if (!id) return corePOST(request);

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { data: project, error } = await supabase
    .from("publishing_book_projects")
    .select("id,status,metadata_plan,outline_plan,chapter_drafts")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!project) return corePOST(request);

  const learningGuard = guardLearningOriginProduction(project as Record<string, any>, mode);
  if (!learningGuard.allowed) {
    return NextResponse.json(
      { error: learningGuard.message, code: learningGuard.code, learning_origin_guard: true },
      { status: learningGuard.status },
    );
  }

  return corePOST(request);
}
