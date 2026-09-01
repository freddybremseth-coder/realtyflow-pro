export type LearningOriginGuardMode = "generate_seo" | "generate_author" | "continue";

export type LearningOriginGuardProject = {
  status?: string | null;
  metadata_plan?: Record<string, any> | null;
  outline_plan?: Record<string, any> | null;
  chapter_drafts?: unknown[] | null;
};

export type LearningOriginGuardResult =
  | { allowed: true; learningOrigin: false | true }
  | { allowed: false; learningOrigin: true; status: 409; code: string; message: string };

export function guardLearningOriginProduction(
  project: LearningOriginGuardProject,
  mode: LearningOriginGuardMode,
): LearningOriginGuardResult {
  const metadata = (project.metadata_plan || {}) as Record<string, any>;
  const origin = (metadata.book_os_origin || {}) as Record<string, any>;
  if (origin.source !== "approved_learning_proposal") {
    return { allowed: true, learningOrigin: false };
  }

  const productionStartApproved = Boolean(origin.production_start_approved_at);
  if (!productionStartApproved) {
    return {
      allowed: false,
      learningOrigin: true,
      status: 409,
      code: "learning_production_start_required",
      message: "Learning-origin Book Engine production requires explicit controlled production-start approval.",
    };
  }

  if (mode === "generate_seo") {
    return { allowed: true, learningOrigin: true };
  }

  const productionBible = (metadata.production_bible || {}) as Record<string, any>;
  if (!productionBible.locked || String(metadata.generation_state || "") === "production_start_approved") {
    return {
      allowed: false,
      learningOrigin: true,
      status: 409,
      code: "learning_canon_required",
      message: "Learning-origin author generation requires the SEO/series-bible/canon step to complete first.",
    };
  }

  if (mode === "generate_author") {
    return { allowed: true, learningOrigin: true };
  }

  const toc = Array.isArray(project.outline_plan?.toc) ? project.outline_plan?.toc : [];
  const drafts = Array.isArray(project.chapter_drafts) ? project.chapter_drafts : [];
  const authorStepStarted = toc.length > 0 || drafts.length > 0 || ["author_ready", "author_partial"].includes(String(metadata.generation_state || ""));
  if (!authorStepStarted) {
    return {
      allowed: false,
      learningOrigin: true,
      status: 409,
      code: "learning_author_step_required",
      message: "Learning-origin continuation requires the controlled outline/first-chapter step to run first.",
    };
  }

  return { allowed: true, learningOrigin: true };
}
