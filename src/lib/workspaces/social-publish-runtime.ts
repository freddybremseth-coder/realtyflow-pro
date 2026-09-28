import "server-only";
import { executePublishForDraft } from "@/services/publishing/publisher";

export type WorkspaceSocialPublishInput = Parameters<typeof executePublishForDraft>[0];
export type WorkspaceSocialPublishResult = Awaited<ReturnType<typeof executePublishForDraft>>;

export type WorkspaceSocialPublishRuntime = {
  publish: (input: WorkspaceSocialPublishInput) => Promise<WorkspaceSocialPublishResult>;
};

let testRuntime: WorkspaceSocialPublishRuntime | null = null;

const productionRuntime: WorkspaceSocialPublishRuntime = {
  publish: (input) => executePublishForDraft(input),
};

export function getWorkspaceSocialPublishRuntime(): WorkspaceSocialPublishRuntime {
  return testRuntime || productionRuntime;
}

export function setWorkspaceSocialPublishRuntimeForTests(runtime: WorkspaceSocialPublishRuntime | null) {
  testRuntime = runtime;
}
