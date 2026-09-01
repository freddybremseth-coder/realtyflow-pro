"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type LearningGroup = { channel?: string; marketplace?: string; changeField?: string; successMetric?: string; experimentCount?: number; averageRelativeLift?: number };
type Focus = {
  edition?: { id: string; title?: string; language?: string; format?: string } | null;
  canonicalRevision?: { id: string; revision_number?: number; status?: string } | null;
  revisionMatches?: boolean;
  facts?: { total?: number; exactRevision?: number; channels?: string[]; metricCoverage?: Record<string, boolean>; firstMetricDate?: string | null; lastMetricDate?: string | null };
  experiments?: Array<{ id: string; status?: string; channel?: string; marketplace?: string; change_field?: string; success_metric?: string }>;
  activeExperimentCount?: number;
  completedDirectionalCount?: number;
  eligibleLearningGroups?: LearningGroup[];
  learningEligible?: boolean;
  learningHref?: string | null;
  canOpenProposalForm?: boolean;
  note?: string;
  error?: string;
};

export function ExperimentsFocusContext() {
  const search = useSearchParams();
  const editionId = String(search.get("editionId") || "").trim();
  const revisionId = String(search.get("revisionId") || "").trim();
  const [focus, setFocus] = useState<Focus | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!editionId) { setLoaded(true); return; }
    const params = new URLSearchParams({ editionId });
    if (revisionId) params.set("revisionId", revisionId);
    fetch(`/api/book-growth/experiments/focus?${params.toString()}`, { cache: "no-store" })
      .then(async (res) => ({ res, body: await res.json().catch(() => ({})) }))
      .then(({ res, body }) => setFocus(res.ok ? body : { error: body?.error || `HTTP ${res.status}` }))
      .catch((error) => setFocus({ error: error instanceof Error ? error.message : String(error) }))
      .finally(() => setLoaded(true));
  }, [editionId, revisionId]);

  if (!editionId) return null;
  const ready = Boolean(focus?.canOpenProposalForm && focus?.revisionMatches);
  const coverage = Object.entries(focus?.facts?.metricCoverage || {}).filter(([, value]) => value).map(([key]) => key);
  const learningGroups = focus?.eligibleLearningGroups || [];

  return <div style={{ maxWidth: 1400, margin: "16px auto 0", padding: "0 24px", fontFamily: "system-ui,sans-serif" }}>
    <section style={{ border: `2px solid ${ready ? "#7c3aed" : "#b45309"}`, borderRadius: 12, background: ready ? "#faf5ff" : "#fffbeb", padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.1, color: ready ? "#7c3aed" : "#92400e" }}>FOCUSED EXPERIMENT CONTEXT FROM SALES EVIDENCE</div>
      {!loaded ? <p style={{ marginBottom: 0 }}>Resolving canonical revision and measurement coverage…</p> : focus?.error ? <p style={{ marginBottom: 0 }}>{focus.error}</p> : <>
        <h2 style={{ margin: "6px 0 4px", fontSize: 19 }}>{focus?.edition?.title || "Catalog edition"}</h2>
        <p style={{ margin: 0 }}>{String(focus?.edition?.language || "").toUpperCase()} · {focus?.edition?.format || "edition"}{focus?.canonicalRevision?.revision_number ? ` · Revision ${focus.canonicalRevision.revision_number}` : ""}</p>
        <p style={{ margin: "8px 0 0", fontSize: 13 }}><b>Requested revision still canonical:</b> {focus?.revisionMatches ? "Yes" : "No"} · <b>Sales facts:</b> {focus?.facts?.total ?? 0} · <b>Exact revision facts:</b> {focus?.facts?.exactRevision ?? 0} · <b>Active experiments:</b> {focus?.activeExperimentCount ?? 0} · <b>Completed directional:</b> {focus?.completedDirectionalCount ?? 0}</p>
        <p style={{ margin: "5px 0 0", fontSize: 12 }}>Observed metrics: {coverage.length ? coverage.join(", ") : "none yet"}{focus?.facts?.channels?.length ? ` · channels: ${focus.facts.channels.join(", ")}` : ""}{focus?.facts?.firstMetricDate ? ` · evidence window ${focus.facts.firstMetricDate}–${focus.facts.lastMetricDate}` : ""}</p>
        {learningGroups.length ? <div style={{ marginTop: 8, fontSize: 12 }}><b>Repeated evidence groups eligible for phase 5.3:</b>{learningGroups.map((group, index) => <div key={`${group.channel}-${group.changeField}-${index}`}>{group.experimentCount}× {group.channel} · {group.marketplace} · {group.changeField} → {group.successMetric}{typeof group.averageRelativeLift === "number" ? ` · avg ${(group.averageRelativeLift * 100).toFixed(1)}%` : ""}</div>)}</div> : <p style={{ margin: "8px 0 0", fontSize: 12 }}>No repeated evidence group has reached the phase 5.3 minimum of three matching completed directional experiments.</p>}
        {ready ? <p style={{ margin: "8px 0 0", fontSize: 13, fontWeight: 800 }}>The edition selector below is focused to this edition. You must still define one hypothesis, one changed field, baseline, proposed value and measurement window, then explicitly create the proposal.</p> : <p style={{ margin: "8px 0 0", fontSize: 13 }}>Do not stage a test from this context until the requested revision is canonical.</p>}
        <p style={{ margin: "6px 0 0", fontSize: 12 }}>{focus?.note}</p>
      </>}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
        <Link href="/book-growth/experiments" style={{ fontWeight: 800 }}>Clear focused experiment context</Link>
        <Link href={`/book-growth/sales-evidence?editionId=${encodeURIComponent(editionId)}${revisionId ? `&revisionId=${encodeURIComponent(revisionId)}` : ""}`} style={{ fontWeight: 800 }}>Back to this revision in Sales Evidence</Link>
        {focus?.learningEligible && focus.learningHref ? <Link href={focus.learningHref} style={{ fontWeight: 900, color: "#a16207" }}>Open repeated evidence in Learning Proposal Center →</Link> : null}
        <code style={{ fontSize: 11 }}>edition: {editionId}</code>
        {revisionId ? <code style={{ fontSize: 11 }}>revision: {revisionId}</code> : null}
      </div>
    </section>
  </div>;
}
