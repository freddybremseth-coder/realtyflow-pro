"use client";

import { useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";

type ManifestIdentity = {
  workKey: string;
  editionKey: string;
  revisionNumber?: number;
};

type VerifiedAsset = {
  assetType: string;
  role: string;
  storageBucket: string;
  storagePath: string;
  fingerprint: string;
  version: number;
  verified: boolean;
  canonical: boolean;
  metadata?: Record<string, unknown>;
};

const TYPES = ["manuscript_docx", "epub", "pdf", "cover", "sample", "metadata", "package_zip", "source"];
const DEFAULT_ROLE: Record<string, string> = {
  manuscript_docx: "english_master",
  epub: "retailer_epub",
  pdf: "print_interior",
  cover: "ebook_cover",
  sample: "reader_sample",
  metadata: "retailer_metadata",
  package_zip: "complete_publication_package",
  source: "source",
};

async function sha256(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function PublicationArtifactUploader({
  identity,
  onVerifiedAsset,
}: {
  identity: ManifestIdentity | null;
  onVerifiedAsset: (asset: VerifiedAsset) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [assetType, setAssetType] = useState("epub");
  const [role, setRole] = useState(DEFAULT_ROLE.epub);
  const [canonical, setCanonical] = useState(true);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const ready = useMemo(() => Boolean(identity?.workKey && identity?.editionKey && file), [identity, file]);

  function changeType(value: string) {
    const nextRole = DEFAULT_ROLE[value] || value;
    setAssetType(value);
    setRole(nextRole);
    setCanonical(true);
  }

  function changeRole(value: string) {
    setRole(value);
    if (assetType === "cover" && value.trim() === "kdp_full_wrap") setCanonical(false);
  }

  async function upload() {
    if (!identity || !file) return;
    setBusy(true);
    setStatus("Computing SHA-256 fingerprint…");
    try {
      const fingerprint = await sha256(file);
      const input = {
        workKey: identity.workKey,
        editionKey: identity.editionKey,
        revisionNumber: identity.revisionNumber || 1,
        assetType,
        role: role.trim() || assetType,
        filename: file.name,
        fingerprint,
        size: file.size,
        mimeType: file.type || "application/octet-stream",
        canonical,
      };

      setStatus("Requesting a short-lived upload ticket…");
      const ticketResponse = await fetch("/api/book-growth/package-ingest/upload-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const ticket = await ticketResponse.json().catch(() => ({}));
      if (!ticketResponse.ok) throw new Error(ticket.error || `Upload ticket failed (${ticketResponse.status})`);

      setStatus("Uploading directly to private Supabase Storage…");
      const { error: uploadError } = await getSupabase().storage
        .from(ticket.bucket)
        .uploadToSignedUrl(ticket.storagePath, ticket.token, file);
      if (uploadError) throw uploadError;

      setStatus("Verifying stored bytes against SHA-256…");
      const finalizeResponse = await fetch("/api/book-growth/package-ingest/finalize-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, storagePath: ticket.storagePath }),
      });
      const finalized = await finalizeResponse.json().catch(() => ({}));
      if (!finalizeResponse.ok || !finalized.asset) throw new Error(finalized.error || `Verification failed (${finalizeResponse.status})`);

      onVerifiedAsset(finalized.asset as VerifiedAsset);

      if (input.assetType === "package_zip" && input.role === "complete_publication_package") {
        setStatus("Package verified. Expanding and verifying publication assets…");
        const expandResponse = await fetch("/api/book-growth/package-ingest/expand-package", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...input, storagePath: ticket.storagePath }),
        });
        const expanded = await expandResponse.json().catch(() => ({}));
        if (!expandResponse.ok || !Array.isArray(expanded.assets)) {
          throw new Error(expanded.error || `Package expansion failed (${expandResponse.status})`);
        }
        for (const asset of expanded.assets) onVerifiedAsset(asset as VerifiedAsset);
        const ignored = Array.isArray(expanded.ignoredEntries) && expanded.ignoredEntries.length
          ? ` Ignored helper files: ${expanded.ignoredEntries.length}.`
          : "";
        setStatus(`Package verified and expanded: ${expanded.assets.length} publication assets added.${ignored}`);
      } else {
        setStatus(`Verified and added to manifest: ${finalized.asset.role}`);
      }
      setFile(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return <section style={{ background: "white", border: "1px solid #aebdce", borderRadius: 14, padding: 18, marginBottom: 18 }}>
    <h2 style={{ marginTop: 0 }}>Artifact Upload</h2>
    <p style={{ lineHeight: 1.5 }}>
      Upload a complete publication ZIP to assemble the package automatically, or upload individual repair assets. Files go directly from your browser to the private <code>publishing-assets</code> bucket using a short-lived signed token. Book OS verifies stored bytes with SHA-256 before any asset is added to the manifest.
    </p>
    {!identity ? <p style={{ fontWeight: 800, color: "#b45309" }}>Enter a valid manifest with workKey and editionKey first.</p> : <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <label style={{ fontWeight: 800 }}>Asset type
          <select value={assetType} onChange={(event) => changeType(event.target.value)} style={{ width: "100%", padding: 8, display: "block", marginTop: 4 }}>
            {TYPES.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label style={{ fontWeight: 800 }}>Role
          <input value={role} onChange={(event) => changeRole(event.target.value)} style={{ width: "100%", padding: 8, display: "block", marginTop: 4, boxSizing: "border-box" }} />
        </label>
      </div>
      <label style={{ fontWeight: 800 }}>File
        <input type="file" onChange={(event) => setFile(event.target.files?.[0] || null)} style={{ display: "block", marginTop: 6 }} />
      </label>
      <label style={{ fontWeight: 800, display: "flex", gap: 8, alignItems: "center" }}>
        <input type="checkbox" checked={canonical} onChange={(event) => setCanonical(event.target.checked)} />
        Canonical asset for this type
      </label>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button disabled={!ready || busy} onClick={upload} style={{ padding: "9px 14px", fontWeight: 900, background: "#0f172a", color: "white", borderRadius: 8 }}>
          {busy ? "Uploading / verifying…" : assetType === "package_zip" ? "Upload, verify and expand package" : "Upload and verify"}
        </button>
        {file ? <span style={{ fontSize: 12 }}>{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</span> : null}
      </div>
      {status ? <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, background: "#f8fafc", padding: 10, borderRadius: 8 }}>{status}</pre> : null}
    </div>}
  </section>;
}
