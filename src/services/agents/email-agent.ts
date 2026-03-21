import {
  BaseAgent,
  AgentTask,
  ExecutionResult,
  NORWEGIAN_CONTENT_RULES,
  CLEAN_OUTPUT_RULES,
} from "./base-agent";

// ─── Email Agent Interfaces ─────────────────────────────────────────

export interface EmailAnalysis {
  intent: "inquiry" | "viewing_request" | "offer" | "complaint" | "follow_up" | "general";
  urgency: "low" | "medium" | "high" | "critical";
  sentiment: "positive" | "neutral" | "negative";
  language: string;
  summary: string;
  key_points: string[];
  suggested_action: string;
}

export interface EmailContextMatch {
  matched_lead_id?: string;
  matched_lead_name?: string;
  matched_customer_id?: string;
  matched_customer_name?: string;
  matched_property_ids: string[];
  matched_plot_ids: string[];
  confidence: number;
  reasoning: string;
}

export interface EmailDraftReply {
  subject: string;
  body_text: string;
  body_html?: string;
  tone: string;
  language: string;
  confidence: number;
  properties_mentioned: string[];
  suggested_next_steps: string[];
}

// ─── Email Agent ─────────────────────────────────────────────────────

export class EmailAgent extends BaseAgent {
  private brandContext: string;

  constructor(brandContext?: string) {
    super("Elena Email AI", "E-postassistent for eiendom", [
      "e-postanalyse",
      "kundekommunikasjon",
      "eiendomsformidling",
      "flerspråklig korrespondanse",
      "CRM-integrasjon",
      "lead-kvalifisering via e-post",
    ]);

    this.brandContext = brandContext ?? "";
  }

  protected getAvailableTasks(): string[] {
    return [
      "analyze_email",
      "match_context",
      "draft_reply",
      "suggest_action",
    ];
  }

  private getSystemPrompt(): string {
    return `Du er ${this.name}, en AI-assistent spesialisert på e-posthåndtering for eiendomsselskaper.

DINE OPPGAVER:
1. Analysere innkommende e-poster: identifiser formål, hast, sentiment og språk
2. Matche e-poster med eksisterende data: leads i pipeline, eiendommer, tomter, kunder
3. Skrive svar-utkast som bruker riktig brand-tone og inkluderer relevante eiendommer/priser
4. Foreslå handlinger: legg til i CRM, planlegg visning, send prospekt

KONTEKST DU FÅR:
- Brand-informasjon (navn, tone, spesialiteter, kontaktinfo)
- Eiendommer med priser, bilder, beskrivelser
- Leads i pipeline med status og notater
- Kundehistorikk med tidligere interaksjoner
- Tomter med GPS, regulering, priser

REGLER:
- Svar alltid på samme språk som e-posten (norsk, engelsk, spansk, etc.)
- Bruk brandets tone (profesjonell, vennlig, luksuriøs avhengig av brand)
- Inkluder relevante eiendommer med pris når det passer
- Aldri lyv om priser eller tilgjengelighet
- Foreslå visningsdatoer basert på kalender
- Flagg hastesaker (klager, tidsfrister, store investorer)
- Bruk formelt språk for første kontakt, mer uformelt for eksisterende kunder
- Inkluder alltid kontaktinfo og signatur fra brandet
- Ved forespørsler om flere eiendommer, presenter maks 3-5 mest relevante
- Ved klager, prioriter empati og rask løsning

${this.brandContext ? `MERKEVARE-KONTEKST:\n${this.brandContext}\n` : ""}
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
          case "analyze_email":
            output = await this.analyzeEmail(task.parameters ?? {});
            break;
          case "match_context":
            output = await this.matchContext(task.parameters ?? {});
            break;
          case "draft_reply":
            output = await this.draftReply(task.parameters ?? {});
            break;
          case "suggest_action":
            output = await this.suggestAction(task.parameters ?? {});
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
    const prompt = `Analyser følgende e-postdata og gi en oversikt:

Data:
${JSON.stringify(data, null, 2)}

Gi en analyse som inkluderer:
1. Oversikt over innkommende e-poster (antall, trender, vanlige forespørsler)
2. Responstider og effektivitet
3. Vanligste henvendelsestyper
4. Anbefalinger for forbedring av e-posthåndtering`;

    return this.callAI(prompt, this.getSystemPrompt());
  }

  async generateRecommendations(context: Record<string, unknown>): Promise<string> {
    const prompt = `Basert på følgende e-postkontekst, generer anbefalinger for e-posthåndtering:

Kontekst:
${JSON.stringify(context, null, 2)}

Gi konkrete anbefalinger for:
1. Optimalisering av svartider
2. Maler for vanlige henvendelser
3. Automatiseringsmuligheter
4. Forbedring av kundetilfredshet`;

    return this.callAI(prompt, this.getSystemPrompt());
  }

  // ─── Task-specific methods ──────────────────────────────────────────

  /**
   * Analyze an incoming email for intent, urgency, sentiment, language, and summary.
   */
  async analyzeEmail(params: Record<string, unknown>): Promise<string> {
    const subject = (params.subject as string) ?? "";
    const body = (params.body as string) ?? "";
    const fromAddress = (params.from_address as string) ?? "";
    const fromName = (params.from_name as string) ?? "";

    const prompt = `Analyser denne innkommende e-posten:

FRA: ${fromName} <${fromAddress}>
EMNE: ${subject}

INNHOLD:
${body}

Returner KUN gyldig JSON med denne strukturen:
{
  "intent": "inquiry|viewing_request|offer|complaint|follow_up|general",
  "urgency": "low|medium|high|critical",
  "sentiment": "positive|neutral|negative",
  "language": "no|en|es|de|fr|ru|...",
  "summary": "Kort oppsummering av e-posten på 1-2 setninger",
  "key_points": ["punkt 1", "punkt 2"],
  "suggested_action": "Foreslått handling som bør tas"
}

RETNINGSLINJER:
- "inquiry": Generell forespørsel om eiendommer, priser, prosess
- "viewing_request": Ønsker å se en eller flere eiendommer
- "offer": Kommer med et bud eller motbud
- "complaint": Klage eller negativ tilbakemelding
- "follow_up": Oppfølging av tidligere kommunikasjon
- "general": Alt annet (takk-e-post, informasjon, etc.)
- Urgency "critical": Juridiske frister, klager fra store kunder, tidspress
- Urgency "high": Konkrete bud, visningsønsker innen kort tid
- Urgency "medium": Standard henvendelser som forventer svar
- Urgency "low": Generell info, nyhetsbrev-svar, etc.`;

    return this.callAI(prompt, this.getSystemPrompt());
  }

  /**
   * Match email content against existing leads, customers, properties, and plots.
   */
  async matchContext(params: Record<string, unknown>): Promise<string> {
    const emailContent = (params.email_content as string) ?? "";
    const fromAddress = (params.from_address as string) ?? "";
    const leads = params.leads ? JSON.stringify(params.leads) : "[]";
    const customers = params.customers ? JSON.stringify(params.customers) : "[]";
    const properties = params.properties ? JSON.stringify(params.properties) : "[]";
    const plots = params.plots ? JSON.stringify(params.plots) : "[]";

    const prompt = `Match denne e-posten med eksisterende data i systemet.

E-POST FRA: ${fromAddress}
INNHOLD: ${emailContent}

TILGJENGELIGE LEADS:
${leads}

TILGJENGELIGE KUNDER:
${customers}

TILGJENGELIGE EIENDOMMER:
${properties}

TILGJENGELIGE TOMTER:
${plots}

Returner KUN gyldig JSON:
{
  "matched_lead_id": "id eller null",
  "matched_lead_name": "navn eller null",
  "matched_customer_id": "id eller null",
  "matched_customer_name": "navn eller null",
  "matched_property_ids": ["id1", "id2"],
  "matched_plot_ids": ["id1"],
  "confidence": 0.85,
  "reasoning": "Forklaring på hvorfor disse matchene ble valgt"
}

REGLER:
- Match på e-postadresse først (eksakt match)
- Match på navn hvis e-post ikke matcher
- Match eiendommer basert på nevnte steder, priser, størrelse, type
- Match tomter basert på nevnte områder, GPS, regulering
- Confidence 0-1 der 1 er sikker match`;

    return this.callAI(prompt, this.getSystemPrompt());
  }

  /**
   * Draft a contextual reply using brand tone, matched properties, and pricing.
   */
  async draftReply(params: Record<string, unknown>): Promise<string> {
    const originalEmail = (params.original_email as string) ?? "";
    const subject = (params.subject as string) ?? "";
    const analysis = params.analysis ? JSON.stringify(params.analysis) : "{}";
    const matchedProperties = params.matched_properties
      ? JSON.stringify(params.matched_properties)
      : "[]";
    const brandInfo = params.brand_info ? JSON.stringify(params.brand_info) : "{}";
    const signature = (params.signature as string) ?? "";
    const language = (params.language as string) ?? "no";
    const tone = (params.tone as string) ?? "professional";

    const prompt = `Skriv et svar-utkast til denne e-posten.

ORIGINAL E-POST:
Emne: ${subject}
${originalEmail}

AI-ANALYSE AV E-POSTEN:
${analysis}

RELEVANTE EIENDOMMER:
${matchedProperties}

BRAND-INFO:
${brandInfo}

SIGNATUR:
${signature}

SPRÅK: ${language}
TONE: ${tone}

Returner KUN gyldig JSON:
{
  "subject": "Re: ${subject}",
  "body_text": "Svarteksten her (ren tekst uten formatering)",
  "body_html": "<p>HTML-versjon av svaret</p>",
  "tone": "${tone}",
  "language": "${language}",
  "confidence": 0.85,
  "properties_mentioned": ["ref1", "ref2"],
  "suggested_next_steps": ["Planlegg visning", "Send prospekt"]
}

REGLER:
- Svar på samme språk som original e-post
- Bruk brandets tone og stil
- Inkluder relevante eiendommer med pris hvis forespørsel
- Avslutt med konkret neste steg eller call-to-action
- Inkluder signaturen
- Ikke bruk markdown i body_text
- body_html skal ha enkel formatering med <p>, <br>, <strong>
- Confidence 0-1 der 1 er veldig trygg på at svaret er passende`;

    return this.callAI(prompt, this.getSystemPrompt());
  }

  /**
   * Suggest next action based on email analysis and context.
   */
  private async suggestAction(params: Record<string, unknown>): Promise<string> {
    const analysis = params.analysis ? JSON.stringify(params.analysis) : "{}";
    const contextMatch = params.context_match ? JSON.stringify(params.context_match) : "{}";
    const pipelineStatus = params.pipeline_status ? JSON.stringify(params.pipeline_status) : "{}";

    const prompt = `Basert på e-postanalyse og kontekst, foreslå neste handling.

E-POST-ANALYSE:
${analysis}

KONTEKST-MATCH:
${contextMatch}

PIPELINE-STATUS:
${pipelineStatus}

Returner KUN gyldig JSON:
{
  "primary_action": "add_to_crm|schedule_viewing|send_brochure|create_offer|escalate|follow_up|archive",
  "action_description": "Detaljert beskrivelse av handlingen",
  "priority": "low|medium|high|critical",
  "auto_executable": true,
  "additional_actions": [
    {
      "action": "...",
      "description": "..."
    }
  ],
  "reasoning": "Hvorfor denne handlingen anbefales"
}`;

    return this.callAI(prompt, this.getSystemPrompt());
  }

  /**
   * Set or update the brand context used in system prompts.
   */
  setBrandContext(context: string): void {
    this.brandContext = context;
  }

  /**
   * Full email processing pipeline: analyze, match, draft, suggest.
   * Returns all results in a single call for efficiency.
   */
  async processEmail(params: {
    subject: string;
    body: string;
    from_address: string;
    from_name?: string;
    brand_info?: Record<string, unknown>;
    leads?: Record<string, unknown>[];
    customers?: Record<string, unknown>[];
    properties?: Record<string, unknown>[];
    plots?: Record<string, unknown>[];
    signature?: string;
  }): Promise<{
    analysis: EmailAnalysis;
    contextMatch: EmailContextMatch;
    draftReply: EmailDraftReply;
  }> {
    // Step 1: Analyze the email
    const analysisRaw = await this.analyzeEmail({
      subject: params.subject,
      body: params.body,
      from_address: params.from_address,
      from_name: params.from_name || "",
    });
    const analysis = this.parseJSON<EmailAnalysis>(analysisRaw);

    // Step 2: Match context
    const contextRaw = await this.matchContext({
      email_content: `${params.subject}\n${params.body}`,
      from_address: params.from_address,
      leads: params.leads || [],
      customers: params.customers || [],
      properties: params.properties || [],
      plots: params.plots || [],
    });
    const contextMatch = this.parseJSON<EmailContextMatch>(contextRaw);

    // Step 3: Draft reply
    const draftRaw = await this.draftReply({
      original_email: params.body,
      subject: params.subject,
      analysis,
      matched_properties: params.properties?.filter((p) =>
        contextMatch.matched_property_ids.includes(
          (p.id as string) || (p.ref as string) || ""
        )
      ) || [],
      brand_info: params.brand_info || {},
      signature: params.signature || "",
      language: analysis.language,
      tone: (params.brand_info?.tone as string) || "professional",
    });
    const draftReply = this.parseJSON<EmailDraftReply>(draftRaw);

    return { analysis, contextMatch, draftReply };
  }
}
