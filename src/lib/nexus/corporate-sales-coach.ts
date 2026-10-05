import { askNexusAI, isNexusAIConfigured } from "@/services/ai/nexus-ai-client";
import type { CorporateAdvisorRecommendation } from "@/lib/nexus/corporate-account-advisor";

export type SalesCoachMode = "NEXT_STEP" | "DISCOVERY" | "EMAIL" | "ARGUMENTS" | "OBJECTION" | "MEETING";

export type CorporateSalesCoachInput = {
  mode: SalesCoachMode;
  companyName: string;
  companyContext: Record<string, unknown>;
  strategy: Record<string, unknown> | null;
  contacts: Array<Record<string, unknown>>;
  touchpoints: Array<Record<string, unknown>>;
  advisor: CorporateAdvisorRecommendation;
  sourceText?: string;
  sellerContext?: string;
};

export type CorporateSalesCoachOutput = {
  summary: string;
  currentPhase: "DISCOVER_PROBLEM" | "CONFIRM_PROBLEM" | "PRESENT_SOLUTION" | "CONFIRM_SOLUTION" | "NEXT_COMMITMENT";
  problem: {
    hypothesis: string;
    evidence: string[];
    questions: string[];
    acceptanceSignals: string[];
  };
  solution: {
    positioning: string;
    arguments: string[];
    proofNeeded: string[];
    acceptanceQuestions: string[];
  };
  stakeholders: Array<{ role: string; objective: string; risk: string }>;
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

function normalizeNorwegianEmailGreeting(value: unknown) {
  const body = text(value);
  if (!body) return "";
  return body
    .replace(/^Hei\s+der\s*[,!]?/i, "Hei,")
    .replace(/^Hei\s+du\s*[,!]?/i, "Hei,");
}

function normalizeOutput(value: any, fallback: CorporateSalesCoachOutput): CorporateSalesCoachOutput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const phase = ["DISCOVER_PROBLEM","CONFIRM_PROBLEM","PRESENT_SOLUTION","CONFIRM_SOLUTION","NEXT_COMMITMENT"].includes(text(value.currentPhase))
    ? text(value.currentPhase) as CorporateSalesCoachOutput["currentPhase"]
    : fallback.currentPhase;
  const confidence = ["LOW","MEDIUM","HIGH"].includes(text(value.confidence))
    ? text(value.confidence) as CorporateSalesCoachOutput["confidence"]
    : fallback.confidence;
  return {
    summary: text(value.summary) || fallback.summary,
    currentPhase: phase,
    problem: {
      hypothesis: text(value.problem?.hypothesis) || fallback.problem.hypothesis,
      evidence: stringList(value.problem?.evidence) || fallback.problem.evidence,
      questions: stringList(value.problem?.questions) || fallback.problem.questions,
      acceptanceSignals: stringList(value.problem?.acceptanceSignals) || fallback.problem.acceptanceSignals,
    },
    solution: {
      positioning: text(value.solution?.positioning) || fallback.solution.positioning,
      arguments: stringList(value.solution?.arguments) || fallback.solution.arguments,
      proofNeeded: stringList(value.solution?.proofNeeded) || fallback.solution.proofNeeded,
      acceptanceQuestions: stringList(value.solution?.acceptanceQuestions) || fallback.solution.acceptanceQuestions,
    },
    stakeholders: Array.isArray(value.stakeholders)
      ? value.stakeholders.slice(0, 8).map((item: any) => ({
          role: text(item?.role),
          objective: text(item?.objective),
          risk: text(item?.risk),
        })).filter((item: any) => item.role || item.objective || item.risk)
      : fallback.stakeholders,
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
      body: normalizeNorwegianEmailGreeting(value.emailDraft?.body) || fallback.emailDraft.body,
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

export function buildSalesCoachFallback(input: CorporateSalesCoachInput): CorporateSalesCoachOutput {
  const primaryModel = text(input.strategy?.primary_model) ||
    (Array.isArray(input.strategy?.account_models) ? text(input.strategy?.account_models?.[0]) : "") ||
    input.advisor.recommendedModels[0] || "Firmabolig";
  const entryRole = text(input.strategy?.recommended_entry_role) || input.advisor.recommendedEntryRole;
  const problemHypothesis = text(input.strategy?.problem_hypothesis) ||
    `Vi må bekrefte hvilket konkret problem ${input.companyName} ønsker å løse før vi presenterer ${primaryModel} som løsning.`;
  const source = text(input.sourceText);

  return {
    summary: source
      ? "Bruk kundens egne ord som utgangspunkt. Bekreft behovet før du argumenterer for løsningen."
      : "Neste steg er å gjøre problemhypotesen eksplisitt og få kunden til å bekrefte eller korrigere den.",
    currentPhase: source ? "CONFIRM_PROBLEM" : "DISCOVER_PROBLEM",
    problem: {
      hypothesis: problemHypothesis,
      evidence: input.advisor.whyNow.slice(0, 5),
      questions: [
        "Hva ønsker dere konkret å forbedre med dagens løsning eller dagens måte å organisere dette på?",
        "Hva koster eller skaper mest friksjon i dagens situasjon?",
        "Hvem mer i organisasjonen opplever dette som et reelt problem?",
        "Hva skjer dersom dere ikke gjør noe de neste 12–24 månedene?",
      ],
      acceptanceSignals: [
        "Kunden beskriver problemet med egne ord.",
        "Kunden bekrefter konsekvens, kostnad eller intern betydning.",
        "Kunden navngir hvem som påvirkes eller hvem som må være med videre.",
      ],
    },
    solution: {
      positioning: `Når problemet er bekreftet, posisjoner ${primaryModel} som én mulig modell – ikke som konklusjonen på forhånd.`,
      arguments: [
        "Beslutningsgrunnlaget bygges før konkrete boliger velges.",
        "Ferie-/medlemsbruk og bedriftsbruk holdes adskilt i økonomien.",
        "Hotellalternativ beregnes bare på reelle bedriftsopphold.",
        "Lokal drift kan organiseres gjennom Care etter kjøp.",
      ],
      proofNeeded: [
        "Antall faktiske brukere og forventede bruksuker.",
        "Antall bedriftsopphold per år og gruppestørrelse.",
        "Investeringsramme og ønsket eiertid.",
      ],
      acceptanceQuestions: [
        "Hvis vi kan dokumentere dette med deres egne tall, vil det være verdt å vurdere videre?",
        "Er dette en modell dere kunne tatt inn i en intern beslutningsprosess?",
        "Hva må være sant for at dere skal si ja til neste steg?",
      ],
    },
    stakeholders: [
      { role: entryRole || "Primær inngang", objective: "Bekrefte behov og relevans", risk: "Starter vi for tidlig med produkt, kan dialogen bli en eiendomspitch." },
      { role: "CFO / økonomi", objective: "Forstå kostnad, kapital og alternativer", risk: "Kan stoppe saken dersom business case kommer for sent." },
      { role: "CEO / styre", objective: "Vurdere strategisk verdi og beslutning", risk: "Trenger et kort, etterprøvbart beslutningsgrunnlag." },
    ],
    objections: [
      { objection: "Dette blir for dyrt.", response: "Ikke argumenter mot innvendingen. Avklar først hva de sammenligner med og hvilken bruk de ser for seg.", followUpQuestion: "Hva ville dere sammenlignet dette med i dag – hotell, leie, andre ansattgoder eller å ikke gjøre noe?" },
      { objection: "Vi vet ikke om ansatte vil bruke det.", response: "Gjør usikkerheten til et kvalifiseringsspørsmål før boligvalg.", followUpQuestion: "Hvordan måler dere interesse for andre ansattgoder, og hvilken brukergruppe ville vært mest relevant å teste først?" },
    ],
    nextBestAction: {
      action: input.advisor.nextAction,
      why: "Før vi går videre bør neste handling redusere den viktigste usikkerheten i kontoen.",
      channel: input.mode === "EMAIL" ? "EMAIL" : "MEETING",
    },
    emailDraft: {
      subject: `Kort spørsmål om ${primaryModel.toLowerCase()} for ${input.companyName}`,
      body: `Hei,\n\nJeg ønsker ikke å starte med å foreslå en bolig. Først vil jeg forstå om dette i det hele tatt løser et relevant behov hos dere.\n\nVi hjelper norske virksomheter med å vurdere om en bolig på Costa Blanca kan fungere som ansatt-/medlemsfordel og/eller base for mindre leder- og teamsamlinger. Før man ser på eiendom, setter vi opp bruk, økonomi og beslutningsgrunnlag.\n\nKunne det vært relevant med en kort samtale for å se om dette passer deres situasjon?\n\nVennlig hilsen\nFreddy`,
    },
    sellerCoach: {
      do: [
        "Få kunden til å beskrive problemet og konsekvensen med egne ord.",
        "Oppsummer problemet og be om bekreftelse før du går til løsning.",
        "Presenter bare de delene av løsningen som svarer på et bekreftet behov.",
        "Avslutt med ett konkret neste steg.",
      ],
      avoid: [
        "Ikke hopp direkte til bolig, avkastning eller prisvekst.",
        "Ikke argumenter mot en innvending før du har forstått hva som ligger bak.",
        "Ikke behandle taushet eller høflighet som aksept.",
      ],
      callOpening: "Jeg vil gjerne bruke de første minuttene på å forstå hvordan dere gjør dette i dag og om det faktisk er et problem verdt å løse. Hvis ikke, stopper vi der.",
    },
    evidenceGaps: input.advisor.missing,
    confidence: input.advisor.missing.length <= 1 ? "HIGH" : input.advisor.missing.length <= 3 ? "MEDIUM" : "LOW",
  };
}

export async function runCorporateSalesCoach(input: CorporateSalesCoachInput) {
  const fallback = buildSalesCoachFallback(input);
  if (!isNexusAIConfigured()) return { output: fallback, provider: "deterministic", model: "fallback" };

  const systemPrompt = `Du er Nexus Sales Coach i RealtyFlow for Zen Corporate Homes. Du trener selgeren i konsultativ, etisk B2B-salg.
Arbeidsmodellen er:
1) DISCOVER_PROBLEM: avdekk faktisk problem, konsekvens og hvem som påvirkes.
2) CONFIRM_PROBLEM: oppsummer og få kunden til å bekrefte/korrigere problemet.
3) PRESENT_SOLUTION: presenter kun løsningselementer som matcher et bekreftet problem.
4) CONFIRM_SOLUTION: test om løsningen faktisk treffer, hvilke forbehold som finnes og hvem som må godkjenne.
5) NEXT_COMMITMENT: avtal et konkret, gjensidig neste steg.

Du skal ikke bruke manipulasjon, press, falsk knapphet, skjulte psykologiske grep eller late som kunden har akseptert noe de ikke har sagt.
Skill fakta/evidens fra hypoteser. Ikke finn opp kontakter, møter, behov, budsjetter eller kundesitater.

Zen Corporate Homes-fakta som kan brukes når de er relevante:
- Behov, bruk og business case avklares før konkrete boliger presenteres.
- Ferie-/medlemsbruk og virksomhetsrelaterte opphold er to separate nyttespor.
- Hotellalternativ beregnes bare for faktiske bedriftsopphold: opphold per år × personer × netter × realistisk hotellpris per person/natt. Dette er en alternativ kostnad, ikke automatisk besparelse.
- Årlig eierkostnad skal vises før eventuell verdiendring.
- Verdiutvikling er et scenario, ikke en garanti eller kontantbesparelse.
- Care kan håndtere lokal nøkkel, tilsyn, klargjøring og praktisk drift etter kjøp.
- Skatt, juridikk, selskapsstruktur og regnskapsbehandling kvalitetssikres av kundens kvalifiserte rådgivere.
- For partnerkontoer skal Zen komplettere partnerens rolle, ikke forsøke å erstatte kundens etablerte rådgiver.

Hvis en e-post er limt inn, analyser kundens ord og skriv et forslag til svar, men aldri send.
Norsk e-posthilsen skal være naturlig: bruk "Hei {fornavn}," når et verifisert fornavn finnes, ellers "Hei,". Bruk aldri "Hei der".
Svar KUN som gyldig JSON med feltene:
summary, currentPhase,
problem {hypothesis,evidence[],questions[],acceptanceSignals[]},
solution {positioning,arguments[],proofNeeded[],acceptanceQuestions[]},
stakeholders [{role,objective,risk}],
objections [{objection,response,followUpQuestion}],
nextBestAction {action,why,channel},
emailDraft {subject,body},
sellerCoach {do[],avoid[],callOpening},
evidenceGaps[], confidence.
Alle tekster skal være på norsk.`;

  const prompt = JSON.stringify({
    task: input.mode,
    companyName: input.companyName,
    companyContext: input.companyContext,
    strategy: input.strategy,
    contacts: input.contacts,
    recentTouchpoints: input.touchpoints.slice(0, 20),
    advisor: input.advisor,
    pastedEmailOrContext: input.sourceText || null,
    sellerNote: input.sellerContext || null,
  }, null, 2);

  try {
    const result = await askNexusAI(prompt, { systemPrompt, maxTokens: 3600 });
    const parsed = JSON.parse(cleanJson(result.text));
    return { output: normalizeOutput(parsed, fallback), provider: result.provider, model: result.model };
  } catch (error) {
    console.warn("[Corporate Sales Coach] AI failed, using deterministic fallback", error);
    return { output: fallback, provider: "deterministic", model: "fallback" };
  }
}
