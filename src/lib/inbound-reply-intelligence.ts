import { decideAutopilotTier, type AutopilotSafetyDecision } from "@/lib/autopilot/safety-model";

export type InboundReplyIntent =
  | "do_not_contact"
  | "purchased_elsewhere"
  | "no_longer_buying"
  | "active_interest"
  | "property_interest"
  | "update_preferences"
  | "viewing_request"
  | "follow_up_later"
  | "question"
  | "unclear";

export interface InboundReplyClassification {
  intent: InboundReplyIntent;
  confidence: number;
  reasons: string[];
  proposedPipelineAction:
    | "suppress_contact"
    | "mark_lost_purchased_elsewhere"
    | "mark_lost_no_longer_buying"
    | "move_to_contact"
    | "refresh_buyer_profile"
    | "prioritize_property_match"
    | "prioritize_viewing"
    | "schedule_followup"
    | "prepare_answer"
    | "manual_review";
  shouldPauseNurture: boolean;
  shouldStopNurture: boolean;
  shouldRefreshBuyerProfile: boolean;
  shouldRunPropertyMatching: boolean;
  requiresFastResponse: boolean;
  requestedFollowUpAt: string | null;
}

export interface GovernedInboundReplyDecision {
  classification: InboundReplyClassification;
  safety: AutopilotSafetyDecision;
  canApplyAutomatically: boolean;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Reply bodies often contain the full quoted outbound thread. Classification must
 * be based on the customer's newest reply, otherwise our own phrases such as
 * "fortsatt interessert" or property links can create false hot leads.
 */
export function extractLatestReplyText(value: string | null | undefined) {
  const raw = String(value || "").replace(/\r\n/g, "\n");
  if (!raw.trim()) return "";

  const lines = raw.split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      /^>/.test(trimmed)
      || /^(from|fra):\s/i.test(trimmed)
      || /^(on|den)\s.+\b(wrote|skrev):?\s*$/i.test(trimmed)
      || /^_{5,}$/.test(trimmed)
      || /^-{5,}\s*original message\s*-{5,}$/i.test(trimmed)
    ) {
      break;
    }
    kept.push(line);
  }

  return kept.join("\n").trim().slice(0, 4000);
}

function result(
  intent: InboundReplyIntent,
  confidence: number,
  proposedPipelineAction: InboundReplyClassification["proposedPipelineAction"],
  reasons: string[],
  overrides: Partial<InboundReplyClassification> = {},
): InboundReplyClassification {
  return {
    intent,
    confidence,
    reasons,
    proposedPipelineAction,
    shouldPauseNurture: false,
    shouldStopNurture: false,
    shouldRefreshBuyerProfile: false,
    shouldRunPropertyMatching: false,
    requiresFastResponse: false,
    requestedFollowUpAt: null,
    ...overrides,
  };
}

function addMonthsUtc(date: Date, months: number) {
  const next = new Date(date.getTime());
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next;
}

function addYearsUtc(date: Date, years: number) {
  const next = new Date(date.getTime());
  const month = next.getUTCMonth();
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCFullYear(next.getUTCFullYear() + years);
  next.setUTCMonth(month);
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), month + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next;
}

function followUpNumber(value: string) {
  const normalized = normalize(value);
  const wordNumbers: Record<string, number> = {
    ett: 1, et: 1, en: 1, one: 1,
    to: 2, two: 2,
    tre: 3, three: 3,
    fire: 4, four: 4,
    fem: 5, five: 5,
  };
  if (/^\d{1,2}$/.test(normalized)) return Number(normalized);
  return wordNumbers[normalized] || null;
}

export function deriveRequestedFollowUpAt(value: string | null | undefined, now = new Date()) {
  const text = normalize(extractLatestReplyText(value) || String(value || ""));
  if (!text) return null;

  const yearRange = text.match(/\b(?:om\s+|in\s+)?(\d{1,2}|ett|et|en|one)\s*(?:-|–|til|eller|or)\s*(\d{1,2}|to|two|tre|three|fire|four|fem|five)\s*(?:år|years?)\b/i)
    || text.match(/\b(?:om\s+|in\s+)?(ett|et|en|one)\s+(?:år|year)\s+(?:eller|or)\s+(to|two)\b/i);
  if (yearRange) {
    const upper = followUpNumber(yearRange[2]);
    if (upper) return addYearsUtc(now, upper).toISOString();
  }

  const years = text.match(/\b(?:om|in)\s+(\d{1,2}|ett|et|en|one|to|two|tre|three|fire|four|fem|five)\s+(?:år|years?)\b/i);
  if (years) {
    const count = followUpNumber(years[1]);
    if (count) return addYearsUtc(now, count).toISOString();
  }

  const months = text.match(/\b(?:om|in)\s+(\d{1,2})\s+(?:mnd|måneder|months?)\b/i);
  if (months) return addMonthsUtc(now, Number(months[1])).toISOString();

  const weeks = text.match(/\b(?:om|in)\s+(\d{1,2})\s+(?:uker|weeks?)\b/i);
  if (weeks) {
    const next = new Date(now.getTime() + Number(weeks[1]) * 7 * 86_400_000);
    return next.toISOString();
  }

  if (/\b(neste år|next year)\b/i.test(text)) return addYearsUtc(now, 1).toISOString();

  if (/\b(etter sommeren|after summer)\b/i.test(text)) {
    let year = now.getUTCFullYear();
    let target = new Date(Date.UTC(year, 8, 15, 9, 0, 0));
    if (target.getTime() <= now.getTime()) target = new Date(Date.UTC(year + 1, 8, 15, 9, 0, 0));
    return target.toISOString();
  }

  if (/\b(etter jul|after christmas)\b/i.test(text)) {
    return new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 15, 9, 0, 0)).toISOString();
  }

  return null;
}

export function classifyInboundReply(input: { subject?: string | null; body?: string | null; now?: Date }): InboundReplyClassification {
  const latestReply = extractLatestReplyText(input.body);
  // Do not let a reply subject like "Re: Er bolig ... fortsatt aktuelt?" create
  // positive intent. Subject is fallback only when there is no usable body.
  const text = normalize(latestReply || input.subject || "");

  const dnc = /^(stopp|stop|unsubscribe|avmeld)\b/i.test(text)
    || /\b(do not contact|don't contact|dont contact|stop contacting|unsubscribe|remove me|avmeld|ikke kontakt|ikke send|stopp e-?post|stopp mail)\b/i.test(text);
  if (dnc) return result("do_not_contact", 0.995, "suppress_contact", ["Explicit do-not-contact signal detected."], { shouldStopNurture: true });

  const longHorizonPause = /\b(no concrete plans|no plans to buy|maybe in one or two years|in one or two years|in a year or two|ingen konkrete planer|ingen planer om å kjøpe|om ett til to år|om et år eller to|ett til to år|et år eller to|\d{1,2}\s*(?:-|–|til)\s*\d{1,2}\s*år|tidshorisonten?[^.!?]{0,40}\d{1,2}\s*(?:-|–|til)\s*\d{1,2}\s*år|om noen år|på vent i noen år)\b/i.test(text);
  if (longHorizonPause) return result("follow_up_later", 0.98, "schedule_followup", ["Customer explicitly states that buying is not current and may only be relevant much later."], {
    shouldPauseNurture: true,
    requestedFollowUpAt: deriveRequestedFollowUpAt(latestReply || input.body, input.now || new Date()),
  });

  const purchasedElsewhere = /\b(already bought|already purchased|already have (?:a |the )?(?:house|home|property|apartment|villa)|bought (a |the )?(house|home|property|apartment|villa)|purchased elsewhere|bought elsewhere|we bought|i bought|har kjøpt|kjøpt bolig|kjøpt hus|kjøpt leilighet|kjøpt et annet sted|kjopte (?:hus|bolig|leilighet)|vi fikk kjøpt tomt(?:en|ene)?|boligbygging|allerede kjøpt|har allerede (?:en|et) (?:bolig|hus|leilighet|villa))\b/i.test(text);
  if (purchasedElsewhere) return result("purchased_elsewhere", 0.98, "mark_lost_purchased_elsewhere", ["Customer states that a property has already been purchased."], { shouldStopNurture: true });

  // Explicit temporary negatives must be evaluated before terminal phrases such
  // as "ikke aktuelt for oss", otherwise "... med det første" becomes LOST.
  const temporaryPause = /\b(not now|not at the moment|not for now|not anytime soon|not in the near future|ikke nå|ikke aktuelt(?: for (?:oss|meg|dem|ham|henne))? (?:nå|akkurat nå|med det første)|ikke med det første|foreløpig ikke aktuelt|ikke foreløpig|ikke på en stund|på sikt|ikke per dags dato|ikke i dag|senere en gang)\b/i.test(text);
  if (temporaryPause) return result("follow_up_later", 0.94, "schedule_followup", ["Customer indicates that buying is not current but may be relevant later."], {
    shouldPauseNurture: true,
    requestedFollowUpAt: deriveRequestedFollowUpAt(latestReply || input.body, input.now || new Date()),
  });

  const noLongerBuying = /\b(no longer looking|not looking anymore|not buying anymore|not going to buy|decided not to buy|we are not buying|i am not buying|no longer interested in buying|not interested anymore|not relevant anymore|decided to rent|rent instead|ikke lenger på utkikk|ser ikke lenger etter bolig|skal ikke kjøpe|kommer ikke til å kjøpe|har bestemt oss for ikke å kjøpe|har bestemt meg for ikke å kjøpe|ikke aktuelt å kjøpe|ikke aktuelt lenger|ikke lenger aktuelt|ikke aktuelt for oss|ikke aktuelt for meg|ikke interessert|nei dessverre|slått oss til ro der vi er|blir der [\"']?forever|har bestemt oss for å leie|har bestemt meg for å leie|skal leie i fremtiden)\b/i.test(text);
  if (noLongerBuying) return result("no_longer_buying", 0.97, "mark_lost_no_longer_buying", ["Customer explicitly states that the buying journey has ended."], { shouldStopNurture: true });

  const viewing = /\b(viewing|view it|see the property|see this property|book a viewing|schedule a viewing|visning|se boligen|se denne|kan vi se|booke visning|avtale visning)\b/i.test(text);
  if (viewing) return result("viewing_request", 0.97, "prioritize_viewing", ["Explicit viewing intent detected."], { shouldPauseNurture: true, requiresFastResponse: true, shouldRunPropertyMatching: true });

  const specificProperty = /\b(this property|that property|the apartment|the villa|the house|denne boligen|den boligen|denne leiligheten|denne villaen|ref\.?\s*[a-z0-9-]+|reference\s*[a-z0-9-]+)\b/i.test(text) || /https?:\/\//i.test(text);
  if (specificProperty) return result("property_interest", 0.93, "prioritize_property_match", ["Customer references a specific property or property link."], { shouldPauseNurture: true, shouldRunPropertyMatching: true, requiresFastResponse: true });

  const changed = /\b(changed|different area|different budget|new budget|other area|other location|requirements changed|endret|andre ønsker|annet område|nytt budsjett|annet budsjett|ser etter noe annet)\b/i.test(text);
  const explicitBuyerCriteria =
    /\b(ikke|not|avoid|unngå)[^.!?]{0,55}\b(golf(?:bane| course| resort)?|air\s?bnb|korttidsutleie|short[- ]term rental)\b/i.test(text)
    || /\b(internasjonal skole|international school|barnefamil|families with children|minimum\s+\d+\s+soverom|min(?:imum)?\s+\d+\s+bedroom|albir er øverst|kjøpe tomt|buy a plot|eldre hus|older house)\b/i.test(text)
    || /\b(bo der det ikke|not live in)[^.!?]{0,70}\b(golf|air\s?bnb|korttids|short[- ]term)\b/i.test(text);
  if (changed || explicitBuyerCriteria) return result("update_preferences", explicitBuyerCriteria ? 0.95 : 0.91, "refresh_buyer_profile", [explicitBuyerCriteria ? "Customer states explicit property or neighbourhood criteria." : "Customer indicates changed buying requirements."], { shouldPauseNurture: true, shouldRefreshBuyerProfile: true, shouldRunPropertyMatching: true });

  const later = /\b(later|next year|in a few months|after summer|after christmas|in \d{1,2} (?:years?|months?|weeks?)|a few years|put (?:this|me|us) on hold|senere|seinare|kanskje senere|kanskje det er aktuelt senere|kanskje det er aktuelt seinare|neste år|om noen måneder|om \d{1,2} (?:år|mnd|måneder|uker)|om noen år|etter sommeren|etter jul|på vent|litt frem i tid|litt fram i tid|kjøpet ligger[^.!?]{0,30}frem i tid|kjøpet ligger[^.!?]{0,30}fram i tid)\b/i.test(text);
  if (later) return result("follow_up_later", 0.9, "schedule_followup", ["Customer asks for a later follow-up."], {
    shouldPauseNurture: true,
    requestedFollowUpAt: deriveRequestedFollowUpAt(latestReply || input.body, input.now || new Date()),
  });

  const criteriaSubject = /bekreft|confirm|forstått boligønskene dine riktig|understood your property requirements/i.test(String(input.subject || ""));
  const criteriaReply = criteriaSubject
    && Boolean(text)
    && text.length <= 1200
    && !/^(takk|thanks|gracias|ok|okay)[.! ]*$/i.test(text);
  if (criteriaReply) return result("update_preferences", 0.96, "refresh_buyer_profile", ["Customer replies in the context of an explicit buyer-criteria confirmation or clarification."], {
    shouldPauseNurture: true,
    shouldRefreshBuyerProfile: true,
    shouldRunPropertyMatching: false,
  });

  const active = /\b(still interested|still looking|interested|yes we are|yes i am|ready to buy|ready to move forward|fortsatt interessert|fortsatt aktuelt|vi ser fortsatt|jeg ser fortsatt|interessert|klar til å kjøpe|aktuelt)\b/i.test(text);
  if (active) return result("active_interest", 0.91, "move_to_contact", ["Customer confirms active buying interest."], { shouldPauseNurture: true, shouldRunPropertyMatching: true, requiresFastResponse: true });

  const question = /\?|\b(can you|could you|what is|how much|is it available|available\?|kan du|hva er|hvor mye|er den ledig|er boligen tilgjengelig)\b/i.test(text);
  if (question) return result("question", 0.82, "prepare_answer", ["Inbound message contains a customer question."], { shouldPauseNurture: true, requiresFastResponse: true });

  return result("unclear", 0.35, "manual_review", ["No sufficiently clear commercial intent detected."], { shouldPauseNurture: true });
}

export function governInboundReply(classification: InboundReplyClassification): GovernedInboundReplyDecision {
  if (classification.intent === "do_not_contact") {
    const safety: AutopilotSafetyDecision = { tier: "AUTO", allowed: true, reason: "Explicit do-not-contact request should be honored immediately", requiresAudit: true };
    return { classification, safety, canApplyAutomatically: true };
  }

  if (classification.intent === "purchased_elsewhere" || classification.intent === "no_longer_buying") {
    const explicitTerminal = classification.confidence >= 0.97 && classification.shouldStopNurture;
    const safety: AutopilotSafetyDecision = explicitTerminal
      ? { tier: "AUTO", allowed: true, reason: "Explicit customer-stated terminal buying outcome may close sales follow-up automatically", requiresAudit: true }
      : { tier: "FREDDY", allowed: false, reason: "Terminal outcome is not explicit enough for automatic closure", requiresAudit: true };
    return { classification, safety, canApplyAutomatically: safety.tier === "AUTO" && safety.allowed };
  }

  if (classification.intent === "follow_up_later" && classification.confidence >= 0.9) {
    const safety: AutopilotSafetyDecision = {
      tier: "AUTO",
      allowed: true,
      reason: "Explicit later-buying request should pause active sales follow-up immediately",
      requiresAudit: true,
    };
    return { classification, safety, canApplyAutomatically: true };
  }

  if (classification.intent === "active_interest") {
    const safety = decideAutopilotTier({ actionType: "pipeline_transition", risk: "low", confidence: classification.confidence, currentStage: "NEW", targetStage: "CONTACT" });
    return { classification, safety, canApplyAutomatically: safety.tier === "AUTO" && safety.allowed };
  }

  const risk = classification.intent === "unclear" ? "high" : "medium";
  const safety = decideAutopilotTier({ actionType: classification.shouldRefreshBuyerProfile ? "buyer_profile_activation" : "data_update", risk, confidence: classification.confidence, requiredDataComplete: classification.intent !== "unclear" });
  return { classification, safety, canApplyAutomatically: safety.tier === "AUTO" && safety.allowed };
}
