"use client";

/**
 * Reach Nyhetsbrev — Hostinger Reach as the marketing e-mail backend.
 *
 * RealtyFlow owns the subscribers (add/delete/list) and drafts the
 * campaigns (news, property price updates, valuable content) with AI in
 * the brand's voice; the actual send happens in the Reach module in
 * hPanel, where the plan can be upgraded per profile. Each brand maps to
 * its own Reach profile = its own sending identity.
 */

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BRANDS } from "@/lib/constants";
import {
  Check, Copy, ExternalLink, Loader2, Mail, RefreshCw, Send, Sparkles, Trash2, UserPlus, Users,
} from "lucide-react";

type ReachProfile = { uuid: string; domain?: string | null; limits?: { subscribers_limit?: number; emails_monthly_limit?: number } };
type ReachContact = { uuid: string; email: string; name?: string | null; surname?: string | null; subscription_status: string; source?: string | null; note?: string | null };
type Draft = { subject: string; preheader?: string; html: string };

const CAMPAIGN_TYPES = [
  { id: "nyhetsbrev", label: "Nyhetsbrev" },
  { id: "kampanje", label: "Kampanje/tilbud" },
  { id: "prisoppdatering", label: "Prisoppdatering boliger" },
  { id: "info", label: "Verdifullt innhold" },
];

export default function ReachPage() {
  const [configured, setConfigured] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<ReachProfile[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [contacts, setContacts] = useState<ReachContact[]>([]);
  const [contactsTotal, setContactsTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [selectedBrand, setSelectedBrand] = useState(BRANDS[0]?.id || "");
  const [savingMapping, setSavingMapping] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newNote, setNewNote] = useState("");
  const [addingContact, setAddingContact] = useState(false);
  const [deletingUuid, setDeletingUuid] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [campaignType, setCampaignType] = useState("nyhetsbrev");
  const [topic, setTopic] = useState("");
  const [includeProperties, setIncludeProperties] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [copied, setCopied] = useState<"subject" | "html" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [overviewRes, contactsRes] = await Promise.all([
        fetch("/api/reach?view=overview"),
        fetch("/api/reach?view=contacts"),
      ]);
      const overview = await overviewRes.json();
      const contactsData = await contactsRes.json();

      if (overview.configured === false) {
        setConfigured(false);
        return;
      }
      if (overview.error) setLoadError(overview.error);
      setProfiles(overview.profiles || []);
      setMapping(overview.mapping || {});
      setContacts(contactsData.contacts || []);
      setContactsTotal(contactsData.total || 0);
    } catch {
      setLoadError("Kunne ikke hente Reach-data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveMapping(profileUuid: string) {
    setSavingMapping(true);
    setActionError(null);
    try {
      const res = await fetch("/api/reach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "map_profile", brand_id: selectedBrand, profile_uuid: profileUuid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kunne ikke lagre mapping.");
      setMapping((prev) => ({ ...prev, [selectedBrand]: profileUuid }));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Kunne ikke lagre mapping.");
    } finally {
      setSavingMapping(false);
    }
  }

  async function addContact() {
    if (!newEmail.trim()) return;
    setAddingContact(true);
    setActionError(null);
    try {
      const res = await fetch("/api/reach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_contact",
          email: newEmail,
          name: newName,
          note: newNote,
          brand_id: selectedBrand,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kunne ikke legge til abonnent.");
      setNewEmail("");
      setNewName("");
      setNewNote("");
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Kunne ikke legge til abonnent.");
    } finally {
      setAddingContact(false);
    }
  }

  async function deleteContact(contact: ReachContact) {
    if (!window.confirm(`Slette ${contact.email} fra Reach?`)) return;
    setDeletingUuid(contact.uuid);
    setActionError(null);
    try {
      const res = await fetch(`/api/reach?uuid=${encodeURIComponent(contact.uuid)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kunne ikke slette.");
      setContacts((prev) => prev.filter((c) => c.uuid !== contact.uuid));
      setContactsTotal((prev) => Math.max(0, prev - 1));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Kunne ikke slette.");
    } finally {
      setDeletingUuid(null);
    }
  }

  async function generateDraft() {
    setGenerating(true);
    setActionError(null);
    setDraft(null);
    try {
      const res = await fetch("/api/reach/campaign-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand_id: selectedBrand,
          campaign_type: campaignType,
          topic,
          include_properties: includeProperties,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kunne ikke generere utkast.");
      setDraft(data.draft);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Kunne ikke generere utkast.");
    } finally {
      setGenerating(false);
    }
  }

  function copyToClipboard(kind: "subject" | "html") {
    if (!draft) return;
    navigator.clipboard.writeText(kind === "subject" ? draft.subject : draft.html);
    setCopied(kind);
    setTimeout(() => setCopied(null), 1600);
  }

  const mappedProfile = mapping[selectedBrand];
  const brandName = BRANDS.find((b) => b.id === selectedBrand)?.name || selectedBrand;

  if (!configured) {
    return (
      <div className="space-y-6">
        <PageHeader />
        <Card>
          <CardContent className="p-10 text-center">
            <Mail size={40} className="mx-auto mb-4 text-amber-400" />
            <h2 className="text-lg font-semibold text-white">Reach er ikke koblet til</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
              Sett <code className="text-amber-300">HOSTINGER_API_TOKEN</code> i Vercel (Production) og redeploy, så aktiveres modulen.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader />

      {loadError && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{loadError}</div>}
      {actionError && <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">{actionError}</div>}

      {/* Brand → Reach-profil */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white"><Send className="h-5 w-5 text-sky-300" />Avsenderidentitet per brand</CardTitle>
          <CardDescription>Hvert brand sender fra sin egen Reach-profil. Nye abonnenter legges automatisk i profilen til valgt brand.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {BRANDS.map((brand) => (
              <button
                key={brand.id}
                onClick={() => setSelectedBrand(brand.id)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  selectedBrand === brand.id
                    ? "border-sky-500/60 bg-sky-500/20 text-sky-100"
                    : "border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-500"
                }`}
              >
                {brand.name}
                {mapping[brand.id] && <Check className="ml-1.5 inline h-3 w-3 text-emerald-400" />}
              </button>
            ))}
          </div>

          {loading ? (
            <p className="text-sm text-slate-500"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Laster Reach-profiler...</p>
          ) : profiles.length === 0 ? (
            <p className="text-sm text-slate-400">
              Ingen Reach-profiler funnet. Opprett profil(er) i{" "}
              <a href="https://hpanel.hostinger.com" target="_blank" rel="noopener noreferrer" className="text-sky-300 underline">hPanel → Reach</a>{" "}
              — én per brand — og last siden på nytt.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {profiles.map((profile) => (
                <button
                  key={profile.uuid}
                  disabled={savingMapping}
                  onClick={() => saveMapping(profile.uuid)}
                  className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                    mappedProfile === profile.uuid
                      ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-100"
                      : "border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-500"
                  }`}
                >
                  <div className="font-semibold">{profile.domain || profile.uuid.slice(0, 8)}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {profile.limits?.subscribers_limit ? `${profile.limits.subscribers_limit} abonnenter · ` : ""}
                    {profile.limits?.emails_monthly_limit ? `${profile.limits.emails_monthly_limit} e-post/mnd` : ""}
                  </div>
                  {mappedProfile === profile.uuid && <div className="mt-1 text-xs font-semibold text-emerald-300">✓ Brukes av {brandName}</div>}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Abonnenter */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white"><Users className="h-5 w-5 text-emerald-300" />Abonnenter ({contactsTotal})</CardTitle>
          <CardDescription>Administreres her — utsending skjer i Reach. Avmeldinger håndteres automatisk av Reach.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-700 bg-slate-950/40 p-4 lg:grid-cols-[1fr_1fr_1fr_150px]">
            <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} type="email" placeholder="E-post *" className="h-10 rounded-lg border border-slate-600 bg-slate-950 px-3 text-sm text-white outline-none focus:border-emerald-500" />
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Navn" className="h-10 rounded-lg border border-slate-600 bg-slate-950 px-3 text-sm text-white outline-none focus:border-emerald-500" />
            <input value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder={`Notat (legges i ${brandName})`} className="h-10 rounded-lg border border-slate-600 bg-slate-950 px-3 text-sm text-white outline-none focus:border-emerald-500" />
            <Button onClick={addContact} disabled={addingContact || !newEmail.trim()} className="h-10 bg-emerald-600 hover:bg-emerald-500">
              {addingContact ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
              Legg til
            </Button>
          </div>

          {loading ? (
            <p className="text-sm text-slate-500">Laster abonnenter...</p>
          ) : contacts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">Ingen abonnenter ennå. Legg til de første over.</div>
          ) : (
            <div className="space-y-1.5">
              {contacts.map((contact) => (
                <div key={contact.uuid} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium text-slate-100">{contact.email}</span>
                    {(contact.name || contact.surname) && <span className="ml-2 text-slate-400">{[contact.name, contact.surname].filter(Boolean).join(" ")}</span>}
                    {contact.note && <span className="ml-2 text-xs text-slate-500">· {contact.note}</span>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge className={contact.subscription_status === "subscribed" ? "bg-emerald-600 text-white" : "bg-slate-700 text-slate-300"}>
                      {contact.subscription_status === "subscribed" ? "Påmeldt" : "Avmeldt"}
                    </Badge>
                    <button onClick={() => deleteContact(contact)} disabled={deletingUuid === contact.uuid} className="p-1.5 text-slate-500 hover:text-red-400">
                      {deletingUuid === contact.uuid ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <Button variant="outline" size="sm" onClick={load} className="border-slate-600 text-slate-300">
            <RefreshCw className="mr-2 h-3.5 w-3.5" />Oppdater liste
          </Button>
        </CardContent>
      </Card>

      {/* Kampanjebygger */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white"><Sparkles className="h-5 w-5 text-fuchsia-300" />Kampanjebygger</CardTitle>
          <CardDescription>AI skriver kampanjen i {brandName} sin stemme — lim inn i Reach og send derfra.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {CAMPAIGN_TYPES.map((type) => (
              <button
                key={type.id}
                onClick={() => setCampaignType(type.id)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                  campaignType === type.id
                    ? "border-fuchsia-500/60 bg-fuchsia-500/20 text-fuchsia-100"
                    : "border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-500"
                }`}
              >
                {type.label}
              </button>
            ))}
          </div>
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            rows={3}
            placeholder="Tema/brief — f.eks. 'Nye energikrav i Spania fra 2027 og hva det betyr for boligkjøpere' eller 'Sommerkampanje: gratis verdivurdering'"
            className="w-full resize-none rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-fuchsia-500"
          />
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={includeProperties} onChange={(e) => setIncludeProperties(e.target.checked)} className="h-4 w-4 accent-fuchsia-500" />
            Inkluder siste boliger fra porteføljen (pris og referanse)
          </label>
          <Button onClick={generateDraft} disabled={generating} className="bg-fuchsia-600 hover:bg-fuchsia-500">
            {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {generating ? "Skriver kampanjen..." : "Generer kampanje"}
          </Button>

          {draft && (
            <div className="space-y-3 rounded-xl border border-slate-700 bg-slate-950/50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-widest text-slate-500">Emnefelt</p>
                  <p className="truncate font-semibold text-white">{draft.subject}</p>
                  {draft.preheader && <p className="truncate text-xs text-slate-400">{draft.preheader}</p>}
                </div>
                <Button size="sm" variant="outline" className="shrink-0 border-slate-600" onClick={() => copyToClipboard("subject")}>
                  {copied === "subject" ? <Check className="mr-1 h-3.5 w-3.5 text-emerald-400" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
                  Kopier emne
                </Button>
              </div>
              <div className="max-h-[420px] overflow-auto rounded-lg border border-slate-800 bg-white p-4">
                <div dangerouslySetInnerHTML={{ __html: draft.html }} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => copyToClipboard("html")} className="bg-emerald-600 hover:bg-emerald-500">
                  {copied === "html" ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
                  Kopier HTML
                </Button>
                <a href="https://hpanel.hostinger.com" target="_blank" rel="noopener noreferrer">
                  <Button size="sm" variant="outline" className="border-sky-500/50 text-sky-200">
                    Åpne Reach og send <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                  </Button>
                </a>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PageHeader() {
  return (
    <div>
      <h1 className="flex items-center gap-3 text-2xl font-bold text-white">
        <Mail className="text-sky-400" size={28} />
        Reach Nyhetsbrev
      </h1>
      <p className="mt-1 text-sm text-slate-400">
        Abonnenter og kampanjer styres her — selve utsendingen skjer fra Reach i Hostinger, med egen avsenderidentitet per brand.
      </p>
    </div>
  );
}
