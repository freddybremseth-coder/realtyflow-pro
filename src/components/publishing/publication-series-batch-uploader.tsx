"use client";

import { useState } from "react";
import { getSupabase } from "@/lib/supabase/client";

type PreparedBook = {
  title: string;
  manifest: Record<string, unknown>;
  gates: { autoApproved?: boolean; autoPublished?: boolean; nextGate?: string };
  ignoredEntries?: string[];
};

async function sha256(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function PublicationSeriesBatchUploader() {
  const [file, setFile] = useState<File | null>(null);
  const [batchKey, setBatchKey] = useState("money-power:english:r1");
  const [prepared, setPrepared] = useState<PreparedBook[]>([]);
  const [status, setStatus] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  async function prepareBatch() {
    if (!file || !batchKey.trim()) return;
    setBusy(true);
    setPrepared([]);
    setResults([]);
    try {
      setStatus("Computing batch SHA-256…");
      const fingerprint = await sha256(file);
      const input = { batchKey: batchKey.trim(), filename: file.name, fingerprint, size: file.size };
      setStatus("Requesting private series-batch upload ticket…");
      const ticketResponse = await fetch("/api/book-growth/package-ingest/series-batch/upload-ticket", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
      });
      const ticket = await ticketResponse.json().catch(() => ({}));
      if (!ticketResponse.ok) throw new Error(ticket.error || `Batch upload ticket failed (${ticketResponse.status})`);

      setStatus("Uploading one series bundle to private Storage…");
      const { error: uploadError } = await getSupabase().storage.from(ticket.bucket).uploadToSignedUrl(ticket.storagePath, ticket.token, file);
      if (uploadError) throw uploadError;

      setStatus("Verifying outer bundle, child ZIPs and publication assets…");
      const prepareResponse = await fetch("/api/book-growth/package-ingest/series-batch/prepare", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, storagePath: ticket.storagePath }),
      });
      const json = await prepareResponse.json().catch(() => ({}));
      if (!prepareResponse.ok || !Array.isArray(json.books)) throw new Error(json.error || `Batch preparation failed (${prepareResponse.status})`);
      setPrepared(json.books);
      setStatus(`Series batch prepared: ${json.books.length} books verified. Review previews before ingest.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally { setBusy(false); }
  }

  async function run(action: "preview" | "ingest") {
    if (!prepared.length) return;
    setBusy(true);
    setResults([]);
    const next: any[] = [];
    try {
      for (const book of prepared) {
        setStatus(`${action === "preview" ? "Previewing" : "Ingesting"} ${book.title}…`);
        const res = await fetch("/api/book-growth/package-ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, actor: "series_batch_ui", manifest: book.manifest }),
        });
        const json = await res.json().catch(() => ({}));
        next.push({ title: book.title, ok: res.ok, status: res.status, ...json });
        if (!res.ok) break;
      }
      setResults(next);
      const passed = next.filter((item) => item.ok).length;
      setStatus(action === "preview"
        ? `Batch preview complete: ${passed}/${prepared.length} passed. No revisions were ingested.`
        : `Batch ingest complete: ${passed}/${prepared.length} registered in review. Quality Center remains mandatory.`);
    } finally { setBusy(false); }
  }

  return <section style={{ background: "white", border: "2px solid #0f172a", borderRadius: 14, padding: 18, marginBottom: 18 }}>
    <p style={{ margin: 0, fontSize: 12, fontWeight: 900, letterSpacing: 1.2 }}>FASTEST CONTROLLED HANDOFF</p>
    <h2 style={{ margin: "5px 0 8px" }}>Series Batch Import</h2>
    <p style={{ lineHeight: 1.5 }}>Upload one Book OS series bundle containing multiple complete publication ZIPs. Book OS verifies the outer bundle, every child package and every extracted publication asset before any manifest can be previewed or ingested.</p>
    <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, .6fr) minmax(300px, 1fr)", gap: 10 }}>
      <label style={{ fontWeight: 800 }}>Batch key
        <input value={batchKey} onChange={(e) => setBatchKey(e.target.value)} style={{ width: "100%", padding: 8, display: "block", marginTop: 4, boxSizing: "border-box" }} />
      </label>
      <label style={{ fontWeight: 800 }}>Series batch ZIP
        <input type="file" accept=".zip,application/zip" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ display: "block", marginTop: 7 }} />
      </label>
    </div>
    <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
      <button disabled={busy || !file || !batchKey.trim()} onClick={prepareBatch} style={{ padding: "9px 14px", fontWeight: 900, background: "#0f172a", color: "white", borderRadius: 8 }}>{busy ? "Working…" : "Upload and prepare entire series"}</button>
      <button disabled={busy || !prepared.length} onClick={() => run("preview")} style={{ padding: "9px 14px", fontWeight: 900 }}>Preview all books</button>
      <button disabled={busy || !prepared.length} onClick={() => run("ingest")} style={{ padding: "9px 14px", fontWeight: 900, background: "#14532d", color: "white", borderRadius: 8 }}>Ingest all into review</button>
    </div>
    {status ? <pre style={{ whiteSpace: "pre-wrap", background: "#f8fafc", padding: 10, borderRadius: 8, fontSize: 12 }}>{status}</pre> : null}
    {prepared.length ? <div style={{ overflowX: "auto", marginTop: 10 }}><table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead><tr>{["Book","Assets","Next gate","Auto approved","Auto published"].map((h) => <th key={h} style={{ textAlign: "left", padding: 7, borderBottom: "1px solid #cbd5e1" }}>{h}</th>)}</tr></thead>
      <tbody>{prepared.map((book) => <tr key={book.title}><td style={{ padding: 7, borderBottom: "1px solid #e2e8f0", fontWeight: 800 }}>{book.title}</td><td style={{ padding: 7, borderBottom: "1px solid #e2e8f0" }}>{Array.isArray((book.manifest as any).assets) ? (book.manifest as any).assets.length : 0}</td><td style={{ padding: 7, borderBottom: "1px solid #e2e8f0" }}>{book.gates?.nextGate || "quality_center"}</td><td style={{ padding: 7, borderBottom: "1px solid #e2e8f0" }}>{book.gates?.autoApproved ? "Yes" : "No"}</td><td style={{ padding: 7, borderBottom: "1px solid #e2e8f0" }}>{book.gates?.autoPublished ? "Yes" : "No"}</td></tr>)}</tbody>
    </table></div> : null}
    {results.length ? <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", background: "#f8fafc", padding: 10, borderRadius: 8, fontSize: 11 }}>{JSON.stringify(results, null, 2)}</pre> : null}
  </section>;
}
