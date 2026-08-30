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

  if (!data && !error) {
    return <main style={{ maxWidth: 1400, margin: "0 auto", padding: 24 }}><p role="status">Laster Launch Factory…</p></main>;
  }

  const editions = data?.editions ?? [];
  const summary = data?.summary ?? {};
  return (
    <main style={{ maxWidth: 1400, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <header>
        <p style={{ margin: 0, color: "#7c3aed", fontWeight: 900 }}>BOOK OS · FASE 4.1</p>
        <h1 style={{ margin: "6px 0" }}>Launch Factory</h1>
        <p style={{ maxWidth: 900, marginTop: 0 }}>
          OpenAI lager én sporbar 30-dagers kampanje. Etter godkjenning velger du startdato og aktiverer interne kalenderutkast. Aktivering publiserer ingenting til Facebook, Instagram, e-post eller nettsiden.
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
          ["Kalenderutkast", summary.draftItems],
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
          const active = edition.nextAction.code === "calendar_active";
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
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 8 }}>
                        {edition.calendar.map((item) => (
                          <div key={item.id} style={{ padding: 10, border: "1px solid #86efac", borderRadius: 8, background: "white" }}>
                            <strong style={{ display: "block", fontSize: 12 }}>{formatScheduled(item.scheduled_for, item.timezone)} · {channelLabels[item.channel] || item.channel}</strong>
                            <span style={{ display: "block", marginTop: 4 }}>{item.payload.headline}</span>
                            <span style={{ display: "block", marginTop: 4, color: "#166534", fontSize: 12 }}>Utkast · ikke publisert</span>
                          </div>
                        ))}
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
                  {active ? <p style={{ margin: 0, color: "#166534", fontWeight: 900 }}>✓ Kalender aktiv<br/><span style={{ fontSize: 12, fontWeight: 600 }}>Alle elementer er interne utkast.</span></p> : null}
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
