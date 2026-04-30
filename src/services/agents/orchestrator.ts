import { AgentCapability, AgentTask, ExecutionResult, BaseAgent } from "./base-agent";
import { MarketingAgent } from "./marketing-agent";
import { SalesAgent } from "./sales-agent";
import { SEOAgent } from "./seo-agent";
import { BusinessAgent } from "./business-agent";
import { MultiDomainExpertAgent } from "./multi-domain-expert";
import { YouTubeAgent } from "./youtube-agent";
import { CEOAgent } from "./ceo-agent";
import { SchedulingAgent } from "./scheduling-agent";

export interface MultiAgentResult {
  task: string;
  agentResults: ExecutionResult[];
  synthesis: string;
  totalDuration: number;
}

export class AgentOrchestrator {
  private agents: Map<string, BaseAgent>;

  constructor() {
    this.agents = new Map();
    this.agents.set("marketing", new MarketingAgent());
    this.agents.set("sales", new SalesAgent());
    this.agents.set("seo", new SEOAgent());
    this.agents.set("business", new BusinessAgent());
    this.agents.set("multi-domain", new MultiDomainExpertAgent());
    this.agents.set("youtube", new YouTubeAgent());
    this.agents.set("ceo", new CEOAgent());
    this.agents.set("scheduling", new SchedulingAgent());
  }

  getAgent(name: string): BaseAgent | undefined {
    return this.agents.get(name);
  }

  getAgentCapabilities(): AgentCapability[] {
    return Array.from(this.agents.values()).map((agent) => agent.getCapabilities());
  }

  async executeCommand(agentName: string, command: string): Promise<ExecutionResult> {
    const agent = this.agents.get(agentName);
    if (!agent) {
      return {
        agentName: agentName,
        taskName: "unknown",
        status: "error",
        output: `Agent "${agentName}" not found. Available: ${Array.from(this.agents.keys()).join(", ")}`,
        duration: 0,
        timestamp: new Date().toISOString(),
      };
    }

    const taskName = this.inferTaskName(agentName, command);
    const task: AgentTask = {
      id: crypto.randomUUID(),
      name: taskName,
      description: command,
      priority: "medium",
      parameters: this.buildParameters(agentName, command),
      status: "pending",
    };

    const results = await agent.executeTasks([task]);
    return results[0];
  }

  async runMultiAgentTask(
    taskDescription: string,
    agentNames: string[]
  ): Promise<MultiAgentResult> {
    const start = Date.now();
    const allResults: ExecutionResult[] = [];

    const tasks = agentNames
      .map((name) => {
        const agent = this.agents.get(name);
        if (!agent) return null;
        return { agent, name };
      })
      .filter(Boolean) as { agent: BaseAgent; name: string }[];

    // Run all agents in parallel
    const promises = tasks.map(async ({ agent, name }) => {
      const task: AgentTask = {
        id: crypto.randomUUID(),
        name: this.inferTaskName(name, taskDescription),
        description: taskDescription,
        priority: "high",
        parameters: this.buildParameters(name, taskDescription),
        status: "pending",
      };

      try {
        const results = await agent.executeTasks([task]);
        return results;
      } catch (error) {
        return [
          {
            agentName: name,
            taskName: taskDescription,
            status: "error" as const,
            output: error instanceof Error ? error.message : "Unknown error",
            duration: 0,
            timestamp: new Date().toISOString(),
          },
        ];
      }
    });

    const resultSets = await Promise.all(promises);
    for (const results of resultSets) {
      allResults.push(...results);
    }

    const synthesis = this.generateExecutionSummary(allResults);

    return {
      task: taskDescription,
      agentResults: allResults,
      synthesis,
      totalDuration: Date.now() - start,
    };
  }

  generateExecutionSummary(results: ExecutionResult[]): string {
    const successful = results.filter((r) => r.status === "success");
    const failed = results.filter((r) => r.status === "error");

    const lines: string[] = [
      `Resultater fra ${results.length} agent-oppgaver:`,
      `- Vellykkede: ${successful.length}`,
      `- Feilet: ${failed.length}`,
      "",
    ];

    for (const result of successful) {
      lines.push(`[${result.agentName}] ${result.taskName}: OK (${result.duration}ms)`);
      lines.push(result.output.substring(0, 200) + (result.output.length > 200 ? "..." : ""));
      lines.push("");
    }

    for (const result of failed) {
      lines.push(`[${result.agentName}] ${result.taskName}: FEIL`);
      lines.push(`  Feil: ${result.output}`);
      lines.push("");
    }

    return lines.join("\n");
  }

  getAvailableAgents(): string[] {
    return Array.from(this.agents.keys());
  }

  private inferTaskName(agentName: string, command: string): string {
    const text = command.toLowerCase();

    if (agentName === "seo") {
      if (/konkurrent|competitor|gap|sammenlign/.test(text)) return "analyze_competition";
      if (/lenke|link|backlink|outreach/.test(text)) return "create_link_strategy";
      if (/optimaliser|meta|title|tittel|schema|side|on-page|onpage/.test(text)) return "optimize_for_seo";
      return "keyword_research";
    }

    if (agentName === "marketing") {
      if (/kampanje|campaign/.test(text)) return "create_campaign_strategy";
      if (/innhold|post|facebook|instagram|linkedin|tiktok|tekst|content/.test(text)) return "create_content";
      if (/mix|kalender|plan/.test(text)) return "optimize_content_mix";
      if (/mulighet|opportunit|idé|ide/.test(text)) return "identify_opportunities";
      return "analyze_market_trends";
    }

    if (agentName === "sales") {
      if (/funnel|trakt|konverter/.test(text)) return "optimize_funnel";
      if (/analyse|score|lead|pipeline/.test(text)) return "analyze_conversion";
      if (/hast|urgency|scarcity|knapphet/.test(text)) return "create_urgency";
      return "create_sales_copy";
    }

    if (agentName === "business") {
      if (/marked|analyse|konkurrent/.test(text)) return "analyze_market";
      if (/posisjon|brand|merkevare/.test(text)) return "create_positioning";
      if (/partner|samarbeid/.test(text)) return "identify_partnerships";
      return "develop_growth_strategy";
    }

    if (agentName === "multi-domain") {
      if (/seo/.test(text)) return "seo_strategy";
      if (/salg|konverter|lead/.test(text)) return "optimize_sales";
      if (/marked|analyse/.test(text)) return "analyze_market";
      if (/brand|synergi|tverr/.test(text)) return "cross_brand_narrative";
      return "create_content";
    }

    if (agentName === "youtube") {
      if (/tag/.test(text)) return "suggest_tags";
      if (/thumbnail|miniatyr/.test(text)) return "thumbnail_concept";
      if (/short/.test(text)) return "shorts_strategy";
      if (/kanal|strategi/.test(text)) return "channel_strategy";
      if (/tittel|title/.test(text)) return "optimize_title";
      if (/beskrivelse|description/.test(text)) return "generate_description";
      if (/seo|metadata/.test(text)) return "generate_youtube_seo";
      return "create_script";
    }

    if (agentName === "scheduling") {
      if (/uke|weekly|kalender|plan/.test(text)) return "create_weekly_schedule";
      if (/engasjement|analyse/.test(text)) return "analyze_engagement_patterns";
      if (/anbefal|forbedre/.test(text)) return "improve_content_recommendations";
      return "recommend_posting_time";
    }

    if (agentName === "ceo") {
      if (/deleger|agent|oppgave/.test(text)) return "delegate_tasks";
      if (/kalender|plan/.test(text)) return "plan_content_calendar";
      if (/brand|merkevare/.test(text)) return "brand_strategy";
      if (/analyse|status|ytelse/.test(text)) return "analyze_performance";
      if (/kampanje/.test(text)) return "create_campaign";
      return "growth_plan";
    }

    return command;
  }

  private buildParameters(agentName: string, command: string): Record<string, unknown> {
    return {
      prompt: command,
      command,
      topic: command,
      content: command,
      context: command,
      brand: this.detectBrand(command),
      industry: /eiendom|bolig|spain|spania|zeneco|soleada/i.test(command) ? "eiendom i Spania" : "digital merkevare",
      target_keyword: this.extractQuoted(command) || command,
      target_keywords: [this.extractQuoted(command) || command],
      current_title: this.extractQuoted(command) || "",
      content_type: /youtube|video/i.test(command) ? "YouTube" : /side|nettside|landing/i.test(command) ? "landingsside" : "innhold",
    };
  }

  private extractQuoted(command: string): string | null {
    const match = command.match(/["“](.+?)["”]/);
    return match?.[1] || null;
  }

  private detectBrand(command: string): string {
    const text = command.toLowerCase();
    if (text.includes("zeneco") || text.includes("zen eco")) return "Zen Eco Homes";
    if (text.includes("soleada")) return "Soleada.no";
    if (text.includes("re-master") || text.includes("remaster") || text.includes("neural beat")) return "Re-Master Freddy";
    if (text.includes("dona anna")) return "Dona Anna";
    if (text.includes("chatgenius")) return "ChatGenius.pro";
    if (text.includes("pinoso")) return "Pinoso Ecolife";
    return "RealtyFlow Pro";
  }
}
