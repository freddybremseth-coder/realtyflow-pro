import { normalizeCustomerPipelineStatus, type CustomerPipelineStatus } from "@/lib/customer-updates";

export type CustomerEffectiveState = {
  pipelineStatus: CustomerPipelineStatus;
  rawPipelineStatus: CustomerPipelineStatus;
  terminal: boolean;
  doNotContact: boolean;
  emailSuppressed: boolean;
  nurtureStopped: boolean;
  canReceiveSalesEmail: boolean;
  canCreateHotLead: boolean;
  activeSalesWorkAllowed: boolean;
  reconciliationNeeded: boolean;
  reason: string;
};

export interface CustomerStateInput {
  pipeline_status?: unknown;
  do_not_contact?: unknown;
  email_suppressed?: unknown;
  nurture_status?: unknown;
  last_reply_classification?: unknown;
  lost_reason?: unknown;
  suppression_reason?: unknown;
}

const TERMINAL_REPLY_CLASSIFICATIONS = new Set(["purchased_elsewhere", "no_longer_buying"]);
const TERMINAL_STAGES = new Set<CustomerPipelineStatus>(["WON", "LOST"]);

function truthy(value: unknown) {
  return value === true || String(value || "").toLowerCase() === "true";
}

function text(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export function resolveCustomerState(input: CustomerStateInput): CustomerEffectiveState {
  const rawPipelineStatus = normalizeCustomerPipelineStatus(input.pipeline_status || "NEW");
  const doNotContact = truthy(input.do_not_contact) || text(input.suppression_reason) === "customer_unsubscribe_reply";
  const lastReply = text(input.last_reply_classification);
  const terminalReply = TERMINAL_REPLY_CLASSIFICATIONS.has(lastReply);
  const rawTerminal = TERMINAL_STAGES.has(rawPipelineStatus);

  let pipelineStatus = rawPipelineStatus;
  let reconciliationNeeded = false;
  let reason = `Pipeline: ${rawPipelineStatus}`;

  if (!rawTerminal && terminalReply) {
    pipelineStatus = "LOST";
    reconciliationNeeded = true;
    reason = `Sikkert terminalt kundesvar (${lastReply}) overstyrer stale pipeline ${rawPipelineStatus}`;
  } else if (rawTerminal) {
    reason = `Terminal pipeline: ${rawPipelineStatus}`;
  } else if (doNotContact) {
    reason = "Aktiv pipeline, men kunden har STOPP / do-not-contact";
  }

  const terminal = TERMINAL_STAGES.has(pipelineStatus);
  const emailSuppressed = truthy(input.email_suppressed) || doNotContact || terminal;
  const nurtureStopped = text(input.nurture_status) === "stopped" || doNotContact || terminal;

  return {
    pipelineStatus,
    rawPipelineStatus,
    terminal,
    doNotContact,
    emailSuppressed,
    nurtureStopped,
    canReceiveSalesEmail: !emailSuppressed && !terminal && !doNotContact,
    canCreateHotLead: !terminal && !doNotContact,
    activeSalesWorkAllowed: !terminal,
    reconciliationNeeded,
    reason,
  };
}
