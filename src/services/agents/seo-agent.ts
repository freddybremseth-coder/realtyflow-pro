import { readGSCAllBrands } from "./seo-search-console";
import { getSEOLeadSignals, type SEOLeadSummary } from "./seo-leads";
import { SEO_SKILLS, SEO_SENIOR_OPERATING_RULES } from "./seo-skills";
import { auditSEOPortfolio, type SiteAudit } from "./seo-audit";
import { getSEOObservedSignals } from "./seo-data";
import {
  BaseAgent,
  AgentTask,
  ExecutionResult,
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
      "read-only portfolio SEO analytics and AEO/GEO improvement reviews",
      ...SEO_SKILLS.map(skill => skill.id),
    ]);
  }

  protected getAvailableTasks(): string[] {
    return [
      "keyword_research",
      "optimize_for_seo",
      "analyze_competition",
      "create_link_strategy",
      "portfolio_growth_review",
      "technical_portfolio_audit",
    ];
  }

  private getSystemPrompt(): string {
    return `Du er ${this.name}, spesialist i senior SEO, AEO og GEO med rollen "${this.role}".
${SEO_SENIOR_OPERATING_RULES}
KOMPETANSE- OG TILGANGSKATALOG: ${JSON.stringify(SEO_SKILLS)}


DINE KJERNEKOMPETANSER:
- Søkeordanalyse for Norge og de faktiske språkene og geografiske markedene til hvert merke
- On-page SEO-optimalisering (titler, meta, struktur, intern lenking)
- Konkurrentanalyse og gap-analyse for organisk synlighet
- Lenkebyggingsstrategi tilpasset norske nettsteder og domener
- Teknisk SEO (Core Web Vitals, strukturert data, crawlability)
- Lokal SEO for norske virksomheter (Google Business Profile, lokale kataloger)
- Content SEO - optimalisering av innhold for både søkemotorer og brukere
- AEO/GEO - direkte svar på brukerens spørsmål, tydelig fakta- og kildegrunnlag, intern lenking, forfatteransvar, korrekt canonical/hreflang og crawlbar HTML.
- RealtyFlow portfolio-data: Bruk alltid verifiserte målinger med tidsperiode og brand-id, og skill måledata fra ideer og AI-estimater.
- RealtyFlows search_discovery_events teller kun kjente søke-/AI-henvisninger til nettstedene. De sier INGENTING om søkeord, visninger, rangering, Search Console-klikk eller AI-siteringer. Oppgi disse som utilgjengelige inntil reelle målekilder er koblet til.
- Ved 0 observerte hendelser: rapporter datakilde-/sporingskontroll og avstå fra vekstprosent eller bastante SEO-konklusjoner.
- Autonomi: Analyser og lag forslag kontinuerlig, men ikke publiser, endre nettsider, bygg lenker, send meldinger eller bruk betalingsressurser uten egen godkjent publiserings-/endringsflyt.

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
          case "portfolio_growth_review":
            output = await this.portfolioGrowthReview();
            break;
          case "technical_portfolio_audit":
            output = JSON.stringify(await auditSEOPortfolio());
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

  /**
   * Reads the real first-party SEO/AI referral table at execution time.
   * Produces read-only proposals. Execution/publication remains separately gated.
   */
  async portfolioGrowthReview(
    inputs: { signals?: Awaited<ReturnType<typeof getSEOObservedSignals>>; audits?: SiteAudit[]; leads?: SEOLeadSummary; searchConsole?: Awaited<ReturnType<typeof readGSCAllBrands>> } = {},
  ): Promise<string> {
    // One read per review, not two shifting windows or duplicate external calls.
    const [signals, audits, leads, searchConsole] = await Promise.all([
      inputs.signals ? Promise.resolve(inputs.signals) : getSEOObservedSignals(),
      inputs.audits ? Promise.resolve(inputs.audits) : auditSEOPortfolio(),
      inputs.leads ? Promise.resolve(inputs.leads) : getSEOLeadSignals(),
      inputs.searchConsole ? Promise.resolve(inputs.searchConsole) : readGSCAllBrands(),
    ]);
    const verifiedFindings = audits.flatMap(site =>
      site.observations.map(observation => "[" + site.brandId + "] " + observation)
    );
    const unavailable = audits.flatMap(site =>
      site.limitations.filter(message => !message.startsWith("Homepage/robots/sitemap snapshot"))
        .map(message => "[" + site.brandId + "] " + message)
    );
    const verifiedGSC = searchConsole.filter(item => item.status === "connected" && item.result !== null);
    if ((signals.totals.current === 0 || signals.dataQuality.truncated) && verifiedGSC.length === 0) {
      return [
        "Sam SEO: teknisk kontroll av åtte offentlige nettsteder og RealtyFlows målte henvisninger.",
        "Målte søke-/AI-henvisninger siste 30 dager: " + signals.totals.current + ". Dette er ikke et mål på total søketrafikk.",
        "Målte henvendelser fra website_lead-arbeidsoppgaver siste 30 dager: " + leads.totals.current + ". Disse er ikke dokumenterte organiske søkeleads eller unike kunder.",
        "Henvendelser med verifisert kildeside: " + leads.dataQuality.leadsWithPage + "; uten: " + leads.dataQuality.leadsWithoutPage + ". " + leads.dataQuality.note,
        signals.dataQuality.truncated
          ? "Henvisningsdataene er avkortet ved 10 000 rader. Ingen pålitelig fullstendig tidsseriesammenligning."
          : "Ingen målte henvisninger i gjeldende vindu. Sporings- og datakildekontroll må prioriteres, ikke oppdiktede søkeord eller vekstprosent.",
        "Tekniske observasjoner fra offentlig nettstedskontroll:",
        ...(verifiedFindings.length ? verifiedFindings : ["Ingen konkrete avvik i de avgrensede HTTP-kontrollene. Det beviser ikke at nettstedene er ferdig optimalisert."]),
        ...(unavailable.length ? ["Utilgjengelige kontroller:", ...unavailable] : []),
        "Search Console-tilkobling: " + searchConsole.map(item => item.brandId + "=" + item.status).join(", ") + ".",
        "Neste tiltak: verifiser virkelig søke-/AI-henvisningssporing, koble til godkjente Google Search Console- og Bing Webmaster-kilder for søkeord og ytelse, og undersøk hvert dokumenterte tekniske avvik før publisering.",
        "Gjennomgangen er kun en anbefalingsrapport. Ingen endringer på nettstedene ble publisert.",
      ].join("\n");
    }

    return this.callAI([
      "Utfør en profesjonell, databasert forbedringsgjennomgang for de åtte porteføljenettstedene.",
      "Kun observasjoner med dokumentert kilde og dato får presenteres som fakta.",
      "Henvisninger må ikke blandes med Search Console-visninger, søkeord, posisjoner eller verifiserte AI-siteringer.",
      "Vurder 30 dager mot foregående 30 per merke. Ved små tall: synliggjør usikkerhet og unngå bastante konklusjoner.",
      "Teknisk audit omfatter kun hjem, robots, sitemap og inntil tre offentlig oppførte undersider per domene, ikke full crawl eller render. En mislykket request er 'ukjent', ikke en dokumentert SEO-feil.",
      "Foreslå inntil åtte konkrete QA-sikre forbedringer med brand, URL der observert, kilde, handling, akseptansekriterier og måling etter 30 dager.",
      "Velg relevante seniorkompetanser i SEO_SKILLS, men ikke simuler behovsstyrte connectors eller påstå en endring er publisert.",
      "Dette er gjennomgangsforslag; alle live endringer krever separat godkjenning.",
      "Google Search Console gir målte GSC-klikk, visninger, CTR, gjennomsnittsposisjon og søkeord KUN når status er connected og result ikke null. Perioder og måledefinisjoner står i hver enkelt result. Ikke bland GSC-klikk med nettstedssesjoner eller lead-konverteringer.",
      "Hvis Search Console er tilkoblet: se etter sider med mange dokumenterte visninger og lav CTR, faktisk nedgang i klikk, og relevante søk med tydelig brukerintensjon; lag etterprøvbare forbedringsforslag for eksisterende side, CTA og internlenking. Ingen garanterte forbedringer og ingen automatisk publisering.",
      "Søkekonsollstatus og målte data per merke: " + JSON.stringify(searchConsole),
      "Henvisningsdata: " + JSON.stringify(signals),
      "Nettsidehenvendelser, KUN aggregater uten persondata: " + JSON.stringify(leads),
      "Besøk og henvendelser har ingen verifisert felles session-ID. Du kan ikke beregne ekte organisk konverteringsrate eller tilskrive Google et lead basert på URL alene.",
      "Teknisk audit: " + JSON.stringify(audits),
    ].join("\n"), this.getSystemPrompt());
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

Dette er forslag til mulige søkefraser, ikke søkeord målt i Search Console og ikke verifisert søkevolum. Ikke oppgi anslåtte søkevolum, søkeordvanskelighet, SERP-rangeringer eller sesongtopper uten faktisk oppgitt/verifisert datakilde.
Gi søkefrase- og intensjonshypoteser som JSON:
{
  "primary_keywords": [
    {
      "keyword": "...",
      "search_volume_estimate": "utilgjengelig uten verifisert ekstern volumkilde",
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
