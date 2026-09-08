export type CanonicalCustomerLifecycle = "ACTIVE" | "ON_HOLD" | "LOST" | "WON" | "DNC";

export interface CanonicalCustomerStateInput {
  pipeline_status?: string | null;
  do_not_contact?: boolean | null;
  email_suppressed?: boolean | null;
  suppression_reason?: string | null;
  nurture_status?: string | null;
  last_reply_classification?: string | null;
  lost_reason?: string | null;
}

export interface CanonicalCustomerState {
  lifecycle: CanonicalCustomerLifecycle;
  effectivePipelineStatus: string;
  rawPipelineStatus: string;
  label: string;
  reason: string;
  terminal: boolean;
  salesActive: boolean;
  communicationBlocked: boolean;
  needsPipelineReconciliation: boolean;
  source: "pipeline" | "reply" | "suppression" | "dnc";
}

const TERMINAL_REPLY_INTENTS = new Set(["purchased_elsewhere", "no_longer_buying"]);
const TERMINAL_SUPPRESSION_REASONS = new Set([
  "purchase_reported_by_customer",
  "customer_no_longer_buying",
]);

function upper(value: unknown) {
  return String(value || "").trim().toUpperCase();
}

function lower(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function lostLabel(reason: string) {
  if (reason === "purchased_elsewhere" || reason === "purchase_reported_by_customer") {
    return "Tapt – kjøpt annet sted";
  }
  if (reason === "no_longer_buying" || reason === "customer_no_longer_buying") {
    return "Tapt – ikke lenger på boligjakt";
  }
  return "Tapt";
}

export function resolveCanonicalCustomerState(input: CanonicalCustomerStateInput): CanonicalCustomerState {
  const rawPipelineStatus = upper(input.pipeline_status) || "NEW";
  const replyIntent = lower(input.last_reply_classification);
  const suppressionReason = lower(input.suppression_reason);
  const lostReason = lower(input.lost_reason);
  const dnc = Boolean(input.do_not_contact) || suppressionReason === "customer_unsubscribe_reply";

  if (dnc) {
    return {
      lifecycle: "DNC",
      effectivePipelineStatus: rawPipelineStatus,
      rawPipelineStatus,
      label: "Ikke kontakt",
      reason: "kunden har bedt om å ikke bli kontaktet",
      terminal: true,
      salesActive: false,
      communicationBlocked: true,
      needsPipelineReconciliation: false,
      source: "dnc",
    };
  }

  if (rawPipelineStatus === "WON") {
    return {
      lifecycle: "WON",
      effectivePipelineStatus: "WON",
      rawPipelineStatus,
      label: "Kunde / vunnet",
      reason: "pipeline er vunnet",
      terminal: true,
      salesActive: false,
      communicationBlocked: false,
      needsPipelineReconciliation: false,
      source: "pipeline",
    };
  }

  if (rawPipelineStatus === "LOST") {
    const reason = lostReason || replyIntent || suppressionReason;
    return {
      lifecycle: "LOST",
      effectivePipelineStatus: "LOST",
      rawPipelineStatus,
      label: lostLabel(reason),
      reason: reason ? `pipeline er tapt: ${reason}` : "pipeline er tapt",
      terminal: true,
      salesActive: false,
      communicationBlocked: Boolean(input.email_suppressed),
      needsPipelineReconciliation: false,
      source: "pipeline",
    };
  }

  if (TERMINAL_REPLY_INTENTS.has(replyIntent)) {
    return {
      lifecycle: "LOST",
      effectivePipelineStatus: "LOST",
      rawPipelineStatus,
      label: lostLabel(replyIntent),
      reason: `siste eksplisitte kundesvar er ${replyIntent}`,
      terminal: true,
      salesActive: false,
      communicationBlocked: true,
      needsPipelineReconciliation: true,
      source: "reply",
    };
  }

  if (TERMINAL_SUPPRESSION_REASONS.has(suppressionReason)) {
    return {
      lifecycle: "LOST",
      effectivePipelineStatus: "LOST",
      rawPipelineStatus,
      label: lostLabel(suppressionReason),
      reason: `terminal suppression er ${suppressionReason}`,
      terminal: true,
      salesActive: false,
      communicationBlocked: true,
      needsPipelineReconciliation: true,
      source: "suppression",
    };
  }

  if (rawPipelineStatus === "ON_HOLD") {
    return {
      lifecycle: "ON_HOLD",
      effectivePipelineStatus: "ON_HOLD",
      rawPipelineStatus,
      label: "På vent",
      reason: "pipeline er satt på vent",
      terminal: false,
      salesActive: false,
      communicationBlocked: Boolean(input.email_suppressed),
      needsPipelineReconciliation: false,
      source: "pipeline",
    };
  }

  return {
    lifecycle: "ACTIVE",
    effectivePipelineStatus: rawPipelineStatus,
    rawPipelineStatus,
    label: rawPipelineStatus,
    reason: "aktiv pipeline",
    terminal: false,
    salesActive: true,
    communicationBlocked: Boolean(input.email_suppressed),
    needsPipelineReconciliation: false,
    source: "pipeline",
  };
}

export function isActiveCustomerWorkStatus(value: unknown) {
  return ["TO_DO", "IN_PROGRESS", "REVIEW"].includes(upper(value) || "TO_DO");
}
