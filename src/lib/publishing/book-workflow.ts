export type BookProjectWorkflowRow = {
  id: string;
  title?: string | null;
  subtitle?: string | null;
  language?: string | null;
  status?: string | null;
  source_book_id?: string | null;
  parent_project_id?: string | null;
  updated_at?: string | null;
  metadata_plan?: Record<string, unknown> | null;
  chapters?: number;
  words?: number;
};

export const BOOK_LIFECYCLE_STEPS = [
  "Idé og oppsett",
  "Seriebibel og canon",
  "Research og outline",
  "Kumulativt manus",
  "Redaksjon og fakta",
  "EPUB og publiseringspakke",
  "Endelig godkjenning",
  "Salg og forbedring",
] as const;

export type BookCockpitState = "working" | "attention" | "ready" | "approved";

export type BookCockpitStatus = {
  state: BookCockpitState;
  stage: number;
  stageLabel: string;
  nextLabel: string;
  activityLabel: string;
  error: string | null;
  progressPercent: number;
  updatedAt: string | null;
  usesCurrentWorkflow: boolean;
  approved: boolean;
};

export type PublishingBookWorkflowRow = {
  id: string;
  title?: string | null;
  asin?: string | null;
  source_project_id?: string | null;
  published_at?: string | null;
};

export type DistributionPublicationWorkflowRow = {
  project_id?: string | null;
  book_id?: string | null;
  channel?: string | null;
  status?: string | null;
  external_id?: string | null;
  external_url?: string | null;
};

const ARTIFACT_WORDS = /\b(?:complete\s+manuscript|final(?:e)?|endelig(?:e)?|export|epub|master(?:manus(?:cript)?)?|version|versjon|v\s*\d+(?:[._-]\d+)*)\b/gi;

export function normalizeBookIdentityTitle(value: unknown) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(ARTIFACT_WORDS, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function bookCockpitStatus(project: BookProjectWorkflowRow): BookCockpitStatus {
  const metadata = objectValue(project.metadata_plan);
  const production = objectValue(metadata.production_progress);
  const bible = objectValue(metadata.production_bible);
  const outline = objectValue(metadata.outline_plan);
  const approved = publicationApproval(project).approved;
  const productionState = textValue(production.status);
  const hasBible = bible.locked === true;
  const chapterCount = Math.max(0, Number(project.chapters || 0));
  const wordCount = Math.max(0, Number(project.words || 0));
  const hasOutline = Boolean(metadata.book_bible)
    || Array.isArray(outline.toc)
    || Number(production.step || 0) >= 2;
  const readyForExport = project.status === "ready_for_export";

  let stage = 1;
  if (hasBible) stage = 2;
  if (hasOutline || chapterCount > 0) stage = 3;
  if (chapterCount > 0 || wordCount > 0) stage = 4;
  if (readyForExport) stage = 6;
  if (approved) stage = 8;

  const error = productionState === "failed"
    ? textValue(production.error) || textValue(production.label) || "Produksjonen stoppet og trenger oppmerksomhet."
    : null;

  const state: BookCockpitState = error
    ? "attention"
    : approved
      ? "approved"
      : readyForExport
        ? "ready"
        : "working";

  const nextLabel = error
    ? "Åpne feilen og fortsett"
    : approved
      ? "Selg og forbedre"
      : readyForExport
        ? "Kontroller og godkjenn boken"
        : !hasBible
          ? "Oppgrader til seriebibel og canon"
          : chapterCount === 0
            ? "Lag outline og start manus"
            : "Fortsett manus og kvalitetsarbeid";

  const activityLabel = textValue(production.label)
    || (approved
      ? "Endelig manus er godkjent for distribusjon."
      : readyForExport
        ? "Manuset er klart for sluttkontroll."
        : chapterCount > 0
          ? `${chapterCount} kapitler · ${wordCount.toLocaleString("nb-NO")} ord`
          : "Bokprosjektet er opprettet.");

  return {
    state,
    stage,
    stageLabel: BOOK_LIFECYCLE_STEPS[stage - 1],
    nextLabel,
    activityLabel,
    error,
    progressPercent: Math.round((stage / BOOK_LIFECYCLE_STEPS.length) * 100),
    updatedAt: project.updated_at || null,
    usesCurrentWorkflow: hasBible,
    approved,
  };
}

export function publisherCockpitTargets<T extends BookProjectWorkflowRow>(projects: T[]) {
  const ordered = [...projects].sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
  const statuses = ordered.map((project) => ({ project, status: bookCockpitStatus(project) }));
  return {
    continueProject: statuses.find(({ status }) => status.state === "attention")?.project
      || statuses.find(({ status }) => status.state === "working")?.project
      || null,
    publishProject: statuses.find(({ status }) => status.state === "ready")?.project || null,
    growthProject: statuses.find(({ status }) => status.state === "approved")?.project || null,
    attentionCount: statuses.filter(({ status }) => status.state === "attention").length,
    activeCount: statuses.filter(({ status }) => status.state === "working" || status.state === "attention").length,
    readyCount: statuses.filter(({ status }) => status.state === "ready").length,
    approvedCount: statuses.filter(({ status }) => status.state === "approved").length,
  };
}

export function publicationApproval(project: BookProjectWorkflowRow) {
  const metadata = objectValue(project.metadata_plan);
  const approval = objectValue(metadata.publication_approval);
  const approvedRevisionAt = String(approval.approved_revision_at || "");
  const approved = approval.status === "approved"
    && Boolean(approvedRevisionAt)
    && approvedRevisionAt === String(project.updated_at || "");
  return {
    approved,
    stale: approval.status === "approved" && !approved,
    approvedAt: String(approval.approved_at || "") || null,
    approvedBy: String(approval.approved_by || "") || null,
    approvedRevisionAt: approvedRevisionAt || null,
  };
}

export function isDistributionReady(project: BookProjectWorkflowRow) {
  return project.status === "ready_for_export" && publicationApproval(project).approved;
}

export function groupBookProjects<T extends BookProjectWorkflowRow>(projects: T[]) {
  const byId = new Map(projects.map((project) => [project.id, project]));
  const rootId = (project: T) => {
    let current: BookProjectWorkflowRow = project;
    const seen = new Set<string>();
    while (current.parent_project_id && byId.has(current.parent_project_id) && !seen.has(current.parent_project_id)) {
      seen.add(current.id);
      current = byId.get(current.parent_project_id)!;
    }
    return current.id;
  };

  const groups = new Map<string, T[]>();
  const titleRoots = new Map<string, string>();
  for (const project of projects) {
    const lineageRoot = rootId(project);
    const titleIdentity = normalizeBookIdentityTitle(project.title);
    const subtitleIdentity = normalizeBookIdentityTitle(project.subtitle);
    const identity = titleIdentity ? `${titleIdentity}::${subtitleIdentity}` : project.id;
    const existingRoot = titleRoots.get(identity);
    const groupKey = existingRoot || lineageRoot;
    titleRoots.set(identity, groupKey);
    const rows = groups.get(groupKey) || [];
    rows.push(project);
    groups.set(groupKey, rows);
  }

  return [...groups.entries()].map(([id, editions]) => {
    const sorted = [...editions].sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
    const canonical = sorted.find((row) => !row.parent_project_id) || sorted[0];
    return { id, canonical, editions: sorted };
  }).sort((a, b) => String(b.canonical.updated_at || "").localeCompare(String(a.canonical.updated_at || "")));
}

export function verifiedAmazonProjectIds(
  projects: BookProjectWorkflowRow[],
  books: PublishingBookWorkflowRow[],
  publications: DistributionPublicationWorkflowRow[],
) {
  const ids = new Set<string>();
  const verifiedBookIds = new Set(
    books.filter((book) => Boolean(String(book.asin || "").trim()) || Boolean(book.published_at)).map((book) => book.id),
  );
  for (const book of books) {
    if (verifiedBookIds.has(book.id) && book.source_project_id) ids.add(book.source_project_id);
  }
  for (const project of projects) {
    if (project.source_book_id && verifiedBookIds.has(project.source_book_id)) ids.add(project.id);
  }
  for (const publication of publications) {
    if (publication.channel !== "amazon_kdp") continue;
    const verified = publication.status === "published"
      || Boolean(String(publication.external_id || "").trim())
      || Boolean(String(publication.external_url || "").trim());
    if (verified && publication.project_id) ids.add(publication.project_id);
  }
  return ids;
}
