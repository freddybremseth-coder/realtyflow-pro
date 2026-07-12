import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import {
  buildRevenueEventDedupeKey,
  insertRevenueEvent,
} from "@/lib/revenue/events";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json();
  const reportId = String(body.reportId || "");
  const mode = body.mode === "selected" ? "selected" : "all";
  const recipients = Array.isArray(body.recipients)
    ? body.recipients.map((email: string) => email.trim().toLowerCase()).filter(Boolean)
    : [];

  if (!reportId) return NextResponse.json({ error: "reportId is required" }, { status: 400 });
  if (mode === "selected" && recipients.length === 0) {
    return NextResponse.json({ error: "Choose at least one recipient" }, { status: 400 });
  }

  const { data: report, error: reportError } = await supabase
    .from("market_reports")
    .select("id,title,summary,template_id,brand")
    .eq("id", reportId)
    .single();

  if (reportError || !report) {
    return NextResponse.json({ error: reportError?.message || "Report not found" }, { status: 404 });
  }

  const { data: updated, error } = await supabase
    .from("market_reports")
    .update({
      recipients: mode === "all" ? "portal_all" : "portal_selected",
      sent_to: mode === "all" ? [] : recipients,
    })
    .eq("id", reportId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (mode === "selected") {
    const now = new Date().toISOString();
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id,email,brand_id,interactions")
      .in("email", recipients);

    await Promise.all(
      (contacts || []).map((contact) => {
        const interactions = Array.isArray(contact.interactions) ? contact.interactions : [];
        return supabase
          .from("contacts")
          .update({
            interactions: [
              {
                id: `portal_report_${Date.now()}`,
                type: "note",
                source: "market-intelligence",
                date: now.split("T")[0],
                content: `Market Intelligence-rapport publisert på Min side: ${report.title}`,
              },
              ...interactions,
            ],
            updated_at: now,
          })
          .eq("id", contact.id);
      }),
    );

    const eventResults = await Promise.all(
      (contacts || []).map((contact) => insertRevenueEvent(supabase, {
        eventType: "note",
        title: "Rapport publisert på Min side",
        description: `Publisert for ${contact.email}: ${report.title}`,
        contactId: contact.id,
        brandId: contact.brand_id || null,
        sourceSystem: "portal",
        sourceType: "market_report_published",
        sourceId: report.id,
        actorType: "system",
        confidenceScore: 78,
        occurredAt: now,
        dedupeKey: buildRevenueEventDedupeKey([
          "portal",
          "market_report_published",
          report.id,
          contact.id,
        ]),
        metadata: {
          report_id: report.id,
          report_title: report.title,
          report_summary: report.summary || null,
          template_id: report.template_id || null,
          recipient_email: contact.email,
          publish_mode: mode,
        },
        createdBy: "api/reports/publish-portal",
      })),
    );

    const failedEvent = eventResults.find((result) => !result.ok && !result.tableNotReady);
    if (failedEvent) {
      console.warn("[reports/publish-portal] selected revenue event insert failed", failedEvent.error);
    }
  } else {
    const now = new Date().toISOString();
    const eventResult = await insertRevenueEvent(supabase, {
      eventType: "note",
      title: "Rapport publisert til alle portalbrukere",
      description: report.title,
      contactId: null,
      brandId: null,
      sourceSystem: "portal",
      sourceType: "market_report_published",
      sourceId: report.id,
      actorType: "system",
      confidenceScore: 70,
      occurredAt: now,
      dedupeKey: buildRevenueEventDedupeKey([
        "portal",
        "market_report_published",
        report.id,
        "all",
      ]),
      metadata: {
        report_id: report.id,
        report_title: report.title,
        report_summary: report.summary || null,
        template_id: report.template_id || null,
        report_brand: report.brand || null,
        publish_mode: mode,
        recipients: "portal_all",
      },
      createdBy: "api/reports/publish-portal",
    });

    if (!eventResult.ok && !eventResult.tableNotReady) {
      console.warn("[reports/publish-portal] aggregate revenue event insert failed", eventResult.error);
    }
  }

  return NextResponse.json({
    success: true,
    report: updated,
    mode,
    recipients: mode === "all" ? "portal_all" : recipients,
  });
}
