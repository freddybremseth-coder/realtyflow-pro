import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

function minutesSince(value?: string | null) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.round((Date.now() - time) / 60_000));
}

function activityLabel(minutes: number | null) {
  if (minutes == null) return "INVITED";
  if (minutes <= 30) return "RECENT_30M";
  if (minutes <= 120) return "RECENT_2H";
  if (minutes <= 24 * 60) return "TODAY";
  return "ACTIVE";
}

function engagementScore(input: {
  status?: string | null;
  lastLoginMinutes: number | null;
  interested24h: number;
  messages24h: number;
  portalChanges24h: number;
  hotSignals24h: number;
}) {
  let score = input.status === "active" ? 25 : input.status === "invited" ? 8 : 0;
  if (input.lastLoginMinutes != null) {
    if (input.lastLoginMinutes <= 30) score += 45;
    else if (input.lastLoginMinutes <= 120) score += 30;
    else if (input.lastLoginMinutes <= 24 * 60) score += 15;
    else if (input.lastLoginMinutes <= 7 * 24 * 60) score += 5;
  }
  score += Math.min(20, input.interested24h * 10);
  score += Math.min(20, input.messages24h * 10);
  score += Math.min(15, input.hotSignals24h * 10 + input.portalChanges24h * 3);
  return Math.max(0, Math.min(100, score));
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const portalR = await supabase
    .from("portal_users")
    .select("id,contact_id,email,name,brand_id,status,invited_at,last_login_at,created_at,updated_at")
    .order("last_login_at", { ascending: false, nullsFirst: false })
    .limit(1000);
  if (portalR.error) return NextResponse.json({ error: portalR.error.message }, { status: 500 });

  const portalUsers = portalR.data || [];
  const contactIds = portalUsers.map((row: any) => String(row.contact_id || "")).filter(Boolean);
  if (!contactIds.length) {
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      summary: { total: 0, invited: 0, active: 0, active30m: 0, active2h: 0, interested24h: 0, messages24h: 0, changes24h: 0, hotSignals24h: 0 },
      customers: [],
    });
  }

  const [contactsR, feedbackR, messagesR, portalEventsR] = await Promise.all([
    supabase
      .from("contacts")
      .select("id,name,email,phone,brand_id,brand,pipeline_status,pipeline_value,next_followup,email_suppressed,do_not_contact,updated_at")
      .in("id", contactIds)
      .limit(1000),
    supabase
      .from("property_feedback_events")
      .select("contact_id,property_id,action,created_at")
      .in("contact_id", contactIds)
      .gte("created_at", since7d)
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase
      .from("portal_messages")
      .select("id,contact_id,sender_type,body,created_at")
      .in("contact_id", contactIds)
      .gte("created_at", since7d)
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase
      .from("revenue_events")
      .select("id,contact_id,title,description,source_type,occurred_at,metadata")
      .in("contact_id", contactIds)
      .eq("source_system", "portal")
      .gte("occurred_at", since7d)
      .order("occurred_at", { ascending: false })
      .limit(4000),
  ]);

  if (contactsR.error) return NextResponse.json({ error: contactsR.error.message }, { status: 500 });
  const feedbackMissing = Boolean(feedbackR.error && /relation .*property_feedback_events.* does not exist|schema cache/i.test(String(feedbackR.error.message || "")));
  if (feedbackR.error && !feedbackMissing) return NextResponse.json({ error: feedbackR.error.message }, { status: 500 });
  const messagesMissing = Boolean(messagesR.error && /relation .*portal_messages.* does not exist|schema cache/i.test(String(messagesR.error.message || "")));
  if (messagesR.error && !messagesMissing) return NextResponse.json({ error: messagesR.error.message }, { status: 500 });
  if (portalEventsR.error) return NextResponse.json({ error: portalEventsR.error.message }, { status: 500 });

  const contacts = new Map((contactsR.data || []).map((row: any) => [String(row.id), row]));
  const feedback = feedbackMissing ? [] : feedbackR.data || [];
  const messages = messagesMissing ? [] : messagesR.data || [];
  const portalEvents = portalEventsR.data || [];

  const feedbackByContact = new Map<string, any[]>();
  for (const row of feedback as any[]) {
    const key = String(row.contact_id || "");
    if (!key) continue;
    const list = feedbackByContact.get(key) || [];
    list.push(row);
    feedbackByContact.set(key, list);
  }

  const messagesByContact = new Map<string, any[]>();
  for (const row of messages as any[]) {
    const key = String(row.contact_id || "");
    if (!key) continue;
    const list = messagesByContact.get(key) || [];
    list.push(row);
    messagesByContact.set(key, list);
  }

  const eventsByContact = new Map<string, any[]>();
  for (const row of portalEvents as any[]) {
    const key = String(row.contact_id || "");
    if (!key) continue;
    const list = eventsByContact.get(key) || [];
    list.push(row);
    eventsByContact.set(key, list);
  }

  const visibleChangeSignals = new Set([
    "preferences_updated",
    "property_interested",
    "property_not_for_me",
    "favorite_saved",
    "favorite_removed",
    "alerts_updated",
    "criteria_confirmed",
    "newsletter_subscribed",
    "customer_message",
  ]);

  const customers = portalUsers.map((portal: any) => {
    const contactId = String(portal.contact_id || "");
    const contact = contacts.get(contactId) || null;
    const rows = feedbackByContact.get(contactId) || [];
    const messageRows = messagesByContact.get(contactId) || [];
    const eventRows = eventsByContact.get(contactId) || [];
    const lastLoginMinutes = minutesSince(portal.last_login_at);
    const interested24h = rows.filter((row: any) => row.action === "interested" && String(row.created_at || "") >= since24h).length;
    const notForMe24h = rows.filter((row: any) => row.action === "not_for_me" && String(row.created_at || "") >= since24h).length;
    const customerMessages24h = messageRows.filter((row: any) => row.sender_type === "customer" && String(row.created_at || "") >= since24h).length;
    const latestFeedback = rows[0] || null;
    const latestMessage = messageRows.find((row: any) => row.sender_type === "customer") || null;
    const changeRows24h = eventRows.filter((row: any) => visibleChangeSignals.has(String(row.source_type || row.metadata?.portal_signal || "")) && String(row.occurred_at || "") >= since24h);
    const portalChanges24h = changeRows24h.length;
    const hotSignals24h = changeRows24h.filter((row: any) => Boolean(row.metadata?.hot_lead)).length;
    const latestPortalSignal = changeRows24h[0] || eventRows.find((row: any) => visibleChangeSignals.has(String(row.source_type || row.metadata?.portal_signal || ""))) || null;
    const score = engagementScore({
      status: portal.status,
      lastLoginMinutes,
      interested24h,
      messages24h: customerMessages24h,
      portalChanges24h,
      hotSignals24h,
    });

    return {
      portalUserId: portal.id,
      contactId,
      name: contact?.name || portal.name || portal.email,
      email: contact?.email || portal.email,
      phone: contact?.phone || null,
      brandId: contact?.brand_id || contact?.brand || portal.brand_id,
      pipelineStatus: contact?.pipeline_status || null,
      pipelineValue: contact?.pipeline_value || 0,
      nextFollowup: contact?.next_followup || null,
      suppressed: Boolean(contact?.email_suppressed || contact?.do_not_contact),
      portalStatus: portal.status,
      invitedAt: portal.invited_at,
      lastLoginAt: portal.last_login_at,
      lastLoginMinutes,
      activityLabel: activityLabel(lastLoginMinutes),
      engagementScore: score,
      interested24h,
      notForMe24h,
      customerMessages24h,
      portalChanges24h,
      hotSignals24h,
      latestPortalSignal: latestPortalSignal ? {
        signal: latestPortalSignal.source_type || latestPortalSignal.metadata?.portal_signal || null,
        title: latestPortalSignal.title || null,
        description: latestPortalSignal.description || null,
        occurredAt: latestPortalSignal.occurred_at || null,
        hotLead: Boolean(latestPortalSignal.metadata?.hot_lead),
      } : null,
      latestFeedback: latestFeedback ? { action: latestFeedback.action, propertyId: latestFeedback.property_id, createdAt: latestFeedback.created_at } : null,
      latestCustomerMessage: latestMessage ? { body: latestMessage.body, createdAt: latestMessage.created_at } : null,
    };
  }).sort((a: any, b: any) => b.engagementScore - a.engagementScore || Number(a.lastLoginMinutes ?? 999999) - Number(b.lastLoginMinutes ?? 999999));

  const active30m = customers.filter((row: any) => row.lastLoginMinutes != null && row.lastLoginMinutes <= 30).length;
  const active2h = customers.filter((row: any) => row.lastLoginMinutes != null && row.lastLoginMinutes <= 120).length;

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    summary: {
      total: customers.length,
      invited: customers.filter((row: any) => row.portalStatus === "invited").length,
      active: customers.filter((row: any) => row.portalStatus === "active").length,
      active30m,
      active2h,
      interested24h: customers.reduce((sum: number, row: any) => sum + row.interested24h, 0),
      messages24h: customers.reduce((sum: number, row: any) => sum + row.customerMessages24h, 0),
      changes24h: customers.reduce((sum: number, row: any) => sum + row.portalChanges24h, 0),
      hotSignals24h: customers.reduce((sum: number, row: any) => sum + row.hotSignals24h, 0),
    },
    customers,
    note: "Portalaktivitet er et nylig aktivitets-signal, ikke sanntids presence. Endringer i kriterier, favoritter, boligrespons, varsler og meldinger vises som egne signaler med prioritet for oppfølging.",
  }, { headers: { "cache-control": "private, no-store" } });
}
