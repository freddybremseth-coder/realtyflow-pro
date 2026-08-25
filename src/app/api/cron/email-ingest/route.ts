export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireNexusSchedulerApi } from "@/lib/nexus/scheduler-auth";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { fetchRecentEmails, type ImapConfig } from "@/services/email/imap-reader";
import { decryptPassword } from "@/services/email/crypto";
import { insertRevenueEvent } from "@/lib/revenue/events";
import { buildEmailReceivedRevenueEventInput, normalizeEmailAddresses } from "@/lib/revenue/email-events";

export const maxDuration = 300;
const FAILURE_PAUSE_THRESHOLD = 3;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireNexusSchedulerApi(request);
  if (unauthorized) return unauthorized;

  const safeMode = await evaluateCronSafeMode("/api/cron/email-ingest");
  if (safeMode.skip) return NextResponse.json({ success: true, skipped: true, mode: safeMode.mode, reason: safeMode.reason });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { data: configs, error } = await supabase
    .from("brand_email_configs")
    .select("*")
    .eq("is_active", true)
    .eq("auto_fetch", true)
    .order("last_fetched_at", { ascending: true, nullsFirst: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const now = Date.now();
  const results: Array<{ brand: string; email: string; fetched: number; inserted: number; skipped?: string; error?: string; health?: string }> = [];
  let totalInserted = 0;
  let totalFetched = 0;

  for (const config of configs ?? []) {
    const intervalMs = Math.max(5, Number(config.fetch_interval_minutes || 5)) * 60_000;
    if (config.last_fetched_at && now - new Date(config.last_fetched_at).getTime() < intervalMs) {
      results.push({ brand: config.brand_id, email: config.email_address, fetched: 0, inserted: 0, skipped: "not_due", health: config.health_status || "unknown" });
      continue;
    }

    try {
      const password = decryptPassword(config.encrypted_password, config.encryption_iv);
      const imap: ImapConfig = { host: config.imap_host, port: config.imap_port, secure: config.imap_secure, email: config.email_address, password };
      const sinceDays = config.last_fetched_at ? Math.max(1, Math.min(30, Math.ceil((now - new Date(config.last_fetched_at).getTime()) / 86_400_000))) : 7;
      const fetched = await fetchRecentEmails(imap, 100, sinceDays);
      totalFetched += fetched.length;

      const messageIds = fetched.map((email) => email.messageId).filter(Boolean);
      const { data: existing } = messageIds.length
        ? await supabase.from("email_messages").select("message_id").eq("brand_id", config.brand_id).in("message_id", messageIds)
        : { data: [] as Array<{ message_id: string }> };
      const existingIds = new Set((existing ?? []).map((row: any) => String(row.message_id)));

      let insertedCount = 0;
      for (const email of fetched) {
        if (!email.messageId || existingIds.has(email.messageId)) continue;
        const { data: insertedMessage, error: insertError } = await supabase.from("email_messages").insert({
          brand_id: config.brand_id,
          message_id: email.messageId,
          thread_id: email.threadId || email.messageId,
          direction: "inbound",
          from_address: email.from.address,
          from_name: email.from.name || null,
          to_addresses: email.to.map((t) => t.address),
          cc_addresses: email.cc?.map((c) => c.address) || null,
          subject: email.subject,
          body_text: email.bodyText || null,
          body_html: email.bodyHtml || null,
          received_at: email.date.toISOString(),
        }).select("id").single();
        if (insertError) continue;
        existingIds.add(email.messageId);
        insertedCount++;
        totalInserted++;

        const normalizedFrom = normalizeEmailAddresses([email.from.address])[0];
        const { data: contact } = normalizedFrom
          ? await supabase.from("contacts").select("id").eq("brand_id", config.brand_id).ilike("email", normalizedFrom).order("updated_at", { ascending: false }).limit(1).maybeSingle()
          : { data: null };
        await insertRevenueEvent(supabase, buildEmailReceivedRevenueEventInput({
          brandId: config.brand_id,
          fromAddress: email.from.address,
          fromName: email.from.name || null,
          toAddresses: email.to.map((t) => t.address),
          subject: email.subject,
          bodyPreview: (email.bodyText || "").slice(0, 280),
          receivedAt: email.date.toISOString(),
          messageId: email.messageId,
          threadId: email.threadId || email.messageId,
          storedEmailMessageId: insertedMessage?.id || null,
          contactId: contact?.id || null,
        }));
      }

      const fetchedAt = new Date().toISOString();
      await supabase.from("brand_email_configs").update({
        last_fetched_at: fetchedAt,
        health_status: "healthy",
        health_message: null,
        consecutive_failures: 0,
        last_success_at: fetchedAt,
        last_error_at: null,
        auto_fetch_paused_by_system: false,
      }).eq("id", config.id);
      results.push({ brand: config.brand_id, email: config.email_address, fetched: fetched.length, inserted: insertedCount, health: "healthy" });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const failures = Number(config.consecutive_failures || 0) + 1;
      const pause = failures >= FAILURE_PAUSE_THRESHOLD;
      await supabase.from("brand_email_configs").update({
        health_status: pause ? "paused" : "degraded",
        health_message: message,
        consecutive_failures: failures,
        last_error_at: new Date().toISOString(),
        ...(pause ? { auto_fetch: false, auto_fetch_paused_by_system: true } : {}),
      }).eq("id", config.id);
      results.push({ brand: config.brand_id, email: config.email_address, fetched: 0, inserted: 0, error: message, health: pause ? "paused" : "degraded" });
    }
  }

  const { error: logError } = await supabase.from("automation_logs").insert({
    action: "email_ingest",
    agent_name: "nexus_email_ingest_cron",
    status: results.some((r) => r.error) ? "partial" : "success",
    details: { accounts: results.length, total_fetched: totalFetched, total_inserted: totalInserted, runtime_control: "cron:/api/cron/email-ingest", paused_accounts: results.filter(r => r.health === "paused").length },
  });
  if (logError) console.error("[email-ingest] automation log failed", logError.message);

  return NextResponse.json({ success: true, accounts: results.length, total_fetched: totalFetched, total_inserted: totalInserted, results, logged: !logError });
}
