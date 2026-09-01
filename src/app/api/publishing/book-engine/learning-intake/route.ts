import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const proposalId = String(request.nextUrl.searchParams.get("proposalId") || "").trim();
  if (!proposalId) return NextResponse.json({ error: "proposalId is required" }, { status: 400 });

  const sb = getServiceSupabase();
  if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const [{ data: proposal, error: proposalError }, { data: evidence, error: evidenceError }] = await Promise.all([
    sb.from("publishing_learning_proposals")
      .select("id,proposal_type,status,series_name,proposed_title,rationale,proposed_action,evidence_snapshot,evidence_count,evidence_level,proposed_by,proposed_at,decided_by,decided_at,decision_note")
      .eq("id", proposalId)
      .maybeSingle(),
    sb.from("publishing_learning_proposal_evidence")
      .select("id,proposal_id,evidence_type,evidence,created_at")
      .eq("proposal_id", proposalId)
      .order("created_at", { ascending: true }),
  ]);

  const error = proposalError || evidenceError;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!proposal) return NextResponse.json({ error: "Learning proposal not found" }, { status: 404 });
  if (proposal.proposal_type !== "next_book") {
    return NextResponse.json({ error: "Only approved next-book proposals can enter Book Engine intake" }, { status: 409 });
  }
  if (proposal.status !== "approved") {
    return NextResponse.json({ error: "Learning proposal must be explicitly approved before Book Engine intake" }, { status: 409 });
  }

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
