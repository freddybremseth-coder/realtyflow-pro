import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext } from "@/lib/api-admin";
import { getPlatformSupabase } from "@/lib/platform/supabase";
import { suggestDevelopmentRepository, resolveDevelopmentRepository } from "@/lib/nexus/development-repository";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest, context: { params: { taskId: string } }) {
  const access = await getRequestAccessContext(request);
  if (!access) return reply({ error: "AUTH_REQUIRED" }, 401);
  if (access.role !== "OWNER" || access.source !== "owner-session") return reply({ error: "OWNER_ONLY" }, 403);
  const id = context.params.taskId;
  if (!uuidPattern.test(id)) return reply({ error: "INVALID_TASK_ID" }, 400);
  const db = getPlatformSupabase();
  if (!db) return reply({ error: "SERVICE_UNAVAILABLE" }, 503);
  const { data, error } = await db.from("nexus_development_tasks")
    .select("id,request_text,scope,brand_key,source_path,status,created_at,updated_at")
    .eq("id", id).eq("requested_by", access.email).maybeSingle();
  if (error) return reply({ error: "TASK_LOOKUP_FAILED" }, 503);
  if (!data) return reply({ error: "TASK_NOT_FOUND" }, 404);
  const repository = resolveDevelopmentRepository(suggestDevelopmentRepository({
    brandKey: data.brand_key, pagePath: data.source_path, request: data.request_text,
  }));
  return reply({ task: { ...data, suggested_repository: repository }, execution_enabled: false });
}
