"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Eye, MailPlus, MousePointerClick, RefreshCw, Send, ShieldCheck, Users } from "lucide-react";

type Subscriber = {
  id: string; email: string; name: string | null; status: string;
  consent_source: string; consent_note?: string | null; consent_at: string; created_at: string; segments: string[];
};
type Campaign = {
  id: string; title: string; subject: string; preheader: string; body_text: string;
  status: string; scheduled_at?: string | null; sent_at?: string | null; segment_filter: string[];
  recipient_count: number; sent_count: number; failed_count: number; opened_count: number; clicked_count: number; created_at: string;
};
type Snapshot = {
  subscribers: Subscriber[];
  campaigns: Campaign[];
  sender: { configured: boolean; email?: string | null; displayName?: string | null };
};

export function WorkspaceNewsletterPanel({
  brandKey,
  canDraft,
  canSend,
}: {
  brandKey: string;
  canDraft: boolean;
  canSend: boolean;
}) {
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [consentSource, setConsentSource] = useState("webskjema");
  const [consentNote, setConsentNote] = useState("");
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [subscriberSegments, setSubscriberSegments] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [preheader, setPreheader] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [segmentFilter, setSegmentFilter] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(brandKey)}/newsletter`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || "Nyhetsbrevdata kunne ikke hentes.");
      setData({
        subscribers: Array.isArray(body.subscribers) ? body.subscribers : [],
        campaigns: Array.isArray(body.campaigns) ? body.campaigns : [],
        sender: body.sender || { configured: false },
      });
    } catch (cause) {
      setData(null);
      setError(cause instanceof Error ? cause.message : "Nyhetsbrevdata kunne ikke hentes.");
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [brandKey]);

  const activeSubscribers = useMemo(
    () => (data?.subscribers || []).filter(item => item.status === "active"),
    [data],
  );
  const selectedSegments = useMemo(
    () => segmentFilter.split(",").map(value => value.trim().toLowerCase()).filter(Boolean),
    [segmentFilter],
  );
  const selectedSubscribers = useMemo(() => {
    if (!selectedSegments.length) return activeSubscribers;
    return activeSubscribers.filter(subscriber => {
      const tags = new Set((subscriber.segments || []).map(value => value.toLowerCase()));
      return selectedSegments.every(segment => tags.has(segment));
    });
  }, [activeSubscribers, selectedSegments]);

  async function addSubscriber() {
    if (!canDraft || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(brandKey)}/newsletter`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_subscriber", email, name, consentSource, consentNote, consentConfirmed,
          segments: subscriberSegments.split(",").map(value => value.trim()).filter(Boolean),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || "Abonnenten kunne ikke lagres.");
      setNotice("Abonnenten er lagret med dokumentert samtykke.");
      setEmail(""); setName(""); setConsentNote(""); setConsentConfirmed(false); setSubscriberSegments("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Abonnenten kunne ikke lagres.");
    } finally { setBusy(false); }
  }

  function openCampaign(campaign: Campaign) {
    setCampaignId(campaign.id);
    setTitle(campaign.title);
    setSubject(campaign.subject);
    setPreheader(campaign.preheader || "");
    setBodyText(campaign.body_text);
    setSegmentFilter((campaign.segment_filter || []).join(", "));
    setScheduledAt(campaign.scheduled_at ? new Date(campaign.scheduled_at).toISOString().slice(0,16) : "");
    setError(""); setNotice("");
  }

  async function saveCampaign() {
    if (!canDraft || busy || !title.trim() || !subject.trim() || !bodyText.trim()) return null;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(brandKey)}/newsletter`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_campaign", campaignId: campaignId || undefined,
          title, subject, preheader, bodyText,
          segmentFilter: segmentFilter.split(",").map(value => value.trim()).filter(Boolean),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || "Kampanjen kunne ikke lagres.");
      setCampaignId(body.campaign.id);
      setNotice("Nyhetsbrevet er lagret som utkast.");
      await load();
      return body.campaign.id as string;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kampanjen kunne ikke lagres.");
      return null;
    } finally { setBusy(false); }
  }

  async function scheduleCampaign() {
    if (!canSend || busy || !scheduledAt) return;
    let id = campaignId;
    if (!id) id = await saveCampaign() || "";
    if (!id) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(brandKey)}/newsletter`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "schedule_campaign", campaignId: id, scheduledAt: new Date(scheduledAt).toISOString() }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || "Planlegging av nyhetsbrev feilet.");
      setNotice(`Nyhetsbrevet er planlagt til ${new Date(body.campaign.scheduled_at).toLocaleString("nb-NO")}.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Planlegging av nyhetsbrev feilet.");
    } finally { setBusy(false); }
  }

  async function testSend() {
    if (!canSend || busy || !subject.trim() || !bodyText.trim()) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(brandKey)}/newsletter`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test_send", subject, bodyText }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || "Testutsending feilet.");
      setNotice(`Test sendt til ${body.sentTo}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Testutsending feilet.");
    } finally { setBusy(false); }
  }

  async function sendCampaign() {
    if (!canSend || busy || selectedSubscribers.length === 0) return;
    let id = campaignId;
    if (!id) id = await saveCampaign() || "";
    if (!id) return;
    if (!window.confirm(
      `Sende «${subject}» til ${selectedSubscribers.length} abonnenter${selectedSegments.length ? ` i segment ${selectedSegments.join(", ")}` : ""} nå?\n\nRealtyFlow kontrollerer suppression og avmelding før hver utsending.`,
    )) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(brandKey)}/newsletter`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send_campaign", campaignId: id }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || "Nyhetsbrevet kunne ikke sendes.");
      setNotice(`Utsending ferdig: ${body.sent} sendt, ${body.failed} hoppet over/feilet.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Nyhetsbrevet kunne ikke sendes.");
    } finally { setBusy(false); }
  }

  if (loading) return <p className="text-sm text-slate-400">Laster nyhetsbrev…</p>;
  if (!data) return <p className="text-sm text-amber-300">{error || "Nyhetsbrev er ikke tilgjengelig."}</p>;

  return <section className="space-y-5">
    {error && <p role="alert" className="rounded-xl border border-amber-800 bg-amber-950/30 p-4 text-sm text-amber-200">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-emerald-800 bg-emerald-950/25 p-4 text-sm text-emerald-200">{notice}</p>}

    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4"><span className="text-xs text-slate-500">Aktive abonnenter</span><strong className="mt-1 block text-2xl">{activeSubscribers.length}</strong></div>
      <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4"><span className="text-xs text-slate-500">Kampanjer</span><strong className="mt-1 block text-2xl">{data.campaigns.length}</strong></div>
      <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4"><span className="text-xs text-slate-500">Avsender</span><strong className="mt-1 block text-sm">{data.sender.configured ? data.sender.email || "Konfigurert" : "Ikke klar"}</strong></div>
    </div>

    {data.campaigns.some(item => item.sent_count > 0) && <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
        <span className="inline-flex items-center gap-2 text-xs text-slate-500"><Eye size={14}/> Åpningsrate siste kampanjer</span>
        <strong className="mt-1 block text-xl">{(() => { const sent=data.campaigns.reduce((sum,item)=>sum+item.sent_count,0); const opened=data.campaigns.reduce((sum,item)=>sum+item.opened_count,0); return sent ? ((opened/sent)*100).toLocaleString("nb-NO",{maximumFractionDigits:1})+"%" : "–"; })()}</strong>
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
        <span className="inline-flex items-center gap-2 text-xs text-slate-500"><MousePointerClick size={14}/> Klikkrate siste kampanjer</span>
        <strong className="mt-1 block text-xl">{(() => { const sent=data.campaigns.reduce((sum,item)=>sum+item.sent_count,0); const clicked=data.campaigns.reduce((sum,item)=>sum+item.clicked_count,0); return sent ? ((clicked/sent)*100).toLocaleString("nb-NO",{maximumFractionDigits:1})+"%" : "–"; })()}</strong>
      </div>
    </div>}

    {canDraft && <details className="rounded-2xl border border-slate-800 bg-slate-900/70">
      <summary className="cursor-pointer list-none p-5"><strong className="inline-flex items-center gap-2"><Users size={18}/> Abonnenter & samtykke</strong>
        <p className="mt-1 text-xs text-slate-500">CRM-kunder blir aldri lagt til automatisk. Legg bare inn mottakere som faktisk har samtykket.</p></summary>
      <div className="grid gap-3 border-t border-slate-800 p-5 md:grid-cols-2">
        <label className="text-xs text-slate-300">E-post<input type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"/></label>
        <label className="text-xs text-slate-300">Navn<input value={name} onChange={e => setName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"/></label>
        <label className="text-xs text-slate-300">Samtykkekilde
          <select value={consentSource} onChange={e => setConsentSource(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2">
            <option value="webskjema">Webskjema</option><option value="kundeportal">Min Side</option><option value="event">Arrangement</option><option value="manuelt_dokumentert">Manuelt dokumentert</option>
          </select>
        </label>
        <label className="text-xs text-slate-300">Segmenter<input value={subscriberSegments} onChange={e => setSubscriberSegments(e.target.value)} placeholder="f.eks. albir, investor, nybygg" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"/></label>
        <label className="text-xs text-slate-300">Dokumentasjon/notat<input value={consentNote} onChange={e => setConsentNote(e.target.value)} placeholder="Hvor/når samtykket ble gitt" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"/></label>
        <label className="md:col-span-2 flex items-start gap-2 text-xs text-slate-300"><input type="checkbox" checked={consentConfirmed} onChange={e => setConsentConfirmed(e.target.checked)} className="mt-0.5"/> Jeg bekrefter at mottakeren har samtykket til markedsførings-e-post for denne merkevaren.</label>
        <button type="button" disabled={busy || !email || !consentConfirmed} onClick={() => void addSubscriber()} className="inline-flex w-fit items-center gap-2 rounded-lg border border-cyan-700 px-3 py-2 text-sm text-cyan-200 disabled:opacity-40"><MailPlus size={15}/> Legg til abonnent</button>
      </div>
    </details>}

    <div className="grid gap-5 lg:grid-cols-[0.75fr_1.25fr]">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <div className="flex justify-between gap-3"><h3 className="font-semibold">Tidligere kampanjer</h3><button onClick={() => void load()} className="text-cyan-300"><RefreshCw size={15}/></button></div>
        <div className="mt-3 space-y-2">
          {data.campaigns.map(campaign => <button key={campaign.id} onClick={() => openCampaign(campaign)} className="w-full rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-left">
            <div className="flex justify-between gap-2"><strong className="text-sm">{campaign.title}</strong><span className="text-[10px] uppercase text-slate-500">{campaign.status}</span></div>
            <p className="mt-1 text-xs text-slate-400">{campaign.subject}</p>
            {campaign.sent_at && <p className="mt-2 text-[11px] text-slate-500">{campaign.sent_count} sendt · {campaign.opened_count} åpnet · {campaign.clicked_count} klikket · {campaign.failed_count} feilet/hoppet over</p>}
            {campaign.status === "scheduled" && campaign.scheduled_at && <p className="mt-2 text-[11px] text-cyan-300">Planlagt {new Date(campaign.scheduled_at).toLocaleString("nb-NO")}</p>}
          </button>)}
          {!data.campaigns.length && <p className="text-sm text-slate-500">Ingen nyhetsbrev ennå.</p>}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <h3 className="font-semibold">Skriv nyhetsbrev</h3>
        <div className="mt-4 grid gap-3">
          <label className="text-xs text-slate-300">Arbeidstittel<input disabled={!canDraft} value={title} onChange={e => setTitle(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"/></label>
          <label className="text-xs text-slate-300">Emne<input disabled={!canDraft} value={subject} onChange={e => setSubject(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"/></label>
          <label className="text-xs text-slate-300">Preheader<input disabled={!canDraft} value={preheader} onChange={e => setPreheader(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"/></label>
          <label className="text-xs text-slate-300">Segmentfilter<input disabled={!canDraft} value={segmentFilter} onChange={e => setSegmentFilter(e.target.value)} placeholder="tomt = alle; ellers f.eks. investor, albir" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"/><span className="mt-1 block text-[11px] text-slate-500">{selectedSubscribers.length} mottakere matcher nå.</span></label>
          <label className="text-xs text-slate-300">Planlagt tidspunkt<input disabled={!canSend} type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"/></label>
          <label className="text-xs text-slate-300">Innhold<textarea disabled={!canDraft} rows={14} value={bodyText} onChange={e => setBodyText(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 leading-6"/></label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {canDraft && <button onClick={() => void saveCampaign()} disabled={busy || !title.trim() || !subject.trim() || !bodyText.trim()} className="rounded-lg border border-slate-700 px-4 py-2 text-sm disabled:opacity-40">Lagre utkast</button>}
          {canSend && <button onClick={() => void testSend()} disabled={busy || !subject.trim() || !bodyText.trim() || !data.sender.configured} className="rounded-lg border border-cyan-800 px-4 py-2 text-sm text-cyan-200 disabled:opacity-40">Send test til meg</button>}
          {canSend && <button onClick={() => void scheduleCampaign()} disabled={busy || !scheduledAt || !subject.trim() || !bodyText.trim() || !data.sender.configured} className="inline-flex items-center gap-2 rounded-lg border border-violet-800 px-4 py-2 text-sm text-violet-200 disabled:opacity-40"><CalendarClock size={15}/> Planlegg</button>}
          {canSend && <button onClick={() => void sendCampaign()} disabled={busy || selectedSubscribers.length === 0 || !subject.trim() || !bodyText.trim() || !data.sender.configured}
            className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"><ShieldCheck size={15}/><Send size={14}/> Send til aktive abonnenter</button>}
        </div>
        <p className="mt-3 text-[11px] leading-5 text-slate-500">Før sending kontrolleres suppression og avmelding på nytt. Hver mottaker får egen avmeldingslenke. CRM-kunder uten dokumentert samtykke er ikke med.</p>
      </div>
    </div>
  </section>;
}
