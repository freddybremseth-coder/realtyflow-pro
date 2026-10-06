"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, BrainCircuit, Building2, Clapperboard, LockKeyhole, RefreshCw, Search, TrendingUp, Users, Youtube } from "lucide-react";
import { useParams, useSearchParams } from "next/navigation";
import { WorkspacePropertyCatalogue, type WorkspacePropertyCard } from "@/components/workspaces/property-catalogue";
import { WorkspaceMarketingPanel } from "@/components/workspaces/marketing-panel";
import type { WorkspaceSocialPropertySeed } from "@/components/workspaces/social-studio-panel";
import { WorkspaceSocialPublishPanel } from "@/components/workspaces/social-publish-panel";
import { GrowthCorporatePanel } from "@/components/workspaces/growth-corporate-panel";
import { ZenJointTasks } from "@/components/workspaces/zen-joint-tasks";
import { WorkspaceTrainingPanel } from "@/components/workspaces/training-panel";
import { WorkspaceReelsPanel, type WorkspaceReelPropertySeed } from "@/components/workspaces/reels-panel";
import { WorkspaceYoutubePanel } from "@/components/workspaces/youtube-panel";
import { WorkspaceNexusInsightsPanel } from "@/components/workspaces/nexus-insights-panel";
import { WorkspaceTodayPriorities } from "@/components/workspaces/today-priorities";
import type { WorkspacePermission } from "@/lib/workspaces/brand-policy";
import type { WorkspaceResponsibilityId } from "@/lib/workspaces/responsibilities";

type Contact = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  pipeline_status: string | null;
  source?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};
type CrmSummary = {
  matchedCount: number;
  staleCount: number;
  statusCounts: Record<string, number>;
};
type Tab = "today" | "leads" | "growth" | "properties";

const crmStatuses = ["NEW", "CONTACT", "QUALIFIED", "VIEWING", "NEGOTIATION", "WON", "ON_HOLD", "LOST"] as const;
const crmStatusLabels: Record<string, string> = {
  NEW: "Ny", CONTACT: "Kontakt", QUALIFIED: "Kvalifisert", VIEWING: "Visning",
  NEGOTIATION: "Forhandling", WON: "Vunnet", ON_HOLD: "På vent", LOST: "Tapt", UNSET: "Uten status",
};
function crmDate(value?: string | null) {
  if (!value) return "Ukjent";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Ukjent" : date.toLocaleDateString("nb-NO");
}
function crmIsStale(value?: string | null) {
  if (!value) return true;
  const time = new Date(value).getTime();
  return Number.isNaN(time) || Date.now() - time > 7 * 86_400_000;
}
const tabs: Array<{ id: Tab; label: string; icon: typeof Users; permitted?: WorkspacePermission[] }> = [
  { id: "today", label: "I dag", icon: Building2 },
  { id: "leads", label: "Kunder & leads", icon: Users, permitted: ["crm.read", "crm.joint.read", "tasks.joint.read"] },
  { id: "growth", label: "Vekst & innhold", icon: TrendingUp, permitted: [
    "marketing.read", "marketing.draft", "marketing.publish",
    "reels.read", "reels.create", "reels.publish",
    "youtube.read", "youtube.publish", "nexus.read",
    "corporate.read", "corporate.plan", "visibility.read", "visibility.plan",
    "ads.read", "ads.draft", "events.plan",
    "content.read", "content.edit", "content.publish",
    "email.read", "email.draft", "email.send",
  ] },
  { id: "properties", label: "Eiendommer", icon: Building2, permitted: ["properties.catalog.read"] },
];

export default function FocusedWorkspacePage() {
  const params = useParams();
  const routeSearchParams = useSearchParams();
  const brandKey = String(params.brandKey || "");
  const [requestedTab, setRequestedTab] = useState<string | null>(null);
  const [requestedArea, setRequestedArea] = useState<string | null>(null);
  const [requestedFocus, setRequestedFocus] = useState<string | null>(null);
  const [requestedTraining, setRequestedTraining] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("today");
  const [permissions, setPermissions] = useState<WorkspacePermission[]>([]);
  const [responsibilities, setResponsibilities] = useState<WorkspaceResponsibilityId[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [crmBusy, setCrmBusy] = useState(false);
  const [error, setError] = useState("");
  const [crmError, setCrmError] = useState("");
  const [owner, setOwner] = useState(false);
  const [search, setSearch] = useState("");
  const [crmQuery, setCrmQuery] = useState("");
  const [crmSourceDraft, setCrmSourceDraft] = useState("");
  const [crmSource, setCrmSource] = useState("");
  const [crmStatus, setCrmStatus] = useState("");
  const [crmSort, setCrmSort] = useState("updated_desc");
  const [crmPage, setCrmPage] = useState(1);
  const [crmHasMore, setCrmHasMore] = useState(false);
  const [crmSummary, setCrmSummary] = useState<CrmSummary | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [savingContact, setSavingContact] = useState(false);
  const [contactNotice, setContactNotice] = useState("");
  const [contactError, setContactError] = useState("");
  const [showTraining, setShowTraining] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [reelPropertySeed, setReelPropertySeed] = useState<WorkspaceReelPropertySeed | null>(null);
  const [socialPropertySeed, setSocialPropertySeed] = useState<WorkspaceSocialPropertySeed | null>(null);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setRequestedTab(query.get("tab"));
    setRequestedArea(query.get("area"));
    setRequestedFocus(query.get("focus"));
    setRequestedTraining(query.get("training"));
  }, [brandKey, routeSearchParams]);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" }).then(async res => res.ok ? res.json() : null)
      .then(body => setOwner(body?.user?.role === "OWNER")).catch(() => setOwner(false));
  }, []);

  useEffect(() => {
    const abort = new AbortController();
    setLoading(true); setError(""); setTab("today"); setShowTraining(requestedTraining === "1"); setPermissions([]); setResponsibilities([]); setContacts([]);
    fetch(`/api/workspaces/${encodeURIComponent(brandKey)}/capabilities`, {
      cache: "no-store", signal: abort.signal,
    }).then(async res => {
      const body = await res.json();
      if (!res.ok) throw new Error(
        res.status === 403 || res.status === 404 ? "Du har ikke tilgang til dette arbeidsområdet."
          : res.status === 401 ? "Du må logge inn for å åpne arbeidsområdet."
          : "Arbeidsområdet er ikke tilgjengelig ennå. Kontroller databaseoppsettet.");
      return body;
    }).then(body => {
      if (!abort.signal.aborted) {
        const nextPermissions = (body.permissions || []) as WorkspacePermission[];
        setPermissions(nextPermissions);
        setResponsibilities(body.responsibilities || []);
        const candidate = tabs.find(item => item.id === requestedTab);
        if (candidate && (!candidate.permitted || candidate.permitted.some(permission => nextPermissions.includes(permission)))) {
          setTab(candidate.id);
        }
      }
    })
      .catch(cause => { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "Kunne ikke åpne arbeidsområdet."); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [brandKey, requestedTab, requestedTraining]);

  async function loadCrm() {
    if (!permissions.includes("crm.read") && !permissions.includes("crm.joint.read")) return;
    setCrmBusy(true); setCrmError("");
    try {
      const endpoint = brandKey === "zeneco" && !permissions.includes("crm.read") ? "joint-contacts" : "contacts";
      const query = new URLSearchParams({
        page: String(crmPage),
        q: crmQuery,
        status: crmStatus,
        source: crmSource,
        sort: crmSort,
      });
      const result = await fetch(`/api/workspaces/${encodeURIComponent(brandKey)}/${endpoint}?${query.toString()}`, { cache: "no-store" });
      if (!result.ok) throw new Error(result.status === 403
        ? "Du har ikke CRM-tilgang i dette arbeidsområdet."
        : result.status === 400 ? "Kontroller CRM-filtrene."
        : "CRM er ikke tilgjengelig ennå.");
      const body = await result.json();
      const nextContacts = Array.isArray(body.contacts) ? body.contacts : [];
      setContacts(nextContacts);
      setSelectedCustomerId(current =>
        current && nextContacts.some((contact: Contact) => contact.id === current) ? current : "");
      setCrmHasMore(Boolean(body.hasMore));
      const summary = body.summary && typeof body.summary === "object" ? body.summary : null;
      setCrmSummary(summary ? {
        matchedCount: Number(summary.matchedCount || 0),
        staleCount: Number(summary.staleCount || 0),
        statusCounts: summary.statusCounts && typeof summary.statusCounts === "object" ? summary.statusCounts : {},
      } : null);
    } catch (cause) {
      setContacts([]); setCrmHasMore(false); setCrmSummary(null);
      setCrmError(cause instanceof Error ? cause.message : "Kunne ikke hente CRM.");
    }
    finally { setCrmBusy(false); }
  }
  useEffect(() => { if (permissions.includes("crm.read") || permissions.includes("crm.joint.read")) void loadCrm(); }, [brandKey, permissions, crmPage, crmQuery, crmStatus, crmSource, crmSort]);
  const filtered = contacts;
  const selectedCustomer = contacts.find(contact => contact.id === selectedCustomerId) || null;
  const visibleTabs = tabs.filter(item => !item.permitted || item.permitted.some(permission => permissions.includes(permission)));
  const title = brandKey === "pinosoecolife" ? "Pinoso EcoLife" : brandKey === "zeneco" ? "Zen Eco Homes" : brandKey;
  const showCrm = permissions.includes("crm.read") || permissions.includes("crm.joint.read");
  const showJointTasks = brandKey === "zeneco" && permissions.includes("crm.joint.read") && permissions.includes("tasks.joint.read");
  const canWriteJointTasks = showJointTasks && permissions.includes("tasks.joint.write");
  const isJointCrm = brandKey === "zeneco" && !permissions.includes("crm.read") && permissions.includes("crm.joint.read");
  const canCreateCrm = permissions.includes("crm.read") && permissions.includes("crm.write");
  const canEditCrm = canCreateCrm || (isJointCrm && permissions.includes("crm.joint.write"));
  const showProperties = permissions.includes("properties.catalog.read");
  const showMarketing = permissions.some(p => p.startsWith("marketing."));
  const showReels = ["zeneco", "pinosoecolife"].includes(brandKey) && permissions.includes("reels.read");
  const showYoutube = brandKey === "zeneco" && permissions.includes("youtube.read");
  const showNexus = permissions.includes("nexus.read");
  const showGrowthTools = permissions.some(p => [
    "corporate.read", "corporate.plan", "visibility.read", "visibility.plan",
    "ads.read", "ads.draft", "events.plan",
    "content.read", "content.edit", "content.publish",
    "email.read", "email.draft", "email.send",
  ].includes(p));
  const showGrowth = showReels || showYoutube || showNexus || showGrowthTools;

  function resetContactForm() {
    setEditingId(null); setFormName(""); setFormEmail(""); setFormPhone("");
    setContactError("");
  }
  async function saveContact() {
    if (!canEditCrm || !formName.trim() || (isJointCrm && !editingId)) return;
    setSavingContact(true); setContactError(""); setContactNotice("");
    try {
      const targetRoute = isJointCrm ? "joint-contacts" : "contacts";
      const result = await fetch(`/api/workspaces/${encodeURIComponent(brandKey)}/${targetRoute}`, {
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
            <Link href={owner ? "/workspaces" : "/workspace"} className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800">
              {owner ? "Arbeidsområder" : "Bytt virksomhet"}
            </Link>
            <button type="button" className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800"
              onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.assign("/login"); }}>Logg ut</button>
          </div>
        </div>
      </header>
      {!loading && !error && <nav className="border-b border-slate-800 px-4" aria-label="Arbeidsområdet">
        <div className="mx-auto flex max-w-5xl gap-1 overflow-x-auto py-2">
          {visibleTabs.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => { setShowTraining(false); setTab(id); }} type="button" aria-current={tab === id ? "page" : undefined}
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
        {!loading && !error && tab === "today" && !showTraining && (
          <section className="space-y-5">
            <div className="rounded-2xl border border-cyan-900/60 bg-cyan-950/15 p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">Arbeidsflate</p>
              <h2 className="mt-2 text-2xl font-bold">Dagens arbeid · {title}</h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-400">
                Du trenger ikke velge modul først. RealtyFlow prioriterer arbeid ut fra rollen din, merkevaren og tilgjengelige signaler.
              </p>
            </div>
            <WorkspaceTodayPriorities
              brandKey={brandKey}
              permissions={permissions}
              responsibilities={responsibilities}
              contactCount={contacts.length}
              onOpen={area => {
                if (area === "training") {
                  setShowTraining(true);
                  setTab("today");
                  return;
                }
                setShowTraining(false);
                setTab(area);
              }}
            />
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Andre oppgaver du har tilgang til</h2>
              <p className="mt-1 text-xs text-slate-500">Bruk disse når dagens prioriterte arbeid ikke er det du skal jobbe med akkurat nå.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {showCrm && <button onClick={() => setTab("leads")} className="rounded-2xl border border-slate-700 bg-slate-900 p-5 text-left hover:border-cyan-500">
                <Users size={25} className="text-cyan-400"/>
                <h3 className="mt-3 text-lg font-semibold">Følg opp kunder og leads</h3>
                <p className="mt-1 text-sm text-slate-400">Åpne én kunde og jobb med kontakt, oppgaver, boligforslag og neste steg samlet.</p>
              </button>}
              {showGrowth && <button onClick={() => setTab("growth")} className="rounded-2xl border border-slate-700 bg-slate-900 p-5 text-left hover:border-cyan-500">
                <TrendingUp size={25} className="text-cyan-400"/>
                <h3 className="mt-3 text-lg font-semibold">{brandKey === "zeneco" && permissions.includes("corporate.read") ? "Jobb med Corporate og vekst" : "Skap mer synlighet og leads"}</h3>
                <p className="mt-1 text-sm text-slate-400">
                  {brandKey === "zeneco" && permissions.includes("corporate.read")
                    ? "Bedrifter, e-post, SEO/GEO/AEO, innhold, annonser, video og informasjonsmøter."
                    : "E-post, SEO/GEO/AEO, innhold, annonser, video og informasjonsmøter."}
                </p>
              </button>}
              {showReels && <button onClick={() => setTab("growth")} className="rounded-2xl border border-cyan-900/60 bg-cyan-950/10 p-5 text-left hover:border-cyan-500">
                <Clapperboard size={25} className="text-cyan-400"/>
                <h3 className="mt-3 text-lg font-semibold">Lag en Reel</h3>
                <p className="mt-1 text-sm text-slate-400">Velg musikk og boligtype. Re-Master lager videoen, og du forhåndsviser før publisering.</p>
              </button>}
              {showYoutube && <button onClick={() => setTab("growth")} className="rounded-2xl border border-red-900/60 bg-red-950/10 p-5 text-left hover:border-red-500">
                <Youtube size={25} className="text-red-400"/>
                <h3 className="mt-3 text-lg font-semibold">Publiser til YouTube</h3>
                <p className="mt-1 text-sm text-slate-400">Velg en ferdig Zen Reel, forhåndsvis den og publiser som YouTube Short til verifisert Zen-kanal.</p>
              </button>}
              {showNexus && <button onClick={() => setTab("growth")} className="rounded-2xl border border-violet-900/60 bg-violet-950/10 p-5 text-left hover:border-violet-500">
                <BrainCircuit size={25} className="text-violet-300"/>
                <h3 className="mt-3 text-lg font-semibold">Se hva Nexus lærer</h3>
                <p className="mt-1 text-sm text-slate-400">Brand-avgrenset innsikt om kilder, læring, vekstplan og hva som faktisk trenger oppmerksomhet.</p>
              </button>}
              {showProperties && <button onClick={() => setTab("properties")} className="rounded-2xl border border-slate-700 bg-slate-900 p-5 text-left hover:border-cyan-500">
                <Building2 size={25} className="text-cyan-400"/>
                <h3 className="mt-3 text-lg font-semibold">Finn riktig bolig</h3>
                <p className="mt-1 text-sm text-slate-400">Søk i publiserte boliger når et lead trenger konkrete forslag.</p>
              </button>}
              {showJointTasks && <button onClick={() => setTab("leads")} className="rounded-2xl border border-slate-700 bg-slate-900 p-5 text-left hover:border-cyan-500">
                <Users size={25} className="text-cyan-400"/>
                <h3 className="mt-3 text-lg font-semibold">Se oppfølgingen min</h3>
                <p className="mt-1 text-sm text-slate-400">Åpne lead-arbeidet og fellesoppgavene på nye Zen-kunder.</p>
              </button>}
              <button onClick={() => setShowTraining(true)} className="rounded-2xl border border-slate-700 bg-slate-900 p-5 text-left hover:border-cyan-500">
                <BookOpen size={25} className="text-cyan-400"/>
                <h3 className="mt-3 text-lg font-semibold">Slik jobber vi</h3>
                <p className="mt-1 text-sm text-slate-400">Forstå merkevaren, arbeidsmåten og hvordan aktivitet blir til leads, møter og salg.</p>
              </button>
            </div>
          </section>
        )}
        {!loading && !error && tab === "today" && showTraining && (
          <section className="space-y-4">
            <button type="button" onClick={() => setShowTraining(false)}
              className="text-sm text-cyan-300 hover:text-cyan-200">← Tilbake til I dag</button>
            <WorkspaceTrainingPanel brandKey={brandKey} permissions={permissions} />
          </section>
        )}
        {!loading && !error && showCrm && tab === "leads" && (
          <section className="space-y-5">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">CRM-arbeidsflate</p>
                  <h2 className="mt-1 text-xl font-semibold">Kunder & leads · {title}</h2>
                  <p className="mt-1 max-w-3xl text-sm text-slate-400">
                    Søk, filtrer og prioriter kundene du faktisk har tilgang til. RealtyFlow viser oppfølgingsbehov og status uten å åpne økonomi eller private CRM-data.
                  </p>
                </div>
                <button className="inline-flex items-center gap-2 text-sm text-cyan-300" onClick={() => void loadCrm()}>
                  <RefreshCw size={15}/> Oppdater
                </button>
              </div>

              {crmSummary && <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Matcher filter</p>
                  <p className="mt-1 text-2xl font-semibold">{crmSummary.matchedCount}</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Bør følges opp</p>
                  <p className="mt-1 text-2xl font-semibold text-amber-300">{crmSummary.staleCount}</p>
                  <p className="mt-1 text-[11px] text-slate-500">Ingen aktivitet registrert siste 7 dager</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">På denne siden</p>
                  <p className="mt-1 text-2xl font-semibold">{contacts.length}</p>
                </div>
              </div>}

              {crmSummary && Object.keys(crmSummary.statusCounts).length > 0 && <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => { setCrmStatus(""); setCrmPage(1); }}
                  className={`rounded-full border px-3 py-1.5 text-xs ${!crmStatus ? "border-cyan-600 bg-cyan-950/30 text-cyan-200" : "border-slate-700 text-slate-400"}`}>
                  Alle · {crmSummary.matchedCount}
                </button>
                {Object.entries(crmSummary.statusCounts).map(([status, count]) => (
                  <button key={status} type="button" onClick={() => {
                    if (crmStatuses.includes(status as typeof crmStatuses[number])) {
                      setCrmStatus(status); setCrmPage(1);
                    }
                  }}
                    className={`rounded-full border px-3 py-1.5 text-xs ${crmStatus === status ? "border-cyan-600 bg-cyan-950/30 text-cyan-200" : "border-slate-700 text-slate-400"}`}>
                    {crmStatusLabels[status] || status} · {count}
                  </button>
                ))}
              </div>}

              <form className="mt-5 space-y-3" onSubmit={event => {
                event.preventDefault();
                setCrmPage(1);
                setCrmQuery(search.trim());
                setCrmSource(crmSourceDraft.trim());
              }}>
                <div className="grid gap-3 lg:grid-cols-[2fr_1fr_1fr_1fr]">
                  <label className="relative block">
                    <Search size={17} className="absolute left-3 top-3 text-slate-500" />
                    <input value={search} onChange={event => setSearch(event.target.value)}
                      placeholder="Navn, e-post eller telefon"
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2.5 pl-10 pr-3 text-sm" />
                  </label>
                  <input value={crmSourceDraft} onChange={event => setCrmSourceDraft(event.target.value)}
                    placeholder="Kilde, f.eks. website"
                    className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm" />
                  <select value={crmStatus} onChange={event => { setCrmStatus(event.target.value); setCrmPage(1); }}
                    className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm">
                    <option value="">Alle statuser</option>
                    {crmStatuses.map(status => <option value={status} key={status}>{crmStatusLabels[status]}</option>)}
                  </select>
                  <select value={crmSort} onChange={event => { setCrmSort(event.target.value); setCrmPage(1); }}
                    className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm">
                    <option value="updated_desc">Nylig oppdatert</option>
                    <option value="updated_asc">Eldst oppdatert</option>
                    <option value="created_desc">Nyeste lead</option>
                    <option value="name_asc">Navn A–Å</option>
                  </select>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="submit" className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white">Bruk filter</button>
                  <button type="button" onClick={() => {
                    setSearch(""); setCrmQuery(""); setCrmSourceDraft(""); setCrmSource("");
                    setCrmStatus(""); setCrmSort("updated_desc"); setCrmPage(1);
                  }} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300">
                    Nullstill
                  </button>
                </div>
              </form>
            </div>

            {selectedCustomer && <div className="rounded-2xl border border-cyan-800/70 bg-cyan-950/15 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">Åpen kunde</p>
                  <h3 className="mt-1 text-xl font-semibold">{selectedCustomer.name || "Uten navn"}</h3>
                  <p className="mt-1 text-sm text-slate-300">
                    {selectedCustomer.email || "Ingen e-post"}{selectedCustomer.phone ? ` · ${selectedCustomer.phone}` : ""}
                  </p>
                </div>
                <button type="button" onClick={() => { setSelectedCustomerId(""); resetContactForm(); }}
                  className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300">Lukk kundekort</button>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                  <p className="text-[11px] uppercase text-slate-500">Status</p>
                  <p className="mt-1 text-sm text-cyan-200">{crmStatusLabels[selectedCustomer.pipeline_status || "UNSET"] || selectedCustomer.pipeline_status || "Uten status"}</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                  <p className="text-[11px] uppercase text-slate-500">Kilde</p>
                  <p className="mt-1 text-sm">{selectedCustomer.source || "Ikke registrert"}</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                  <p className="text-[11px] uppercase text-slate-500">Opprettet</p>
                  <p className="mt-1 text-sm">{crmDate(selectedCustomer.created_at)}</p>
                </div>
                <div className={`rounded-xl border p-3 ${crmIsStale(selectedCustomer.updated_at) ? "border-amber-800 bg-amber-950/20" : "border-slate-800 bg-slate-950/40"}`}>
                  <p className="text-[11px] uppercase text-slate-500">Sist oppdatert</p>
                  <p className={`mt-1 text-sm ${crmIsStale(selectedCustomer.updated_at) ? "text-amber-300" : ""}`}>
                    {crmDate(selectedCustomer.updated_at)}
                  </p>
                  {crmIsStale(selectedCustomer.updated_at) && <p className="mt-1 text-[11px] text-amber-300">Bør vurderes for oppfølging</p>}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {canEditCrm && <button type="button" className="rounded-lg border border-cyan-700 px-3 py-2 text-sm text-cyan-200" onClick={() => {
                  setEditingId(selectedCustomer.id); setFormName(selectedCustomer.name || "");
                  setFormEmail(selectedCustomer.email || ""); setFormPhone(selectedCustomer.phone || "");
                  setContactError(""); setContactNotice("");
                }}>Rediger kontakt</button>}
                {selectedCustomer.email && <a href={`mailto:${selectedCustomer.email}`}
                  className="rounded-lg border border-slate-700 px-3 py-2 text-sm">Send e-post</a>}
                {selectedCustomer.phone && <a href={`tel:${selectedCustomer.phone}`}
                  className="rounded-lg border border-slate-700 px-3 py-2 text-sm">Ring</a>}
                {showProperties && <button type="button" onClick={() => setTab("properties")}
                  className="rounded-lg border border-slate-700 px-3 py-2 text-sm">Finn bolig</button>}
                {permissions.includes("email.read") && <button type="button" onClick={() => setTab("growth")}
                  className="rounded-lg border border-slate-700 px-3 py-2 text-sm">E-post / Reach</button>}
              </div>

              <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/35 p-3 text-xs text-slate-400">
                Kontaktdata: {selectedCustomer.email ? "e-post ✓" : "e-post mangler"} · {selectedCustomer.phone ? "telefon ✓" : "telefon mangler"}.
                RealtyFlow holder arbeidet innenfor {title}; økonomi, private notater og andre merkevarer er ikke eksponert.
              </div>

              {showJointTasks && <div className="mt-5 border-t border-slate-800 pt-5">
                <ZenJointTasks contacts={[selectedCustomer]} canWrite={canWriteJointTasks}
                  selectedContactId={selectedCustomer.id} hideContactSelector />
              </div>}
            </div>}

            {canEditCrm && (canCreateCrm || editingId) && <form className="space-y-3 rounded-xl border border-slate-700 bg-slate-950/70 p-4" onSubmit={event => { event.preventDefault(); void saveContact(); }}>
              <h3 className="font-semibold">{editingId ? "Rediger kunde" : "Legg til kunde"}</h3>
              <p className="text-xs text-slate-400">Kontaktfeltene kan redigeres her. Pipeline-status, private notater og økonomi endres ikke fra medarbeiderflaten.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-slate-300">Navn *<input required maxLength={140} value={formName} onChange={e => setFormName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"/></label>
                <label className="text-xs text-slate-300">E-post<input type="email" maxLength={254} value={formEmail} onChange={e => setFormEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"/></label>
                <label className="text-xs text-slate-300">Telefon<input maxLength={60} value={formPhone} onChange={e => setFormPhone(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"/></label>
              </div>
              {contactNotice && <p role="status" className="text-sm text-emerald-300">{contactNotice}</p>}
              {contactError && <p role="alert" className="text-sm text-amber-300">{contactError}</p>}
              <div className="flex gap-2">
                <button disabled={savingContact || !formName.trim()} type="submit" className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
                  {savingContact ? "Lagrer…" : editingId ? "Lagre endringer" : "Opprett kunde"}
                </button>
                {editingId && <button type="button" onClick={resetContactForm} className="rounded-lg border border-slate-700 px-4 py-2 text-sm">Avbryt</button>}
              </div>
            </form>}

            {crmBusy && <p className="text-sm text-slate-400">Laster CRM…</p>}
            {crmError && <p role="alert" className="text-sm text-amber-300">{crmError}</p>}
            {!crmBusy && !crmError && <div className="space-y-2">
              {filtered.map(contact => {
                const stale = crmIsStale(contact.updated_at);
                return <article key={contact.id}
                  className={`rounded-xl border p-3 ${selectedCustomerId === contact.id ? "border-cyan-600 bg-cyan-950/20" : stale ? "border-amber-900/60 bg-amber-950/10" : "border-slate-800 bg-slate-950/50"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium">{contact.name || "Uten navn"}</h3>
                        {stale && <span className="rounded-full border border-amber-800 px-2 py-0.5 text-[10px] text-amber-300">Oppfølging</span>}
                      </div>
                      <p className="mt-1 text-sm text-slate-400">{contact.email || "Ingen e-post"}{contact.phone ? ` · ${contact.phone}` : ""}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        <span className="text-cyan-300">{crmStatusLabels[contact.pipeline_status || "UNSET"] || contact.pipeline_status || "Uten status"}</span>
                        {contact.source ? ` · ${contact.source}` : ""} · Oppdatert {crmDate(contact.updated_at)}
                      </p>
                    </div>
                    <button type="button" onClick={() => { setSelectedCustomerId(contact.id); resetContactForm(); }}
                      className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-cyan-200">
                      {selectedCustomerId === contact.id ? "Kunde åpnet" : "Åpne kundearbeid"}
                    </button>
                  </div>
                </article>;
              })}
              {filtered.length === 0 && <p className="rounded-xl border border-dashed border-slate-800 p-4 text-sm text-slate-400">
                Ingen kunder matcher søket og filtrene.
              </p>}
            </div>}

            {!crmBusy && !crmError && <div className="flex items-center justify-between gap-3">
              <button type="button" disabled={crmPage === 1} onClick={() => setCrmPage(page => Math.max(1, page - 1))}
                className="rounded-lg border border-slate-700 px-3 py-2 text-sm disabled:opacity-40">Forrige</button>
              <span className="text-xs text-slate-400">Side {crmPage}</span>
              <button type="button" disabled={!crmHasMore || crmPage >= 1000} onClick={() => setCrmPage(page => page + 1)}
                className="rounded-lg border border-slate-700 px-3 py-2 text-sm disabled:opacity-40">Neste</button>
            </div>}

            {!selectedCustomer && showJointTasks && <p className="rounded-xl border border-dashed border-slate-800 p-4 text-sm text-slate-500">
              Åpne en kunde for å samle kontakt, neste handling og felles oppgaver i samme kundekort.
            </p>}
            <p className="text-xs text-slate-500">
              Zen-visningen er fortsatt begrenset til eksplisitt godkjente nye felles leads. Historiske Zen-kunder, private notater og økonomifelt er ikke gjort tilgjengelige.
            </p>
          </section>
        )}
        {!loading && !error && showProperties && tab === "properties" &&
          <WorkspacePropertyCatalogue
            brandKey={brandKey}
            canCreateMarketing={permissions.includes("marketing.draft")}
            canCreateReel={permissions.includes("reels.create")}
            onCreateSocial={(property: WorkspacePropertyCard) => {
              setSocialPropertySeed({
                id: property.id, ref: property.ref, title: property.title,
                town: property.town, location: property.location, primary_image: property.primary_image,
              });
              setTab("growth");
            }}
            onCreateReel={(property: WorkspacePropertyCard) => {
              setReelPropertySeed({
                id: property.id, ref: property.ref, title: property.title,
                town: property.town, location: property.location,
              });
              setTab("growth");
            }}
          />}
        {!loading && !error && (showGrowth || showMarketing) && tab === "growth" &&
          <section className="space-y-5">
            {showGrowthTools && <GrowthCorporatePanel brandKey={brandKey} permissions={permissions} initialArea={requestedArea} />}
            {showNexus && <details id="workspace-focus-nexus" open className="rounded-2xl border border-violet-900/60 bg-slate-900/70">
              <summary className="cursor-pointer list-none p-5">
                <strong className="text-lg text-violet-100">Nexus OS · innsikt</strong>
                <p className="mt-1 text-sm text-slate-400">Se hva Nexus lærer og prioriterer uten tilgang til runtime, autonomy eller utførelse.</p>
              </summary>
              <div className="border-t border-slate-800 p-5">
                <WorkspaceNexusInsightsPanel brandKey={brandKey} />
              </div>
            </details>}
            {showReels && <details id="workspace-focus-reels" open className="rounded-2xl border border-cyan-900/60 bg-slate-900/70">
              <summary className="cursor-pointer list-none p-5">
                <strong className="text-lg text-cyan-100">Reels Studio</strong>
                <p className="mt-1 text-sm text-slate-400">Lag og forhåndsvis Reels uten å åpne Re-Master-admin.</p>
              </summary>
              <div className="border-t border-slate-800 p-5">
                <WorkspaceReelsPanel brandKey={brandKey} canCreate={permissions.includes("reels.create")} canPublish={permissions.includes("reels.publish")}
                  canUseProperties={permissions.includes("properties.catalog.read")}
                  initialProperty={reelPropertySeed} onInitialPropertyConsumed={() => setReelPropertySeed(null)} />
              </div>
            </details>}
            {showYoutube && <details id="workspace-focus-youtube" open className="rounded-2xl border border-red-900/60 bg-slate-900/70">
              <summary className="cursor-pointer list-none p-5">
                <strong className="text-lg text-red-100">YouTube Studio</strong>
                <p className="mt-1 text-sm text-slate-400">Se Zen-kanalen og publiser ferdig Reel som YouTube Short uten kanaladmin.</p>
              </summary>
              <div className="border-t border-slate-800 p-5">
                <WorkspaceYoutubePanel brandKey={brandKey} canPublish={permissions.includes("youtube.publish")} />
              </div>
            </details>}
            {showMarketing && <details id="workspace-focus-social" open={requestedFocus === "social" || Boolean(socialPropertySeed)} className="rounded-2xl border border-cyan-900/60 bg-slate-900/70">
              <summary className="cursor-pointer list-none p-5">
                <strong className="text-lg text-cyan-100">SoMe Studio · Content Hub</strong>
                <p className="mt-1 text-sm text-slate-400">Lag tre varierte Facebook/Instagram-konsepter fra eiendom, guide/magasin eller eget tema — og lagre valgte utkast i Content Hub.</p>
              </summary>
              <div className="border-t border-slate-800 p-5">
                <WorkspaceMarketingPanel
                  brandKey={brandKey}
                  canDraft={permissions.includes("marketing.draft")}
                  initialProperty={socialPropertySeed}
                  onInitialPropertyConsumed={() => setSocialPropertySeed(null)}
                />
              </div>
            </details>}
            {permissions.includes("marketing.publish") && <details className="rounded-2xl border border-cyan-900/60 bg-slate-900/70">
              <summary className="cursor-pointer list-none p-5">
                <strong className="text-lg text-cyan-100">Publiser til sosiale medier</strong>
                <p className="mt-1 text-sm text-slate-400">Velg et eksisterende brand-utkast og publiser bare til de kanalene RealtyFlow har verifisert.</p>
              </summary>
              <div className="border-t border-slate-800 p-5">
                <WorkspaceSocialPublishPanel brandKey={brandKey} />
              </div>
            </details>}
          </section>}
      </main>
    </div>
  );
}
