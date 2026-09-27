import type { SupabaseClient } from "@supabase/supabase-js";
import type { InboundReplyIntent } from "@/lib/inbound-reply-intelligence";

const ACTIVE_CORPORATE_STATUSES = ["CONTACTED", "ENGAGED", "MEETING", "OPPORTUNITY"];
const ENGAGEMENT_INTENTS = new Set<InboundReplyIntent>([
  "active_interest",
  "property_interest",
  "update_preferences",
  "viewing_request",
  "follow_up_later",
  "question",
]);
const TERMINAL_INTENTS = new Set<InboundReplyIntent>([
  "do_not_contact",
  "purchased_elsewhere",
  "no_longer_buying",
]);

export type CorporateInboundMatch = {
  prospectId: string;
  companyName: string;
  status: string;
  matchedBy: "converted_contact" | "generic_company_email";
};

export function decideCorporateInboundTransition(input: {
  status?: string | null;
  intent: InboundReplyIntent;
  terminalAutoAllowed: boolean;
}) {
  const status = String(input.status || "").toUpperCase();

  if (!ACTIVE_CORPORATE_STATUSES.includes(status)) {
    return { nextStatus: status || null, shouldUpdate: false, reason: "Prospektet er ikke i aktiv kontaktfase." };
  }

  if (input.intent === "do_not_contact") {
    return { nextStatus: "DISQUALIFIED", shouldUpdate: status !== "DISQUALIFIED", reason: "Eksplisitt stoppforespørsel." };
  }

  if (
    (input.intent === "purchased_elsewhere" || input.intent === "no_longer_buying")
    && input.terminalAutoAllowed
  ) {
    return { nextStatus: "DISQUALIFIED", shouldUpdate: status !== "DISQUALIFIED", reason: "Eksplisitt terminalt kundeutfall." };
  }

  if (ENGAGEMENT_INTENTS.has(input.intent) && status === "CONTACTED") {
    return { nextStatus: "ENGAGED", shouldUpdate: true, reason: "Reelt innkommende selskapsvar." };
  }

  return { nextStatus: status, shouldUpdate: false, reason: "Ingen sikker Corporate-stageendring." };
}

function nextActionForIntent(intent: InboundReplyIntent) {
  if (intent === "viewing_request") return "Svar selskapet raskt og avklar discovery/møte samt eventuell visning.";
  if (intent === "property_interest") return "Svar selskapet og avklar hvilken bolig eller modell de ønsker å gå videre med.";
  if (intent === "update_preferences") return "Oppdater Corporate Home Assessment fra svaret før ny boligmatching.";
  if (intent === "active_interest") return "Svar selskapet og avtal neste discovery-steg med mål, budsjett og beslutningsprosess.";
  if (intent === "follow_up_later") return "Avklar ønsket tidspunkt og registrer en konkret manuell oppfølgingsdato.";
  if (intent === "question") return "Svar på spørsmålet med verifisert informasjon fra Corporate-dossieret.";
  if (intent === "unclear") return "Vurder svaret manuelt før Corporate-stage eller oppfølging endres.";
  return "Vurder kundens svar og oppdater Corporate-prospektet ved behov.";
}

async function findCorporateProspect(
  supabase: SupabaseClient,
  input: { contactId?: string | null; fromAddress: string },
): Promise<CorporateInboundMatch & { evidence: Record<string, unknown>; convertedContactId: string | null } | null> {
  if (input.contactId) {
    const linked = await supabase
      .from("corporate_prospects")
      .select("id,company_name,status,evidence,converted_contact_id")
      .eq("brand_id", "zeneco")
      .eq("converted_contact_id", input.contactId)
      .in("status", ACTIVE_CORPORATE_STATUSES)
      .limit(2);

    if (!linked.error && linked.data?.length === 1) {
      const row = linked.data[0] as Record<string, any>;
      return {
        prospectId: String(row.id),
        companyName: String(row.company_name || ""),
        status: String(row.status || ""),
        matchedBy: "converted_contact",
        evidence: row.evidence && typeof row.evidence === "object" ? row.evidence : {},
        convertedContactId: row.converted_contact_id ? String(row.converted_contact_id) : null,
      };
    }
  }

  if (!input.fromAddress) return null;

  const candidates = await supabase
    .from("corporate_prospects")
    .select("id,company_name,status,evidence,converted_contact_id")
    .eq("brand_id", "zeneco")
    .in("status", ACTIVE_CORPORATE_STATUSES)
    .limit(250);

  if (candidates.error) return null;

  const matches = (candidates.data || []).filter((row: any) => {
    const evidence = row?.evidence && typeof row.evidence === "object" ? row.evidence : {};
    const generic = evidence.generic_company_contact && typeof evidence.generic_company_contact === "object"
      ? evidence.generic_company_contact
      : {};
    return String(generic.generic_email || "").trim().toLowerCase() === input.fromAddress;
  });

  if (matches.length !== 1) return null;

  const row = matches[0] as Record<string, any>;
  return {
    prospectId: String(row.id),
    companyName: String(row.company_name || ""),
    status: String(row.status || ""),
    matchedBy: "generic_company_email",
    evidence: row.evidence && typeof row.evidence === "object" ? row.evidence : {},
    convertedContactId: row.converted_contact_id ? String(row.converted_contact_id) : null,
  };
}

async function ensureCorporateReplyWorkItem(
  supabase: SupabaseClient,
  input: {
    emailMessageId: string;
    prospectId: string;
    companyName: string;
    classification: InboundReplyIntent;
    brandId: string;
    nextAction: string;
  },
) {
  const existing = await supabase
    .from("work_items")
    .select("id")
    .eq("source_type", "corporate_inbound_reply")
    .eq("source_id", input.emailMessageId)
    .limit(1)
    .maybeSingle();

  if (existing.error || existing.data?.id) return false;

  const now = new Date().toISOString();
  const priority = ["viewing_request", "property_interest", "active_interest"].includes(input.classification)
    ? "HIGH"
    : "MEDIUM";

  const result = await supabase.from("work_items").insert({
    title: input.classification === "unclear"
      ? `Vurder Corporate-svar: ${input.companyName}`
      : `Følg opp Corporate-svar: ${input.companyName}`,
    description: "Innkommende svar er koblet entydig til et Zen Corporate Homes-prospekt via en eksisterende selskapskanal.",
    status: "TO_DO",
    priority,
    brand_id: input.brandId,
    source_type: "corporate_inbound_reply",
    source_id: input.emailMessageId,
    assigned_agent: "sales",
    next_action: input.nextAction,
    ai_score: priority === "HIGH" ? 90 : 75,
    metadata: {
      segment: "corporate_homes",
      prospect_id: input.prospectId,
      email_message_id: input.emailMessageId,
      classification: input.classification,
      automatic_send: false,
      personal_data_enriched: false,
    },
    created_at: now,
    updated_at: now,
  });

  return !result.error;
}

export async function syncCorporateProspectFromInboundReply(
  supabase: SupabaseClient,
  input: {
    emailMessageId: string;
    brandId: string;
    fromAddress: string;
    contactId?: string | null;
    classification: InboundReplyIntent;
    terminalAutoAllowed: boolean;
  },
) {
  if (input.brandId !== "zeneco") {
    return { prospect: null as CorporateInboundMatch | null, workItemCreated: false };
  }

  const fromAddress = String(input.fromAddress || "").trim().toLowerCase();
  const matched = await findCorporateProspect(supabase, {
    contactId: input.contactId || null,
    fromAddress,
  });

  if (!matched) return { prospect: null as CorporateInboundMatch | null, workItemCreated: false };

  const transition = decideCorporateInboundTransition({
    status: matched.status,
    intent: input.classification,
    terminalAutoAllowed: input.terminalAutoAllowed,
  });
  const now = new Date().toISOString();
  const nextAction = nextActionForIntent(input.classification);

  if (transition.shouldUpdate) {
    const evidence = matched.evidence && typeof matched.evidence === "object" ? matched.evidence : {};
    const existingLog = Array.isArray((evidence as any).corporate_inbound_reply_log)
      ? (evidence as any).corporate_inbound_reply_log.filter((item: unknown) => item && typeof item === "object")
      : [];

    const entry = {
      email_message_id: input.emailMessageId,
      classification: input.classification,
      matched_by: matched.matchedBy,
      received_at: now,
      personal_data_enriched: false,
      automated_reply_sent: false,
    };

    const updateResult = await supabase
      .from("corporate_prospects")
      .update({
        status: transition.nextStatus,
        next_action: transition.nextStatus === "DISQUALIFIED" ? transition.reason : nextAction,
        next_followup: null,
        evidence: {
          ...evidence,
          latest_corporate_inbound_reply: entry,
          corporate_inbound_reply_log: [...existingLog.slice(-19), entry],
        },
        updated_at: now,
      })
      .eq("id", matched.prospectId)
      .eq("brand_id", "zeneco");

    if (updateResult.error) throw new Error(`Corporate inbound update failed: ${updateResult.error.message}`);
    matched.status = String(transition.nextStatus || matched.status);
  }

  const shouldCreateStandaloneWorkItem = !input.contactId
    && input.classification !== "do_not_contact"
    && !TERMINAL_INTENTS.has(input.classification);

  const workItemCreated = shouldCreateStandaloneWorkItem
    ? await ensureCorporateReplyWorkItem(supabase, {
        emailMessageId: input.emailMessageId,
        prospectId: matched.prospectId,
        companyName: matched.companyName,
        classification: input.classification,
        brandId: input.brandId,
        nextAction,
      })
    : false;

  return {
    prospect: {
      prospectId: matched.prospectId,
      companyName: matched.companyName,
      status: matched.status,
      matchedBy: matched.matchedBy,
    } satisfies CorporateInboundMatch,
    workItemCreated,
  };
}
