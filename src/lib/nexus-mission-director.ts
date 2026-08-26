import type { BusinessPipelineId } from "@/lib/business-pipeline-registry";

export type DirectorRole = "growth_director" | "demand_generation" | "content_influencer" | "sales_sdr" | "closer" | "customer_success";
export type DirectorMissionKind = "generate_demand" | "qualify_pipeline" | "advance_pipeline" | "close_revenue" | "recover_stalled" | "retain_expand";

export interface PipelineHealthInput {
  brandId: string;
  pipelineId: BusinessPipelineId;
  activeOpportunities: number;
  newOpportunities7d: number;
  qualificationOpportunities: number;
  considerationOpportunities: number;
  conversionOpportunities: number;
  deliveryRetentionOpportunities?: number;
  staleOpportunities: number;
  staleConversionOpportunities?: number;
  targetNewPerWeek: number;
  targetConversionsPerMonth?: number;
  realizedConversions30d?: number;
}

export interface DirectorMission {
  id: string;
  brandId: string;
  pipelineId: BusinessPipelineId;
  role: DirectorRole;
  kind: DirectorMissionKind;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  title: string;
  reason: string;
  action: string;
  desiredOutcome: string;
  autonomy: "suggest" | "prepare" | "approval";
}

const DEMAND_ACTION: Record<BusinessPipelineId, string> = {
  real_estate_sales: "Klargjør en inventory-grounded lead-generation batch med sterke boliger/områder, tydelig buyer CTA og distribusjon i riktige brand-kanaler.",
  publishing: "Klargjør en growth-batch rundt bøkene med høyest dokumentert intent: sample, serieinngang, retailer CTA og målrettet innhold mot riktig leser.",
  ai_products_services: "Klargjør use-case-basert demand generation med konkret problem/løsning, demo-CTA og en kvalifisert prospect-liste for relevant outreach.",
  expert_advisory: "Klargjør ekspertinnhold med tydelig problem/innsikt/CTA, referral-oppfølging og invitasjon til en kort kvalifiseringssamtale.",
  product_commerce: "Klargjør produkt-/bruksinnhold, tydelig kjøpsvei og relevant re-engagement mot dokumentert produktinteresse.",
  creator_media: "Klargjør distribusjon rundt innhold med høyest retention/engagement og bygg neste publiseringsbatch for følger- og abonnentvekst.",
};

const ADVANCE_ACTION: Record<BusinessPipelineId, string> = {
  real_estate_sales: "Prioriter kvalifisering, matching og visningsavtaler på de sterkeste kjøpersakene.",
  publishing: "Flytt dokumentert interesse fra bokside/sample til retailer click og serieoppdagelse.",
  ai_products_services: "Flytt kvalifiserte prospects til discovery/demo med tydelig use case og beslutningskriterier.",
  expert_advisory: "Flytt kvalifiserte henvendelser til discovery/scope med tydelig klientmål og beslutningsprosess.",
  product_commerce: "Flytt produktinteresse til kjøpsintensjon med bedre produktinfo, tilbudsfriksjon og kjøpsvei.",
  creator_media: "Flytt engasjert publikum mot follow/subscribe og tilbakevendende konsum.",
};

const CLOSE_ACTION: Record<BusinessPipelineId, string> = {
  real_estate_sales: "Closer skal gjennomgå alle forhandlings-/reservasjonssaker, identifisere siste beslutningshinder og klargjøre konkret closing-step.",
  publishing: "Prioriter retailer-conversion på bøker med tydelig kjøpsintensjon; fjern metadata-, ASIN-, cover-, sample- eller CTA-friksjon.",
  ai_products_services: "Closer skal prioritere proposal/pilot-saker, avklare siste risiko, scope, pris og beslutningsdato.",
  expert_advisory: "Closer skal følge opp åpne tilbud og gjøre scope, honorar, verdi og beslutningsdato tydelig.",
  product_commerce: "Prioriter kjøpsfriksjon, checkout/availability og relevant re-engagement på sterk kjøpsintensjon.",
  creator_media: "Prioriter konvertering fra engasjert publikum til follow/subscribe med tydelig, naturlig CTA.",
};

export function directPipelineMissions(input: PipelineHealthInput): DirectorMission[] {
  const missions: DirectorMission[] = [];
  const newGap = Math.max(0, input.targetNewPerWeek - input.newOpportunities7d);
  const conversionGap = Math.max(0, Number(input.targetConversionsPerMonth || 0) - Number(input.realizedConversions30d || 0));

  if (newGap > 0) {
    missions.push({
      id: `director:${input.brandId}:demand`,
      brandId: input.brandId,
      pipelineId: input.pipelineId,
      role: input.pipelineId === "publishing" || input.pipelineId === "creator_media" ? "content_influencer" : "demand_generation",
      kind: "generate_demand",
      priority: newGap >= Math.max(3, input.targetNewPerWeek * 0.6) ? "HIGH" : "MEDIUM",
      title: `Pipeline trenger ${newGap} nye opportunities`,
      reason: `${input.newOpportunities7d}/${input.targetNewPerWeek} nye opportunities siste 7 dager. Nexus skal ikke vente passivt når top-of-funnel ligger bak målet.`,
      action: DEMAND_ACTION[input.pipelineId],
      desiredOutcome: `Skap minst ${newGap} nye kvalifiserbare opportunities uten å senke kvaliteten.`,
      autonomy: "prepare",
    });
  }

  if (input.staleConversionOpportunities && input.staleConversionOpportunities > 0) {
    missions.push({
      id: `director:${input.brandId}:stale-close`,
      brandId: input.brandId,
      pipelineId: input.pipelineId,
      role: "closer",
      kind: "recover_stalled",
      priority: "CRITICAL",
      title: `${input.staleConversionOpportunities} closing-saker står stille`,
      reason: "Conversion-stage uten ferskt neste steg er direkte revenue leakage og skal eskaleres før ny lavere-prioritert aktivitet.",
      action: CLOSE_ACTION[input.pipelineId],
      desiredOutcome: "Hver closing-sak får et dokumentert beslutningshinder, konkret neste steg og dato.",
      autonomy: "approval",
    });
  } else if (input.conversionOpportunities > 0 && conversionGap > 0) {
    missions.push({
      id: `director:${input.brandId}:close`,
      brandId: input.brandId,
      pipelineId: input.pipelineId,
      role: "closer",
      kind: "close_revenue",
      priority: "HIGH",
      title: `Closing-kapasitet skal brukes på ${input.conversionOpportunities} aktive saker`,
      reason: `${input.realizedConversions30d || 0}/${input.targetConversionsPerMonth || 0} realiserte conversions siste 30 dager.`,
      action: CLOSE_ACTION[input.pipelineId],
      desiredOutcome: `Reduser conversion-gap på ${conversionGap} uten å presse irrelevante eller umodne kunder.`,
      autonomy: "approval",
    });
  }

  if (input.staleOpportunities > 0) {
    missions.push({
      id: `director:${input.brandId}:stale`,
      brandId: input.brandId,
      pipelineId: input.pipelineId,
      role: "sales_sdr",
      kind: "recover_stalled",
      priority: input.staleOpportunities >= 5 ? "HIGH" : "MEDIUM",
      title: `${input.staleOpportunities} opportunities mangler fremdrift`,
      reason: "Aktive opportunities uten oppdatert neste handling blir fort usynlig revenue leakage.",
      action: ADVANCE_ACTION[input.pipelineId],
      desiredOutcome: "Alle aktive saker får en konkret neste handling, eier og dato — eller lukkes/parkers eksplisitt.",
      autonomy: "prepare",
    });
  }

  const midFunnel = input.qualificationOpportunities + input.considerationOpportunities;
  if (midFunnel > 0 && input.staleOpportunities === 0) {
    missions.push({
      id: `director:${input.brandId}:advance`,
      brandId: input.brandId,
      pipelineId: input.pipelineId,
      role: "sales_sdr",
      kind: "advance_pipeline",
      priority: "MEDIUM",
      title: `Flytt ${midFunnel} mid-funnel opportunities fremover`,
      reason: "Pipeline har aktive kvalifiserings-/consideration-saker og ingen registrert stagnasjon. Neste mål er stage progression, ikke mer tilfeldig aktivitet.",
      action: ADVANCE_ACTION[input.pipelineId],
      desiredOutcome: "Øk stage progression med dokumenterte kundesignaler, ikke kunstig stage-pushing.",
      autonomy: "prepare",
    });
  }

  if ((input.deliveryRetentionOpportunities || 0) > 0) {
    missions.push({
      id: `director:${input.brandId}:retain`,
      brandId: input.brandId,
      pipelineId: input.pipelineId,
      role: "customer_success",
      kind: "retain_expand",
      priority: "LOW",
      title: `${input.deliveryRetentionOpportunities} kunder/lesere/publikum i delivery eller retention`,
      reason: "Revenue- og brandverdi stopper ikke ved første conversion. Retention, referrals, repeat purchase og expansion skal ha egen kapasitet.",
      action: "Klargjør relevant oppfølging basert på faktisk resultat, kjøp, bruk eller engagement — ikke generisk mas.",
      desiredOutcome: "Øk retention, gjenkjøp, referral eller relevant expansion uten å skade tillit.",
      autonomy: "prepare",
    });
  }

  return missions;
}

export function rankDirectorMissions(missions: DirectorMission[]) {
  const weight = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 } as const;
  return [...missions].sort((a, b) => weight[b.priority] - weight[a.priority] || a.title.localeCompare(b.title, "nb"));
}
