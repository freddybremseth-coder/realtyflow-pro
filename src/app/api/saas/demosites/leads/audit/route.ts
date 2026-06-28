import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildDemoSiteAuditIssues, scoreDemoSiteLead, shouldQualifyLead } from "@/lib/demosites-leads";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RequestBody = Record<string, unknown>;
type SupabaseClientLike = any;

type PageAssetProfile = {
  title: string | null;
  description: string | null;
  logoUrl: string | null;
  imageUrls: string[];
  themeColor: string | null;
};

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env[["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_")];
  if (!url || !key) return null;
  return createClient(url, key);
}

function text(body: RequestBody, snakeCase: string, camelCase = snakeCase) {
  const value = body[snakeCase] ?? body[camelCase];
  const output = String(value || "").trim();
  return output || null;
}

function normalizeWebsiteUrl(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  try {
    const url = new URL(candidate);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase();
    if (!host.includes(".")) return null;
    if (host === "localhost" || host.endsWith(".local")) return null;
    if (host.startsWith("127.") || host.startsWith("10.") || host.startsWith("192.168.")) return null;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function absoluteUrl(value: string | null, baseUrl: string) {
  if (!value) return null;
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}

function firstMatch(html: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtml(match[1].trim());
  }
  return null;
}

function allMatches(html: string, pattern: RegExp, baseUrl: string, limit = 3) {
  const urls: string[] = [];
  for (const match of html.matchAll(pattern)) {
    const url = absoluteUrl(match[1] || null, baseUrl);
    if (url && !urls.includes(url)) urls.push(url);
    if (urls.length >= limit) break;
  }
  return urls;
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractPageProfile(html: string, websiteUrl: string): PageAssetProfile {
  const title = firstMatch(html, [/<title[^>]*>([^<]+)<\/title>/i, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i]);
  const description = firstMatch(html, [
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  ]);
  const themeColor = firstMatch(html, [/<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["'][^>]*>/i]);
  const logoUrl = absoluteUrl(firstMatch(html, [
    /<link[^>]+rel=["'][^"']*(?:icon|apple-touch-icon)[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>/i,
    /<img[^>]+(?:alt|class|id)=["'][^"']*logo[^"']*["'][^>]+src=["']([^"']+)["'][^>]*>/i,
    /<img[^>]+src=["']([^"']+)["'][^>]+(?:alt|class|id)=["'][^"']*logo[^"']*["'][^>]*>/i,
  ]), websiteUrl);

  const imageUrls = [
    ...allMatches(html, /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/gi, websiteUrl, 2),
    ...allMatches(html, /<img[^>]+src=["']([^"']+)["'][^>]*>/gi, websiteUrl, 5),
  ].filter((url, index, list) => list.indexOf(url) === index).slice(0, 3);

  return { title, description, logoUrl, imageUrls, themeColor };
}

function checkPage(html: string, websiteUrl: string, responseMs: number) {
  const lower = html.toLowerCase();
  const hasViewport = /<meta[^>]+name=["']viewport["']/i.test(html);
  const hasCss = /<link[^>]+rel=["']stylesheet["']/i.test(html) || /<style[\s>]/i.test(html);
  const oldLayoutHints = /<font[\s>]|<center[\s>]|table\s+width=/i.test(html);

  const isMobileFriendly = hasViewport;
  const hasModernDesign = hasViewport && hasCss && !oldLayoutHints;
  const hasClearContact = /mailto:|tel:|whatsapp|contacto|kontakt|contact|telefono|teléfono|phone/.test(lower);
  const hasCallToAction = /book|booking|reserve|reservar|contact|contacto|quote|presupuesto|llamar|call|whatsapp|cita/.test(lower);
  const hasFastLoad = responseMs < 3000 && html.length < 750_000;
  const hasSsl = websiteUrl.startsWith("https://");
  const hasSocialProof = /review|reviews|reseña|reseñas|opiniones|testimonials|rating|stars|google reviews/.test(lower);

  return { isMobileFriendly, hasModernDesign, hasClearContact, hasCallToAction, hasFastLoad, hasSsl, hasSocialProof };
}

async function insertLeadEvent(supabase: SupabaseClientLike, leadId: string, title: string, eventType: string, metadata: RequestBody = {}) {
  await supabase.from("demo_site_lead_events").insert({ lead_id: leadId, event_type: eventType, title, metadata });
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase server key is not configured" }, { status: 503 });

  try {
    const body = (await request.json().catch(() => ({}))) as RequestBody;
    const leadId = text(body, "lead_id", "leadId");
    let websiteUrl = normalizeWebsiteUrl(body.website_url ?? body.websiteUrl ?? body.url);

    if (leadId && !websiteUrl) {
      const { data, error } = await supabase.from("demo_site_leads").select("website_url").eq("id", leadId).single();
      if (error) throw error;
      websiteUrl = normalizeWebsiteUrl(data?.website_url);
    }

    if (!websiteUrl) return NextResponse.json({ error: "website_url is required" }, { status: 400 });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const started = Date.now();
    const pageResponse = await fetch(websiteUrl, {
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "ChatGenius DemoSites URL audit" },
    });
    clearTimeout(timeout);

    const responseMs = Date.now() - started;
    const contentType = pageResponse.headers.get("content-type") || "";
    if (!pageResponse.ok) return NextResponse.json({ error: `Could not load URL: ${pageResponse.status}` }, { status: 400 });
    if (!contentType.includes("text/html") && contentType) return NextResponse.json({ error: "URL did not return HTML" }, { status: 400 });

    const html = (await pageResponse.text()).slice(0, 1_000_000);
    const checks = checkPage(html, websiteUrl, responseMs);
    const issues = buildDemoSiteAuditIssues(checks);
    const score = scoreDemoSiteLead(issues);
    const profile = extractPageProfile(html, websiteUrl);
    const nextStatus = shouldQualifyLead(score, issues) ? "qualified" : "scanned";

    const auditPayload = {
      lead_id: leadId,
      website_url: websiteUrl,
      score,
      mobile_score: checks.isMobileFriendly ? 85 : 35,
      performance_score: checks.hasFastLoad ? 80 : 45,
      design_score: checks.hasModernDesign ? 80 : 45,
      seo_score: profile.title && profile.description ? 75 : 45,
      trust_score: checks.hasSocialProof ? 75 : 45,
      issue_count: issues.length,
      issues,
      improvements: issues.map((issue) => issue.improvement),
      extracted_profile: { title: profile.title, description: profile.description, checks, response_ms: responseMs },
      logo_url: profile.logoUrl,
      image_urls: profile.imageUrls,
      brand_colors: profile.themeColor ? { primary: profile.themeColor } : {},
      audit_status: "completed",
    };

    let audit = auditPayload;
    if (leadId) {
      const { data, error } = await supabase.from("demo_site_lead_audits").insert(auditPayload).select("*").single();
      if (error) throw error;
      audit = data;

      await supabase.from("demo_site_leads").update({
        lead_status: nextStatus,
        last_scanned_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: { last_audit_score: score, issue_count: issues.length },
      }).eq("id", leadId);

      await insertLeadEvent(supabase, leadId, "URL analysert", "url_audited", { score, issue_count: issues.length, website_url: websiteUrl });
    }

    return NextResponse.json({ audit, checks, profile, score, issue_count: issues.length, next_status: nextStatus });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not audit URL" }, { status: 500 });
  }
}
