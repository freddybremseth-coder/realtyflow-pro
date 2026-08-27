"use client";

import { getBookGrowthApplyRoute } from "@/lib/book-growth-apply-routing";

type Recommendation = {
  id: string;
  recommendation_type: string;
  channel: string | null;
  marketplace: string | null;
  proposed_value: unknown;
  expected_impact: string | null;
  bookTitle: string | null;
  bookSlug: string | null;
};

function show(value: unknown) {
  if (value == null) return "—";
  if (typeof value === "string") return value;
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

function kindLabel(kind: ReturnType<typeof getBookGrowthApplyRoute>["kind"]) {
  if (kind === "internal_workflow") return "Intern workflow";
  if (kind === "manual_external") return "Manuell ekstern";
  return "Review påkrevd";
}

export function BookGrowthApprovedApplyQueue({ approved }: { approved: Recommendation[] }) {
  if (!approved.length) return null;

  return <section style={{ marginTop: 18, padding: 16, borderRadius: 12, background: "#ecfdf5", border: "2px solid #10b981" }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <div>
        <div style={{ fontWeight: 900, fontSize: 18, color: "#064e3b" }}>Godkjent – klar for Apply</div>
        <div style={{ marginTop: 4, fontSize: 12, color: "#065f46" }}>Hvert forslag rutes nå til riktig workflow. Ingen anbefaling blir markert applied før en reell handling er utført.</div>
      </div>
      <div style={{ padding: "5px 9px", borderRadius: 999, background: "#065f46", color: "white", fontWeight: 900, fontSize: 12 }}>{approved.length} godkjent</div>
    </div>
    <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
      {approved.slice(0, 20).map((r) => {
        const route = getBookGrowthApplyRoute(r.recommendation_type);
        return <div key={r.id} style={{ background: "white", border: "1px solid #6ee7b7", borderRadius: 10, padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 900, color: "#047857", textTransform: "uppercase" }}>{r.recommendation_type} · {r.channel ?? "catalog"} · {r.marketplace ?? "global"}</div>
              <div style={{ marginTop: 3, fontWeight: 900 }}>{r.bookTitle ?? r.bookSlug ?? "Serie-/katalogforslag"}</div>
            </div>
            <span style={{ padding: "4px 8px", borderRadius: 999, background: route.canAutoApply ? "#dcfce7" : route.kind === "manual_external" ? "#fff7ed" : "#f1f5f9", color: route.canAutoApply ? "#166534" : route.kind === "manual_external" ? "#9a3412" : "#334155", border: "1px solid #cbd5e1", fontSize: 11, fontWeight: 900 }}>{route.canAutoApply ? "AUDITERT APPLY" : kindLabel(route.kind)}</span>
          </div>
          {r.expected_impact && <div style={{ marginTop: 4, fontSize: 12, color: "#334155" }}>{r.expected_impact}</div>}
          <div style={{ marginTop: 8, fontSize: 12, color: "#475569" }}><b>Godkjent forslag:</b> {show(r.proposed_value)}</div>
          <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: "#f8fafc", border: "1px solid #cbd5e1" }}>
            <div style={{ fontSize: 12, color: "#334155" }}>{route.description}</div>
            <a href={route.href} style={{ display: "inline-block", marginTop: 8, borderRadius: 8, padding: "8px 11px", background: route.canAutoApply ? "#166534" : "#0f172a", color: "white", fontWeight: 900, fontSize: 12, textDecoration: "none" }}>{route.label} →</a>
          </div>
        </div>;
      })}
    </div>
  </section>;
}
