import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildSmtpConfigFromAccount } from "@/services/email/account-auth";
import { checkCrmEmailSuppression } from "@/services/email/email-suppression";
import { sendEmail, type OutgoingEmail, type SmtpConfig } from "@/services/email/smtp-sender";
import { askClaude } from "@/services/ai/claude-client";

export type WorkspaceEmailRuntime = {
  checkSuppression: (supabase: SupabaseClient, recipients: string[]) =>
    ReturnType<typeof checkCrmEmailSuppression>;
  buildSmtp: (config: any, displayName?: string) => Promise<SmtpConfig>;
  send: (config: SmtpConfig, email: OutgoingEmail) => ReturnType<typeof sendEmail>;
  generateCampaign: (prompt: string) => Promise<string>;
};

let testRuntime: WorkspaceEmailRuntime | null = null;

const productionRuntime: WorkspaceEmailRuntime = {
  checkSuppression: (supabase, recipients) => checkCrmEmailSuppression(supabase, recipients),
  buildSmtp: (config, displayName) => buildSmtpConfigFromAccount(config, displayName),
  send: (config, email) => sendEmail(config, email),
  generateCampaign: (prompt) => askClaude(prompt, {
    maxTokens: 2200,
    temperature: 0.55,
    responseMimeType: "application/json",
  }),
};

export function getWorkspaceEmailRuntime(): WorkspaceEmailRuntime {
  return testRuntime || productionRuntime;
}

export function setWorkspaceEmailRuntimeForTests(runtime: WorkspaceEmailRuntime | null) {
  testRuntime = runtime;
}
