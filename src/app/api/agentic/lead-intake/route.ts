import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getRequestAccessContext, requireAdminApi } from "@/lib/api-admin";
import { runLeadIntakeProduction } from "@/services/agentic/lead-intake-runtime";
import type { RawInquiry } from "@/services/workflows/lead-intake";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const ctx = await getRequestAccessContext(request);
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = (await request.json().catch(() => ({}))) as Partial<RawInquiry>;
  if (!body.message || !body.source) {
    return NextResponse.json({ error: "message og source er påkrevd" }, { status: 400 });
  }

  const inquiry: RawInquiry = {
    externalId: body.externalId,
    source: String(body.source),
    brandId: body.brandId,
    message: String(body.message),
    contactName: body.contactName,
    contactEmail: body.contactEmail,
    contactPhone: body.contactPhone,
  };

  try {
    const run = await runLeadIntakeProduction(supabase, inquiry, ctx?.role ?? "OWNER");
    return NextResponse.json({ runId: run.id, status: run.status, outcome: run.outcome, steps: run.steps.length });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "lead-intake feilet" }, { status: 500 });
  }
}
