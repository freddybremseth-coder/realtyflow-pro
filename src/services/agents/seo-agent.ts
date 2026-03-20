import {
  BaseAgent,
  AgentTask,
  ExecutionResult,
  NORWEGIAN_CONTENT_RULES,
  CLEAN_OUTPUT_RULES,
} from "./base-agent";

// ─── SEO-specific interfaces ─────────────────────────────────────────

export interface KeywordResearch {
  primary_keyword: string;
  secondary_keywords: string[];
  long_tail_keywords: string[];
  search_volume_estimate: string;
  difficulty: "low" | "medium" | "high";
  intent: "informational" | "navigational" | "transactional" | "commercial";
  recommended_content_type: string;
}

export interface OnPageSEO {
  title_tag: string;
  meta_description: string;
  h1: string;
  h2_suggestions: string[];
  internal_links: string[];
  schema_markup_type: string;
  content_recommendations: string[];
}

export interface CompetitorSEOAnalysis {
  competitor: string;
  estimated_authority: "low" | "medium" | "high";
  top_keywords: string[];
  content_gaps: string[];
  backlink_strategy: string;
  vulnerabilities: string[];
}

export interface LinkBuildingStrategy {
  strategy_name: string;
  description: string;
  target_sites: string[];
  outreach_template: string;
  estimated_difficulty: "low" | "medium" | "high";
  expected_domain_authority_impact: string;
}

// ─── SEO Agent ───────────────────────────────────────────────────────

export class SEOAgent extends BaseAgent {
  constructor() {
    super("Sam SEO Expert", "SEO & Organic Growth Specialist", [
      "keyword research",
      "on-page SEO",
      "competition analysis",
      "link building",
    ]);
  }

  protected getAvailableTasks(): string[] {
    return [
      "keyword_research",
      "optimize_for_seo",
      "analyze_competition",
      "create_link_strategy",
    ];
  }

  private getSystemPrompt(): string {
    return `Du er ${this.name}, en elite AI SEO-agent med rollen "${this.role}".

DINE KJERNEKOMPETANSER:
- Søkeordanalyse og research for det norske markedet
- On-page SEO-optimalisering (titler, meta, struktur, intern lenking)
- Konkurrentanalyse og gap-analyse for organisk synlighet
- Lenkebyggingsstrategi tilpasset norske nettsteder og domener
- Teknisk SEO (Core Web Vitals, strukturert data, crawlability)
- Lokal SEO for norske virksomheter (Google Business Profile, lokale kataloger)
- Content SEO - optimalisering av innhold for både søkemotorer og brukere

SEO-PRINSIPPER:
1. Kvalitetsinnhold som svarer på brukerens intensjon kommer alltid først.
2. E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness) er grunnlaget.
3. Norsk søkeadferd skiller seg fra engelskspråklige markeder.
4. Google.no og norske søkevaner krever lokal tilpasning.
5. Mobiloptimalisering er kritisk - majoriteten søker fra mobil.
6. Strukturert data (schema.org) gir konkurransefortrinn i SERP.
7. Intern lenkestruktur er ofte undervurdert men svært effektivt.
8. Sidetitler og metabeskrivelser skal optimaliseres for CTR i SERP.

NORSKE SEO-HENSYN:
- Bruk norske søkeord, ikke engelske oversettelser.
- Forstå forskjellen mellom bokmål og nynorsk i søk.
- Norske brukere søker annerledes enn engelskspråklige.
- Lokale søk er svært viktige (bynavn, kommuner, regioner).
- Finn.no dominerer mange vertikaler - ta hensyn til dette.
- Norske lenkekilder (nettaviser, bransjesider, kataloger).

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
          case "keyword_research":
            output = await this.keywordResearch(task.parameters ?? {});
            break;
          case "optimize_for_seo":
            output = await this.optimizeForSEO(task.parameters ?? {});
            break;
          case "analyze_competition":
            output = await this.analyzeCompetition(task.parameters ?? {});
            break;
          case "create_link_strategy":
            output = await this.createLinkStrategy(task.parameters ?? {});
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
    const prompt = `Analyser følgende SEO-data og gi innsikt:

Data:
${JSON.stringify(data, null, 2)}

Inkluder:
1. Organisk synlighet og rangeringsposisjon-analyse
2. Søkeordsprestasjon og muligheter
3. Tekniske SEO-problemer funnet
4. Innholdshuller sammenlignet med konkurrenter
5. Prioriterte tiltak for forbedret organisk trafikk`;

    return this.callAI(prompt, this.getSystemPrompt());
  }

  async generateRecommendations(context: Record<string, unknown>): Promise<string> {
    const prompt = `Basert på følgende SEO-kontekst, generer anbefalinger:

Kontekst:
${JSON.stringify(context, null, 2)}

Gi anbefalinger for:
1. Umiddelbare tekniske fikser (quick wins)
2. Innholdsstrategi for organisk vekst
3. Søkeordsprioriteringer de neste 3-6 månedene
4. Lenkebygingsstrategi
5. Lokal SEO-optimalisering
6. Strukturert data-implementering`;

    return this.callAI(prompt, this.getSystemPrompt());
  }

  // ─── Task-specific methods ──────────────────────────────────────────

  private async keywordResearch(params: Record<string, unknown>): Promise<string> {
    const topic = (params.topic as string) ?? "eiendomsmegling";
    const location = (params.location as string) ?? "Norge";
    const intent = (params.intent as string) ?? "alle";
    const count = (params.count as number) ?? 20;

    const prompt = `Utfør søkeordanalyse for følgende:

Tema: ${topic}
Lokasjon: ${location}
Søkeintensjonsfilter: ${intent}
Antall søkeord ønsket: ${count}

Gi en komplett søkeordanalyse som JSON:
{
  "primary_keywords": [
    {
      "keyword": "...",
      "search_volume_estimate": "høy|middels|lav",
      "difficulty": "low|medium|high",
      "intent": "informational|navigational|transactional|commercial",
      "recommended_content_type": "bloggpost|landingsside|produktside|guide"
    }
  ],
  "long_tail_keywords": [
    {
      "keyword": "...",
      "parent_keyword": "...",
      "intent": "...",
      "opportunity_score": "høy|middels|lav"
    }
  ],
  "question_keywords": ["Spørsmål folk stiller om temaet"],
  "seasonal_trends": [
    {
      "keyword": "...",
      "peak_months": ["..."],
      "strategy": "..."
    }
  ],
  "content_clusters": [
    {
      "pillar_topic": "...",
      "supporting_keywords": ["..."],
      "content_plan": "..."
    }
  ]
}`;

    return this.callAI(prompt, this.getSystemPrompt());
  }

  private async optimizeForSEO(params: Record<string, unknown>): Promise<string> {
    const url = (params.url as string) ?? "";
    const targetKeyword = (params.target_keyword as string) ?? "";
    const currentTitle = (params.current_title as string) ?? "";
    const contentType = (params.content_type as string) ?? "bloggpost";

    const prompt = `Optimaliser følgende side for SEO:

URL: ${url || "Ikke oppgitt"}
Mål-søkeord: ${targetKeyword || "Ikke oppgitt"}
Nåværende tittel: ${currentTitle || "Ikke oppgitt"}
Innholdstype: ${contentType}

Gi optimalisering som JSON:
{
  "on_page": {
    "title_tag": "Optimalisert tittel (maks 60 tegn)",
    "meta_description": "Optimalisert metabeskrivelse (maks 155 tegn)",
    "h1": "Optimalisert H1",
    "h2_suggestions": ["Foreslåtte H2-overskrifter"],
    "internal_links": ["Sider det bør lenkes til internt"],
    "schema_markup_type": "Anbefalt schema-type",
    "content_recommendations": ["Innholdsanbefalinger"]
  },
  "technical": {
    "url_suggestion": "Optimalisert URL-slug",
    "image_alt_texts": ["Foreslåtte alt-tekster"],
    "structured_data": "JSON-LD schema-anbefaling",
    "page_speed_tips": ["Tips for lastetid"]
  },
  "content_brief": {
    "word_count_target": 0,
    "topics_to_cover": ["Emner som bør dekkes"],
    "questions_to_answer": ["Spørsmål innholdet bør svare på"],
    "competitor_advantages": ["Hva konkurrentene gjør som du bør matche/overgå"]
  }
}`;

    return this.callAI(prompt, this.getSystemPrompt());
  }

  private async analyzeCompetition(params: Record<string, unknown>): Promise<string> {
    const competitors = params.competitors
      ? JSON.stringify(params.competitors)
      : "Ikke spesifisert";
    const targetKeywords = params.target_keywords
      ? JSON.stringify(params.target_keywords)
      : "Ikke spesifisert";
    const industry = (params.industry as string) ?? "eiendom";

    const prompt = `Utfør en SEO-konkurrentanalyse:

Konkurrenter: ${competitors}
Mål-søkeord: ${targetKeywords}
Bransje: ${industry}

Gi en analyse som JSON:
{
  "competitor_analysis": [
    {
      "competitor": "Konkurrentnavn",
      "estimated_authority": "low|medium|high",
      "top_keywords": ["Søkeord de rangerer for"],
      "content_gaps": ["Innhold vi kan lage som de mangler"],
      "backlink_strategy": "Beskrivelse av deres lenkeprofil",
      "vulnerabilities": ["Svakheter vi kan utnytte"]
    }
  ],
  "opportunities": [
    {
      "keyword": "...",
      "difficulty": "...",
      "current_top_result_weakness": "...",
      "our_angle": "..."
    }
  ],
  "content_gap_analysis": {
    "topics_competitors_cover": ["..."],
    "topics_nobody_covers_well": ["..."],
    "our_unique_angles": ["..."]
  },
  "action_plan": [
    {
      "priority": 1,
      "action": "...",
      "expected_impact": "...",
      "timeframe": "..."
    }
  ]
}`;

    return this.callAI(prompt, this.getSystemPrompt());
  }

  private async createLinkStrategy(params: Record<string, unknown>): Promise<string> {
    const domain = (params.domain as string) ?? "";
    const industry = (params.industry as string) ?? "eiendom";
    const budget = (params.budget as string) ?? "middels";
    const currentLinks = (params.current_backlinks as number) ?? 0;

    const prompt = `Lag en lenkebyggingsstrategi:

Domene: ${domain || "Ikke oppgitt"}
Bransje: ${industry}
Budsjett: ${budget}
Nåværende antall backlinks: ${currentLinks}

Gi en strategi som JSON:
{
  "strategies": [
    {
      "strategy_name": "Strateginavn",
      "description": "Detaljert beskrivelse",
      "target_sites": ["Nettsteder å kontakte"],
      "outreach_template": "Mal for henvendelse",
      "estimated_difficulty": "low|medium|high",
      "expected_domain_authority_impact": "Forventet effekt"
    }
  ],
  "norwegian_link_sources": {
    "news_media": ["Relevante norske nettaviser"],
    "industry_directories": ["Bransjespesifikke kataloger"],
    "local_directories": ["Lokale kataloger og oppføringer"],
    "partnership_opportunities": ["Samarbeidspartnere for gjesteblogging osv."]
  },
  "content_for_links": [
    {
      "content_type": "...",
      "topic": "...",
      "link_magnet_angle": "Hvorfor folk vil lenke til dette"
    }
  ],
  "monthly_plan": {
    "month_1": ["Tiltak"],
    "month_2": ["Tiltak"],
    "month_3": ["Tiltak"]
  }
}`;

    return this.callAI(prompt, this.getSystemPrompt());
  }

  /**
   * Generates an optimized meta description for a given page.
   */
  async generateMetaDescription(
    pageTitle: string,
    targetKeyword: string,
    pageContent: string
  ): Promise<string> {
    const prompt = `Lag en SEO-optimalisert metabeskrivelse:

Sidetittel: ${pageTitle}
Mål-søkeord: ${targetKeyword}
Sideinnhold (sammendrag): ${pageContent.substring(0, 500)}

Krav:
- Maks 155 tegn
- Inkluder mål-søkeordet naturlig
- Inkluder en call-to-action
- Skriv på norsk

Returner KUN metabeskrivelsen, ingen annen tekst.`;

    return this.callAI(prompt, this.getSystemPrompt());
  }
}
