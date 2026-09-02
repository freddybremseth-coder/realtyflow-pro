export const BOOK_PRODUCTION_MAX_CHAPTER_PASSES = 120;

export type BookProductionProject = {
  id: string;
  status?: string | null;
  metadata_plan?: Record<string, unknown> | null;
  outline_plan?: Record<string, unknown> | null;
  chapter_drafts?: unknown[] | null;
};

export type BookProductionSnapshot = {
  projectId: string;
  projectStatus: string;
  generationState: string;
  bibleLocked: boolean;
  hasOutline: boolean;
  chaptersCompleted: number;
  chaptersTotal: number;
  readyForExport: boolean;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function snapshotBookProduction(project: BookProductionProject): BookProductionSnapshot {
  const metadata = asRecord(project.metadata_plan);
  const bible = asRecord(metadata.production_bible);
  const outline = asRecord(project.outline_plan);
  const toc = asArray(outline.toc);
  const chapters = asArray(project.chapter_drafts);
  const projectStatus = String(project.status || "draft");

  return {
    projectId: project.id,
    projectStatus,
    generationState: String(metadata.generation_state || ""),
    bibleLocked: bible.locked === true,
    hasOutline: toc.length > 0,
    chaptersCompleted: chapters.length,
    chaptersTotal: toc.length,
    readyForExport: projectStatus === "ready_for_export",
  };
}

export function needsBookBible(snapshot: BookProductionSnapshot) {
  if (snapshot.readyForExport) return false;
  return !snapshot.bibleLocked;
}

export function needsAuthorStart(snapshot: BookProductionSnapshot) {
  if (snapshot.readyForExport) return false;
  return !snapshot.hasOutline || snapshot.chaptersCompleted === 0;
}

export function needsMoreChapters(snapshot: BookProductionSnapshot) {
  if (snapshot.readyForExport) return false;
  if (!snapshot.hasOutline) return true;
  return snapshot.chaptersCompleted < snapshot.chaptersTotal;
}

export function productionStage(snapshot: BookProductionSnapshot) {
  if (snapshot.readyForExport) return "ready_for_export";
  if (needsBookBible(snapshot)) return "series_bible";
  if (needsAuthorStart(snapshot)) return "outline_and_first_chapter";
  return "chapter_drafting";
}

export function resolveBookAutopilotOrigin(requestOrigin: string, env: NodeJS.ProcessEnv = process.env) {
  const candidate = new URL(requestOrigin);
  const allowed = new Set<string>(["realtyflow.chatgenius.pro"]);
  for (const raw of [
    env.NEXT_PUBLIC_REALTYFLOW_URL,
    env.VERCEL_URL,
    env.VERCEL_BRANCH_URL,
    env.VERCEL_PROJECT_PRODUCTION_URL,
  ]) {
    if (!raw) continue;
    try {
      const normalized = raw.startsWith("http") ? raw : `https://${raw}`;
      allowed.add(new URL(normalized).hostname.toLowerCase());
    } catch {
      // Ignore malformed optional configuration and keep the fixed allow-list.
    }
  }

  const hostname = candidate.hostname.toLowerCase();
  const isLocal = env.NODE_ENV !== "production"
    && (hostname === "localhost" || hostname === "127.0.0.1");
  const isVercelDeployment = candidate.protocol === "https:" && hostname.endsWith(".vercel.app");
  const isConfiguredHost = candidate.protocol === "https:" && allowed.has(hostname);
  if (!isLocal && !isVercelDeployment && !isConfiguredHost) {
    throw new Error("Book production autopilot origin is not allowed");
  }
  return candidate.origin;
}
