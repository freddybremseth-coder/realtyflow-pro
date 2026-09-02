import { createClient } from "@supabase/supabase-js";
import { FatalError } from "workflow";
import { createAdminSession, getAdminEmails } from "@/lib/admin-auth";
import {
  BOOK_PRODUCTION_MAX_CHAPTER_PASSES,
  needsAuthorStart,
  needsBookBible,
  productionStage,
  snapshotBookProduction,
  type BookProductionProject,
  type BookProductionSnapshot,
} from "@/lib/publishing/book-production-autopilot";

type WorkflowInput = {
  productionRunId: string;
  projectId: string;
  origin: string;
};

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new FatalError("Supabase is not configured for Book production autopilot");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function loadProject(projectId: string): Promise<BookProductionProject> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("publishing_book_projects")
    .select("id,status,metadata_plan,outline_plan,chapter_drafts")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new FatalError(`Book project ${projectId} does not exist`);
  return data as BookProductionProject;
}

async function updateRun(
  productionRunId: string,
  snapshot: BookProductionSnapshot,
  values: Record<string, unknown>,
) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("publishing_book_production_runs")
    .update({
      stage: productionStage(snapshot),
      chapters_completed: snapshot.chaptersCompleted,
      chapters_total: snapshot.chaptersTotal,
      ...values,
    })
    .eq("id", productionRunId);
  if (error) throw new Error(error.message);
}

export async function inspectBookProductionStep(
  productionRunId: string,
  projectId: string,
  values: Record<string, unknown> = {},
) {
  "use step";

  const snapshot = snapshotBookProduction(await loadProject(projectId));
  await updateRun(productionRunId, snapshot, values);
  return snapshot;
}

async function internalOwnerHeaders() {
  const ownerEmail = getAdminEmails()[0];
  if (!ownerEmail) throw new FatalError("No Book production owner is configured");
  const session = await createAdminSession(ownerEmail, "OWNER");
  return {
    "Content-Type": "application/json",
    cookie: `realtyflow_admin=${encodeURIComponent(session)}`,
  };
}

async function callBookEngine(origin: string, projectId: string, mode: string, extra: Record<string, unknown> = {}) {
  const response = await fetch(new URL("/api/publishing/book-engine", origin), {
    method: "POST",
    cache: "no-store",
    headers: await internalOwnerHeaders(),
    body: JSON.stringify({ mode, id: projectId, ...extra }),
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const message = String(body.error || `Book Engine ${mode} failed with HTTP ${response.status}`);
    if (response.status >= 400 && response.status < 500) throw new FatalError(message);
    throw new Error(message);
  }
  return body;
}

export async function generateBookBibleStep(input: WorkflowInput) {
  "use step";

  const before = snapshotBookProduction(await loadProject(input.projectId));
  if (!needsBookBible(before)) return before;
  await callBookEngine(input.origin, input.projectId, "generate_seo");
  const after = snapshotBookProduction(await loadProject(input.projectId));
  if (needsBookBible(after)) throw new Error("Book Engine did not persist a locked production bible");
  await updateRun(input.productionRunId, after, { status: "running", current_step: 1, error: null });
  return after;
}

export async function generateAuthorStartStep(input: WorkflowInput) {
  "use step";

  const before = snapshotBookProduction(await loadProject(input.projectId));
  if (!needsAuthorStart(before)) return before;
  if (needsBookBible(before)) throw new FatalError("Author generation cannot start before the production bible is locked");
  await callBookEngine(input.origin, input.projectId, "generate_author");
  const after = snapshotBookProduction(await loadProject(input.projectId));
  if (needsAuthorStart(after)) throw new Error("Book Engine did not persist an outline and first chapter");
  await updateRun(input.productionRunId, after, { status: "running", current_step: 2, error: null });
  return after;
}

export async function continueBookStep(input: WorkflowInput, expectedChapterCount: number) {
  "use step";

  const before = snapshotBookProduction(await loadProject(input.projectId));
  if (before.readyForExport || before.chaptersCompleted > expectedChapterCount) {
    await updateRun(input.productionRunId, before, { status: "running", current_step: 3, error: null });
    return before;
  }
  if (before.chaptersCompleted < expectedChapterCount) {
    throw new FatalError("Book chapter count moved backwards during production");
  }

  await callBookEngine(input.origin, input.projectId, "continue", { chapter_count: 1 });
  const after = snapshotBookProduction(await loadProject(input.projectId));
  if (!after.readyForExport && after.chaptersCompleted <= before.chaptersCompleted) {
    throw new Error("Book Engine added no new chapter; retrying the durable step");
  }
  await updateRun(input.productionRunId, after, { status: "running", current_step: 3, error: null });
  return after;
}

export async function finishBookProductionStep(input: WorkflowInput, status: "completed" | "attention" | "failed", error?: string) {
  "use step";

  const snapshot = snapshotBookProduction(await loadProject(input.projectId));
  const finishedAt = new Date().toISOString();
  await updateRun(input.productionRunId, snapshot, {
    status,
    current_step: snapshot.readyForExport ? 3 : status === "failed" ? 0 : 3,
    completed_at: finishedAt,
    error: error || null,
    metadata: {
      controlled_boundary: snapshot.readyForExport ? "awaiting_human_final_approval" : "production_attention_required",
      project_status: snapshot.projectStatus,
      generation_state: snapshot.generationState,
    },
  });
  return snapshot;
}

export async function bookProductionAutopilot(input: WorkflowInput) {
  "use workflow";

  try {
    let snapshot = await inspectBookProductionStep(input.productionRunId, input.projectId, {
      status: "running",
      stage: "starting",
      started_at: new Date().toISOString(),
      error: null,
    });

    if (snapshot.readyForExport) {
      await finishBookProductionStep(input, "completed");
      return { status: "completed", projectId: input.projectId, chapters: snapshot.chaptersCompleted };
    }

    if (needsBookBible(snapshot)) snapshot = await generateBookBibleStep(input);
    if (needsAuthorStart(snapshot)) snapshot = await generateAuthorStartStep(input);

    for (let pass = 0; pass < BOOK_PRODUCTION_MAX_CHAPTER_PASSES && !snapshot.readyForExport; pass += 1) {
      snapshot = await continueBookStep(input, snapshot.chaptersCompleted);
    }

    if (!snapshot.readyForExport) {
      await finishBookProductionStep(input, "attention", "Production reached the chapter-pass safety limit");
      return { status: "attention", projectId: input.projectId, chapters: snapshot.chaptersCompleted };
    }

    await finishBookProductionStep(input, "completed");
    return { status: "completed", projectId: input.projectId, chapters: snapshot.chaptersCompleted };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishBookProductionStep(input, "failed", message);
    throw error;
  }
}
