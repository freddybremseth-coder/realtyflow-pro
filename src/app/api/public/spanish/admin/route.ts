import { NextRequest } from "next/server";
import {
  requireSpanishAdmin,
  spanishJson,
  spanishPreflight,
} from "@/lib/spanish-api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const context = await requireSpanishAdmin(request);
  if ("error" in context) return context.error;

  const { data, error } = await context.supabase.rpc("spanish_admin_snapshot", {
    p_actor_user_id: context.user.id,
  });
  if (error) {
    console.error("[Spanish Admin] Snapshot error:", error);
    return spanishJson(request, { error: "Could not load admin data" }, 500);
  }

  return spanishJson(request, { admin: data });
}

export async function POST(request: NextRequest) {
  const context = await requireSpanishAdmin(request);
  if ("error" in context) return context.error;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action || "");

  if (action === "grant") {
    const email = String(body.email || "").trim();
    const fullName = String(body.full_name || "").trim();
    const phone = String(body.phone || "").trim();
    const accessKind = String(body.access_kind || "manual");
    const note = String(body.note || "").trim();
    const endsAt = body.ends_at ? String(body.ends_at) : null;

    const { data, error } = await context.supabase.rpc("spanish_set_access", {
      p_email: email,
      p_full_name: fullName,
      p_phone: phone || null,
      p_access_kind: accessKind,
      p_ends_at: endsAt,
      p_note: note || null,
      p_actor_user_id: context.user.id,
    });

    if (error) {
      return spanishJson(request, { error: error.message || "Could not grant access" }, 400);
    }
    return spanishJson(request, { result: data }, 201);
  }

  if (action === "revoke") {
    const userId = String(body.user_id || "");
    if (!userId) return spanishJson(request, { error: "user_id is required" }, 400);

    const { data, error } = await context.supabase.rpc("spanish_revoke_complimentary_access", {
      p_user_id: userId,
      p_actor_user_id: context.user.id,
    });

    if (error) {
      return spanishJson(request, { error: error.message || "Could not revoke access" }, 400);
    }
    return spanishJson(request, { result: data });
  }

  return spanishJson(request, { error: "Unsupported admin action" }, 400);
}

export async function OPTIONS(request: NextRequest) {
  return spanishPreflight(request);
}
