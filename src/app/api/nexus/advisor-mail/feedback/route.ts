import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/services/marketing/campaign-production";
import { insertRevenueEvent, buildRevenueEventDedupeKey } from "@/lib/revenue/events";

export const dynamic = "force-dynamic";

type FeedbackAction = "interested" | "not_for_me";

const ALLOWED_ACTIONS = new Set<FeedbackAction>(["interested", "not_for_me"]);

export async function GET(request: NextRequest) {
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const url = new URL(request.url);
  const contactId = String(url.searchParams.get("contact") || "").trim();
  const propertyId = String(url.searchParams.get("property") || "").trim();
  const action = String(url.searchParams.get("action") || "").trim() as FeedbackAction;
  const brandId = String(url.searchParams.get("brand") || "").trim();
  const campaignId = String(url.searchParams.get("campaign") || "").trim() || null;

  if (!contactId || !propertyId || !ALLOWED_ACTIONS.has(action)) {
    return new NextResponse(renderPage("Ugyldig lenke", "Denne tilbakemeldingslenken mangler nødvendig informasjon."), {
      status: 400,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  const now = new Date().toISOString();
  const eventType = action === "interested" ? "property_interested" : "property_not_for_me";
  const title = action === "interested" ? "Bolig markert interessant" : "Bolig markert ikke for meg";

  const payload = {
    contact_id: contactId,
    property_id: propertyId,
    brand_id: brandId || null,
    action,
    source: "advisor_mail",
    campaign_id: campaignId,
    created_at: now,
  };

  // Dedicated feedback table is optional during rollout. If migration has not
  // landed yet, revenue_events still preserves the customer signal.
  const feedbackInsert = await supabase.from("property_feedback_events").insert(payload);
  const feedbackTableMissing = Boolean(feedbackInsert.error && /relation .*property_feedback_events.* does not exist|schema cache/i.test(feedbackInsert.error.message));
  if (feedbackInsert.error && !feedbackTableMissing) {
    console.warn("[advisor-mail-feedback] property_feedback_events insert failed", feedbackInsert.error.message);
  }

  const revenue = await insertRevenueEvent(supabase, {
    eventType,
    title,
    description: `Advisor Mail · property ${propertyId}`,
    contactId,
    brandId: brandId || null,
    sourceSystem: "advisor_mail",
    sourceType: "property_feedback",
    sourceId: propertyId,
    actorType: "customer",
    confidenceScore: 100,
    occurredAt: now,
    dedupeKey: buildRevenueEventDedupeKey(["advisor_mail_feedback", contactId, propertyId, action, campaignId || "none"]),
    metadata: {
      property_id: propertyId,
      action,
      campaign_id: campaignId,
      channel: "email",
    },
    createdBy: "api/nexus/advisor-mail/feedback",
  });

  if (!revenue.ok && !revenue.tableNotReady) {
    console.warn("[advisor-mail-feedback] revenue event failed", revenue.error);
  }

  // Lightweight CRM learning without overwriting richer profile fields.
  await supabase.from("contacts").update({ updated_at: now }).eq("id", contactId);

  const heading = action === "interested" ? "Takk — notert som interessant" : "Takk — den er markert som ikke for deg";
  const body = action === "interested"
    ? "Nexus bruker dette signalet til å prioritere denne typen bolig og gjøre neste utvalg mer presist. Freddy kan følge opp med flere detaljer eller visning."
    : "Nexus bruker dette signalet til å filtrere bort lignende boliger og gjøre neste utvalg mer relevant for deg.";

  return new NextResponse(renderPage(heading, body), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function renderPage(title: string, body: string) {
  return `<!doctype html>
<html lang="no"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;background:#f6f3ec;font-family:Arial,sans-serif;color:#15202b;">
  <main style="max-width:620px;margin:60px auto;padding:0 18px;">
    <section style="background:white;border:1px solid #e6e1d5;border-radius:14px;padding:34px;box-shadow:0 10px 30px rgba(21,32,43,.06)">
      <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#a8792c;margin-bottom:12px">RealtyFlow · Nexus</div>
      <h1 style="font-family:Georgia,serif;font-size:28px;line-height:1.2;margin:0 0 14px">${escapeHtml(title)}</h1>
      <p style="font-size:16px;line-height:1.7;color:#4b5560;margin:0">${escapeHtml(body)}</p>
    </section>
  </main>
</body></html>`;
}

function escapeHtml(value: string) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
}
