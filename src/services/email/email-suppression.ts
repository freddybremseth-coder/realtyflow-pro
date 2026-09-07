import type { SupabaseClient } from "@supabase/supabase-js";

export type SuppressionCheckResult = {
  blocked: boolean;
  blockedEmails: string[];
  error?: string;
};

export function normalizeRecipientEmails(values: string[]) {
  return Array.from(new Set(values.map((value) => String(value || "").trim().toLowerCase()).filter(Boolean)));
}

export async function checkCrmEmailSuppression(
  supabase: SupabaseClient,
  values: string[],
): Promise<SuppressionCheckResult> {
  const recipients = normalizeRecipientEmails(values);
  if (!recipients.length) return { blocked: false, blockedEmails: [] };

  const checks = await Promise.all(recipients.map(async (email) => {
    const [contactResult, unsubscribeResult] = await Promise.all([
      supabase
        .from("contacts")
        .select("id,email,do_not_contact,email_suppressed,suppression_reason")
        .ilike("email", email)
        .or("do_not_contact.eq.true,email_suppressed.eq.true")
        .limit(5),
      supabase
        .from("email_messages")
        .select("id")
        .eq("direction", "inbound")
        .eq("crm_reply_classification", "unsubscribe")
        .ilike("from_address", email)
        .limit(1),
    ]);

    return {
      email,
      contactRows: contactResult.data || [],
      unsubscribeRows: unsubscribeResult.data || [],
      error: contactResult.error || unsubscribeResult.error,
    };
  }));

  const failed = checks.find((check) => check.error);
  if (failed?.error) return { blocked: true, blockedEmails: [], error: failed.error.message };

  const blockedEmails = Array.from(new Set(checks.flatMap((check) =>
    check.contactRows.length || check.unsubscribeRows.length ? [check.email] : []
  )));
  return { blocked: blockedEmails.length > 0, blockedEmails };
}
