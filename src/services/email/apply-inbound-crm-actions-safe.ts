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
 * The mailbox decides which brand the communication belongs to, while the CRM
 * contact is a person-level identity that may legitimately be shared across
 * brands. Automatic mutation is therefore allowed only when the sender email
 * resolves to exactly one contact globally. Duplicate identities remain
 * unresolved and available for Email Link Health / review.
 */
export async function applyInboundCrmActions(
  supabase: SupabaseClient,
  params: Params,
): Promise<InboundCrmActionResult> {
  const fromAddress = normalize(params.fromAddress).toLowerCase();
  if (!fromAddress) return unresolvedResult(params);

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
