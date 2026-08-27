export interface NexusAutomationAuditSupabase {
  from(table: string): {
    insert(values: Record<string, unknown>): Promise<{ error?: { message?: string } | null }>;
  };
}

export interface NexusAutomationAuditInput {
  name: string;
  path: string;
  status: "success" | "error";
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  agentName?: string;
}

export async function recordNexusAutomationRun(
  supabase: NexusAutomationAuditSupabase,
  audit: NexusAutomationAuditInput,
) {
  const startedAt = audit.startedAt || new Date().toISOString();
  const finishedAt = audit.finishedAt || new Date().toISOString();
  const input = {
    action: audit.name,
    name: audit.name,
    path: audit.path,
    ...(audit.input || {}),
  };
  const output = audit.output || {};

  const run = await supabase.from("automation_runs").insert({
    rule_id: null,
    status: audit.status,
    input,
    output,
    error: audit.error || null,
    started_at: startedAt,
    finished_at: finishedAt,
  });

  const log = await supabase.from("automation_logs").insert({
    action: audit.name.slice(0, 100),
    agent_name: audit.agentName || "nexus",
    status: audit.status,
    details: {
      path: audit.path,
      input,
      output,
      error: audit.error || null,
      started_at: startedAt,
      finished_at: finishedAt,
    },
  });

  return {
    ok: !run.error && !log.error,
    runError: run.error?.message || null,
    logError: log.error?.message || null,
  };
}

export async function bestEffortNexusAutomationAudit(
  supabase: NexusAutomationAuditSupabase,
  audit: NexusAutomationAuditInput,
) {
  try {
    return await recordNexusAutomationRun(supabase, audit);
  } catch (error) {
    return {
      ok: false,
      runError: error instanceof Error ? error.message : String(error),
      logError: null,
    };
  }
}
