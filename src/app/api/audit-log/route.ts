import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { buildAuditTrail } from "@/lib/access-control";
import { loadAccessSettings } from "@/lib/access-control-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request, { trail: null });
  if (denied) return denied;
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured", trail: null }, { status: 500 });

  const requestedLimit = Number(new URL(request.url).searchParams.get("limit") || 500);
  const limit = Number.isFinite(requestedLimit) ? Math.max(50, Math.min(2000, Math.floor(requestedLimit))) : 500;
  const [contactsResult, accessResult] = await Promise.allSettled([
    supabase.from("contacts").select("id,name,email,interactions,updated_at").order("updated_at", { ascending: false }).limit(2500),
    loadAccessSettings(),
  ]);

  if (contactsResult.status === "rejected" || contactsResult.value?.error) {
    const message = contactsResult.status === "rejected"
      ? contactsResult.reason instanceof Error ? contactsResult.reason.message : "Kunne ikke hente kundehistorikk"
      : contactsResult.value?.error?.message || "Kunne ikke hente kundehistorikk";
    return NextResponse.json({ error: message, trail: null }, { status: 500 });
  }

  const warnings: string[] = [];
  let accessAudit: any[] = [];
  if (accessResult.status === "rejected") warnings.push(`Tilgangsaudit kunne ikke hentes: ${accessResult.reason instanceof Error ? accessResult.reason.message : "ukjent feil"}`);
  else if (accessResult.value.error) warnings.push(`Tilgangsaudit kunne ikke hentes: ${accessResult.value.error}`);
  else accessAudit = accessResult.value.settings.audit;

  const trail = buildAuditTrail({
    contacts: contactsResult.value?.data || [],
    accessAudit,
    warnings,
    limit,
  });
  return NextResponse.json({
    trail,
    coverage: {
      contactInteractions: true,
      accessChanges: accessResult.status === "fulfilled" && !accessResult.value.error,
      legacyActorMayBeMissing: true,
      workItemActorCoverage: false,
      calendarActorCoverage: false,
    },
  });
}
