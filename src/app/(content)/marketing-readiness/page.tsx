"use client";

import Link from "next/link";
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
  surfaceKind: "destination" | "signal";
  attentionRequired: boolean;
  attentionReason: string | null;
  status: string;
};

type NextAction = {
  id: string;
  kind: string;
  brandId: string;
  brandName: string;
  channel: string | null;
  sourceChannel: string | null;
  title: string;
  reason: string;
  href: string | null;
  execution: "AUTO_READY" | "HUMAN_REQUIRED" | "SYSTEM_WORK" | "WAIT";
  priority: "HIGH" | "MEDIUM" | "LOW";
};

type Payload = {
  generatedAt: string;
  rows: Row[];
  nextActions?: NextAction[];
  automationSummary?: {
    autoReady: number;
    humanRequired: number;
    systemWork: number;
    waiting: number;
    connectedSignals: number;
    connectedDestinations: number;
  };
};

function statusStyle(status: string): React.CSSProperties {
  const signal = status === "SIGNAL_READY";
  return {
    display: "inline-block",
    padding: "4px 8px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 800,
    background: status === "LIVE_LEARNING" ? "#dcfce7" : status === "PILOT_READY" ? "#dbeafe" : signal ? "#ede9fe" : status === "BRAND_BRAIN_READY" ? "#fef3c7" : "#f1f5f9",
    color: status === "LIVE_LEARNING" ? "#166534" : status === "PILOT_READY" ? "#1d4ed8" : signal ? "#6d28d9" : status === "BRAND_BRAIN_READY" ? "#92400e" : "#475569",
  };
}

export default function MarketingReadinessPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(null);
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

  const rows = data?.rows ?? [];
  const destinations = rows.filter((row) => row.surfaceKind === "destination");
  const signals = rows.filter((row) => row.surfaceKind === "signal");
  const actions = data?.nextActions ?? [];
  const human = actions.filter((action) => action.execution === "HUMAN_REQUIRED");
  const automatic = actions.filter((action) => action.execution === "AUTO_READY");
  const system = actions.filter((action) => action.execution === "SYSTEM_WORK");

  return (
    <div style={{ maxWidth: 1450, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 25 }}>Marketing Readiness</h1>
          <p style={{ margin: "6px 0 0", color: "#64748b" }}>Publiseringsdestinations, measurement-signaler og neste Growth Autopilot-handling holdes separat.</p>
        </div>
        <button onClick={load} disabled={loading} style={{ border: 0, borderRadius: 9, padding: "9px 13px", background: "#0f172a", color: "white", fontWeight: 700 }}>{loading ? "Laster…" : "Oppdater"}</button>
      </div>

      {error && <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: "#fef2f2", color: "#b91c1c" }}>⛔ {error}</div>}

      <section style={{ marginTop: 18, display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        {[
          ["Destinations", data?.automationSummary?.connectedDestinations ?? destinations.filter((row) => row.connected).length],
          ["Signals", data?.automationSummary?.connectedSignals ?? signals.filter((row) => row.connected).length],
          ["Auto ready", data?.automationSummary?.autoReady ?? automatic.length],
          ["Needs you", data?.automationSummary?.humanRequired ?? human.length],
          ["System work", data?.automationSummary?.systemWork ?? system.length],
        ].map(([label, value]) => <div key={String(label)} style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 14, background: "white" }}><div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>{label}</div><div style={{ marginTop: 6, fontSize: 28, fontWeight: 900 }}>{value}</div></div>)}
      </section>

      <section style={{ marginTop: 18, padding: 16, borderRadius: 12, border: "1px solid #bbf7d0", background: "#f0fdf4" }}>
        <div style={{ fontSize: 12, fontWeight: 900, color: "#166534" }}>NEXT BEST MARKETING ACTIONS</div>
        <div style={{ marginTop: 4, fontSize: 13, color: "#475569" }}>Nexus velger handling ut fra brand × kanal-læring. Measurement-signaler kan gi evidens, men blir aldri behandlet som publiseringskanaler.</div>
        <div style={{ marginTop: 12, display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
          {actions.filter((action) => action.execution !== "WAIT").slice(0, 8).map((action) => (
            <div key={action.id} style={{ border: "1px solid #d1fae5", borderRadius: 10, padding: 12, background: "white" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 900, color: action.execution === "HUMAN_REQUIRED" ? "#92400e" : action.execution === "SYSTEM_WORK" ? "#1d4ed8" : "#166534" }}>{action.execution.replaceAll("_", " ")}</span>
                <span style={{ fontSize: 10, fontWeight: 800, color: "#64748b" }}>{action.priority}</span>
              </div>
              <div style={{ marginTop: 6, fontWeight: 900 }}>{action.title}</div>
              <div style={{ marginTop: 5, fontSize: 12, lineHeight: 1.5, color: "#475569" }}>{action.reason}</div>
              {action.sourceChannel && action.sourceChannel !== action.channel && <div style={{ marginTop: 5, fontSize: 11, fontWeight: 700, color: "#64748b" }}>Læring: {action.sourceChannel} → {action.channel}</div>}
              {action.href && <Link href={action.href} style={{ display: "inline-block", marginTop: 9, fontSize: 12, fontWeight: 800, color: "#1d4ed8", textDecoration: "none" }}>Åpne kontrollflate →</Link>}
            </div>
          ))}
          {!loading && actions.filter((action) => action.execution !== "WAIT").length === 0 && <div style={{ fontSize: 13, color: "#166534" }}>Ingen ny handling må startes akkurat nå.</div>}
        </div>
      </section>

      <h2 style={{ margin: "22px 0 8px", fontSize: 18 }}>Publishing destinations</h2>
      <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1220, background: "white" }}>
          <thead><tr style={{ background: "#f8fafc", textAlign: "left" }}>{["Brand", "Destination", "Konto", "Status", "Pilot", "Publisert", "Eligible", "Karantene", "Rules", "Handling/status"].map((h) => <th key={h} style={{ padding: 11, fontSize: 12, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>{h}</th>)}</tr></thead>
          <tbody>{destinations.map((row) => (
            <tr key={`${row.brandId}:${row.platform ?? "none"}:${row.accountId ?? "none"}`}>
              <td style={{ padding: 11, borderBottom: "1px solid #f1f5f9" }}><b>{row.brandName}</b><div style={{ fontSize: 11, color: "#94a3b8" }}>{row.brandId}</div></td>
              <td style={{ padding: 11, borderBottom: "1px solid #f1f5f9" }}>{row.platform ?? "—"}</td>
              <td style={{ padding: 11, borderBottom: "1px solid #f1f5f9" }}>{row.accountName ?? "—"}</td>
              <td style={{ padding: 11, borderBottom: "1px solid #f1f5f9" }}><span style={statusStyle(row.status)}>{row.status}</span></td>
              <td style={{ padding: 11, borderBottom: "1px solid #f1f5f9" }}>{row.pilotReady ? "Ja" : "—"}</td>
              <td style={{ padding: 11, borderBottom: "1px solid #f1f5f9" }}>{row.published}</td>
              <td style={{ padding: 11, borderBottom: "1px solid #f1f5f9" }}>{row.measuredEligible}</td>
              <td style={{ padding: 11, borderBottom: "1px solid #f1f5f9" }}>{row.quarantined}</td>
              <td style={{ padding: 11, borderBottom: "1px solid #f1f5f9" }}>{row.evaluatedRules}/{row.actionableRules}</td>
              <td style={{ padding: 11, borderBottom: "1px solid #f1f5f9", minWidth: 260, fontSize: 12, color: row.attentionRequired ? "#92400e" : "#64748b" }}>{row.attentionRequired ? row.attentionReason : row.pilotReady ? "Pilotklar" : row.pilotBlockReason ?? "Systemet følger opp."}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      <h2 style={{ margin: "22px 0 8px", fontSize: 18 }}>Signals & measurement</h2>
      <div style={{ overflowX: "auto", border: "1px solid #ddd6fe", borderRadius: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760, background: "white" }}>
          <thead><tr style={{ background: "#f5f3ff", textAlign: "left" }}>{["Brand", "Signal", "Konto", "Status", "Rolle"].map((h) => <th key={h} style={{ padding: 11, fontSize: 12, color: "#6d28d9", borderBottom: "1px solid #ddd6fe" }}>{h}</th>)}</tr></thead>
          <tbody>{signals.map((row) => (
            <tr key={`${row.brandId}:${row.platform}`}>
              <td style={{ padding: 11, borderBottom: "1px solid #f1f5f9", fontWeight: 800 }}>{row.brandName}</td>
              <td style={{ padding: 11, borderBottom: "1px solid #f1f5f9" }}>{row.platform}</td>
              <td style={{ padding: 11, borderBottom: "1px solid #f1f5f9" }}>{row.accountName ?? "—"}</td>
              <td style={{ padding: 11, borderBottom: "1px solid #f1f5f9" }}><span style={statusStyle(row.status)}>{row.status}</span></td>
              <td style={{ padding: 11, borderBottom: "1px solid #f1f5f9", fontSize: 12, color: "#64748b" }}>Read-only evidens inn i SAM/Nexus. Ingen pilot- eller publisher-status.</td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      <div style={{ marginTop: 14, padding: 14, borderRadius: 10, background: "#f8fafc", color: "#475569", fontSize: 13 }}>
        <b>Policy:</b> Destinations kan publisere og lære i brand × kanal-scope. Signals er read-only målekilder. AUTO READY betyr at Nexus har evidens for neste kontrollerte steg; eksisterende approval-, claim- og rollback-guards gjelder fortsatt før ekstern publisering. SYSTEM WORK skal løses i plattformen og teller ikke som en daglig brukeroppgave.
      </div>
    </div>
  );
}
