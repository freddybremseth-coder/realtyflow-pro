import { runOneRemasterMixJob } from "@/services/pipelines/remaster-mix-worker";

type RemasterMixWorkflowV2Input = {
  requestedJobId?: string | null;
  trigger: "admin" | "cron";
};

/**
 * V2 intentionally uses a new workflow/step identity so Vercel Workflow cannot
 * reuse an older registered step bundle from the first production iterations.
 * The durable Supabase queue remains the source of truth for claim/lease safety.
 */
export async function runRemasterMixProductionV2Step(input: RemasterMixWorkflowV2Input) {
  "use step";

  const workerId = `mix-workflow-v2-${input.trigger}-${input.requestedJobId || "queue"}`;
  return runOneRemasterMixJob(workerId);
}

export async function remasterMixProductionV2(input: RemasterMixWorkflowV2Input) {
  "use workflow";

  return runRemasterMixProductionV2Step(input);
}
