import {
  BaseAgent,
  AgentTask,
  ExecutionResult,
  NORWEGIAN_CONTENT_RULES,
  CLEAN_OUTPUT_RULES,
} from "./base-agent";

// ─── Domain Module Definitions ───────────────────────────────────────

export interface DomainModule {
  name: string;
  keywords: string[];
  expertise: string[];
  systemContext: string;
}

export interface DomainDetectionResult {
  domain: string;
  confidence: number;
  matchedKeywords: string[];
}

export interface CrossBrandNarrative {
  overarching_theme: string;
  domain_stories: Record<string, string>;
  connection_points: string[];
  unified_message: string;
  content_calendar: Array<{
    week: number;
    domain: string;
    content: string;
    platform: string;
  }>;
}

// ─── Domain Modules ──────────────────────────────────────────────────

const DOMAIN_MODULES: Record<string, DomainModule> = {
  real_estate: {
    name: "Eiendom",
    keywords: [
      "eiendom", "bolig", "leilighet", "hus", "tomt", "megler", "megling",
      "visning", "boligpris", "boligmarked", "utleie", "leie", "selge",
      "kjøpe", "boliglån", "takst", "verdivurdering", "prospekt",
      "eiendomsmegler", "boligkjøp", "boligsalg", "nabolag", "bydel",
    ],
    expertise: [
      "eiendomsmarkedsanalyse",
      "boligverdivurdering",
      "eiendomsmarkedsføring",
      "utleieoptimalisering",
      "eiendomsutvikling",
    ],
    systemContext: `EIENDOMSEKSPERTISE:
- Dyp kunnskap om det norske eiendomsmarkedet, prisutvikling og trender.
- Forståelse av Plan- og bygningsloven, Eiendomsmeglingsloven og Avhendingsloven.
- Kunnskap om boligfinansiering, skatteregler og dokumentavgift.
- Erfaring med digital markedsføring av eiendom (Finn.no, sosiale medier, Google).
- Innsikt i byggeteknikk, energimerking og tilstandsrapporter.
- Lokalkunnskap om norske byer og regioner.`,
  },

  saas: {
    name: "SaaS & Teknologi",
    keywords: [
      "saas", "software", "app", "plattform", "abonnement", "subscription",
      "api", "integrasjon", "onboarding", "churn", "mrr", "arr",
      "konvertering", "freemium", "trial", "brukeropplevelse", "ux",
      "teknologi", "startup", "skalering", "produkt", "feature",
    ],
    expertise: [
      "SaaS-vekststrategi",
      "produktledert vekst (PLG)",
      "SaaS-metrikker og KPI-er",
      "kundelivstidsverdi (CLV)",
      "churn-reduksjon",
    ],
    systemContext: `SAAS-EKSPERTISE:
- Dyp forståelse av SaaS-forretningsmodeller og metrikker (MRR, ARR, CAC, LTV, Churn).
- Ekspertise i produktledet vekst (PLG) og brukeronboarding.
- Kunnskap om norsk teknologiøkosystem og startup-miljø.
- Erfaring med prisstrategi for abonnementsmodeller.
- Innsikt i skaleringsutfordringer og teknisk arkitektur.
- B2B og B2C SaaS-markedsføring i nordiske markeder.`,
  },

  agriculture: {
    name: "Landbruk & Matproduksjon",
    keywords: [
      "landbruk", "gård", "jord", "avling", "husdyr", "økologisk",
      "bærekraftig", "matproduksjon", "kornproduksjon", "melk",
      "kjøtt", "grønnsaker", "frukt", "skog", "skogbruk",
      "jordbruk", "agritech", "presisjonsjordbruk", "gårdsbutikk",
    ],
    expertise: [
      "landbruksstrategi",
      "bærekraftig matproduksjon",
      "agritech-innovasjon",
      "gårdsdrift-optimalisering",
      "direktesalg og gårdsbutikk",
    ],
    systemContext: `LANDBRUKSEKSPERTISE:
- Kunnskap om norsk landbruk, jordbrukspolitikk og støtteordninger.
- Forståelse av bærekraftig matproduksjon og økologisk landbruk.
- Innsikt i agritech-trender og presisjonsjordbruk.
- Erfaring med direktesalg, gårdsbutikker og Reko-ringer.
- Kunnskap om norske sesongvariasjoner og vekstsoner.
- Forståelse av EU/EØS-regelverk og norske jordbruksavtaler.`,
  },

  personal_brand: {
    name: "Personlig Merkevare",
    keywords: [
      "personlig merkevare", "personal brand", "influencer", "tankeleder",
      "thought leader", "synlighet", "profil", "foredrag", "foredragsholder",
      "ekspert", "autoritet", "nettverk", "linkedin", "omdømme",
      "selvpresentasjon", "karriere", "mentor", "coaching",
    ],
    expertise: [
      "personlig merkevarbygging",
      "tankelederskap og posisjonering",
      "nettverksbygging",
      "digital tilstedeværelse",
      "foredrag og presentasjoner",
    ],
    systemContext: `PERSONLIG MERKEVARE-EKSPERTISE:
- Strategisk bygging av personlig merkevare i norsk næringsliv.
- LinkedIn-optimalisering og innholdsstrategi for tankelederskap.
- Posisjonering som ekspert og autoritet innen ditt felt.
- Foredragsteknikk og presentasjonsdesign.
- Nettverksbygging og relasjonsutvikling.
- Autentisk storytelling som bygger tillit og troverdighet.
- Balansere synlighet med norsk forretningskultur og Janteloven.`,
  },

  music: {
    name: "Musikk & Underholdning",
    keywords: [
      "musikk", "artist", "låt", "singel", "album", "konsert", "festival",
      "streaming", "spotify", "tidal", "plateselskap", "produsent",
      "låtskriver", "musikkbransjen", "booking", "manager", "promotering",
      "musikkproduksjon", "beat", "studio", "innspilling",
    ],
    expertise: [
      "musikkmarkedsføring",
      "artist-branding",
      "streaming-strategi",
      "konsertpromotering",
      "musikkbransje-navigering",
    ],
    systemContext: `MUSIKKEKSPERTISE:
- Kunnskap om den norske musikkbransjen og internasjonale markeder.
- Streaming-strategi for Spotify, Tidal, Apple Music og YouTube Music.
- Artist-branding og visuell identitet.
- Sosiale medier-strategi for musikkartister (TikTok, Instagram, YouTube).
- Konsert- og festivalpromotering i Norge og Norden.
- Forståelse av rettighetshåndtering, TONO, Gramo og FONO.
- Innsikt i Kulturrådet, Fond for lyd og bilde og andre støtteordninger.`,
  },
};

// ─── Multi-Domain Expert Agent ───────────────────────────────────────

export class MultiDomainExpertAgent extends BaseAgent {
  private domains: Record<string, DomainModule>;
  private activeDomain: DomainModule | null = null;

  constructor() {
    super("Freddy Business Navigator", "Multi-Domain Business Expert", [
      "cross-domain strategy",
      "business navigation",
      "domain-specific expertise",
      "integrated brand building",
      "multi-vertical growth",
    ]);

    this.domains = DOMAIN_MODULES;
  }

  protected getAvailableTasks(): string[] {
    return [
      "create_content",
      "analyze_market",
      "optimize_sales",
      "seo_strategy",
      "cross_brand_narrative",
    ];
  }

  /**
   * Detects the most relevant domain from text input.
   */
  detectDomain(text: string): DomainDetectionResult {
    const lowerText = text.toLowerCase();
    const scores: Array<{ domain: string; score: number; matched: string[] }> = [];

    for (const [key, module] of Object.entries(this.domains)) {
      const matched = module.keywords.filter((kw) => lowerText.includes(kw));
      scores.push({
        domain: key,
        score: matched.length,
        matched,
      });
    }

    scores.sort((a, b) => b.score - a.score);
    const best = scores[0];

    if (best.score > 0) {
      this.activeDomain = this.domains[best.domain];
    }

    return {
      domain: best.domain,
      confidence: best.score > 3 ? 1.0 : best.score > 1 ? 0.7 : best.score > 0 ? 0.4 : 0,
      matchedKeywords: best.matched,
    };
  }

  /**
   * Manually sets the active domain.
   */
  setDomain(domainKey: string): void {
    if (this.domains[domainKey]) {
      this.activeDomain = this.domains[domainKey];
    } else {
      throw new Error(
        `Unknown domain: ${domainKey}. Available: ${Object.keys(this.domains).join(", ")}`
      );
    }
  }

  /**
   * Returns the list of available domains.
   */
  getAvailableDomains(): string[] {
    return Object.keys(this.domains);
  }

  private getSystemPrompt(domain?: DomainModule): string {
    const activeDom = domain ?? this.activeDomain;

    const domainContext = activeDom
      ? `\nAKTIVT DOMENE: ${activeDom.name}\n${activeDom.systemContext}\n`
      : `\nDu opererer på tvers av alle domener. Identifiser det mest relevante domenet basert på konteksten.\n`;

    return `Du er ${this.name}, en AI-forretningsnavigator med ekspertise på tvers av flere bransjer og domener.

DINE DOMENER:
${Object.values(this.domains)
  .map((d) => `- ${d.name}: ${d.expertise.join(", ")}`)
  .join("\n")}

${domainContext}

MULTI-DOMENE TILNÆRMING:
1. Identifiser relevant domene basert på kontekst og nøkkelord.
2. Bruk domenespesifikk ekspertise for dype, presise anbefalinger.
3. Se etter kryss-domene synergier og muligheter.
4. Tilpass strategi til norske markedsforhold i hvert domene.
5. Bygg en helhetlig merkevarefortelling som binder domenene sammen.
6. Lever handlingsbare strategier med konkrete neste steg.

TVERRGÅENDE KOMPETANSER:
- Digital markedsføring tilpasset hvert domene
- Forretningsmodell-design og verdiskaping
- Strategisk posisjonering i det norske markedet
- Innholdsstrategi på tvers av plattformer
- Nettverksbygging og partnerskap på tvers av bransjer

${NORWEGIAN_CONTENT_RULES}
${CLEAN_OUTPUT_RULES}`;
  }

  async executeTasks(tasks: AgentTask[]): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];

    for (const task of tasks) {
      const start = Date.now();
      task.status = "in_progress";

      // Auto-detect domain from task description if not already set
      if (!this.activeDomain && task.description) {
        this.detectDomain(task.description);
      }

      try {
        let output: string;

        switch (task.name) {
          case "create_content":
            output = await this.createContent(task.parameters ?? {});
            break;
          case "analyze_market":
            output = await this.analyzeMarketForDomain(task.parameters ?? {});
            break;
          case "optimize_sales":
            output = await this.optimizeSales(task.parameters ?? {});
            break;
          case "seo_strategy":
            output = await this.seoStrategy(task.parameters ?? {});
            break;
          case "cross_brand_narrative":
            output = await this.crossBrandNarrative(task.parameters ?? {});
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
    // Auto-detect domain from data
    const dataString = JSON.stringify(data);
    if (!this.activeDomain) {
      this.detectDomain(dataString);
    }

    const domainName = this.activeDomain?.name ?? "generell forretning";

    const prompt = `Analyser følgende data med fokus på ${domainName}:

Data:
${JSON.stringify(data, null, 2)}

Gi en analyse som inkluderer:
1. Domenespesifikke innsikter
2. Trender og mønstre relevante for ${domainName}
3. Muligheter for vekst og forbedring
4. Konkrete anbefalinger tilpasset domenet
5. Eventuelle kryss-domene muligheter`;

    return this.callAI(prompt, this.getSystemPrompt());
  }

  async generateRecommendations(context: Record<string, unknown>): Promise<string> {
    const contextString = JSON.stringify(context);
    if (!this.activeDomain) {
      this.detectDomain(contextString);
    }

    const prompt = `Generer strategiske anbefalinger basert på konteksten:

Kontekst:
${JSON.stringify(context, null, 2)}

Aktivt domene: ${this.activeDomain?.name ?? "Multi-domene"}

Gi anbefalinger som dekker:
1. Domenespesifikke tiltak
2. Kryss-domene synergier
3. Prioriterte handlinger med tidslinje
4. Ressursbehov og forventet avkastning
5. Risikofaktorer og mitigering`;

    return this.callAI(prompt, this.getSystemPrompt());
  }

  // ─── Task-specific methods ──────────────────────────────────────────

  private async createContent(params: Record<string, unknown>): Promise<string> {
    const topic = (params.topic as string) ?? "";
    const platform = (params.platform as string) ?? "LinkedIn";
    const contentType = (params.content_type as string) ?? "innlegg";
    const domainKey = params.domain as string | undefined;

    if (domainKey) {
      this.setDomain(domainKey);
    } else if (topic) {
      this.detectDomain(topic);
    }

    const domain = this.activeDomain;

    const prompt = `Lag ${contentType} for ${platform} om følgende tema:

Tema: ${topic}
Domene: ${domain?.name ?? "Generelt"}
Plattform: ${platform}
Innholdstype: ${contentType}

Lever innholdet som JSON:
{
  "content": "Selve innholdet klart til publisering",
  "headline": "Overskrift/hook",
  "hashtags": ["relevante hashtags"],
  "cta": "Call-to-action",
  "best_posting_time": "Anbefalt publiseringstidspunkt",
  "engagement_hooks": ["Elementer som driver engasjement"],
  "domain_relevance": "Hvordan innholdet knytter seg til ${domain?.name ?? "forretning"}",
  "visual_suggestions": ["Forslag til visuelt innhold"]
}`;

    return this.callAI(prompt, this.getSystemPrompt());
  }

  private async analyzeMarketForDomain(
    params: Record<string, unknown>
  ): Promise<string> {
    const domainKey = (params.domain as string) ?? "";
    const focus = (params.focus as string) ?? "helhetlig markedsanalyse";

    if (domainKey && this.domains[domainKey]) {
      this.setDomain(domainKey);
    }

    const domain = this.activeDomain;

    const prompt = `Utfør en markedsanalyse for ${domain?.name ?? "valgt domene"}:

Fokusområde: ${focus}
Domene: ${domain?.name ?? "Generelt"}
Ekspertise: ${domain?.expertise.join(", ") ?? "Bred forretningserfaring"}

Gi en analyse som JSON:
{
  "market_overview": "Overordnet markedsbeskrivelse",
  "size_and_growth": "Markedsstørrelse og veksttakt",
  "key_trends": [
    {
      "trend": "...",
      "impact": "høy|middels|lav",
      "timeline": "..."
    }
  ],
  "competitive_landscape": {
    "leaders": ["..."],
    "challengers": ["..."],
    "opportunities": ["..."]
  },
  "customer_insights": {
    "segments": ["..."],
    "needs": ["..."],
    "pain_points": ["..."]
  },
  "recommendations": [
    {
      "action": "...",
      "priority": "høy|middels|lav",
      "expected_impact": "..."
    }
  ]
}`;

    return this.callAI(prompt, this.getSystemPrompt());
  }

  private async optimizeSales(params: Record<string, unknown>): Promise<string> {
    const domainKey = (params.domain as string) ?? "";
    const currentPerformance = params.current_performance
      ? JSON.stringify(params.current_performance)
      : "Ikke oppgitt";

    if (domainKey && this.domains[domainKey]) {
      this.setDomain(domainKey);
    }

    const domain = this.activeDomain;

    const prompt = `Optimaliser salgsstrategi for ${domain?.name ?? "virksomheten"}:

Nåværende resultater: ${currentPerformance}
Domene: ${domain?.name ?? "Generelt"}

Gi salgoptimaliseringsforslag som JSON:
{
  "current_assessment": "Vurdering av nåværende salg",
  "quick_wins": ["Tiltak som kan implementeres umiddelbart"],
  "medium_term": ["Tiltak for neste 3-6 måneder"],
  "long_term": ["Strategiske tiltak for 6-12 måneder"],
  "sales_scripts": {
    "cold_outreach": "...",
    "follow_up": "...",
    "closing": "..."
  },
  "pricing_optimization": {
    "current_assessment": "...",
    "recommendations": ["..."]
  },
  "domain_specific_tactics": ["Taktikker spesifikke for ${domain?.name ?? "domenet"}"]
}`;

    return this.callAI(prompt, this.getSystemPrompt());
  }

  private async seoStrategy(params: Record<string, unknown>): Promise<string> {
    const domainKey = (params.domain as string) ?? "";
    const currentSEO = params.current_seo
      ? JSON.stringify(params.current_seo)
      : "Ikke kartlagt";

    if (domainKey && this.domains[domainKey]) {
      this.setDomain(domainKey);
    }

    const domain = this.activeDomain;

    const prompt = `Lag SEO-strategi for ${domain?.name ?? "virksomheten"}:

Nåværende SEO-status: ${currentSEO}
Domene: ${domain?.name ?? "Generelt"}
Domenespesifikke søkeord: ${domain?.keywords.slice(0, 10).join(", ") ?? "Generelle"}

Lever som JSON:
{
  "keyword_strategy": {
    "primary_keywords": ["..."],
    "long_tail": ["..."],
    "local_keywords": ["..."],
    "domain_specific": ["..."]
  },
  "content_plan": [
    {
      "topic": "...",
      "target_keyword": "...",
      "content_type": "...",
      "priority": "høy|middels|lav"
    }
  ],
  "technical_seo": ["Tekniske anbefalinger"],
  "link_building": ["Lenkebyggingsstrategier for ${domain?.name ?? "domenet"}"],
  "local_seo": ["Lokal SEO-tiltak"],
  "timeline": {
    "month_1_3": ["..."],
    "month_4_6": ["..."],
    "month_7_12": ["..."]
  }
}`;

    return this.callAI(prompt, this.getSystemPrompt());
  }

  private async crossBrandNarrative(
    params: Record<string, unknown>
  ): Promise<string> {
    const activeDomains = (params.domains as string[]) ?? Object.keys(this.domains);
    const brandOwner = (params.brand_owner as string) ?? "Freddy";
    const overarchingGoal = (params.goal as string) ?? "Bygge en sterk personlig merkevare på tvers av domener";

    const domainDetails = activeDomains
      .filter((d) => this.domains[d])
      .map((d) => `- ${this.domains[d].name}: ${this.domains[d].expertise.join(", ")}`)
      .join("\n");

    const prompt = `Lag en kryss-merke-narrativ for ${brandOwner}:

Aktive domener:
${domainDetails}

Overordnet mål: ${overarchingGoal}

Lever som JSON:
{
  "overarching_theme": "Den røde tråden som binder alt sammen",
  "brand_story": "Den overordnede merkevarehistorien",
  "domain_stories": {
    ${activeDomains
      .filter((d) => this.domains[d])
      .map((d) => `"${d}": "Historien for ${this.domains[d].name}"`)
      .join(",\n    ")}
  },
  "connection_points": ["Hvordan domenene styrker hverandre"],
  "unified_message": "Ett budskap som fungerer på tvers",
  "content_calendar": [
    {
      "week": 1,
      "domain": "...",
      "content": "...",
      "platform": "...",
      "cross_reference": "Referanse til annet domene"
    }
  ],
  "synergy_opportunities": [
    {
      "domains": ["domene1", "domene2"],
      "opportunity": "...",
      "strategy": "..."
    }
  ]
}`;

    return this.callAI(prompt, this.getSystemPrompt());
  }
}
