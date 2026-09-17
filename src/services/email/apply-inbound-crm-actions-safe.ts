import type { SupabaseClient } from "@supabase/supabase-js";
import {
  classifyInboundReply,
  governInboundReply,
  type InboundReplyIntent,
} from "@/lib/inbound-reply-intelligence";
import {
  applyInboundCrmActions as applyResolvedInboundCrmActions,
  type InboundCrmActionResult,
} from "./apply-inbound-crm-actions";

export type { InboundCrmActionResult } from "./apply-inbound-crm-actions";

type Params = {
  emailMessageId: string;
  brandId: string;
  fromAddress: string;
  subject?: string | null;
  body?: string | null;
  summary?: string | null;
  urgency?: string | null;
  suggestedAction?: string | null;
};

function normalize(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function isTerminalSalesOutcome(intent: InboundReplyIntent) {
  return intent === "purchased_elsewhere" || intent === "no_longer_buying";
}

function unresolvedResult(params: Params): InboundCrmActionResult {
  const classification = classifyInboundReply({
    subject: normalize(params.subject),
    body: normalize(params.body),
  });
  const governance = governInboundReply(classification);
  return {
    contactId: null,
    classification: classification.intent,
    suppressed: classification.intent === "do_not_contact" || isTerminalSalesOutcome(classification.intent),
    pipelineStatus: null,
    workItemCreated: false,
    governanceTier: governance.safety.tier,
  };
}

/**
 * Central identity boundary for inbound CRM automation.
 *
 * Customer-only admission may already have resolved a message to one contact
 * using exact/global identity, safe Gmail canonicalization or thread evidence.
 * Prefer that stored CRM identity after validating the contact still exists.
 * Legacy messages without a pre-resolved identity still require exactly one
 * global exact email match before the mutating CRM action can run.
 */
export async function applyInboundCrmActions(
  supabase: SupabaseClient,
  params: Params,
): Promise<InboundCrmActionResult> {
  const fromAddress = normalize(params.fromAddress).toLowerCase();
  if (!fromAddress) return unresolvedResult(params);

  const storedMessage = await supabase
    .from("email_messages")
    .select("crm_contact_id")
    .eq("id", params.emailMessageId)
    .limit(1)
    .maybeSingle();
  if (storedMessage.error) throw new Error(`Inbound CRM stored identity lookup failed: ${storedMessage.error.message}`);

  if (storedMessage.data?.crm_contact_id) {
    const resolvedContact = await supabase
      .from("contacts")
      .select("id,email")
      .eq("id", storedMessage.data.crm_contact_id)
      .limit(1)
      .maybeSingle();
    if (resolvedContact.error) throw new Error(`Inbound CRM resolved contact lookup failed: ${resolvedContact.error.message}`);
    if (!resolvedContact.data?.id || !resolvedContact.data.email) return unresolvedResult(params);
    return applyResolvedInboundCrmActions(supabase, {
      ...params,
      fromAddress: String(resolvedContact.data.email),
    });
  }

  const { data: matches, error } = await supabase
    .from("contacts")
    .select("id,brand_id")
    .ilike("email", fromAddress)
    .limit(3);
  if (error) throw new Error(`Inbound CRM identity lookup failed: ${error.message}`);

  const rows = matches || [];
  if (rows.length !== 1) return unresolvedResult(params);

  return applyResolvedInboundCrmActions(supabase, params);
}
