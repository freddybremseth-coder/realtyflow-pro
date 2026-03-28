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

    const task: AgentTask = {
      id: crypto.randomUUID(),
      name: command,
      description: command,
      priority: "medium",
      parameters: {},
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
        name: taskDescription,
        description: taskDescription,
        priority: "high",
        parameters: {},
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
}
