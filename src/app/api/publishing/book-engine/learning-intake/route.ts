import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

const PRODUCTION_WORKFLOW = ["series_bible", "research", "outline", "cumulative_manuscript", "editorial_review", "verification", "epub_zip", "final_approval"];

async function loadApprovedNextBookProposal(sb: NonNullable<ReturnType<typeof getServiceSupabase>>, proposalId: string) {
  const { data: proposal, error } = await sb.from("publishing_learning_proposals")
    .select("id,proposal_key,proposal_type,status,series_name,proposed_title,rationale,proposed_action,evidence_snapshot,evidence_count,evidence_level,proposed_by,proposed_at,decided_by,decided_at,decision_note")
    .eq("id", proposalId)
    .maybeSingle();
  if (error) return { proposal: null, response: NextResponse.json({ error: error.message }, { status: 500 }) };
  if (!proposal) return { proposal: null, response: NextResponse.json({ error: "Learning proposal not found" }, { status: 404 }) };
  if (proposal.proposal_type !== "next_book") return { proposal: null, response: NextResponse.json({ error: "Only approved next-book proposals can enter Book Engine intake" }, { status: 409 }) };
  if (proposal.status !== "approved") return { proposal: null, response: NextResponse.json({ error: "Learning proposal must be explicitly approved before Book Engine intake" }, { status: 409 }) };
  return { proposal, response: null };
}

function summarizeProject(project: Record<string, any> | null) {
  if (!project) return { existingProject: null, productionState: "not_created" };
  const metadata = (project.metadata_plan || {}) as Record<string, any>;
  const origin = (metadata.book_os_origin || {}) as Record<string, any>;
  const progress = (metadata.production_progress || {}) as Record<string, any>;
  const chapterCount = Array.isArray(project.chapter_drafts) ? project.chapter_drafts.length : 0;
  const outlineCount = Array.isArray(project.outline_plan?.toc) ? project.outline_plan.toc.length : 0;
  let productionState = "draft_pending";
  if (String(project.status || "") === "ready_for_export") productionState = "ready";
  else if (chapterCount > 0 || outlineCount > 0) productionState = "in_production";
  else if (String(project.status || "") === "generation_failed" || String(progress.status || "") === "failed") productionState = "attention";
  else if (origin.production_start_approved_at || String(progress.status || "") === "approved") productionState = "start_approved";
  else if (String(progress.status || "") === "pending") productionState = "draft_pending";
  return {
    productionState,
    existingProject: {
      id: project.id,
      title: project.title,
      status: project.status,
      updated_at: project.updated_at,
      chapter_count: chapterCount,
      outline_count: outlineCount,
      generation_state: metadata.generation_state || null,
      production_progress: progress,
      book_os_origin: origin,
    },
  };
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const proposalId = String(request.nextUrl.searchParams.get("proposalId") || "").trim();
  if (!proposalId) return NextResponse.json({ error: "proposalId is required" }, { status: 400 });

  const sb = getServiceSupabase();
  if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const loaded = await loadApprovedNextBookProposal(sb, proposalId);
  if (!loaded.proposal) return loaded.response!;
  const proposal = loaded.proposal;
  const [evidenceRes, projectRes] = await Promise.all([
    sb.from("publishing_learning_proposal_evidence")
      .select("id,proposal_id,evidence_type,evidence,created_at")
      .eq("proposal_id", proposalId)
      .order("created_at", { ascending: true }),
    sb.from("publishing_book_projects")
      .select("id,title,status,updated_at,metadata_plan,outline_plan,chapter_drafts")
      .contains("metadata_plan", { book_os_origin: { learning_proposal_id: proposalId } })
      .order("updated_at", { ascending: false })
      .limit(1),
  ]);
  const error = evidenceRes.error || projectRes.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const summary = summarizeProject((projectRes.data?.[0] as Record<string, any> | undefined) || null);

  return NextResponse.json({
    ok: true,
    proposal,
    evidence: evidenceRes.data ?? [],
    ...summary,
    suggestedDraft: {
      title: proposal.proposed_title || "",
      seriesName: proposal.series_name || "",
      brief: proposal.rationale || "",
      canonNotes: `Book OS approved learning proposal: ${proposal.id}\nEvidence level: ${proposal.evidence_level}\nEvidence count: ${proposal.evidence_count}`,
    },
    safety: {
      readOnlyResolver: true,
      projectCreated: Boolean(summary.existingProject),
      seoStarted: ["in_production", "ready"].includes(summary.productionState),
      canonStarted: ["in_production", "ready"].includes(summary.productionState),
      writingStarted: ["in_production", "ready"].includes(summary.productionState),
      requiresExplicitCreate: summary.productionState === "not_created",
      requiresExplicitProductionStart: ["draft_pending", "start_approved", "attention"].includes(summary.productionState),
    },
  });
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  const action = String(body?.action || "create_draft").trim();
  const proposalId = String(body?.proposalId || "").trim();
  if (!proposalId) return NextResponse.json({ error: "proposalId is required" }, { status: 400 });

  const sb = getServiceSupabase();
  if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const loaded = await loadApprovedNextBookProposal(sb, proposalId);
  if (!loaded.proposal) return loaded.response!;
  const proposal = loaded.proposal;

  if (action === "start_production") {
    const projectId = String(body?.projectId || "").trim();
    if (!projectId) return NextResponse.json({ error: "projectId is required for start_production" }, { status: 400 });

    const { data: project, error: projectError } = await sb.from("publishing_book_projects")
      .select("id,title,status,metadata_plan,outline_plan,chapter_drafts")
      .eq("id", projectId)
      .maybeSingle();
    if (projectError) return NextResponse.json({ error: projectError.message }, { status: 500 });
    if (!project) return NextResponse.json({ error: "Book Engine draft not found" }, { status: 404 });

    const metadata = (project.metadata_plan || {}) as Record<string, any>;
    const origin = (metadata.book_os_origin || {}) as Record<string, any>;
    if (origin.source !== "approved_learning_proposal" || String(origin.learning_proposal_id || "") !== proposalId) {
      return NextResponse.json({ error: "Project provenance does not match the approved learning proposal" }, { status: 409 });
    }
    if (origin.production_start_approved_at) {
      return NextResponse.json({
        ok: true,
        project,
        production_start_approved: true,
        already_approved: true,
        production_started: false,
        requires_explicit_generation: true,
      });
    }
    if (String(metadata.production_progress?.status || "") !== "pending" || String(project.status || "") !== "draft") {
      return NextResponse.json({ error: "Learning-origin project is not in pending draft state" }, { status: 409 });
    }
    if ((Array.isArray(project.chapter_drafts) && project.chapter_drafts.length > 0) || (Array.isArray(project.outline_plan?.toc) && project.outline_plan.toc.length > 0)) {
      return NextResponse.json({ error: "Pending learning draft already contains production output" }, { status: 409 });
    }

    const now = new Date().toISOString();
    const nextMetadata = {
      ...metadata,
      generation_state: "production_start_approved",
      book_os_origin: {
        ...origin,
        production_start_approved_at: now,
        production_start_authority: "explicit_admin_action",
      },
      production_progress: {
        ...(metadata.production_progress || {}),
        stage: "registered",
        step: 0,
        total_steps: 3,
        label: "Controlled production start approved; awaiting series bible/canon",
        status: "approved",
        started_at: null,
        updated_at: now,
      },
    };
    const { data: updated, error: updateError } = await sb.from("publishing_book_projects")
      .update({ metadata_plan: nextMetadata, updated_at: now })
      .eq("id", projectId)
      .select()
      .single();
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    return NextResponse.json({
      ok: true,
      project: updated,
      production_start_approved: true,
      production_started: false,
      requires_explicit_generation: true,
    });
  }

  if (action !== "create_draft") return NextResponse.json({ error: "Unsupported learning intake action" }, { status: 400 });

  const title = String(body?.title || "").trim();
  const brief = String(body?.brief || "").trim();
  if (!title || !brief) return NextResponse.json({ error: "title and brief are required" }, { status: 400 });

  const { data: existing, error: existingError } = await sb.from("publishing_book_projects")
    .select("id,title,metadata_plan")
    .contains("metadata_plan", { book_os_origin: { learning_proposal_id: proposalId } })
    .limit(1);
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  if ((existing ?? []).length) return NextResponse.json({ error: "This approved learning proposal already has a Book Engine draft", project: existing?.[0] }, { status: 409 });

  const pages = Math.min(Math.max(Number(body?.pages || 180), 60), 800);
  const now = new Date().toISOString();
  const metadataPlan = {
    generation_state: "registered",
    generation_provider: "openai_primary",
    production_workflow_version: "2.0",
    production_workflow: PRODUCTION_WORKFLOW,
    production_progress: {
      stage: "registered",
      step: 0,
      total_steps: 3,
      label: "Draft registered from approved Book OS learning proposal; production not started",
      status: "pending",
      started_at: null,
      updated_at: now,
    },
    consistency_notes: String(body?.canonNotes || "").trim(),
    source_mode: "from_brief",
    source_material: "",
    source_instructions: "",
    book_os_origin: {
      source: "approved_learning_proposal",
      learning_proposal_id: proposal.id,
      proposal_key: proposal.proposal_key,
      proposal_type: proposal.proposal_type,
      proposal_status: proposal.status,
      series_name: proposal.series_name,
      proposed_title: proposal.proposed_title,
      evidence_count: proposal.evidence_count,
      evidence_level: proposal.evidence_level,
      approved_by: proposal.decided_by,
      approved_at: proposal.decided_at,
      registered_at: now,
      production_start_approved_at: null,
    },
  };

  const { data: project, error: createError } = await sb.from("publishing_book_projects").insert({
    brand_id: "freddypublishing",
    title,
    subtitle: "",
    language: String(body?.language || "en"),
    niche: "",
    genre: String(body?.genre || "guide"),
    series_name: String(body?.seriesName || proposal.series_name || "").trim(),
    audience: String(body?.audience || "").trim(),
    positioning: brief,
    target_words: Math.max(12000, Math.round(pages * 190)),
    target_pages: pages,
    seed_keywords: [],
    status: "draft",
    metadata_plan: metadataPlan,
    outline_plan: { book_promise: "", toc: [], writing_plan: [] },
    chapter_drafts: [],
    updated_at: now,
  }).select().single();
  if (createError) return NextResponse.json({ error: createError.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    project,
    origin: metadataPlan.book_os_origin,
    project_created: true,
    production_start_approved: false,
    production_started: false,
    seo_started: false,
    canon_started: false,
    writing_started: false,
    queued: false,
  });
}
