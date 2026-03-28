import {
  BaseAgent,
  AgentTask,
  ExecutionResult,
  NORWEGIAN_CONTENT_RULES,
  CLEAN_OUTPUT_RULES,
} from "./base-agent";

// ─── CEO Agent ──────────────────────────────────────────────────────

export class CEOAgent extends BaseAgent {
  constructor() {
    super("Victoria CEO", "CEO & Strategisk Leder", [
      "multi-brand strategi",
      "kampanjekoordinering",
      "ytelsesanalyse",
      "innholdskalender",
      "merkevareposisjonering",
      "vekstplanlegging",
      "oppgavedelegering",
    ]);
  }

  protected getAvailableTasks(): string[] {
    return [
      "create_campaign",
      "analyze_performance",
      "plan_content_calendar",
      "brand_strategy",
      "growth_plan",
      "delegate_tasks",
    ];
  }

  private getSystemPrompt(): string {
    return `Du er Victoria, CEO-agent og strategisk leder for et multi-brand selskap. Du koordinerer alle andre agenter og tar strategiske beslutninger.

DINE BRANDS:
- Soleada.no: Premium eiendom i Spania for skandinaviske kjøpere
- Zen Eco Homes: Bærekraftige boliger i Spania
- ChatGenius.pro: AI chatbot-plattform (SaaS)
- Dona Anna: Premium olivenolje og bærekraftig landbruk
- Freddy Bremseth: Personlig merkevare - entreprenør
- Pinoso Ecolife: Landlig bærekraftig bolig
- Neural Beat: AI-drevet EDM-musikk

DITT TEAM AV AGENTER:
- Alex (Marketing): Kampanjer, viral strategi, målgruppeanalyse
- Jordan (Sales): Konvertering, salgstekst, funneloptimalisering
- Sam (SEO): Nøkkelord, søkeoptimalisering, teknisk SEO
- Nova (YouTube): Video-strategi, SEO, thumbnail, retention
- Elena (E-post): E-postanalyse, kundekommunikasjon
- Multi-Domain Expert: Tverrfaglig analyse

PLATTFORMER:
- YouTube: Videoer, Shorts, livestream
- Instagram: Posts, Stories, Reels
- Facebook: Posts, Stories, annonser
- LinkedIn: Artikler, posts, nettverk
- TikTok: Kortvideoer, trender
- Pinterest: Pins, boards (for eiendom og livsstil)

MÅL:
- Øke konverteringer og salg for hver brand
- Bygge merkevarebevissthet og autoritet
- Generere kvalifiserte leads
- Maksimere ROI på innholdsproduksjon
- Skape synergieffekter mellom brands

${NORWEGIAN_CONTENT_RULES}
${CLEAN_OUTPUT_RULES}

DU SVARER PÅ NORSK.`;
  }

  async executeTasks(tasks: AgentTask[]): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];

    for (const task of tasks) {
      const start = Date.now();
      task.status = "in_progress";

      try {
        let output: string;

        switch (task.name) {
          case "create_campaign":
            output = await this.createCampaign(task.parameters ?? {});
            break;
          case "analyze_performance":
            output = await this.analyzePerformance(task.parameters ?? {});
            break;
          case "plan_content_calendar":
            output = await this.planContentCalendar(task.parameters ?? {});
            break;
          case "brand_strategy":
            output = await this.brandStrategy(task.parameters ?? {});
            break;
          case "growth_plan":
            output = await this.growthPlan(task.parameters ?? {});
            break;
          case "delegate_tasks":
            output = await this.delegateTasks(task.parameters ?? {});
            break;
          default:
            // For free-form tasks, use as a general strategic prompt
            output = await this.callAI(
              task.description || task.name,
              this.getSystemPrompt()
            );
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
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error";

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
    const prompt = `Som CEO, analyser følgende forretningsdata på tvers av alle brands og gi strategiske innsikter:

Data:
${JSON.stringify(data, null, 2)}

Gi en strategisk analyse som inkluderer:
1. Overordnet ytelse på tvers av brands
2. Synergieffekter og kryssalg-muligheter
3. Ressursallokering og prioritering
4. Strategiske anbefalinger for neste kvartal
5. Risikofaktorer og tiltak`;

    return this.callAI(prompt, this.getSystemPrompt());
  }

  async generateRecommendations(
    context: Record<string, unknown>
  ): Promise<string> {
    const prompt = `Som CEO, generer strategiske anbefalinger basert på følgende kontekst:

Kontekst:
${JSON.stringify(context, null, 2)}

Gi anbefalinger som inkluderer:
1. Topp 3 prioriterte strategiske initiativer
2. Ressursfordeling mellom brands
3. Tidslinjer og milepæler
4. KPI-er for suksessmåling
5. Delegering til spesifikke agenter i teamet`;

    return this.callAI(prompt, this.getSystemPrompt());
  }

  // ─── Task-specific methods ──────────────────────────────────────────

  private async createCampaign(
    params: Record<string, unknown>
  ): Promise<string> {
    const brandId = (params.brandId as string) ?? "alle";
    const goal = (params.goal as string) ?? "øke synlighet og konverteringer";
    const platforms = (params.platforms as string[]) ?? [
      "youtube",
      "instagram",
      "facebook",
      "linkedin",
      "tiktok",
    ];
    const duration = (params.duration as string) ?? "4 uker";
    const budget = (params.budget as string) ?? "ikke spesifisert";

    const prompt = `Design en komplett multi-plattform kampanje:

Brand: ${brandId}
Mål: ${goal}
Plattformer: ${platforms.join(", ")}
Varighet: ${duration}
Budsjett: ${budget}

Lag en detaljert kampanjeplan som JSON med følgende struktur:
{
  "campaign_name": "...",
  "brand": "${brandId}",
  "goal": "${goal}",
  "duration": "${duration}",
  "platforms": {
    "youtube": { "content_types": [], "frequency": "", "strategy": "" },
    "instagram": { "content_types": [], "frequency": "", "strategy": "" },
    "facebook": { "content_types": [], "frequency": "", "strategy": "" },
    "linkedin": { "content_types": [], "frequency": "", "strategy": "" },
    "tiktok": { "content_types": [], "frequency": "", "strategy": "" }
  },
  "content_themes": ["..."],
  "kpis": { "views": 0, "engagement_rate": 0, "leads": 0, "conversions": 0 },
  "timeline": [
    { "week": 1, "focus": "...", "deliverables": ["..."] }
  ],
  "agent_assignments": {
    "marketing": ["oppgave1"],
    "sales": ["oppgave1"],
    "seo": ["oppgave1"],
    "youtube": ["oppgave1"]
  },
  "budget_allocation": {}
}`;

    return this.callAI(prompt, this.getSystemPrompt());
  }

  private async analyzePerformance(
    params: Record<string, unknown>
  ): Promise<string> {
    const brandId = (params.brandId as string) ?? "alle";
    const period = (params.period as string) ?? "siste 30 dager";
    const metrics = params.metrics
      ? JSON.stringify(params.metrics)
      : "ingen metrikkdata tilgjengelig";

    const prompt = `Analyser ytelsen for ${brandId === "alle" ? "alle brands" : brandId} i perioden ${period}.

Tilgjengelige metrikker:
${metrics}

Gi en CEO-nivå ytelsesanalyse som inkluderer:
1. Overordnet ytelsesoppsummering
2. Topp-presterende innhold og kanaler
3. Underytende områder som trenger oppmerksomhet
4. Trender og mønstre
5. Konkrete forbedringstiltak med prioritering
6. Anbefalte justeringer i strategi
7. Delegering av oppfølgingsoppgaver til teamet

Returner som JSON:
{
  "summary": "...",
  "top_performers": [{ "item": "...", "metric": "...", "value": 0 }],
  "underperformers": [{ "item": "...", "issue": "...", "action": "..." }],
  "trends": ["..."],
  "action_items": [{ "priority": "high|medium|low", "action": "...", "assigned_to": "...", "deadline": "..." }],
  "strategy_adjustments": ["..."]
}`;

    return this.callAI(prompt, this.getSystemPrompt());
  }

  private async planContentCalendar(
    params: Record<string, unknown>
  ): Promise<string> {
    const brandId = (params.brandId as string) ?? "alle";
    const period = (params.period as string) ?? "neste uke";
    const platforms = (params.platforms as string[]) ?? [
      "youtube",
      "instagram",
      "facebook",
      "linkedin",
      "tiktok",
    ];

    const prompt = `Lag en detaljert innholdskalender for ${brandId === "alle" ? "alle brands" : brandId} for ${period}.

Plattformer: ${platforms.join(", ")}

Kalenderen skal inkludere:
1. Spesifikke innholdsstykker for hver dag
2. Plattform-spesifikke tilpasninger
3. Publiseringstidspunkter optimalisert for norsk målgruppe
4. Innholdstyper (video, bilde, tekst, stories, reels)
5. Temaer og nøkkelbudskap
6. Hashtag-strategier per plattform

Returner som JSON:
{
  "period": "${period}",
  "brand": "${brandId}",
  "calendar": [
    {
      "date": "YYYY-MM-DD",
      "day_of_week": "mandag",
      "posts": [
        {
          "platform": "instagram",
          "time": "09:00",
          "content_type": "reel",
          "topic": "...",
          "description": "...",
          "hashtags": ["..."],
          "call_to_action": "...",
          "assigned_agent": "marketing"
        }
      ]
    }
  ],
  "themes_this_period": ["..."],
  "notes": "..."
}`;

    return this.callAI(prompt, this.getSystemPrompt());
  }

  private async brandStrategy(
    params: Record<string, unknown>
  ): Promise<string> {
    const brandId = (params.brandId as string) ?? "alle";
    const focus = (params.focus as string) ?? "posisjonering og differensiering";

    const prompt = `Utvikle eller forbedre merkevarestrategi for ${brandId === "alle" ? "alle brands" : brandId}.

Fokusområde: ${focus}

Strategien skal dekke:
1. Merkevareposisjonering og unik verdiproposisjon (UVP)
2. Målgruppe-segmentering med personas
3. Tone of voice og visuell identitet
4. Konkurransefordeler og differensiering
5. Merkevarebudskap og nøkkelpilarer
6. Synergieffekter med andre brands i porteføljen
7. Langsiktig merkevarevekst-strategi

Returner som JSON:
{
  "brand": "${brandId}",
  "positioning": "...",
  "uvp": "...",
  "target_segments": [
    { "name": "...", "demographics": "...", "needs": ["..."], "channels": ["..."] }
  ],
  "tone_of_voice": "...",
  "key_messages": ["..."],
  "competitive_advantages": ["..."],
  "synergies": ["..."],
  "growth_strategy": "..."
}`;

    return this.callAI(prompt, this.getSystemPrompt());
  }

  private async growthPlan(
    params: Record<string, unknown>
  ): Promise<string> {
    const brandId = (params.brandId as string) ?? "alle";
    const timeframe = (params.timeframe as string) ?? "6 måneder";
    const currentMetrics = params.currentMetrics
      ? JSON.stringify(params.currentMetrics)
      : "ikke tilgjengelig";

    const prompt = `Lag en vekstplan for ${brandId === "alle" ? "hele selskapet" : brandId} over ${timeframe}.

Nåværende metrikker: ${currentMetrics}

Vekstplanen skal inkludere:
1. Overordnede vekstmål med tall
2. Milepæler per måned
3. KPI-er med baseline og måltall
4. Vekststrategier per kanal
5. Ressursbehov og investeringer
6. Risikofaktorer og mottiltak
7. Delegering av ansvar til agenter

Returner som JSON:
{
  "brand": "${brandId}",
  "timeframe": "${timeframe}",
  "goals": [
    { "metric": "...", "current": 0, "target": 0, "growth_percent": 0 }
  ],
  "milestones": [
    { "month": 1, "targets": ["..."], "key_actions": ["..."] }
  ],
  "kpis": [
    { "name": "...", "baseline": 0, "target": 0, "measurement": "..." }
  ],
  "strategies": [
    { "channel": "...", "strategy": "...", "expected_impact": "..." }
  ],
  "resources_needed": ["..."],
  "risks": [
    { "risk": "...", "probability": "high|medium|low", "mitigation": "..." }
  ],
  "agent_responsibilities": {
    "marketing": ["..."],
    "sales": ["..."],
    "seo": ["..."],
    "youtube": ["..."]
  }
}`;

    return this.callAI(prompt, this.getSystemPrompt());
  }

  private async delegateTasks(
    params: Record<string, unknown>
  ): Promise<string> {
    const campaignGoal = (params.goal as string) ?? "generell kampanje";
    const brandId = (params.brandId as string) ?? "alle";
    const context = params.context
      ? JSON.stringify(params.context)
      : "ingen ekstra kontekst";

    const prompt = `Bryt ned følgende kampanjemål til oppgaver som kan delegeres til spesifikke agenter:

Mål: ${campaignGoal}
Brand: ${brandId}
Kontekst: ${context}

For hver oppgave, spesifiser:
1. Hvilken agent som er best egnet
2. Oppgavebeskrivelse
3. Prioritet (høy/middels/lav)
4. Forventede leveranser
5. Avhengigheter mellom oppgaver
6. Tidsfrist

Returner som JSON:
{
  "campaign_goal": "${campaignGoal}",
  "brand": "${brandId}",
  "tasks": [
    {
      "id": "task_1",
      "agent": "marketing|sales|seo|youtube|email|multi-domain",
      "task_name": "...",
      "description": "...",
      "priority": "high|medium|low",
      "deliverables": ["..."],
      "dependencies": [],
      "deadline": "...",
      "estimated_duration": "..."
    }
  ],
  "execution_order": ["task_1", "task_2"],
  "success_criteria": ["..."]
}`;

    return this.callAI(prompt, this.getSystemPrompt());
  }
}
