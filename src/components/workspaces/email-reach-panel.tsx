"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Copy, Mail, RefreshCw, Save, Search, Send, Sparkles } from "lucide-react";
import { WorkspaceNewsletterPanel } from "@/components/workspaces/newsletter-panel";

type Target = {
  type: "lead" | "corporate" | "partner";
  id: string;
  label: string;
  email: string;
  subtitle?: string | null;
};
type Draft = {
  id: string;
  targetType: Target["type"];
  targetId: string;
  recipientEmail: string;
  recipientLabel: string;
  subject: string;
  bodyText: string;
  status: "draft" | "sending" | "sent" | "failed";
  messageId?: string | null;
  lastError?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  sentAt?: string | null;
};
export type WorkspaceEmailHandoff = {
  targetType: Target["type"];
  targetId: string;
  subject: string;
  bodyText: string;
  sourceLabel?: string | null;
};

type Data = {
  sender: {
    configured: boolean;
    email?: string | null;
    displayName?: string | null;
    healthStatus?: string | null;
  };
  targets: Target[];
  drafts: Draft[];
};

export function WorkspaceEmailReachPanel({
  brandKey,
  canDraft,
  canSend,
  initialDirectDraft = null,
  onInitialDirectDraftConsumed,
}: {
  brandKey: string;
  canDraft: boolean;
  canSend: boolean;
  initialDirectDraft?: WorkspaceEmailHandoff | null;
  onInitialDirectDraftConsumed?: () => void;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mode, setMode] = useState<"direct" | "reach" | "newsletter">("direct");
  const [search, setSearch] = useState("");
  const [selectedTargetKey, setSelectedTargetKey] = useState("");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");

  const [campaignType, setCampaignType] = useState("info");
  const [topic, setTopic] = useState("");
  const [campaignDraft, setCampaignDraft] = useState<{ subject: string; preheader: string; bodyText: string } | null>(null);
  const [copied, setCopied] = useState<"subject" | "body" | null>(null);

  async function load(query = "") {
    setLoading(true); setError("");
    try {
      const suffix = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
      const response = await fetch(`/api/workspaces/${encodeURIComponent(brandKey)}/email${suffix}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(response.status === 403
        ? "Du har ikke E-post / Reach-tilgang i dette arbeidsområdet."
        : "E-postdata kunne ikke hentes.");
      setData({
        sender: body.sender || { configured: false },
        targets: Array.isArray(body.targets) ? body.targets : [],
        drafts: Array.isArray(body.drafts) ? body.drafts : [],
      });
    } catch (cause) {
      setData(null);
      setError(cause instanceof Error ? cause.message : "E-postdata kunne ikke hentes.");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [brandKey]);

  const selectedTarget = useMemo(() => {
    const [type, id] = selectedTargetKey.split(":");
    return data?.targets.find(target => target.type === type && target.id === id) || null;
  }, [data, selectedTargetKey]);

  useEffect(() => {
    if (!initialDirectDraft || !data) return;
    const target = data.targets.find(item =>
      item.type === initialDirectDraft.targetType && item.id === initialDirectDraft.targetId,
    );

    setMode("direct");
    setDraftId(null);
    setError("");

    if (!target) {
      setSelectedTargetKey("");
      setSubject("");
      setBodyText("");
      setNotice("");
      setError(
        `${initialDirectDraft.sourceLabel || "Selskapet"} har ikke en godkjent e-postmottaker i E-post / Reach ennå. Kjør selskapskanal-research i Corporate først.`,
      );
      onInitialDirectDraftConsumed?.();
      return;
    }

    setSelectedTargetKey(`${target.type}:${target.id}`);
    setSubject(initialDirectDraft.subject);
    setBodyText(initialDirectDraft.bodyText);
    setNotice(`Utkastet for ${target.label} er klargjort. Kontroller teksten før du lagrer eller sender.`);
    onInitialDirectDraftConsumed?.();
  }, [data, initialDirectDraft, onInitialDirectDraftConsumed]);

  function resetDirect() {
    setSelectedTargetKey(""); setDraftId(null); setSubject(""); setBodyText("");
    setNotice(""); setError("");
  }

  function openDraft(draft: Draft) {
    setMode("direct");
    // Sent messages are immutable history. Opening one pre-fills a NEW follow-up
    // rather than allowing the sent record to be rewritten.
    setDraftId(draft.status === "draft" || draft.status === "failed" ? draft.id : null);
    setSelectedTargetKey(`${draft.targetType}:${draft.targetId}`);
    setSubject(draft.subject);
    setBodyText(draft.bodyText);
    setError("");
    setNotice(draft.status === "sent"
      ? "Sendt e-post er åpnet som utgangspunkt for en ny oppfølging."
      : "");
  }

  async function saveDraft() {
    if (!canDraft || !selectedTarget || !subject.trim() || !bodyText.trim() || busy) return null;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(brandKey)}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          draftId,
          targetType: selectedTarget.type,
          targetId: selectedTarget.id,
          subject,
          bodyText,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || "Utkastet kunne ikke lagres.");
      setDraftId(body.draft.id);
      setNotice("Utkastet er lagret. Ingenting er sendt.");
      await load(search);
      return body.draft.id as string;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Utkastet kunne ikke lagres.");
      return null;
    } finally { setBusy(false); }
  }

  async function sendDirect() {
    if (!canSend || busy) return;
    let id = draftId;
    if (!id) id = await saveDraft();
    if (!id) return;
    if (!window.confirm(`Sende e-posten til ${selectedTarget?.label || "valgt mottaker"} fra merkevarens e-postkonto?`)) return;

    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(brandKey)}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", draftId: id }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || "E-posten kunne ikke sendes.");
      setNotice(`E-posten er sendt til ${body.recipientLabel || "mottakeren"}.`);
      await load(search);
      setDraftId(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "E-posten kunne ikke sendes.");
      await load(search);
    } finally { setBusy(false); }
  }

  async function generateCampaignDraft() {
    if (!canDraft || busy) return;
    setBusy(true); setError(""); setNotice(""); setCampaignDraft(null);
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(brandKey)}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "campaign_draft", campaignType, topic }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || "Kampanjeutkastet kunne ikke lages.");
      setCampaignDraft(body.draft);
      setNotice("Reach-utkastet er laget. Ingen mottakere er abonnert og ingen masseutsending er startet.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kampanjeutkastet kunne ikke lages.");
    } finally { setBusy(false); }
  }

  function copy(kind: "subject" | "body") {
    if (!campaignDraft) return;
    void navigator.clipboard.writeText(kind === "subject" ? campaignDraft.subject : campaignDraft.bodyText);
    setCopied(kind);
    setTimeout(() => setCopied(null), 1500);
  }

  if (loading) return <p className="text-sm text-slate-400">Laster E-post / Reach…</p>;
  if (!data) return <p className="text-sm text-amber-300">{error || "E-post / Reach er ikke tilgjengelig."}</p>;

  return <section className="space-y-5">
    {error && <p role="alert" className="rounded-xl border border-amber-800 bg-amber-950/30 p-4 text-sm text-amber-200">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-emerald-800 bg-emerald-950/25 p-4 text-sm text-emerald-200">{notice}</p>}

    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">E-post / Reach</p>
          <h2 className="mt-2 flex items-center gap-2 text-xl font-bold"><Mail size={20}/> Følg opp – uten å miste kontrollen</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Én-til-én går bare til mottakere RealtyFlow har godkjent for denne merkevaren. Reach brukes til kampanjeutkast; abonnenter legges ikke til automatisk.
          </p>
        </div>
        <button type="button" onClick={() => void load(search)}
          className="inline-flex items-center gap-2 text-sm text-cyan-300"><RefreshCw size={15}/> Oppdater</button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => setMode("direct")}
          className={`rounded-lg px-3 py-2 text-sm ${mode === "direct" ? "bg-cyan-600 font-semibold text-white" : "border border-slate-700 text-slate-300"}`}>
          Send oppfølging
        </button>
        <button type="button" onClick={() => setMode("reach")}
          className={`rounded-lg px-3 py-2 text-sm ${mode === "reach" ? "bg-cyan-600 font-semibold text-white" : "border border-slate-700 text-slate-300"}`}>
          Lag Reach-kampanje
        </button>
        <button type="button" onClick={() => setMode("newsletter")}
          className={`rounded-lg px-3 py-2 text-sm ${mode === "newsletter" ? "bg-cyan-600 font-semibold text-white" : "border border-slate-700 text-slate-300"}`}>
          Nyhetsbrev
        </button>
      </div>

      <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-400">
        <strong className="text-slate-200">Avsender:</strong>{" "}
        {data.sender.configured
          ? `${data.sender.displayName || brandKey} <${data.sender.email || "brand-konto"}>`
          : "Ingen aktiv e-postkonto er konfigurert for denne merkevaren."}
        {data.sender.healthStatus && <span> · {data.sender.healthStatus}</span>}
      </div>
    </div>

    {mode === "direct" && <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
      <div className="space-y-5">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <h3 className="font-semibold">Velg mottaker</h3>
          <form className="relative mt-3 flex gap-2" onSubmit={event => { event.preventDefault(); void load(search); }}>
            <label className="relative block flex-1">
              <Search size={15} className="absolute left-3 top-3 text-slate-500"/>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Søk navn, bedrift eller e-post"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2.5 pl-9 pr-3 text-sm"/>
            </label>
            <button type="submit" className="rounded-lg border border-slate-700 px-3 text-sm">Søk</button>
          </form>
          <div className="mt-3 max-h-[430px] space-y-2 overflow-y-auto">
            {data.targets.map(target => {
              const key = `${target.type}:${target.id}`;
              return <button type="button" key={key} onClick={() => {
                setSelectedTargetKey(key); setDraftId(null); setSubject(""); setBodyText(""); setNotice(""); setError("");
              }} className={`w-full rounded-xl border p-3 text-left ${selectedTargetKey === key ? "border-cyan-500 bg-cyan-950/25" : "border-slate-800 bg-slate-950/50 hover:border-slate-600"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <strong className="block truncate text-sm">{target.label}</strong>
                    <span className="mt-1 block truncate text-xs text-slate-500">{target.email}</span>
                  </div>
                  <span className="shrink-0 rounded-full border border-slate-700 px-2 py-0.5 text-[10px] uppercase text-cyan-300">
                    {target.type === "lead" ? "Lead" : target.type === "corporate" ? "Corporate" : "Partner"}
                  </span>
                </div>
                {target.subtitle && <span className="mt-2 block text-[11px] text-slate-500">{target.subtitle}</span>}
              </button>;
            })}
            {!data.targets.length && <p className="p-3 text-sm text-slate-500">Ingen godkjente e-postmottakere funnet.</p>}
          </div>
        </div>

        <details className="rounded-2xl border border-slate-800 bg-slate-900/70">
          <summary className="cursor-pointer list-none p-5">
            <strong>Mine e-poster</strong>
            <p className="mt-1 text-xs text-slate-500">Utkast, sendt og eventuelle feil.</p>
          </summary>
          <div className="space-y-2 border-t border-slate-800 p-5">
            {data.drafts.map(draft => <button key={draft.id} type="button" onClick={() => openDraft(draft)}
              className="w-full rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-left hover:border-slate-600">
              <div className="flex justify-between gap-3">
                <strong className="truncate text-sm">{draft.subject}</strong>
                <span className={`shrink-0 text-xs ${draft.status === "sent" ? "text-emerald-400" : draft.status === "failed" ? "text-amber-300" : "text-cyan-300"}`}>
                  {draft.status}
                </span>
              </div>
              <p className="mt-1 truncate text-xs text-slate-500">{draft.recipientLabel} · {draft.recipientEmail}</p>
              {draft.lastError && <p className="mt-1 text-[11px] text-amber-300">{draft.lastError}</p>}
            </button>)}
            {!data.drafts.length && <p className="text-sm text-slate-500">Ingen e-postutkast ennå.</p>}
          </div>
        </details>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <h3 className="text-lg font-semibold">Skriv oppfølging</h3>
        <p className="mt-1 text-xs text-slate-500">
          {selectedTarget ? `Til ${selectedTarget.label} · ${selectedTarget.email}` : "Velg en mottaker til venstre."}
        </p>
        <div className="mt-4 space-y-4">
          <label className="block text-xs text-slate-300">Emne
            <input disabled={!canDraft || !selectedTarget} value={subject} onChange={e => setSubject(e.target.value)} maxLength={180}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm"
              placeholder="Kort, konkret og relevant"/>
          </label>
          <label className="block text-xs text-slate-300">Melding
            <textarea disabled={!canDraft || !selectedTarget} value={bodyText} onChange={e => setBodyText(e.target.value)}
              rows={16} maxLength={15000}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm leading-6"
              placeholder="Skriv hva som er relevant for akkurat denne kunden eller bedriften, og avslutt med ett tydelig neste steg."/>
          </label>
        </div>
        {canDraft && <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={() => void saveDraft()}
            disabled={busy || !selectedTarget || !subject.trim() || !bodyText.trim()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold disabled:opacity-40">
            <Save size={15}/> Lagre utkast
          </button>
          {canSend && <button type="button" onClick={() => void sendDirect()}
            disabled={busy || !selectedTarget || !subject.trim() || !bodyText.trim() || !data.sender.configured}
            className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
            <Send size={15}/> Send e-post
          </button>}
          <button type="button" onClick={resetDirect} className="rounded-lg px-3 py-2 text-sm text-slate-400">Ny</button>
        </div>}
        <p className="mt-4 text-[11px] leading-5 text-slate-500">
          RealtyFlow sjekker mottakeren og avmeldingsstatus på nytt rett før sending. For Zen er gamle CRM-kunder ikke tilgjengelige her.
        </p>
      </div>
    </div>}

    {mode === "newsletter" && <WorkspaceNewsletterPanel brandKey={brandKey} canDraft={canDraft} canSend={canSend} />}

    {mode === "reach" && <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <div>
        <h3 className="flex items-center gap-2 text-lg font-semibold"><Sparkles size={18}/> Lag kampanjeutkast</h3>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          RealtyFlow skriver et brand-tilpasset utkast. Selve mottakerlisten og masseutsendingen håndteres i Reach, slik at abonnement og avmelding forblir kontrollert.
        </p>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-xs text-slate-300">Type
          <select value={campaignType} onChange={e => setCampaignType(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm">
            <option value="info">Verdifull informasjon</option>
            <option value="nyhetsbrev">Nyhetsbrev</option>
            <option value="kampanje">Kampanje</option>
            <option value="prisoppdatering">Pris / boligoppdatering</option>
            {brandKey === "zeneco" && <option value="corporate">Corporate</option>}
          </select>
        </label>
        <label className="text-xs text-slate-300">Tema / brief
          <input value={topic} onChange={e => setTopic(e.target.value)} maxLength={2000}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm"
            placeholder="Hva skal leseren lære eller gjøre?"/>
        </label>
      </div>
      {canDraft && <button type="button" onClick={() => void generateCampaignDraft()} disabled={busy}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
        <Sparkles size={15}/>{busy ? "Lager utkast…" : "Lag kampanjeutkast"}
      </button>}

      {campaignDraft && <div className="mt-5 space-y-4 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-slate-500">Emne</p>
            <strong>{campaignDraft.subject}</strong>
            {campaignDraft.preheader && <p className="mt-1 text-xs text-slate-400">{campaignDraft.preheader}</p>}
          </div>
          <button type="button" onClick={() => copy("subject")} className="inline-flex items-center gap-1 text-xs text-cyan-300">
            {copied === "subject" ? <CheckCircle2 size={14}/> : <Copy size={14}/>} Kopier emne
          </button>
        </div>
        <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-slate-300">{campaignDraft.bodyText}</pre>
        <button type="button" onClick={() => copy("body")} className="inline-flex items-center gap-1 text-xs text-cyan-300">
          {copied === "body" ? <CheckCircle2 size={14}/> : <Copy size={14}/>} Kopier tekst
        </button>
      </div>}
    </div>}
  </section>;
}
