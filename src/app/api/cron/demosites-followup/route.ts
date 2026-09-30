import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendBrandEmail } from "@/services/email/send-brand-email";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

/**
 * Automatic sales follow-up for customer-initiated DemoSites requests.
 *
 * Seller-generated, imported, showcase and test demos are deliberately excluded.
 * The sequence is conversion-oriented but stops automatically as soon as the
 * order is paid, cancelled or leaves the preview stage.
 */

const EMAIL_BRAND_ID = process.env.DEMOSITES_EMAIL_BRAND_ID || "chatgenius";
const READY_AFTER_MS = 4 * 60 * 60 * 1000;
const MIDWAY_AFTER_MS = 36 * 60 * 60 * 1000;
const FINAL_WINDOW_MS = 36 * 60 * 60 * 1000;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function isInternalImportEmail(value: string) {
  return /^demosites-import\+[^@\s]+@chatgenius\.pro$/i.test(value.trim());
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "long" }).format(new Date(value));
}

type FollowupKind = "ready" | "midway" | "final";

type FollowupOrder = {
  id: string;
  company_name: string;
  customer_name: string | null;
  customer_email: string;
  status: string;
  billing_status: string | null;
  preview_url: string | null;
  claim_url: string | null;
  expires_at: string | null;
  created_at: string;
  editable_fields: Record<string, unknown> | null;
};

function firstName(order: FollowupOrder) {
  const source = (order.customer_name || "").trim();
  if (!source || source.toLowerCase() === order.company_name.toLowerCase()) return "";
  return source.split(/\s+/)[0] || "";
}

function greeting(order: FollowupOrder) {
  const name = firstName(order);
  return name ? `Hi ${name},` : "Hi,";
}

function buildEmail(order: FollowupOrder, kind: FollowupKind) {
  const expires = order.expires_at ? formatDate(order.expires_at) : "soon";
  const hello = greeting(order);
  const preview = order.preview_url || "";
  const claim = order.claim_url || "";

  if (kind === "final") {
    return {
      subject: `Your ${order.company_name} website demo expires soon`,
      bodyText: `${hello}

Your website demo for ${order.company_name} is about to expire.

You can still review it here:
${preview}

If you want us to turn it into your live website, you can secure it here:
${claim}

The order takes less than a minute. Once completed, we can prepare the final version and launch process.

If there is one thing you would like changed before deciding, reply to this email and tell us what it is.

Best regards
ChatGenius DemoSites`,
    };
  }

  if (kind === "midway") {
    return {
      subject: `Would you like us to launch the new ${order.company_name} website?`,
      bodyText: `${hello}

Have you had a chance to review the website demo we created for ${order.company_name}?

View the demo:
${preview}

It is designed to work across mobile, tablet and desktop, with a clear structure that helps visitors understand the business and take the next step.

If you like the direction, you can continue here:
${claim}

If you want a different look, wording or emphasis, reply to this email. We can adjust the direction before launch.

Best regards
ChatGenius DemoSites`,
    };
  }

  return {
    subject: `Your ${order.company_name} website demo is ready`,
    bodyText: `${hello}

Your new website demo for ${order.company_name} is ready to review:

${preview}

Open it on both your phone and desktop. The goal is a simple, fast and modern site that makes the business look professional and gives customers a clear reason to get in touch.

If you want to keep the site and move towards launch, continue here:
${claim}

The demo remains available until ${expires}.

Best regards
ChatGenius DemoSites`,
  };
}

function getOrigin(fields: Record<string, unknown> | null) {
  return String(fields?.order_origin || "").trim().toLowerCase();
}

function chooseFollowup(order: FollowupOrder, now: number): FollowupKind | null {
  const fields = { ...(order.editable_fields || {}) };
  const followups = { ...((fields.followups as Record<string, unknown>) || {}) };
  const expiresMs = order.expires_at ? new Date(order.expires_at).getTime() : 0;
  const createdMs = new Date(order.created_at).getTime();

  if (!expiresMs || !Number.isFinite(expiresMs) || !Number.isFinite(createdMs)) return null;
  if (expiresMs <= now) return null;

  if (expiresMs - now < FINAL_WINDOW_MS && !followups.final_sent_at) return "final";
  if (now - createdMs >= MIDWAY_AFTER_MS && !followups.midway_sent_at && expiresMs - now >= FINAL_WINDOW_MS) return "midway";
  if (now - createdMs >= READY_AFTER_MS && !followups.ready_sent_at) return "ready";
  return null;
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const supplied = request.headers.get("authorization") || "";
    if (supplied !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("demo_site_orders")
    .select("id, company_name, customer_name, customer_email, status, billing_status, preview_url, claim_url, expires_at, created_at, editable_fields")
    .in("status", ["draft_preview", "preview_ready"])
    .neq("billing_status", "paid")
    .gt("expires_at", nowIso)
    .order("expires_at", { ascending: true })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const now = Date.now();
  const results: Array<{ order_id: string; kind: FollowupKind; sent: boolean; reason?: string }> = [];

  for (const row of (data || []) as FollowupOrder[]) {
    if (!row.customer_email || isInternalImportEmail(row.customer_email)) continue;
    if (getOrigin(row.editable_fields) !== "customer_initiated") continue;
    if (!row.preview_url || !row.claim_url || !row.expires_at) continue;

    const kind = chooseFollowup(row, now);
    if (!kind) continue;

    const email = buildEmail(row, kind);
    const sendResult = await sendBrandEmail(supabase as never, {
      brandId: EMAIL_BRAND_ID,
      to: [row.customer_email],
      subject: email.subject,
      bodyText: email.bodyText,
    }).catch((err) => ({ success: false, error: err instanceof Error ? err.message : "send failed" }));

    if (sendResult.success) {
      const fields = { ...(row.editable_fields || {}) };
      const followups = { ...((fields.followups as Record<string, unknown>) || {}) };
      followups[`${kind}_sent_at`] = new Date().toISOString();
      fields.followups = followups;

      await supabase.from("demo_site_orders").update({ editable_fields: fields }).eq("id", row.id);

      try {
        await supabase.from("demo_site_order_events").insert({
          order_id: row.id,
          event_type: "demo_followup_sent",
          title: kind === "final" ? "Final conversion email sent" : kind === "midway" ? "Conversion follow-up sent" : "Demo ready email sent",
          description: `Automatic DemoSites follow-up sent to the customer email.`,
          metadata: { kind, language: "en", order_origin: "customer_initiated" },
        });
      } catch {
        // Event logging is best-effort.
      }
    }

    results.push({
      order_id: row.id,
      kind,
      sent: Boolean(sendResult.success),
      reason: "error" in sendResult ? sendResult.error : undefined,
    });
  }

  return NextResponse.json({
    checked: (data || []).length,
    sent: results.filter((result) => result.sent).length,
    results,
  });
}
