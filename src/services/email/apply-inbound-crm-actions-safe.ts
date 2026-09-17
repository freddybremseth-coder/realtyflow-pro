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
 * The legacy action resolver selects a contact by email before applying CRM
 * mutations. This wrapper only lets that resolver run when the address maps to
 * exactly one contact globally and that contact belongs to the message brand.
 * Duplicate same-brand identities and cross-brand aliases therefore remain
 * unlinked and available for Email Link Health / human review.
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
  const resolved = rows.length === 1 && String(rows[0].brand_id || "") === params.brandId;
  if (!resolved) return unresolvedResult(params);

  return applyResolvedInboundCrmActions(supabase, params);
}
