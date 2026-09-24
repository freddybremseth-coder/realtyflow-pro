"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Building2, Clapperboard, LockKeyhole, Megaphone, RefreshCw, Search, Users } from "lucide-react";
import { useParams } from "next/navigation";
import { WorkspacePropertyCatalogue } from "@/components/workspaces/property-catalogue";

type Contact = { id: string; name: string | null; email: string | null; phone: string | null; pipeline_status: string | null; updated_at: string | null };
type Tab = "overview" | "crm" | "properties" | "marketing";
const tabs: Array<{ id: Tab; label: string; icon: typeof Users }> = [
  { id: "overview", label: "Oversikt", icon: Building2 },
  { id: "crm", label: "Kunder", icon: Users },
  { id: "properties", label: "Eiendommer", icon: Building2 },
  { id: "marketing", label: "Markedsføring", icon: Megaphone },
];
export default function FocusedWorkspacePage() {
  const params = useParams();
  const brandKey = String(params.brandKey || "");
  const [tab, setTab] = useState<Tab>("overview");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [owner, setOwner] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" }).then(async res => res.ok ? res.json() : null)
      .then(body => setOwner(body?.user?.role === "OWNER")).catch(() => setOwner(false));
  }, []);
  async function load() {
    setLoading(true); setError("");
    try {
      const result = await fetch(`/api/workspaces/${encodeURIComponent(brandKey)}/contacts`, { cache: "no-store" });
      const body = await result.json();
      if (!result.ok) {
        if (result.status === 403 || result.status === 404) throw new Error("Du har ikke tilgang til CRM i dette arbeidsområdet.");
        if (result.status === 401) throw new Error("Du må logge inn i RealtyFlow for å åpne arbeidsområdet.");
        throw new Error("Arbeidsområdet er ikke tilgjengelig ennå. Kontroller at databaseoppdateringen er installert.");
      }
      setContacts(body.contacts || []);
    } catch (cause) { setContacts([]); setError(cause instanceof Error ? cause.message : "Kunne ikke laste arbeidsområdet."); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (brandKey) void load(); }, [brandKey]);
  const filtered = useMemo(() => contacts.filter(c => [c.name, c.email, c.phone].some(v => (v || "").toLowerCase().includes(search.toLowerCase()))), [contacts, search]);
  const isPinoso = brandKey === "pinosoecolife";
  const title = isPinoso ? "Pinoso EcoLife" : brandKey;
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/90 px-4 py-4">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs uppercase tracking-wider text-cyan-400">RealtyFlow · Arbeidsområde</p>
            <h1 className="text-2xl font-bold">{title}</h1></div>
          <div className="flex items-center gap-2">
            {owner && <Link href="/workspaces" className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800">Arbeidsområder</Link>}
            <button type="button" className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800" onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              window.location.assign("/login");
            }}>Logg ut</button>
          </div>
        </div>
      </header>
      <nav className="border-b border-slate-800 px-4" aria-label="Arbeidsområdet">
        <div className="mx-auto flex max-w-5xl gap-1 overflow-x-auto py-2">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)} type="button" aria-current={tab === id ? "page" : undefined}
              className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm ${tab === id ? "bg-cyan-600 font-semibold text-white" : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"}`}>
              <Icon size={16}/>{label}
            </button>
          ))}
        </div>
      </nav>
      <main className="mx-auto max-w-5xl space-y-5 px-4 py-7">
        {loading && <p className="text-slate-400">Kontrollerer tilgang og laster CRM…</p>}
        {error && <div role="alert" className="rounded-xl border border-amber-700 bg-amber-950/30 p-4 text-amber-100"><LockKeyhole size={18} className="mr-2 inline"/>{error}</div>}
        {!loading && !error && tab === "overview" && (
          <section className="grid gap-4 md:grid-cols-3">
            <button onClick={() => setTab("crm")} className="rounded-2xl border border-slate-700 bg-slate-900 p-5 text-left hover:border-cyan-500">
              <Users size={25} className="text-cyan-400" /><h2 className="mt-3 text-lg font-semibold">Kunder</h2>
              <p className="mt-1 text-sm text-slate-400">{contacts.length} kontakter i dette arbeidsområdet (viser inntil 100).</p>
            </button>
            <button onClick={() => setTab("properties")} className="rounded-2xl border border-slate-700 bg-slate-900 p-5 text-left hover:border-cyan-500">
              <Building2 size={25} className="text-cyan-400" /><h2 className="mt-3 text-lg font-semibold">Eiendommer</h2>
              <p className="mt-1 text-sm text-slate-400">Eget eiendomssøk er under utvikling.</p>
            </button>
            <button onClick={() => setTab("marketing")} className="rounded-2xl border border-slate-700 bg-slate-900 p-5 text-left hover:border-cyan-500">
              <Clapperboard size={25} className="text-cyan-400" /><h2 className="mt-3 text-lg font-semibold">Markedsføring</h2>
              <p className="mt-1 text-sm text-slate-400">Reels og publisering blir koblet til den valgte merkevaren.</p>
            </button>
          </section>
        )}
        {!loading && !error && tab === "crm" && (
          <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xl font-semibold">Kunder · kun {title}</h2>
              <button className="inline-flex items-center gap-2 text-sm text-cyan-300" onClick={() => void load()}><RefreshCw size={15}/> Oppdater</button>
            </div>
            <label className="relative mt-4 block"><Search size={17} className="absolute left-3 top-3 text-slate-500" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Søk i kundene her"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2.5 pl-10 pr-3 text-sm" /></label>
            <div className="mt-4 space-y-2">
              {filtered.map(contact => <article key={contact.id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                <h3 className="font-medium">{contact.name || "Uten navn"}</h3>
                <p className="mt-1 text-sm text-slate-400">{contact.email || "Ingen e-post"}{contact.phone ? ` · ${contact.phone}` : ""}</p>
                <p className="mt-1 text-xs text-cyan-300">{contact.pipeline_status || "Uten status"}</p>
              </article>)}
              {filtered.length === 0 && <p className="p-4 text-sm text-slate-400">Ingen kunder funnet i dette arbeidsområdet.</p>}
            </div>
            <p className="mt-4 text-xs text-slate-500">Denne første visningen er skrivebeskyttet. Sikker endring av kundekort og tilknyttede data bygges før medarbeidere får tilgang.</p>
          </section>
        )}
        {!loading && !error && tab === "properties" && <WorkspacePropertyCatalogue brandKey={brandKey} />}
        {!loading && !error && tab === "marketing" && (
          <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <h2 className="text-xl font-semibold">Markedsføring</h2>
            <p className="mt-2 max-w-xl text-slate-400">Markedsføring er under utvikling. Vi kobler Reels og publisering til merkevarens godkjente kanaler etter at rettigheter og lagring er sikret.</p>
          </section>
        )}
      </main>
    </div>
  );
}
