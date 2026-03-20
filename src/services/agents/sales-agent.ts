import {
  BaseAgent,
  AgentTask,
  ExecutionResult,
  NORWEGIAN_CONTENT_RULES,
  CLEAN_OUTPUT_RULES,
} from "./base-agent";

// ─── Sales-specific interfaces ───────────────────────────────────────

export interface SalesCopy {
  headline: string;
  subheadline: string;
  body: string;
  cta: string;
  urgency_element: string;
  social_proof: string;
  objection_handlers: string[];
}

export interface FunnelStage {
  stage: "awareness" | "interest" | "consideration" | "decision" | "action";
  content: string;
  conversion_trigger: string;
  follow_up: string;
  estimated_conversion_rate: number;
}

export interface ConversionAnalysis {
  current_rate: number;
  bottlenecks: string[];
  recommendations: string[];
  projected_improvement: number;
  priority_actions: string[];
}

export interface UrgencyStrategy {
  type: "scarcity" | "time_limited" | "social_proof" | "exclusive";
  message: string;
  duration: string;
  expected_uplift: number;
}

// ─── Sales Agent ─────────────────────────────────────────────────────

export class SalesAgent extends BaseAgent {
  constructor() {
    super("Jordan Sales Master", "Sales & Conversion Specialist", [
      "sales copy",
      "conversion optimization",
      "funnel design",
      "urgency creation",
    ]);
  }

  protected getAvailableTasks(): string[] {
    return [
      "create_sales_copy",
      "optimize_funnel",
      "analyze_conversion",
      "create_urgency",
    ];
  }

  private getSystemPrompt(): string {
    return `Du er ${this.name}, en elite AI-salgsagent med rollen "${this.role}".

DINE KJERNEKOMPETANSER:
- Overbevisende salgstekst som konverterer, tilpasset norsk marked
- Konverteringsoptimalisering basert på psykologiske prinsipper (Cialdini, etc.)
- Salgsfunnel-design fra bevissthet til handling
- Urgency- og scarcity-taktikker som er etiske og effektive
- Innvendingshåndtering og tillitsbygging
- Oppfølgingsstrategier og lead nurturing

SALGSPRINSIPPER:
1. Alltid lead med verdi, ikke med funksjoner.
2. Bruk sosial bevisføring og testimonials strategisk.
3. Skap genuin urgency uten å være manipulativ.
4. Adresser innvendinger proaktivt i salgsteksten.
5. Optimér for hele kundereisen, ikke bare klikk.
6. A/B-test alltid overskrifter, CTA-er og urgency-elementer.
7. Bygg tillit gjennom åpenhet og troverdighet.
8. Tilpass språk og tone til norsk forretningskultur.

NORSKE MARKEDSHENSYN:
- Nordmenn verdsetter ærlighet og underdrivelse fremfor aggressivt salg.
- Janteloven påvirker hvordan budskap mottas - vær selvsikker men ikke skrytete.
- Tillit bygges gjennom kompetanse og pålitelighet, ikke hype.
- Bruk referanser og case-studier fra norske virksomheter.

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
          case "create_sales_copy":
            output = await this.createSalesCopy(task.parameters ?? {});
            break;
          case "optimize_funnel":
            output = await this.optimizeFunnel(task.parameters ?? {});
            break;
          case "analyze_conversion":
            output = await this.analyzeConversion(task.parameters ?? {});
            break;
          case "create_urgency":
            output = await this.createUrgency(task.parameters ?? {});
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
    const prompt = `Analyser følgende salgsdata og gi handlingsbare innsikter:

Data:
${JSON.stringify(data, null, 2)}

Inkluder i analysen:
1. Konverteringsrate-analyse per steg i salgstrakten
2. Identifisering av flaskehalser og drop-off-punkter
3. Kundeatferdsmønstre og segmentering
4. Forbedringspotensial med estimerte tall
5. Prioriterte tiltak for økt konvertering`;

    return this.callAI(prompt, this.getSystemPrompt());
  }

  async generateRecommendations(context: Record<string, unknown>): Promise<string> {
    const prompt = `Basert på følgende salgskontekst, generer optimaliseringsanbefalinger:

Kontekst:
${JSON.stringify(context, null, 2)}

Gi anbefalinger for:
1. Salgstekst-forbedringer (overskrifter, CTA-er, body copy)
2. Funnel-optimalisering per steg
3. Urgency- og scarcity-taktikker
4. Innvendingshåndtering
5. Oppfølgingsstrategi for leads
6. A/B-test-forslag med hypoteser`;

    return this.callAI(prompt, this.getSystemPrompt());
  }

  // ─── Task-specific methods ──────────────────────────────────────────

  private async createSalesCopy(params: Record<string, unknown>): Promise<string> {
    const product = (params.product as string) ?? "eiendomstjeneste";
    const audience = (params.audience as string) ?? "norske boligkjøpere";
    const tone = (params.tone as string) ?? "profesjonell og tillitsvekkende";
    const platform = (params.platform as string) ?? "landingsside";

    const prompt = `Lag overbevisende salgstekst for følgende:

Produkt/tjeneste: ${product}
Målgruppe: ${audience}
Tone: ${tone}
Plattform: ${platform}

Lever salgsteksten som JSON:
{
  "headline": "Kraftfull overskrift som fanger oppmerksomhet",
  "subheadline": "Støttende undertekst som bygger på overskriften",
  "body": "Hoveddel med verdifokusert salgstekst (3-5 avsnitt)",
  "cta": "Handlingsfremmende CTA-tekst",
  "urgency_element": "Urgency/scarcity-element",
  "social_proof": "Sosial bevisføring-element",
  "objection_handlers": ["Innvending 1 + svar", "Innvending 2 + svar", "Innvending 3 + svar"]
}`;

    return this.callAI(prompt, this.getSystemPrompt());
  }

  private async optimizeFunnel(params: Record<string, unknown>): Promise<string> {
    const funnelType = (params.funnel_type as string) ?? "lead generation";
    const currentStages = params.current_stages
      ? JSON.stringify(params.current_stages)
      : "Ikke spesifisert";
    const conversionGoal = (params.conversion_goal as string) ?? "booke visning";

    const prompt = `Optimaliser salgstrakten for følgende scenario:

Type: ${funnelType}
Nåværende steg: ${currentStages}
Konverteringsmål: ${conversionGoal}

Design en optimalisert salgstrakt med JSON-format:
{
  "funnel_stages": [
    {
      "stage": "awareness|interest|consideration|decision|action",
      "content": "Innhold og budskap for dette steget",
      "conversion_trigger": "Hva som driver brukeren videre",
      "follow_up": "Oppfølgingsaksjon hvis brukeren stopper her",
      "estimated_conversion_rate": 0.0
    }
  ],
  "optimization_tips": ["..."],
  "automation_opportunities": ["..."],
  "email_sequences": [
    {
      "trigger": "...",
      "subject": "...",
      "key_message": "..."
    }
  ]
}`;

    return this.callAI(prompt, this.getSystemPrompt());
  }

  private async analyzeConversion(params: Record<string, unknown>): Promise<string> {
    const currentRate = (params.current_rate as number) ?? 0;
    const traffic = (params.monthly_traffic as number) ?? 0;
    const pageType = (params.page_type as string) ?? "landingsside";
    const industry = (params.industry as string) ?? "eiendom";

    const prompt = `Analyser konverteringsdata og gi forbedringsforsla:

Nåværende konverteringsrate: ${currentRate}%
Månedlig trafikk: ${traffic} besøkende
Sidetype: ${pageType}
Bransje: ${industry}

Gi en detaljert konverteringsanalyse som JSON:
{
  "current_rate": ${currentRate},
  "industry_benchmark": 0.0,
  "bottlenecks": ["Identifiserte flaskehalser"],
  "recommendations": [
    {
      "action": "Konkret tiltak",
      "expected_improvement": "Estimert forbedring i prosent",
      "effort": "lav|middels|høy",
      "priority": 1
    }
  ],
  "projected_improvement": 0.0,
  "priority_actions": ["De 3 viktigste tiltakene å starte med"],
  "ab_test_ideas": [
    {
      "hypothesis": "...",
      "variation": "...",
      "metric": "..."
    }
  ]
}`;

    return this.callAI(prompt, this.getSystemPrompt());
  }

  private async createUrgency(params: Record<string, unknown>): Promise<string> {
    const product = (params.product as string) ?? "eiendomstjeneste";
    const urgencyType = (params.type as string) ?? "all";
    const ethicalLevel = (params.ethical_level as string) ?? "høy";

    const prompt = `Lag urgency- og scarcity-strategier for:

Produkt/tjeneste: ${product}
Ønsket urgency-type: ${urgencyType}
Etisk nivå: ${ethicalLevel} (vi ønsker kun ærlige og etiske taktikker)

Gi strategier som JSON:
{
  "strategies": [
    {
      "type": "scarcity|time_limited|social_proof|exclusive",
      "message": "Selve urgency-meldingen",
      "duration": "Hvor lenge den skal vare",
      "expected_uplift": 0.0,
      "ethical_notes": "Hvorfor denne er etisk forsvarlig"
    }
  ],
  "countdown_messages": ["Melding dag 1", "Melding dag 3", "Siste dag"],
  "follow_up_sequence": [
    {
      "timing": "...",
      "message": "...",
      "channel": "..."
    }
  ]
}`;

    return this.callAI(prompt, this.getSystemPrompt());
  }

  /**
   * Generates a complete sales page structure.
   */
  async generateSalesPage(
    product: string,
    audience: string,
    pricePoint: string
  ): Promise<SalesCopy> {
    const prompt = `Lag en komplett salgsside-struktur for:

Produkt: ${product}
Målgruppe: ${audience}
Prispunkt: ${pricePoint}

Returner KUN gyldig JSON:
{
  "headline": "...",
  "subheadline": "...",
  "body": "...",
  "cta": "...",
  "urgency_element": "...",
  "social_proof": "...",
  "objection_handlers": ["...", "...", "..."]
}`;

    const response = await this.callAI(prompt, this.getSystemPrompt());
    return this.parseJSON<SalesCopy>(response);
  }
}
