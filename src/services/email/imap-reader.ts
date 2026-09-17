import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

// ─── Interfaces ──────────────────────────────────────────────────────

export interface ImapConfig {
  host: string;
  port: number;
  secure: boolean;
  email: string;
  password?: string;
  accessToken?: string;
}

export interface EmailAddress {
  name?: string;
  address: string;
}

export interface FetchedEmail {
  messageId: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  subject: string;
  date: Date;
  bodyText?: string;
  bodyHtml?: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string[];
}

export type HistoricalMailboxRole = "inbox" | "sent";

export interface HistoricalFetchedEmail extends FetchedEmail {
  mailboxRole: HistoricalMailboxRole;
  mailboxPath: string;
}

export interface HistoricalMailboxFetchResult {
  messages: HistoricalFetchedEmail[];
  scanned: number;
  skippedExisting: number;
  skippedMissingMessageId: number;
  exhausted: boolean;
}

export interface HistoricalMailboxFetchOptions {
  existingMessageIds?: ReadonlySet<string>;
  scanChunkSize?: number;
}

function imapAuth(config: ImapConfig) {
  if (config.accessToken) return { user: config.email, accessToken: config.accessToken };
  if (config.password) return { user: config.email, pass: config.password };
  throw new Error(`IMAP credential missing for ${config.email}`);
}

async function parsedContent(source: Buffer | undefined) {
  let text = "";
  let html = "";
  if (source) {
    try {
      const parsed = await simpleParser(source);
      text = parsed.text || "";
      html = typeof parsed.html === "string"
        ? parsed.html
        : (parsed.textAsHtml || "");
    } catch (parseErr) {
      console.warn(`[IMAP] mailparser failed, falling back to raw text`, parseErr);
      text = source.toString("utf-8");
    }
  }
  return { text, html };
}

async function safeLogout(client: ImapFlow) {
  try {
    await client.logout();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/connection not available|not connected|connection closed|socket.*closed/i.test(message)) {
      console.warn(`[IMAP] logout cleanup failed`, error);
    }
  }
}

function stableEnvelopeMessageId(value: unknown) {
  const messageId = String(value || "").trim();
  return messageId && !messageId.startsWith("gen-") ? messageId : null;
}

// ─── IMAP Reader ──────────────────────────────────────────────────────

/**
 * Fetch recent emails from an IMAP mailbox.
 * Uses short-lived connections suitable for serverless environments.
 */
export async function fetchRecentEmails(
  config: ImapConfig,
  maxCount = 50,
  sinceDays = 7
): Promise<FetchedEmail[]> {
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: imapAuth(config),
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      const messages: FetchedEmail[] = [];
      const since = new Date();
      since.setDate(since.getDate() - sinceDays);

      for await (const message of client.fetch(
        { since },
        {
          envelope: true,
          source: true,
          bodyStructure: true,
        }
      )) {
        const envelope = message.envelope;
        if (!envelope) continue;

        const { text, html } = await parsedContent(message.source as Buffer | undefined);

        const references = envelope.inReplyTo
          ? [envelope.inReplyTo]
          : [];
        const threadId =
          references.length > 0
            ? references[0]
            : envelope.messageId || undefined;

        messages.push({
          messageId: envelope.messageId || `gen-${Date.now()}-${messages.length}`,
          from: {
            name: envelope.from?.[0]?.name || undefined,
            address: envelope.from?.[0]?.address || "",
          },
          to: (envelope.to || []).map((a) => ({
            name: a.name || undefined,
            address: a.address || "",
          })),
          cc: envelope.cc?.map((a) => ({
            name: a.name || undefined,
            address: a.address || "",
          })),
          subject: envelope.subject || "(ingen emne)",
          date: envelope.date ? new Date(envelope.date) : new Date(),
          bodyText: text || undefined,
          bodyHtml: html || undefined,
          threadId,
          inReplyTo: envelope.inReplyTo || undefined,
          references,
        });

        if (messages.length >= maxCount) break;
      }

      return messages.sort(
        (a, b) => b.date.getTime() - a.date.getTime()
      );
    } finally {
      lock.release();
    }
  } finally {
    await safeLogout(client);
  }
}

/**
 * Fetch the next bounded historical batch from a standard mailbox role.
 *
 * Unlike a simple newest-N fetch, this scanner walks backwards over UID chunks,
 * skips stable Message-IDs that are already in the database, and keeps scanning
 * until it finds maxCount unseen messages or reaches the start of the requested
 * history window. This makes repeated backfill runs progress through the whole
 * mailbox instead of repeatedly returning the same newest messages.
 */
export async function fetchHistoricalMailboxBatch(
  config: ImapConfig,
  mailboxRole: HistoricalMailboxRole,
  maxCount: number,
  sinceDays: number,
  options: HistoricalMailboxFetchOptions = {},
): Promise<HistoricalMailboxFetchResult> {
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: imapAuth(config),
    logger: false,
  });

  const existingMessageIds = options.existingMessageIds ?? new Set<string>();
  const seenMessageIds = new Set(existingMessageIds);
  const scanChunkSize = Math.max(maxCount, options.scanChunkSize ?? 250);

  try {
    await client.connect();
    const mailboxes = await client.list();
    const mailbox = mailboxRole === "sent"
      ? mailboxes.find((item) => item.specialUse === "\\Sent")
      : mailboxes.find((item) => item.specialUse === "\\Inbox")
        || mailboxes.find((item) => item.path.toLowerCase() === "inbox");

    if (!mailbox) {
      return {
        messages: [],
        scanned: 0,
        skippedExisting: 0,
        skippedMissingMessageId: 0,
        exhausted: true,
      };
    }

    const lock = await client.getMailboxLock(mailbox.path, { readOnly: true });
    try {
      const since = new Date();
      since.setDate(since.getDate() - sinceDays);
      const searchResult = await client.search({ since }, { uid: true });
      const uids = (Array.isArray(searchResult) ? searchResult : [])
        .map((uid) => Number(uid))
        .filter((uid) => Number.isFinite(uid))
        .sort((a, b) => b - a);

      const messages: HistoricalFetchedEmail[] = [];
      let scanned = 0;
      let skippedExisting = 0;
      let skippedMissingMessageId = 0;
      let cursor = 0;

      while (cursor < uids.length && messages.length < maxCount) {
        const uidChunk = uids.slice(cursor, cursor + scanChunkSize);
        cursor += uidChunk.length;
        if (uidChunk.length === 0) break;

        const metadata = await client.fetchAll(
          uidChunk,
          { envelope: true },
          { uid: true },
        );
        const orderedMetadata = [...metadata].sort((a, b) => Number(b.uid || 0) - Number(a.uid || 0));
        scanned += orderedMetadata.length;

        const candidateUids: number[] = [];
        for (const item of orderedMetadata) {
          const messageId = stableEnvelopeMessageId(item.envelope?.messageId);
          if (!messageId) {
            skippedMissingMessageId++;
            continue;
          }
          if (seenMessageIds.has(messageId)) {
            skippedExisting++;
            continue;
          }
          seenMessageIds.add(messageId);
          candidateUids.push(Number(item.uid));
          if (messages.length + candidateUids.length >= maxCount) break;
        }

        if (candidateUids.length === 0) continue;

        const fetched = await client.fetchAll(
          candidateUids,
          { envelope: true, source: true, bodyStructure: true },
          { uid: true },
        );

        for (const message of [...fetched].sort((a, b) => Number(b.uid || 0) - Number(a.uid || 0))) {
          const envelope = message.envelope;
          if (!envelope) continue;
          const messageId = stableEnvelopeMessageId(envelope.messageId);
          if (!messageId) continue;

          const { text, html } = await parsedContent(message.source as Buffer | undefined);
          const references = envelope.inReplyTo ? [envelope.inReplyTo] : [];
          const threadId = references.length > 0 ? references[0] : messageId;

          messages.push({
            messageId,
            from: {
              name: envelope.from?.[0]?.name || undefined,
              address: envelope.from?.[0]?.address || "",
            },
            to: (envelope.to || []).map((address) => ({
              name: address.name || undefined,
              address: address.address || "",
            })),
            cc: envelope.cc?.map((address) => ({
              name: address.name || undefined,
              address: address.address || "",
            })),
            subject: envelope.subject || "(ingen emne)",
            date: envelope.date ? new Date(envelope.date) : new Date(),
            bodyText: text || undefined,
            bodyHtml: html || undefined,
            threadId,
            inReplyTo: envelope.inReplyTo || undefined,
            references,
            mailboxRole,
            mailboxPath: mailbox.path,
          });

          if (messages.length >= maxCount) break;
        }
      }

      return {
        messages: messages.sort((a, b) => b.date.getTime() - a.date.getTime()),
        scanned,
        skippedExisting,
        skippedMissingMessageId,
        exhausted: cursor >= uids.length,
      };
    } finally {
      lock.release();
    }
  } finally {
    await safeLogout(client);
  }
}

/**
 * Backwards-compatible historical fetch. Callers that need durable pagination
 * should use fetchHistoricalMailboxBatch and pass existing Message-IDs.
 */
export async function fetchHistoricalMailboxEmails(
  config: ImapConfig,
  mailboxRole: HistoricalMailboxRole,
  maxCount: number,
  sinceDays: number,
): Promise<HistoricalFetchedEmail[]> {
  const result = await fetchHistoricalMailboxBatch(config, mailboxRole, maxCount, sinceDays);
  return result.messages;
}

/**
 * Fetch emails that arrived after a specific date (for incremental sync).
 */
export async function fetchEmailsSince(
  config: ImapConfig,
  since: Date,
  maxCount = 100
): Promise<FetchedEmail[]> {
  return fetchRecentEmails(
    config,
    maxCount,
    Math.ceil((Date.now() - since.getTime()) / (1000 * 60 * 60 * 24))
  );
}
