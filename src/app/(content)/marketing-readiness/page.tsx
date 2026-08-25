"use client";

import { useEffect, useState } from "react";

type Row = {
  brandId: string;
  brandName: string;
  platform: string | null;
  accountId: string | null;
  accountName: string | null;
  connected: boolean;
  brandBrainReady: boolean;
  planned: boolean;
  pilotReady: boolean;
  pilotBlockReason: string | null;
  published: number;
  measuredEligible: number;
  quarantined: number;
  evaluatedRules: number;
  actionableRules: number;
  liveLearning: boolean;
  status: string;
};

type ControlGate = {
  status: "WAIT" | "RUN_NEXT_CANARY";
  controlBrandId: string;
  controlChannel: string;
  learningScope: string;
  eligibleObservations: number;
  requiredObservations: number;
  maturityHours: number;
  evaluatedRules: number;
  actionableRules: number;
  nextEvaluationAt: string | null;
  nextRecommendedCanary: { brandId: string; channel: string; path: string } | null;
  reason: string;
};

type Payload = { generatedAt: string; controlGate: ControlGate; rows: Row[] };

const CANARY_ROUTES: Record<string, string> = {
  "zeneco:instagram": "/marketing-canary",
  "zeneco:facebook": "/marketing-canary-facebook",
  "donaanna:instagram": "/marketing-canary-donaanna",
  "chatgenius:instagram": "/marketing-canary-chatgenius",
  "pinosoecolife:facebook": "/marketing-canary-pinoso-facebook",
};

const statusStyle = (status: string): React.CSSProperties => ({
  display: "inline-block",
  padding: "4px 8px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 800,
  background: status === "LIVE_LEARNING" ? "#dcfce7" : status === "PILOT_READY" ? "#dbeafe" : status === "BRAND_BRAIN_READY" ? "#fef3c7" : "#f1f5f9",
  color: status === "LIVE_LEARNING" ? "#166534" : status === "PILOT_READY" ? "#1d4ed8" : status === "BRAND_BRAIN_READY" ? "#92400e" : "#475569",
});

function formatLocal(value: string | null | undefined) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("nb-NO", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Europe/Madrid",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function MarketingReadinessPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/marketing/readiness", { cache: "no-store", credentials: "same-origin" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `readiness feilet (${res.status})`);
      setData(body as Payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const gate = data?.controlGate;
  const runCanary = gate?.status === "RUN_NEXT_CANARY" && gate.nextRecommendedCanary;

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 25 }}>Marketing Expansion Readiness</h1>
          <p style={{ margin: "6px 0 0", color: "#64748b" }}>Egne brands og kanaler — teknisk tilkobling er ikke det samme som produksjons- eller læringsklarhet.</p>
        </div>
        <button onClick={load} disabled={loading} style={{ border: 0, borderRadius: 9, padding: "9px 13px", background: "#0f172a", color: "white", fontWeight: 700 }}>{loading ? "Laster…" : "Oppdater"}</button>
      </div>

      {error && <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: "#fef2f2", color: "#b91c1c" }}>⛔ {error}</div>}

      {gate && <section style={{ marginTop: 18, padding: 16, borderRadius: 12, border: `1px solid ${runCanary ? "#86efac" : "#fde68a"}`, background: runCanary ? "#f0fdf4" : "#fffbeb" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: runCanary ? "#166534" : "#92400e" }}>CANARY RECOMMENDATION</div>
            <div style={{ fontSize: 20, fontWeight: 900, marginTop: 3 }}>{runCanary ? "RUN NEXT CANARY" : "WAIT"}</div>
            <div style={{ marginTop: 6, color: "#475569", fontSize: 13 }}>
              Control: {gate.learningScope} · eligible {gate.eligibleObservations}/{gate.requiredObservations} · evaluated rules {gate.evaluatedRules} · actionable {gate.actionableRules}
            </div>
            {!runCanary && gate.nextEvaluationAt && <div style={{ marginTop: 5, color: "#92400e", fontSize: 13, fontWeight: 700 }}>
              Neste relevante vurdering: {formatLocal(gate.nextEvaluationAt)} (Spania)
            </div>}
            <div style={{ marginTop: 4, color: "#64748b", fontSize: 12 }}>{gate.reason}</div>
          </div>
          {runCanary && <a href={gate.nextRecommendedCanary!.path} style={{ display: "inline-block", padding: "10px 14px", borderRadius: 9, background: "#166534", color: "white", fontWeight: 800, textDecoration: "none" }}>
            Åpne {gate.nextRecommendedCanary!.brandId} {gate.nextRecommendedCanary!.channel} Canary →
          </a>}
        </div>
      </section>}

      <div style={{ marginTop: 18, overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1360, background: "white" }}>
          <thead>
            <tr style={{ background: "#f8fafc", textAlign: "left" }}>
              {["Brand", "Kanal", "Konto", "Status", "Plan", "Pilot", "Hvorfor ikke pilotklar?", "Publisert", "Eligible", "Karantene", "Evaluated rules", "Actionable rules"].map((h) => <th key={h} style={{ padding: 11, fontSize: 12, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {(data?.rows ?? []).map((row) => {
              const canary = row.platform ? CANARY_ROUTES[`${row.brandId}:${row.platform}`] : undefined;
              return (
                <tr key={`${row.brandId}:${row.platform ?? "none"}:${row.accountId ?? "none"}`}>
                  <td style={{ padding: 11, borderBottom: "1px solid #f1f5f9" }}><b>{row.brandName}</b><div style={{ fontSize: 11, color: "#94a3b8" }}>{row.brandId}</div></td>
                  <td style={{ padding: 11, borderBottom: "1px solid #f1f5f9" }}>{row.platform ?? "—"}</td>
                  <td style={{ padding: 11, borderBottom: "1px solid #f1f5f9" }}>{row.accountName ?? "—"}<div style={{ fontSize: 10, color: "#94a3b8" }}>{row.accountId ?? ""}</div></td>
                  <td style={{ padding: 11, borderBottom: "1px solid #f1f5f9" }}><span style={statusStyle(row.status)}>{row.status}</span></td>
                  <td style={{ padding: 11, borderBottom: "1px solid #f1f5f9" }}>{row.planned ? "Ja" : "Nei"}</td>
                  <td style={{ padding: 11, borderBottom: "1px solid #f1f5f9" }}>
                    {row.pilotReady && canary ? <a href={canary} style={{ color: "#1d4ed8", fontWeight: 700, textDecoration: "none" }}>Åpne canary →</a> : row.pilotReady ? "Pilotklar" : "—"}
                  </td>
                  <td style={{ padding: 11, borderBottom: "1px solid #f1f5f9", minWidth: 260, fontSize: 12, color: row.pilotReady ? "#166534" : "#64748b" }}>{row.pilotReady ? "Pilotklar" : row.pilotBlockReason ?? "—"}</td>
                  <td style={{ padding: 11, borderBottom: "1px solid #f1f5f9" }}>{row.published}</td>
                  <td style={{ padding: 11, borderBottom: "1px solid #f1f5f9" }}>{row.measuredEligible}</td>
                  <td style={{ padding: 11, borderBottom: "1px solid #f1f5f9" }}>{row.quarantined}</td>
                  <td style={{ padding: 11, borderBottom: "1px solid #f1f5f9" }}>{row.evaluatedRules}</td>
                  <td style={{ padding: 11, borderBottom: "1px solid #f1f5f9" }}>{row.actionableRules}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 14, padding: 14, borderRadius: 10, background: "#f8fafc", color: "#475569", fontSize: 13 }}>
        <b>Policy:</b> CONNECTED betyr kun konto tilkoblet. BRAND_BRAIN_READY betyr at brandets identitet/claims er definert, men kanalen kan fortsatt være blokkert fra pilot. PILOT_READY krever eksplisitt kanalstøtte i Growth OS-registry. LIVE_LEARNING krever minst 10 learning-eligible observasjoner og at Learning Engine har evaluert/skrevet regler i samme brand × kanal-scope. Actionable rules (favor/avoid) er et separat sterkere signal; null actionable kan fortsatt være et legitimt nøytralt læringsresultat. Canary Recommendation utfører ingenting; den sier bare når neste kontrollerte canary bør kjøres. Alle publiseringer forblir COPILOT/manual-review.
      </div>
    </div>
  );
}