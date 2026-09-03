import type { SupabaseClient } from "@supabase/supabase-js";
import { bookCockpitStatus, publisherCockpitTargets, type BookProjectWorkflowRow } from "@/lib/publishing/book-workflow";

type ProjectRow = BookProjectWorkflowRow & {
  chapter_drafts?: unknown;
  outline_plan?: unknown;
  series_name?: string | null;
};

export type PublishingAttentionState = "attention" | "working" | "ready" | "approved";

export interface PublishingAttentionItem {
  id: string;
  title: string;
  seriesName: string | null;
  state: PublishingAttentionState;
  stage: number;
  stageLabel: string;
  nextAction: string;
  activity: string;
  updatedAt: string | null;
}

export interface PublishingMentorSummary {
  source: "book_os";
  generatedAt: string;
  counts: {
    active: number;
    attention: number;
    ready: number;
    approved: number;
    distributionAwaitingApproval: number;
    distributionBlocked: number;
    published: number;
    learningProposalsPending: number;
  };
  topAttention: PublishingAttentionItem[];
  topLearningProposal: {
    id: string;
    title: string;
    rationale: string | null;
    evidenceLevel: string | null;
    evidenceCount: number | null;
    status: string | null;
  } | null;
  warnings: string[];
  safety: {
    readOnly: true;
    persistAsPersonalMemory: false;
    outboundActions: false;
  };
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function chapterDrafts(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : [];
}

function outlineCount(value: unknown): number {
  const outline = objectValue(value);
  return Array.isArray(outline.toc) ? outline.toc.length : 0;
}

function projectWithCounts(project: ProjectRow): BookProjectWorkflowRow & ProjectRow {
  const drafts = chapterDrafts(project.chapter_drafts);
  const words = drafts.reduce((total, chapter) => {
    const text = [chapter.draft, chapter.content, chapter.text].find((value) => typeof value === "string") as string | undefined;
    return total + (text ? text.trim().split(/\s+/).filter(Boolean).length : 0);
  }, 0);
  return {
    ...project,
    chapters: drafts.length || outlineCount(project.outline_plan),
    words,
  };
}

function attentionItem(project: ProjectRow): PublishingAttentionItem {
  const enriched = projectWithCounts(project);
  const status = bookCockpitStatus(enriched);
  return {
    id: String(project.id),
    title: String(project.title || "Untitled book"),
    seriesName: project.series_name || null,
    state: status.state,
    stage: status.stage,
    stageLabel: status.stageLabel,
    nextAction: status.nextLabel,
    activity: status.activityLabel,
    updatedAt: status.updatedAt,
  };
}

export async function loadPublishingMentorSummary(supabase: SupabaseClient): Promise<PublishingMentorSummary> {
  const [projectsRes, publicationsRes, jobsRes, proposalsRes] = await Promise.all([
    supabase.from("publishing_book_projects")
      .select("id,title,subtitle,language,status,series_name,metadata_plan,chapter_drafts,outline_plan,updated_at")
      .order("updated_at", { ascending: false })
      .limit(200),
    supabase.from("publishing_distribution_publications")
      .select("id,status,updated_at")
      .order("updated_at", { ascending: false })
      .limit(500),
    supabase.from("publishing_distribution_jobs")
      .select("id,status,updated_at")
      .order("updated_at", { ascending: false })
      .limit(500),
    supabase.from("publishing_learning_proposals")
      .select("*")
      .order("proposed_at", { ascending: false })
      .limit(100),
  ]);

  const warnings: string[] = [];
  for (const [label, result] of [
    ["publishing_book_projects", projectsRes],
    ["publishing_distribution_publications", publicationsRes],
    ["publishing_distribution_jobs", jobsRes],
    ["publishing_learning_proposals", proposalsRes],
  ] as const) {
    if (result.error) warnings.push(`${label}: ${result.error.message}`);
  }

  const projects = ((projectsRes.data || []) as ProjectRow[]).map(projectWithCounts);
  const targets = publisherCockpitTargets(projects);
  const statuses = projects.map((project) => ({ project, status: bookCockpitStatus(project) }));
  const orderedAttention = statuses
    .filter(({ status }) => status.state === "attention" || status.state === "ready" || status.state === "working")
    .sort((a, b) => {
      const rank = { attention: 0, ready: 1, working: 2, approved: 3 } as const;
      return rank[a.status.state] - rank[b.status.state]
        || String(b.project.updated_at || "").localeCompare(String(a.project.updated_at || ""));
    })
    .slice(0, 5)
    .map(({ project }) => attentionItem(project as ProjectRow));

  const jobs = jobsRes.data || [];
  const publications = publicationsRes.data || [];
  const proposals = (proposalsRes.data || []) as Array<Record<string, unknown>>;
  const pendingProposal = proposals.find((row) => ["proposed", "pending", "approved"].includes(String(row.status || ""))) || null;

  const topLearningProposal = pendingProposal ? {
    id: String(pendingProposal.id || ""),
    title: String(pendingProposal.proposed_title || pendingProposal.title || "Next-book proposal"),
    rationale: typeof pendingProposal.rationale === "string" ? pendingProposal.rationale : null,
    evidenceLevel: typeof pendingProposal.evidence_level === "string" ? pendingProposal.evidence_level : null,
    evidenceCount: typeof pendingProposal.evidence_count === "number" ? pendingProposal.evidence_count : null,
    status: typeof pendingProposal.status === "string" ? pendingProposal.status : null,
  } : null;

  return {
    source: "book_os",
    generatedAt: new Date().toISOString(),
    counts: {
      active: targets.activeCount,
      attention: targets.attentionCount,
      ready: targets.readyCount,
      approved: targets.approvedCount,
      distributionAwaitingApproval: jobs.filter((row) => row.status === "awaiting_approval").length,
      distributionBlocked: jobs.filter((row) => row.status === "blocked").length,
      published: publications.filter((row) => row.status === "published").length,
      learningProposalsPending: proposals.filter((row) => ["proposed", "pending", "approved"].includes(String(row.status || ""))).length,
    },
    topAttention: orderedAttention,
    topLearningProposal,
    warnings,
    safety: {
      readOnly: true,
      persistAsPersonalMemory: false,
      outboundActions: false,
    },
  };
}
