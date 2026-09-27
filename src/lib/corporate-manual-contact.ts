export type CorporateManualContactMethod = "generic_email" | "contact_form";

export type CorporateManualContactInput = {
  status?: string | null;
  evidence?: Record<string, unknown> | null;
  method: CorporateManualContactMethod;
  templateKey?: string | null;
  contactedAt?: string | null;
};

function getGenericCompanyContact(evidence: Record<string, unknown>) {
  const raw = evidence.generic_company_contact;
  return raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
}

export function buildCorporateManualContactUpdate(input: CorporateManualContactInput, now = new Date()) {
  const evidence = input.evidence && typeof input.evidence === "object" ? input.evidence : {};
  const generic = getGenericCompanyContact(evidence);
  const genericEmail = String(generic.generic_email || "").trim() || null;
  const contactPageUrl = String(generic.contact_page_url || "").trim() || null;

  const channel = input.method === "generic_email" ? genericEmail : contactPageUrl;
  if (!channel) {
    throw new Error(input.method === "generic_email"
      ? "Ingen offisiell generell selskapsadresse er registrert."
      : "Ingen offisiell kontaktside er registrert.");
  }

  const contactedAt = input.contactedAt && Number.isFinite(Date.parse(input.contactedAt))
    ? new Date(input.contactedAt)
    : now;
  const followup = new Date(contactedAt);
  followup.setUTCDate(followup.getUTCDate() + 7);

  const currentLog = Array.isArray(evidence.manual_company_contact_log)
    ? evidence.manual_company_contact_log.filter((item) => item && typeof item === "object")
    : [];

  const entry = {
    contacted_at: contactedAt.toISOString(),
    method: input.method,
    channel,
    template_key: input.templateKey ? String(input.templateKey).slice(0, 80) : null,
    company_level_only: true,
    sent_by_human: true,
    automated_send: false,
    personal_data_collected: false,
  };

  return {
    status: "CONTACTED",
    next_followup: followup.toISOString(),
    next_action: "Følg opp manuelt etter 7 dager dersom selskapet ikke har svart.",
    evidence: {
      ...evidence,
      manual_company_contact_log: [...currentLog.slice(-19), entry],
      latest_manual_company_contact: entry,
    },
    entry,
  };
}
