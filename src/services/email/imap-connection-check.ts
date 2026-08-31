import { ImapFlow } from "imapflow";
import type { ImapConfig } from "./imap-reader";

export interface ImapConnectionCheckResult {
  mailboxCount: number;
  hasInbox: boolean;
  hasSent: boolean;
  inboxPath: string | null;
  sentPath: string | null;
}

/**
 * Authenticate and inspect mailbox metadata only.
 * Does not fetch message envelopes/bodies and does not mutate the mailbox.
 */
export async function checkImapConnection(
  config: ImapConfig
): Promise<ImapConnectionCheckResult> {
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

  let connected = false;
  try {
    await client.connect();
    connected = true;
    const mailboxes = await client.list();
    const inbox =
      mailboxes.find((mailbox) => mailbox.specialUse === "\\Inbox") ||
      mailboxes.find((mailbox) => mailbox.path.toLowerCase() === "inbox");
    const sent = mailboxes.find((mailbox) => mailbox.specialUse === "\\Sent");

    return {
      mailboxCount: mailboxes.length,
      hasInbox: Boolean(inbox),
      hasSent: Boolean(sent),
      inboxPath: inbox?.path || null,
      sentPath: sent?.path || null,
    };
  } finally {
    if (connected) {
      await client.logout().catch(() => undefined);
    }
  }
}
