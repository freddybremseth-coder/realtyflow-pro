import { askNexusAI, isNexusAIConfigured } from "@/services/ai/nexus-ai-client";
import type { CustomerSalesAdvisorOutput } from "@/lib/nexus/customer-sales-advisor";

export type CustomerSalesCoachMode = "NEXT_STEP" | "DISCOVERY" | "EMAIL" | "OBJECTION" | "MEETING";

export type CustomerSalesCoachInput = {
  mode: CustomerSalesCoachMode;
  contact: Record<string, unknown>;
  buyerProfile: Record<string, unknown> | null;
  criteria: Array<Record<string, unknown>>;
  communicationDialogue: Record<string, unknown>;
  advisor: CustomerSalesAdvisorOutput;
  sourceText?: string;
  sellerContext?: string;
};

export type CustomerSalesCoachOutput = {
  summary: string;
  currentPhase:
    | "DISCOVER_NEED"
    | "CONFIRM_CRITERIA"
    | "PRESENT_OPTIONS"
    | "VALIDATE_OPTIONS"
    | "DECISION"
    | "NEXT_COMMITMENT";
  customerSituation: {
    needHypothesis: string;
    evidence: string[];
    uncertainties: string[];
    questions: string[];
  };
  optionStrategy: {
    positioning: string;
    focus: string[];
    avoid: string[];
    proofNeeded: string[];
  };
  objections: Array<{ objection: string; response: string; followUpQuestion: string }>;
  nextBestAction: { action: string; why: string; channel: string };
  emailDraft: { subject: string; body: string };
  sellerCoach: { do: string[]; avoid: string[]; callOpening: string };
  evidenceGaps: string[];
  confidence: "LOW" | "MEDIUM" | "HIGH";
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringList(value: unknown, max = 8) {
  return Array.isArray(value) ? value.map(text).filter(Boolean).slice(0, max) : [];
}

function cleanJson(textValue: string) {
  const fenced = textValue.match(/\`\`\`(?:json)?\s*([\s\S]*?)\s*\`\`\`/i)?.[1];
  return (fenced || textValue).trim();
}

function firstName(value: unknown) {
  return text(value).split(/\s+/)[0] || "";
}

function normalizeEmailGreeting(value: unknown, name: unknown) {
  const body = text(value);
  if (!body) return "";
  const preferred = firstName(name);
  return body
    .replace(/^Hei\s+der\s*[,!]?/i, preferred ? \`Hei \${preferred},\` : "Hei,")
    .replace(/^Hei\s+du\s*[,!]?/i, preferred ? \`Hei \${preferred},\` : "Hei,");
}

function phaseFromStage(stage: string): CustomerSalesCoachOutput["currentPhase"] {
  if (stage === "NEW" || stage === "CONTACT") return "DISCOVER_NEED";
  if (stage === "QUALIFIED") return "CONFIRM_CRITERIA";
  if (stage === "MATCHING") return "PRESENT_OPTIONS";
  if (stage === "VIEWING") return "VALIDATE_OPTIONS";
  if (stage === "NEGOTIATION" || stage === "RESERVED") return "DECISION";
  return "NEXT_COMMITMENT";
}

function normalizeOutput(value: any, fallback: CustomerSalesCoachOutput, contactName: unknown): CustomerSalesCoachOutput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const phaseValues = new Set(["DISCOVER_NEED", "CONFIRM_CRITERIA", "PRESENT_OPTIONS", "VALIDATE_OPTIONS", "DECISION", "NEXT_COMMITMENT"]);
  const confidenceValues = new Set(["LOW", "MEDIUM", "HIGH"]);
  const currentPhase = phaseValues.has(text(value.currentPhase))
    ? text(value.currentPhase) as CustomerSalesCoachOutput["currentPhase"]
    : fallback.currentPhase;
  const confidence = confidenceValues.has(text(value.confidence))
    ? text(value.confidence) as CustomerSalesCoachOutput["confidence"]
    : fallback.confidence;

  return {
    summary: text(value.summary) || fallback.summary,
    currentPhase,
    customerSituation: {
      needHypothesis: text(value.customerSituation?.needHypothesis) || fallback.customerSituation.needHypothesis,
      evidence: stringList(value.customerSituation?.evidence) || fallback.customerSituation.evidence,
      uncertainties: stringList(value.customerSituation?.uncertainties) || fallback.customerSituation.uncertainties,
      questions: stringList(value.customerSituation?.questions) || fallback.customerSituation.questions,
    },
    optionStrategy: {
      positioning: text(value.optionStrategy?.positioning) || fallback.optionStrategy.positioning,
      focus: stringList(value.optionStrategy?.focus) || fallback.optionStrategy.focus,
      avoid: stringList(value.optionStrategy?.avoid) || fallback.optionStrategy.avoid,
      proofNeeded: stringList(value.optionStrategy?.proofNeeded) || fallback.optionStrategy.proofNeeded,
    },
    objections: Array.isArray(value.objections)
      ? value.objections.slice(0, 8).map((item: any) => ({
          objection: text(item?.objection),
          response: text(item?.response),
          followUpQuestion: text(item?.followUpQuestion),
        })).filter((item: any) => item.objection || item.response)
      : fallback.objections,
    nextBestAction: {
      action: text(value.nextBestAction?.action) || fallback.nextBestAction.action,
      why: text(value.nextBestAction?.why) || fallback.nextBestAction.why,
      channel: text(value.nextBestAction?.channel) || fallback.nextBestAction.channel,
    },
    emailDraft: {
      subject: text(value.emailDraft?.subject) || fallback.emailDraft.subject,
      body: normalizeEmailGreeting(value.emailDraft?.body, contactName) || fallback.emailDraft.body,
    },
    sellerCoach: {
      do: stringList(value.sellerCoach?.do) || fallback.sellerCoach.do,
      avoid: stringList(value.sellerCoach?.avoid) || fallback.sellerCoach.avoid,
      callOpening: text(value.sellerCoach?.callOpening) || fallback.sellerCoach.callOpening,
    },
    evidenceGaps: stringList(value.evidenceGaps) || fallback.evidenceGaps,
    confidence,
  };
}

export function buildCustomerSalesCoachFallback(input: CustomerSalesCoachInput): CustomerSalesCoachOutput {
  const name = firstName(input.contact?.name) || "kunden";
  const stage = input.advisor.stage;
  const source = text(input.sourceText);
  const evidence = [
    ...input.advisor.signals,
    ...input.advisor.whyNow,
  ].slice(0, 6);

  const questions = input.advisor.discoveryQuestions.length
    ? input.advisor.discoveryQuestions
    : [
        "Hva er viktigst for deg å få riktig akkurat nå?",
        "Hva må være sant for at du skal være komfortabel med neste steg?",
        "Er det noe ved de alternativene vi har sett på som gjør deg usikker?",
      ];

  const emailBody = input.advisor.nextBestAction.channel === "NONE"
    ? ""
    : [
        `Hei ${name},`,
        "",
        "Takk for dialogen så langt.",
        "",
        input.advisor.stage === "MATCHING"
          ? "For å gjøre søket mer presist vil jeg heller forstå hva du liker og ikke liker ved alternativene vi allerede har sett på, enn å sende deg mange nye boliger."
          : input.advisor.stage === "VIEWING"
            ? "Jeg vil gjerne oppsummere hva som traff og hva som ikke traff etter visningen, slik at neste steg blir mer presist."
            : "Jeg vil gjerne sikre at neste steg faktisk hjelper deg videre, og ikke bare blir mer informasjon.",
        "",
        questions[0] || "Hva er viktigst for deg nå?",
        "",
        "Vennlig hilsen",
        "Freddy",
      ].join("\n");

  return {
    summary: source
      ? "Bruk kundens siste ord som styrende evidens. Avklar den viktigste usikkerheten før du foreslår neste steg."
      : "Flytt salget fremover ved å redusere én konkret usikkerhet og få ett gjensidig neste steg.",
    currentPhase: phaseFromStage(stage),
    customerSituation: {
      needHypothesis: input.buyerProfile?.summary
        ? text(input.buyerProfile.summary)
        : `Kunden er i ${stage}-fasen, men behovet må fortsatt styres av bekreftet Buyer Profile og kundens egne svar.`,
      evidence,
      uncertainties: input.advisor.missing.concat(input.advisor.risks).slice(0, 6),
      questions: questions.slice(0, 5),
    },
    optionStrategy: {
      positioning: stage === "MATCHING"
        ? "Presenter få, begrunnede alternativer. Hvert alternativ skal kobles til et bekreftet behov eller en tydelig preferanse."
        : stage === "VIEWING"
          ? "Bruk visningsreaksjonen til å rangere krav og kompromisser før nye alternativer introduseres."
          : "Ikke la boliger bli løsningen før behov, timing og beslutningskriterier er tydelige.",
      focus: [
        "Kundens viktigste prioritet akkurat nå.",
        "Hva som er hardt krav versus preferanse.",
        "Hva som konkret må avklares for å gå videre.",
      ],
      avoid: [
        "Store lister med boliger uten begrunnelse.",
        "Å presse på når kunden er usikker eller på vent.",
        "Å tolke høflige svar som kjøpsberedskap.",
      ],
      proofNeeded: input.advisor.missing.slice(0, 5),
    },
    objections: [
      {
        objection: "Jeg er usikker / vil tenke.",
        response: "Ikke argumenter mot usikkerheten. Finn ut hva kunden faktisk trenger å tenke på.",
        followUpQuestion: "Hva er det viktigste du trenger å bli trygg på før du kan ta neste steg?",
      },
      {
        objection: "Ingen av boligene passer helt.",
        response: "Bruk dette som læringssignal i Buyer Profile i stedet for å sende flere tilfeldig.",
        followUpQuestion: "Hva er den viktigste forskjellen mellom det vi har sendt og det du egentlig ser etter?",
      },
    ],
    nextBestAction: input.advisor.nextBestAction,
    emailDraft: {
      subject: input.mode === "EMAIL" ? "Kort oppfølging på boligønskene dine" : "",
      body: emailBody,
    },
    sellerCoach: {
      do: [
        "Still ett spørsmål om gangen når kunden er usikker.",
        "Speil kundens egne ord før du foreslår løsning.",
        "Skill hardt krav fra preferanse og kompromiss.",
        "Få et konkret neste steg med dato eller tydelig trigger.",
      ],
      avoid: [
        "Ikke send automatisk hvis du har tatt over kunden.",
        "Ikke gå videre fra ON_HOLD uten nytt signal eller avtalt dato.",
        "Ikke la AI-utkast bli sendt uten menneskelig kontroll.",
      ],
      callOpening: `Jeg vil helst bruke et par minutter på å forstå hva som er viktigst for deg nå, så vi ikke bruker tiden din på feil boliger.`,
    },
    evidenceGaps: input.advisor.missing,
    confidence: input.advisor.missing.length <= 1 ? "HIGH" : input.advisor.missing.length <= 3 ? "MEDIUM" : "LOW",
  };
}

export async function runCustomerSalesCoach(input: CustomerSalesCoachInput) {
  const fallback = buildCustomerSalesCoachFallback(input);
  if (input.advisor.nextBestAction.channel === "NONE" || ["PAUSED", "CLOSED"].includes(input.advisor.momentum)) {
    return { output: fallback, provider: "deterministic", model: "guardrail" };
  }
  if (!isNexusAIConfigured()) return { output: fallback, provider: "deterministic", model: "fallback" };

  const systemPrompt = `Du er Nexus Sales Coach i RealtyFlow for rådgivning til privatkunder som vurderer boligkjøp i Spania.

Arbeidsmodellen er:
1) DISCOVER_NEED: forstå faktisk behov, bruk, motivasjon, timing og beslutningskriterier.
2) CONFIRM_CRITERIA: få kunden til å bekrefte/korrigere kriteriene og skille harde krav fra preferanser.
3) PRESENT_OPTIONS: presenter få, begrunnede alternativer som matcher bekreftet behov.
4) VALIDATE_OPTIONS: bruk kundens reaksjon, shortlist og visning til å lære hva som faktisk betyr mest.
5) DECISION: avklar beslutningsforbehold, pris/vilkår, finansiering og hvem som påvirker beslutningen.
6) NEXT_COMMITMENT: avtal ett konkret, gjensidig neste steg.

Regler:
- Ikke bruk manipulasjon, press, falsk knapphet eller late som kunden er mer kjøpsklar enn evidensen viser.
- Respekter STOPP, ON_HOLD, ventedato og manuell takeover.
- Ikke send e-post. Du kan bare lage et utkast.
- Skill fakta/evidens fra hypoteser.
- Ikke finn opp budsjett, preferanser, familieforhold, kjøpsdato, finansiering eller kundesitater.
- Bruk Buyer Profile og kundens siste svar som primær evidens.
- Målet er å dra salget fremover ved å redusere viktigste usikkerhet, ikke ved å øke kontaktfrekvensen.
- Norsk e-posthilsen: "Hei {fornavn}," når verifisert fornavn finnes, ellers "Hei,". Aldri "Hei der".

Svar KUN som gyldig JSON med:
summary, currentPhase,
customerSituation {needHypothesis,evidence[],uncertainties[],questions[]},
optionStrategy {positioning,focus[],avoid[],proofNeeded[]},
objections [{objection,response,followUpQuestion}],
nextBestAction {action,why,channel},
emailDraft {subject,body},
sellerCoach {do[],avoid[],callOpening},
evidenceGaps[], confidence.
Alle tekster skal være på norsk.`;

  const prompt = JSON.stringify({
    task: input.mode,
    contact: input.contact,
    buyerProfile: input.buyerProfile,
    criteria: input.criteria,
    communicationDialogue: input.communicationDialogue,
    advisor: input.advisor,
    pastedCustomerMessageOrSellerContext: input.sourceText || null,
    sellerNote: input.sellerContext || null,
  }, null, 2);

  try {
    const result = await askNexusAI(prompt, { systemPrompt, maxTokens: 3200 });
    const parsed = JSON.parse(cleanJson(result.text));
    return {
      output: normalizeOutput(parsed, fallback, input.contact?.name),
      provider: result.provider,
      model: result.model,
    };
  } catch (error) {
    console.warn("[Customer Sales Coach] AI failed, using deterministic fallback", error);
    return { output: fallback, provider: "deterministic", model: "fallback" };
  }
}
