import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendBrandEmail } from "@/services/email/send-brand-email";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

/**
 * Daily follow-up for unclaimed demo sites (vercel.json cron).
 *
 * Two touchpoints inside the demo window:
 *   - "midway": ~1 day after creation — remind them the demo is live,
 *     nudge them to share it internally.
 *   - "final": less than 36 h before expiry — last chance, direct order CTA.
 *
 * Idempotent: each send is flagged in editable_fields.followups so a rerun
 * never double-sends. Internal import addresses (seller-created demos) are
 * skipped — those customers are handled in person.
 */

const EMAIL_BRAND_ID = process.env.DEMOSITES_EMAIL_BRAND_ID || "chatgenius";
const FINAL_WINDOW_MS = 36 * 60 * 60 * 1000;
const MIDWAY_AFTER_MS = 24 * 60 * 60 * 1000;

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
  return new Intl.DateTimeFormat("nb-NO", { dateStyle: "long" }).format(new Date(value));
}

type FollowupOrder = {
  id: string;
  company_name: string;
  customer_name: string | null;
  customer_email: string;
  status: string;
  preview_url: string | null;
  claim_url: string | null;
  expires_at: string | null;
  created_at: string;
  editable_fields: Record<string, unknown> | null;
};

function buildEmail(order: FollowupOrder, kind: "midway" | "final") {
  const name = (order.customer_name || order.company_name).split(" ")[0];
  const expires = order.expires_at ? formatDate(order.expires_at) : "snart";

  if (kind === "final") {
    return {
      subject: `Siste sjanse: demosiden til ${order.company_name} utløper ${expires}`,
      bodyText: `Hei ${name},

Demosiden vi bygde for ${order.company_name} utløper ${expires} — etter det forsvinner den.

Se den en siste gang her:
${order.preview_url || ""}

Vil du beholde siden, bestiller du her (tar under ett minutt):
${order.claim_url || ""}

Har du spørsmål eller vil justere noe før bestilling? Svar på denne e-posten, så hjelper vi deg.

Vennlig hilsen
ChatGenius DemoSites`,
    };
  }

  return {
    subject: `Demosiden til ${order.company_name} er live — har du sett den?`,
    bodyText: `Hei ${name},

Den nye demosiden for ${order.company_name} er live og klar:
${order.preview_url || ""}

Tips: Åpne den på mobilen og del lenken med en kollega — førsteinntrykket sier alt.
Du kan også trykke «Prøv en annen stil» nede til høyre for å se flere design.

Demoen er aktiv til ${expires}. Vil du beholde siden, bestiller du her:
${order.claim_url || ""}

Vennlig hilsen
ChatGenius DemoSites`,
  };
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
    .select("id, company_name, customer_name, customer_email, status, preview_url, claim_url, expires_at, created_at, editable_fields")
    .in("status", ["draft_preview", "preview_ready"])
    .gt("expires_at", nowIso)
    .order("expires_at", { ascending: true })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const now = Date.now();
  const results: Array<{ order_id: string; kind: string; sent: boolean; reason?: string }> = [];

  for (const row of (data || []) as FollowupOrder[]) {
    if (!row.customer_email || isInternalImportEmail(row.customer_email)) continue;
    if (!row.preview_url || !row.claim_url || !row.expires_at) continue;

    const fields = { ...(row.editable_fields || {}) };
    const followups = { ...((fields.followups as Record<string, unknown>) || {}) };
    const expiresMs = new Date(row.expires_at).getTime();
    const createdMs = new Date(row.created_at).getTime();

    let kind: "midway" | "final" | null = null;
    if (expiresMs - now < FINAL_WINDOW_MS && !followups.final_sent_at) {
      kind = "final";
    } else if (now - createdMs > MIDWAY_AFTER_MS && !followups.midway_sent_at && expiresMs - now >= FINAL_WINDOW_MS) {
      kind = "midway";
    }
    if (!kind) continue;

    const email = buildEmail(row, kind);
    const sendResult = await sendBrandEmail(supabase as never, {
      brandId: EMAIL_BRAND_ID,
      to: [row.customer_email],
      subject: email.subject,
      bodyText: email.bodyText,
    }).catch((err) => ({ success: false, error: err instanceof Error ? err.message : "send failed" }));

    if (sendResult.success) {
      followups[`${kind}_sent_at`] = new Date().toISOString();
      fields.followups = followups;
      await supabase.from("demo_site_orders").update({ editable_fields: fields }).eq("id", row.id);
      try {
        await supabase.from("demo_site_order_events").insert({
          order_id: row.id,
          event_type: "demo_followup_sent",
          title: kind === "final" ? "Siste sjanse-e-post sendt" : "Oppfølgings-e-post sendt",
          description: `Sendt til ${row.customer_email}`,
          metadata: { kind },
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

  return NextResponse.json({ checked: (data || []).length, sent: results.filter((r) => r.sent).length, results });
}
