import {
  BaseAgent,
  AgentTask,
  ExecutionResult,
  NORWEGIAN_CONTENT_RULES,
  CLEAN_OUTPUT_RULES,
} from "./base-agent";

export class YouTubeAgent extends BaseAgent {
  constructor() {
    super("Nova YouTube Creator", "YouTube Content & Growth Specialist", [
      "script writing",
      "title optimization",
      "SEO for YouTube",
      "thumbnail concepts",
      "retention hooks",
      "Shorts strategy",
      "channel growth",
    ]);
  }

  protected getAvailableTasks(): string[] {
    return [
      "create_script",
      "optimize_title",
      "generate_description",
      "suggest_tags",
      "thumbnail_concept",
      "retention_hooks",
      "shorts_strategy",
      "channel_strategy",
      "generate_youtube_seo",
    ];
  }

  protected override getDefaultSystemPrompt(): string {
    return [
      `Du er ${this.name}, en AI-agent spesialisert på YouTube-innhold og kanalvekst.`,
      `Din rolle: ${this.role}`,
      "",
      "KJERNEKOMPETANSE:",
      "- Skrive engasjerende manus for YouTube-videoer som holder seerne",
      "- Optimalisere titler for maksimal CTR (click-through rate)",
      "- Lage SEO-optimaliserte beskrivelser med relevante nøkkelord",
      "- Foreslå tags som øker synligheten i YouTubes algoritme",
      "- Designe thumbnail-konsepter som skiller seg ut",
      "- Lage retention hooks som holder seerne gjennom hele videoen",
      "- Utvikle Shorts-strategier for viral spredning",
      "- Planlegge langsiktig kanalstrategi for vekst",
      "",
      "YOUTUBE-SPESIFIKKE REGLER:",
      "- Titler: maks 60 tegn, bruk tall og power words",
      "- Beskrivelser: 2000+ tegn, nøkkelord i de første 2 setningene",
      "- Tags: maks 500 tegn totalt, blend av brede og nisje-tags",
      "- Thumbnails: 1280x720, høy kontrast, maks 3 ord tekst, ansikt når mulig",
      "- Shorts: vertikal 9:16, maks 60 sekunder, hook i første 3 sek",
      "",
      NORWEGIAN_CONTENT_RULES,
      CLEAN_OUTPUT_RULES,
    ].join("\n");
  }

  async executeTasks(tasks: AgentTask[]): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];

    for (const task of tasks) {
      const start = Date.now();
      try {
        let output: string;

        switch (task.name) {
          case "create_script":
            output = await this.createScript(task.parameters ?? {});
            break;
          case "optimize_title":
            output = await this.optimizeTitle(task.parameters ?? {});
            break;
          case "generate_description":
            output = await this.generateDescription(task.parameters ?? {});
            break;
          case "suggest_tags":
            output = await this.suggestTags(task.parameters ?? {});
            break;
          case "thumbnail_concept":
            output = await this.thumbnailConcept(task.parameters ?? {});
            break;
          case "generate_youtube_seo":
            output = await this.generateYouTubeSEO(task.parameters ?? {});
            break;
          default:
            output = await this.callAI(
              `Utfør oppgaven: ${task.description}\n\nParametere: ${JSON.stringify(task.parameters)}`
            );
        }

        results.push({
          agentName: this.name,
          taskName: task.name,
          status: "success",
          output,
          duration: Date.now() - start,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        results.push({
          agentName: this.name,
          taskName: task.name,
          status: "error",
          output: error instanceof Error ? error.message : "Unknown error",
          duration: Date.now() - start,
          timestamp: new Date().toISOString(),
        });
      }
    }

    return results;
  }

  async analyzeData(data: Record<string, unknown>): Promise<string> {
    return this.callAI(
      `Analyser denne YouTube-dataen og gi anbefalinger for forbedring:\n\n${JSON.stringify(data, null, 2)}`
    );
  }

  async generateRecommendations(context: Record<string, unknown>): Promise<string> {
    return this.callAI(
      `Basert på denne konteksten, gi konkrete YouTube-anbefalinger:\n\n${JSON.stringify(context, null, 2)}`
    );
  }

  private async createScript(params: Record<string, unknown>): Promise<string> {
    const topic = params.topic ?? "ukjent emne";
    const duration = params.duration ?? "8-12 minutter";
    const brand = params.brand ?? "";

    return this.callAI(
      `Skriv et komplett YouTube-videomanus.\n\nEmne: ${topic}\nØnsket varighet: ${duration}\nBrand: ${brand}\n\nInkluder:\n1. Hook (0-15 sek) - fang oppmerksomheten umiddelbart\n2. Intro (15-30 sek) - sett opp hva seeren vil lære\n3. Hovedinnhold - del opp i klare seksjoner med overganger\n4. CTA - call to action for likes, subscribe, kommentarer\n5. Outro - oppsummering og teaser for neste video\n\nMerk retention hooks gjennom hele manuset.`
    );
  }

  private async optimizeTitle(params: Record<string, unknown>): Promise<string> {
    const topic = params.topic ?? "";
    const currentTitle = params.currentTitle ?? "";

    return this.callAI(
      `Optimaliser denne YouTube-tittelen for maksimal CTR.\n\nEmne: ${topic}\nNåværende tittel: ${currentTitle}\n\nGi 5 alternative titler med forklaring for hvorfor de vil prestere bedre. Følg disse reglene:\n- Maks 60 tegn\n- Bruk tall der mulig\n- Inkluder power words (hemmelighet, avslørt, sjokkerende, enkel, osv.)\n- Vekk nysgjerrighet uten å være clickbait\n- Plasser viktigste nøkkelord først`
    );
  }

  private async generateDescription(params: Record<string, unknown>): Promise<string> {
    const title = params.title ?? "";
    const topic = params.topic ?? "";

    return this.callAI(
      `Lag en SEO-optimalisert YouTube-beskrivelse.\n\nTittel: ${title}\nEmne: ${topic}\n\nInkluder:\n- Engasjerende intro (2 setninger) med hovednøkkelord\n- Tidsstempler for hovedseksjoner\n- Relevante lenker (placeholder)\n- Call to action\n- Relevante nøkkelord naturlig integrert\n- Minimum 2000 tegn for optimal SEO`
    );
  }

  private async suggestTags(params: Record<string, unknown>): Promise<string> {
    const topic = params.topic ?? "";
    const niche = params.niche ?? "";

    return this.callAI(
      `Foreslå optimale YouTube-tags.\n\nEmne: ${topic}\nNisje: ${niche}\n\nGi 20-30 tags sortert etter relevans:\n- 5 brede tags (høyt søkevolum)\n- 10 nisje-tags (medium søkevolum, lav konkurranse)\n- 10 long-tail tags (spesifikke, lav konkurranse)\n\nTotal lengde må være under 500 tegn.`
    );
  }

  private async thumbnailConcept(params: Record<string, unknown>): Promise<string> {
    const title = params.title ?? "";
    const topic = params.topic ?? "";

    return this.callAI(
      `Design et thumbnail-konsept for denne YouTube-videoen.\n\nTittel: ${title}\nEmne: ${topic}\n\nBeskriv:\n1. Visuell komposisjon (layout, perspektiv)\n2. Fargepalett (2-3 hovedfarger, høy kontrast)\n3. Tekst overlay (maks 3 ord, font-stil)\n4. Ansiktsuttrykk/emosjon (hvis person)\n5. Bakgrunn og visuelt element\n6. Hvorfor dette konseptet vil ha høy CTR`
    );
  }

  private async generateYouTubeSEO(params: Record<string, unknown>): Promise<string> {
    const topic = params.topic ?? "";
    const brand = params.brand ?? "";

    return this.callAI(
      `Lag en komplett YouTube SEO-pakke.\n\nEmne: ${topic}\nBrand: ${brand}\n\nLevér:\n1. 5 optimaliserte titler (sortert etter estimert CTR)\n2. SEO-beskrivelse (2000+ tegn)\n3. 25 tags (under 500 tegn totalt)\n4. 3 thumbnail-konsepter\n5. Retention hooks for video (3-5 stk)\n6. Anbefalte publiseringstidspunkt for norsk målgruppe`
    );
  }
}
