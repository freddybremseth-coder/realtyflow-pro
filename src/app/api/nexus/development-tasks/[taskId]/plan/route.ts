import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext } from "@/lib/api-admin";
import { getPlatformSupabase } from "@/lib/platform/supabase";
import { createDevelopmentPlan } from "@/lib/nexus/development-plan";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, context: { params: { taskId: string } }) {
  const headers = { "Cache-Control": "private, no-store" };
  const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
  const actor = await getRequestAccessContext(request);
  if (!actor) return respond({ error: "AUTH_REQUIRED" }, 401);
  if (actor.role !== "OWNER" || actor.source !== "owner-session") return respond({ error: "OWNER_ONLY" }, 403);
  const id = context.params.taskId;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
    return respond({ error: "INVALID_TASK_ID" }, 400);
  const db = getPlatformSupabase();
  if (!db) return respond({ error: "SERVICE_UNAVAILABLE" }, 503);
  const { data, error } = await db.from("nexus_development_tasks")
    .select("id,request_text,brand_key,source_path,status")
    .eq("id", id).eq("requested_by", actor.email).maybeSingle();
  if (error) return respond({ error: "TASK_LOOKUP_FAILED" }, 503);
  if (!data) return respond({ error: "TASK_NOT_FOUND" }, 404);
  return respond({ plan: createDevelopmentPlan(data), note: "Planforslag – ingen koding eller publisering utført." });
}
