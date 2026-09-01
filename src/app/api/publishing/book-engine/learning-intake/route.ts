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
  const { data: evidence, error: evidenceError } = await sb.from("publishing_learning_proposal_evidence")
    .select("id,proposal_id,evidence_type,evidence,created_at")
    .eq("proposal_id", proposalId)
    .order("created_at", { ascending: true });
  if (evidenceError) return NextResponse.json({ error: evidenceError.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    proposal,
    evidence: evidence ?? [],
    suggestedDraft: {
      title: proposal.proposed_title || "",
      seriesName: proposal.series_name || "",
      brief: proposal.rationale || "",
      canonNotes: `Book OS approved learning proposal: ${proposal.id}\nEvidence level: ${proposal.evidence_level}\nEvidence count: ${proposal.evidence_count}`,
    },
    safety: {
      readOnlyResolver: true,
      projectCreated: false,
      seoStarted: false,
      canonStarted: false,
      writingStarted: false,
      requiresExplicitCreate: true,
    },
  });
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  const proposalId = String(body?.proposalId || "").trim();
  const title = String(body?.title || "").trim();
  const brief = String(body?.brief || "").trim();
  if (!proposalId || !title || !brief) return NextResponse.json({ error: "proposalId, title and brief are required" }, { status: 400 });

  const sb = getServiceSupabase();
  if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const loaded = await loadApprovedNextBookProposal(sb, proposalId);
  if (!loaded.proposal) return loaded.response!;
  const proposal = loaded.proposal;

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
    production_started: false,
    seo_started: false,
    canon_started: false,
    writing_started: false,
    queued: false,
  });
}
