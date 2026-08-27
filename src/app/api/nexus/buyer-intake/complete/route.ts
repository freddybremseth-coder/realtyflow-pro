import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function text(value: unknown, max = 160) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const workItemId = text(body?.workItemId, 120);
  const buyerProfileId = text(body?.buyerProfileId, 120);
  if (!workItemId) return NextResponse.json({ error: "workItemId required" }, { status: 400 });
  if (!buyerProfileId) return NextResponse.json({ error: "buyerProfileId required" }, { status: 400 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const workResult = await supabase
    .from("work_items")
    .select("id,status,metadata,source_type,source_id,assigned_agent")
    .eq("id", workItemId)
    .maybeSingle();
  if (workResult.error) return NextResponse.json({ error: workResult.error.message }, { status: 500 });
  if (!workResult.data) return NextResponse.json({ error: "Buyer Intake work item not found" }, { status: 404 });

  const workItem = workResult.data;
  const metadata = record(workItem.metadata);
  if (metadata.kind !== "buyer_intake_review") {
    return NextResponse.json({ error: "Work item is not a Buyer Intake review" }, { status: 409 });
  }
  const contactId = text(metadata.contact_id, 120);
  if (!contactId) return NextResponse.json({ error: "Buyer Intake review is missing contact_id" }, { status: 409 });

  const profileResult = await supabase
    .from("buyer_profiles")
    .select("id,contact_id,status,version,approved_at")
    .eq("id", buyerProfileId)
    .maybeSingle();
  if (profileResult.error) return NextResponse.json({ error: profileResult.error.message }, { status: 500 });
  if (!profileResult.data) return NextResponse.json({ error: "Buyer Profile not found" }, { status: 404 });

  const profile = profileResult.data;
  if (String(profile.status || "").toLowerCase() !== "approved") {
    return NextResponse.json({ error: "Buyer Profile must be approved before intake completion" }, { status: 409 });
  }
  if (String(profile.contact_id || "") !== contactId) {
    return NextResponse.json({ error: "Buyer Profile does not belong to the Buyer Intake contact" }, { status: 409 });
  }

  const alreadyCompletedWith = text(metadata.buyer_profile_id, 120);
  if (String(workItem.status || "").toUpperCase() === "DONE" && alreadyCompletedWith === buyerProfileId) {
    return NextResponse.json({
      ok: true,
      duplicate: true,
      workItem: { id: workItem.id, status: workItem.status },
      buyerProfile: profile,
      safety: { buyerProfileWritten: false, crmUpdated: false, emailSent: false },
    });
  }

  if (String(workItem.status || "").toUpperCase() === "DONE" && alreadyCompletedWith && alreadyCompletedWith !== buyerProfileId) {
    return NextResponse.json({ error: "Buyer Intake was already completed with another Buyer Profile" }, { status: 409 });
  }

  const completedAt = new Date().toISOString();
  const nextMetadata = {
    ...metadata,
    buyer_profile_updated: true,
    buyer_profile_id: buyerProfileId,
    buyer_profile_version: profile.version ?? null,
    buyer_profile_approved_at: profile.approved_at ?? null,
    completed_at: completedAt,
    external_action_executed: false,
  };

  const updated = await supabase
    .from("work_items")
    .update({
      status: "DONE",
      metadata: nextMetadata,
      next_action: "Buyer Intake er godkjent inn i Buyer Profile. Fortsett med oppdatert matching og salgsoppfølging.",
    })
    .eq("id", workItemId)
    .select("id,status,metadata,updated_at")
    .single();

  if (updated.error || !updated.data) {
    return NextResponse.json({ error: updated.error?.message || "Could not complete Buyer Intake review" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    duplicate: false,
    workItem: updated.data,
    buyerProfile: profile,
    safety: {
      buyerProfileWritten: false,
      buyerProfileVerifiedApproved: true,
      sameContactVerified: true,
      crmUpdated: false,
      emailSent: false,
      externalActionExecuted: false,
    },
  });
}
