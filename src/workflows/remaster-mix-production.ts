import { runOneRemasterMixJob } from "@/services/pipelines/remaster-mix-worker";

type RemasterMixWorkflowInput = {
  requestedJobId?: string | null;
  trigger: "admin" | "cron";
};

export async function runRemasterMixProductionStep(input: RemasterMixWorkflowInput) {
  "use step";

  // The durable database queue remains the source of truth. The requested id
  // is carried for observability only; atomic claim/lease logic decides which
  // eligible 30-minute production job is safe to execute.
  const workerId = `mix-workflow-${input.trigger}-${input.requestedJobId || "queue"}`;
  return runOneRemasterMixJob(workerId);
}

export async function remasterMixProduction(input: RemasterMixWorkflowInput) {
  "use workflow";

  return runRemasterMixProductionStep(input);
}
