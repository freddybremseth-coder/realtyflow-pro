import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function stripHtml(value?: string | null) {
  return (value || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

const evergreenDocuments = [
  {
    id: "guide-kjopsprosess",
    type: "guide",
    title: "Kjøpsprosessen i Spania",
    summary: "En praktisk steg-for-steg guide fra behovsavklaring til overtakelse.",
    content:
      "Vi starter med behov, område og budsjett. Deretter kvalitetssikres aktuelle boliger, visninger planlegges, og juridisk kontroll gjøres før reservasjon. Etter kontrakt følger innbetalinger, NIE, bank, notar og overtakelse.",
    publishedAt: "2026-04-30T00:00:00.000Z",
    source: "RealtyFlow",
  },
  {
    id: "guide-kostnader",
    type: "guide",
    title: "Kostnader ved boligkjøp",
    summary: "Oversikt over skatt, notar, register, advokat og normale kjøpskostnader.",
    content:
      "Som tommelfingerregel bør du beregne ca. 13,5 prosent i tillegg til kjøpesummen for skatt og kjøpskostnader. Den endelige summen avhenger av region, boligtype, finansiering og juridiske forhold.",
    publishedAt: "2026-04-30T00:00:00.000Z",
    source: "RealtyFlow",
  },
];

export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase service role is not configured" }, { status: 500 });

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Missing portal session" }, { status: 401 });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const email = userData.user?.email?.toLowerCase();
  if (userError || !email) return NextResponse.json({ error: "Invalid portal session" }, { status: 401 });

  const { data: reports, error } = await supabase
    .from("market_reports")
    .select("id,template_id,title,subtitle,summary,content_html,content_text,sections,data_sources,recipients,sent_to,status,channel,published_at,generated_at,created_at")
    .order("generated_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const portalReports = (reports || [])
    .filter((report) => {
      // Only show documents that are explicitly published. Drafts and archived stay hidden.
      // Legacy rows without a status column behave as published for backwards-compat.
      const status = (report as { status?: string }).status;
      if (status && status !== "published") return false;

      // Only show documents whose channel is portal (default for legacy rows).
      const channel = (report as { channel?: string }).channel;
      if (channel && channel !== "portal") return false;

      const sentTo = Array.isArray(report.sent_to) ? report.sent_to.map((item: string) => item.toLowerCase()) : [];
      return report.recipients === "portal_all" || sentTo.includes(email);
    })
    .map((report) => {
      const sections = Array.isArray(report.sections) ? report.sections : [];
      const sectionText = sections
        .map((section: { heading?: string; content?: string }) => [section.heading, stripHtml(section.content)].filter(Boolean).join("\n"))
        .join("\n\n");
      const content = report.content_text || sectionText || stripHtml(report.content_html);
      return {
        id: report.id,
        type: "market_report",
        title: report.title,
        summary: report.summary || report.subtitle || content.slice(0, 180),
        content,
        publishedAt: report.generated_at || report.created_at,
        source: (report.data_sources || []).join(", ") || "Market Intelligence",
      };
    });

  return NextResponse.json({
    documents: [...portalReports, ...evergreenDocuments],
  });
}
