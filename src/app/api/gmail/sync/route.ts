import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { createServerClient } from "@/lib/supabase/server";
import { resolveEmailAccountAuth } from "@/services/email/account-auth";

export const dynamic = "force-dynamic";

async function getGmailAccessToken(brandId: string): Promise<string | null> {
  const supabase = createServerClient();
  const { data: configs, error } = await supabase
    .from("brand_email_configs")
    .select("*")
    .eq("brand_id", brandId)
    .eq("is_active", true)
    .eq("imap_host", "imap.gmail.com")
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error || !configs?.[0]) return null;
  const auth = await resolveEmailAccountAuth(configs[0]);
  return auth.method === "google_oauth" ? auth.accessToken : null;
}

/**
 * GET /api/gmail/sync?brand_id=BRAND&contactEmail=EMAIL
 * Fetches Gmail thread metadata using the canonical encrypted brand-scoped
 * OAuth connection. The former global plaintext refresh-token path is retired.
 */
export async function GET(req: NextRequest) {
  const adminError = await requireAdminApi(req);
  if (adminError) return adminError;

  const brandId = String(req.nextUrl.searchParams.get("brand_id") || "").trim();
  const contactEmail = String(req.nextUrl.searchParams.get("contactEmail") || "").trim();
  if (!brandId) return NextResponse.json({ error: "brand_id required" }, { status: 400 });
  if (!contactEmail) return NextResponse.json({ error: "contactEmail required" }, { status: 400 });

  let accessToken: string | null = null;
  try {
    accessToken = await getGmailAccessToken(brandId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gmail OAuth failed" }, { status: 401 });
  }
  if (!accessToken) {
    return NextResponse.json({ error: "Gmail er ikke koblet med Google OAuth for dette brandet." }, { status: 401 });
  }

  try {
    const query = encodeURIComponent(`to:${contactEmail} OR from:${contactEmail}`);
    const threadsRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/threads?q=${query}&maxResults=20`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const threadsData = await threadsRes.json();
    if (!threadsRes.ok) {
      return NextResponse.json({ error: threadsData?.error?.message || `Gmail API ${threadsRes.status}` }, { status: 502 });
    }

    if (!threadsData.threads || threadsData.threads.length === 0) {
      return NextResponse.json({ interactions: [], total: 0 });
    }

    const interactions: Array<{
      id: string;
      type: "email";
      content: string;
      date: string;
      direction: "out" | "in";
      source: "gmail";
      threadId: string;
    }> = [];

    for (const thread of threadsData.threads.slice(0, 10)) {
      try {
        const threadRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/threads/${thread.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (!threadRes.ok) continue;
        const threadData = await threadRes.json();
        const messages = threadData.messages || [];
        if (messages.length === 0) continue;

        const headers = messages[0].payload?.headers || [];
        const getHeader = (name: string) => headers.find((header: { name: string; value: string }) => header.name.toLowerCase() === name.toLowerCase())?.value || "";
        const subject = getHeader("Subject") || "(ingen emne)";
        const from = getHeader("From");
        const to = getHeader("To");
        const dateStr = getHeader("Date");
        const parsedDate = dateStr ? new Date(dateStr) : new Date();
        const date = (Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate).toISOString().split("T")[0];
        const fromEmail = from.match(/<(.+?)>|(.+)/)?.[1] || from;
        const isOutgoing = !fromEmail.toLowerCase().includes(contactEmail.toLowerCase());
        const msgCount = messages.length;

        interactions.push({
          id: `gmail_${thread.id}`,
          type: "email",
          content: `${subject}${msgCount > 1 ? ` (${msgCount} meldinger)` : ""} — ${isOutgoing ? "Til" : "Fra"}: ${isOutgoing ? to : from}`,
          date,
          direction: isOutgoing ? "out" : "in",
          source: "gmail",
          threadId: thread.id,
        });
      } catch {
        // Skip one broken thread without failing the whole CRM view.
      }
    }

    interactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return NextResponse.json({ interactions, total: threadsData.resultSizeEstimate || interactions.length });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
