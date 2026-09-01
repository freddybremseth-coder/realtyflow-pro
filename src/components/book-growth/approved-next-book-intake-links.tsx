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

export function ApprovedNextBookIntakeLinks() {
  const [data, setData] = useState<Payload | null>(null);

  useEffect(() => {
    fetch("/api/book-growth/learning", { cache: "no-store" })
      .then((res) => res.json())
      .then((body) => setData(body || {}))
      .catch(() => setData({}));
  }, []);

  const approved = useMemo(() => (data?.proposals || []).filter((row) =>
    row.proposal_type === "next_book" && row.status === "approved",
  ), [data]);

  if (!approved.length) return null;

  return <div style={{ maxWidth: 1450, margin: "16px auto 0", padding: "0 24px", fontFamily: "system-ui,sans-serif" }}>
    <section style={{ border: "2px solid #1d4ed8", borderRadius: 12, background: "#eff6ff", padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.1, color: "#1d4ed8" }}>APPROVED NEXT-BOOK PROPOSALS · BOOK ENGINE INTAKE AVAILABLE</div>
      <p style={{ margin: "7px 0 10px", fontSize: 13 }}>Approval only unlocks a controlled intake. Opening an intake does not create a project, generate canon, build an outline or start writing.</p>
      <div style={{ display: "grid", gap: 8 }}>
        {approved.map((row) => <div key={row.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", borderTop: "1px solid #bfdbfe", paddingTop: 8 }}>
          <div>
            <strong>{row.series_name ? `${row.series_name}: ` : ""}{row.proposed_title || "Untitled proposal"}</strong>
            <span style={{ display: "block", fontSize: 12, color: "#475569" }}>{row.evidence_count ?? 0} evidence points · {row.evidence_level || "unknown"}</span>
          </div>
          <Link href={`/publishing/forfatterstudio/learning-intake?proposalId=${encodeURIComponent(row.id)}`} style={{ fontWeight: 900 }}>Open controlled Book Engine intake</Link>
        </div>)}
      </div>
    </section>
  </div>;
}
