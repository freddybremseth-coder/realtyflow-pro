"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ExternalLink, ImageIcon, RefreshCw, Send, ShieldCheck } from "lucide-react";

type Channel = {
  platform: "facebook" | "instagram";
  displayName: string;
};
type Publishable = {
  id: string;
  hasImage: boolean;
  plannedPlatforms: string[];
};
type MarketingPublication = {
  id: string;
  title: string | null;
  description: string | null;
  status: string;
  scheduledPlatforms: string[];
  updatedAt: string | null;
};
type Result = {
  platform: string;
  success: boolean;
  postUrl?: string;
  error?: string;
  channelName?: string;
};

const label: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
};

export function WorkspaceSocialPublishPanel({ brandKey }: { brandKey: string }) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [publishable, setPublishable] = useState<Publishable[]>([]);
  const [marketing, setMarketing] = useState<MarketingPublication[]>([]);
  const [selectedPublicationId, setSelectedPublicationId] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const [publishResponse, marketingResponse] = await Promise.all([
        fetch(`/api/workspaces/${encodeURIComponent(brandKey)}/social-publish`, { cache: "no-store" }),
        fetch(`/api/workspaces/${encodeURIComponent(brandKey)}/marketing`, { cache: "no-store" }),
      ]);
      const [publishBody, marketingBody] = await Promise.all([
        publishResponse.json(),
        marketingResponse.json(),
      ]);
      if (!publishResponse.ok) throw new Error(
        publishResponse.status === 403
          ? "Du har ikke rettighet til å publisere sosiale medier for denne merkevaren."
          : "Publiseringsstatus kunne ikke hentes.",
      );
      if (!marketingResponse.ok) throw new Error("Innholdsoversikten kunne ikke hentes.");

      const nextPublishable = Array.isArray(publishBody.publications) ? publishBody.publications : [];
      setChannels(Array.isArray(publishBody.channels) ? publishBody.channels : []);
      setPublishable(nextPublishable);
      setMarketing(Array.isArray(marketingBody.publications) ? marketingBody.publications : []);
      setSelectedPublicationId(current =>
        current && nextPublishable.some((item: Publishable) => item.id === current) ? current : "");
      setSelectedPlatforms([]);
    } catch (cause) {
      setChannels([]); setPublishable([]); setMarketing([]);
      setError(cause instanceof Error ? cause.message : "Publisering er ikke tilgjengelig.");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [brandKey]);

  const rows = useMemo(() => {
    const byId = new Map(marketing.map(item => [item.id, item]));
    return publishable.flatMap(item => {
      const content = byId.get(item.id);
      return content ? [{ ...item, ...content }] : [];
    });
  }, [publishable, marketing]);

  const selected = rows.find(item => item.id === selectedPublicationId) || null;

  const eligibleChannels = useMemo(() => {
    if (!selected) return [];
    const planned = new Set(selected.plannedPlatforms || []);
    return channels.filter(channel => {
      if (!planned.has(channel.platform)) return false;
      if (channel.platform === "instagram" && !selected.hasImage) return false;
      return true;
    });
  }, [channels, selected]);

  function choosePublication(id: string) {
    setSelectedPublicationId(id);
    setSelectedPlatforms([]);
    setResults([]);
    setError("");
    setNotice("");
  }

  function togglePlatform(platform: string, checked: boolean) {
    setSelectedPlatforms(current => checked
      ? Array.from(new Set([...current, platform]))
      : current.filter(item => item !== platform));
  }

  async function publish() {
    if (!selected || selectedPlatforms.length === 0 || busy) return;
    const chosen = eligibleChannels.filter(channel => selectedPlatforms.includes(channel.platform));
    if (chosen.length !== selectedPlatforms.length) {
      setError("Kanalvalget er endret. Velg kanalene på nytt.");
      return;
    }
    const destinations = chosen.map(channel => `${label[channel.platform] || channel.platform} · ${channel.displayName}`).join("\n");
    if (!window.confirm(
      `Publisere «${selected.title || "Uten tittel"}» nå?\n\n${destinations}\n\nDette sender innholdet eksternt med en gang.`,
    )) return;

    setBusy(true); setError(""); setNotice(""); setResults([]);
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(brandKey)}/social-publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicationId: selected.id,
          platforms: selectedPlatforms,
        }),
      });
      const body = await response.json();
      const safeResults = Array.isArray(body.results) ? body.results : [];
      setResults(safeResults);
      if (!response.ok) {
        throw new Error(body?.error?.message || safeResults.map((item: Result) => item.error).filter(Boolean).join("; ") || "Publiseringen feilet.");
      }
      setNotice(body.partial
        ? "Minst én kanal publiserte innlegget, men én eller flere kanaler feilet. Se resultatene under før du gjør noe mer."
        : "Innlegget er publisert til valgte kanaler.");
      if (body.warning) setError(body.warning);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Publiseringen feilet.");
    } finally { setBusy(false); }
  }

  if (loading) return <p className="text-sm text-slate-400">Kontrollerer publiseringskanaler…</p>;

  return <section className="space-y-5">
    {error && <p role="alert" className="rounded-xl border border-amber-800 bg-amber-950/30 p-4 text-sm text-amber-200">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-emerald-800 bg-emerald-950/25 p-4 text-sm text-emerald-200">{notice}</p>}

    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">Sosiale medier · live</p>
          <h2 className="mt-2 flex items-center gap-2 text-xl font-bold"><Send size={19}/> Publiser godkjent utkast</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            RealtyFlow viser bare SoMe-utkast som tilhører denne merkevaren og bare aktive Facebook- og Instagram-kanaler som er koblet til samme brand.
          </p>
        </div>
        <button type="button" onClick={() => void load()} disabled={busy}
          className="inline-flex items-center gap-2 text-sm text-cyan-300 disabled:opacity-40">
          <RefreshCw size={15}/> Oppdater
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {channels.map(channel => <span key={channel.platform}
          className="rounded-full border border-emerald-800 bg-emerald-950/25 px-3 py-1.5 text-xs text-emerald-200">
          {label[channel.platform]} · {channel.displayName}
        </span>)}
        {!channels.length && <span className="text-sm text-slate-500">Ingen støttede, aktive publiseringskanaler er koblet til denne merkevaren.</span>}
      </div>
    </div>

    <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <h3 className="font-semibold">Velg utkast</h3>
        <p className="mt-1 text-xs text-slate-500">Bare dine egne workspace-utkast vises. Nettsideartikler, Reels, eier-/autopilotinnhold og allerede publiserte innlegg er filtrert bort av serveren.</p>
        <div className="mt-4 max-h-[520px] space-y-2 overflow-y-auto">
          {rows.map(item => <button key={item.id} type="button" onClick={() => choosePublication(item.id)}
            className={`w-full rounded-xl border p-3 text-left ${selectedPublicationId === item.id
              ? "border-cyan-500 bg-cyan-950/25"
              : "border-slate-800 bg-slate-950/50 hover:border-slate-600"}`}>
            <div className="flex items-start justify-between gap-3">
              <strong className="text-sm">{item.title || "Uten tittel"}</strong>
              <span className="shrink-0 rounded-full border border-slate-700 px-2 py-0.5 text-[10px] uppercase text-slate-400">{item.status}</span>
            </div>
            <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-400">{item.description || "Ingen tekst"}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
              {item.hasImage && <span className="inline-flex items-center gap-1"><ImageIcon size={12}/> bilde</span>}
              {(item.plannedPlatforms || []).map(platform => <span key={platform}>{label[platform] || platform}</span>)}
            </div>
          </button>)}
          {!rows.length && <p className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 text-sm text-slate-500">
            Ingen SoMe-utkast er klare for manuell publisering akkurat nå.
          </p>}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <h3 className="font-semibold">Velg kanal og publiser</h3>
        {!selected && <p className="mt-3 text-sm text-slate-500">Velg et utkast til venstre.</p>}
        {selected && <>
          <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
            <strong>{selected.title || "Uten tittel"}</strong>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">{selected.description}</p>
            {!selected.hasImage && <p className="mt-3 text-xs text-amber-300">Dette utkastet har ikke bilde. Instagram blir derfor ikke tilgjengelig.</p>}
          </div>

          <div className="mt-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Publiser til</div>
            <div className="mt-2 space-y-2">
              {eligibleChannels.map(channel => <label key={channel.platform}
                className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-sm">
                <input type="checkbox" checked={selectedPlatforms.includes(channel.platform)}
                  onChange={event => togglePlatform(channel.platform, event.target.checked)}/>
                <span><strong>{label[channel.platform]}</strong> · {channel.displayName}</span>
              </label>)}
              {!eligibleChannels.length && <p className="text-sm text-slate-500">
                Ingen aktive kanaler samsvarer med dette utkastets målkanaler og mediekrav.
              </p>}
            </div>
          </div>

          <button type="button" onClick={() => void publish()}
            disabled={busy || selectedPlatforms.length === 0}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
            <ShieldCheck size={16}/>{busy ? "Publiserer…" : "Kontroller og publiser nå"}
          </button>
          <p className="mt-3 text-[11px] leading-5 text-slate-500">
            Før eksternt API-kall kontrollerer RealtyFlow medlemskapet, merkevaren, innholdstypen og hver kanal på nytt. Skjemaet sender bare plattformnavn; konto-ID og token løses server-side.
          </p>
        </>}
      </div>
    </div>

    {results.length > 0 && <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <h3 className="font-semibold">Resultat</h3>
      <div className="mt-3 space-y-2">
        {results.map((result, index) => <div key={`${result.platform}-${index}`}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-sm">
          <span className="flex items-center gap-2">
            {result.success && <CheckCircle2 size={16} className="text-emerald-400"/>}
            <strong>{label[result.platform] || result.platform}</strong>
            {result.channelName ? <span className="text-slate-500">· {result.channelName}</span> : null}
          </span>
          <span>
            {result.success && result.postUrl
              ? <a href={result.postUrl} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 text-cyan-300">Åpne innlegg <ExternalLink size={13}/></a>
              : result.success
                ? <span className="text-emerald-300">Publisert</span>
                : <span className="text-amber-300">{result.error || "Feilet"}</span>}
          </span>
        </div>)}
      </div>
    </div>}
  </section>;
}
