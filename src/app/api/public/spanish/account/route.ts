import { NextRequest } from "next/server";
import {
  requireSpanishUser,
  spanishJson,
  spanishPreflight,
} from "@/lib/spanish-api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const context = await requireSpanishUser(request);
  if ("error" in context) return context.error;

  const { data, error } = await context.supabase.rpc("spanish_account_snapshot", {
    p_user_id: context.user.id,
  });
  if (error) {
    console.error("[Spanish Account] Snapshot error:", error);
    return spanishJson(request, { error: "Could not load account" }, 500);
  }

  return spanishJson(request, { account: data });
}

export async function PUT(request: NextRequest) {
  const context = await requireSpanishUser(request);
  if ("error" in context) return context.error;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const state =
    body.state && typeof body.state === "object" && !Array.isArray(body.state)
      ? body.state
      : {};

  const sourceLang = typeof body.source_lang === "string" ? body.source_lang : null;
  const fullName = typeof body.full_name === "string" ? body.full_name : null;
  const phone = typeof body.phone === "string" ? body.phone : null;

  const { data, error } = await context.supabase.rpc("spanish_save_learning_state", {
    p_user_id: context.user.id,
    p_state: state,
    p_source_lang: sourceLang,
    p_full_name: fullName,
    p_phone: phone,
  });

  if (error) {
    console.error("[Spanish Account] Save error:", error);
    return spanishJson(request, { error: error.message || "Could not save progress" }, 400);
  }

  return spanishJson(request, { account: data });
}

export async function OPTIONS(request: NextRequest) {
  return spanishPreflight(request);
}
