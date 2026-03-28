import {
  BaseAgent,
  AgentTask,
  ExecutionResult,
  NORWEGIAN_CONTENT_RULES,
  CLEAN_OUTPUT_RULES,
} from "./base-agent";

// Platform best-practice baselines (UTC times, adjusted for CET/CEST)
const PLATFORM_BASELINES: Record<string, { bestDays: number[]; bestHoursUTC: number[]; description: string }> = {
  facebook: {
    bestDays: [2, 3, 4], // Tue, Wed, Thu
    bestHoursUTC: [8, 9, 10, 12, 13], // 10-12 and 14-15 CET
    description: "Facebook: Best engasjement tirsdag-torsdag kl. 10-12 og 14-15 CET. Unngå helger for B2B.",
  },
  instagram: {
    bestDays: [1, 2, 3, 4], // Mon-Thu
    bestHoursUTC: [9, 10, 11, 17, 18], // 11-13 og 19-20 CET
    description: "Instagram: Best kl. 11-13 (lunsj) og 19-20 (kveld) CET. Reels gjør det best mandag-onsdag.",
  },
  linkedin: {
    bestDays: [2, 3, 4], // Tue-Thu
    bestHoursUTC: [6, 7, 8, 11, 12], // 8-10 og 13-14 CET
    description: "LinkedIn: Best tidlig morgen kl. 8-10 CET eller lunsjtid 13-14. Tirsdag-torsdag dominerer.",
  },
  tiktok: {
    bestDays: [2, 4, 5], // Tue, Thu, Fri
    bestHoursUTC: [17, 18, 19, 20], // 19-22 CET
    description: "TikTok: Best om kvelden kl. 19-22 CET. Torsdag og fredag for høyest viralt potensial.",
  },
};

export class SchedulingAgent extends BaseAgent {
  constructor() {
    super("Sofia Scheduler", "AI Content Scheduling Strategist", [
      "optimal posting times",
      "engagement analysis",
      "content calendar planning",
      "platform algorithm optimization",
      "audience behavior patterns",
    ]);
    this.model = "claude-haiku-4-20250414";
  }

  protected getAvailableTasks(): string[] {
    return [
      "recommend_posting_time",
      "create_weekly_schedule",
      "analyze_engagement_patterns",
      "improve_content_recommendations",
    ];
  }

  private getSystemPrompt(): string {
    const now = new Date();
    const dateStr = now.toLocaleDateString("nb-NO", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });
    const season = (() => {
      const m = now.getMonth();
      if (m >= 2 && m <= 4) return "vår";
      if (m >= 5 && m <= 7) return "sommer";
      if (m >= 8 && m <= 10) return "høst";
      return "vinter";
    })();

    return `Du er ${this.name}, en AI-spesialist på innholdspublisering og timing-optimalisering.

DAGENS DATO: ${dateStr}
ÅR: ${now.getFullYear()}
SESONG: ${season} ${now.getFullYear()}

DINE KJERNEKOMPETANSER:
- Optimal publiseringstidspunkt per plattform basert på algoritmer og brukeratferd
- Analyse av engasjementsdata for å forbedre fremtidig innhold
- Innholdskalender-planlegging som maksimerer rekkevidde
- A/B-testing av tidspunkter og hashtags
- Norsk marked: CET/CEST tidssone, norske helligdager og sesongvariasjoner

PLATTFORM-KUNNSKAP:
${Object.values(PLATFORM_BASELINES).map((p) => `- ${p.description}`).join("\n")}

VIKTIGE PRINSIPPER:
- Aldri publiser to poster på samme plattform innen 4 timer
- Spred innhold utover uken for konsistent synlighet
- Ta hensyn til norske feriemønstre (fellesferie juli, påske, jul)
- Helger: Instagram/TikTok OK, LinkedIn/Facebook dårligere
- Tidspunkter i output skal alltid være i CET/CEST (norsk tid)

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
          case "recommend_posting_time":
            output = await this.recommendPostingTime(task.parameters ?? {});
            break;
          case "create_weekly_schedule":
            output = await this.createWeeklySchedule(task.parameters ?? {});
            break;
          case "analyze_engagement_patterns":
            output = await this.analyzeEngagementPatterns(task.parameters ?? {});
            break;
          case "improve_content_recommendations":
            output = await this.improveContentRecommendations(task.parameters ?? {});
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
        results.push({
          agentName: this.name,
          taskName: task.name,
          status: "error",
          output: error instanceof Error ? error.message : "Ukjent feil",
          duration: Date.now() - start,
          timestamp: new Date().toISOString(),
        });
      }
    }

    return results;
  }

  async analyzeData(data: Record<string, unknown>): Promise<string> {
    return this.callAI(
      `Analyser følgende engasjementsdata og gi innsikt:\n${JSON.stringify(data, null, 2)}`,
      this.getSystemPrompt()
    );
  }

  async generateRecommendations(context: Record<string, unknown>): Promise<string> {
    return this.callAI(
      `Gi publiseringsanbefalinger basert på:\n${JSON.stringify(context, null, 2)}`,
      this.getSystemPrompt()
    );
  }

  // ─── Recommend optimal posting time ─────────────────────────────

  private async recommendPostingTime(params: Record<string, unknown>): Promise<string> {
    const platforms = (params.platforms as string[]) ?? ["facebook"];
    const brandId = (params.brand_id as string) ?? "";
    const contentType = (params.content_type as string) ?? "post";
    const contentPreview = (params.content_preview as string) ?? "";
    const existingSchedule = (params.existing_schedule as string) ?? "ingen planlagte poster";
    const engagementHistory = (params.engagement_history as string) ?? "ingen data ennå";

    const prompt = `Anbefal optimal publiseringstidspunkt for denne posten:

MERKEVARE: ${brandId}
PLATTFORMER: ${platforms.join(", ")}
INNHOLDSTYPE: ${contentType}
INNHOLD (forhåndsvisning): ${contentPreview.substring(0, 300)}

EKSISTERENDE PUBLISERINGSPLAN DENNE UKEN:
${existingSchedule}

HISTORISK ENGASJEMENTSDATA:
${engagementHistory}

Returner KUN gyldig JSON med denne strukturen:
{
  "recommendations": [
    {
      "platform": "facebook",
      "recommended_datetime": "2026-03-30T10:00:00+02:00",
      "confidence": 0.85,
      "reasoning": "Tirsdag formiddag gir best engasjement for eiendomsinnhold"
    }
  ],
  "general_advice": "Kort anbefaling om innholdet",
  "suggested_hashtags": ["#tag1", "#tag2"]
}

Bruk ISO 8601-format med CET/CEST tidssone (+01:00 eller +02:00).
Anbefal tidspunkt innen de neste 7 dagene.
Ikke anbefal tidspunkter som allerede er i den eksisterende planen.`;

    return this.callAI(prompt, this.getSystemPrompt());
  }

  // ─── Create weekly schedule ─────────────────────────────────────

  private async createWeeklySchedule(params: Record<string, unknown>): Promise<string> {
    const brandId = (params.brand_id as string) ?? "";
    const platforms = (params.platforms as string[]) ?? ["facebook", "instagram"];
    const postsPerWeek = (params.posts_per_week as number) ?? 5;
    const drafts = (params.drafts as string) ?? "ingen utkast tilgjengelig";

    const prompt = `Lag en optimal publiseringsplan for neste uke:

MERKEVARE: ${brandId}
PLATTFORMER: ${platforms.join(", ")}
ANTALL POSTER PR. UKE: ${postsPerWeek}

TILGJENGELIGE UTKAST:
${drafts}

Returner KUN gyldig JSON:
{
  "schedule": [
    {
      "day": "Mandag",
      "date": "2026-03-30",
      "slots": [
        {
          "time": "10:00",
          "platform": "facebook",
          "draft_title": "tittel fra utkast",
          "reasoning": "hvorfor dette tidspunktet"
        }
      ]
    }
  ],
  "strategy_summary": "Kort oppsummering av ukesstrategien"
}`;

    return this.callAI(prompt, this.getSystemPrompt());
  }

  // ─── Analyze engagement patterns ────────────────────────────────

  private async analyzeEngagementPatterns(params: Record<string, unknown>): Promise<string> {
    const data = (params.engagement_data as string) ?? "ingen data";

    const prompt = `Analyser engasjementsmønstre fra disse dataene:

${data}

Gi innsikt om:
1. Beste publiseringstidspunkter basert på faktisk data
2. Innholdstyper som gir mest engasjement
3. Hashtags som fungerer best
4. Trender over tid
5. Konkrete forbedringspunkter

Returner KUN gyldig JSON:
{
  "best_times": [{"day": "Tirsdag", "hour": 10, "avg_engagement": 4.2}],
  "best_content_types": [{"type": "image_post", "avg_engagement": 5.1}],
  "top_hashtags": ["#tag1", "#tag2"],
  "trends": ["trend1", "trend2"],
  "improvements": ["forbedring1", "forbedring2"]
}`;

    return this.callAI(prompt, this.getSystemPrompt());
  }

  // ─── Content improvement suggestions ────────────────────────────

  private async improveContentRecommendations(params: Record<string, unknown>): Promise<string> {
    const topPosts = (params.top_posts as string) ?? "ingen data";
    const lowPosts = (params.low_posts as string) ?? "ingen data";

    const prompt = `Sammenlign de best-performende og dårligst-performende postene:

TOPP-POSTER (høyest engasjement):
${topPosts}

SVAKESTE POSTER:
${lowPosts}

Gi konkrete, handlingsbare forbedringsanbefalinger:
1. Hva kjennetegner postene som gjør det bra?
2. Hva bør unngås?
3. Konkrete tips for å forbedre fremtidige poster
4. Foreslåtte endringer i tone, lengde, hashtags, bilder

Returner KUN gyldig JSON:
{
  "winning_patterns": ["mønster1", "mønster2"],
  "avoid_patterns": ["unngå1", "unngå2"],
  "action_items": ["gjør dette1", "gjør dette2"],
  "hashtag_suggestions": ["#ny1", "#ny2"],
  "tone_adjustment": "beskrivelse av anbefalt toneendring"
}`;

    return this.callAI(prompt, this.getSystemPrompt());
  }

  // ─── Quick baseline recommendation (no AI call needed) ──────────

  static getBaselineRecommendation(platform: string): { dayOfWeek: number; hourUTC: number } {
    const baseline = PLATFORM_BASELINES[platform] || PLATFORM_BASELINES.facebook;
    const day = baseline.bestDays[Math.floor(Math.random() * baseline.bestDays.length)];
    const hour = baseline.bestHoursUTC[Math.floor(Math.random() * baseline.bestHoursUTC.length)];
    return { dayOfWeek: day, hourUTC: hour };
  }
}
