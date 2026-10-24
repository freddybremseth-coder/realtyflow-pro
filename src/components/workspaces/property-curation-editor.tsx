"use client";
import { useEffect, useState } from "react";

type Curation = { recommended: boolean; editor_description: string; expected_completion_manual: string };
export function PropertyCurationEditor({ brandKey, propertyId, canMarket }: { brandKey: string; propertyId: string; canMarket: boolean }) {
  const [recommended, setRecommended] = useState(false);
  const [description, setDescription] = useState("");
  const [completion, setCompletion] = useState("");
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let cancelled = false;
    setBusy(true); setNotice("");
    fetch(`/api/workspaces/${encodeURIComponent(brandKey)}/properties/curation?propertyId=${encodeURIComponent(propertyId)}`, { cache: "no-store" })
      .then(async response => { if (!response.ok) throw Error("Kunne ikke hente redaksjonelle felt"); return response.json(); })
      .then(body => {
        if (cancelled) return;
        const data: Curation = body.curation;
        setRecommended(data.recommended === true);
        setDescription(data.editor_description || "");
        setCompletion(data.expected_completion_manual || "");
      }).catch(err => { if (!cancelled) setNotice(err instanceof Error ? err.message : "Feil"); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [brandKey, propertyId]);
  const save = async () => {
    setSaving(true); setNotice("");
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(brandKey)}/properties/curation`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, recommended, editorDescription: description, expectedCompletion: completion }),
      });
      if (!response.ok) throw Error(response.status === 403 ? "Mangler skrivetilgang eller merkevaregodkjenning." : "Kunne ikke lagre");
      setNotice("Lagret for denne merkevaren.");
    } catch (err) { setNotice(err instanceof Error ? err.message : "Kunne ikke lagre"); }
    finally { setSaving(false); }
  };
  return <section className="mt-4 rounded-xl border border-cyan-700/50 bg-slate-950 p-4 space-y-3">
    <h3 className="text-base font-semibold text-white">Rediger boligpresentasjon</h3>
    <p className="text-xs text-slate-400">Arbeid per merkevare. Endrer ikke leverandørens originalinformasjon eller andre merkevarer. Feltene er interne til RealtyFlow inntil nettsidene kobles til dem.</p>
    {!canMarket && <p className="text-sm text-amber-300">Boligen er ikke godkjent for markedsføring i denne merkevaren, og kan derfor ikke redigeres her.</p>}
    <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" disabled={busy || !canMarket} checked={recommended} onChange={e => setRecommended(e.target.checked)} className="h-5 w-5" /> Anbefalt bolig – prioriter for ekstra arbeid</label>
    <label className="block text-sm">Forventes ferdig
      <input className="mt-1 block min-h-11 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 text-white" disabled={busy || !canMarket} maxLength={200} value={completion} placeholder="Ta kontakt for informasjon om planlagt ferdigstillelse" onChange={e => setCompletion(e.target.value)} />
    </label>
    <label className="block text-sm">Tilleggsinformasjon og salgstekst
      <textarea className="mt-1 block w-full rounded-lg border border-slate-600 bg-slate-900 p-3 text-white" disabled={busy || !canMarket} maxLength={8000} rows={4} value={description} onChange={e => setDescription(e.target.value)} placeholder="Beskrivelse, tilvalg og kvalitetssikrede detaljer …"/>
    </label>
    <button type="button" disabled={busy || saving || !canMarket} onClick={() => void save()} className="min-h-11 rounded-lg bg-cyan-600 px-4 font-semibold text-white disabled:opacity-50">{saving ? "Lagrer …" : "Lagre endringer"}</button>
    {notice && <p role="status" className="text-sm text-cyan-200">{notice}</p>}
  </section>;
}
