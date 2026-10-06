import type { SupabaseClient } from "@supabase/supabase-js";

export type SuppressionCheckResult = {
  blocked: boolean;
  blockedEmails: string[];
  manualTakeoverEmails: string[];
  hardBlockedEmails: string[];
  error?: string;
};

const INBOUND_SUPPRESSION_CLASSIFICATIONS = ["unsubscribe", "do_not_contact"];

export function normalizeRecipientEmails(values: string[]) {
  return Array.from(new Set(values.map((value) => String(value || "").trim().toLowerCase()).filter(Boolean)));
}

export async function checkCrmEmailSuppression(
  supabase: SupabaseClient,
  values: string[],
): Promise<SuppressionCheckResult> {
  const recipients = normalizeRecipientEmails(values);
  if (!recipients.length) return { blocked: false, blockedEmails: [], manualTakeoverEmails: [], hardBlockedEmails: [] };

  const checks = await Promise.all(recipients.map(async (email) => {
    const [contactResult, inboundOptOutResult] = await Promise.all([
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
        .ilike("from_address", email)
        .in("crm_reply_classification", INBOUND_SUPPRESSION_CLASSIFICATIONS)
        .limit(1),
    ]);

    return {
      email,
      contactRows: contactResult.data || [],
      inboundOptOutRows: inboundOptOutResult.data || [],
      error: contactResult.error || inboundOptOutResult.error,
    };
  }));

  const failed = checks.find((check) => check.error);
  if (failed?.error) return { blocked: true, blockedEmails: [], manualTakeoverEmails: [], hardBlockedEmails: [], error: failed.error.message };

  const blockedEmails = Array.from(new Set(checks.flatMap((check) =>
    check.contactRows.length || check.inboundOptOutRows.length ? [check.email] : []
  )));
  const manualTakeoverEmails = Array.from(new Set(checks.flatMap((check) =>
    check.contactRows.some((row: any) => String(row.suppression_reason || "") === "manual_owner_takeover") ? [check.email] : []
  )));
  const hardBlockedEmails = Array.from(new Set(checks.flatMap((check) => {
    const hardContactSuppression = check.contactRows.some((row: any) =>
      row.do_not_contact === true
      || (
        row.email_suppressed === true
        && String(row.suppression_reason || "") !== "manual_owner_takeover"
      ),
    );
    const inboundOptOut = check.inboundOptOutRows.length > 0;
    return hardContactSuppression || inboundOptOut ? [check.email] : [];
  })));
  return { blocked: blockedEmails.length > 0, blockedEmails, manualTakeoverEmails, hardBlockedEmails };
}
