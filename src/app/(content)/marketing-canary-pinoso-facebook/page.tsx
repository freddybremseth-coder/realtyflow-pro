"use client";

import { useState } from "react";

const CANARY = {
  brandId: "pinosoecolife",
  channel: "facebook" as const,
  accountName: "Pinoso Ecolife",
  publishingAccountId: "1118026341393565",
};

const PILLARS = [
  { value: "rural_property", label: "Rural property" },
  { value: "new_build", label: "New build" },
  { value: "land_and_plot", label: "Land & plot" },
  { value: "inland_lifestyle", label: "Inland lifestyle" },
] as const;

const AI_PREFILL =
  "Lag et profesjonelt, kanaltilpasset Facebook-innlegg om den konkrete RealtyFlow Inventory-boligen systemet velger for Pinoso EcoLife. Fokusér på landlig livsstil, plass, natur, tomt/nybygg og praktisk kjøpsveiledning når dette faktisk støttes av Inventory. Bruk kun verifiserte fakta. Facebook-teksten skal være fortellende og jordnær, men aldri finne på egenskaper, utsikt, tomtestørrelse, avstander, garantier, avkastning eller statistikk. Bruk konkret verifisert landsby/by når relevant.";

type Check = { name: string; critical: boolean; status: "ok" | "warn" | "fail"; detail: string };
type Preflight = {
  status: "READY_FOR_LIVE" | "NOT_READY";
  checks: Check[];
  criticalFailures: string[];
  inventoryProperty?: { id: string; ref: string | null; title: string; imageUrl: string; factSourceCount: number };
};
type DraftResult = {
  contentId: string;
  channel: string;
  publicationId: string;
  state: string;
  mode: string;
  source?: string;
  caption?: string;
  imageUrl?: string | null;
  brandId?: string;
  accountId?: string | null;
  assetHash?: string;
  qualityScore?: number | null;
  approvalId: string | null;
  error?: string;
  factSources?: Array<{ claim: string; source: string }>;
  propertyId?: string | null;
  propertyRef?: string | null;
  propertyTitle?: string | null;
  propertyLocation?: string | null;
  selectionReason?: string | null;
};
type Draft = { marketingRunId: string; correlationId: string; campaignId: string; contentPillar?: string; results: DraftResult[] };

async function post<T>(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
}

const box: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, background: "white", marginTop: 14 };
const pre: React.CSSProperties = { whiteSpace: "pre-wrap", background: "#f8fafc", padding: 12, borderRadius: 8, fontSize: 12, overflowX: "auto" };
const btn = (enabled = true): React.CSSProperties => ({ border: 0, borderRadius: 9, padding: "10px 14px", fontWeight: 700, background: enabled ? "#111827" : "#d1d5db", color: "white", cursor: enabled ? "pointer" : "not-allowed" });
const dot = (status: string) => status === "ok" ? "#16a34a" : status === "warn" ? "#d97706" : "#dc2626";
const input: React.CSSProperties = { width: "100%", padding: 10, borderRadius: 8, border: "1px solid #d1d5db", boxSizing: "border-box" };

export default function PinosoFacebookCanaryPage() {
  const [masterIdea, setMasterIdea] = useState(AI_PREFILL);
  const [contentPillar, setContentPillar] = useState<(typeof PILLARS)[number]["value"]>("rural_property");
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [approved, setApproved] = useState(false);
  const [publishRes, setPublishRes] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const result = draft?.results?.[0];
  const ready = preflight?.status === "READY_FOR_LIVE";
  const draftOk = result?.state === "draft" && result?.source === "generated" && result?.mode === "manual-review";
  const approvalId = result?.approvalId ?? null;

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key); setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };

  const resetAfterPreflight = () => {
    setDraft(null); setApproved(false); setPublishRes(null);
  };

  const doPreflight = () => run("preflight", async () => {
    resetAfterPreflight();
    const r = await post<Preflight>("/api/marketing/preflight", {
      mode: "live",
      brandId: CANARY.brandId,
      channel: CANARY.channel,
      publishingAccountId: CANARY.publishingAccountId,
      language: "no",
      aiMode: true,
      useInventoryProperty: true,
    });
    if (!r.ok) throw new Error((r.data as any)?.error || `preflight feilet (${r.status})`);
    setPreflight(r.data);
  });

  const doDraft = () => run("draft", async () => {
    const r = await post<Draft>("/api/marketing/campaign-draft-with-pillar", {
      brandId: CANARY.brandId,
      channel: CANARY.channel,
      publishingAccountId: CANARY.publishingAccountId,
      masterIdea,
      contentPillar,
      language: "no",
      goal: { kind: "qualified_leads", target: 10 },
      useInventoryProperty: true,
    });
    if (!r.ok) throw new Error((r.data as any)?.error || `campaign-draft feilet (${r.status})`);
    const first = r.data.results?.[0];
    if (!first) throw new Error("Ingen resultat fra campaign-draft.");
    if (first.state !== "draft") throw new Error(`Draft blokkert: ${first.error ?? first.state}`);
    if (first.source !== "generated") throw new Error(`STOPP: forventet generated source, fikk ${first.source ?? "ukjent"}`);
    if (first.mode !== "manual-review") throw new Error(`STOPP: forventet manual-review, fikk ${first.mode}`);
    if (!first.propertyId || !first.imageUrl) throw new Error("STOPP: Inventory-grounding mangler propertyId eller bilde.");
    setDraft(r.data);
  });

  const doApprove = () => run("approve", async () => {
    if (!approvalId) throw new Error("Mangler approval-id");
    const r = await post<any>(`/api/agentic/approvals/${approvalId}`, { decision: "approve" });
    if (!r.ok) throw new Error(r.data?.error || `godkjenning feilet (${r.status})`);
    setApproved(true);
  });

  const doPublish = () => run("publish", async () => {
    if (!approvalId) throw new Error("Mangler approval-id");
    const r = await post<any>("/api/marketing/run-publication", { approvalId });
    if (!r.ok) throw new Error(r.data?.error || `publisering feilet (${r.status})`);
    setPublishRes(r.data);
  });

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ margin: 0, fontSize: 24 }}>Marketing Growth OS — Pinoso EcoLife Facebook Canary</h1>
      <p style={{ color: "#6b7280", marginTop: 6 }}>
        AI-only · Inventory-grounded · COPILOT/manual-review · Facebook-side <b>{CANARY.accountName}</b> ({CANARY.publishingAccountId}). Ingen automatisk publisering.
      </p>

      {error && <div style={{ marginTop: 12, padding: 12, background: "#fef2f2", color: "#b91c1c", borderRadius: 8 }}>⛔ {error}</div>}

      <section style={box}>
        <h2 style={{ fontSize: 17, marginTop: 0 }}>Facebook-vinkel</h2>
        <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 5 }}>Content pillar</label>
        <select value={contentPillar} onChange={(e) => setContentPillar(e.target.value as (typeof PILLARS)[number]["value"])} style={input}>
          {PILLARS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <textarea value={masterIdea} onChange={(e) => setMasterIdea(e.target.value)} rows={6} style={{ ...input, marginTop: 12 }} />
      </section>

      <section style={box}>
        <h2 style={{ fontSize: 17, marginTop: 0 }}>1. Live Preflight</h2>
        <button style={btn()} disabled={busy === "preflight"} onClick={doPreflight}>{busy === "preflight" ? "Kjører…" : "Run Pinoso Facebook Preflight"}</button>
        {preflight && <div style={{ marginTop: 12 }}>
          <b style={{ color: ready ? "#16a34a" : "#dc2626" }}>{preflight.status}</b>
          {preflight.inventoryProperty && <div style={{ marginTop: 8, fontSize: 13 }}>
            Valgt bolig: <b>{preflight.inventoryProperty.ref ?? "—"}</b> · {preflight.inventoryProperty.title} · {preflight.inventoryProperty.factSourceCount} fakta
          </div>}
          <div style={{ marginTop: 8 }}>{preflight.checks.map((c) => <div key={c.name} style={{ fontSize: 13, margin: "4px 0" }}><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 5, background: dot(c.status), marginRight: 8 }} /> <b>{c.name}</b>: {c.detail}</div>)}</div>
        </div>}
      </section>

      <section style={box}>
        <h2 style={{ fontSize: 17, marginTop: 0 }}>2. Generate Inventory-grounded Draft</h2>
        <button style={btn(!!ready)} disabled={!ready || busy === "draft"} onClick={doDraft}>{busy === "draft" ? "Lager…" : "Create Pinoso Facebook Draft"}</button>
        {result && <div style={{ marginTop: 12, fontSize: 13 }}>
          <div><b>pillar:</b> {draft?.contentPillar ?? contentPillar}</div>
          <div><b>property:</b> {result.propertyRef ?? result.propertyId}</div>
          <div><b>location:</b> {result.propertyLocation ?? "—"}</div>
          <div><b>selection:</b> {result.selectionReason ?? "—"}</div>
          <div><b>mode:</b> {result.mode}</div>
          <div><b>quality:</b> {result.qualityScore ?? "—"}</div>
          <div><b>approval:</b> {result.approvalId ?? "—"}</div>
          <div><b>asset hash:</b> {result.assetHash ?? "—"}</div>
          <div style={{ marginTop: 8 }}><b>FINAL FACEBOOK CAPTION</b></div>
          <pre style={pre}>{result.caption}</pre>
          {result.imageUrl && <img src={result.imageUrl} alt="Inventory property" style={{ maxWidth: 440, borderRadius: 8 }} />}
          <div style={{ marginTop: 8 }}><b>factSources</b></div>
          <pre style={pre}>{JSON.stringify(result.factSources ?? [], null, 2)}</pre>
        </div>}
      </section>

      <section style={box}>
        <h2 style={{ fontSize: 17, marginTop: 0 }}>3. Freddy approves</h2>
        <button style={btn(!!draftOk && !!approvalId)} disabled={!draftOk || !approvalId || approved || busy === "approve"} onClick={doApprove}>
          {approved ? "Approved" : busy === "approve" ? "Godkjenner…" : "Approve Pinoso Draft"}
        </button>
      </section>

      <section style={box}>
        <h2 style={{ fontSize: 17, marginTop: 0 }}>4. Publish after explicit approval</h2>
        <button style={btn(!!ready && !!draftOk && approved && !publishRes)} disabled={!ready || !draftOk || !approved || !!publishRes || busy === "publish"} onClick={doPublish}>
          {busy === "publish" ? "Publiserer…" : publishRes ? "Published" : "Publish to Pinoso Facebook"}
        </button>
        {publishRes && <pre style={pre}>{JSON.stringify(publishRes, null, 2)}</pre>}
      </section>
    </div>
  );
}
