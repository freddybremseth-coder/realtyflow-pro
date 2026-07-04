import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";

export const dynamic = "force-dynamic";

async function getGmailAccessToken(): Promise<string | null> {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  // Get Gmail refresh token from Supabase
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  const supabase = createClient(url, key);
  const { data } = await supabase.from("brand_settings").select("settings").eq("brand_id", "_system").single();
  const refreshToken = data?.settings?.gmail_refresh_token || process.env.GMAIL_REFRESH_TOKEN;
  if (!refreshToken) return null;

  // Exchange for access token
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data2 = await res.json();
  return data2.access_token || null;
}

/**
 * GET /api/gmail/sync?contactEmail=EMAIL
 * Fetches Gmail threads to/from the given email address.
 * Returns them as interaction objects for the CRM.
 */
export async function GET(req: NextRequest) {
  const adminError = await requireAdminApi(req);
  if (adminError) return adminError;

  const contactEmail = req.nextUrl.searchParams.get("contactEmail");
  if (!contactEmail) {
    return NextResponse.json({ error: "contactEmail required" }, { status: 400 });
  }

  const accessToken = await getGmailAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "Gmail not authorized. Go to Settings → Tilkoblinger → Koble til Gmail." }, { status: 401 });
  }

  try {
    // Search for threads with this contact
    const query = encodeURIComponent(`to:${contactEmail} OR from:${contactEmail}`);
    const threadsRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/threads?q=${query}&maxResults=20`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const threadsData = await threadsRes.json();

    if (!threadsData.threads || threadsData.threads.length === 0) {
      return NextResponse.json({ interactions: [], total: 0 });
    }

    // Fetch each thread's details (limited to 10 to avoid rate limits)
    const interactions = [];
    const threadsToFetch = threadsData.threads.slice(0, 10);

    for (const thread of threadsToFetch) {
      try {
        const threadRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/threads/${thread.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const threadData = await threadRes.json();

        const messages = threadData.messages || [];
        if (messages.length === 0) continue;

        // Get the first message for thread summary
        const firstMsg = messages[0];
        const headers = firstMsg.payload?.headers || [];
        const getHeader = (name: string) => headers.find((h: { name: string; value: string }) => h.name.toLowerCase() === name.toLowerCase())?.value || "";

        const subject = getHeader("Subject") || "(ingen emne)";
        const from = getHeader("From");
        const to = getHeader("To");
        const dateStr = getHeader("Date");
        const date = dateStr ? new Date(dateStr).toISOString().split("T")[0] : new Date().toISOString().split("T")[0];

        // Determine direction
        const fromEmail = from.match(/<(.+?)>|(.+)/)?.[1] || from;
        const isOutgoing = !fromEmail.toLowerCase().includes(contactEmail.toLowerCase());

        const msgCount = messages.length;
        const content = `${subject}${msgCount > 1 ? ` (${msgCount} meldinger)` : ""} — ${isOutgoing ? "Til" : "Fra"}: ${isOutgoing ? to : from}`;

        interactions.push({
          id: `gmail_${thread.id}`,
          type: "email" as const,
          content,
          date,
          direction: isOutgoing ? "out" as const : "in" as const,
          source: "gmail",
          threadId: thread.id,
        });
      } catch {
        // Skip failed threads
      }
    }

    // Sort by date descending
    interactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return NextResponse.json({ interactions, total: threadsData.resultSizeEstimate || interactions.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
