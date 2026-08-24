"use client";

/**
 * Phase 7.1J — Marketing Growth OS: Canary Control (Legacy + AI Generated).
 *
 * Minimalt admin-panel oppå EKSISTERENDE endepunkter (ingen ny arkitektur).
 * Auth via eksisterende admin-session-cookie (ingen admin-key i klienten).
 * Mode-velger: Legacy Content (default) | AI Generated.
 * COPILOT beholdes: hvert steg krever bevisst klikk. Ingen auto-publish, ingen
 * scheduling, ingen fuzzy. AI-generert innhold kan ALDRI være sin egen fakta-kilde.
 */

import { useState } from "react";

const CANARY = {
  brandId: "zeneco",
  channel: "instagram" as const,
  accountName: "zenecohomesspain",
  publishingAccountId: "17841472943966484",
  legacyPublicationId: "19eb4c29-aefd-4699-8af5-eaeefd8a51cf",
};

const AI_PREFILL =
  "Lag et engasjerende Instagram-innlegg for Zen Eco Homes om hvorfor kjøpere bør vurdere moderne, energieffektive boliger på Costa Blanca. Vekt tillit, norsk veiledning og kvalitet. Ikke finn opp priser, boligspesifikasjoner, garantier, statistikk eller påstander som ikke er støttet av kilder.";

type Check = { name: string; critical: boolean; status: "ok" | "warn" | "fail"; detail: string };
type Preflight = { status: "READY_FOR_LIVE" | "NOT_READY"; mode?: string; checks: Check[]; criticalFailures: string[] };
type DraftResult = {
  contentId: string; channel: string; publicationId: string; state: string; mode: string;
  source?: string; caption?: string; imageUrl?: string | null; brandId?: string; accountId?: string | null; assetHash?: string;
  qualityScore?: number | null; approvalId: string | null; error?: string; factSources?: Array<{ claim: string; source: string }>;
};
type Draft = { marketingRunId: string; correlationId: string; campaignId: string; results: DraftResult[] };
type Mode = "legacy" | "ai";

async function post<T>(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(url, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
}
const dot = (s: string) => (s === "ok" ? "#16a34a" : s === "warn" ? "#d97706" : "#dc2626");
// Klient-side fakta-signal: tall/valuta/spesifikke boligfakta i caption.
const FACT_SIGNAL = /(€|\bkr\b|\bm²\b|\bkvm\b|\d[\d.\s]{2,}|\bsoverom\b|\bbad\b|\bgaranti\b|\bavkastning\b|\bprosent\b|%)/i;

export default function CanaryControlPage() {
  const [mode, setMode] = useState<Mode>("legacy");
  const [ai, setAi] = useState({ masterIdea: AI_PREFILL, focus: "", service: "", market: "", language: "no", mediaUrl: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [legacyRemoved, setLegacyRemoved] = useState(false);
  const [approved, setApproved] = useState(false);
  const [publishRes, setPublishRes] = useState<any>(null);

  const result = draft?.results[0];
  const readyForLive = preflight?.status === "READY_FOR_LIVE";
  const approvalId = result?.approvalId ?? null;
  const isAi = mode === "ai";

  const sourceOk = isAi ? result?.source === "generated" : result?.source === "legacy_content_publication";
  const draftOk = result?.state === "draft";
  // HARD fakta-blokk: generert + tom factSources + caption med faktapåstand → blokker approval.
  const factBlocked = !!result && result.source === "generated" && (result.factSources?.length ?? 0) === 0 && FACT_SIGNAL.test(result.caption ?? "");
  // Step 3 gjelder kun legacy; i AI-modus er den N/A (og fjernes aldri via endpoint).
  const legacyStepDone = isAi ? true : legacyRemoved;

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key); setErr(null);
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };
  const reset = () => { setPreflight(null); setDraft(null); setLegacyRemoved(false); setApproved(false); setPublishRes(null); setErr(null); };

  const doPreflight = () => run("preflight", async () => {
    reset();
    const body: any = { mode: "live", brandId: CANARY.brandId, channel: CANARY.channel, publishingAccountId: CANARY.publishingAccountId, service: ai.service || undefined, market: ai.market || undefined, language: ai.language || undefined };
    if (isAi) { body.aiMode = true; if (ai.mediaUrl) body.mediaUrl = ai.mediaUrl; }
    else body.contentHubItemId = `content_publication:${CANARY.legacyPublicationId}`;
    const r = await post<Preflight>("/api/marketing/preflight", body);
    if (!r.ok) throw new Error((r.data as any)?.error || `preflight feilet (${r.status})`);
    setPreflight(r.data);
  });

  const doDraft = () => run("draft", async () => {
    const body: any = { brandId: CANARY.brandId, channel: CANARY.channel, publishingAccountId: CANARY.publishingAccountId, goal: { kind: "qualified_leads", target: 10 } };
    if (isAi) {
      body.masterIdea = ai.masterIdea; body.focus = ai.focus || undefined; body.service = ai.service || undefined;
      body.market = ai.market || undefined; body.language = ai.language || undefined; if (ai.mediaUrl) body.mediaUrl = ai.mediaUrl;
      // Ingen legacyPublicationId i AI-modus.
    } else {
      body.masterIdea = "canary"; body.legacyPublicationId = CANARY.legacyPublicationId;
    }
    const r = await post<Draft>("/api/marketing/campaign-draft", body);
    if (!r.ok) throw new Error((r.data as any)?.error || `campaign-draft feilet (${r.status})`);
    setDraft(r.data);
    const res0 = r.data.results?.[0];
    if (!res0) throw new Error("Ingen resultat fra campaign-draft.");
    if (res0.state !== "draft") throw new Error(`Draft blokkert: ${res0.error ?? res0.state}`);
    const expected = isAi ? "generated" : "legacy_content_publication";
    if (res0.source !== expected) throw new Error(`STOPP: source ble «${res0.source ?? "ukjent"}», forventet «${expected}».`);
  });

  const doRemoveLegacy = () => run("legacy", async () => {
    const r = await post<{ status: string }>("/api/marketing/remove-legacy-schedule", { publicationId: CANARY.legacyPublicationId });
    if (!r.ok || r.data.status !== "LEGACY_SCHEDULER_REMOVED") throw new Error((r.data as any)?.error || "kunne ikke ta ut av legacy-scheduler");
    setLegacyRemoved(true);
  });

  const doApprove = () => run("approve", async () => {
    if (factBlocked) throw new Error("BLOKKERT: generert innhold har faktapåstand uten kilde — kan ikke godkjennes.");
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

  const publishEnabled = readyForLive && draftOk && sourceOk && !factBlocked && legacyStepDone && approved && !publishRes;

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Marketing Growth OS — Canary Control</h1>

      {/* Mode selector */}
      <div style={{ display: "flex", gap: 8, margin: "10px 0" }}>
        {(["legacy", "ai"] as Mode[]).map((m) => (
          <button key={m} onClick={() => { setMode(m); reset(); }} style={{ ...tab, ...(mode === m ? tabActive : {}) }}>
            {m === "legacy" ? "Legacy Content" : "AI Generated"}
          </button>
        ))}
      </div>
      <p style={{ color: "#555", fontSize: 14 }}>
        Brand <b>{CANARY.brandId}</b> · kanal <b>{CANARY.channel}</b> · konto <b>@{CANARY.accountName}</b> ({CANARY.publishingAccountId}).
        {isAi ? " AI-modus: innhold genereres (uten fuzzy, uten self-source på fakta)." : ` Legacy: content_publication ${CANARY.legacyPublicationId}.`} COPILOT.
      </p>
      {err && <div style={{ background: "#fef2f2", color: "#b91c1c", padding: 12, borderRadius: 8, margin: "12px 0", fontSize: 14 }}>⛔ {err}</div>}

      {isAi && (
        <section style={box}>
          <h2 style={h2}>AI-input</h2>
          <label style={lbl}>masterIdea</label>
          <textarea value={ai.masterIdea} onChange={(e) => setAi({ ...ai, masterIdea: e.target.value })} rows={4} style={ta} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            <Field k="focus (valgfri)" v={ai.focus} on={(v) => setAi({ ...ai, focus: v })} />
            <Field k="service (valgfri)" v={ai.service} on={(v) => setAi({ ...ai, service: v })} />
            <Field k="market (valgfri)" v={ai.market} on={(v) => setAi({ ...ai, market: v })} />
            <Field k="language" v={ai.language} on={(v) => setAi({ ...ai, language: v })} />
            <Field k="mediaUrl (valgfri, kreves for live IG)" v={ai.mediaUrl} on={(v) => setAi({ ...ai, mediaUrl: v })} wide />
          </div>
        </section>
      )}

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

      {/* 2. Draft */}
      <section style={box}>
        <h2 style={h2}>2. {isAi ? "Generate Canary Draft (AI)" : "Create Canary Draft (Legacy)"}</h2>
        <button style={btn(readyForLive)} disabled={!readyForLive || busy === "draft"} onClick={doDraft}>{busy === "draft" ? "Lager…" : "Create Draft"}</button>
        {!readyForLive && <span style={hint}>Deaktivert til preflight er READY_FOR_LIVE.</span>}
        {result && (
          <div style={{ marginTop: 12, fontSize: 14 }}>
            <Row k="source" v={result.source} good={sourceOk} />
            <Row k="mode" v={result.mode} good={result.mode === "manual-review"} />
            <Row k="state" v={result.state} good={draftOk} />
            <Row k="quality_score" v={String(result.qualityScore ?? "—")} />
            <Row k="brand" v={result.brandId} />
            <Row k="account" v={result.accountId} />
            <Row k="publication_id" v={result.publicationId} />
            <Row k="run_id" v={draft?.marketingRunId} />
            <Row k="correlation_id" v={draft?.correlationId} />
            <Row k="approval_id" v={result.approvalId ?? "—"} />
            <Row k="asset_hash" v={result.assetHash} />
            <div style={{ marginTop: 8 }}><b>factSources</b></div>
            <pre style={pre}>{(result.factSources?.length ?? 0) ? JSON.stringify(result.factSources, null, 2) : "[] (ingen)"}</pre>
            <div style={{ marginTop: 8 }}><b>FINAL INSTAGRAM CAPTION</b></div>
            <pre style={pre}>{result.caption}</pre>
            {result.imageUrl && <img src={result.imageUrl} alt="preview" style={{ maxWidth: 320, borderRadius: 8, marginTop: 8 }} />}
            {factBlocked && (
              <div style={{ background: "#fef2f2", color: "#b91c1c", padding: 12, borderRadius: 8, marginTop: 10, fontWeight: 600 }}>
                ⛔ BLOKKERER GODKJENNING: AI-generert innhold har faktapåstand/tall uten uavhengig kilde (factSources tom). Regenerér uten uverifiserte fakta, eller legg til kilde.
              </div>
            )}
          </div>
        )}
      </section>

      {/* 3. Legacy scheduler removal — N/A i AI-modus */}
      <section style={box}>
        <h2 style={h2}>3. Remove from legacy scheduler</h2>
        {isAi ? (
          <div style={{ color: "#6b7280", fontWeight: 600 }}>NOT_APPLICABLE — AI-modus har ingen legacy-scheduler-rad.</div>
        ) : (
          <>
            <p style={hint}>Hindrer dobbel-post (legacy cron ville ellers postet samme innhold).</p>
            <button style={btn(!!draft && sourceOk && !legacyRemoved)} disabled={!draft || !sourceOk || legacyRemoved || busy === "legacy"} onClick={doRemoveLegacy}>
              {busy === "legacy" ? "…" : "Remove from legacy scheduler"}
            </button>
            {legacyRemoved && <span style={ok}>✅ LEGACY_SCHEDULER_REMOVED</span>}
          </>
        )}
      </section>

      {/* 4. Approval */}
      <section style={box}>
        <h2 style={h2}>4. Approval</h2>
        <p style={hint}>Verifiser eksakt caption, bilde, konto og factSources (over) før du godkjenner.</p>
        <button style={btn(legacyStepDone && draftOk && sourceOk && !factBlocked && !approved)} disabled={!legacyStepDone || !draftOk || !sourceOk || factBlocked || approved || busy === "approve"} onClick={doApprove}>
          {busy === "approve" ? "…" : "Approve in Growth OS Gateway"}
        </button>
        {factBlocked && <span style={{ color: "#dc2626", marginLeft: 10, fontWeight: 600 }}>Blokkert av fakta-gaten.</span>}
        {approved && <span style={ok}>✅ Godkjent</span>}
      </section>

      {/* 5. Publish */}
      <section style={box}>
        <h2 style={h2}>5. Publish</h2>
        <button style={btn(publishEnabled)} disabled={!publishEnabled || busy === "publish"} onClick={doPublish}>
          {busy === "publish" ? "Publiserer…" : "Publish to Instagram"}
        </button>
        {!publishEnabled && !publishRes && <span style={hint}>Krever: preflight READY · draft · {isAi ? "" : "legacy fjernet · "}godkjent · ikke fakta-blokkert.</span>}
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
const lbl: React.CSSProperties = { fontSize: 12, color: "#374151", fontWeight: 600, display: "block", marginBottom: 4 };
const pre: React.CSSProperties = { whiteSpace: "pre-wrap", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, fontSize: 13 };
const ta: React.CSSProperties = { width: "100%", border: "1px solid #d1d5db", borderRadius: 8, padding: 8, fontSize: 13, fontFamily: "inherit" };
const tab: React.CSSProperties = { background: "#f3f4f6", color: "#374151", border: "1px solid #d1d5db", borderRadius: 8, padding: "6px 14px", fontSize: 14, cursor: "pointer" };
const tabActive: React.CSSProperties = { background: "#111827", color: "#fff", borderColor: "#111827" };
const btn = (enabled: boolean): React.CSSProperties => ({ background: enabled ? "#111827" : "#d1d5db", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 14, cursor: enabled ? "pointer" : "not-allowed" });
function Row({ k, v, good }: { k: string; v?: string | null; good?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 8, padding: "1px 0" }}>
      <b style={{ minWidth: 220, color: "#374151" }}>{k}</b>
      <span style={{ color: good === undefined ? "#111" : good ? "#16a34a" : "#dc2626", wordBreak: "break-all" }}>{v ?? "—"}</span>
    </div>
  );
}
function Field({ k, v, on, wide }: { k: string; v: string; on: (v: string) => void; wide?: boolean }) {
  return (
    <div style={{ flex: wide ? "1 1 100%" : "1 1 220px" }}>
      <label style={lbl}>{k}</label>
      <input value={v} onChange={(e) => on(e.target.value)} style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 8, padding: 8, fontSize: 13 }} />
    </div>
  );
}
