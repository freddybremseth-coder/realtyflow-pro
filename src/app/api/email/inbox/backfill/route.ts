import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { createServerClient } from "@/lib/supabase/server";
import { resolveEmailHistoryBackfillRequest } from "@/lib/email/history-backfill-policy";
import { decryptPassword } from "@/services/email/crypto";
import {
  fetchHistoricalMailboxEmails,
  type HistoricalFetchedEmail,
  type HistoricalMailboxRole,
  type ImapConfig,
} from "@/services/email/imap-reader";

export const dynamic = "force-dynamic";

function stableMessageId(message: HistoricalFetchedEmail) {
  return message.messageId && !message.messageId.startsWith("gen-") ? message.messageId : null;
}

/**
 * POST /api/email/inbox/backfill
 * Controlled historical mailbox import. Preview is the default and performs no writes.
 * Apply requires the explicit confirmation phrase enforced by history-backfill-policy.
 * Historical messages are stored read + archived so they can be reviewed by Nexus
 * without flooding the operational unread inbox. This route never sends email and
 * never advances brand_email_configs.last_fetched_at.
 */
export async function POST(req: NextRequest) {
  const adminError = await requireAdminApi(req);
  if (adminError) return adminError;

  try {
    const body = await req.json().catch(() => ({}));
    const policy = resolveEmailHistoryBackfillRequest(body as Record<string, unknown>);
    if (!policy.ok || !policy.request) {
      return NextResponse.json({ error: policy.error || "Invalid backfill request" }, { status: 400 });
    }

    const request = policy.request;
    const supabase = createServerClient();
    const { data: configs, error: configError } = await supabase
      .from("brand_email_configs")
      .select("*")
      .eq("brand_id", request.brandId)
      .eq("is_active", true);

    if (configError) return NextResponse.json({ error: configError.message }, { status: 500 });
    if (!configs?.length) {
      return NextResponse.json({ error: "No active email config found for this brand" }, { status: 404 });
    }

    const { data: existingMessages, error: existingError } = await supabase
      .from("email_messages")
      .select("message_id")
      .eq("brand_id", request.brandId);
    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });

    const existingIds = new Set((existingMessages || []).map((row) => String(row.message_id || "")).filter(Boolean));
    let fetched = 0;
    let candidates = 0;
    let duplicates = 0;
    let skippedMissingMessageId = 0;
    let inserted = 0;
    const accountResults: Array<{
      email: string;
      fetched: number;
      candidates: number;
      duplicates: number;
      skipped_missing_message_id: number;
      inserted: number;
      mailboxes: Partial<Record<HistoricalMailboxRole, number>>;
      error?: string;
    }> = [];

    for (const config of configs) {
      try {
        const password = decryptPassword(config.encrypted_password, config.encryption_iv);
        const imapConfig: ImapConfig = {
          host: config.imap_host,
          port: config.imap_port,
          secure: config.imap_secure,
          email: config.email_address,
          password,
        };
        const roles: HistoricalMailboxRole[] = request.includeSent ? ["inbox", "sent"] : ["inbox"];
        const mailboxResults = await Promise.all(
          roles.map(async (role) => ({
            role,
            messages: await fetchHistoricalMailboxEmails(imapConfig, role, request.maxMessages, request.sinceDays),
          }))
        );

        const mailboxes: Partial<Record<HistoricalMailboxRole, number>> = {};
        const combined: HistoricalFetchedEmail[] = [];
        for (const result of mailboxResults) {
          mailboxes[result.role] = result.messages.length;
          combined.push(...result.messages);
        }
        combined.sort((a, b) => b.date.getTime() - a.date.getTime());

        const unique = new Map<string, HistoricalFetchedEmail>();
        let accountSkippedMissing = 0;
        for (const message of combined) {
          const messageId = stableMessageId(message);
          if (!messageId) {
            accountSkippedMissing++;
            continue;
          }
          if (!unique.has(messageId)) unique.set(messageId, message);
        }

        const bounded = Array.from(unique.values()).slice(0, request.maxMessages);
        const newMessages: HistoricalFetchedEmail[] = [];
        let accountDuplicates = 0;
        for (const message of bounded) {
          const messageId = stableMessageId(message)!;
          if (existingIds.has(messageId)) accountDuplicates++;
          else newMessages.push(message);
        }

        let accountInserted = 0;
        if (request.mode === "apply") {
          for (const message of newMessages) {
            const messageId = stableMessageId(message)!;
            const { error: insertError } = await supabase.from("email_messages").insert({
              brand_id: request.brandId,
              message_id: messageId,
              thread_id: message.threadId || messageId,
              direction: message.mailboxRole === "sent" ? "outbound" : "inbound",
              from_address: message.from.address,
              from_name: message.from.name || null,
              to_addresses: message.to.map((address) => address.address),
              cc_addresses: message.cc?.map((address) => address.address) || null,
              subject: message.subject,
              body_text: message.bodyText || null,
              body_html: message.bodyHtml || null,
              received_at: message.date.toISOString(),
              is_read: true,
              is_archived: true,
            });
            if (insertError) throw new Error(insertError.message);
            existingIds.add(messageId);
            accountInserted++;
          }
        }

        const accountFetched = combined.length;
        fetched += accountFetched;
        candidates += newMessages.length;
        duplicates += accountDuplicates;
        skippedMissingMessageId += accountSkippedMissing;
        inserted += accountInserted;
        accountResults.push({
          email: config.email_address,
          fetched: accountFetched,
          candidates: newMessages.length,
          duplicates: accountDuplicates,
          skipped_missing_message_id: accountSkippedMissing,
          inserted: accountInserted,
          mailboxes,
        });
      } catch (error) {
        accountResults.push({
          email: config.email_address,
          fetched: 0,
          candidates: 0,
          duplicates: 0,
          skipped_missing_message_id: 0,
          inserted: 0,
          mailboxes: {},
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return NextResponse.json({
      success: true,
      mode: request.mode,
      brand_id: request.brandId,
      since_days: request.sinceDays,
      max_messages: request.maxMessages,
      include_sent: request.includeSent,
      fetched,
      candidates,
      duplicates,
      skipped_missing_message_id: skippedMissingMessageId,
      inserted,
      accounts: accountResults,
      safety: {
        adminRequired: true,
        previewWrites: false,
        applyRequiresExplicitConfirmation: true,
        historicalMessagesMarkedRead: true,
        historicalMessagesArchived: true,
        updatesLastFetchedAt: false,
        sendsEmail: false,
        automaticCrmLinking: false,
      },
    });
  } catch (error) {
    console.error("[Email History Backfill]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
