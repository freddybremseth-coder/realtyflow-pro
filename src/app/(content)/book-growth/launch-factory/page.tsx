"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type CampaignItem = {
  offsetDay: number;
  channel: string;
  contentType: string;
  purpose: string;
  headline: string;
  body: string;
  cta: string;
  sourceClaim: string;
};
type Campaign = {
  id: string;
  version: number;
  status: string;
  model: string;
  plan: {
    campaignName: string;
    objective: string;
    audiencePromise: string;
    positioning: string;
    items: CampaignItem[];
  };
};
type Activation = {
  id: string;
  campaign_id: string;
  start_date: string;
  timezone: string;
  status: string;
  activated_at: string;
};
type CalendarItem = {
  id: string;
  source_item_index: number;
  channel: string;
  content_type: string;
  scheduled_for: string;
  timezone: string;
  status: string;
  payload: CampaignItem;
  current_version: number;
  submitted_by?: string | null;
  submitted_at?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  versions: Array<{ id: string; version: number; payload: CampaignItem; created_by: string; change_reason: string; created_at: string }>;
  decisions: Array<{ id: string; item_version: number; decision: string; actor: string; note?: string | null; created_at: string }>;
  handoffs: Array<{ id: string; item_version: number; attempt: number; channel: string; status: "prepared" | "queued" | "withdrawn"; prepared_by: string; prepared_at: string; queued_at?: string | null; note?: string | null; preflights: Array<{ id: string; run_number: number; status: "ready" | "blocked"; checks: Array<{ code: string; passed: boolean }>; blocker_codes: string[]; evaluated_at: string }> }>;
};
type Edition = {
  editionId: string;
  title: string;
  seriesName?: string | null;
  language: string;
  format: string;
  revision?: { revision_number: number } | null;
  campaign?: Campaign | null;
  activation?: Activation | null;
  activationIsCurrent?: boolean;
  calendar: CalendarItem[];
  missing: string[];
  readyForCampaign: boolean;
  nextAction: { code: string; label: string; campaignId?: string };
};
type Data = {
  available: boolean;
  error?: string;
  frequencyPolicy?: Record<string, number>;
  summary?: Record<string, number>;
  editions?: Edition[];
};

const missingLabels: Record<string, string> = {
  canonical_revision: "kanonisk revisjon",
  approved_channel_metadata: "fire godkjente metadata-pakker",
  canonical_epub: "verifisert EPUB",
  canonical_cover: "verifisert cover",
};
const channelLabels: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  email: "E-post",
  website: "Nettside",
};
const itemStatus: Record<string, { label: string; color: string; background: string }> = {
  draft: { label: "Utkast", color: "#92400e", background: "#fffbeb" },
  ready_for_review: { label: "Venter godkjenning", color: "#1d4ed8", background: "#eff6ff" },
  approved: { label: "Godkjent", color: "#166534", background: "#f0fdf4" },
  cancelled: { label: "Avbrutt", color: "#475569", background: "#f1f5f9" },
};
const preflightLabels: Record<string, string> = {
  handoff_not_queued: "Overleveringen er ikke lagt i intern kø",
  approval_or_version_stale: "Godkjenningen eller innholdsversjonen er utdatert",
  channel_connection_missing: "Aktiv kanaltilkobling mangler",
  channel_content_invalid: "Innholdet passer ikke kanalformatet",
  schedule_not_future: "Planlagt tidspunkt er passert eller ugyldig",
  canonical_cover_missing: "Verifisert kanonisk cover mangler",
};

function dateAfterToday() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

function formatScheduled(value: string, timezone: string) {
  return new Intl.DateTimeFormat("nb-NO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}

export default function LaunchFactoryPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");
  const [startDate, setStartDate] = useState(dateAfterToday);
  const [timezone, setTimezone] = useState("Europe/Madrid");
  const [busyItemId, setBusyItemId] = useState("");
  const [editingItemId, setEditingItemId] = useState("");
  const [editPayload, setEditPayload] = useState<CampaignItem | null>(null);
  const [editReason, setEditReason] = useState("");
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const response = await fetch("/api/book-growth/launch-factory", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Kunne ikke laste Launch Factory");
    setData(body);
  }, []);

  useEffect(() => {
    load().catch((reason) => setError(reason instanceof Error ? reason.message : "Kunne ikke laste Launch Factory"));
  }, [load]);

  async function act(edition: Edition, action: "generate" | "decide" | "activate", decision?: "approved" | "rejected") {
    setBusyId(edition.editionId);
    setError("");
    setNotice("");
    try {
      const payload = action === "generate"
        ? { action, editionId: edition.editionId }
        : action === "decide"
          ? { action, campaignId: edition.nextAction.campaignId, decision }
          : { action, campaignId: edition.nextAction.campaignId, startDate, timezone };
      const response = await fetch("/api/book-growth/launch-factory", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Handlingen mislyktes");
      setNotice(
        action === "generate"
          ? "OpenAI har laget ett 30-dagers kampanjeforslag. Ingenting er planlagt eller publisert."
          : action === "activate"
            ? `${body.result?.draft_count ?? "Alle"} kalenderutkast er opprettet. Ingenting er publisert eksternt.`
            : decision === "approved"
              ? "Hele kampanjen er godkjent. Den er fortsatt ikke aktivert eller publisert."
              : "Kampanjeforslaget er avvist.",
      );
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Handlingen mislyktes");
    } finally {
      setBusyId("");
    }
  }

  async function itemAction(item: CalendarItem, action: "edit_item" | "decide_item", decision?: "submitted" | "approved" | "returned") {
    setBusyItemId(item.id);
    setError("");
    setNotice("");
    try {
      const payload = action === "edit_item"
        ? { action, itemId: item.id, payload: editPayload, reason: editReason }
        : { action, itemId: item.id, decision, note: decisionNotes[item.id] || undefined };
      const response = await fetch("/api/book-growth/launch-factory", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Handlingen mislyktes");
      setNotice(action === "edit_item"
        ? "Ny versjon er lagret som internt utkast. Ingenting er publisert."
        : decision === "submitted"
          ? "Innholdet er sendt til intern vurdering."
          : decision === "approved"
            ? "Innholdet er godkjent internt, men ikke publisert eller sendt til noen kanal."
            : "Innholdet er returnert til redigering.");
      setEditingItemId("");
      setEditPayload(null);
      setEditReason("");
      setDecisionNotes((current) => ({ ...current, [item.id]: "" }));
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Handlingen mislyktes");
    } finally {
      setBusyItemId("");
    }
  }

  async function handoffAction(item: CalendarItem, action: "prepare_handoff" | "decide_handoff", handoffId?: string, decision?: "queue" | "withdraw") {
    setBusyItemId(item.id);
    setError("");
    setNotice("");
    try {
      const payload = action === "prepare_handoff"
        ? { action, itemId: item.id }
        : { action, handoffId, decision, note: decisionNotes[item.id] || undefined };
      const response = await fetch("/api/book-growth/launch-factory", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Overleveringen mislyktes");
      setNotice(action === "prepare_handoff"
        ? "Et låst kanalutkast er klargjort internt. Ingenting er sendt eller publisert."
        : decision === "queue"
          ? "Kanalutkastet ligger i intern kø. Ingen ekstern kanal er kontaktet."
          : "Kanaloverleveringen er trukket tilbake. Innholdet kan redigeres igjen.");
      setDecisionNotes((current) => ({ ...current, [item.id]: "" }));
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Overleveringen mislyktes");
    } finally {
      setBusyItemId("");
    }
  }

  async function runPreflight(item: CalendarItem, handoffId: string) {
    setBusyItemId(item.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/book-growth/launch-factory", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "run_preflight", handoffId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Preflight mislyktes");
      setNotice(body.result?.status === "ready"
        ? "Preflight er klar. Dette er fortsatt bare en intern kontroll – ingenting er publisert."
        : `Preflight fant ${body.result?.blocker_codes?.length ?? "flere"} blokkeringer. Se sjekklisten på innholdskortet.`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Preflight mislyktes");
    } finally {
      setBusyItemId("");
    }
  }

  function beginEdit(item: CalendarItem) {
    setEditingItemId(item.id);
    setEditPayload({ ...item.payload });
    setEditReason("");
  }

  if (!data && !error) {
    return <main style={{ maxWidth: 1400, margin: "0 auto", padding: 24 }}><p role="status">Laster Launch Factory…</p></main>;
  }

  const editions = data?.editions ?? [];
  const summary = data?.summary ?? {};
  return (
    <main style={{ maxWidth: 1400, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <header>
        <p style={{ margin: 0, color: "#7c3aed", fontWeight: 900 }}>BOOK OS · FASE 4.4</p>
        <h1 style={{ margin: "6px 0" }}>Launch Factory</h1>
        <p style={{ maxWidth: 900, marginTop: 0 }}>
          Kjør en tydelig kanal-preflight på innhold i intern kø. Systemet kontrollerer tilkobling, format, godkjenning, tidspunkt og ressurser – men sender, planlegger eller publiserer fortsatt ingenting.
        </p>
      </header>

      {error ? <p role="alert" style={{ padding: 12, background: "#fee2e2", border: "1px solid #ef4444", borderRadius: 8 }}>{error}</p> : null}
      {notice ? <p role="status" style={{ padding: 12, background: "#ecfdf5", border: "1px solid #22c55e", borderRadius: 8 }}>{notice}</p> : null}

      <section aria-label="Launch Factory status" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, margin: "20px 0" }}>
        {[
          ["Utgaver", summary.editions],
          ["Bokpakke klar", summary.packageReady],
          ["Venter godkjenning", summary.awaitingApproval],
          ["Klar til aktivering", summary.approved],
          ["Aktive kalendere", summary.activeCalendars],
          ["Utkast", summary.draftItems],
          ["Til vurdering", summary.reviewItems],
          ["Godkjent innhold", summary.approvedItems],
          ["Klargjort", summary.preparedHandoffs],
          ["Intern kanalkø", summary.queuedHandoffs],
          ["Preflight klar", summary.readyPreflights],
          ["Preflight blokkert", summary.blockedPreflights],
        ].map(([label, value]) => (
          <article key={String(label)} style={{ background: "white", border: "1px solid #aebdce", borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 800 }}>{label}</div>
            <div style={{ fontSize: 28, fontWeight: 900 }}>{value ?? 0}</div>
          </article>
        ))}
      </section>

      <section style={{ background: "white", border: "1px solid #aebdce", borderRadius: 12, padding: 18 }}>
        <h2 style={{ marginTop: 0 }}>Bøker og neste handling</h2>
        {editions.map((edition) => {
          const busy = busyId === edition.editionId;
          const campaign = edition.campaign;
          const active = Boolean(edition.activation);
          return (
            <article key={edition.editionId} style={{ marginTop: 12, padding: 14, border: "1px solid #cbd5e1", borderRadius: 10, background: active ? "#f0fdf4" : "#f8fafc", contentVisibility: "auto", containIntrinsicSize: "520px" }}>
              <div style={{ display: "flex", gap: 16, justifyContent: "space-between", flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 620px" }}>
                  <h3 style={{ margin: 0 }}>{edition.title}</h3>
                  <p style={{ color: "#475569" }}>
                    {edition.seriesName ? `${edition.seriesName} · ` : ""}{edition.language.toUpperCase()} · {edition.format}{edition.revision ? ` · revisjon ${edition.revision.revision_number}` : ""}
                  </p>
                  {edition.missing.length ? <p style={{ color: "#9a3412" }}>Mangler: {edition.missing.map((item) => missingLabels[item] || item).join(", ")}</p> : null}
                  {campaign ? (
                    <div>
                      <p><strong>{campaign.plan.campaignName}</strong> · v{campaign.version} · {campaign.plan.items.length} innslag · OpenAI {campaign.model}</p>
                      <p>{campaign.plan.positioning}</p>
                      {edition.nextAction.code === "review_campaign" ? (
                        <div style={{ maxHeight: 360, overflowY: "auto", display: "grid", gap: 7 }}>
                          {campaign.plan.items.map((item, index) => (
                            <div key={`${item.channel}-${item.offsetDay}-${index}`} style={{ padding: 9, border: "1px solid #ddd6fe", borderRadius: 7, background: "#faf5ff", fontSize: 12 }}>
                              <strong>Dag {item.offsetDay + 1} · {channelLabels[item.channel] || item.channel} · {item.contentType}</strong>
                              <span style={{ display: "block", marginTop: 3 }}>{item.headline}</span>
                              <span style={{ display: "block", color: "#64748b" }}>Kilde: {item.sourceClaim}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {edition.activation ? (
                    <div style={{ marginTop: 14 }}>
                      <p style={{ marginBottom: 8 }}><strong>Intern kalender · {edition.activation.status}</strong> · start {edition.activation.start_date} · {edition.activation.timezone}</p>
                      {!edition.activationIsCurrent ? <p style={{ padding: 9, color: "#9a3412", background: "#fff7ed", borderRadius: 7 }}><strong>Kontroller kalenderen:</strong> Den ble aktivert fra en tidligere revisjon. Den publiserer fortsatt ingenting.</p> : null}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 10 }}>
                        {edition.calendar.map((item) => {
                          const status = itemStatus[item.status] || itemStatus.draft;
                          const editing = editingItemId === item.id && editPayload;
                          const itemBusy = busyItemId === item.id;
                          const note = decisionNotes[item.id] || "";
                          const handoff = item.handoffs?.find((row) => row.item_version === item.current_version && row.status !== "withdrawn");
                          const latestPreflight = handoff?.preflights?.[0];
                          return (
                            <div key={item.id} style={{ padding: 12, border: `1px solid ${status.color}`, borderRadius: 9, background: "white" }}>
                              <strong style={{ display: "block", fontSize: 12 }}>{formatScheduled(item.scheduled_for, item.timezone)} · {channelLabels[item.channel] || item.channel}</strong>
                              <span style={{ display: "inline-block", marginTop: 6, padding: "3px 7px", borderRadius: 999, color: status.color, background: status.background, fontSize: 11, fontWeight: 900 }}>{status.label} · v{item.current_version}</span>
                              {editing ? (
                                <div style={{ display: "grid", gap: 7, marginTop: 10 }}>
                                  <label style={{ fontSize: 11, fontWeight: 800 }}>Overskrift
                                    <input value={editPayload.headline} onChange={(event) => setEditPayload({ ...editPayload, headline: event.target.value })} style={{ width: "100%", boxSizing: "border-box", padding: 7, border: "1px solid #94a3b8", borderRadius: 6 }} />
                                  </label>
                                  <label style={{ fontSize: 11, fontWeight: 800 }}>Tekst
                                    <textarea rows={6} value={editPayload.body} onChange={(event) => setEditPayload({ ...editPayload, body: event.target.value })} style={{ width: "100%", boxSizing: "border-box", padding: 7, border: "1px solid #94a3b8", borderRadius: 6, resize: "vertical" }} />
                                  </label>
                                  <label style={{ fontSize: 11, fontWeight: 800 }}>Formål
                                    <input value={editPayload.purpose} onChange={(event) => setEditPayload({ ...editPayload, purpose: event.target.value })} style={{ width: "100%", boxSizing: "border-box", padding: 7, border: "1px solid #94a3b8", borderRadius: 6 }} />
                                  </label>
                                  <label style={{ fontSize: 11, fontWeight: 800 }}>Kildegrunnlag
                                    <input value={editPayload.sourceClaim} onChange={(event) => setEditPayload({ ...editPayload, sourceClaim: event.target.value })} style={{ width: "100%", boxSizing: "border-box", padding: 7, border: "1px solid #94a3b8", borderRadius: 6 }} />
                                  </label>
                                  <label style={{ fontSize: 11, fontWeight: 800 }}>Hvorfor endres innholdet?
                                    <input value={editReason} onChange={(event) => setEditReason(event.target.value)} placeholder="Påkrevd for historikken" style={{ width: "100%", boxSizing: "border-box", padding: 7, border: "1px solid #94a3b8", borderRadius: 6 }} />
                                  </label>
                                  <div style={{ display: "flex", gap: 6 }}>
                                    <button disabled={itemBusy || !editReason.trim()} onClick={() => itemAction(item, "edit_item")} style={{ flex: 1, padding: 7, border: 0, borderRadius: 6, background: "#7c3aed", color: "white", fontWeight: 800 }}>{itemBusy ? "Lagrer…" : "Lagre ny versjon"}</button>
                                    <button onClick={() => setEditingItemId("")} style={{ padding: 7, border: "1px solid #94a3b8", borderRadius: 6, background: "white" }}>Avbryt</button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <strong style={{ display: "block", marginTop: 8 }}>{item.payload.headline}</strong>
                                  <p style={{ margin: "6px 0", color: "#475569", fontSize: 12 }}>{item.payload.body}</p>
                                  <p style={{ margin: "7px 0", color: "#64748b", fontSize: 11 }}>Kilde: {item.payload.sourceClaim}</p>
                                  <p style={{ margin: "7px 0", color: "#b45309", fontSize: 11, fontWeight: 900 }}>Internt · ikke publisert</p>
                                  {item.status !== "cancelled" && !handoff ? <button disabled={itemBusy} onClick={() => beginEdit(item)} style={{ padding: 7, border: "1px solid #7c3aed", borderRadius: 6, background: "white", color: "#6d28d9", fontWeight: 800 }}>Rediger</button> : null}
                                  {item.status === "draft" ? <button disabled={itemBusy} onClick={() => itemAction(item, "decide_item", "submitted")} style={{ marginLeft: 6, padding: 7, border: 0, borderRadius: 6, background: "#1d4ed8", color: "white", fontWeight: 800 }}>{itemBusy ? "Sender…" : "Send til vurdering"}</button> : null}
                                  {item.status === "ready_for_review" ? (
                                    <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                                      <button disabled={itemBusy} onClick={() => itemAction(item, "decide_item", "approved")} style={{ padding: 7, border: 0, borderRadius: 6, background: "#166534", color: "white", fontWeight: 800 }}>{itemBusy ? "Godkjenner…" : "Godkjenn innhold"}</button>
                                      <input value={note} onChange={(event) => setDecisionNotes((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Begrunnelse for retur" style={{ padding: 7, border: "1px solid #94a3b8", borderRadius: 6 }} />
                                      <button disabled={itemBusy || !note.trim()} onClick={() => itemAction(item, "decide_item", "returned")} style={{ padding: 7, border: "1px solid #b45309", borderRadius: 6, background: "white", color: "#92400e", fontWeight: 800 }}>Returner til redigering</button>
                                    </div>
                                  ) : null}
                                  {item.status === "approved" ? (
                                    <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                                      {!handoff ? (
                                        <>
                                          <button disabled={itemBusy} onClick={() => handoffAction(item, "prepare_handoff")} style={{ padding: 8, border: 0, borderRadius: 6, background: "#0f766e", color: "white", fontWeight: 900 }}>{itemBusy ? "Klargjør…" : `Klargjør for ${channelLabels[item.channel] || item.channel}`}</button>
                                          <input value={note} onChange={(event) => setDecisionNotes((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Begrunnelse for ny redigering" style={{ padding: 7, border: "1px solid #94a3b8", borderRadius: 6 }} />
                                          <button disabled={itemBusy || !note.trim()} onClick={() => itemAction(item, "decide_item", "returned")} style={{ padding: 7, border: "1px solid #b45309", borderRadius: 6, background: "white", color: "#92400e", fontWeight: 800 }}>Åpne for ny redigering</button>
                                        </>
                                      ) : (
                                        <div style={{ display: "grid", gap: 6, padding: 9, border: "1px solid #0f766e", borderRadius: 7, background: "#f0fdfa" }}>
                                          <strong style={{ color: "#115e59", fontSize: 12 }}>{handoff.status === "queued" ? "I intern kanalkø" : "Kanalutkast klargjort"} · v{handoff.item_version} · forsøk {handoff.attempt}</strong>
                                          <span style={{ color: "#475569", fontSize: 11 }}>Låst øyeblikksbilde · ikke sendt · ikke publisert</span>
                                          {handoff.status === "prepared" ? <button disabled={itemBusy} onClick={() => handoffAction(item, "decide_handoff", handoff.id, "queue")} style={{ padding: 8, border: 0, borderRadius: 6, background: "#1d4ed8", color: "white", fontWeight: 900 }}>{itemBusy ? "Legger i kø…" : "Legg i intern kanalkø"}</button> : null}
                                          {handoff.status === "queued" ? (
                                            <>
                                              <button disabled={itemBusy} onClick={() => runPreflight(item, handoff.id)} style={{ padding: 8, border: 0, borderRadius: 6, background: "#7c3aed", color: "white", fontWeight: 900 }}>{itemBusy ? "Kontrollerer…" : latestPreflight ? "Kjør preflight på nytt" : "Kjør kanal-preflight"}</button>
                                              {latestPreflight ? (
                                                <div style={{ padding: 8, borderRadius: 6, background: latestPreflight.status === "ready" ? "#dcfce7" : "#fef2f2", color: latestPreflight.status === "ready" ? "#166534" : "#991b1b", fontSize: 11 }}>
                                                  <strong>{latestPreflight.status === "ready" ? "✓ Klar preflight" : `Blokkert · ${latestPreflight.blocker_codes.length} punkter`} · kontroll {latestPreflight.run_number}</strong>
                                                  {latestPreflight.blocker_codes.map((code) => <span key={code} style={{ display: "block", marginTop: 3 }}>• {preflightLabels[code] || code}</span>)}
                                                  <span style={{ display: "block", marginTop: 5, fontWeight: 800 }}>Intern kontroll · ikke publisert</span>
                                                </div>
                                              ) : null}
                                            </>
                                          ) : null}
                                          <input value={note} onChange={(event) => setDecisionNotes((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Begrunnelse for tilbaketrekking" style={{ padding: 7, border: "1px solid #94a3b8", borderRadius: 6 }} />
                                          <button disabled={itemBusy || !note.trim()} onClick={() => handoffAction(item, "decide_handoff", handoff.id, "withdraw")} style={{ padding: 7, border: "1px solid #b45309", borderRadius: 6, background: "white", color: "#92400e", fontWeight: 800 }}>Trekk tilbake overlevering</button>
                                        </div>
                                      )}
                                    </div>
                                  ) : null}
                                </>
                              )}
                              {item.versions?.length ? (
                                <details style={{ marginTop: 9, fontSize: 11 }}>
                                  <summary style={{ cursor: "pointer", fontWeight: 800 }}>Versjonshistorikk ({item.versions.length})</summary>
                                  {item.versions.map((version) => <p key={version.id} style={{ margin: "5px 0", color: "#475569" }}>v{version.version} · {version.change_reason} · {new Date(version.created_at).toLocaleString("nb-NO")}</p>)}
                                </details>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div style={{ width: 330, maxWidth: "100%", background: "white", border: "1px solid #94a3b8", borderRadius: 9, padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 900, color: "#475569" }}>ANBEFALT NESTE HANDLING</div>
                  <strong style={{ display: "block", margin: "5px 0 10px" }}>{edition.nextAction.label}</strong>
                  {edition.nextAction.code === "complete_package" ? (
                    <Link href="/book-growth/quality-center" style={{ display: "block", textAlign: "center", padding: 9, background: "#0f172a", color: "white", borderRadius: 8, textDecoration: "none", fontWeight: 900 }}>Åpne Quality Center</Link>
                  ) : null}
                  {edition.nextAction.code === "generate_campaign" ? (
                    <button disabled={busy} onClick={() => act(edition, "generate")} style={{ width: "100%", padding: 9, border: 0, borderRadius: 8, background: "#7c3aed", color: "white", fontWeight: 900 }}>
                      {busy ? "OpenAI lager kampanjen…" : "Lag lanseringskampanje"}
                    </button>
                  ) : null}
                  {edition.nextAction.code === "review_campaign" ? (
                    <div style={{ display: "grid", gap: 7 }}>
                      <p style={{ margin: 0, padding: 8, background: "#fff7ed", borderRadius: 7, fontSize: 12 }}><strong>Ikke aktivert:</strong> Godkjenningen publiserer ingenting.</p>
                      <button disabled={busy} onClick={() => act(edition, "decide", "approved")} style={{ padding: 9, border: 0, borderRadius: 8, background: "#166534", color: "white", fontWeight: 900 }}>{busy ? "Godkjenner…" : "Godkjenn hele kampanjen"}</button>
                      <button disabled={busy} onClick={() => act(edition, "decide", "rejected")} style={{ padding: 9, border: "1px solid #b91c1c", borderRadius: 8, background: "white", color: "#b91c1c", fontWeight: 900 }}>Avvis kampanjen</button>
                    </div>
                  ) : null}
                  {edition.nextAction.code === "activate_campaign" ? (
                    <div style={{ display: "grid", gap: 8 }}>
                      <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 800 }}>Startdato
                        <input type="date" min={new Date().toISOString().slice(0, 10)} value={startDate} onChange={(event) => setStartDate(event.target.value)} style={{ padding: 8, border: "1px solid #94a3b8", borderRadius: 7 }} />
                      </label>
                      <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 800 }}>Tidssone
                        <select value={timezone} onChange={(event) => setTimezone(event.target.value)} style={{ padding: 8, border: "1px solid #94a3b8", borderRadius: 7 }}>
                          <option value="Europe/Madrid">Spania · Europe/Madrid</option>
                          <option value="Europe/Oslo">Norge · Europe/Oslo</option>
                          <option value="UTC">UTC</option>
                        </select>
                      </label>
                      <p style={{ margin: 0, padding: 8, background: "#eff6ff", borderRadius: 7, fontSize: 12 }}>Dette oppretter bare synlige kalenderutkast. Ingen kanaler kontaktes.</p>
                      <button disabled={busy || !startDate} onClick={() => act(edition, "activate")} style={{ padding: 9, border: 0, borderRadius: 8, background: "#1d4ed8", color: "white", fontWeight: 900 }}>{busy ? "Oppretter kalenderutkast…" : "Aktiver kalenderutkast"}</button>
                    </div>
                  ) : null}
                  {active ? <p style={{ margin: 0, color: "#166534", fontWeight: 900 }}>✓ Intern kalender aktiv<br/><span style={{ fontSize: 12, fontWeight: 600 }}>Vurder innholdet kort for kort. Godkjent betyr fortsatt ikke publisert.</span></p> : null}
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
