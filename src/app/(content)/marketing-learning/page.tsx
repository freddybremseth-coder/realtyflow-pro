"use client";

import { useEffect, useMemo, useState } from "react";

type Rule = {
  dimension: string;
  value: string;
  sample: number;
  lift: number;
  evidence: string;
  verdict: "favor" | "avoid" | "neutral" | string;
  finding?: string;
};

type Status = {
  brandId: string;
  channel: string;
  publishedCount: number;
  maturePublishedCount: number;
  immaturePublishedCount: number;
  maturityHours: number;
  nextMaturesAt: string | null;
  nextMetricsCronAt: string | null;
  eligibleByNextCronCount: number;
  measuredCount: number;
  observations: number;
  quarantinedCount: number;
  quarantineReasons: Record<string, number>;
  learningThreshold: number;
  learningActive: boolean;
  remainingUntilLearning: number;
  lastSnapshotAt: string | null;
  rules: Rule[];
};

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin", ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data as T;
}

const box: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, background: "white" };
const label: React.CSSProperties = { color: "#6b7280", fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em" };
const value: React.CSSProperties = { fontSize: 28, fontWeight: 750, marginTop: 2 };

export default function MarketingLearningPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      setStatus(await readJson<Status>("/api/marketing/learning-status?brandId=zeneco"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => { void load(); }, []);

  const sync = async () => {
    setBusy(true); setError(null); setSyncMessage(null);
    try {
      const result = await readJson<any>("/api/marketing/learning-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: "zeneco" }),
      });
      setStatus(result.status);
      setSyncMessage(`Synkronisert ${result.sync?.synced ?? 0} poster · ${result.status?.observations ?? 0} learning-eligible observasjoner.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const grouped = useMemo(() => {
    const out: Record<string, Rule[]> = {};
    for (const rule of status?.rules ?? []) (out[rule.dimension] ??= []).push(rule);
    return out;
  }, [status]);

  const quarantineSummary = useMemo(() => {
    return Object.entries(status?.quarantineReasons ?? {})
      .map(([reason, count]) => `${reason}: ${count}`)
      .join(" · ");
  }, [status]);

  const dims = [
    ["tag", "Hashtags / tags"],
    ["area", "Steder"],
    ["propertyType", "Boligtyper"],
    ["priceBand", "Prisnivå"],
    ["hookType", "Hooks"],
    ["ctaType", "CTA"],
  ] as const;

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26 }}>Marketing Growth OS — Learning</h1>
          <p style={{ margin: "6px 0 0", color: "#6b7280" }}>Zen Eco Homes · Instagram · metrics → datakvalitet → genome → læringsregler</p>
        </div>
        <button onClick={sync} disabled={busy} style={{ border: 0, borderRadius: 9, padding: "10px 14px", fontWeight: 700, background: "#111827", color: "white", cursor: busy ? "wait" : "pointer" }}>
          {busy ? "Synkroniserer…" : "Sync Instagram metrics now"}
        </button>
      </div>

      {error && <div style={{ marginTop: 14, padding: 12, borderRadius: 9, background: "#fef2f2", color: "#b91c1c" }}>⛔ {error}</div>}
      {syncMessage && <div style={{ marginTop: 14, padding: 12, borderRadius: 9, background: "#f0fdf4", color: "#166534" }}>✅ {syncMessage}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12, marginTop: 18 }}>
        <div style={box}><div style={label}>Publiserte poster</div><div style={value}>{status?.publishedCount ?? "—"}</div></div>
        <div style={box}>
          <div style={label}>24t modne</div>
          <div style={value}>{status?.maturePublishedCount ?? "—"}</div>
          {status && <div style={{ fontSize: 12, color: "#6b7280" }}>{status.immaturePublishedCount} venter på {status.maturityHours}t</div>}
        </div>
        <div style={box}>
          <div style={label}>Neste metrics-cron</div>
          <div style={value}>{status?.eligibleByNextCronCount ?? "—"}</div>
          {status?.nextMetricsCronAt && <div style={{ fontSize: 12, color: "#6b7280" }}>modne kandidater · {new Date(status.nextMetricsCronAt).toLocaleString()}</div>}
        </div>
        <div style={box}><div style={label}>Målte totalt</div><div style={value}>{status?.measuredCount ?? "—"}</div></div>
        <div style={box}>
          <div style={label}>Learning-eligible</div>
          <div style={value}>{status?.observations ?? "—"}</div>
          {status && <div style={{ fontSize: 12, color: "#6b7280" }}>av {status.learningThreshold} nødvendig</div>}
        </div>
        <div style={box}>
          <div style={label}>Karantene</div>
          <div style={{ ...value, color: status?.quarantinedCount ? "#dc2626" : "#16a34a" }}>{status?.quarantinedCount ?? "—"}</div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>måles, men lærer ikke</div>
        </div>
        <div style={box}>
          <div style={label}>Learning Engine</div>
          <div style={{ ...value, color: status?.learningActive ? "#16a34a" : "#d97706" }}>{status?.learningActive ? "ACTIVE" : "COLLECTING"}</div>
          {!status?.learningActive && status && <div style={{ fontSize: 12, color: "#6b7280" }}>{status.remainingUntilLearning} gyldige observasjoner igjen</div>}
        </div>
      </div>

      <div style={{ marginTop: 12, fontSize: 13, color: "#6b7280" }}>
        Siste metrics-snapshot: {status?.lastSnapshotAt ? new Date(status.lastSnapshotAt).toLocaleString() : "ingen ennå"}. Metrics hentes først etter {status?.maturityHours ?? 24} timer, og bare learning-eligible snapshots teller mot terskelen.
        {status?.nextMaturesAt ? ` Første neste post blir 24t-moden ${new Date(status.nextMaturesAt).toLocaleString()}.` : ""}
      </div>

      {!!status?.quarantinedCount && (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 9, background: "#fff7ed", color: "#9a3412", fontSize: 13 }}>
          Datakvalitetskarantene: {quarantineSummary || "ukjent årsak"}. Historiske poster beholdes for audit og metrics, men får ikke påvirke Learning Engine.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 14, marginTop: 20 }}>
        {dims.map(([dim, title]) => {
          const rules = grouped[dim] ?? [];
          return (
            <section key={dim} style={box}>
              <h2 style={{ fontSize: 17, margin: "0 0 10px" }}>{title}</h2>
              {!rules.length ? <div style={{ color: "#9ca3af", fontSize: 13 }}>Ikke nok data ennå.</div> : (
                <div style={{ display: "grid", gap: 8 }}>
                  {rules.slice(0, 10).map((r) => (
                    <div key={`${r.dimension}:${r.value}`} style={{ borderTop: "1px solid #f3f4f6", paddingTop: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <b>{dim === "tag" ? `#${r.value}` : r.value}</b>
                        <span style={{ color: r.verdict === "favor" ? "#16a34a" : r.verdict === "avoid" ? "#dc2626" : "#6b7280", fontWeight: 700 }}>{r.lift?.toFixed?.(2) ?? r.lift}×</span>
                      </div>
                      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>sample {r.sample} · {r.evidence} · {r.verdict}</div>
                      {r.finding && <div style={{ fontSize: 12, color: "#374151", marginTop: 3 }}>{r.finding}</div>}
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
