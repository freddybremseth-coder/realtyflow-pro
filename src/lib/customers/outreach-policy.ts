export type ManualOutreachEligibility = {
  allowed: boolean;
  blockedReason: string | null;
  warnings: string[];
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function futureDate(value: unknown, now: Date) {
  const parsed = new Date(String(value || ""));
  return !Number.isNaN(parsed.getTime()) && parsed.getTime() > now.getTime() ? parsed : null;
}

export function evaluateManualCustomerOutreach(
  contact: Record<string, any>,
  input: { awaitingReply?: boolean; now?: Date } = {},
): ManualOutreachEligibility {
  const now = input.now || new Date();
  const email = text(contact.email);
  const pipeline = text(contact.pipeline_status).toUpperCase();
  const suppressionReason = text(contact.suppression_reason);
  const replyClass = text(contact.last_reply_classification).toLowerCase();
  const waitingUntil = futureDate(contact.waiting_until, now);
  const warnings: string[] = [];

  if (!email) {
    return { allowed: false, blockedReason: "Kunden mangler e-postadresse.", warnings };
  }
  if (contact.do_not_contact === true) {
    return { allowed: false, blockedReason: "Kunden er merket STOPP / ikke kontakt.", warnings };
  }
  if (contact.email_suppressed === true && suppressionReason !== "manual_owner_takeover") {
    return { allowed: false, blockedReason: "Kunden har en aktiv CRM-sperre for e-post.", warnings };
  }
  if (["unsubscribe", "do_not_contact", "no_longer_buying"].includes(replyClass)) {
    return { allowed: false, blockedReason: "Siste kundesvar blokkerer ny salgsoppfølging.", warnings };
  }
  if (pipeline === "LOST") {
    return { allowed: false, blockedReason: "Kunden er LOST. Gjenåpne saken ved et nytt dokumentert kjøpssignal før du sender.", warnings };
  }
  if (pipeline === "WON") {
    return { allowed: false, blockedReason: "Kunden er WON. Bruk after-sales/oppfølging, ikke salgsreaktivering.", warnings };
  }
  if (pipeline === "ON_HOLD") {
    return {
      allowed: false,
      blockedReason: waitingUntil
        ? `Kunden er ON_HOLD til ${waitingUntil.toLocaleDateString("nb-NO")}.`
        : "Kunden er ON_HOLD. Gjenåpne saken før du sender salgsoppfølging.",
      warnings,
    };
  }
  if (waitingUntil) {
    return {
      allowed: false,
      blockedReason: `Kunden har avtalt ventetid til ${waitingUntil.toLocaleDateString("nb-NO")}.`,
      warnings,
    };
  }

  if (suppressionReason === "manual_owner_takeover") {
    warnings.push("Manuell takeover er aktiv. Automatisering er stoppet, men denne eksplisitte manuelle utsendelsen er tillatt.");
  }
  if (text(contact.nurture_status).toLowerCase() === "paused") {
    warnings.push("Nurture er pauset. Denne e-posten sendes bare fordi du aktivt velger manuell utsendelse.");
  }
  if (input.awaitingReply) {
    warnings.push("Vi venter allerede på kundesvar. Vurder om en ny e-post nå skaper verdi før du sender.");
  }

  return { allowed: true, blockedReason: null, warnings };
}
