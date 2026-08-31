"use client";

import { useCallback, useEffect, useState } from "react";

type Data = { available: boolean; summary: any; facts: any[]; batches: any[]; exceptions: any[] };

function money(value: unknown, currency: string) {
  return new Intl.NumberFormat("nb-NO", { style: "currency", currency: currency === "UNKNOWN" ? "USD" : currency }).format(Number(value || 0));
}

export default function SalesEvidencePage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch("/api/book-growth/sales-evidence", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Kunne ikke laste salgsbevis");
    setData(body);
  }, []);
  useEffect(() => { load().catch((reason) => setError(reason instanceof Error ? reason.message : "Kunne ikke laste salgsbevis")); }, [load]);

  async function reconcile() {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/book-growth/sales-evidence", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "reconcile_legacy" }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Rekonsiliering mislyktes");
      setNotice(`${body.result?.imported_rows ?? 0} nye salgsrader ble knyttet til kanonisk katalog. ${body.result?.open_unmatched_rows ?? 0} åpne avvik gjenstår. Ingen eksterne data ble endret.`);
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Rekonsiliering mislyktes"); }
    finally { setBusy(false); }
  }

  const summary = data?.summary ?? {};
  return <main style={{ maxWidth: 1400, margin: "0 auto", padding: 24, fontFamily: "system-ui,sans-serif" }}>
    <header style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
      <div><p style={{ margin: 0, color: "#7c3aed", fontWeight: 900 }}>BOOK OS · FASE 5.0</p><h1 style={{ margin: "5px 0" }}>Sales Evidence Center</h1><p style={{ maxWidth: 850, color: "#475569", marginTop: 0 }}>Knytter salgs-, royalty- og annonsetall til riktig bok, utgave og kanonisk revisjon. Rådata beholdes, valutaer blandes aldri, og umatchede rader vises som avvik.</p></div>
      <button disabled={busy} onClick={reconcile} style={{ padding: "10px 14px", border: 0, borderRadius: 8, background: "#0f766e", color: "white", fontWeight: 900 }}>{busy ? "Rekonsilerer…" : "Rekonsiler eksisterende salgstall"}</button>
    </header>
    {error ? <p role="alert" style={{ padding: 12, background: "#fef2f2", border: "1px solid #ef4444", borderRadius: 8 }}>{error}</p> : null}
    {notice ? <p role="status" style={{ padding: 12, background: "#ecfdf5", border: "1px solid #22c55e", borderRadius: 8 }}>{notice}</p> : null}
    <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10, margin: "18px 0" }}>
      {[["Kanoniske salgsrader",summary.facts],["Eksakt revisjon",summary.exactRevision],["Kun utgave",summary.editionOnly],["Åpne avvik",summary.openExceptions],["Enheter",summary.units],["Ordre",summary.orders],["Leste sider",summary.pagesRead]].map(([label,value]) => <article key={String(label)} style={{ padding: 13, border: "1px solid #aebdce", borderRadius: 10, background: "white" }}><span style={{ fontSize: 11, color: "#475569", fontWeight: 800 }}>{label}</span><strong style={{ display: "block", fontSize: 25 }}>{value ?? 0}</strong></article>)}
    </section>
    <section style={{ padding: 14, border: "1px solid #aebdce", borderRadius: 12, background: "white" }}><h2 style={{ marginTop: 0 }}>Økonomi per valuta</h2><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 10 }}>{Object.entries(summary.monetaryByCurrency ?? {}).map(([currency,values]: any) => <article key={currency} style={{ padding: 11, border: "1px solid #cbd5e1", borderRadius: 8 }}><strong>{currency}</strong><span style={{ display: "block", fontSize: 12 }}>Royalties: {money(values.royalties,currency)}</span><span style={{ display: "block", fontSize: 12 }}>Bruttosalg: {money(values.grossSales,currency)}</span><span style={{ display: "block", fontSize: 12 }}>Annonsekostnad: {money(values.adSpend,currency)}</span><span style={{ display: "block", fontSize: 12 }}>Annonsesalg: {money(values.adSales,currency)}</span></article>)}</div>{!Object.keys(summary.monetaryByCurrency ?? {}).length ? <p style={{ color: "#64748b" }}>Ingen kanoniske økonomirader ennå.</p> : null}</section>
    <section style={{ marginTop: 16, padding: 14, border: "1px solid #f59e0b", borderRadius: 12, background: "#fffbeb" }}><h2 style={{ marginTop: 0 }}>Avvik som må løses</h2>{(data?.exceptions ?? []).map((row) => <div key={row.id} style={{ padding: 9, borderTop: "1px solid #fde68a", fontSize: 12 }}><strong>{row.reason === "book_missing" ? "Boken finnes ikke i eldre katalog" : "Kanonisk utgave mangler"}</strong><span style={{ display: "block", color: "#92400e" }}>{row.evidence?.channel || "ukjent kanal"} · {row.evidence?.marketplace || "global"} · {row.evidence?.metric_date || "ukjent dato"}</span></div>)}{!data?.exceptions?.length ? <p style={{ color: "#166534" }}>Ingen åpne avvik.</p> : null}</section>
    <section style={{ marginTop: 16, border: "1px solid #aebdce", borderRadius: 12, background: "white", overflow: "hidden" }}><h2 style={{ margin: 0, padding: 14 }}>Siste kanoniske salgsbevis</h2><div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}><thead><tr>{["Dato","Bok / utgave","Kanal","Tilknytning","Enheter","Royalties","Kilde"].map((label) => <th key={label} style={{ padding: 9, textAlign: "left" }}>{label}</th>)}</tr></thead><tbody>{(data?.facts ?? []).slice(0,100).map((row) => <tr key={row.id}><td style={{ padding: 9 }}>{row.metric_date}</td><td style={{ padding: 9 }}><strong>{row.work?.canonical_title || row.edition?.title || "Ukjent"}</strong><span style={{ display: "block", color: "#64748b" }}>{row.edition?.language?.toUpperCase()} · {row.edition?.format}</span></td><td style={{ padding: 9 }}>{row.channel} · {row.marketplace}</td><td style={{ padding: 9, color: row.attribution_status === "exact_revision" ? "#166534" : "#92400e", fontWeight: 800 }}>{row.attribution_status === "exact_revision" ? "Eksakt revisjon" : "Kun utgave"}</td><td style={{ padding: 9 }}>{row.units}</td><td style={{ padding: 9 }}>{row.currency ? money(row.royalties,row.currency) : "—"}</td><td style={{ padding: 9 }}>{row.source}</td></tr>)}</tbody></table></div>{!data?.facts?.length ? <p style={{ padding: 14, color: "#64748b" }}>Ingen kanoniske salgsbevis ennå.</p> : null}</section>
    <section style={{ marginTop: 16, padding: 14, border: "1px solid #aebdce", borderRadius: 12, background: "white" }}><h2 style={{ marginTop: 0 }}>Siste importkjøringer</h2>{(data?.batches ?? []).map((row) => <p key={row.id} style={{ margin: "7px 0", fontSize: 12 }}><strong>{row.status}</strong> · {new Date(row.started_at).toLocaleString("nb-NO")} · skannet {row.scanned_rows} · nye {row.imported_rows} · avvik {row.unmatched_rows}</p>)}{!data?.batches?.length ? <p style={{ color: "#64748b" }}>Ingen rekonsiliering er kjørt ennå.</p> : null}</section>
  </main>;
}
