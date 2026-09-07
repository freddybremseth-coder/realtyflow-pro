import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptPassword } from "@/services/email/crypto";
import { checkCrmEmailSuppression } from "@/services/email/email-suppression";
import { sendEmail, type OutgoingAttachment, type SmtpConfig } from "@/services/email/smtp-sender";

/**
 * Send a one-off email from a brand's configured SMTP account.
 * Returns { skipped: true } when the brand has no active SMTP config or when
 * CRM suppression blocks a recipient.
 */
export async function sendBrandEmail(
  supabase: SupabaseClient,
  params: {
    brandId: string;
    to: string[];
    subject: string;
    bodyText: string;
    bodyHtml?: string;
    attachments?: OutgoingAttachment[];
    fromAddress?: string;
    fromName?: string;
    /** Only for explicit transactional/legal/operational communication. */
    allowSuppressed?: boolean;
  }
): Promise<{ success: boolean; skipped?: boolean; messageId?: string; error?: string }> {
  if (!params.allowSuppressed) {
    const suppression = await checkCrmEmailSuppression(supabase, params.to);
    if (suppression.error) {
      return { success: false, skipped: true, error: `CRM suppression check failed: ${suppression.error}` };
    }
    if (suppression.blocked) {
      return { success: false, skipped: true, error: `Recipient suppressed in CRM${suppression.blockedEmails.length ? `: ${suppression.blockedEmails.join(", ")}` : ""}` };
    }
  }

  let configQuery = supabase
    .from("brand_email_configs")
    .select("*")
    .eq("brand_id", params.brandId)
    .eq("is_active", true);
  if (params.fromAddress) configQuery = configQuery.eq("email_address", params.fromAddress);
  const { data: configs } = await configQuery.order("updated_at", { ascending: false }).limit(1);
  const config = configs?.[0];

  if (!config) return { success: false, skipped: true, error: "No active email config for brand" };

  const password = decryptPassword(config.encrypted_password, config.encryption_iv);
  const smtpConfig: SmtpConfig = {
    host: config.smtp_host,
    port: config.smtp_port,
    secure: config.smtp_secure,
    email: config.email_address,
    password,
    displayName: params.fromName || config.display_name || undefined,
  };

  const result = await sendEmail(smtpConfig, {
    to: params.to,
    subject: params.subject,
    bodyText: params.bodyText,
    bodyHtml: params.bodyHtml,
    attachments: params.attachments,
  });
  if (!result.success) return { success: false, error: result.error || "Send failed" };

  await supabase.from("email_messages").insert({
    brand_id: params.brandId,
    message_id: result.messageId || null,
    thread_id: result.messageId || null,
    direction: "outbound",
    from_address: config.email_address,
    from_name: params.fromName || config.display_name || null,
    to_addresses: params.to,
    subject: params.subject,
    body_text: params.bodyText,
    body_html: params.bodyHtml || null,
    is_read: true,
    received_at: new Date().toISOString(),
  });

  return { success: true, messageId: result.messageId };
}
