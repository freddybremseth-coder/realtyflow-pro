"use client";

/**
 * Phase 7.1H — Marketing Growth OS: Canary Control.
 *
 * Minimal admin-panel oppå EKSISTERENDE endepunkter (ingen ny arkitektur):
 *   /api/marketing/preflight · /api/marketing/campaign-draft ·
 *   /api/marketing/remove-legacy-schedule · /api/agentic/approvals/[id] ·
 *   /api/marketing/run-publication
 * Auth via eksisterende admin-session-cookie (ingen admin-key i klienten).
 * Ingen auto-publish, ingen scheduling, ingen AI-regenerering, ingen fuzzy.
 * COPILOT beholdes: hvert steg krever et bevisst klikk, i rekkefølge.
 */

import { useState } from "react";

// Forhåndsvalgt canary (første ekte Growth OS-post).
const CANARY = {
  brandId: "zeneco",
  channel: "instagram" as const,
  accountName: "zenecohomesspain",
  publishingAccountId: "17841472943966484",
  legacyPublicationId: "19eb4c29-aefd-4699-8af5-eaeefd8a51cf",
};

type Check = { name: string; critical: boolean; status: "ok" | "warn" | "fail"; detail: string };
type Preflight = { status: "READY_FOR_LIVE" | "NOT_READY"; mode?: string; checks: Check[]; criticalFailures: string[]; assetHash?: string };
type DraftResult = {
  contentId: string; channel: string; publicationId: string; state: string; mode: string;
  source?: string; caption?: string; imageUrl?: string | null; brandId?: string; accountId?: string | null; assetHash?: string; approvalId: string | null; error?: string;
};
type Draft = { marketingRunId: string; correlationId: string; campaignId: string; results: DraftResult[] };

async function post<T>(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(url, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
}

const dot = (status: string) => (status === "ok" ? "#16a34a" : status === "warn" ? "#d97706" : "#dc2626");

export default function CanaryControlPage() {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [legacyRemoved, setLegacyRemoved] = useState(false);
  const [approved, setApproved] = useState(false);
  const [publishRes, setPublishRes] = useState<any>(null);

  const result = draft?.results[0];
  const sourceOk = result?.source === "legacy_content_publication";
  const readyForLive = preflight?.status === "READY_FOR_LIVE";
  const approvalId = result?.approvalId ?? null;

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key); setErr(null);
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };

  const doPreflight = () => run("preflight", async () => {
    setDraft(null); setLegacyRemoved(false); setApproved(false); setPublishRes(null);
    const r = await post<Preflight>("/api/marketing/preflight", {
      mode: "live", brandId: CANARY.brandId, channel: CANARY.channel,
      publishingAccountId: CANARY.publishingAccountId, contentHubItemId: `content_publication:${CANARY.legacyPublicationId}`,
    });
    if (!r.ok) throw new Error((r.data as any)?.error || `preflight feilet (${r.status})`);
    setPreflight(r.data);
  });

  const doDraft = () => run("draft", async () => {
    const r = await post<Draft>("/api/marketing/campaign-draft", {
      brandId: CANARY.brandId, channel: CANARY.channel, legacyPublicationId: CANARY.legacyPublicationId,
      publishingAccountId: CANARY.publishingAccountId, goal: { kind: "qualified_leads", target: 10 }, masterIdea: "canary",
    });
    if (!r.ok) throw new Error((r.data as any)?.error || `campaign-draft feilet (${r.status})`);
    setDraft(r.data);
    const res0 = r.data.results?.[0];
    if (!res0 || res0.source !== "legacy_content_publication") {
      throw new Error(`STOPP: source ble «${res0?.source ?? "ukjent"}», ikke legacy_content_publication.`);
    }
    if (res0.error) throw new Error(`Draft avvist: ${res0.error}`);
  });

  const doRemoveLegacy = () => run("legacy", async () => {
    const r = await post<{ status: string; id: string }>("/api/marketing/remove-legacy-schedule", { publicationId: CANARY.legacyPublicationId });
    if (!r.ok || r.data.status !== "LEGACY_SCHEDULER_REMOVED") throw new Error((r.data as any)?.error || "kunne ikke ta ut av legacy-scheduler");
    setLegacyRemoved(true);
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

  const publishEnabled = readyForLive && !!draft && sourceOk && legacyRemoved && approved && !publishRes;

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Marketing Growth OS — Canary Control</h1>
      <p style={{ color: "#555", fontSize: 14 }}>
        Første ekte canary. Brand <b>{CANARY.brandId}</b> · kanal <b>{CANARY.channel}</b> · konto <b>@{CANARY.accountName}</b> ({CANARY.publishingAccountId}) ·
        legacy <code>{CANARY.legacyPublicationId}</code>. COPILOT — hvert steg krever bevisst klikk.
      </p>
      {err && <div style={{ background: "#fef2f2", color: "#b91c1c", padding: 12, borderRadius: 8, margin: "12px 0", fontSize: 14 }}>⛔ {err}</div>}

      {/* 1. Preflight */}
      <section style={box}>
        <h2 style={h2}>1. Run Live Preflight</h2>
        <button style={btn(true)} disabled={busy === "preflight"} onClick={doPreflight}>{busy === "preflight" ? "Kjører…" : "Run Live Preflight"}</button>
        {preflight && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 700, color: readyForLive ? "#16a34a" : "#dc2626" }}>{preflight.status}</div>
            <ul style={{ listStyle: "none", padding: 0, marginTop: 8 }}>
              {preflight.checks.map((c) => (
                <li key={c.name} style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 13, padding: "2px 0" }}>
                  <span style={{ width: 10, height: 10, borderRadius: 5, background: dot(c.status), display: "inline-block" }} />
                  <b style={{ minWidth: 170 }}>{c.name}{c.critical ? " *" : ""}</b>
                  <span style={{ color: "#444" }}>{c.detail}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* 2. Create Canary Draft */}
      <section style={box}>
        <h2 style={h2}>2. Create Canary Draft</h2>
        <button style={btn(readyForLive)} disabled={!readyForLive || busy === "draft"} onClick={doDraft}>
          {busy === "draft" ? "Lager…" : "Create Canary Draft"}
        </button>
        {!readyForLive && <span style={hint}>Deaktivert til preflight er READY_FOR_LIVE.</span>}
        {result && (
          <div style={{ marginTop: 12, fontSize: 14 }}>
            <Row k="source" v={result.source} good={sourceOk} />
            <Row k="mode" v={result.mode} good={result.mode === "manual-review"} />
            <Row k="brand" v={result.brandId} />
            <Row k="account" v={result.accountId} />
            <Row k="publication_id" v={result.publicationId} />
            <Row k="approval_id" v={result.approvalId ?? "—"} />
            <Row k="asset_hash" v={result.assetHash} />
            <div style={{ marginTop: 8 }}><b>FINAL INSTAGRAM CAPTION</b></div>
            <pre style={pre}>{result.caption}</pre>
            {result.imageUrl && <img src={result.imageUrl} alt="preview" style={{ maxWidth: 320, borderRadius: 8, marginTop: 8 }} />}
          </div>
        )}
      </section>

      {/* 3. Remove legacy scheduling */}
      <section style={box}>
        <h2 style={h2}>3. Remove from legacy scheduler</h2>
        <p style={hint}>Hindrer dobbel-post (legacy cron ville ellers postet samme innhold 2. sept).</p>
        <button style={btn(!!draft && sourceOk && !legacyRemoved)} disabled={!draft || !sourceOk || legacyRemoved || busy === "legacy"} onClick={doRemoveLegacy}>
          {busy === "legacy" ? "…" : "Remove from legacy scheduler"}
        </button>
        {legacyRemoved && <span style={{ ...ok }}>✅ LEGACY_SCHEDULER_REMOVED</span>}
      </section>

      {/* 4. Approval */}
      <section style={box}>
        <h2 style={h2}>4. Approval</h2>
        <p style={hint}>Verifiser eksakt caption, bilde og konto (over) før du godkjenner. Bruker eksisterende Approval Gateway.</p>
        <button style={btn(legacyRemoved && !approved)} disabled={!legacyRemoved || approved || busy === "approve"} onClick={doApprove}>
          {busy === "approve" ? "…" : "Approve in Growth OS Gateway"}
        </button>
        {approved && <span style={ok}>✅ Godkjent</span>}
      </section>

      {/* 5. Publish */}
      <section style={box}>
        <h2 style={h2}>5. Publish</h2>
        <button style={btn(publishEnabled)} disabled={!publishEnabled || busy === "publish"} onClick={doPublish}>
          {busy === "publish" ? "Publiserer…" : "Publish to Instagram"}
        </button>
        {!publishEnabled && !publishRes && <span style={hint}>Krever: preflight READY · snapshot · legacy fjernet · godkjent.</span>}
        {publishRes && (
          <div style={{ marginTop: 12, fontSize: 14 }}>
            <Row k="ok" v={String(publishRes.execution?.ok)} good={!!publishRes.execution?.ok} />
            <Row k="executed" v={String(publishRes.execution?.executed ?? publishRes.execution?.alreadyExecuted ?? false)} />
            <Row k="detail (external media id / dry-run)" v={publishRes.execution?.detail ?? publishRes.execution?.error} />
            <Row k="publication_id" v={result?.publicationId} />
            <Row k="run_id" v={draft?.marketingRunId} />
            <Row k="correlation_id" v={draft?.correlationId} />
          </div>
        )}
      </section>
    </div>
  );
}

const box: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, margin: "14px 0", background: "#fff" };
const h2: React.CSSProperties = { fontSize: 16, fontWeight: 700, marginBottom: 8 };
const hint: React.CSSProperties = { color: "#6b7280", fontSize: 12, marginLeft: 8 };
const ok: React.CSSProperties = { color: "#16a34a", fontWeight: 700, marginLeft: 10 };
const pre: React.CSSProperties = { whiteSpace: "pre-wrap", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, fontSize: 13 };
const btn = (enabled: boolean): React.CSSProperties => ({
  background: enabled ? "#111827" : "#d1d5db", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 14, cursor: enabled ? "pointer" : "not-allowed",
});
function Row({ k, v, good }: { k: string; v?: string | null; good?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 8, padding: "1px 0" }}>
      <b style={{ minWidth: 210, color: "#374151" }}>{k}</b>
      <span style={{ color: good === undefined ? "#111" : good ? "#16a34a" : "#dc2626", wordBreak: "break-all" }}>{v ?? "—"}</span>
    </div>
  );
}
