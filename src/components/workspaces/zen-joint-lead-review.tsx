"use client";

import { useEffect, useState } from "react";

type Candidate = {
  id: string;
  name: string;
  email: string | null;
  source: string;
  created_at: string;
  status: "unreviewed" | "pending" | "approved" | "excluded" | "revoked";
};
type ReviewAction = "APPROVE" | "EXCLUDE" | "REVOKE";

export function ZenJointLeadReview() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [firstEnquiry, setFirstEnquiry] = useState("");
  const [source, setSource] = useState("");
  const [evidence, setEvidence] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function reload() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/workspaces/zeneco-joint-review", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok || !Array.isArray(body.contacts))
        throw new Error("Gjennomgang av Zen Eco-kunder er ikke tilgjengelig ennå.");
      setCandidates(body.contacts);
      setHasMore(Boolean(body.hasMore));
    } catch (cause) {
      setCandidates([]);
      setError(cause instanceof Error ? cause.message : "Kunne ikke hente kunder.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void reload(); }, []);

  function select(candidate: Candidate) {
    setSelectedId(candidate.id);
    setFirstEnquiry("");
    setSource("");
    setEvidence("");
    setReason("");
    setNotice("");
    setError("");
  }

  async function submit(action: ReviewAction) {
    if (!selectedId || busy) return;
    const candidate = candidates.find(item => item.id === selectedId);
    if (!candidate) return;
    if (!window.confirm(
      action === "APPROVE"
        ? `Godkjen ${candidate.name} som NY felles Zen Eco-kunde etter å ha kontrollert første henvendelse og eksisterende kundeforhold?`
        : action === "REVOKE"
          ? `Trekke tilbake fellesstatus for ${candidate.name}?`
          : `Utelukk ${candidate.name} fra den nye felles kundegruppen?`
    )) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/workspaces/zeneco-joint-review", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: candidate.id, action,
          reviewReason: reason.trim(),
          ...(action === "APPROVE" ? {
            firstGenuineEnquiryAt: new Date(firstEnquiry).toISOString(),
            receivedSource: source.trim(), evidenceReference: evidence.trim(),
          } : {}),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(response.status === 409
        ? "Kunden ble ikke godkjent. Kontroller merkevare, tidligere kundestatus og datogrense."
        : response.status === 400 ? "Dokumentasjon, dato eller begrunnelse mangler."
        : "Gjennomgangen kunne ikke lagres.");
      setNotice(action === "APPROVE" ? "Kunden er dokumentert og registrert som godkjent for samarbeidet. Dette gir ingen medarbeider tilgang ennå."
        : "Gjennomgangen er registrert. Ingen kundetilgang ble endret.");
      setSelectedId(null);
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke lagre gjennomgangen.");
    } finally { setBusy(false); }
  }

  const selected = candidates.find(item => item.id === selectedId);
  const input = "mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm";
  const canApprove = Boolean(selected && firstEnquiry &&
    Number.isFinite(Date.parse(firstEnquiry)) &&
    Date.parse(firstEnquiry) >= Date.parse("2026-09-23T22:00:00.000Z") &&
    Date.parse(firstEnquiry) <= Date.now() &&
    source.trim().length >= 3 && evidence.trim().length >= 8 && reason.trim().length >= 8);
  return <section className="space-y-4 rounded-2xl border border-slate-700 bg-slate-900/80 p-5">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-xl font-semibold">Zen Eco Homes · gjennomgå nye felles kunder</h2>
        <p className="mt-1 text-sm text-slate-400">Kun for eier. Opprettelsesdato i CRM gir ikke rett til provisjonsdeling eller kundeinnsyn alene.</p>
      </div>
      <button type="button" onClick={() => void reload()} disabled={busy}
        className="rounded-lg border border-slate-600 px-3 py-2 text-sm disabled:opacity-50">Oppdater kandidater</button>
    </header>
    {loading && <p className="text-sm text-slate-400">Kontrollerer nye CRM-poster…</p>}
    {notice && <p role="status" className="text-sm text-emerald-300">{notice}</p>}
    {error && <p role="alert" className="text-sm text-amber-300">{error}</p>}
    {!loading && candidates.length === 0 && !error && <p className="text-sm text-slate-400">Ingen nye Zen Eco CRM-poster til gjennomgang. Eldre kunder vises ikke i denne oversikten.</p>}
    <div className="grid gap-2 sm:grid-cols-2">
      {candidates.map(candidate => <button key={candidate.id} type="button"
        onClick={() => select(candidate)}
        className={`rounded-xl border p-3 text-left text-sm ${selectedId === candidate.id
          ? "border-cyan-500 bg-cyan-950/30" : "border-slate-700 bg-slate-950/60 hover:border-slate-500"}`}>
        <strong className="block">{candidate.name}</strong>
        <span className="block text-slate-300">{candidate.email || "Ingen e-post"}</span>
        <span className="block text-xs text-slate-400">CRM-opprettet: {new Date(candidate.created_at).toLocaleString("nb-NO")} · {candidate.source || "Ukjent kilde"}</span>
        <span className="mt-1 block text-xs text-cyan-300">Vurdering: {candidate.status}</span>
      </button>)}
    </div>
    {hasMore && <p className="text-xs text-amber-300">Viser bare de 25 nyeste CRM-postene. Flere må gjennomgås før løsningen kan tas i bruk.</p>}
    {selected && <div className="space-y-3 rounded-xl border border-cyan-800/60 bg-slate-950/70 p-4">
      <h3 className="font-semibold">Vurder {selected.name}</h3>
      <p className="text-xs text-slate-400">Kontroller eksisterende kundeforhold og dokumentasjonen manuelt. Ikke godkjenn en gammel kunde som er importert eller opprettet på nytt. Ingen godkjenning gir Andrea innsyn før sikkerhetsløsningen er ferdig.</p>
      {selected.status !== "approved" && <>
        <label className="block text-xs text-slate-300">Dato og klokkeslett for første reelle henvendelse (lokal tid)
          <input type="datetime-local" value={firstEnquiry} onChange={event => setFirstEnquiry(event.target.value)}
            className={input}/>
        </label>
        <label className="block text-xs text-slate-300">Verifisert henvendelseskilde
          <input value={source} maxLength={200} onChange={event => setSource(event.target.value)}
            placeholder="For eksempel første nettskjema eller e-post" className={input}/>
        </label>
        <label className="block text-xs text-slate-300">Referanse til dokumentasjon (ikke selve kundemeldingen)
          <input value={evidence} maxLength={256} onChange={event => setEvidence(event.target.value)}
            placeholder="Saks- eller meldingsreferanse" className={input}/>
        </label>
      </>}
      <label className="block text-xs text-slate-300">Begrunnelse for vurderingen
        <textarea value={reason} maxLength={1000} onChange={event => setReason(event.target.value)}
          placeholder="Hvorfor er kunden ny og felles, eller hvorfor skal kunden utelukkes?"
          className={input} rows={3}/>
      </label>
      <div className="flex flex-wrap gap-2">
        {selected.status !== "approved" && <button type="button" disabled={busy || !canApprove}
          onClick={() => void submit("APPROVE")} className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold disabled:opacity-40">Godkjenn som ny felles kunde</button>}
        {selected.status !== "approved" && <button type="button" disabled={busy || reason.trim().length < 8}
          onClick={() => void submit("EXCLUDE")} className="rounded-lg border border-amber-700 px-4 py-2 text-sm disabled:opacity-40">Utelukk fra samarbeidet</button>}
        {selected.status === "approved" && <button type="button" disabled={busy || reason.trim().length < 8}
          onClick={() => void submit("REVOKE")} className="rounded-lg border border-red-700 px-4 py-2 text-sm text-red-300 disabled:opacity-40">Trekk tilbake godkjenning</button>}
        <button type="button" onClick={() => setSelectedId(null)}
          className="rounded-lg border border-slate-600 px-4 py-2 text-sm">Avbryt</button>
      </div>
    </div>}
    <p className="text-xs text-slate-500">Denne delen er et utviklingsutkast. Ingen medarbeiderinvitasjoner, overføringer av gamle kunder, fakturaer eller utbetalinger skjer her. Godkjenning av kundens nye status er ikke det samme som tilgangsaktivering.</p>
  </section>;
}
