"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, BrainCircuit, Building2, Clapperboard, LockKeyhole, Megaphone, RefreshCw, Search, TrendingUp, Users, Youtube } from "lucide-react";
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
type StaffCustomer360 = {
  contactId: string;
  contact?: { notes?: string | null; property_interest?: string | null; preferred_location?: string | null; next_followup?: string | null };
  buyerProfiles?: Array<{ id: string; status?: string; summary?: string | null }>;
  criteria?: Array<Record<string, unknown>>;
  shortlists?: Array<{ id: string; title?: string; status?: string }>;
  profileCount: number;
  criteriaCount: number;
  shortlistCount: number;
  activityCount: number;
  dialogue: { sentCount: number; replyCount: number; lastSentAt: string | null; lastReplyAt: string | null; awaitingReply: boolean; emailBlocked: boolean; messages?: Array<{ id: string; direction: string; from_address?: string; to_addresses?: string[]; subject?: string; body_text?: string; received_at?: string | null; created_at?: string | null }> };
  activity: Array<{ id: string; kind: string; occurredAt: string }>;
};
type CrmSummary = {
  matchedCount: number;
  staleCount: number;
  statusCounts: Record<string, number>;
};
type Tab = "today" | "leads" | "growth" | "properties";

const crmStatuses = ["NEW", "CONTACT", "QUALIFIED", "MATCHING", "VIEWING", "NEGOTIATION", "RESERVED", "WON", "ON_HOLD", "LOST"] as const;
const crmStatusLabels: Record<string, string> = {
  NEW: "Ny", CONTACT: "Kontakt", QUALIFIED: "Kvalifisert", MATCHING: "Boligmatch", VIEWING: "Visning",
  NEGOTIATION: "Forhandling", RESERVED: "Reservert", WON: "Vunnet", ON_HOLD: "På vent", LOST: "Tapt", UNSET: "Uten status",
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
const tabs: Array<{ id: Tab; label: string; permitted?: WorkspacePermission[] }> = [
  { id: "today", label: "I dag" },
  { id: "leads", label: "Kunder & leads", permitted: ["crm.read", "crm.joint.read", "tasks.joint.read"] },
  { id: "growth", label: "Vekst & innhold", permitted: [
    "marketing.read", "marketing.draft", "marketing.publish",
    "reels.read", "reels.create", "reels.publish",
    "youtube.read", "youtube.publish", "nexus.read",
    "corporate.read", "corporate.plan", "visibility.read", "visibility.plan",
    "ads.read", "ads.draft", "events.plan",
    "content.read", "content.edit", "content.publish",
    "email.read", "email.draft", "email.send",
  ] },
  { id: "properties", label: "Eiendommer", permitted: ["properties.catalog.read"] },
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
  const [ownerPreview, setOwnerPreview] = useState<{
    targetEmail: string;
    targetDisplayName: string;
  } | null>(null);
  const [previewEnding, setPreviewEnding] = useState(false);
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
  const [customer360, setCustomer360] = useState<StaffCustomer360 | null>(null);
  const [customer360Busy, setCustomer360Busy] = useState(false);
  const [customer360Error, setCustomer360Error] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailNotice, setEmailNotice] = useState("");
  const [emailRevision, setEmailRevision] = useState(0);
  const [closingMode, setClosingMode] = useState(false);
  const [reelPropertySeed, setReelPropertySeed] = useState<WorkspaceReelPropertySeed | null>(null);
  const [socialPropertySeed, setSocialPropertySeed] = useState<WorkspaceSocialPropertySeed | null>(null);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setRequestedTab(query.get("tab"));
    setRequestedArea(query.get("area"));
    setRequestedFocus(query.get("focus"));
    setRequestedTraining(query.get("training"));
    setClosingMode(query.get("closing") === "1");
    if (query.get("closing") === "1") { setCrmStatus("NEGOTIATION"); setCrmPage(1); }
  }, [brandKey, routeSearchParams]);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" }).then(async res => res.ok ? res.json() : null)
      .then(body => {
        setOwner(body?.user?.role === "OWNER" || Boolean(body?.preview?.active));
        setOwnerPreview(body?.preview?.active ? {
          targetEmail: String(body.preview.targetEmail || ""),
          targetDisplayName: String(body.preview.targetDisplayName || body.preview.targetEmail || "bruker"),
        } : null);
      }).catch(() => {
        setOwner(false);
        setOwnerPreview(null);
      });
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

  async function stopOwnerPreview() {
    if (!ownerPreview || previewEnding) return;
    setPreviewEnding(true);
    try {
      const response = await fetch("/api/workspace-user-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "STOP" }),
      });
      if (!response.ok) throw new Error("PREVIEW_STOP_FAILED");
      window.location.assign(`/workspace/${encodeURIComponent(brandKey)}?tab=growth&focus=social`);
    } catch {
      setPreviewEnding(false);
    }
  }

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
  useEffect(() => {
    const controller = new AbortController();
    setCustomer360(null); setCustomer360Error("");
    if (!selectedCustomerId || !permissions.some(permission => permission === "crm.read" || permission === "crm.joint.read")) {
      setCustomer360Busy(false);
      return () => controller.abort();
    }
    setCustomer360Busy(true);
    fetch(`/api/workspaces/${encodeURIComponent(brandKey)}/customer360?contactId=${encodeURIComponent(selectedCustomerId)}&view=collaborator`, {
      cache: "no-store", signal: controller.signal,
    }).then(async response => {
      if (!response.ok) throw new Error(response.status === 403
        ? "Denne kundens utvidede oversikt er ikke tilgjengelig med din tilgang."
        : "Kunne ikke hente utvidet kundeoversikt.");
      return response.json();
    }).then((data: StaffCustomer360) => {
      if (!controller.signal.aborted && data.contactId === selectedCustomerId) setCustomer360(data);
    }).catch(cause => {
      if (!controller.signal.aborted) setCustomer360Error(cause instanceof Error ? cause.message : "Kunne ikke hente kundeoversikt.");
    }).finally(() => { if (!controller.signal.aborted) setCustomer360Busy(false); });
    return () => controller.abort();
  }, [brandKey, selectedCustomerId, permissions, emailRevision]);
  useEffect(() => { setEmailSubject(""); setEmailBody(""); setEmailNotice(""); }, [selectedCustomerId]);

  async function sendCustomerEmail() {
    if (!selectedCustomerId || !customer360 || emailSending ||
        !permissions.includes("email.send") || customer360.dialogue.emailBlocked ||
        !emailSubject.trim() || !emailBody.trim()) return;
    const recipient = selectedCustomerId === customer360.contactId
      ? contacts.find(contact => contact.id === selectedCustomerId)?.email : null;
    if (!recipient || !window.confirm(`Send e-post til ${recipient}?\\n\\nEmne: ${emailSubject}\\n\\nE-posten sendes umiddelbart fra merkevarens e-postkonto.`)) return;
    setEmailSending(true); setEmailNotice("");
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(brandKey)}/customer360`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: selectedCustomerId, subject: emailSubject.trim(),
          bodyText: emailBody.trim(), confirmReviewed: true }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message ||
        (response.status === 409 ? "E-posten kan ikke sendes på grunn av kundens kontaktstatus eller avsenderoppsett."
          : "Kunne ikke sende e-post."));
      setEmailSubject(""); setEmailBody(""); setEmailNotice("E-posten er sendt.");
      setEmailRevision(value => value + 1);
    } catch (cause) { setEmailNotice(cause instanceof Error ? cause.message : "Kunne ikke sende e-post."); }
    finally { setEmailSending(false); }
  }
  const filtered = contacts;
  const selectedCustomer = contacts.find(contact => contact.id === selectedCustomerId) || null;
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
      <main className="mx-auto max-w-5xl space-y-5 px-4 py-7">
        {ownerPreview && <div role="status" className="rounded-2xl border border-amber-600/70 bg-amber-950/30 p-4 text-amber-100">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-amber-300">Forhåndsvisning · skrivebeskyttet</p>
              <p className="mt-1 text-sm">
                Du ser RealtyFlow som <strong>{ownerPreview.targetDisplayName}</strong>
                {ownerPreview.targetEmail ? ` · ${ownerPreview.targetEmail}` : ""}. Tilganger og moduler følger denne brukeren, ikke eierrollen din.
              </p>
            </div>
            <button type="button" disabled={previewEnding} onClick={() => void stopOwnerPreview()}
              className="rounded-lg border border-amber-500/80 bg-amber-900/20 px-4 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-900/40 disabled:opacity-50">
              {previewEnding ? "Avslutter…" : "Avslutt forhåndsvisning og åpne som eier"}
            </button>
          </div>
        </div>}
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
              {showMarketing && <button onClick={() => {
                setRequestedFocus("social");
                setTab("growth");
                window.setTimeout(() => document.getElementById("workspace-focus-social")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
              }} className="rounded-2xl border border-cyan-900/60 bg-cyan-950/10 p-5 text-left hover:border-cyan-500">
                <Megaphone size={25} className="text-cyan-300"/>
                <h3 className="mt-3 text-lg font-semibold">SoMe Studio</h3>
                <p className="mt-1 text-sm text-slate-400">Lag tre forskjellige Facebook/Instagram-konsepter fra bolig, guide/magasin eller eget tema.</p>
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
              {showReels && <button onClick={() => { setRequestedFocus("reels"); setTab("growth"); }} className="rounded-2xl border border-cyan-900/60 bg-cyan-950/10 p-5 text-left hover:border-cyan-500">
                <Clapperboard size={25} className="text-cyan-400"/>
                <h3 className="mt-3 text-lg font-semibold">Lag en Reel</h3>
                <p className="mt-1 text-sm text-slate-400">Velg musikk og boligtype. Re-Master lager videoen, og du forhåndsviser før publisering.</p>
              </button>}
              {showYoutube && <button onClick={() => { setRequestedFocus("youtube"); setTab("growth"); }} className="rounded-2xl border border-red-900/60 bg-red-950/10 p-5 text-left hover:border-red-500">
                <Youtube size={25} className="text-red-400"/>
                <h3 className="mt-3 text-lg font-semibold">Publiser til YouTube</h3>
                <p className="mt-1 text-sm text-slate-400">Velg en ferdig Zen Reel, forhåndsvis den og publiser som YouTube Short til verifisert Zen-kanal.</p>
              </button>}
              {showNexus && <button onClick={() => { setRequestedFocus("nexus"); setTab("growth"); }} className="rounded-2xl border border-violet-900/60 bg-violet-950/10 p-5 text-left hover:border-violet-500">
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
                  <h2 className="mt-1 text-xl font-semibold">{closingMode ? "Closing Workspace" : "Kunder & leads"} · {title}</h2>
                  <p className="mt-1 max-w-3xl text-sm text-slate-400">
                    Søk, filtrer og prioriter kundene du faktisk har tilgang til. RealtyFlow viser oppfølgingsbehov og status uten å åpne økonomi eller private CRM-data.
                  </p>
                </div>
                <button className="inline-flex items-center gap-2 text-sm text-cyan-300" onClick={() => void loadCrm()}>
                  <RefreshCw size={15}/> Oppdater
                </button>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => { setClosingMode(false); setCrmStatus(""); setCrmPage(1); }}
                  className={`rounded-lg border px-3 py-2 text-sm ${!closingMode ? "border-cyan-600 text-cyan-200" : "border-slate-700"}`}>Alle kunder / Customer 360</button>
                <button type="button" onClick={() => { setClosingMode(true); setCrmStatus("NEGOTIATION"); setCrmPage(1); }}
                  className={`rounded-lg border px-3 py-2 text-sm ${closingMode ? "border-cyan-600 text-cyan-200" : "border-slate-700"}`}>Closing Workspace</button>
              </div>
              {closingMode && <div className="mt-3 rounded-xl border border-cyan-900 bg-cyan-950/15 p-4 text-sm text-slate-300">
                <p className="font-medium text-cyan-200">Følg kunden frem til overtakelse</p>
                <p className="mt-1">Velg Forhandling, Reservert eller Vunnet i statusfilteret. Åpne kundekortet for kontakt, aktivitet og oppgaver. Denne arbeidsflaten viser ikke kontraktsdokumenter eller økonomi.</p>
              </div>}
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

              {isJointCrm && <p className="mt-3 text-sm font-semibold text-cyan-200">Ansvarlig rådgiver: Freddy Bremseth</p>}

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
                {permissions.includes("email.read") && <button type="button" onClick={() => { setRequestedFocus("email"); setRequestedArea("email"); setTab("growth"); }}
                  className="rounded-lg border border-slate-700 px-3 py-2 text-sm">E-post / Reach</button>}
              </div>

              <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/35 p-3 text-xs text-slate-400">
                Kontaktdata: {selectedCustomer.email ? "e-post ✓" : "e-post mangler"} · {selectedCustomer.phone ? "telefon ✓" : "telefon mangler"}.
                RealtyFlow holder arbeidet innenfor {title}. Økonomi og andre merkevarer er ikke eksponert.
              </div>

              <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                <h4 className="font-semibold text-cyan-200">Customer 360 · komplett kundedialog</h4>
                {customer360Busy && <p className="mt-2 text-sm text-slate-400">Henter oversikt…</p>}
                {customer360Error && <p className="mt-2 text-sm text-amber-300" role="status">{customer360Error}</p>}
                {customer360 && <>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-lg bg-slate-900 p-3"><p className="text-xs text-slate-400">Kjøperprofiler</p><p className="text-xl font-semibold">{customer360.profileCount}</p></div>
                    <div className="rounded-lg bg-slate-900 p-3"><p className="text-xs text-slate-400">Boligkriterier</p><p className="text-xl font-semibold">{customer360.criteriaCount}</p></div>
                    <div className="rounded-lg bg-slate-900 p-3"><p className="text-xs text-slate-400">Boliglister</p><p className="text-xl font-semibold">{customer360.shortlistCount}</p></div>
                    <div className="rounded-lg bg-slate-900 p-3"><p className="text-xs text-slate-400">Nylig aktivitet</p><p className="text-xl font-semibold">{customer360.activityCount}</p></div>
                  </div>
                  <p className="mt-3 text-sm text-slate-300">E-post: {customer360.dialogue.sentCount} sendt · {customer360.dialogue.replyCount} mottatt
                    {customer360.dialogue.awaitingReply ? " · Venter på svar" : ""}
                    {customer360.dialogue.emailBlocked ? " · E-postkontakt sperret" : ""}</p>
                  <p className="mt-1 text-xs text-slate-400">Siste sendte: {crmDate(customer360.dialogue.lastSentAt)} · siste svar: {crmDate(customer360.dialogue.lastReplyAt)}</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-slate-800 p-3">
                      <p className="text-xs font-semibold uppercase text-slate-400">Kjøperprofil og behov</p>
                      <p className="mt-2 text-sm">Interessert i: {customer360.contact?.property_interest || "Ikke registrert"}</p>
                      <p className="mt-1 text-sm">Område: {customer360.contact?.preferred_location || "Ikke registrert"}</p>
                      <p className="mt-1 text-sm">Neste oppfølging: {crmDate(customer360.contact?.next_followup)}</p>
                      {(customer360.buyerProfiles || []).map(profile => <p key={profile.id} className="mt-2 text-sm text-slate-300">{profile.status || "Profil"}: {profile.summary || "Ingen oppsummering"}</p>)}
                      {(customer360.shortlists || []).map(list => <p key={list.id} className="mt-1 text-xs text-cyan-200">Boligliste: {list.title || "Uten navn"} · {list.status || "Utkast"}</p>)}
                    </div>
                    <div className="rounded-lg border border-slate-800 p-3">
                      <p className="text-xs font-semibold uppercase text-slate-400">Kundenotater</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{customer360.contact?.notes || "Ingen notater registrert."}</p>
                    </div>
                  </div>
                  <div className="mt-4 border-t border-slate-800 pt-4">
                    <h5 className="font-semibold text-cyan-200">E-posthistorikk med innhold</h5>
                    {(customer360.dialogue.messages || []).length === 0 ? <p className="mt-2 text-sm text-slate-400">Ingen tilknyttede e-poster.</p>
                      : <div className="mt-3 max-h-[600px] space-y-3 overflow-y-auto">
                          {(customer360.dialogue.messages || []).map(message => <article key={message.id} className="rounded-lg border border-slate-700 bg-slate-900 p-3">
                            <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-400">
                              <span>{message.direction === "outbound" ? "Sendt" : "Mottatt"} · {message.from_address || "Ukjent avsender"}</span>
                              <span>{crmDate(message.received_at || message.created_at)}</span>
                            </div>
                            <p className="mt-2 font-semibold">{message.subject || "(Uten emne)"}</p>
                            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-300">{message.body_text || "Ingen tekst tilgjengelig."}</p>
                          </article>)}
                        </div>}
                  </div>
                  {permissions.includes("email.send") && <form className="mt-4 space-y-3 rounded-xl border border-cyan-900/50 bg-cyan-950/10 p-4"
                    onSubmit={event => { event.preventDefault(); void sendCustomerEmail(); }}>
                    <h5 className="font-semibold text-cyan-200">Ny e-post til kunden</h5>
                    <p className="text-xs text-slate-400">Sendes manuelt etter bekreftelse fra merkevarens aktive e-postkonto. Ingen automatisk sending.</p>
                    <input aria-label="Emne" placeholder="Emne" value={emailSubject} maxLength={240}
                      onChange={event => setEmailSubject(event.target.value)} required disabled={emailSending || customer360.dialogue.emailBlocked}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
                    <textarea aria-label="E-posttekst" placeholder="Skriv e-posten…" value={emailBody} maxLength={16000} rows={7}
                      onChange={event => setEmailBody(event.target.value)} required disabled={emailSending || customer360.dialogue.emailBlocked}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
                    <button type="submit" disabled={emailSending || customer360.dialogue.emailBlocked || !emailSubject.trim() || !emailBody.trim()}
                      className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{emailSending ? "Sender…" : "Send e-post"}</button>
                    {emailNotice && <p role="status" className="text-sm text-slate-300">{emailNotice}</p>}
                  </form>}
                  <div className="mt-3 border-t border-slate-800 pt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Aktivitetshistorikk</p>
                    {customer360.activity.length ? <ul className="mt-2 space-y-1 text-sm text-slate-300">
                      {customer360.activity.map(item => <li key={item.id}>{crmDate(item.occurredAt)} · {item.kind === "mail" ? "E-post" : item.kind === "task" ? "Oppgave" : item.kind === "portal" ? "Kundeportal" : "Kontaktaktivitet"}</li>)}
                    </ul> : <p className="mt-2 text-sm text-slate-500">Ingen registrert aktivitet.</p>}
                  </div>
                </>}
              </div>

              {closingMode && <div className="mt-5 rounded-xl border border-cyan-900/60 p-4">
                <h4 className="font-semibold text-cyan-200">Neste steg i salgsprosessen</h4>
                <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-slate-300">
                  <li>Bekreft kundens valg og avklar åpne spørsmål.</li>
                  <li>Følg opp reservasjon, dokumentasjon og ansvarlig rådgiver.</li>
                  <li>Avtal neste kontakt og kontroller status før overtakelse.</li>
                </ol>
                {showJointTasks ? <p className="mt-2 text-xs text-slate-400">Velg et forslag nedenfor for å lage en lagret oppgave med frist. Oppgavens fullføring vises i fremdriftsoversikten.</p>
                  : <p className="mt-2 text-xs text-slate-500">Denne sjekklisten er foreløpig veiledende. Oppgaveadministrasjon er ennå ikke åpnet for denne merkevaren.</p>}
              </div>}

              {showJointTasks && <div className="mt-5 border-t border-slate-800 pt-5">
                <ZenJointTasks contacts={[selectedCustomer]} canWrite={canWriteJointTasks}
                  selectedContactId={selectedCustomer.id} hideContactSelector closingMode={closingMode} />
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
                      {isJointCrm && <p className="mt-1 text-xs text-cyan-300">Ansvarlig: Freddy Bremseth · Felles Zen Eco Homes-lead</p>}
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
               setRequestedFocus("social");
              setTab("growth");
            }}
            onCreateReel={(property: WorkspacePropertyCard) => {
              setReelPropertySeed({
                id: property.id, ref: property.ref, title: property.title,
                town: property.town, location: property.location,
              });
               setRequestedFocus("reels");
              setTab("growth");
            }}
          />}
        {!loading && !error && (showGrowth || showMarketing) && tab === "growth" &&
          <section className="space-y-5">
            {showMarketing && (!requestedFocus || requestedFocus === "social") && <details id="workspace-focus-social" open={requestedFocus === "social" || Boolean(socialPropertySeed)} className="scroll-mt-24 rounded-2xl border border-cyan-900/60 bg-slate-900/70">
              <summary className="cursor-pointer list-none p-5">
                <strong className="text-lg text-cyan-100">SoMe Studio</strong>
                <p className="mt-1 text-sm text-slate-400">Lag og vurder tre Facebook/Instagram-konsepter. Når du lagrer, finner du utkastene i Content Hub for redigering, planlegging og publisering.</p>
              </summary>
              <div className="border-t border-slate-800 p-4 sm:p-5">
                <WorkspaceMarketingPanel
                  brandKey={brandKey}
                  canDraft={permissions.includes("marketing.draft")}
                  initialProperty={socialPropertySeed}
                  onInitialPropertyConsumed={() => setSocialPropertySeed(null)}
                />
              </div>
            </details>}
            {showGrowthTools && (!requestedFocus || ["corporate", "content", "email", "visibility", "ads", "plan"].includes(requestedFocus)) && <GrowthCorporatePanel key={requestedArea || requestedFocus || "growth"} brandKey={brandKey} permissions={permissions} initialArea={requestedArea} />}
            {showNexus && (!requestedFocus || requestedFocus === "nexus") && <details id="workspace-focus-nexus" open className="rounded-2xl border border-violet-900/60 bg-slate-900/70">
              <summary className="cursor-pointer list-none p-5">
                <strong className="text-lg text-violet-100">Nexus OS · innsikt</strong>
                <p className="mt-1 text-sm text-slate-400">Se hva Nexus lærer og prioriterer uten tilgang til runtime, autonomy eller utførelse.</p>
              </summary>
              <div className="border-t border-slate-800 p-5">
                <WorkspaceNexusInsightsPanel brandKey={brandKey} />
              </div>
            </details>}
            {showReels && (!requestedFocus || requestedFocus === "reels") && <details id="workspace-focus-reels" open className="rounded-2xl border border-cyan-900/60 bg-slate-900/70">
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
            {showYoutube && (!requestedFocus || requestedFocus === "youtube") && <details id="workspace-focus-youtube" open className="rounded-2xl border border-red-900/60 bg-slate-900/70">
              <summary className="cursor-pointer list-none p-5">
                <strong className="text-lg text-red-100">YouTube Studio</strong>
                <p className="mt-1 text-sm text-slate-400">Se Zen-kanalen og publiser ferdig Reel som YouTube Short uten kanaladmin.</p>
              </summary>
              <div className="border-t border-slate-800 p-5">
                <WorkspaceYoutubePanel brandKey={brandKey} canPublish={permissions.includes("youtube.publish")} />
              </div>
            </details>}
            
            {permissions.includes("marketing.publish") && (!requestedFocus || requestedFocus === "publish") && <details className="rounded-2xl border border-cyan-900/60 bg-slate-900/70">
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
