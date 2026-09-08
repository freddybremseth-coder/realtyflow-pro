import { NextRequest, NextResponse } from "next/server";
import { normalizeRealEstateStage } from "@/lib/customers/action-priority";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

type CustomerStage = "NEW" | "CONTACT" | "QUALIFIED" | "MATCHING" | "VIEWING" | "NEGOTIATION" | "RESERVED" | "ON_HOLD" | "WON";

const PROGRESS: Record<CustomerStage, number> = {
  NEW: 10,
  CONTACT: 20,
  QUALIFIED: 35,
  MATCHING: 50,
  VIEWING: 65,
  NEGOTIATION: 78,
  RESERVED: 88,
  ON_HOLD: 40,
  WON: 100,
};

function stageOf(value: unknown): CustomerStage {
  const stage = normalizeRealEstateStage(value);
  return (["CONTACT", "QUALIFIED", "MATCHING", "VIEWING", "NEGOTIATION", "RESERVED", "ON_HOLD", "WON"] as string[]).includes(stage)
    ? (stage as CustomerStage)
    : "NEW";
}

function iso(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function GET(request: NextRequest) {
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Missing portal session" }, { status: 401 });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user?.email) {
    return NextResponse.json({ error: "Invalid portal session" }, { status: 401 });
  }

  const email = userData.user.email.trim().toLowerCase();
  const { data: contact, error } = await supabase
    .from("contacts")
    .select("pipeline_status,next_followup,waiting_until,email_suppressed,do_not_contact,updated_at")
    .ilike("email", email)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!contact) return NextResponse.json({ error: "Portal contact not found" }, { status: 404 });

  const normalized = normalizeRealEstateStage(contact.pipeline_status);
  if (normalized === "LOST" || contact.email_suppressed || contact.do_not_contact) {
    return NextResponse.json({ error: "Portal access is not active for this contact" }, { status: 403 });
  }

  const stage = stageOf(normalized);
  return NextResponse.json(
    {
      stage,
      progress: PROGRESS[stage],
      completed: stage === "WON",
      paused: stage === "ON_HOLD",
      nextFollowup: iso(contact.next_followup),
      waitingUntil: iso(contact.waiting_until),
      updatedAt: iso(contact.updated_at),
    },
    { headers: { "cache-control": "private, no-store" } },
  );
}
