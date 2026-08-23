/**
 * Agentic Executor — utfører GODKJENTE handlinger og lukker sløyfen
 * (AI foreslår → menneske godkjenner → system utfører).
 *
 * Utfører KUN elementer med status "approved". Idempotent (executed → skip).
 * Ruter på gatedActionClass til en registrert executor. Sending går gjennom en
 * injisert ExecutorSender som støtter dry-run — ekte utsending krever eksplisitt
 * live-modus. Alt publiseres til revenue_events (outcome="executed").
 */

import type { RunOutcome } from "./schemas";
import type { ApprovalItem } from "./approval-gateway";

export interface DraftRef {
  id: string;
  contactRef?: string | null;
  channel?: string | null;
  subject?: string | null;
  body: string;
  brandId?: string | null;
}

export interface ExecutorSender {
  sendEmail(args: { to: string; subject: string; body: string; brandId?: string | null }): Promise<{ detail: string; dryRun: boolean }>;
}

export interface ExecutorStore {
  get(id: string): Promise<ApprovalItem | null>;
  getDraft(draftId: string): Promise<DraftRef | null>;
  markExecuted(id: string, at: string, detail: string, executedBy: string): Promise<void>;
}

export interface GatewayExecutedEvent {
  runId?: string;
  outcome: Extract<RunOutcome, "executed">;
  title: string;
  subjectType: string;
  subjectRef?: string;
  revenueImpactEur?: number;
}

export interface ExecutorDeps {
  store: ExecutorStore;
  sender: ExecutorSender;
  publishEvent: (e: GatewayExecutedEvent) => Promise<void>;
  now?: () => Date;
}

export type ActionExecutor = (item: ApprovalItem, deps: ExecutorDeps) => Promise<{ detail: string }>;

export interface ExecuteResult {
  ok: boolean;
  executed?: boolean;
  alreadyExecuted?: boolean;
  skipped?: boolean;
  detail?: string;
  error?: string;
}

/** send_personal: hent godkjent utkast og send (eller dry-run). */
export const sendPersonalExecutor: ActionExecutor = async (item, deps) => {
  if (!item.draftId) throw new Error("mangler draftId");
  const draft = await deps.store.getDraft(item.draftId);
  if (!draft) throw new Error("fant ikke utkast");
  const to = draft.contactRef || item.customerRef || "";
  if (!to) throw new Error("mangler mottaker");
  const r = await deps.sender.sendEmail({ to, subject: draft.subject || "Oppfølging", body: draft.body, brandId: draft.brandId });
  return { detail: r.dryRun ? `DRY-RUN: ville sendt e-post til ${to}` : `E-post sendt til ${to} (${r.detail})` };
};

export const DEFAULT_EXECUTORS: Record<string, ActionExecutor> = {
  send_personal: sendPersonalExecutor,
};

export async function executeApproval(
  deps: ExecutorDeps,
  args: { id: string; executedBy: string; executors?: Record<string, ActionExecutor> },
): Promise<ExecuteResult> {
  const item = await deps.store.get(args.id);
  if (!item) return { ok: false, error: "NOT_FOUND" };
  if (item.status === "executed") return { ok: true, alreadyExecuted: true };
  if (item.status !== "approved") return { ok: false, error: `Kan kun utføre godkjente handlinger (status=${item.status}).` };

  const exec = (args.executors ?? DEFAULT_EXECUTORS)[item.gatedActionClass];
  if (!exec) return { ok: true, skipped: true, detail: `Ingen executor for «${item.gatedActionClass}».` };

  try {
    const { detail } = await exec(item, deps);
    const at = (deps.now?.() ?? new Date()).toISOString();
    await deps.store.markExecuted(args.id, at, detail, args.executedBy);
    await deps.publishEvent({
      runId: item.runId ?? undefined,
      outcome: "executed",
      title: `UTFØRT: ${item.title}`,
      subjectType: String(item.subjectType),
      subjectRef: item.subjectRef ?? undefined,
      revenueImpactEur: item.estimatedOpportunityEur ?? undefined,
    });
    return { ok: true, executed: true, detail };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Utførelse feilet" };
  }
}
