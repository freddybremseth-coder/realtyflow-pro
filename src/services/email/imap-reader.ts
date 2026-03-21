import { ImapFlow } from "imapflow";

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

        // Parse body from source
        const source = message.source?.toString() || "";
        const { text, html } = parseEmailBody(source);

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

// ─── Email Body Parser ───────────────────────────────────────────────

/**
 * Basic email body parser for raw email source.
 * Extracts text/plain and text/html parts from MIME messages.
 */
function parseEmailBody(source: string): { text: string; html: string } {
  let text = "";
  let html = "";

  // Check for multipart boundary
  const boundaryMatch = source.match(/boundary="?([^"\r\n;]+)"?/i);

  if (boundaryMatch) {
    const boundary = boundaryMatch[1];
    const parts = source.split(`--${boundary}`);

    for (const part of parts) {
      const headerEnd = part.indexOf("\r\n\r\n");
      if (headerEnd === -1) continue;

      const headers = part.substring(0, headerEnd).toLowerCase();
      let body = part.substring(headerEnd + 4);

      // Remove trailing boundary markers
      const endIdx = body.indexOf(`--${boundary}`);
      if (endIdx !== -1) {
        body = body.substring(0, endIdx);
      }
      body = body.replace(/--\s*$/, "").trim();

      // Handle transfer encoding
      if (headers.includes("content-transfer-encoding: base64")) {
        try {
          body = Buffer.from(body.replace(/\s/g, ""), "base64").toString("utf-8");
        } catch {
          // Keep raw if decode fails
        }
      } else if (headers.includes("content-transfer-encoding: quoted-printable")) {
        body = decodeQuotedPrintable(body);
      }

      if (headers.includes("content-type: text/plain")) {
        text = body;
      } else if (headers.includes("content-type: text/html")) {
        html = body;
      }
    }
  } else {
    // Single-part message - extract body after headers
    const headerEnd = source.indexOf("\r\n\r\n");
    if (headerEnd !== -1) {
      text = source.substring(headerEnd + 4).trim();
    }
  }

  // If we only have HTML, strip tags for text version
  if (!text && html) {
    text = html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .trim();
  }

  return { text, html };
}

/**
 * Decode quoted-printable encoded text.
 */
function decodeQuotedPrintable(input: string): string {
  return input
    .replace(/=\r?\n/g, "") // soft line breaks
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
}
