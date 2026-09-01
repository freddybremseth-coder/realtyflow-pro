"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type Proposal = { id: string; proposal_type?: string; edition_id?: string | null; revision_id?: string | null; dimension?: string; success_metric?: string | null; evidence_count?: number; evidence_level?: string; status?: string; rationale?: string };
type LearningPayload = { proposals?: Proposal[] };
type ExperimentFocus = { revisionMatches?: boolean; learningEligible?: boolean; eligibleLearningGroups?: Array<{ channel?: string; marketplace?: string; changeField?: string; successMetric?: string; experimentCount?: number; averageRelativeLift?: number }> };

export function LearningFocusContext() {
  const search = useSearchParams();
  const editionId = String(search.get("editionId") || "").trim();
  const revisionId = String(search.get("revisionId") || "").trim();
  const [learning, setLearning] = useState<LearningPayload | null>(null);
  const [evidence, setEvidence] = useState<ExperimentFocus | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!editionId) { setLoaded(true); return; }
    const params = new URLSearchParams({ editionId });
    if (revisionId) params.set("revisionId", revisionId);
    Promise.all([
      fetch("/api/book-growth/learning", { cache: "no-store" }).then((res) => res.json()),
      fetch(`/api/book-growth/experiments/focus?${params.toString()}`, { cache: "no-store" }).then((res) => res.json()),
    ]).then(([learningBody, evidenceBody]) => {
      setLearning(learningBody || {});
      setEvidence(evidenceBody || {});
    }).catch(() => {
      setLearning({}); setEvidence({});
    }).finally(() => setLoaded(true));
  }, [editionId, revisionId]);

  const focusedProposals = useMemo(() => (learning?.proposals || []).filter((row) => row.proposal_type === "improvement" && row.edition_id === editionId && (!revisionId || row.revision_id === revisionId)), [learning, editionId, revisionId]);
  const pending = focusedProposals.filter((row) => row.status === "pending");
  const approved = focusedProposals.filter((row) => row.status === "approved");
  const groups = evidence?.eligibleLearningGroups || [];

  if (!editionId) return null;
  const eligible = Boolean(evidence?.revisionMatches && evidence?.learningEligible);

  return <div style={{ maxWidth: 1450, margin: "16px auto 0", padding: "0 24px", fontFamily: "system-ui,sans-serif" }}>
    <section style={{ border: `2px solid ${eligible ? "#a16207" : "#a8a29e"}`, borderRadius: 12, background: eligible ? "#fffbeb" : "#fafaf9", padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.1, color: eligible ? "#a16207" : "#57534e" }}>FOCUSED LEARNING CONTEXT FROM CONTROLLED EXPERIMENTS</div>
      {!loaded ? <p style={{ marginBottom: 0 }}>Resolving repeated evidence and existing proposals…</p> : <>
        <p style={{ margin: "7px 0 0", fontSize: 13 }}><b>Requested revision canonical:</b> {evidence?.revisionMatches ? "Yes" : "No"} · <b>Eligible repeated evidence groups:</b> {groups.length} · <b>Existing improvement proposals:</b> {focusedProposals.length} · <b>Pending:</b> {pending.length} · <b>Approved intent:</b> {approved.length}</p>
        {groups.map((group, index) => <p key={`${group.channel}-${group.changeField}-${index}`} style={{ margin: "5px 0 0", fontSize: 12 }}>{group.experimentCount}× {group.channel} · {group.marketplace} · {group.changeField} → {group.successMetric}{typeof group.averageRelativeLift === "number" ? ` · avg ${(group.averageRelativeLift * 100).toFixed(1)}%` : ""}</p>)}
        {focusedProposals.slice(0, 5).map((proposal) => <p key={proposal.id} style={{ margin: "5px 0 0", fontSize: 12 }}><b>{String(proposal.status || "").toUpperCase()}</b> · {proposal.dimension} · {proposal.success_metric} · {proposal.evidence_count} evidence points · {proposal.evidence_level}</p>)}
        {eligible && pending.length === 0 ? <p style={{ margin: "8px 0 0", fontSize: 13, fontWeight: 800 }}>This revision satisfies the repeated-evidence threshold, but no pending focused proposal exists yet. The existing “Lag forslag fra målinger” button below remains an explicit owner action and may generate proposals for every eligible canonical group.</p> : null}
        {pending.length ? <p style={{ margin: "8px 0 0", fontSize: 13, fontWeight: 800 }}>A focused proposal already exists. Review it in the queue below; approval records intent only and applies no metadata or production change.</p> : null}
      </>}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
        <Link href="/book-growth/learning" style={{ fontWeight: 800 }}>Clear focused learning context</Link>
        <Link href={`/book-growth/experiments?editionId=${encodeURIComponent(editionId)}${revisionId ? `&revisionId=${encodeURIComponent(revisionId)}` : ""}`} style={{ fontWeight: 800 }}>Back to this revision in Controlled Experiments</Link>
        <code style={{ fontSize: 11 }}>edition: {editionId}</code>
        {revisionId ? <code style={{ fontSize: 11 }}>revision: {revisionId}</code> : null}
      </div>
    </section>
  </div>;
}
