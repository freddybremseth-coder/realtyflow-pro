import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { createServerClient } from "@/lib/supabase/server";
import { resolveEmailHistoryBackfillRequest } from "@/lib/email/history-backfill-policy";
import { evaluateEmailHistoryBackfillReadiness } from "@/lib/email/history-backfill-readiness";
import { buildEmailHistoryReviewLinks } from "@/lib/email/history-backfill-review-links";
import { buildEmailHistoryBackfillPreviewFingerprint } from "@/lib/email/history-backfill-preview-fingerprint";
import { evaluateEmailHistoryBackfillAccountGate } from "@/lib/email/history-backfill-account-gate";
import { buildEmailHistoryBackfillAuditDetails } from "@/lib/email/history-backfill-audit";
import {
  EMAIL_HISTORY_BACKFILL_PREVIEW_COOKIE,
  EMAIL_HISTORY_BACKFILL_PREVIEW_COOKIE_MAX_AGE_SECONDS,
  buildEmailHistoryBackfillPreviewCookieValue,
  readEmailHistoryBackfillPreviewCookieValue,
} from "@/lib/email/history-backfill-preview-cookie";
import { buildImapConfigFromAccount } from "@/services/email/account-auth";
import {
  fetchHistoricalMailboxBatch,
  type HistoricalFetchedEmail,
  type HistoricalMailboxRole,
} from "@/services/email/imap-reader";

export const dynamic = "force-dynamic";

function stableMessageId(message: HistoricalFetchedEmail) {
  return message.messageId && !message.messageId.startsWith("gen-") ? message.messageId : null;
}

function clearPreviewCookie(response: NextResponse) {
  response.cookies.set(EMAIL_HISTORY_BACKFILL_PREVIEW_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/api/email/inbox/backfill",
  });
}

/**
 * Controlled historical mailbox import. Preview is the default and performs no writes.
 * Apply requires the explicit confirmation phrase and a fingerprint from a matching preview.
 * Repeated preview/apply cycles advance through unseen stable Message-IDs until history is exhausted.
 */
export async function POST(req: NextRequest) {
  const adminError = await requireAdminApi(req);
  if (adminError) return adminError;

  try {
    const parsedBody = await req.json().catch(() => ({}));
    const body: Record<string, unknown> = { ...(parsedBody as Record<string, unknown>) };
    const requestedBrandId = String(body.brand_id || "").trim();
    if (body.mode === "apply" && !body.preview_fingerprint && requestedBrandId) {
      const cookieFingerprint = readEmailHistoryBackfillPreviewCookieValue(
        req.cookies.get(EMAIL_HISTORY_BACKFILL_PREVIEW_COOKIE)?.value,
        requestedBrandId,
      );
      if (cookieFingerprint) body.preview_fingerprint = cookieFingerprint;
    }

    const policy = resolveEmailHistoryBackfillRequest(body);
    if (!policy.ok || !policy.request) {
      return NextResponse.json({ error: policy.error || "Invalid backfill request" }, { status: 400 });
    }

    const request = policy.request;
    const supabase = createServerClient();
    const { data: configs, error: configError } = await supabase
      .from("brand_email_configs")
      .select("*")
      .eq("brand_id", request.brandId)
      .eq("is_active", true)
      .order("email_address", { ascending: true });

    if (configError) return NextResponse.json({ error: configError.message }, { status: 500 });
    if (!configs?.length) return NextResponse.json({ error: "No active email config found for this brand" }, { status: 404 });

    const readinessGate = evaluateEmailHistoryBackfillReadiness(configs);
    if (!readinessGate.ok) {
      return NextResponse.json({
        error: "Email history backfill is blocked until every active email account is ready",
        blocked_accounts: readinessGate.blockedAccounts,
        safety: {
          readinessRequiredServerSide: true,
          imapAttempted: false,
          databaseMessagesRead: false,
          databaseMessagesWritten: false,
          emailSent: false,
        },
      }, { status: 409 });
    }

    const { data: existingMessages, error: existingError } = await supabase
      .from("email_messages")
      .select("message_id")
      .eq("brand_id", request.brandId);
    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });

    const existingIds = new Set((existingMessages || []).map((row) => String(row.message_id || "")).filter(Boolean));
    const selectedThisRun = new Set<string>();
    let fetched = 0;
    let candidates = 0;
    let duplicates = 0;
    let skippedMissingMessageId = 0;
    let inserted = 0;
    let historyHasMore = false;
    const candidateMessageIds: string[] = [];
    const pendingMessages: Array<{ message: HistoricalFetchedEmail; accountIndex: number }> = [];
    const accountResults: Array<{
      email: string;
      fetched: number;
      candidates: number;
      duplicates: number;
      skipped_missing_message_id: number;
      inserted: number;
      mailboxes: Partial<Record<HistoricalMailboxRole, number>>;
      mailbox_progress?: Partial<Record<HistoricalMailboxRole, {
        scanned: number;
        skipped_existing: number;
        skipped_missing_message_id: number;
        exhausted: boolean;
      }>>;
      history_has_more?: boolean;
      error?: string;
    }> = [];

    for (const config of configs) {
      try {
        const imapConfig = await buildImapConfigFromAccount(config);
        const roles: HistoricalMailboxRole[] = request.includeSent ? ["inbox", "sent"] : ["inbox"];
        const mailboxResults = await Promise.all(
          roles.map(async (role) => ({
            role,
            result: await fetchHistoricalMailboxBatch(
              imapConfig,
              role,
              request.maxMessages,
              request.sinceDays,
              { existingMessageIds: existingIds },
            ),
          })),
        );

        const mailboxes: Partial<Record<HistoricalMailboxRole, number>> = {};
        const mailboxProgress: Partial<Record<HistoricalMailboxRole, {
          scanned: number;
          skipped_existing: number;
          skipped_missing_message_id: number;
          exhausted: boolean;
        }>> = {};
        const combined: HistoricalFetchedEmail[] = [];
        let accountDuplicates = 0;
        let accountSkippedMissing = 0;

        for (const { role, result } of mailboxResults) {
          mailboxes[role] = result.messages.length;
          mailboxProgress[role] = {
            scanned: result.scanned,
            skipped_existing: result.skippedExisting,
            skipped_missing_message_id: result.skippedMissingMessageId,
            exhausted: result.exhausted,
          };
          accountDuplicates += result.skippedExisting;
          accountSkippedMissing += result.skippedMissingMessageId;
          combined.push(...result.messages);
        }
        combined.sort((a, b) => b.date.getTime() - a.date.getTime());

        const unique = new Map<string, HistoricalFetchedEmail>();
        for (const message of combined) {
          const messageId = stableMessageId(message);
          if (!messageId) {
            accountSkippedMissing++;
            continue;
          }
          if (!unique.has(messageId)) unique.set(messageId, message);
          else accountDuplicates++;
        }

        const bounded = Array.from(unique.values()).slice(0, request.maxMessages);
        const batchTruncated = unique.size > bounded.length;
        const newMessages: HistoricalFetchedEmail[] = [];
        for (const message of bounded) {
          const messageId = stableMessageId(message)!;
          if (existingIds.has(messageId) || selectedThisRun.has(messageId)) {
            accountDuplicates++;
            continue;
          }
          selectedThisRun.add(messageId);
          newMessages.push(message);
        }

        const mailboxMayHaveMore = mailboxResults.some(({ result }) =>
          !result.exhausted || result.messages.length >= request.maxMessages,
        );
        const accountHasMore = batchTruncated || mailboxMayHaveMore;
        if (accountHasMore) historyHasMore = true;

        const accountIndex = accountResults.length;
        for (const message of newMessages) {
          candidateMessageIds.push(stableMessageId(message)!);
          pendingMessages.push({ message, accountIndex });
        }

        const accountFetched = mailboxResults.reduce((sum, { result }) => sum + result.scanned, 0);
        fetched += accountFetched;
        candidates += newMessages.length;
        duplicates += accountDuplicates;
        skippedMissingMessageId += accountSkippedMissing;
        accountResults.push({
          email: config.email_address,
          fetched: accountFetched,
          candidates: newMessages.length,
          duplicates: accountDuplicates,
          skipped_missing_message_id: accountSkippedMissing,
          inserted: 0,
          mailboxes,
          mailbox_progress: mailboxProgress,
          history_has_more: accountHasMore,
        });
      } catch (error) {
        historyHasMore = true;
        accountResults.push({
          email: config.email_address,
          fetched: 0,
          candidates: 0,
          duplicates: 0,
          skipped_missing_message_id: 0,
          inserted: 0,
          mailboxes: {},
          history_has_more: true,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    const accountGate = evaluateEmailHistoryBackfillAccountGate(accountResults);
    const writeApplyAudit = async (status: "success" | "blocked" | "failed", reason?: string) => {
      if (request.mode !== "apply") return;
      const details = buildEmailHistoryBackfillAuditDetails({
        brandId: request.brandId,
        mode: request.mode,
        status,
        sinceDays: request.sinceDays,
        maxMessages: request.maxMessages,
        includeSent: request.includeSent,
        fetched,
        candidates,
        duplicates,
        skippedMissingMessageId,
        inserted,
        accountFetchComplete: accountGate.ok,
        failedAccounts: accountGate.failedAccounts,
        reason,
      });
      const { error: auditError } = await supabase.from("automation_logs").insert({
        action: "email_history_backfill",
        agent_name: "nexus_communications",
        status,
        details: {
          ...details,
          history_has_more: historyHasMore,
          pagination_mode: "skip_existing_message_ids",
        },
      });
      if (auditError) console.warn("[Email History Backfill Audit]", auditError.message);
    };

    if (request.mode === "apply" && !accountGate.ok) {
      const reason = "One or more active email accounts failed during historical fetch";
      await writeApplyAudit("blocked", reason);
      const response = NextResponse.json({
        error: "Backfill apply is blocked because one or more active email accounts failed during historical fetch. Run preview again after every account succeeds.",
        account_fetch_complete: false,
        failed_accounts: accountGate.failedAccounts,
        candidates,
        history: {
          has_more: true,
          complete_after_apply: false,
          pagination_mode: "skip_existing_message_ids",
        },
        safety: {
          allActiveAccountFetchesRequiredForApply: true,
          databaseMessagesWritten: false,
          emailSent: false,
        },
      }, { status: 409 });
      clearPreviewCookie(response);
      return response;
    }

    const previewFingerprint = buildEmailHistoryBackfillPreviewFingerprint({
      brandId: request.brandId,
      sinceDays: request.sinceDays,
      maxMessages: request.maxMessages,
      includeSent: request.includeSent,
      candidateMessageIds,
    });

    if (request.mode === "apply" && request.previewFingerprint !== previewFingerprint) {
      const reason = "Preview fingerprint no longer matches the current candidate set";
      await writeApplyAudit("blocked", reason);
      const response = NextResponse.json({
        error: "Backfill preview is stale or no longer matches the current candidate set. Run preview again before apply.",
        preview_fingerprint_matches: false,
        candidates,
        safety: {
          previewFingerprintRequired: true,
          databaseMessagesWritten: false,
          emailSent: false,
        },
      }, { status: 409 });
      clearPreviewCookie(response);
      return response;
    }

    if (request.mode === "apply") {
      try {
        for (const pending of pendingMessages) {
          const message = pending.message;
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
          inserted++;
          accountResults[pending.accountIndex].inserted += 1;
        }
      } catch (error) {
        await writeApplyAudit("failed", error instanceof Error ? error.message : String(error));
        throw error;
      }
      await writeApplyAudit("success");
    }

    const historyCompleteAfterApply = accountGate.ok && !historyHasMore;
    const response = NextResponse.json({
      success: true,
      mode: request.mode,
      brand_id: request.brandId,
      since_days: request.sinceDays,
      max_messages: request.maxMessages,
      include_sent: request.includeSent,
      account_fetch_complete: accountGate.ok,
      failed_accounts: accountGate.failedAccounts,
      preview_fingerprint: previewFingerprint,
      preview_fingerprint_matches: request.mode === "apply" ? true : null,
      preview_token_expires_in_seconds: request.mode === "preview" ? EMAIL_HISTORY_BACKFILL_PREVIEW_COOKIE_MAX_AGE_SECONDS : 0,
      fetched,
      candidates,
      duplicates,
      skipped_missing_message_id: skippedMissingMessageId,
      inserted,
      accounts: accountResults,
      history: {
        has_more: historyHasMore,
        complete_after_apply: historyCompleteAfterApply,
        pagination_mode: "skip_existing_message_ids",
      },
      review: buildEmailHistoryReviewLinks(request.brandId),
      safety: {
        adminRequired: true,
        readinessRequiredServerSide: true,
        previewWrites: false,
        allActiveAccountFetchesRequiredForApply: true,
        previewFingerprintRequiredForApply: true,
        previewTokenHttpOnly: true,
        previewTokenBrandBound: true,
        applyRequiresExplicitConfirmation: true,
        historicalMessagesMarkedRead: true,
        historicalMessagesArchived: true,
        updatesLastFetchedAt: false,
        sendsEmail: false,
        automaticCrmLinking: false,
        identityReviewRequired: true,
      },
    });

    if (request.mode === "preview") {
      response.cookies.set(
        EMAIL_HISTORY_BACKFILL_PREVIEW_COOKIE,
        buildEmailHistoryBackfillPreviewCookieValue(request.brandId, previewFingerprint),
        {
          httpOnly: true,
          sameSite: "strict",
          secure: process.env.NODE_ENV === "production",
          maxAge: EMAIL_HISTORY_BACKFILL_PREVIEW_COOKIE_MAX_AGE_SECONDS,
          path: "/api/email/inbox/backfill",
        },
      );
    } else {
      clearPreviewCookie(response);
    }

    return response;
  } catch (error) {
    console.error("[Email History Backfill]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal error" }, { status: 500 });
  }
}
