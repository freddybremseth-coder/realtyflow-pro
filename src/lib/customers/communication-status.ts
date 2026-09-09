export type CustomerCommunicationStatus =
  | "NO_EMAIL"
  | "STOPPED"
  | "CLOSED"
  | "REPLIED"
  | "PAUSED"
  | "AUTO_PLANNED"
  | "SENT"
  | "READY_NOT_STARTED";

export interface CustomerCommunicationSummary {
  sentCount: number;
  lastSentAt: string | null;
  failedCount: number;
  lastFailedAt: string | null;
  lastError: string | null;
}

export interface CustomerCommunicationState {
  status: CustomerCommunicationStatus;
  label: string;
  sentCount: number;
  lastSentAt: string | null;
  lastInboundReplyAt: string | null;
  automationState: string;
  shouldReceiveEmail: boolean;
  blockedReason: string | null;
  hasReplyAfterLastSend: boolean;
}

function time(value: unknown) {
  const parsed = new Date(String(value || "")).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildCustomerCommunicationState(
  contact: Record<string, any>,
  summary: CustomerCommunicationSummary,
): CustomerCommunicationState {
  const email = String(contact.email || "").trim();
  const pipeline = String(contact.pipeline_status || "NEW").trim().toUpperCase();
  const nurtureStatus = String(contact.nurture_status || "eligible").trim().toLowerCase();
  const doNotContact = Boolean(contact.do_not_contact);
  const suppressed = Boolean(contact.email_suppressed);
  const lastInboundReplyAt = contact.last_inbound_reply_at ? String(contact.last_inbound_reply_at) : null;
  const hasReplyAfterLastSend = Boolean(
    lastInboundReplyAt && (!summary.lastSentAt || time(lastInboundReplyAt) >= time(summary.lastSentAt)),
  );

  const base = {
    sentCount: summary.sentCount,
    lastSentAt: summary.lastSentAt,
    lastInboundReplyAt,
    automationState: nurtureStatus,
    hasReplyAfterLastSend,
  };

  if (!email) {
    return { ...base, status: "NO_EMAIL", label: "Mangler e-post", shouldReceiveEmail: false, blockedReason: "no_email" };
  }
  if (doNotContact || suppressed) {
    return {
      ...base,
      status: "STOPPED",
      label: doNotContact ? "STOPP / ikke kontakt" : "E-post stoppet",
      shouldReceiveEmail: false,
      blockedReason: doNotContact ? "do_not_contact" : String(contact.suppression_reason || "email_suppressed"),
    };
  }
  if (["WON", "LOST"].includes(pipeline)) {
    return { ...base, status: "CLOSED", label: pipeline === "WON" ? "Vunnet – ingen salgsserie" : "Tapt – ingen salgsserie", shouldReceiveEmail: false, blockedReason: pipeline.toLowerCase() };
  }
  if (hasReplyAfterLastSend) {
    return { ...base, status: "REPLIED", label: "Har svart", shouldReceiveEmail: false, blockedReason: "reply_requires_state_check" };
  }
  if (nurtureStatus === "paused") {
    return { ...base, status: "PAUSED", label: "E-post pauset", shouldReceiveEmail: false, blockedReason: "nurture_paused" };
  }
  if (nurtureStatus === "stopped") {
    return { ...base, status: "STOPPED", label: "E-post stoppet", shouldReceiveEmail: false, blockedReason: "nurture_stopped" };
  }
  if (nurtureStatus === "enrolled" && summary.sentCount === 0) {
    return { ...base, status: "AUTO_PLANNED", label: "Auto planlagt", shouldReceiveEmail: true, blockedReason: null };
  }
  if (summary.sentCount > 0) {
    return { ...base, status: "SENT", label: `Sendt ${summary.sentCount}×`, shouldReceiveEmail: true, blockedReason: null };
  }
  return { ...base, status: "READY_NOT_STARTED", label: "Klar – ikke sendt", shouldReceiveEmail: true, blockedReason: null };
}

export function summarizeNurtureEvents(events: Array<Record<string, any>>): Map<string, CustomerCommunicationSummary> {
  const map = new Map<string, CustomerCommunicationSummary>();
  for (const event of events) {
    const contactId = String(event.contact_id || "");
    if (!contactId) continue;
    const current = map.get(contactId) || { sentCount: 0, lastSentAt: null, failedCount: 0, lastFailedAt: null, lastError: null };
    const status = String(event.status || "").toLowerCase();
    if (status === "sent" && !event.dry_run) {
      current.sentCount += 1;
      const sentAt = event.sent_at ? String(event.sent_at) : event.created_at ? String(event.created_at) : null;
      if (sentAt && (!current.lastSentAt || time(sentAt) > time(current.lastSentAt))) current.lastSentAt = sentAt;
    }
    if (["failed", "error"].includes(status)) {
      current.failedCount += 1;
      const failedAt = event.created_at ? String(event.created_at) : null;
      if (failedAt && (!current.lastFailedAt || time(failedAt) > time(current.lastFailedAt))) {
        current.lastFailedAt = failedAt;
        current.lastError = event.error ? String(event.error) : null;
      }
    }
    map.set(contactId, current);
  }
  return map;
}
