"use client";

import { useEffect, useMemo, useState } from "react";
import { PublicationArtifactUploader } from "@/components/publishing/publication-artifact-uploader";

const example = {
  action: "preview",
  actor: "admin_ui",
  manifest: {
    ingestKey: "money-power:debt-machine:en:r1",
    workKey: "money-power:debt-machine",
    editionKey: "money-power:debt-machine:en:ebook",
    title: "THE DEBT MACHINE",
    subtitle: "How Credit Creates Money, Fortunes, Crises and Power",
    seriesName: "Money & Power",
    seriesNumber: 2,
    language: "en",
    format: "ebook",
    revisionNumber: 1,
    packageFingerprint: "",
    contentFingerprint: "",
    productionStatus: "production_ready",
    assets: [],
  },
};

type Ingest = {
  id: string;
  ingest_key: string;
  status: string;
  actor: string;
  created_at: string;
  manifest?: { title?: string; seriesName?: string; productionStatus?: string };
};

type VerifiedAsset = Record<string, any> & { assetType: string; role: string; fingerprint: string };

export default function PackageIngestPage() {
  const [text, setText] = useState(JSON.stringify(example, null, 2));
  const [result, setResult] = useState<any>(null);
  const [ingests, setIngests] = useState<Ingest[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");

  async function refresh() {
    const res = await fetch("/api/book-growth/package-ingest", { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.available === false) {
      setLoadError(json.error || "Package ingest is not available yet.");
      return;
    }
    setLoadError("");
    setIngests(Array.isArray(json.ingests) ? json.ingests : []);
  }

  useEffect(() => { refresh().catch((error) => setLoadError(String(error))); }, []);

  const parsed = useMemo(() => {
    try { return { ok: true as const, value: JSON.parse(text) }; }
    catch (error) { return { ok: false as const, error: error instanceof Error ? error.message : String(error) }; }
  }, [text]);

  const identity = parsed.ok && parsed.value?.manifest ? {
    workKey: String(parsed.value.manifest.workKey || ""),
    editionKey: String(parsed.value.manifest.editionKey || ""),
    revisionNumber: Number(parsed.value.manifest.revisionNumber || 1),
  } : null;

  function addVerifiedAsset(asset: VerifiedAsset) {
    if (!parsed.ok || !parsed.value?.manifest) return;
    const envelope = structuredClone(parsed.value);
    const manifest = envelope.manifest;
    const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
    manifest.assets = [...assets.filter((item: any) => String(item?.role || "") !== asset.role), asset];
    if (asset.assetType === "package_zip") manifest.packageFingerprint = asset.fingerprint;
    if (asset.assetType === "manuscript_docx") manifest.contentFingerprint = asset.fingerprint;
    setText(JSON.stringify(envelope, null, 2));
  }

  async function submit(action: "preview" | "ingest") {
    if (!parsed.ok) return;
    setBusy(true);
    setResult(null);
    try {
      const body = { ...parsed.value, action };
      const res = await fetch("/api/book-growth/package-ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      setResult({ ok: res.ok, status: res.status, ...json });
      if (res.ok && action === "ingest") await refresh();
    } finally { setBusy(false); }
  }

  return <main style={{ maxWidth: 1240, margin: "0 auto", padding: "28px 24px 72px", fontFamily: "system-ui, sans-serif" }}>
    <header style={{ marginBottom: 22 }}>
      <p style={{ fontWeight: 900, letterSpacing: 1.5, fontSize: 12, margin: 0 }}>BOOK OS · PRODUCTION HANDOFF</p>
      <h1 style={{ fontSize: 34, margin: "6px 0" }}>Publication Package Ingest</h1>
      <p style={{ maxWidth: 950, lineHeight: 1.55 }}>
        Upload completed publication artifacts, verify their stored bytes with SHA-256, assemble the immutable package manifest, then register the exact production revision. Ingest still never approves or publishes anything: Quality Center remains the next mandatory gate.
      </p>
    </header>

    {loadError ? <section style={{ padding: 14, border: "1px solid #b45309", borderRadius: 10, background: "#fff7ed", marginBottom: 18 }}>
      <b>Schema not ready:</b> {loadError}
    </section> : null}

    <PublicationArtifactUploader identity={identity} onVerifiedAsset={addVerifiedAsset} />

    <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(320px, .8fr)", gap: 18, alignItems: "start" }}>
      <article style={{ background: "white", border: "1px solid #aebdce", borderRadius: 14, padding: 18 }}>
        <h2 style={{ marginTop: 0 }}>Package manifest</h2>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          spellCheck={false}
          style={{ width: "100%", minHeight: 620, resize: "vertical", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, lineHeight: 1.5, padding: 12, borderRadius: 10, border: `1px solid ${parsed.ok ? "#94a3b8" : "#dc2626"}`, boxSizing: "border-box" }}
        />
        {!parsed.ok ? <p style={{ color: "#b91c1c", fontWeight: 800 }}>Invalid JSON: {parsed.error}</p> : null}
        <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          <button disabled={busy || !parsed.ok} onClick={() => submit("preview")} style={{ padding: "9px 14px", fontWeight: 900 }}>Preview gates</button>
          <button disabled={busy || !parsed.ok} onClick={() => submit("ingest")} style={{ padding: "9px 14px", fontWeight: 900, background: "#0f172a", color: "white", borderRadius: 8 }}>Ingest package</button>
          <button disabled={busy} onClick={() => setText(JSON.stringify(example, null, 2))} style={{ padding: "9px 14px", fontWeight: 800 }}>New manifest</button>
        </div>
      </article>

      <aside style={{ display: "grid", gap: 18 }}>
        <article style={{ background: "white", border: "1px solid #aebdce", borderRadius: 14, padding: 18 }}>
          <h2 style={{ marginTop: 0 }}>Result</h2>
          {result ? <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 12, lineHeight: 1.5, background: result.ok ? "#f0fdf4" : "#fef2f2", padding: 12, borderRadius: 10 }}>{JSON.stringify(result, null, 2)}</pre> : <p>Upload the assets, then preview the manifest before ingesting it.</p>}
        </article>
        <article style={{ background: "white", border: "1px solid #aebdce", borderRadius: 14, padding: 18 }}>
          <h2 style={{ marginTop: 0 }}>Safety boundary</h2>
          <ul style={{ paddingLeft: 18, lineHeight: 1.55 }}>
            <li>Storage paths are generated server-side and include the SHA-256 fingerprint.</li>
            <li>Uploaded bytes are re-hashed before an asset becomes <b>verified</b>.</li>
            <li>Creates a canonical revision in <b>review</b>, not approved.</li>
            <li>Does not create retailer publications.</li>
            <li>Does not approve launch campaigns or release candidates.</li>
          </ul>
        </article>
      </aside>
    </section>

    <section style={{ marginTop: 22, background: "white", border: "1px solid #aebdce", borderRadius: 14, padding: 18 }}>
      <h2 style={{ marginTop: 0 }}>Recent package ingests</h2>
      {ingests.length === 0 ? <p>No ingests registered yet.</p> : <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>{["Title","Ingest key","Status","Actor","Created"].map((h) => <th key={h} style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #cbd5e1" }}>{h}</th>)}</tr></thead>
        <tbody>{ingests.map((row) => <tr key={row.id}>
          <td style={{ padding: 8, borderBottom: "1px solid #e2e8f0", fontWeight: 800 }}>{row.manifest?.title || "—"}</td>
          <td style={{ padding: 8, borderBottom: "1px solid #e2e8f0", fontFamily: "monospace", fontSize: 12 }}>{row.ingest_key}</td>
          <td style={{ padding: 8, borderBottom: "1px solid #e2e8f0" }}>{row.status}</td>
          <td style={{ padding: 8, borderBottom: "1px solid #e2e8f0" }}>{row.actor}</td>
          <td style={{ padding: 8, borderBottom: "1px solid #e2e8f0" }}>{new Date(row.created_at).toLocaleString()}</td>
        </tr>)}</tbody>
      </table></div>}
    </section>
  </main>;
}
