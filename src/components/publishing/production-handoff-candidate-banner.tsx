"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Project = { id: string; title: string; language?: string; status?: string };

export function ProductionHandoffCandidateBanner() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/publishing/book-engine", { cache: "no-store", credentials: "same-origin" })
      .then(async (res) => ({ res, json: await res.json().catch(() => ({})) }))
      .then(({ res, json }) => {
        if (!res.ok) throw new Error(json?.error || `Book Engine candidates failed (${res.status})`);
        setProjects(Array.isArray(json.projects) ? json.projects : []);
        setError("");
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, []);

  const ready = useMemo(() => projects.filter((project) => project.status === "ready_for_export"), [projects]);
  if (!ready.length && !error) return null;

  return <div style={{ maxWidth: 1500, margin: "10px auto 0", padding: "0 24px", fontFamily: "system-ui, sans-serif" }}>
    <div style={{ border: `1px solid ${error ? "#dc2626" : "#16a34a"}`, borderRadius: 10, padding: "10px 12px", background: error ? "#fef2f2" : "#f0fdf4", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      {error ? <div><b>Production Handoff candidates unavailable.</b> {error}</div> : <div>
        <b>{ready.length} Book Engine {ready.length === 1 ? "project is" : "projects are"} ready for Production Handoff.</b>
        <span style={{ marginLeft: 8, color: "#475569" }}>{ready.slice(0, 3).map((project) => project.title).join(" · ")}{ready.length > 3 ? ` · +${ready.length - 3} more` : ""}</span>
      </div>}
      {!error ? <Link href="/book-growth/production-handoff" style={{ fontWeight: 900, color: "#14532d" }}>Open Production Handoff →</Link> : null}
    </div>
  </div>;
}
