import { askClaude } from "@/services/ai/claude-client";

// ─── Default Content Rules ────────────────────────────────────────────
export const NORWEGIAN_CONTENT_RULES = `
SPRÅK OG INNHOLDSREGLER:
- Norsk bokmål er standardspråk når oppgaven eller kildematerialet ikke angir et annet språk.
- Når brukeren, kunden eller kilden bruker et annet språk, følg det språket når oppgaven krever svar, oversettelse eller kundekommunikasjon.
- Bruk profesjonelt, tilgjengelig og naturlig språk. Unngå stive direkteoversettelser.
- Tilpass tone, fagtermer og tiltaleform til målgruppen og markedet oppgaven faktisk gjelder.
- Bevar dokumenterte tall, priser, valutaer, enheter, datoer og egennavn. Ikke konverter EUR til NOK eller omvendt uten at oppgaven ber om det.
- For norsk tekst kan norsk tall- og datoformat brukes når dette ikke endrer kildedata eller skaper tvetydighet.
- Juridiske, regulatoriske og skattemessige referanser skal følge riktig jurisdiksjon i konteksten. Ikke anta norsk lov når saken gjelder Spania eller et annet land.
- Hvis jurisdiksjon, valuta eller språk er uklart og er viktig for svaret, ikke gjett; bruk nøytral formulering eller marker hva som må avklares.
- Hashtags, CTA-er og lokale uttrykk skal være relevante for faktisk brand, marked, kanal og målgruppe; ikke legg til norske hashtags bare fordi standardspråket er norsk.
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

export abstract class BaseAgent {
  name: string;
  role: string;
  expertise: string[];

  constructor(name: string, role: string, expertise: string[]) {
    this.name = name;
    this.role = role;
    this.expertise = expertise;
  }

  protected async callAI(prompt: string, systemPrompt?: string): Promise<string> {
    const system = systemPrompt ?? this.getDefaultSystemPrompt();

    try {
      return await askClaude(prompt, {
        systemPrompt: system,
        maxTokens: 4096,
        model: 'sonnet',
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error during AI call";
      console.error(`[${this.name}] AI call failed: ${errorMessage}`);
      throw new Error(`Agent ${this.name} failed to get AI response: ${errorMessage}`);
    }
  }

  protected parseJSON<T = Record<string, unknown>>(text: string): T {
    const cleaned = this.stripMarkdownFormatting(text);
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

  protected stripMarkdownFormatting(text: string): string {
    return text
      .replace(/```(?:json|typescript|javascript|text)?\n?/g, "")
      .replace(/```/g, "")
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/\*(.*?)\*/g, "$1")
      .replace(/#{1,6}\s/g, "")
      .replace(/`([^`]+)`/g, "$1")
      .trim();
  }

  protected getDefaultSystemPrompt(): string {
    const now = new Date();
    const dateStr = now.toLocaleDateString("nb-NO", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const season = (() => {
      const m = now.getMonth();
      if (m >= 2 && m <= 4) return "vår";
      if (m >= 5 && m <= 7) return "sommer";
      if (m >= 8 && m <= 10) return "høst";
      return "vinter";
    })();

    return [
      `Du er ${this.name}, en AI-agent med rollen "${this.role}".`,
      `Din ekspertise inkluderer: ${this.expertise.join(", ")}.`,
      "",
      `DAGENS DATO: ${dateStr}`,
      `ÅR: ${now.getFullYear()}`,
      `SESONG: ${season} ${now.getFullYear()}`,
      `VIKTIG: Referer til riktig årstall (${now.getFullYear()}) og sesong (${season}) når tidskontekst er relevant. Ikke erstatt dokumenterte historiske datoer med dagens år.`,
      "",
      NORWEGIAN_CONTENT_RULES,
      CLEAN_OUTPUT_RULES,
    ].join("\n");
  }

  getCapabilities(): AgentCapability {
    return {
      agentName: this.name,
      role: this.role,
      expertise: [...this.expertise],
      availableTasks: this.getAvailableTasks(),
    };
  }

  protected abstract getAvailableTasks(): string[];
  abstract executeTasks(tasks: AgentTask[]): Promise<ExecutionResult[]>;
  abstract analyzeData(data: Record<string, unknown>): Promise<string>;
  abstract generateRecommendations(context: Record<string, unknown>): Promise<string>;
}
