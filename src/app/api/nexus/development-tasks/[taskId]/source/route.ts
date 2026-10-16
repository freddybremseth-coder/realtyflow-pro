import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext } from "@/lib/api-admin";
import { getPlatformSupabase } from "@/lib/platform/supabase";
import { createDevelopmentPlan } from "@/lib/nexus/development-plan";
import { readDevelopmentRepositoryEvidence } from "@/lib/nexus/development-github-read";
import { allowedDevelopmentSourcePaths, readDevelopmentSource } from "@/lib/nexus/development-source-read";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, context: { params: { taskId: string } }) {
  const respond = (value: unknown, status = 200) =>
    NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
  const actor = await getRequestAccessContext(request);
  if (!actor) return respond({ error: "AUTH_REQUIRED" }, 401);
  if (actor.role !== "OWNER" || actor.source !== "owner-session") return respond({ error: "OWNER_ONLY" }, 403);
  const id = context.params.taskId;
  if (!/^[a-f0-9-]{36}$/i.test(id)) return respond({ error: "INVALID_TASK_ID" }, 400);
  const db = getPlatformSupabase();
  if (!db) return respond({ error: "SERVICE_UNAVAILABLE" }, 503);
  const { data, error } = await db.from("nexus_development_tasks")
    .select("id,request_text,brand_key,source_path")
    .eq("id", id).eq("requested_by", actor.email).maybeSingle();
  if (error) return respond({ error: "TASK_LOOKUP_FAILED" }, 503);
  if (!data) return respond({ error: "TASK_NOT_FOUND" }, 404);
  const plan = createDevelopmentPlan(data);
  const repository = await readDevelopmentRepositoryEvidence(plan.repository);
  if (!repository.verified || !repository.headSha)
    return respond({ repository, sources: [], warning: "GitHub-versjon ikke verifisert" }, 503);
  const path = new URL(request.url).searchParams.get("path") || "";
  if (!allowedDevelopmentSourcePaths(plan.repository).includes(path))
    return respond({ error: "SOURCE_NOT_ALLOWED", allowedPaths: allowedDevelopmentSourcePaths(plan.repository) }, 400);
  const source = await readDevelopmentSource(plan.repository, path, repository.headSha);
  return respond({ repository, source, executed: false });
}
