import {
  BaseAgent,
  AgentTask,
  ExecutionResult,
  ContentStrategy,
  NORWEGIAN_CONTENT_RULES,
  CLEAN_OUTPUT_RULES,
} from "./base-agent";

// ─── Marketing-specific interfaces ───────────────────────────────────

export interface CampaignStrategy {
  name: string;
  objective: string;
  channels: string[];
  budget_allocation: Record<string, number>;
  timeline: string;
  kpis: string[];
  content_plan: ContentStrategy[];
}

export interface MarketTrend {
  trend: string;
  relevance: "high" | "medium" | "low";
  opportunity: string;
  recommended_action: string;
}

export interface ContentMixRecommendation {
  content_type: string;
  percentage: number;
  rationale: string;
  examples: string[];
}

// ─── Marketing Agent ─────────────────────────────────────────────────

export class MarketingAgent extends BaseAgent {
  private brandContext: string;

  constructor(brandContext?: string) {
    super("Alex Marketing Pro", "Marketing Strategist", [
      "viral content",
      "social media strategy",
      "campaign optimization",
      "audience targeting",
    ]);

    this.brandContext = brandContext ?? "";
  }

  protected getAvailableTasks(): string[] {
    return [
      "analyze_market_trends",
      "create_campaign_strategy",
      "optimize_content_mix",
      "identify_opportunities",
      "create_content",
    ];
  }

  private getSystemPrompt(): string {
    return `Du er ${this.name}, en elite AI-markedsføringsagent med rollen "${this.role}".

DINE KJERNEKOMPETANSER:
- Viral innholdsstrategi og innholdsproduksjon
- Sosiale medier-strategi på tvers av plattformer (Instagram, Facebook, LinkedIn, TikTok, YouTube)
- Kampanjeoptimalisering med datadrevne beslutninger
- Målgruppeanalyse og segmentering
- A/B-testing og konverteringsoptimalisering
- Merkevarebygging og posisjonering i det norske markedet

ARBEIDSMETODE:
1. Analyser alltid markedsdata og trender før du gir anbefalinger.
2. Baser strategier på norske markedsforhold og forbrukeratferd.
3. Inkluder alltid målbare KPI-er i dine forslag.
4. Prioriter organisk vekst kombinert med målrettet betalt markedsføring.
5. Tilpass innhold til hver plattforms unike egenskaper og algoritmer.

${this.brandContext ? `MERKEVARE-KONTEKST:\n${this.brandContext}\n` : ""}
${NORWEGIAN_CONTENT_RULES}
${CLEAN_OUTPUT_RULES}

Når du gir svar, strukturer dem tydelig med handlingsbare punkter og konkrete forslag.`;
  }

  async executeTasks(tasks: AgentTask[]): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];

    for (const task of tasks) {
      const start = Date.now();
      task.status = "in_progress";

      try {
        let output: string;

        switch (task.name) {
          case "analyze_market_trends":
            output = await this.analyzeMarketTrends(task.parameters ?? {});
            break;
          case "create_campaign_strategy":
            output = await this.createCampaignStrategy(task.parameters ?? {});
            break;
          case "optimize_content_mix":
            output = await this.optimizeContentMix(task.parameters ?? {});
            break;
          case "identify_opportunities":
            output = await this.identifyOpportunities(task.parameters ?? {});
            break;
          case "create_content":
            output = await this.createContent(task.parameters ?? {});
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
    const prompt = `Analyser følgende markedsdata og gi innsiktsfulle observasjoner:

Data:
${JSON.stringify(data, null, 2)}

Gi en analyse som inkluderer:
1. Hovedfunn og trender
2. Styrker og svakheter i nåværende strategi
3. Muligheter for forbedring
4. Konkrete anbefalinger med prioritering`;

    return this.callAI(prompt, this.getSystemPrompt());
  }

  async generateRecommendations(context: Record<string, unknown>): Promise<string> {
    const prompt = `Basert på følgende kontekst, generer markedsføringsanbefalinger:

Kontekst:
${JSON.stringify(context, null, 2)}

Gi konkrete, handlingsbare anbefalinger som inkluderer:
1. Prioriterte tiltak (kortsiktig og langsiktig)
2. Forventede resultater for hvert tiltak
3. Ressursbehov og budsjettestimat
4. Tidslinje for implementering
5. Suksesskriterier og KPI-er`;

    return this.callAI(prompt, this.getSystemPrompt());
  }

  // ─── Task-specific methods ──────────────────────────────────────────

  private async analyzeMarketTrends(
    params: Record<string, unknown>
  ): Promise<string> {
    const industry = (params.industry as string) ?? "eiendom";
    const region = (params.region as string) ?? "Norge";
    const timeframe = (params.timeframe as string) ?? "neste 6 måneder";

    const prompt = `Analyser de viktigste markedstrendene for ${industry}-bransjen i ${region} for ${timeframe}.

Inkluder:
1. Topp 5 trender med relevans-vurdering (høy/middels/lav)
2. For hver trend: mulighet og anbefalt handling
3. Risikovurdering og potensielle utfordringer
4. Konkurrentlandskap og posisjoneringsmuligheter
5. Teknologiske trender som påvirker bransjen

Returner svaret som ren JSON med følgende struktur:
{
  "trends": [
    {
      "trend": "...",
      "relevance": "high|medium|low",
      "opportunity": "...",
      "recommended_action": "..."
    }
  ],
  "summary": "...",
  "risk_factors": ["..."]
}`;

    return this.callAI(prompt, this.getSystemPrompt());
  }

  private async createCampaignStrategy(
    params: Record<string, unknown>
  ): Promise<string> {
    const goal = (params.goal as string) ?? "øke merkevarebevissthet";
    const budget = (params.budget as number) ?? 50000;
    const duration = (params.duration as string) ?? "3 måneder";
    const targetAudience = (params.target_audience as string) ?? "norske boligkjøpere 25-45 år";

    const prompt = `Lag en komplett kampanjestrategi med følgende parametere:

Mål: ${goal}
Budsjett: ${budget} NOK
Varighet: ${duration}
Målgruppe: ${targetAudience}

Strategien skal inkludere:
1. Kampanjenavn og overordnet konsept
2. Kanalvalg med budsjettfordeling (prosent per kanal)
3. Innholdsplan med publiseringsfrekvens per kanal
4. Tidslinje med milepæler
5. KPI-er med konkrete måltall
6. A/B-test-plan for optimalisering
7. Innholdsstrategi per kanal (tone, format, frekvens)

Returner som JSON:
{
  "name": "...",
  "objective": "...",
  "channels": ["..."],
  "budget_allocation": {"kanal": prosent},
  "timeline": "...",
  "kpis": ["..."],
  "content_plan": [
    {
      "tone": "...",
      "target_audience": "...",
      "key_messages": ["..."],
      "cta": "...",
      "hashtags": ["..."],
      "estimated_reach": 0
    }
  ]
}`;

    return this.callAI(prompt, this.getSystemPrompt());
  }

  private async optimizeContentMix(
    params: Record<string, unknown>
  ): Promise<string> {
    const currentMix = params.current_mix
      ? JSON.stringify(params.current_mix)
      : "Ikke spesifisert";
    const goals = (params.goals as string) ?? "øke engasjement og rekkevidde";
    const platform = (params.platform as string) ?? "alle plattformer";

    const prompt = `Optimaliser innholdsmiksen for ${platform} med mål om å ${goals}.

Nåværende innholdsmiks: ${currentMix}

Gi anbefalinger for:
1. Optimal fordeling av innholdstyper (video, bilde, tekst, karusell, stories, reels)
2. Publiseringsfrekvens og beste tidspunkter
3. Innholdspilarer og tematisk fordeling
4. Engasjementstaktikker per innholdstype
5. Gjenbruksstrategi for innhold på tvers av plattformer

Returner som JSON:
{
  "recommendations": [
    {
      "content_type": "...",
      "percentage": 0,
      "rationale": "...",
      "examples": ["..."]
    }
  ],
  "posting_schedule": {...},
  "content_pillars": ["..."]
}`;

    return this.callAI(prompt, this.getSystemPrompt());
  }

  private async identifyOpportunities(
    params: Record<string, unknown>
  ): Promise<string> {
    const businessType = (params.business_type as string) ?? "eiendomsmegling";
    const currentChannels = params.current_channels
      ? JSON.stringify(params.current_channels)
      : "Ikke spesifisert";
    const competitorInfo = params.competitors
      ? JSON.stringify(params.competitors)
      : "Ikke spesifisert";

    const prompt = `Identifiser markedsføringsmuligheter for en ${businessType}-virksomhet.

Nåværende kanaler: ${currentChannels}
Konkurrentinformasjon: ${competitorInfo}

Analyser og presenter:
1. Uutnyttede markedsføringsmuligheter (topp 5)
2. Lav-kostnad, høy-effekt-tiltak
3. Samarbeidsmuligheter og partnerskap
4. Nye plattformer eller kanaler å utforske
5. Sesongbaserte muligheter for de neste 12 månedene
6. Innholdsformat-muligheter (podcast, webinar, e-bok, osv.)

For hver mulighet, angi:
- Potensiell ROI (lav/middels/høy)
- Implementeringskompleksitet (lav/middels/høy)
- Estimert tid til resultater
- Nødvendige ressurser`;

    return this.callAI(prompt, this.getSystemPrompt());
  }

  private async createContent(
    params: Record<string, unknown>
  ): Promise<string> {
    const topic = (params.topic as string) ?? "";
    const platform = (params.platform as string) ?? "instagram,facebook";
    const contentType = (params.content_type as string) ?? "post";
    const tone = (params.tone as string) ?? "profesjonell";
    const audience = (params.audience as string) ?? "";
    const brand = (params.brand as string) ?? "";
    const language = (params.language as string) ?? "no";

    const platforms = platform.split(",").map((p: string) => p.trim());

    const prompt = `Lag ${contentType}-innhold for følgende plattformer: ${platforms.join(", ")}

TEMA/PROMPT:
${topic}

${audience ? `MÅLGRUPPE: ${audience}` : ""}
${brand ? `MERKEVARE: ${brand}` : ""}
TONE: ${tone}
SPRÅK: ${language === "no" ? "Norsk" : "Engelsk"}

Lag engasjerende, publiseringsklart innhold. For hver plattform, tilpass formatet:
${platforms.includes("instagram") ? "- Instagram: Kort, visuell tekst med emojier og hashtags. Maks 2200 tegn." : ""}
${platforms.includes("facebook") ? "- Facebook: Litt lengre, konverserende tone. Inkluder call-to-action." : ""}
${platforms.includes("linkedin") ? "- LinkedIn: Profesjonell tone, innsiktsfull vinkling. Inkluder relevante hashtags." : ""}
${platforms.includes("tiktok") ? "- TikTok: Kort, fengende hook. Trendy språk." : ""}

Formater svaret tydelig med overskrift per plattform.
Skriv innholdet direkte - ikke legg til meta-kommentarer eller forklaringer.`;

    return this.callAI(prompt, this.getSystemPrompt());
  }

  /**
   * Sets or updates the brand context used in system prompts.
   */
  setBrandContext(context: string): void {
    this.brandContext = context;
  }

  /**
   * Generates a content strategy for a specific campaign or product.
   */
  async generateContentStrategy(
    product: string,
    audience: string,
    channels: string[]
  ): Promise<ContentStrategy> {
    const prompt = `Lag en innholdsstrategi for følgende:

Produkt/tjeneste: ${product}
Målgruppe: ${audience}
Kanaler: ${channels.join(", ")}

Returner KUN gyldig JSON med denne strukturen:
{
  "tone": "...",
  "target_audience": "...",
  "key_messages": ["melding1", "melding2", "melding3"],
  "cta": "...",
  "hashtags": ["#tag1", "#tag2"],
  "estimated_reach": 0
}`;

    const response = await this.callAI(prompt, this.getSystemPrompt());
    return this.parseJSON<ContentStrategy>(response);
  }
}
