import nodemailer from "nodemailer";

// ─── Interfaces ──────────────────────────────────────────────────────

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  email: string;
  password: string;
  displayName?: string;
}

/**
 * Attachment shape — passes straight through to nodemailer's
 * `Mail.Attachment`. Use `content` for in-memory buffers (PDFs, images
 * generated at request time) and `path` only for files on the same
 * server filesystem (which won't exist on serverless).
 */
export interface OutgoingAttachment {
  filename: string;
  content?: Buffer | string;
  contentType?: string;
  /** Local file path. Avoid in serverless deployments. */
  path?: string;
  /** Remote URL. Nodemailer will fetch and attach. */
  href?: string;
  /** "base64", "hex", "utf8" — only relevant when `content` is a string. */
  encoding?: string;
}

export interface OutgoingEmail {
  to: string[];
  cc?: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  inReplyTo?: string; // Message-ID of email being replied to
  references?: string[]; // For threading
  attachments?: OutgoingAttachment[];
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// ─── SMTP Sender ─────────────────────────────────────────────────────

/**
 * Send an email via SMTP using nodemailer.
 * Supports reply threading via In-Reply-To and References headers.
 */
export async function sendEmail(
  config: SmtpConfig,
  email: OutgoingEmail
): Promise<SendResult> {
  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.email,
        pass: config.password,
      },
      // Timeout settings for serverless
      connectionTimeout: 10000,
      greetingTimeout: 5000,
      socketTimeout: 15000,
    });

    const fromAddress = config.displayName
      ? `"${config.displayName}" <${config.email}>`
      : config.email;

    const mailOptions: nodemailer.SendMailOptions = {
      from: fromAddress,
      to: email.to.join(", "),
      cc: email.cc?.join(", "),
      subject: email.subject,
      text: email.bodyText,
      html: email.bodyHtml || undefined,
    };

    // Add threading headers for replies
    if (email.inReplyTo) {
      mailOptions.inReplyTo = email.inReplyTo;
      mailOptions.references = email.references?.join(" ") || email.inReplyTo;
    }

    // Pass attachments straight through; nodemailer's `attachments`
    // field accepts the same shape we expose. Cast at the array level
    // because nodemailer's `encoding` is a literal union and we accept
    // any string at our public boundary.
    if (email.attachments && email.attachments.length > 0) {
      mailOptions.attachments = email.attachments.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
        path: a.path,
        href: a.href,
        encoding: a.encoding,
      })) as nodemailer.SendMailOptions["attachments"];
    }

    const info = await transporter.sendMail(mailOptions);

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown SMTP error";
    console.error("[SMTP Sender] Failed to send email:", errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Verify SMTP connection credentials without sending an email.
 */
export async function verifySmtpConnection(
  config: SmtpConfig
): Promise<{ valid: boolean; error?: string }> {
  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.email,
        pass: config.password,
      },
      connectionTimeout: 10000,
    });

    await transporter.verify();
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Connection failed",
    };
  }
}
