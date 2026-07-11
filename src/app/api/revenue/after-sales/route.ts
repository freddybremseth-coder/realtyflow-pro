import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import {
  buildAfterSalesCustomer,
  sortAfterSalesCustomers,
  type AfterSalesActionId,
} from "@/lib/revenue/after-sales";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const WON_STATUSES = ["WON", "VUNNET", "SOLGT", "SOLD", "CLOSED_WON", "CLOSED", "COMPLETED", "CUSTOMER", "KUNDE", "VIP"];
const ACTION_LABELS: Record<AfterSalesActionId, string> = {
  welcome_checkin: "Overtakelsesoppfølging markert som utført",
  welcome_gift: "Dona Anna velkomstgave vurdert eller forberedt",
  care_offer: "Nøkkelhold eller eiendomstilsyn markert som tilbudt",
  review_request: "Omtale eller testimonial markert som forespurt",
  referral_request: "Anbefaling til venner eller familie markert som forespurt",
  annual_review: "Årlig bolig- og behovsgjennomgang markert som utført",
};
const ACTION_IDS = new Set<AfterSalesActionId>(Object.keys(ACTION_LABELS) as AfterSalesActionId[]);

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function nextFollowupIso(days: number) {
  const date = new Date(Date.now() + days * 86_400_000);
  date.setHours(9, 0, 0, 0);
  return date.toISOString();
}

export async function GET(request: NextRequest) {
  const adminError = await requireAdminApi(request, { customers: [], summary: null });
  if (adminError) return adminError;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured", customers: [] }, { status: 500 });

  const { data, error } = await supabase
    .from("contacts")
    .select("id,name,email,phone,pipeline_status,pipeline_value,sale_price,property_interest,notes,interactions,brand_id,brand,last_contact,next_followup,won_at,closed_at,sale_date,updated_at,created_at")
    .in("pipeline_status", WON_STATUSES)
    .order("updated_at", { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message, customers: [] }, { status: 500 });

  const customers = sortAfterSalesCustomers(
    (data || [])
      .map((contact) => buildAfterSalesCustomer(contact))
      .filter(Boolean) as NonNullable<ReturnType<typeof buildAfterSalesCustomer>>[],
  );

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    summary: {
      wonCustomers: customers.length,
      dueNow: customers.filter((item) => item.dueActions.length > 0 || item.isOverdue).length,
      referralReady: customers.filter((item) => item.dueActions.includes("referral_request")).length,
      reviewReady: customers.filter((item) => item.dueActions.includes("review_request")).length,
      careReady: customers.filter((item) => item.dueActions.includes("care_offer")).length,
      relationshipValue: customers.reduce((sum, item) => sum + item.value, 0),
    },
    customers,
  });
}

export async function POST(request: NextRequest) {
  const adminError = await requireAdminApi(request);
  if (adminError) return adminError;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const contactId = String(body.contactId || "").trim();
  const action = body.action ? String(body.action).trim() as AfterSalesActionId : null;
  const requestedDays = body.nextFollowupDays === undefined ? null : Number(body.nextFollowupDays);

  if (!contactId) return NextResponse.json({ error: "contactId is required" }, { status: 400 });
  if (action && !ACTION_IDS.has(action)) return NextResponse.json({ error: "Invalid after-sales action" }, { status: 400 });
  if (requestedDays !== null && (!Number.isInteger(requestedDays) || requestedDays < 1 || requestedDays > 730)) {
    return NextResponse.json({ error: "nextFollowupDays must be an integer between 1 and 730" }, { status: 400 });
  }
  if (!action && requestedDays === null) return NextResponse.json({ error: "action or nextFollowupDays is required" }, { status: 400 });

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id,name,email,phone,pipeline_status,pipeline_value,sale_price,property_interest,notes,interactions,brand_id,brand,last_contact,next_followup,won_at,closed_at,sale_date,updated_at,created_at")
    .eq("id", contactId)
    .single();

  if (contactError || !contact) return NextResponse.json({ error: contactError?.message || "Contact not found" }, { status: 404 });
  if (!buildAfterSalesCustomer(contact)) return NextResponse.json({ error: "Contact is not a won customer" }, { status: 409 });

  const now = new Date().toISOString();
  const interactions = Array.isArray(contact.interactions) ? contact.interactions : [];
  const updates: Record<string, unknown> = { updated_at: now };

  if (action) {
    updates.interactions = [
      {
        id: crypto.randomUUID(),
        type: "after_sales",
        action,
        content: ACTION_LABELS[action],
        date: now,
        internal: true,
        metadata: { action, source: "after-sales-workspace", customer_contact_sent: false },
      },
      ...interactions,
    ];
    updates.last_contact = now;
  }
  if (requestedDays !== null) updates.next_followup = nextFollowupIso(requestedDays);

  const { data: updated, error: updateError } = await supabase
    .from("contacts")
    .update(updates)
    .eq("id", contactId)
    .select("*")
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json({ ok: true, contact: updated, action, customerContactSent: false });
}
