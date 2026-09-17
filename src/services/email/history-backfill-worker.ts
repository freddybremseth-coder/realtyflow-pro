import type { SupabaseClient } from "@supabase/supabase-js";
import { buildImapConfigFromAccount } from "@/services/email/account-auth";
import {
  fetchHistoricalMailboxBatch,
  type HistoricalFetchedEmail,
  type HistoricalMailboxRole,
} from "@/services/email/imap-reader";
import {
  decideCustomerMailAdmission,
  loadCustomerMailAdmissionIds,
  loadCustomerMailContactIndex,
  loadOwnedMailboxAddresses,
  recordCustomerMailAdmission,
} from "@/services/email/customer-mail-admission";

export type EmailHistoryBackfillJob = {
  account_id: string;
  brand_id: string;
  enabled: boolean;
  since_days: number;
  batch_size: number;
  include_sent: boolean;
  status: string;
  total_inserted?: number | null;
  total_linked?: number | null;
  total_deduped?: number | null;
  total_filtered?: number | null;
  total_review?: number | null;
};

export type EmailHistoryBackfillAccount = Record<string, unknown> & {
  id: string;
  brand_id: string;
  email_address: string;
};

export type EmailHistoryBackfillResult = {
  brandId: string;
  accountId: string;
  email: string;
  inserted: number;
  linked: number;
  deduped: number;
  filtered: number;
  review: number;
  scanned: number;
  skippedExisting: number;
  skippedMissingMessageId: number;
  complete: boolean;
  mailboxes: Record<string, { fetched: number; scanned: number; exhausted: boolean }>;
};

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

async function loadExistingMessageIds(
  supabase: SupabaseClient,
  brandId: string,
  accountId: string,
) {
  const ids = new Set<string>();
  const pageSize = 1000;

  for (let offset = 0; offset < 100_000; offset += pageSize) {
    const { data, error } = await supabase
      .from("email_messages")
      .select("message_id")
      .eq("brand_id", brandId)
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(`History existing-message lookup failed: ${error.message}`);
    for (const row of data || []) {
      const id = String(row.message_id || "").trim();
      if (id) ids.add(id);
    }
    if ((data || []).length < pageSize) break;
  }

  const { data: aliases, error: aliasError } = await supabase
    .from("email_message_source_ids")
    .select("external_id")
    .eq("source", "imap_message_id")
    .range(0, 9999);
  if (!aliasError) {
    for (const row of aliases || []) {
      const id = String(row.external_id || "").trim();
      if (id) ids.add(id);
    }
  }

  const admissionIds = await loadCustomerMailAdmissionIds(supabase, accountId);
  for (const id of admissionIds) ids.add(id);
  return ids;
}

async function findHeuristicDuplicate(
  supabase: SupabaseClient,
  brandId: string,
  message: HistoricalFetchedEmail,
) {
  const timestamp = message.date.getTime();
  const from = normalizeEmail(message.from.address);
  const direction = message.mailboxRole === "sent" ? "outbound" : "inbound";
  const { data, error } = await supabase
    .from("email_messages")
    .select("id,from_address,crm_contact_id")
    .eq("brand_id", brandId)
    .eq("direction", direction)
    .eq("subject", message.subject)
    .gte("received_at", new Date(timestamp - 5000).toISOString())
    .lte("received_at", new Date(timestamp + 5000).toISOString())
    .limit(10);
  if (error) throw new Error(`History duplicate lookup failed: ${error.message}`);
  const matches = (data || []).filter((row) => normalizeEmail(row.from_address) === from);
  return matches.length === 1 ? matches[0] : null;
}

async function rememberImapMessageId(
  supabase: SupabaseClient,
  emailMessageId: string,
  messageId: string,
) {
  const { error } = await supabase.from("email_message_source_ids").upsert({
    email_message_id: emailMessageId,
    source: "imap_message_id",
    external_id: messageId,
  }, { onConflict: "source,external_id" });
  if (error) throw new Error(`History source-id mapping failed: ${error.message}`);
}

export async function runEmailHistoryBackfillJob(
  supabase: SupabaseClient,
  job: EmailHistoryBackfillJob,
  account: EmailHistoryBackfillAccount,
): Promise<EmailHistoryBackfillResult> {
  const existingMessageIds = await loadExistingMessageIds(supabase, job.brand_id, job.account_id);
  const contactIndex = await loadCustomerMailContactIndex(supabase);
  const ownedMailboxAddresses = await loadOwnedMailboxAddresses(supabase);
  const imap = await buildImapConfigFromAccount(account as any);
  const roles: HistoricalMailboxRole[] = job.include_sent ? ["inbox", "sent"] : ["inbox"];

  const mailboxResults = await Promise.all(roles.map(async (role) => ({
    role,
    result: await fetchHistoricalMailboxBatch(
      imap,
      role,
      Math.max(1, Math.min(200, Number(job.batch_size || 50))),
      Math.max(1, Math.min(3650, Number(job.since_days || 730))),
      { existingMessageIds },
    ),
  })));

  let inserted = 0;
  let linked = 0;
  let deduped = 0;
  let filtered = 0;
  let review = 0;
  let scanned = 0;
  let skippedExisting = 0;
  let skippedMissingMessageId = 0;
  const mailboxes: EmailHistoryBackfillResult["mailboxes"] = {};
  const seenThisRun = new Set<string>();

  for (const mailbox of mailboxResults) {
    scanned += mailbox.result.scanned;
    skippedExisting += mailbox.result.skippedExisting;
    skippedMissingMessageId += mailbox.result.skippedMissingMessageId;
    mailboxes[mailbox.role] = {
      fetched: mailbox.result.messages.length,
      scanned: mailbox.result.scanned,
      exhausted: mailbox.result.exhausted,
    };

    for (const message of mailbox.result.messages) {
      const messageId = String(message.messageId || "").trim();
      if (!messageId || seenThisRun.has(messageId)) continue;
      seenThisRun.add(messageId);

      const decision = await decideCustomerMailAdmission(supabase, {
        brandId: job.brand_id,
        accountEmail: account.email_address,
        message,
        contactIndex,
        ownedMailboxAddresses,
      });

      if (decision.status !== "accept") {
        await recordCustomerMailAdmission(supabase, {
          accountId: job.account_id,
          brandId: job.brand_id,
          message,
          decision,
          historical: true,
        });
        if (decision.status === "filtered") filtered += 1;
        else review += 1;
        existingMessageIds.add(messageId);
        continue;
      }

      const contactId = decision.contactId;
      const duplicate = await findHeuristicDuplicate(supabase, job.brand_id, message);
      if (duplicate?.id) {
        deduped += 1;
        if (contactId && !duplicate.crm_contact_id) {
          const { error: linkError } = await supabase
            .from("email_messages")
            .update({ crm_contact_id: contactId })
            .eq("id", duplicate.id)
            .is("crm_contact_id", null);
          if (linkError) throw new Error(`History duplicate CRM link failed: ${linkError.message}`);
          linked += 1;
        }
        await rememberImapMessageId(supabase, String(duplicate.id), messageId);
        existingMessageIds.add(messageId);
        continue;
      }

      const { data: stored, error: insertError } = await supabase
        .from("email_messages")
        .insert({
          brand_id: job.brand_id,
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
          crm_contact_id: contactId,
        })
        .select("id")
        .single();

      if (insertError) {
        if (insertError.code === "23505") {
          deduped += 1;
          existingMessageIds.add(messageId);
          continue;
        }
        throw new Error(`History message insert failed: ${insertError.message}`);
      }

      inserted += 1;
      if (contactId) linked += 1;
      existingMessageIds.add(messageId);
      if (stored?.id) await rememberImapMessageId(supabase, String(stored.id), messageId);
    }
  }

  const complete = mailboxResults.every(({ result }) => result.exhausted);
  const now = new Date().toISOString();
  const batchDetails = {
    inserted,
    linked,
    deduped,
    filtered,
    review,
    scanned,
    skipped_existing: skippedExisting,
    skipped_missing_message_id: skippedMissingMessageId,
    complete,
    mailboxes,
  };
  const { error: jobUpdateError } = await supabase
    .from("email_history_backfill_jobs")
    .update({
      enabled: !complete,
      status: complete ? "complete" : "running",
      total_inserted: Number(job.total_inserted || 0) + inserted,
      total_linked: Number(job.total_linked || 0) + linked,
      total_deduped: Number(job.total_deduped || 0) + deduped,
      total_filtered: Number(job.total_filtered || 0) + filtered,
      total_review: Number(job.total_review || 0) + review,
      last_run_at: now,
      completed_at: complete ? now : null,
      last_error: null,
      last_batch: batchDetails,
      updated_at: now,
    })
    .eq("account_id", job.account_id);
  if (jobUpdateError) throw new Error(`History job progress update failed: ${jobUpdateError.message}`);

  return {
    brandId: job.brand_id,
    accountId: job.account_id,
    email: account.email_address,
    inserted,
    linked,
    deduped,
    filtered,
    review,
    scanned,
    skippedExisting,
    skippedMissingMessageId,
    complete,
    mailboxes,
  };
}
