import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireAdminApi } from "@/lib/api-admin";
import { buildCustomerSalesAdvice } from "@/lib/nexus/customer-sales-advisor";
import { runCustomerSalesCoach } from "@/lib/nexus/customer-sales-coach";
import { extractLatestReplyText } from "@/services/email/latest-reply-text";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const RequestSchema = z.object({
  mode: z.enum(["NEXT_STEP", "DISCOVERY", "EMAIL", "OBJECTION", "MEETING"]).default("NEXT_STEP"),
  sourceText: z.string().max(12000).optional().default(""),
  sellerContext: z.string().max(8000).optional().default(""),
});

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

function emailTime(row: Record<string, any>) {
  return new Date(String(row.received_at || row.created_at || 0)).getTime();
}

export async function POST(
  request: NextRequest,
  { params }: { params: { contactId: string } },
) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const parsed = RequestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid sales coach request" }, { status: 400 });

  const contactId = String(params.contactId || "").trim();
  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", contactId)
    .maybeSingle();
  if (contactError || !contact) return NextResponse.json({ error: contactError?.message || "Contact not found" }, { status: 404 });

  const email = String(contact.email || "").trim().toLowerCase();

  const [{ data: profiles }, { data: workItems }, { data: directMessages }, inboundByEmail, outboundByEmail] = await Promise.all([
    supabase
      .from("buyer_profiles")
      .select("id,brand,contact_id,version,status,purchase_readiness,budget_amount,budget_currency,summary,approved_at,created_at,updated_at")
      .eq("contact_id", contactId)
      .order("updated_at", { ascending: false })
      .limit(10),
    supabase
      .from("work_items")
      .select("*")
      .or(`source_id.eq.${contactId},metadata->>contact_id.eq.${contactId}`)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("email_messages")
      .select("id,direction,from_address,to_addresses,subject,body_text,body_html,received_at,created_at,crm_contact_id")
      .or(`crm_contact_id.eq.${contactId},matched_lead_id.eq.${contactId},matched_customer_id.eq.${contactId}`)
      .order("received_at", { ascending: false })
      .limit(100),
    email
      ? supabase
          .from("email_messages")
          .select("id,direction,from_address,to_addresses,subject,body_text,body_html,received_at,created_at,crm_contact_id")
          .eq("direction", "inbound")
          .ilike("from_address", email)
          .order("received_at", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [] as any[] }),
    email
      ? supabase
          .from("email_messages")
          .select("id,direction,from_address,to_addresses,subject,body_text,body_html,received_at,created_at,crm_contact_id")
          .eq("direction", "outbound")
          .contains("to_addresses", [email])
          .order("received_at", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const activeProfile = (profiles || []).find((row: any) => String(row.status || "").toLowerCase() === "approved")
    || (profiles || [])[0]
    || null;

  const [{ data: criteria }, { data: shortlists }] = await Promise.all([
    activeProfile?.id
      ? supabase.from("buyer_profile_criteria").select("*").eq("buyer_profile_id", activeProfile.id).eq("active", true)
      : Promise.resolve({ data: [] as any[] }),
    activeProfile?.id
      ? supabase.from("lead_property_shortlists").select("*").eq("buyer_profile_id", activeProfile.id).order("created_at", { ascending: false }).limit(20)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const messages = new Map<string, any>();
  for (const row of [
    ...(directMessages || []),
    ...(inboundByEmail.data || []),
    ...(outboundByEmail.data || []),
  ]) {
    const id = String(row.id || "");
    if (!id) continue;
    const direction = String(row.direction || "").toLowerCase();
    const raw = String(row.body_text || row.body_html || "");
    messages.set(id, {
      ...row,
      body_text: direction === "inbound" ? (extractLatestReplyText(raw) || raw).slice(0, 12000) : raw.slice(0, 12000),
    });
  }
  const sortedMessages = [...messages.values()].sort((a, b) => emailTime(b) - emailTime(a));
  const sent = sortedMessages.filter((row) => String(row.direction || "").toLowerCase() === "outbound");
  const replies = sortedMessages.filter((row) => String(row.direction || "").toLowerCase() === "inbound");
  const lastSentAt = sent[0]?.received_at || sent[0]?.created_at || null;
  const lastReplyAt = replies[0]?.received_at || replies[0]?.created_at || null;
  const lastSentTime = lastSentAt ? new Date(String(lastSentAt)).getTime() : 0;
  const lastReplyTime = lastReplyAt ? new Date(String(lastReplyAt)).getTime() : 0;

  const communicationDialogue = {
    sentCount: sent.length,
    replyCount: replies.length,
    lastSentAt,
    lastReplyAt,
    awaitingReply: lastSentTime > 0 && lastSentTime > lastReplyTime,
    manualTakeover: contact.email_suppressed === true && String(contact.suppression_reason || "") === "manual_owner_takeover",
    emailBlocked: Boolean(contact.email_suppressed || contact.do_not_contact),
    blockedReason: contact.suppression_reason || (contact.do_not_contact ? "do_not_contact" : null),
    messages: sortedMessages,
  };

  const advisor = buildCustomerSalesAdvice({
    contact,
    activeBuyerProfile: activeProfile,
    criteria: criteria || [],
    shortlists: shortlists || [],
    workItems: workItems || [],
    communicationDialogue,
    now: new Date(),
  });

  const sourceText = parsed.data.sourceText || String(replies[0]?.body_text || "");
  const coach = await runCustomerSalesCoach({
    mode: parsed.data.mode,
    contact,
    buyerProfile: activeProfile,
    criteria: criteria || [],
    communicationDialogue,
    advisor,
    sourceText,
    sellerContext: parsed.data.sellerContext,
  });

  return NextResponse.json({
    ok: true,
    advisor,
    coach: coach.output,
    provider: coach.provider,
    model: coach.model,
    externalAction: false,
    emailSent: false,
    autoSendAllowed: false,
    manualTakeover: communicationDialogue.manualTakeover,
    emailBlocked: communicationDialogue.emailBlocked,
  });
}
