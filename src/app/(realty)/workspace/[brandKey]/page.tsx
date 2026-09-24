"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Building2, Clapperboard, LockKeyhole, Megaphone, RefreshCw, Search, Users } from "lucide-react";
import { useParams } from "next/navigation";
import { WorkspacePropertyCatalogue } from "@/components/workspaces/property-catalogue";
import type { WorkspacePermission } from "@/lib/workspaces/brand-policy";

type Contact = { id: string; name: string | null; email: string | null; phone: string | null; pipeline_status: string | null };
type Tab = "overview" | "crm" | "properties" | "marketing";
const tabs: Array<{ id: Tab; label: string; icon: typeof Users; permitted?: WorkspacePermission[] }> = [
  { id: "overview", label: "Oversikt", icon: Building2 },
  { id: "crm", label: "Kunder", icon: Users, permitted: ["crm.read"] },
  { id: "properties", label: "Eiendommer", icon: Building2, permitted: ["properties.catalog.read"] },
  { id: "marketing", label: "Markedsføring", icon: Megaphone, permitted: ["marketing.read", "marketing.draft", "marketing.publish"] },
];

export default function FocusedWorkspacePage() {
  const params = useParams();
  const brandKey = String(params.brandKey || "");
  const [tab, setTab] = useState<Tab>("overview");
  const [permissions, setPermissions] = useState<WorkspacePermission[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [crmBusy, setCrmBusy] = useState(false);
  const [error, setError] = useState("");
  const [crmError, setCrmError] = useState("");
  const [owner, setOwner] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" }).then(async res => res.ok ? res.json() : null)
      .then(body => setOwner(body?.user?.role === "OWNER")).catch(() => setOwner(false));
  }, []);

  useEffect(() => {
    const abort = new AbortController();
    setLoading(true); setError(""); setTab("overview"); setPermissions([]); setContacts([]);
    fetch(`/api/workspaces/${encodeURIComponent(brandKey)}/capabilities`, {
      cache: "no-store", signal: abort.signal,
    }).then(async res => {
      const body = await res.json();
      if (!res.ok) throw new Error(
        res.status === 403 || res.status === 404 ? "Du har ikke tilgang til dette arbeidsområdet."
          : res.status === 401 ? "Du må logge inn for å åpne arbeidsområdet."
          : "Arbeidsområdet er ikke tilgjengelig ennå. Kontroller databaseoppsettet.");
      return body;
    }).then(body => { if (!abort.signal.aborted) setPermissions(body.permissions || []); })
      .catch(cause => { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "Kunne ikke åpne arbeidsområdet."); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [brandKey]);

  async function loadCrm() {
    if (!permissions.includes("crm.read")) return;
    setCrmBusy(true); setCrmError("");
    try {
      const result = await fetch(`/api/workspaces/${encodeURIComponent(brandKey)}/contacts`, { cache: "no-store" });
      if (!result.ok) throw new Error(result.status === 403
        ? "Du har ikke CRM-tilgang i dette arbeidsområdet." : "CRM er ikke tilgjengelig ennå.");
      const body = await result.json();
      setContacts(body.contacts || []);
    } catch (cause) { setContacts([]); setCrmError(cause instanceof Error ? cause.message : "Kunne ikke hente CRM."); }
    finally { setCrmBusy(false); }
  }
  useEffect(() => { if (permissions.includes("crm.read")) void loadCrm(); }, [brandKey, permissions]);
  const filtered = useMemo(() => contacts.filter(c =>
    [c.name, c.email, c.phone].some(v => (v || "").toLowerCase().includes(search.toLowerCase()))), [contacts, search]);
  const visibleTabs = tabs.filter(item => !item.permitted || item.permitted.some(permission => permissions.includes(permission)));
  const title = brandKey === "pinosoecolife" ? "Pinoso EcoLife" : brandKey;
  const showCrm = permissions.includes("crm.read");
  const showProperties = permissions.includes("properties.catalog.read");
  const showMarketing = permissions.some(p => p.startsWith("marketing."));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/90 px-4 py-4">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs uppercase tracking-wider text-cyan-400">RealtyFlow · Arbeidsområde</p>
            <h1 className="text-2xl font-bold">{title}</h1></div>
          <div className="flex items-center gap-2">
            {owner && <Link href="/workspaces" className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800">Arbeidsområder</Link>}
            <button type="button" className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800"
              onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.assign("/login"); }}>Logg ut</button>
          </div>
        </div>
      </header>
      {!loading && !error && <nav className="border-b border-slate-800 px-4" aria-label="Arbeidsområdet">
        <div className="mx-auto flex max-w-5xl gap-1 overflow-x-auto py-2">
          {visibleTabs.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)} type="button" aria-current={tab === id ? "page" : undefined}
              className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm ${tab === id ? "bg-cyan-600 font-semibold text-white" : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"}`}>
              <Icon size={16}/>{label}
            </button>
          ))}
        </div>
      </nav>}
      <main className="mx-auto max-w-5xl space-y-5 px-4 py-7">
        {loading && <p className="text-slate-400">Kontrollerer tilgang…</p>}
        {error && <div role="alert" className="rounded-xl border border-amber-700 bg-amber-950/30 p-4 text-amber-100">
          <LockKeyhole size={18} className="mr-2 inline"/>{error}
          <Link href="/login" className="ml-3 underline">Innlogging</Link>
        </div>}
        {!loading && !error && tab === "overview" && (
          <section className="grid gap-4 md:grid-cols-3">
            {showCrm && <button onClick={() => setTab("crm")} className="rounded-2xl border border-slate-700 bg-slate-900 p-5 text-left hover:border-cyan-500">
              <Users size={25} className="text-cyan-400" /><h2 className="mt-3 text-lg font-semibold">Kunder</h2>
              <p className="mt-1 text-sm text-slate-400">Åpne CRM og kundene i dette arbeidsområdet.</p>
            </button>}
            {showProperties && <button onClick={() => setTab("properties")} className="rounded-2xl border border-slate-700 bg-slate-900 p-5 text-left hover:border-cyan-500">
              <Building2 size={25} className="text-cyan-400" /><h2 className="mt-3 text-lg font-semibold">Eiendommer</h2>
              <p className="mt-1 text-sm text-slate-400">Søk i publiserte boliger på tvers av områder.</p>
            </button>}
            {showMarketing && <button onClick={() => setTab("marketing")} className="rounded-2xl border border-slate-700 bg-slate-900 p-5 text-left hover:border-cyan-500">
              <Clapperboard size={25} className="text-cyan-400" /><h2 className="mt-3 text-lg font-semibold">Markedsføring</h2>
              <p className="mt-1 text-sm text-slate-400">Reels og publisering kobles til valgt merkevare senere.</p>
            </button>}
          </section>
        )}
        {!loading && !error && showCrm && tab === "crm" && (
          <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xl font-semibold">Kunder · kun {title}</h2>
              <button className="inline-flex items-center gap-2 text-sm text-cyan-300" onClick={() => void loadCrm()}><RefreshCw size={15}/> Oppdater</button>
            </div>
            <label className="relative mt-4 block"><Search size={17} className="absolute left-3 top-3 text-slate-500" />
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Søk i kundene her"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2.5 pl-10 pr-3 text-sm" /></label>
            {crmBusy && <p className="mt-4 text-sm text-slate-400">Laster CRM…</p>}
            {crmError && <p role="alert" className="mt-4 text-sm text-amber-300">{crmError}</p>}
            {!crmBusy && !crmError && <div className="mt-4 space-y-2">
              {filtered.map(contact => <article key={contact.id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                <h3 className="font-medium">{contact.name || "Uten navn"}</h3>
                <p className="mt-1 text-sm text-slate-400">{contact.email || "Ingen e-post"}{contact.phone ? ` · ${contact.phone}` : ""}</p>
                <p className="mt-1 text-xs text-cyan-300">{contact.pipeline_status || "Uten status"}</p>
              </article>)}
              {filtered.length === 0 && <p className="p-4 text-sm text-slate-400">Ingen kunder funnet på denne siden.</p>}
            </div>}
            <p className="mt-4 text-xs text-slate-500">CRM er foreløpig skrivebeskyttet og viser inntil 100 kunder. Merkevaresikker redigering og full søk/paginering kommer senere.</p>
          </section>
        )}
        {!loading && !error && showProperties && tab === "properties" &&
          <WorkspacePropertyCatalogue brandKey={brandKey} />}
        {!loading && !error && showMarketing && tab === "marketing" &&
          <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <h2 className="text-xl font-semibold">Markedsføring</h2>
            <p className="mt-2 max-w-xl text-slate-400">Innholdsproduksjon og publisering er under utvikling. Ingen globale kanaler eller andre merkevarers innhold er koblet til denne arbeidsflaten.</p>
          </section>}
      </main>
    </div>
  );
}
