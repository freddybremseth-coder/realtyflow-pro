"use client";

import { useState } from "react";

const BRAND = {
  brandId: "donaanna",
  channel: "instagram" as const,
  accountName: "dona_anna_olives",
  publishingAccountId: "17841435921404267",
};

const PILLARS = [
  { value: "olive_oil", label: "Olive oil" },
  { value: "farm_and_harvest", label: "Farm & harvest" },
  { value: "food_and_use", label: "Food & use" },
  { value: "origin_and_craft", label: "Origin & craft" },
] as const;

const DEFAULT_IDEA = "Lag et autentisk Instagram-innlegg for Doña Anna om oliven, olivenolje, gården eller historien bak produktet. Hold deg til Brand Brain og oppgitte fakta. Ikke gi medisinske råd eller påstander om helsevirkning, sykdom, kolesterol eller andre dokumenterte effekter uten eksplisitt verifisert kilde.";

type Check = { name: string; critical: boolean; status: "ok" | "warn" | "fail"; detail: string };
type Preflight = { status: "READY_FOR_LIVE" | "NOT_READY"; checks: Check[]; criticalFailures: string[] };
type DraftResult = {
  contentId: string; publicationId: string; state: string; mode: string; source?: string;
  caption?: string; imageUrl?: string | null; accountId?: string | null; qualityScore?: number | null;
  approvalId: string | null; error?: string; factSources?: Array<{ claim: string; source: string }>;
};
type Draft = { marketingRunId: string; correlationId: string; contentPillar?: string; results: DraftResult[] };

async function post<T>(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(url, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
}

export default function DonaAnnaCanaryPage() {
  const [idea, setIdea] = useState(DEFAULT_IDEA);
  const [contentPillar, setContentPillar] = useState<(typeof PILLARS)[number]["value"]>("farm_and_harvest");
  const [mediaUrl, setMediaUrl] = useState("");
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [approved, setApproved] = useState(false);
  const [publishRes, setPublishRes] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const result = draft?.results?.[0];
  const ready = preflight?.status === "READY_FOR_LIVE";
  const validMedia = /^https:\/\//i.test(mediaUrl.trim());

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key); setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };

  const preflightNow = () => run("preflight", async () => {
    setDraft(null); setApproved(false); setPublishRes(null);
    if (!validMedia) throw new Error("Legg inn en offentlig HTTPS-bildeadresse først.");
    const r = await post<Preflight>("/api/marketing/preflight", {
      mode: "live",
      brandId: BRAND.brandId,
      channel: BRAND.channel,
      aiMode: true,
      publishingAccountId: BRAND.publishingAccountId,
      language: "no",
      mediaUrl: mediaUrl.trim(),
    });
    if (!r.ok) throw new Error((r.data as any)?.error || `Preflight feilet (${r.status})`);
    setPreflight(r.data);
  });

  const createDraft = () => run("draft", async () => {
    const r = await post<Draft>("/api/marketing/campaign-draft-with-pillar", {
      brandId: BRAND.brandId,
      channel: BRAND.channel,
      publishingAccountId: BRAND.publishingAccountId,
      language: "no",
      mediaUrl: mediaUrl.trim(),
      masterIdea: idea,
      contentPillar,
      goal: { kind: "awareness", target: 1 },
    });
    if (!r.ok) throw new Error((r.data as any)?.error || `Draft feilet (${r.status})`);
    setDraft(r.data);
    const first = r.data.results?.[0];
    if (!first || first.state !== "draft") throw new Error(first?.error || "Draft ble ikke godkjennbar.");
    if (first.mode !== "manual-review") throw new Error(`STOPP: forventet manual-review, fikk ${first.mode}`);
  });

  const approve = () => run("approve", async () => {
    if (!result?.approvalId) throw new Error("Mangler approval-id.");
    const r = await post<any>(`/api/agentic/approvals/${result.approvalId}`, { decision: "approve" });
    if (!r.ok) throw new Error(r.data?.error || `Godkjenning feilet (${r.status})`);
    setApproved(true);
  });

  const publish = () => run("publish", async () => {
    if (!result?.approvalId) throw new Error("Mangler approval-id.");
    const r = await post<any>("/api/marketing/run-publication", { approvalId: result.approvalId });
    if (!r.ok) throw new Error(r.data?.error || `Publisering feilet (${r.status})`);
    setPublishRes(r.data);
  });

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ marginBottom: 4 }}>Doña Anna — Instagram Canary</h1>
      <p style={{ color: "#64748b", marginTop: 0 }}>AI suggests. Freddy reviews. Freddy approves. Ingen autopublisering.</p>

      {error && <div style={{ background: "#fef2f2", color: "#b91c1c", padding: 12, borderRadius: 10, marginBottom: 12 }}>⛔ {error}</div>}

      <section style={box}>
        <b>Brand og kanal</b>
        <div style={{ marginTop: 6 }}>Doña Anna · Instagram · @{BRAND.accountName}</div>
        <div style={{ fontSize: 13, color: "#64748b", marginTop: 6 }}>Fokus: gård, oliven, olivenolje, råvare, produksjon og storytelling. Helse-/sykdomspåstander krever eksplisitt kilde og blokkeres ellers av claim-guard.</div>
      </section>

      <section style={box}>
        <label style={label}>Content pillar</label>
        <select value={contentPillar} onChange={(e) => setContentPillar(e.target.value as (typeof PILLARS)[number]["value"])} style={input}>
          {PILLARS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <label style={{ ...label, marginTop: 12 }}>Offentlig bilde-URL (HTTPS)</label>
        <input value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="https://...jpg" style={input} />
        <label style={{ ...label, marginTop: 12 }}>Master idea</label>
        <textarea value={idea} onChange={(e) => setIdea(e.target.value)} rows={6} style={{ ...input, resize: "vertical" }} />
      </section>

      <section style={box}>
        <h2 style={h2}>1. Live preflight</h2>
        <button style={button} disabled={busy === "preflight" || !validMedia} onClick={preflightNow}>{busy === "preflight" ? "Kjører…" : "Run preflight"}</button>
        {preflight && <div style={{ marginTop: 10 }}><b>{preflight.status}</b>{preflight.checks.map((c) => <div key={c.name} style={{ fontSize: 13, marginTop: 4 }}>{c.status === "ok" ? "✅" : c.status === "warn" ? "⚠️" : "⛔"} {c.name}: {c.detail}</div>)}</div>}
      </section>

      <section style={box}>
        <h2 style={h2}>2. Generate grounded Brand Brain draft</h2>
        <button style={button} disabled={!ready || busy === "draft"} onClick={createDraft}>{busy === "draft" ? "Lager…" : "Create draft"}</button>
        {result && <div style={{ marginTop: 12 }}>
          <div>Mode: <b>{result.mode}</b> · Pillar: <b>{draft?.contentPillar ?? contentPillar}</b> · Quality: <b>{result.qualityScore ?? "—"}</b></div>
          <div style={{ marginTop: 8 }}><b>Caption</b></div>
          <pre style={pre}>{result.caption}</pre>
          {result.imageUrl && <img src={result.imageUrl} alt="Doña Anna canary" style={{ maxWidth: 480, width: "100%", borderRadius: 10 }} />}
        </div>}
      </section>

      <section style={box}>
        <h2 style={h2}>3. Explicit approval</h2>
        <button style={button} disabled={!result?.approvalId || approved || busy === "approve"} onClick={approve}>{approved ? "Godkjent" : busy === "approve" ? "Godkjenner…" : "Approve"}</button>
      </section>

      <section style={box}>
        <h2 style={h2}>4. Publish</h2>
        <button style={button} disabled={!approved || !!publishRes || busy === "publish"} onClick={publish}>{busy === "publish" ? "Publiserer…" : "Publish to Instagram"}</button>
        {publishRes && <pre style={pre}>{JSON.stringify(publishRes, null, 2)}</pre>}
      </section>
    </div>
  );
}

const box: React.CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, marginTop: 14, background: "white" };
const label: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 700, marginBottom: 5 };
const input: React.CSSProperties = { width: "100%", padding: 10, border: "1px solid #cbd5e1", borderRadius: 8, boxSizing: "border-box" };
const button: React.CSSProperties = { padding: "10px 14px", borderRadius: 8, border: 0, background: "#111827", color: "white", fontWeight: 700 };
const h2: React.CSSProperties = { fontSize: 17, marginTop: 0 };
const pre: React.CSSProperties = { whiteSpace: "pre-wrap", background: "#f8fafc", padding: 12, borderRadius: 8, overflowX: "auto" };
