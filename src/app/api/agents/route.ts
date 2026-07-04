import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { AgentOrchestrator } from "@/services/agents/orchestrator";
import { getConfiguredAIProviders } from "@/services/ai/claude-client";

export async function GET(req: NextRequest) {
  const unauthorized = await requireAdminApi(req, { agents: [], providers: getConfiguredAIProviders() });
  if (unauthorized) return unauthorized;

  const orchestrator = new AgentOrchestrator();
  const capabilities = orchestrator.getAgentCapabilities();
  return NextResponse.json({ agents: capabilities, providers: getConfiguredAIProviders() });
}

export async function POST(req: NextRequest) {
  try {
    const unauthorized = await requireAdminApi(req);
    if (unauthorized) return unauthorized;

    const body = await req.json();
    const { agent, command, tasks, multiAgent, agents: agentNames } = body;
    const orchestrator = new AgentOrchestrator();

    if (multiAgent && agentNames) {
      const result = await orchestrator.runMultiAgentTask(command, agentNames);
      return NextResponse.json(result);
    }

    // Support tasks array format (used by Content Studio)
    if (agent && tasks && Array.isArray(tasks)) {
      const agentInstance = orchestrator.getAgent(agent);
      if (!agentInstance) {
        return NextResponse.json(
          { error: `Agent "${agent}" not found` },
          { status: 400 }
        );
      }

      const agentTasks = tasks.map((t: { type: string; parameters?: Record<string, unknown> }) => ({
        id: crypto.randomUUID(),
        name: t.type,
        description: t.type,
        priority: "medium" as const,
        parameters: t.parameters || {},
        status: "pending" as const,
      }));

      const results = await agentInstance.executeTasks(agentTasks);
      return NextResponse.json({ results });
    }

    if (!agent || !command) {
      return NextResponse.json(
        { error: "Missing agent or command" },
        { status: 400 }
      );
    }

    const result = await orchestrator.executeCommand(agent, command);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
