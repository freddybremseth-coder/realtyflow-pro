export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { requireCronApi } from "@/lib/api-cron";
import { getServiceSupabase } from "@/services/marketing/campaign-production";
import { sendBrandEmail } from "@/services/email/send-brand-email";

function formatCriteria(criteria: Record<string, any>) {
  const labels: Record<string, string> = {
    region: "Region",
    area: "Område",
    budgetMin: "Budsjett fra",
    budgetMax: "Budsjett til",
    propertyType: "Boligtype",
    bedrooms: "Soverom",
    bathrooms: "Bad",
    lifestyle: "Livsstil",
    timeline: "Tidslinje",
  };

  return Object.entries(criteria || {})
    .filter(([key, value]) => labels[key] && value !== "" && value !== null && value !== undefined && value !== false)
    .map(([key, value]) => `${labels[key]}: ${value}`);
}

async function handle(request: NextRequest) {
  const unauthorized = requireCronApi(request);
  if (unauthorized) return unauthorized;

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const now = new Date().toISOString();
  const { data: searches, error } = await supabase
    .from("portal_saved_searches")
    .select("id,contact_id,criteria,confirmation_due_at,confirmation_sent_at,confirmed_at")
    .eq("brand_id", "zeneco")
    .is("confirmed_at", null)
    .is("confirmation_sent_at", null)
    .not("confirmation_due_at", "is", null)
    .lte("confirmation_due_at", now)
    .order("confirmation_due_at", { ascending: true })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let sent = 0;
  let skipped = 0;
  const failures: string[] = [];

  for (const search of searches || []) {
    const { data: contact } = await supabase
      .from("contacts")
      .select("id,name,email,pipeline_status,email_suppressed,do_not_contact")
      .eq("id", search.contact_id)
      .maybeSingle();

    if (!contact?.email || contact.email_suppressed || contact.do_not_contact || String(contact.pipeline_status || "").toUpperCase() === "LOST") {
      skipped += 1;
      continue;
    }

    const lines = formatCriteria((search.criteria || {}) as Record<string, any>);
    const firstName = String(contact.name || "").trim().split(/\s+/)[0] || "Hei";
    const portalUrl = "https://www.zenecohomes.com/min-side?confirm=criteria";
    const summary = lines.length ? lines.join("\n") : "Kriteriene dine ligger lagret på Min side.";

    const bodyText = `Hei ${firstName},\n\nDu oppdaterte nylig boligønskene dine på Min side. Disse kriteriene ligger nå til grunn for boligmatch og eventuelle boligvarsler:\n\n${summary}\n\nSe over og bekreft at dette fortsatt er riktig, eller endre kriteriene hvis noe skal justeres:\n${portalUrl}\n\nMed vennlig hilsen\nZen Eco Homes`;

    const bodyHtml = `<p>Hei ${firstName},</p><p>Du oppdaterte nylig boligønskene dine på Min side. Disse kriteriene ligger nå til grunn for boligmatch og eventuelle boligvarsler:</p><ul>${lines.map((line) => `<li>${line}</li>`).join("")}</ul><p><a href="${portalUrl}"><strong>Bekreft eller endre kriteriene på Min side</strong></a></p><p>Med vennlig hilsen<br>Zen Eco Homes</p>`;

    const sendResult = await sendBrandEmail(supabase, {
      brandId: "zeneco",
      to: [String(contact.email).toLowerCase()],
      subject: "Bekreft boligkriteriene dine | Zen Eco Homes",
      bodyText,
      bodyHtml,
      fromName: "Zen Eco Homes",
      allowSuppressed: true,
    });

    if (!sendResult.success) {
      failures.push(`${search.id}: ${sendResult.error || "send failed"}`);
      continue;
    }

    await supabase.from("portal_messages").insert({
      contact_id: contact.id,
      email: String(contact.email).toLowerCase(),
      brand_id: "zeneco",
      sender_type: "advisor",
      sender_name: "Zen Eco Homes",
      body: `Du oppdaterte nylig boligønskene dine. Disse kriteriene ligger nå til grunn for boligmatch og boligvarsler. Bekreft gjerne at de fortsatt er riktige, eller juster dem på Min side.\n\n${summary}`,
      attachments: [],
      created_at: now,
    });

    await supabase
      .from("portal_saved_searches")
      .update({ confirmation_sent_at: now, updated_at: now })
      .eq("id", search.id);

    sent += 1;
  }

  return NextResponse.json({ success: true, checked: (searches || []).length, sent, skipped, failures });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
