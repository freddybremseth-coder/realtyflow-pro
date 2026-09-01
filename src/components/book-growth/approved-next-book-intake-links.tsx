"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Proposal = {
  id: string;
  proposal_type?: string;
  status?: string;
  series_name?: string | null;
  proposed_title?: string | null;
  rationale?: string | null;
  evidence_count?: number | null;
  evidence_level?: string | null;
};

type Payload = { proposals?: Proposal[] };
type ProjectState = {
  productionState?: string;
  existingProject?: { id?: string; title?: string; status?: string } | null;
};

function stateLabel(state?: string) {
  if (state === "draft_pending") return "Draft created · production stopped";
  if (state === "start_approved") return "Production start approved · canon pending";
  if (state === "attention") return "Production needs attention";
  if (state === "in_production") return "Book Engine production active";
  if (state === "ready") return "Book Engine project ready";
  return "No Book Engine draft yet";
}

function actionLabel(state?: string) {
  if (state === "draft_pending") return "Resume controlled production";
  if (state === "start_approved" || state === "attention") return "Resume controlled production";
  if (state === "in_production" || state === "ready") return "Open Book Engine project";
  return "Open controlled Book Engine intake";
}

export function ApprovedNextBookIntakeLinks() {
  const [data, setData] = useState<Payload | null>(null);
  const [projectStates, setProjectStates] = useState<Record<string, ProjectState>>({});

  useEffect(() => {
    fetch("/api/book-growth/learning", { cache: "no-store" })
      .then((res) => res.json())
      .then((body) => setData(body || {}))
      .catch(() => setData({}));
  }, []);

  const approved = useMemo(() => (data?.proposals || []).filter((row) =>
    row.proposal_type === "next_book" && row.status === "approved",
  ), [data]);

  useEffect(() => {
    if (!approved.length) { setProjectStates({}); return; }
    let cancelled = false;
    Promise.all(approved.map(async (row) => {
      try {
        const res = await fetch(`/api/publishing/book-engine/learning-intake?proposalId=${encodeURIComponent(row.id)}`, { cache: "no-store" });
        const body = await res.json().catch(() => ({}));
        return [row.id, res.ok ? body : {}] as const;
      } catch {
        return [row.id, {}] as const;
      }
    })).then((entries) => {
      if (!cancelled) setProjectStates(Object.fromEntries(entries));
    });
    return () => { cancelled = true; };
  }, [approved]);

  if (!approved.length) return null;

  return <div style={{ maxWidth: 1450, margin: "16px auto 0", padding: "0 24px", fontFamily: "system-ui,sans-serif" }}>
    <section style={{ border: "2px solid #1d4ed8", borderRadius: 12, background: "#eff6ff", padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.1, color: "#1d4ed8" }}>APPROVED NEXT-BOOK PROPOSALS · BOOK ENGINE STATUS</div>
      <p style={{ margin: "7px 0 10px", fontSize: 13 }}>Each approved proposal remains traceable through draft registration and controlled production. Returning here resumes the existing state instead of creating a second project.</p>
      <div style={{ display: "grid", gap: 8 }}>
        {approved.map((row) => {
          const projectState = projectStates[row.id] || {};
          const state = projectState.productionState || "not_created";
          const projectId = String(projectState.existingProject?.id || "").trim();
          const href = ["in_production", "ready"].includes(state) && projectId
            ? `/publishing/forfatterstudio?project=${encodeURIComponent(projectId)}`
            : `/publishing/forfatterstudio/learning-intake?proposalId=${encodeURIComponent(row.id)}`;
          return <div key={row.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", borderTop: "1px solid #bfdbfe", paddingTop: 8 }}>
            <div>
              <strong>{row.series_name ? `${row.series_name}: ` : ""}{row.proposed_title || "Untitled proposal"}</strong>
              <span style={{ display: "block", fontSize: 12, color: "#475569" }}>{row.evidence_count ?? 0} evidence points · {row.evidence_level || "unknown"}</span>
              <span style={{ display: "block", fontSize: 12, fontWeight: 800, color: state === "attention" ? "#b45309" : "#0f766e" }}>{stateLabel(state)}</span>
            </div>
            <Link href={href} style={{ fontWeight: 900 }}>{actionLabel(state)}</Link>
          </div>;
        })}
      </div>
    </section>
  </div>;
}
