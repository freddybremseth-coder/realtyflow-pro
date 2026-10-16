import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext } from "@/lib/api-admin";
import { getPlatformSupabase } from "@/lib/platform/supabase";
import { suggestDevelopmentRepository, resolveDevelopmentRepository } from "@/lib/nexus/development-repository";
import {
  prepareDevelopmentIntake,
  type DevelopmentWorkScope,
} from "@/lib/nexus/development-intake";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const headers = { "Cache-Control": "private, no-store" };
const scopes: DevelopmentWorkScope[] = [
  "bug", "feature", "content", "access", "deployment", "investigation",
];
function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers });
}
async function authorize(request: NextRequest) {
  const ctx = await getRequestAccessContext(request);
  if (!ctx) return { email: null, error: reply({ error: "AUTH_REQUIRED" }, 401) };
  if (ctx.role !== "OWNER" || ctx.source !== "owner-session")
    return { email: null, error: reply({ error: "OWNER_ONLY" }, 403) };
  return { email: ctx.email, error: null };
}
export async function GET(request: NextRequest) {
  const auth = await authorize(request);
  if (!auth.email) return auth.error!;
  const db = getPlatformSupabase();
  if (!db) return reply({ error: "SERVICE_UNAVAILABLE" }, 503);
  const { data, error } = await db.from("nexus_development_tasks")
    .select("id,request_text,scope,brand_key,source_path,status,created_at,updated_at")
    .eq("requested_by", auth.email)
    .order("created_at", { ascending: false }).limit(50);
  if (error) return reply({ error: "TASK_STORE_UNAVAILABLE" }, 503);
  return reply({ tasks: (data ?? []).map((task) => ({ ...task, suggested_repository: resolveDevelopmentRepository(suggestDevelopmentRepository({ brandKey: task.brand_key, pagePath: task.source_path, request: task.request_text })) })) });
}
export async function POST(request: NextRequest) {
  const auth = await authorize(request);
  if (!auth.email) return auth.error!;
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")
    || request.headers.get("sec-fetch-site") === "cross-site"
    || (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin))
    return reply({ error: "UNSAFE_REQUEST" }, 400);
  const raw = await request.text().catch(() => "");
  if (raw.length > 12000) return reply({ error: "REQUEST_TOO_LARGE" }, 413);
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch { return reply({ error: "INVALID_BODY" }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body))
    return reply({ error: "INVALID_BODY" }, 400);
  if (!scopes.includes(body.scope as DevelopmentWorkScope))
    return reply({ error: "INVALID_SCOPE" }, 400);
  const task = prepareDevelopmentIntake({
    request: body.request,
    scope: body.scope as DevelopmentWorkScope,
    brandKey: body.brandKey,
    pagePath: body.pagePath,
  });
  if (!task) return reply({ error: "INVALID_TASK" }, 400);
  const db = getPlatformSupabase();
  if (!db) return reply({ error: "SERVICE_UNAVAILABLE" }, 503);
  const { data, error } = await db.from("nexus_development_tasks")
    .insert({
      request_text: task.request, scope: task.scope, brand_key: task.brandKey,
      source_path: task.pagePath, requested_by: auth.email, status: "requested",
      execution_authorized: false,
    })
    .select("id,request_text,scope,brand_key,source_path,status,created_at")
    .single();
  if (error) return reply({ error: "TASK_SAVE_FAILED" }, 503);
  return reply({ task: { ...data, suggested_repository: resolveDevelopmentRepository(suggestDevelopmentRepository({ brandKey: task.brandKey, pagePath: task.pagePath, request: task.request })) }, notice: "Oppgaven er registrert, ikke utført." }, 201);
}
