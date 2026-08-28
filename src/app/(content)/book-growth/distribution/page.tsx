"use client";

import { useEffect, useMemo, useState } from "react";

type Channel = {
  id: string; name: string; deliveryLabel: string; automatedDelivery: boolean; requiresConnection: boolean;
  connected: boolean; notes: string; documentationUrl: string;
  capabilities: Record<string, string>;
};
type Project = {
  id: string; title: string; language: string; status: string; genre?: string | null; series_name?: string | null;
  amazonAlreadyPublished?: boolean;
  approval?: { approved: boolean; approvedAt?: string | null; approvedBy?: string | null };
};
type Job = {
  id: string; status: string; action: string; created_at: string; approved_at?: string | null; superseded?: boolean; run_after?: string | null; error?: { message?: string } | null;
  project?: { id: string; title: string } | null;
  publication?: { channel: string; artifact_manifest?: { epub?: string; metadata?: string; cover?: string | null }; preflight?: { findings?: Array<{ severity: string; message: string }> } } | null;
};
type Payload = {
  summary: { channels: number; connected: number; projects: number; hiddenDrafts: number; awaitingApproval: number; processing: number; blocked: number; published: number };
  channels: Channel[]; projects: Project[]; jobs: Job[];
};

const capabilityLabels: Record<string, string> = {
  automated: "Automatisk", file_import: "Filimport", manual: "Manuelt", partner_only: "Partner", unavailable: "Ikke tilgjengelig",
};

function Metric({ label, value }: { label: string; value: number }) {
  return <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 14, background: "white" }}><div style={{ fontSize: 12, color: "#64748b", fontWeight: 800 }}>{label}</div><div style={{ fontSize: 26, fontWeight: 900, marginTop: 4 }}>{value}</div></div>;
}

const jobStatusLabels: Record<string, string> = {
  awaiting_approval: "Venter på din godkjenning",
  approved: "Godkjent – venter på levering",
  running: "Leveres nå",
  blocked: "Trenger handling",
  awaiting_manual_completion: "Klar for manuell publisering",
  completed: "Fullført",
  published: "Publisert",
  failed: "Feilet",
};

type QueueView = "approval" | "processing" | "published" | "all";

export default function BookDistributionPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [projectId, setProjectId] = useState("");
  const [selected, setSelected] = useState<string[]>(["amazon_kdp", "direct_store"]);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [aiDisclosureReviewed, setAiDisclosureReviewed] = useState(false);
  const [kdpSelectEnrollment, setKdpSelectEnrollment] = useState("unknown");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [queueView, setQueueView] = useState<QueueView>("approval");

  const load = async () => {
    const response = await fetch("/api/book-growth/distribution", { cache: "no-store", credentials: "same-origin" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
    setData(body);
    setProjectId((current) => current || body.projects?.[0]?.id || "");
  };
  useEffect(() => { void load().catch((reason) => setError(reason instanceof Error ? reason.message : String(reason))); }, []);

  const channelById = useMemo(() => new Map((data?.channels ?? []).map((channel) => [channel.id, channel])), [data]);
  const selectedProject = useMemo(() => (data?.projects ?? []).find((project) => project.id === projectId) || null, [data, projectId]);
  const effectiveSelected = useMemo(
    () => selected.filter((id) => !(id === "amazon_kdp" && selectedProject?.amazonAlreadyPublished)),
    [selected, selectedProject?.amazonAlreadyPublished],
  );
  const visibleJobs = useMemo(() => (data?.jobs ?? []).filter((job) => {
    if (queueView === "all") return true;
    if (job.superseded) return false;
    if (queueView === "approval") return job.status === "awaiting_approval";
    if (queueView === "processing") return ["approved", "running", "blocked", "awaiting_manual_completion", "failed"].includes(job.status);
    return ["completed", "published"].includes(job.status);
  }), [data, queueView]);

  const callAction = async (body: Record<string, unknown>, key: string) => {
    setBusy(key); setError(null); setMessage(null);
    try {
      const response = await fetch("/api/book-growth/distribution", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || `HTTP ${response.status}`);
      setMessage(body.action === "prepare" ? "Distribusjonsplanen er kontrollert og lagt i godkjenningskøen." : body.action === "approve" && result.execution?.succeeded > 0 ? "Godkjent og automatisk publisert i bokbutikken." : `Jobben er nå ${result.status}.`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally { setBusy(null); }
  };

  const prepare = () => void callAction({
    action: "prepare", projectId, channels: effectiveSelected, rightsConfirmed, aiDisclosureReviewed, kdpSelectEnrollment,
  }, "prepare");

  const s = data?.summary;
  return <div style={{ maxWidth: 1500, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
    <h1 style={{ margin: 0, fontSize: 27 }}>Distribution Control Plane</h1>
    <p style={{ color: "#64748b" }}>Klargjør én bokpakke, kontroller rettigheter og kanalregler, godkjenn, og lever via riktig connector eller manuell overlevering.</p>
    {error && <div style={{ padding: 12, background: "#fef2f2", color: "#b91c1c", borderRadius: 8, marginBottom: 12 }}>⛔ {error}</div>}
    {message && <div style={{ padding: 12, background: "#ecfdf5", color: "#047857", borderRadius: 8, marginBottom: 12 }}>✓ {message}</div>}
    {s && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(145px,1fr))", gap: 10 }}>
      <Metric label="Kanaler" value={s.channels}/><Metric label="Tilkoblet" value={s.connected}/><Metric label="Godkjente bøker" value={s.projects}/><Metric label="Til godkjenning" value={s.awaitingApproval}/><Metric label="Behandles" value={s.processing}/><Metric label="Trenger handling" value={s.blocked}/><Metric label="Publisert" value={s.published}/>
    </div>}

    <section style={{ marginTop: 18, border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, background: "white" }}>
      <h2 style={{ marginTop: 0 }}>1. Velg endelig godkjent bok</h2>
      <p style={{ color: "#64748b", fontSize: 13 }}>Bare den eksakte utgaven du har sluttgodkjent i Forfatterstudio vises her. {s?.hiddenDrafts ? `${s.hiddenDrafts} kladder og andre versjoner er skjult.` : ""}</p>
      {(data?.projects ?? []).length === 0 && <div style={{ padding: 12, borderRadius: 9, background: "#fffbeb", color: "#92400e", marginBottom: 12 }}>Ingen bøker er sluttgodkjent ennå. Åpne <a href="/publishing/forfatterstudio" style={{ textDecoration: "underline", fontWeight: 800 }}>Forfatterstudio</a>, velg riktig manus og trykk «Godkjenn endelig bok».</div>}
      <label style={{ display: "grid", gap: 6, maxWidth: 520, fontSize: 13, fontWeight: 800 }}>Bokprosjekt
        <select value={projectId} onChange={(event) => setProjectId(event.target.value)} disabled={(data?.projects ?? []).length === 0} style={{ padding: 10, border: "1px solid #cbd5e1", borderRadius: 8 }}>
          {(data?.projects ?? []).map((project) => <option key={project.id} value={project.id}>{project.title} · {project.language} · endelig godkjent</option>)}
        </select>
      </label>
      {selectedProject?.approval?.approvedAt && <div style={{ marginTop: 8, color: "#047857", fontSize: 12, fontWeight: 800 }}>✓ Godkjent av {selectedProject.approval.approvedBy || "Freddy"} · {new Date(selectedProject.approval.approvedAt).toLocaleString("nb-NO")}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 10, marginTop: 14 }}>
        {(data?.channels ?? []).map((channel) => {
          const alreadyPublished = channel.id === "amazon_kdp" && selectedProject?.amazonAlreadyPublished;
          return <label key={channel.id} style={{ border: effectiveSelected.includes(channel.id) ? "2px solid #2563eb" : "1px solid #e2e8f0", borderRadius: 10, padding: 12, cursor: alreadyPublished ? "not-allowed" : "pointer", opacity: alreadyPublished ? 0.65 : 1 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" disabled={alreadyPublished} checked={effectiveSelected.includes(channel.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, channel.id] : current.filter((id) => id !== channel.id))}/><b>{channel.name}</b>{alreadyPublished && <span style={{ marginLeft: "auto", color: "#047857", fontSize: 11, fontWeight: 900 }}>ALLEREDE PUBLISERT</span>}</div>
          <div style={{ marginTop: 5, color: "#64748b", fontSize: 12 }}>{channel.deliveryLabel} · {channel.automatedDelivery && channel.connected ? "maskinell levering aktiv" : channel.automatedDelivery ? "maskinell levering etter tilkobling" : "kontrollert overlevering"} · {channel.connected ? "tilkoblet" : channel.requiresConnection ? "ikke tilkoblet" : "ingen ekstern connector kreves"}</div>
          <div style={{ marginTop: 6, color: "#475569", fontSize: 12 }}>{alreadyPublished ? "Ny innsending er sperret. Denne boken må håndteres som oppdatering eller ny utgave." : channel.notes}</div>
        </label>})}
      </div>
      <div style={{ display: "grid", gap: 9, marginTop: 14, padding: 12, borderRadius: 10, background: "#f8fafc" }}>
        <label><input type="checkbox" checked={rightsConfirmed} onChange={(event) => setRightsConfirmed(event.target.checked)}/> Jeg bekrefter publiseringsrettighetene for de valgte kanalene.</label>
        <label><input type="checkbox" checked={aiDisclosureReviewed} onChange={(event) => setAiDisclosureReviewed(event.target.checked)}/> Jeg har gjennomgått AI-generert innhold og nødvendig kanalopplysning.</label>
        <label>KDP Select-status: <select value={kdpSelectEnrollment} onChange={(event) => setKdpSelectEnrollment(event.target.value)} style={{ marginLeft: 8, padding: 6 }}><option value="unknown">Ukjent</option><option value="not_enrolled">Ikke innmeldt</option><option value="enrolled">Innmeldt / eksklusiv</option></select></label>
      </div>
      <button disabled={!projectId || effectiveSelected.length === 0 || !rightsConfirmed || !aiDisclosureReviewed || busy !== null} onClick={prepare} style={{ marginTop: 14, padding: "10px 14px", border: 0, borderRadius: 8, background: "#0f172a", color: "white", fontWeight: 900 }}>Forhåndskontroller og klargjør</button>
    </section>

    <section style={{ marginTop: 18 }}>
      <h2>2. Godkjenning og levering</h2>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {([['approval','Til godkjenning'],['processing','Under arbeid'],['published','Publisert'],['all','Alle']] as Array<[QueueView,string]>).map(([id,label]) => <button key={id} onClick={() => setQueueView(id)} style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #cbd5e1", background: queueView === id ? "#0f172a" : "white", color: queueView === id ? "white" : "#334155", fontWeight: 800 }}>{label}</button>)}
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {visibleJobs.length === 0 && <div style={{ padding: 16, border: "1px dashed #cbd5e1", borderRadius: 10, color: "#64748b" }}>Ingen elementer i denne visningen.</div>}
        {visibleJobs.map((job) => {
          const channel = job.publication ? channelById.get(job.publication.channel) : null;
          const findings = job.publication?.preflight?.findings ?? [];
          return <article key={job.id} style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 14, background: "white" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}><div><b>{job.project?.title ?? "Bokprosjekt"}</b><div style={{ fontSize: 12, color: "#64748b" }}>{channel?.name ?? job.publication?.channel ?? "—"}</div></div><b style={{ color: job.superseded ? "#64748b" : job.status === "awaiting_approval" ? "#b45309" : ["completed","published"].includes(job.status) ? "#047857" : "#334155" }}>{job.superseded ? "Utdatert – må sluttgodkjennes på nytt" : jobStatusLabels[job.status] || job.status}</b></div>
            <div style={{ marginTop: 7, color: "#64748b", fontSize: 12 }}>Opprettet {new Date(job.created_at).toLocaleString("nb-NO")}{job.approved_at ? ` · godkjent ${new Date(job.approved_at).toLocaleString("nb-NO")}` : " · ikke godkjent"}</div>
            {findings.length > 0 && <ul style={{ margin: "10px 0", paddingLeft: 20, fontSize: 13 }}>{findings.map((item, index) => <li key={`${item.message}-${index}`} style={{ color: item.severity === "blocker" ? "#b91c1c" : "#475569" }}>{item.message}</li>)}</ul>}
            {job.error?.message && <div style={{ marginTop: 8, color: "#b91c1c", fontSize: 12 }}>{job.error.message}{job.run_after ? ` · nytt forsøk ${new Date(job.run_after).toLocaleString("nb-NO")}` : ""}</div>}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              {job.publication?.artifact_manifest?.epub && <a href={job.publication.artifact_manifest.epub} style={{ padding: "7px 9px", border: "1px solid #cbd5e1", borderRadius: 7 }}>Last ned EPUB</a>}
              {job.status === "awaiting_approval" && !job.superseded && <button disabled={busy !== null} onClick={() => void callAction({ action: "approve", jobId: job.id }, job.id)}>Godkjenn</button>}
              {job.status === "approved" && channel && !channel.automatedDelivery && <button disabled={busy !== null} onClick={() => void callAction({ action: "handoff", jobId: job.id }, job.id)}>Lag manuell overlevering</button>}
              {job.status === "awaiting_manual_completion" && <button disabled={busy !== null} onClick={() => void callAction({ action: "complete", jobId: job.id }, job.id)}>Bekreft publisert</button>}
            </div>
          </article>;
        })}
      </div>
    </section>

    <section style={{ marginTop: 18, border: "1px solid #e2e8f0", borderRadius: 12, padding: 14, background: "#f8fafc" }}><b>Kapabilitetsregel</b><div style={{ marginTop: 5, color: "#475569", fontSize: 13 }}>RealtyFlow påstår aldri at en kanal er automatisert før en dokumentert connector er tilkoblet. Amazon KDP klargjøres automatisk, men fullføres i KDP Bookshelf. Apple Transporter og PublishDrive vises som maskinelle spor først når konto og connector er aktiv.</div><div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12 }}>{Object.entries(capabilityLabels).map(([key, label]) => <span key={key}>{key}: <b>{label}</b></span>)}</div></section>
  </div>;
}
