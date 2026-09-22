import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import { buildImapConfigFromAccount, type StoredEmailAccountConfig } from "@/services/email/account-auth";
import type { OutgoingAttachment } from "@/services/email/smtp-sender";

export type SentCopyResult = "appended" | "already_exists" | "unsupported" | "missing_folder" | "failed";

function imapAuth(config: { email: string; password?: string; accessToken?: string }) {
  if (config.accessToken) return { user: config.email, accessToken: config.accessToken };
  if (config.password) return { user: config.email, pass: config.password };
  throw new Error("IMAP authentication is not configured");
}

/**
 * SMTP acceptance does not automatically create an IMAP Sent copy for Hostinger.
 * Append a copy with the SAME Message-ID after the successful SMTP call.
 * This function never sends customer mail and append failure never requests a
 * resend. Other SMTP providers may already auto-file outgoing messages.
 */
export async function appendHostingerSentCopy(
  account: StoredEmailAccountConfig,
  message: {
    to: string[];
    subject: string;
    bodyText: string;
    bodyHtml?: string;
    attachments?: OutgoingAttachment[];
    fromName?: string;
  },
  smtpMessageId: string | undefined,
): Promise<SentCopyResult> {
  if (!String(account.imap_host || "").trim().toLowerCase().endsWith(".hostinger.com")) return "unsupported";
  if (!smtpMessageId?.trim()) return "failed";

  let client: ImapFlow | null = null;
  try {
    // Use a stream transport to compose RFC822 bytes, NOT an SMTP transport.
    // Keeping SMTP's Message-ID allows safe deduplication in the Sent folder.
    const composer = nodemailer.createTransport({ streamTransport: true, buffer: true });
    const composed = await composer.sendMail({
      from: { name: message.fromName || account.display_name || "", address: account.email_address },
      to: message.to.join(", "),
      subject: message.subject,
      text: message.bodyText,
      html: message.bodyHtml || undefined,
      messageId: smtpMessageId,
      attachments: message.attachments?.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content,
        contentType: attachment.contentType,
        path: attachment.path,
        href: attachment.href,
        encoding: attachment.encoding,
      })) as nodemailer.SendMailOptions["attachments"],
    });
    const raw = composed.message;
    if (!Buffer.isBuffer(raw) || raw.length === 0) return "failed";

    const imap = await buildImapConfigFromAccount(account);
    client = new ImapFlow({
      host: imap.host,
      port: imap.port,
      secure: imap.secure,
      auth: imapAuth(imap),
      logger: false,
      connectionTimeout: 8000,
      socketTimeout: 12000,
    });
    await client.connect();
    const mailboxes = await client.list();
    const sent = mailboxes.find((mailbox) => mailbox.specialUse === "\\Sent")
      || mailboxes.find((mailbox) => /(^|[./])sent$/i.test(mailbox.path));
    if (!sent) return "missing_folder";

    const lock = await client.getMailboxLock(sent.path);
    try {
      const existing = await client.search({ header: { "Message-ID": smtpMessageId } }, { uid: true });
      if (Array.isArray(existing) && existing.length > 0) return "already_exists";
      const appended = await client.append(sent.path, raw, ["\\Seen"], new Date());
      if (!appended) return "failed";
      return "appended";
    } finally {
      lock.release();
    }
  } catch (error) {
    console.warn("[Brand Email] SMTP accepted but IMAP Sent copy was not filed", error instanceof Error ? error.message : "Unknown IMAP error");
    return "failed";
  } finally {
    if (client) await client.logout().catch(() => undefined);
  }
}
