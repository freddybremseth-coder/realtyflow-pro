import {
  AnalysisEvidenceDenied,
  assertTrustedAnalysisEvidence,
  verifyCommandAnalysisCandidate,
  type AnalysisReviewPacket,
  type TrustedAnalysisScope,
  type TrustedEvidence,
} from "./command-analysis-evidence";

/**
 * Disposable CI-only analysis adapter contract. A trusted *test* adapter can
 * invoke one mocked model candidate. This code is NOT an API route, scheduled
 * job or deployed agent worker; it cannot run outside an explicit GitHub CI
 * harness. A future real model adapter requires separate identity, tenancy,
 * cost preauthorization, rate limits, provider key controls and staging review.
 */
export type ReadOnlyAnalysisModelRequest = Readonly<{
  mode: "READ_ONLY_ANALYSIS_CI";
  missionId: string;
  agentId: string;
  goal: string;
  evidence: readonly Readonly<{ id: string; excerpt: string }>[];
  allowedTools: readonly [];
  maxInputTokens: number;
  maxOutputTokens: number;
  signal: AbortSignal;
}>;

export type ModelCandidateReceipt = Readonly<{
  candidate: unknown;
  usage: Readonly<{
    inputTokens: number;
    outputTokens: number;
    estimatedCostCents: number;
  }>;
}>;

export type AnalysisHarnessReceipt = Readonly<{
  reviewPacket: AnalysisReviewPacket;
  modelCalls: 1;
  usage: ModelCandidateReceipt["usage"];
  externalActionsPerformed: 0;
}>;

const fail = (reason: string): never => {
  throw new AnalysisEvidenceDenied(reason);
};

/**
 * Harness only; no real data/keys, and no silent fallback to production.
 * Test model output becomes a candidate requiring separate human review.
 */
export async function runCommandAnalysisTestHarness(input: Readonly<{
  scope: TrustedAnalysisScope;
  sources: readonly TrustedEvidence[];
  goal: string;
  now: string;
  preparedState: "prepared";
  model: (request: ReadOnlyAnalysisModelRequest) => Promise<ModelCandidateReceipt>;
}>): Promise<AnalysisHarnessReceipt> {
  if (process.env.GITHUB_ACTIONS !== "true" ||
      process.env.ALTOVENA_ANALYSIS_TEST_HARNESS !== "true" ||
      process.env.NODE_ENV === "production") fail("ci_harness_disabled");
  if (input.preparedState !== "prepared" ||
      typeof input.goal !== "string" || !input.goal.trim() ||
      input.goal.length > 4000) fail("preparation_or_goal_invalid");
  assertTrustedAnalysisEvidence(input.scope, input.sources, input.now);

  const evidence = Object.freeze(input.sources.map(item => Object.freeze({
    id: item.id, excerpt: item.excerpt,
  })));
  const controller = new AbortController();
  const limit = setTimeout(() => controller.abort(), 5_000);
  try {
    // The *injected CI mock* is the only callback. This is deliberately NOT
    // wired to OpenAI/Gemini/Anthropic, tools, CRM, email or Nexus dispatch.
    const receipt = await Promise.race([
      input.model(Object.freeze({
        mode: "READ_ONLY_ANALYSIS_CI",
        missionId: input.scope.missionId,
        agentId: input.scope.agentId,
        goal: input.goal,
        evidence,
        allowedTools: Object.freeze([]) as readonly [],
        maxInputTokens: 1200,
        maxOutputTokens: 700,
        signal: controller.signal,
      })),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener("abort", () => reject(
          new AnalysisEvidenceDenied("analysis_timeout")), { once: true });
      }),
    ]);
    const usage = receipt?.usage;
    if (!usage || !Number.isSafeInteger(usage.inputTokens) ||
        !Number.isSafeInteger(usage.outputTokens) ||
        !Number.isSafeInteger(usage.estimatedCostCents) ||
        usage.inputTokens < 0 || usage.inputTokens > 1200 ||
        usage.outputTokens < 0 || usage.outputTokens > 700 ||
        usage.estimatedCostCents < 0 || usage.estimatedCostCents > 20)
      fail("reported_usage_exceeds_ci_ceiling");
    return {
      reviewPacket: verifyCommandAnalysisCandidate({
        scope: input.scope, sources: input.sources,
        candidate: receipt.candidate, now: input.now,
      }),
      modelCalls: 1,
      usage: {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        estimatedCostCents: usage.estimatedCostCents,
      },
      externalActionsPerformed: 0,
    };
  } finally {
    clearTimeout(limit);
    controller.abort();
  }
}
