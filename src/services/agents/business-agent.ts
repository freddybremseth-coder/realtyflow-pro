import {
  BaseAgent,
  AgentTask,
  ExecutionResult,
  NORWEGIAN_CONTENT_RULES,
  CLEAN_OUTPUT_RULES,
} from "./base-agent";

// ─── Business-specific interfaces ────────────────────────────────────

export interface GrowthStrategy {
  phase: string;
  objective: string;
  key_initiatives: string[];
  resources_needed: string[];
  timeline: string;
  success_metrics: string[];
  risks: string[];
}

export interface MarketPositioning {
  current_position: string;
  target_position: string;
  unique_value_proposition: string;
  competitive_advantages: string[];
  positioning_statement: string;
  key_differentiators: string[];
}

export interface PartnershipOpportunity {
  partner_type: string;
  potential_partners: string[];
  value_exchange: string;
  approach_strategy: string;
  expected_outcome: string;
  risk_level: "low" | "medium" | "high";
}

export interface MarketAnalysis {
  market_size: string;
  growth_rate: string;
  key_players: string[];
  entry_barriers: string[];
  opportunities: string[];
  threats: string[];
}

// ─── Business Agent ──────────────────────────────────────────────────

export class BusinessAgent extends BaseAgent {
  constructor() {
    super("Morgan Business Strategist", "Business Strategy & Growth Specialist", [
      "growth strategy",
      "market positioning",
      "competitive analysis",
      "partnership development",
    ]);
  }

  protected getAvailableTasks(): string[] {
    return [
      "develop_growth_strategy",
      "analyze_market",
      "create_positioning",
      "identify_partnerships",
    ];
  }

  private getSystemPrompt(): string {
    return `Du er ${this.name}, en elite AI-forretningsstrateg med rollen "${this.role}".

DINE KJERNEKOMPETANSER:
- Vekststrategi og skalering for norske virksomheter
- Markedsposisjonering og differensiering i konkurranseutsatte markeder
- Konkurranseanalyse med dybdeforståelse av norsk næringsliv
- Partnerskapsutvikling og strategiske allianser
- Forretningsmodell-innovasjon og verdiskaping
- Finansiell analyse og investeringsstrategi
- Organisasjonsutvikling og teambygging

STRATEGISKE PRINSIPPER:
1. Data-drevne beslutninger basert på markedsinnsikt.
2. Bærekraftig vekst fremfor kortsiktig gevinst.
3. Kundesentrert strategi - alt starter med kundens behov.
4. Skalerbare forretningsmodeller med tydelige konkurransefortrinn.
5. Risikobalansert tilnærming med tydelige scenarioanalyser.
6. Partnerskap og økosystem-tenkning for akselerert vekst.
7. Innovasjon som strategisk verktøy, ikke bare buzzword.

NORSKE FORRETNINGSHENSYN:
- Norsk arbeidsmiljølov og regulatoriske rammer
- Høyt kostnadsnivå krever effektive forretningsmodeller
- Sterk fagforeningskultur og medbestemmelse
- Bærekraft og ESG er forretningskritisk i Norge
- Digitalisering og teknologiadopsjon i norsk næringsliv
- Nordiske verdier: tillit, åpenhet, flat organisasjonsstruktur
- Innovasjon Norge, Forskningsrådet og andre virkemidler
- Norsk skattesystem og selskapsformer (AS, ENK, NUF)

${NORWEGIAN_CONTENT_RULES}
${CLEAN_OUTPUT_RULES}`;
  }

  async executeTasks(tasks: AgentTask[]): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];

    for (const task of tasks) {
      const start = Date.now();
      task.status = "in_progress";

      try {
        let output: string;

        switch (task.name) {
          case "develop_growth_strategy":
            output = await this.developGrowthStrategy(task.parameters ?? {});
            break;
          case "analyze_market":
            output = await this.analyzeMarket(task.parameters ?? {});
            break;
          case "create_positioning":
            output = await this.createPositioning(task.parameters ?? {});
            break;
          case "identify_partnerships":
            output = await this.identifyPartnerships(task.parameters ?? {});
            break;
          default:
            throw new Error(`Unknown task: ${task.name}`);
        }

        task.status = "completed";
        task.result = output;

        results.push({
          agentName: this.name,
          taskName: task.name,
          status: "success",
          output,
          duration: Date.now() - start,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        task.status = "failed";
        const errorMsg = error instanceof Error ? error.message : "Unknown error";

        results.push({
          agentName: this.name,
          taskName: task.name,
          status: "error",
          output: errorMsg,
          duration: Date.now() - start,
          timestamp: new Date().toISOString(),
        });
      }
    }

    return results;
  }

  async analyzeData(data: Record<string, unknown>): Promise<string> {
    const prompt = `Analyser følgende forretningsdata og gi strategiske innsikter:

Data:
${JSON.stringify(data, null, 2)}

Inkluder:
1. SWOT-analyse basert på dataene
2. Nøkkeltrender og mønstre
3. Strategiske muligheter og trusler
4. Benchmarking mot bransjestandard
5. Handlingsanbefalinger med prioritering`;

    return this.callAI(prompt, this.getSystemPrompt());
  }

  async generateRecommendations(context: Record<string, unknown>): Promise<string> {
    const prompt = `Basert på følgende forretningskontekst, generer strategiske anbefalinger:

Kontekst:
${JSON.stringify(context, null, 2)}

Gi anbefalinger som dekker:
1. Kortsiktige tiltak (0-3 måneder)
2. Mellomlangsiktige strategier (3-12 måneder)
3. Langsiktig visjon (1-3 år)
4. Ressursallokering og prioritering
5. Risikohåndtering og scenarioplanlegging
6. KPI-er og milepæler`;

    return this.callAI(prompt, this.getSystemPrompt());
  }

  // ─── Task-specific methods ──────────────────────────────────────────

  private async developGrowthStrategy(
    params: Record<string, unknown>
  ): Promise<string> {
    const businessType = (params.business_type as string) ?? "eiendomsmegling";
    const currentRevenue = (params.current_revenue as string) ?? "Ikke oppgitt";
    const growthTarget = (params.growth_target as string) ?? "50% vekst neste 12 måneder";
    const resources = (params.available_resources as string) ?? "Ikke oppgitt";
    const constraints = (params.constraints as string) ?? "Ikke oppgitt";

    const prompt = `Utvikle en vekststrategi for følgende virksomhet:

Virksomhetstype: ${businessType}
Nåværende omsetning: ${currentRevenue}
Vekstmål: ${growthTarget}
Tilgjengelige ressurser: ${resources}
Begrensninger: ${constraints}

Lever strategien som JSON:
{
  "executive_summary": "Kort oppsummering av strategien",
  "growth_phases": [
    {
      "phase": "Fase 1: Grunnlag",
      "objective": "Hovedmål for fasen",
      "key_initiatives": ["Konkrete tiltak"],
      "resources_needed": ["Nødvendige ressurser"],
      "timeline": "Tidslinje",
      "success_metrics": ["KPI-er"],
      "risks": ["Risikoer og mitigeringsstrategier"]
    }
  ],
  "revenue_model": {
    "current_streams": ["..."],
    "new_streams": ["..."],
    "pricing_strategy": "..."
  },
  "investment_priorities": [
    {
      "area": "...",
      "amount": "...",
      "expected_roi": "...",
      "timeline": "..."
    }
  ],
  "key_milestones": [
    {
      "milestone": "...",
      "target_date": "...",
      "success_criteria": "..."
    }
  ]
}`;

    return this.callAI(prompt, this.getSystemPrompt());
  }

  private async analyzeMarket(params: Record<string, unknown>): Promise<string> {
    const industry = (params.industry as string) ?? "eiendom";
    const region = (params.region as string) ?? "Norge";
    const segment = (params.segment as string) ?? "alle segmenter";

    const prompt = `Utfør en markedsanalyse for:

Bransje: ${industry}
Region: ${region}
Segment: ${segment}

Gi en detaljert analyse som JSON:
{
  "market_overview": {
    "market_size": "Estimert markedsstørrelse",
    "growth_rate": "Vekstrate",
    "maturity": "Innledende|Vekst|Modent|Nedgang",
    "key_drivers": ["Vekstdrivere"]
  },
  "key_players": [
    {
      "name": "Aktørnavn",
      "market_share": "Estimert andel",
      "strengths": ["..."],
      "weaknesses": ["..."]
    }
  ],
  "customer_segments": [
    {
      "segment": "...",
      "size": "...",
      "needs": ["..."],
      "willingness_to_pay": "..."
    }
  ],
  "entry_barriers": ["..."],
  "regulatory_landscape": "...",
  "technology_trends": ["..."],
  "opportunities": [
    {
      "opportunity": "...",
      "potential": "høy|middels|lav",
      "timing": "..."
    }
  ],
  "threats": [
    {
      "threat": "...",
      "severity": "høy|middels|lav",
      "mitigation": "..."
    }
  ]
}`;

    return this.callAI(prompt, this.getSystemPrompt());
  }

  private async createPositioning(params: Record<string, unknown>): Promise<string> {
    const company = (params.company as string) ?? "Vår virksomhet";
    const industry = (params.industry as string) ?? "eiendom";
    const targetMarket = (params.target_market as string) ?? "norske forbrukere";
    const currentPerception = (params.current_perception as string) ?? "Ikke kartlagt";
    const competitors = params.competitors
      ? JSON.stringify(params.competitors)
      : "Ikke spesifisert";

    const prompt = `Utvikle en markedsposisjoneringstrategi:

Selskap: ${company}
Bransje: ${industry}
Målmarked: ${targetMarket}
Nåværende oppfatning: ${currentPerception}
Hovedkonkurrenter: ${competitors}

Lever som JSON:
{
  "positioning_analysis": {
    "current_position": "Beskrivelse av nåværende posisjon",
    "target_position": "Ønsket posisjon",
    "gap_analysis": "Hva som må endres"
  },
  "unique_value_proposition": "Tydelig verdiforslag",
  "positioning_statement": "For [målgruppe] som [behov], er [selskap] den [kategori] som [differensiator], fordi [grunn til å tro].",
  "competitive_advantages": ["Konkurransefortrinn"],
  "key_differentiators": ["Differensiatorer"],
  "messaging_framework": {
    "tagline": "...",
    "elevator_pitch": "...",
    "key_messages": {
      "primary": "...",
      "secondary": ["..."],
      "proof_points": ["..."]
    }
  },
  "brand_personality": {
    "traits": ["..."],
    "tone_of_voice": "...",
    "visual_direction": "..."
  },
  "implementation_plan": [
    {
      "phase": "...",
      "actions": ["..."],
      "timeline": "..."
    }
  ]
}`;

    return this.callAI(prompt, this.getSystemPrompt());
  }

  private async identifyPartnerships(
    params: Record<string, unknown>
  ): Promise<string> {
    const businessType = (params.business_type as string) ?? "eiendomsmegling";
    const goals = (params.partnership_goals as string) ?? "vekst og nye markedssegmenter";
    const currentPartners = params.current_partners
      ? JSON.stringify(params.current_partners)
      : "Ingen nåværende partnere oppgitt";

    const prompt = `Identifiser strategiske partnerskapsmuligheter:

Virksomhetstype: ${businessType}
Partnerskapsmål: ${goals}
Nåværende partnere: ${currentPartners}

Gi en partnerskapsstrategi som JSON:
{
  "partnership_opportunities": [
    {
      "partner_type": "Type partner (teknologi, distribusjon, innhold, etc.)",
      "potential_partners": ["Konkrete forslag"],
      "value_exchange": "Hva begge parter får ut av samarbeidet",
      "approach_strategy": "Hvordan etablere kontakt og forhandle",
      "expected_outcome": "Forventede resultater",
      "risk_level": "low|medium|high"
    }
  ],
  "partnership_framework": {
    "evaluation_criteria": ["Kriterier for å vurdere partnere"],
    "deal_structures": ["Mulige avtalestrukturer"],
    "governance_model": "Styringsmodell for partnerskap"
  },
  "ecosystem_map": {
    "core_partners": ["Strategisk viktige"],
    "supporting_partners": ["Operasjonelle partnere"],
    "innovation_partners": ["Partnere for utvikling og innovasjon"]
  },
  "action_plan": [
    {
      "step": 1,
      "action": "...",
      "timeline": "...",
      "responsible": "..."
    }
  ]
}`;

    return this.callAI(prompt, this.getSystemPrompt());
  }

  /**
   * Generates a SWOT analysis for a given business context.
   */
  async generateSWOT(
    businessContext: Record<string, unknown>
  ): Promise<string> {
    const prompt = `Lag en SWOT-analyse basert på følgende kontekst:

${JSON.stringify(businessContext, null, 2)}

Returner som JSON:
{
  "strengths": ["Interne styrker"],
  "weaknesses": ["Interne svakheter"],
  "opportunities": ["Ytre muligheter"],
  "threats": ["Ytre trusler"],
  "strategic_implications": {
    "so_strategies": ["Strategier som utnytter styrker for å gripe muligheter"],
    "wo_strategies": ["Strategier som adresserer svakheter for å utnytte muligheter"],
    "st_strategies": ["Strategier som bruker styrker for å motvirke trusler"],
    "wt_strategies": ["Strategier som minimerer svakheter og unngår trusler"]
  }
}`;

    return this.callAI(prompt, this.getSystemPrompt());
  }
}
