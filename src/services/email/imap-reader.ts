import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

// ─── Interfaces ──────────────────────────────────────────────────────

export interface ImapConfig {
  host: string;
  port: number;
  secure: boolean;
  email: string;
  password: string;
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

// ─── IMAP Reader ─────────────────────────────────────────────────────

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
    auth: {
      user: config.email,
      pass: config.password,
    },
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

        // Parse body using mailparser — handles nested multipart, charsets,
        // quoted-printable, base64, attachments, inline images, etc.
        const source = message.source as Buffer | undefined;
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

        // Build thread ID from references or in-reply-to
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

      // Sort newest first
      return messages.sort(
        (a, b) => b.date.getTime() - a.date.getTime()
      );
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
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

