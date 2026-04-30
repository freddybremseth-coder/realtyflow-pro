import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function POST(request: NextRequest) {
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
    .select("id,title")
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
      sent_at: new Date().toISOString(),
    })
    .eq("id", reportId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (mode === "selected") {
    const now = new Date().toISOString();
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id,email,interactions")
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
  }

  return NextResponse.json({
    success: true,
    report: updated,
    mode,
    recipients: mode === "all" ? "portal_all" : recipients,
  });
}
