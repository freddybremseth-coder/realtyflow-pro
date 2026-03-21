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

export interface OutgoingEmail {
  to: string[];
  cc?: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  inReplyTo?: string; // Message-ID of email being replied to
  references?: string[]; // For threading
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
