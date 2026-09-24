"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Building2, Clapperboard, LockKeyhole, Megaphone, RefreshCw, Search, Users } from "lucide-react";
import { useParams } from "next/navigation";
import { WorkspacePropertyCatalogue } from "@/components/workspaces/property-catalogue";
import type { WorkspacePermission } from "@/lib/workspaces/brand-policy";

type Contact = { id: string; name: string | null; email: string | null; phone: string | null; pipeline_status: string | null };
type Tab = "overview" | "crm" | "properties" | "marketing";
const tabs: Array<{ id: Tab; label: string; icon: typeof Users; permitted?: WorkspacePermission[] }> = [
  { id: "overview", label: "Oversikt", icon: Building2 },
  { id: "crm", label: "Kunder", icon: Users, permitted: ["crm.read", "crm.joint.read"] },
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
  const [crmQuery, setCrmQuery] = useState("");
  const [crmPage, setCrmPage] = useState(1);
  const [crmHasMore, setCrmHasMore] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [savingContact, setSavingContact] = useState(false);
  const [contactNotice, setContactNotice] = useState("");
  const [contactError, setContactError] = useState("");

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
    if (!permissions.includes("crm.read") && !permissions.includes("crm.joint.read")) return;
    setCrmBusy(true); setCrmError("");
    try {
      const endpoint = brandKey === "zeneco" && !permissions.includes("crm.read") ? "joint-contacts" : "contacts";
      const result = await fetch(`/api/workspaces/${encodeURIComponent(brandKey)}/${endpoint}?page=${crmPage}&q=${encodeURIComponent(crmQuery)}`, { cache: "no-store" });
      if (!result.ok) throw new Error(result.status === 403
        ? "Du har ikke CRM-tilgang i dette arbeidsområdet." : "CRM er ikke tilgjengelig ennå.");
      const body = await result.json();
      setContacts(body.contacts || []);
      setCrmHasMore(Boolean(body.hasMore));
    } catch (cause) { setContacts([]); setCrmHasMore(false); setCrmError(cause instanceof Error ? cause.message : "Kunne ikke hente CRM."); }
    finally { setCrmBusy(false); }
  }
  useEffect(() => { if (permissions.includes("crm.read") || permissions.includes("crm.joint.read")) void loadCrm(); }, [brandKey, permissions, crmPage, crmQuery]);
  const filtered = contacts;
  const visibleTabs = tabs.filter(item => !item.permitted || item.permitted.some(permission => permissions.includes(permission)));
  const title = brandKey === "pinosoecolife" ? "Pinoso EcoLife" : brandKey === "zeneco" ? "Zen Eco Homes" : brandKey;
  const showCrm = permissions.includes("crm.read") || permissions.includes("crm.joint.read");
  const canEditCrm = permissions.includes("crm.read") && permissions.includes("crm.write");
  const showProperties = permissions.includes("properties.catalog.read");
  const showMarketing = permissions.some(p => p.startsWith("marketing."));

  function resetContactForm() {
    setEditingId(null); setFormName(""); setFormEmail(""); setFormPhone("");
    setContactError("");
  }
  async function saveContact() {
    if (!canEditCrm || !formName.trim()) return;
    setSavingContact(true); setContactError(""); setContactNotice("");
    try {
      const result = await fetch(`/api/workspaces/${encodeURIComponent(brandKey)}/contacts`, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(editingId ? { id: editingId } : {}),
          name: formName.trim(), email: formEmail.trim() || null, phone: formPhone.trim() || null }),
      });
      if (!result.ok) throw new Error(result.status === 403
        ? "Du har ikke rettighet til å endre kunder her."
        : result.status === 404 ? "Kunden finnes ikke i dette arbeidsområdet."
        : result.status === 400 ? "Kontroller navn, e-post og telefon."
        : "Kunden kunne ikke lagres. Prøv igjen eller kontakt administrator.");
      setContactNotice(editingId ? "Kundekortet er oppdatert." : "Kunden er lagt til.");
      resetContactForm();
      await loadCrm();
    } catch (cause) { setContactError(cause instanceof Error ? cause.message : "Kunne ikke lagre."); }
    finally { setSavingContact(false); }
  }

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
            <form className="relative mt-4 flex gap-2" onSubmit={event => { event.preventDefault(); setCrmPage(1); setCrmQuery(search.trim()); }}>
              <label className="relative block flex-1"><Search size={17} className="absolute left-3 top-3 text-slate-500" />
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Søk i kundene her"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2.5 pl-10 pr-3 text-sm" /></label>
              <button type="submit" className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white">Søk</button>
            </form>
            {canEditCrm && <form className="mt-5 space-y-3 rounded-xl border border-slate-700 bg-slate-950/70 p-4" onSubmit={event => { event.preventDefault(); void saveContact(); }}>
              <h3 className="font-semibold">{editingId ? "Rediger kunde" : "Legg til kunde"}</h3>
              <p className="text-xs text-slate-400">Kun navn, e-post og telefon kan endres her. Merkevare og økonomiske felt låses av serveren.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-slate-300">Navn *<input required maxLength={140} value={formName} onChange={e => setFormName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"/></label>
                <label className="text-xs text-slate-300">E-post<input type="email" maxLength={254} value={formEmail} onChange={e => setFormEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"/></label>
                <label className="text-xs text-slate-300">Telefon<input maxLength={60} value={formPhone} onChange={e => setFormPhone(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"/></label>
              </div>
              {contactNotice && <p role="status" className="text-sm text-emerald-300">{contactNotice}</p>}
              {contactError && <p role="alert" className="text-sm text-amber-300">{contactError}</p>}
              <div className="flex gap-2"><button disabled={savingContact || !formName.trim()} type="submit" className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{savingContact ? "Lagrer…" : editingId ? "Lagre endringer" : "Opprett kunde"}</button>
                {editingId && <button type="button" onClick={resetContactForm} className="rounded-lg border border-slate-700 px-4 py-2 text-sm">Avbryt</button>}
              </div>
            </form>}
            {crmBusy && <p className="mt-4 text-sm text-slate-400">Laster CRM…</p>}
            {crmError && <p role="alert" className="mt-4 text-sm text-amber-300">{crmError}</p>}
            {!crmBusy && !crmError && <div className="mt-4 space-y-2">
              {filtered.map(contact => <article key={contact.id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                <h3 className="font-medium">{contact.name || "Uten navn"}</h3>
                <p className="mt-1 text-sm text-slate-400">{contact.email || "Ingen e-post"}{contact.phone ? ` · ${contact.phone}` : ""}</p>
                <p className="mt-1 text-xs text-cyan-300">{contact.pipeline_status || "Uten status"}</p>
                {canEditCrm && <button type="button" className="mt-2 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-cyan-300" onClick={() => {
                  setEditingId(contact.id); setFormName(contact.name || ""); setFormEmail(contact.email || "");
                  setFormPhone(contact.phone || ""); setContactError(""); setContactNotice("");
                }}>Rediger kontaktopplysninger</button>}
              </article>)}
              {filtered.length === 0 && <p className="p-4 text-sm text-slate-400">Ingen kunder funnet på denne siden.</p>}
            </div>}
            {!crmBusy && !crmError && <div className="mt-4 flex items-center justify-between gap-3">
              <button type="button" disabled={crmPage === 1} onClick={() => setCrmPage(page => Math.max(1, page - 1))}
                className="rounded-lg border border-slate-700 px-3 py-2 text-sm disabled:opacity-40">Forrige</button>
              <span className="text-xs text-slate-400">Side {crmPage}</span>
              <button type="button" disabled={!crmHasMore || crmPage >= 1000} onClick={() => setCrmPage(page => page + 1)}
                className="rounded-lg border border-slate-700 px-3 py-2 text-sm disabled:opacity-40">Neste</button>
            </div>}
            <p className="mt-4 text-xs text-slate-500">Søk og visning er avgrenset til merkevaren. Opprettelse og redigering er begrenset til kontaktopplysninger; status, notater, avtaler og økonomi er ikke åpnet for medarbeidere.</p>
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
