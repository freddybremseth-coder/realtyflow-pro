import Anthropic from "@anthropic-ai/sdk";

// ─── Norwegian Content Rules ──────────────────────────────────────────
export const NORWEGIAN_CONTENT_RULES = `
SPRÅK OG INNHOLDSREGLER:
- Alt innhold SKAL skrives på norsk bokmål med mindre annet er spesifisert.
- Bruk profesjonelt men tilgjengelig språk som engasjerer norske lesere.
- Tilpass tone og stil til norsk forretningskultur.
- Bruk norske uttrykk og fagtermer der det er naturlig.
- Unngå direkte oversettelser fra engelsk som virker unaturlige.
- Skriv tall med mellomrom som tusenskilletegn (1 000, 10 000) og komma som desimalskilletegn (3,5 %).
- Bruk norsk datoformat: DD.MM.ÅÅÅÅ.
- Valuta skal angis i NOK eller kr.
- Referanser til lover, regler og standarder skal være norske (Plan- og bygningsloven, Eiendomsmeglingsloven, osv.).
- Bruk "du/dere" for direkte henvendelser, unngå "De" med mindre konteksten krever det.
- Inkluder relevante norske hashtags når det er aktuelt (#eiendom #bolig #norge).
`;

// ─── Clean Output Rules ───────────────────────────────────────────────
export const CLEAN_OUTPUT_RULES = `
OUTPUT-FORMATERING:
- Returner ALDRI markdown-formatering med mindre det er eksplisitt bedt om.
- Ingen ** for bold, ingen ## for overskrifter, ingen \`\`\` for kodeblokker.
- Bruk ren tekst med naturlige avsnitt og linjeskift.
- Bruk bindestrek (-) eller tall (1. 2. 3.) for lister, aldri asterisk (*).
- Ikke pakk svaret inn i JSON med mindre det er spesifikt bedt om.
- Unngå "her er", "selvfølgelig", "absolutt" og lignende fyllord.
- Gå rett på sak med substansielt innhold.
`;

// ─── Interfaces ───────────────────────────────────────────────────────

export interface AgentTask {
  id: string;
  name: string;
  description: string;
  priority: "low" | "medium" | "high";
  parameters?: Record<string, unknown>;
  status: "pending" | "in_progress" | "completed" | "failed";
  result?: string;
}

export interface ContentStrategy {
  tone: string;
  target_audience: string;
  key_messages: string[];
  cta: string;
  hashtags: string[];
  estimated_reach: number;
}

export interface AgentCapability {
  agentName: string;
  role: string;
  expertise: string[];
  availableTasks: string[];
}

export interface ExecutionResult {
  agentName: string;
  taskName: string;
  status: "success" | "error";
  output: string;
  duration: number;
  timestamp: string;
}

// ─── Abstract Base Agent ──────────────────────────────────────────────

export abstract class BaseAgent {
  name: string;
  role: string;
  expertise: string[];

  protected client: Anthropic;
  protected model: string = "claude-sonnet-4-20250514";

  constructor(name: string, role: string, expertise: string[]) {
    this.name = name;
    this.role = role;
    this.expertise = expertise;
    this.client = new Anthropic();
  }

  /**
   * Calls the Anthropic API with the given prompt and optional system prompt.
   * Returns the text content from the response.
   */
  protected async callAI(prompt: string, systemPrompt?: string): Promise<string> {
    try {
      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        system: systemPrompt ?? this.getDefaultSystemPrompt(),
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      const textBlock = message.content.find((block) => block.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("No text content in AI response");
      }

      return textBlock.text;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error during AI call";
      console.error(`[${this.name}] AI call failed: ${errorMessage}`);
      throw new Error(`Agent ${this.name} failed to get AI response: ${errorMessage}`);
    }
  }

  /**
   * Attempts to parse a JSON string from AI output.
   * Handles cases where the AI wraps JSON in markdown code fences.
   */
  protected parseJSON<T = Record<string, unknown>>(text: string): T {
    const cleaned = this.stripMarkdownFormatting(text);

    // Try to extract JSON from the cleaned text
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    const jsonArrayMatch = cleaned.match(/\[[\s\S]*\]/);

    const candidate = jsonMatch?.[0] ?? jsonArrayMatch?.[0];

    if (!candidate) {
      throw new Error(`Could not extract JSON from response: ${cleaned.substring(0, 200)}`);
    }

    try {
      return JSON.parse(candidate) as T;
    } catch {
      throw new Error(`Failed to parse JSON: ${candidate.substring(0, 200)}`);
    }
  }

  /**
   * Strips markdown formatting artifacts from AI responses.
   * Removes code fences, bold markers, heading markers, etc.
   */
  protected stripMarkdownFormatting(text: string): string {
    return text
      .replace(/```(?:json|typescript|javascript|text)?\n?/g, "") // code fences
      .replace(/```/g, "")
      .replace(/\*\*(.*?)\*\*/g, "$1") // bold
      .replace(/\*(.*?)\*/g, "$1") // italic
      .replace(/#{1,6}\s/g, "") // headings
      .replace(/`([^`]+)`/g, "$1") // inline code
      .trim();
  }

  /**
   * Builds the default system prompt for this agent.
   */
  protected getDefaultSystemPrompt(): string {
    return [
      `Du er ${this.name}, en AI-agent med rollen "${this.role}".`,
      `Din ekspertise inkluderer: ${this.expertise.join(", ")}.`,
      "",
      NORWEGIAN_CONTENT_RULES,
      CLEAN_OUTPUT_RULES,
    ].join("\n");
  }

  /**
   * Returns the capabilities of this agent.
   */
  getCapabilities(): AgentCapability {
    return {
      agentName: this.name,
      role: this.role,
      expertise: [...this.expertise],
      availableTasks: this.getAvailableTasks(),
    };
  }

  /**
   * Returns a list of task names this agent can execute.
   */
  protected abstract getAvailableTasks(): string[];

  /**
   * Executes a list of tasks sequentially and returns results.
   */
  abstract executeTasks(tasks: AgentTask[]): Promise<ExecutionResult[]>;

  /**
   * Analyzes the given data and returns an AI-generated analysis string.
   */
  abstract analyzeData(data: Record<string, unknown>): Promise<string>;

  /**
   * Generates recommendations based on the provided context.
   */
  abstract generateRecommendations(context: Record<string, unknown>): Promise<string>;
}
