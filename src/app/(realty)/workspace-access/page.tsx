"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, LockKeyhole, RefreshCw, ShieldAlert, UserRoundCog } from "lucide-react";
import { WORKSPACE_PERMISSIONS, type WorkspacePermission } from "@/lib/workspaces/brand-policy";
import { SharedCommissionPreview } from "@/components/workspaces/shared-commission-preview";

type Brand = { id: string; brand_key: string; display_name: string };
type Plan = { brand_id: string; email: string; permissions: WorkspacePermission[]; status: "draft" | "discarded"; updated_by: string; updated_at: string };
type ContactCount = { brand_key: string; assigned: number; needs_review: number };
type Payload = { brands: Brand[]; plans: Plan[]; contactCounts: ContactCount[]; activationAvailable: false; message: string };
const permissionLabels: Record<WorkspacePermission, { title: string; description: string }> = {
  "properties.catalog.read": { title: "Eiendomskatalog", description: "Se vanlige boligoppføringer. Ikke intern pris-/importdata." },
  "crm.read": { title: "Kunder og CRM – se", description: "Les kun kunder som er knyttet til valgt merkevare." },
  "crm.write": { title: "Kunder og CRM – endre", description: "Opprette kontakter og endre navn, e-post og telefon i egen merkevare. Oppfølging og status kommer senere." },
  "marketing.read": { title: "Markedsføring – se", description: "Se innhold og kampanjer for valgt merkevare." },
  "marketing.draft": { title: "Markedsføring – lage utkast", description: "Lage Reels, videoutkast, tekst og innholdskalender." },
  "marketing.publish": { title: "Publisere i sosiale medier", description: "Kun godkjente kontoer for merkevaren. Krever separat teknisk kontroll før aktivering." },
};
const suggested: WorkspacePermission[] = ["properties.catalog.read", "crm.read", "crm.write", "marketing.read", "marketing.draft"];

export default function WorkspaceAccessPage() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [brandKey, setBrandKey] = useState("");
  const [email, setEmail] = useState("");
  const [permissions, setPermissions] = useState<WorkspacePermission[]>(suggested);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function reload() {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/workspaces/access-plans", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Tilgangsplanene kunne ikke hentes.");
      setPayload(body);
      setBrandKey((current) => current && body.brands.some((brand: Brand) => brand.brand_key === current)
        ? current : body.brands.find((brand: Brand) => brand.brand_key === "pinosoecolife")?.brand_key || body.brands[0]?.brand_key || "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke hente tilgangsplaner.");
    } finally { setLoading(false); }
  }
  useEffect(() => { void reload(); }, []);

  function selectPlan(plan: Plan) {
    const brand = payload?.brands.find((item) => item.id === plan.brand_id);
    if (!brand) return;
    setBrandKey(brand.brand_key); setEmail(plan.email); setPermissions(plan.permissions);
    setNotice("Utkastet er valgt. Juster rettigheter og lagre.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save(action: "SAVE_DRAFT" | "DISCARD_DRAFT", plan?: Plan) {
    const selectedBrand = plan ? payload?.brands.find((item) => item.id === plan.brand_id)?.brand_key : brandKey;
    const selectedEmail = plan?.email || email.trim().toLowerCase();
    if (!selectedBrand || !selectedEmail) { setError("Velg merkevare og skriv inn e-post."); return; }
    if (action === "DISCARD_DRAFT" && !window.confirm(`Forkaste tilgangsutkast for ${selectedEmail}?`)) return;
    setBusy(true); setNotice(""); setError("");
    try {
      const res = await fetch("/api/workspaces/access-plans", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, brandKey: selectedBrand, email: selectedEmail, permissions }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Kunne ikke lagre.");
      setNotice(action === "SAVE_DRAFT" ? "Rettighetene er lagret som utkast. Ingen tilgang er aktivert." : "Utkastet er forkastet.");
      await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Kunne ikke lagre."); }
    finally { setBusy(false); }
  }
  const selectedBrand = payload?.brands.find((brand) => brand.brand_key === brandKey);
  const brandContacts = payload?.contactCounts?.find((item) => item.brand_key === brandKey);
  const plans = (payload?.plans || []).filter((plan) => plan.status === "draft");
  const input = "mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-cyan-500 focus:outline-none";
  return (
    <div className="mx-auto max-w-6xl space-y-6 text-slate-100">
      <Link href="/workspaces" className="inline-flex items-center gap-2 text-sm text-cyan-300 hover:underline"><ArrowLeft size={15} /> Arbeidsområder</Link>
      <header className="space-y-2">
        <h1 className="flex items-center gap-3 text-3xl font-bold"><UserRoundCog className="text-cyan-400" /> Brukere og arbeidsområder</h1>
        <p className="max-w-3xl text-slate-400">Velg hvilke merkevarer og oppgaver en medarbeider skal ha tilgang til. Du kan ha forskjellige rettigheter for samme person på ulike merkevarer.</p>
      </header>
      <div className="flex gap-3 rounded-xl border border-amber-600/60 bg-amber-950/30 p-4 text-sm text-amber-100" role="status">
        <ShieldAlert className="mt-0.5 shrink-0" size={22} />
        <p><strong>Utkastmodus – ingen ny bruker får tilgang ennå.</strong> De eksisterende CRM-, eiendoms- og markedsføringsrutene må sikres før en merkevarebruker kan aktiveres. Dette skjermbildet oppretter ikke innlogging eller invitasjoner. Bruk ikke den gamle globale rolleadministrasjonen til å gi Andrea tilgang i mellomtiden.</p>
      </div>
      {error && <p role="alert" className="rounded-xl border border-red-700 bg-red-950/50 p-3 text-red-200">{error}</p>}
      {notice && <p role="status" className="flex items-center gap-2 rounded-xl border border-emerald-700 bg-emerald-950/40 p-3 text-emerald-200"><CheckCircle2 size={16} />{notice}</p>}
      {loading && <p className="text-sm text-slate-400">Laster merkevarer og tilgangsutkast…</p>}
      {payload && <SharedCommissionPreview />}
      {payload && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(300px,1fr)]">
          <section className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
            <h2 className="text-xl font-semibold">1. Hvem skal jobbe hvor?</h2>
            <label className="block text-sm text-slate-300">Merkevare
              <select className={input} value={brandKey} onChange={(event) => setBrandKey(event.target.value)}>
                {payload.brands.map((brand) => <option key={brand.id} value={brand.brand_key}>{brand.display_name} ({brand.brand_key})</option>)}
              </select>
            </label>
            <label className="block text-sm text-slate-300">Medarbeiderens e-post
              <input type="email" autoComplete="off" className={input} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="navn@eksempel.no" />
            </label>
            {brandKey === "zeneco" && <div role="note" className="rounded-xl border border-amber-700/70 bg-amber-950/25 p-4 text-sm text-amber-100">
              <strong>Zen Eco Homes · Andrea – bare nye felles kunder fra 24.09.2026</strong>
              <p className="mt-2">Eldre Zen Eco Homes-kunder er ikke omfattet. Selv et lagret CRM-tilgangsutkast åpner derfor ikke Zen Eco-kundene for medarbeidere. Før aktivering trenger vi en verifisert kundeliste per samarbeid, ikke bred tilgang til hele merkevarens CRM.</p>
              <p className="mt-2">Felles utbyggerprovisjon på nye salg: 10 % til markedsføring, deretter godkjente og dokumenterte salgsutlegg, og så 50/50 til Freddy og Andrea. Dette er en provisjonsdeling, ikke overføring av eierskap til Zen Eco Homes.</p>
            </div>}
            {brandContacts && <div className="rounded-xl border border-cyan-800/60 bg-cyan-950/25 p-3 text-sm text-slate-200">
              <strong>CRM-klargjøring · {selectedBrand?.display_name || brandKey}</strong>
              <p className="mt-1">{brandContacts.assigned} kunder er knyttet til denne merkevaren i begge CRM-feltene.
                {brandContacts.needs_review > 0 && <> {brandContacts.needs_review} kundeposter har motstridende merkevarefelter og må gjennomgås av eier.</>}
              </p>
              {brandContacts.assigned === 0 && <p className="mt-2 text-amber-300">Ingen eksisterende kunder blir synlige for medarbeideren ennå. Gjennomgå eventuelle kundetildelinger separat; dette skjermbildet flytter eller deler ikke kunder.</p>}
            </div>}
            <h2 className="text-xl font-semibold">2. Velg rettigheter</h2>
            <div className="space-y-2">
              {WORKSPACE_PERMISSIONS.map((permission) => (
                <label key={permission} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <input type="checkbox" className="mt-1 accent-cyan-500" checked={permissions.includes(permission)}
                    onChange={(event) => setPermissions((current) => event.target.checked ? [...current, permission] : current.filter((value) => value !== permission))} />
                  <span><span className="block font-medium">{permissionLabels[permission].title}</span><span className="text-sm text-slate-400">{permissionLabels[permission].description}</span></span>
                </label>
              ))}
            </div>
            <button type="button" disabled={busy || !brandKey || !email.trim()} onClick={() => void save("SAVE_DRAFT")}
              className="rounded-xl bg-cyan-600 px-5 py-3 font-semibold text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50">
              {busy ? "Lagrer…" : "Lagre tilgangsutkast"}
            </button>
            <p className="flex items-center gap-2 text-xs text-slate-400"><LockKeyhole size={14} /> Aktivering og invitasjoner er deaktivert inntil sikkerhetskontrollene er bestått.</p>
          </section>
          <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
            <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-semibold">Lagrede utkast</h2>
              <button onClick={() => void reload()} className="rounded-lg border border-slate-700 p-2 hover:bg-slate-800" aria-label="Oppdater"><RefreshCw size={16} /></button></div>
            {plans.length === 0 && <p className="text-sm text-slate-400">Ingen utkast ennå. Velg en merkevare og en medarbeider til venstre.</p>}
            {plans.map((plan) => {
              const brand = payload.brands.find((item) => item.id === plan.brand_id);
              return (
                <div key={`${plan.brand_id}:${plan.email}`} className="space-y-2 rounded-xl border border-slate-700 bg-slate-950/60 p-4">
                  <div className="font-semibold">{plan.email}</div>
                  <p className="text-sm text-cyan-300">{brand?.display_name || "Ukjent merkevare"}</p>
                  <p className="text-xs text-slate-400">{plan.permissions.map((permission) => permissionLabels[permission]?.title || permission).join(" · ") || "Ingen rettigheter valgt"}</p>
                  <p className="text-xs text-amber-300">Utkast · ingen aktiv tilgang</p>
                  <div className="flex gap-2 pt-2">
                    <button onClick={() => selectPlan(plan)} className="rounded-lg border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800">Rediger</button>
                    <button disabled={busy} onClick={() => void save("DISCARD_DRAFT", plan)} className="rounded-lg border border-red-800 px-3 py-2 text-sm text-red-300 hover:bg-red-950/40 disabled:opacity-50">Forkast</button>
                  </div>
                </div>
              );
            })}
          </section>
        </div>
      )}
      {!loading && !payload && <p className="text-sm text-slate-400">Ingen tilgangsdata er tilgjengelige. Kontroller at databaseoppdateringen er installert.</p>}
      <p className="text-xs text-slate-500">Valgt merkevare: {selectedBrand?.display_name || "Ingen"}. De valgte rettighetene er et forslag, ikke aktivert datatilgang.</p>
    </div>
  );
}
