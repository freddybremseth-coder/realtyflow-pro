"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  Linkedin,
  Loader2,
  Mail,
  Phone,
  Plus,
  Save,
  Target,
  UserRound,
  Users,
} from "lucide-react";

type Contact = {
  id: string;
  name: string;
  title?: string | null;
  buying_role?: string | null;
  seniority?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedin_url?: string | null;
  source_url?: string | null;
  confidence?: string | null;
  status: string;
  is_primary: boolean;
  relationship_status: string;
  influence_level: string;
  professional_relevance?: string | null;
  professional_topics?: string[];
  linkedin_following: boolean;
  linkedin_last_touched_at?: string | null;
};

type Touchpoint = {
  id: string;
  contact_id?: string | null;
  channel: string;
  activity_type: string;
  status: string;
  direction: string;
  owner_email?: string | null;
  due_at?: string | null;
  completed_at?: string | null;
  summary?: string | null;
};

type AccountData = {
  prospect: {
    id: string;
    company_name: string;
    organization_number?: string | null;
    organization_type?: string | null;
    city?: string | null;
    industry?: string | null;
    employee_count?: number | null;
    member_count?: number | null;
    website_url?: string | null;
    linkedin_company_url?: string | null;
    status: string;
    fit_score: number;
    fit_tier: string;
    fit_reasons?: string[];
    evidence_gaps?: string[];
    next_action?: string | null;
  };
  strategy: Record<string, any> | null;
  contacts: Contact[];
  touchpoints: Touchpoint[];
  enrichmentCapabilities: {
    brreg: { available: boolean };
    api1881: { available: boolean; configured: boolean };
    linkedin: { available: boolean; mode: string; scraping: boolean };
  };
};

const MODELS = [
  "Firmabolig",
  "Management retreat",
  "Ansattfordel",
  "Medlemsfordel",
  "Relokasjon",
  "Investering",
  "Kunde-/partnerfordel",
  "Referral partner",
];

function localDateTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export default function CorporateAccountWorkspacePage({
  params,
}: {
  params: Promise<{ brandKey: string; prospectId: string }>;
}) {
  const { brandKey, prospectId } = use(params);
  const [data, setData] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [strategy, setStrategy] = useState({
    stage: "TARGET",
    priority: "P2",
    accountModels: [] as string[],
    objective: "",
    entryAngle: "",
    firstOffer: "",
    accountOwnerEmail: "",
    strategicOwnerEmail: "",
    estimatedValueEur: "",
    targetDate: "",
    nextReviewAt: "",
    notes: "",
    linkedinMotion: "MANUAL_APPROVAL",
  });

  const [contactForm, setContactForm] = useState({
    name: "",
    title: "",
    buyingRole: "",
    seniority: "",
    email: "",
    phone: "",
    linkedinUrl: "",
    sourceUrl: "",
    status: "IDENTIFIED",
    confidence: "MEDIUM",
    relationshipStatus: "NOT_CONTACTED",
    influenceLevel: "UNKNOWN",
    professionalRelevance: "",
    professionalTopics: "",
    isPrimary: false,
    linkedinFollowing: false,
  });

  const [touchpoint, setTouchpoint] = useState({
    contactId: "",
    channel: "LINKEDIN",
    activityType: "FOLLOW_COMPANY",
    ownerEmail: "",
    dueAt: "",
    summary: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/workspaces/${encodeURIComponent(brandKey)}/corporate/${encodeURIComponent(prospectId)}`,
        { cache: "no-store" },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message || body?.error?.code || "Kunne ikke hente Corporate-kontoen.");
      setData(body);
      const saved = body.strategy || {};
      setStrategy({
        stage: String(saved.stage || "TARGET"),
        priority: String(saved.priority || "P2"),
        accountModels: Array.isArray(saved.account_models) ? saved.account_models : [],
        objective: String(saved.objective || ""),
        entryAngle: String(saved.entry_angle || ""),
        firstOffer: String(saved.first_offer || ""),
        accountOwnerEmail: String(saved.account_owner_email || ""),
        strategicOwnerEmail: String(saved.strategic_owner_email || ""),
        estimatedValueEur: saved.estimated_value_eur == null ? "" : String(saved.estimated_value_eur),
        targetDate: String(saved.target_date || ""),
        nextReviewAt: localDateTime(saved.next_review_at),
        notes: String(saved.notes || ""),
        linkedinMotion: String(saved.linkedin_motion || "MANUAL_APPROVAL"),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke hente Corporate-kontoen.");
    } finally {
      setLoading(false);
    }
  }, [brandKey, prospectId]);

  useEffect(() => { void load(); }, [load]);

  const upcomingTouchpoints = useMemo(
    () => (data?.touchpoints || []).filter(item => item.status === "PLANNED"),
    [data?.touchpoints],
  );

  async function post(payload: Record<string, unknown>) {
    const response = await fetch(
      `/api/workspaces/${encodeURIComponent(brandKey)}/corporate/${encodeURIComponent(prospectId)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error?.message || body?.error?.code || "Handlingen feilet.");
    return body;
  }

  async function run1881Enrichment() {
    setBusy("1881"); setError(""); setNotice("");
    try {
      await post({ action: "enrich_1881" });
      setNotice("1881-data er hentet og lagret som kildebevart enrichment. Ingen personer eller meldinger ble opprettet automatisk.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "1881-oppslaget feilet.");
    } finally {
      setBusy("");
    }
  }

  async function saveStrategy() {
    setBusy("strategy"); setError(""); setNotice("");
    try {
      await post({
        action: "save_strategy",
        ...strategy,
        estimatedValueEur: strategy.estimatedValueEur || null,
        nextReviewAt: strategy.nextReviewAt ? new Date(strategy.nextReviewAt).toISOString() : null,
      });
      setNotice("Kontostrategien er lagret.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke lagre strategien.");
    } finally {
      setBusy("");
    }
  }

  async function saveContact() {
    if (!contactForm.name.trim()) {
      setError("Navn på personen mangler.");
      return;
    }
    setBusy("contact"); setError(""); setNotice("");
    try {
      await post({
        action: "save_contact",
        ...contactForm,
        professionalTopics: contactForm.professionalTopics.split(",").map(item => item.trim()).filter(Boolean),
      });
      setNotice("Personen er lagt til i beslutningsgruppen.");
      setContactForm(current => ({
        ...current,
        name: "", title: "", buyingRole: "", seniority: "", email: "", phone: "",
        linkedinUrl: "", sourceUrl: "", professionalRelevance: "", professionalTopics: "",
        isPrimary: false, linkedinFollowing: false, status: "IDENTIFIED",
        relationshipStatus: "NOT_CONTACTED", influenceLevel: "UNKNOWN",
      }));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke lagre personen.");
    } finally {
      setBusy("");
    }
  }

  async function addTouchpoint() {
    setBusy("touchpoint"); setError(""); setNotice("");
    try {
      await post({
        action: "add_touchpoint",
        ...touchpoint,
        dueAt: touchpoint.dueAt ? new Date(touchpoint.dueAt).toISOString() : null,
      });
      setNotice("Kontaktaktiviteten er lagt i planen. Ingenting er sendt automatisk.");
      setTouchpoint(current => ({ ...current, dueAt: "", summary: "" }));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke lagre aktiviteten.");
    } finally {
      setBusy("");
    }
  }

  async function completeTouchpoint(item: Touchpoint) {
    setBusy(item.id); setError(""); setNotice("");
    try {
      await post({ action: "complete_touchpoint", touchpointId: item.id, summary: item.summary || null });
      setNotice("Aktiviteten er markert utført.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke oppdatere aktiviteten.");
    } finally {
      setBusy("");
    }
  }

  if (loading || !data) {
    return <div className="mx-auto max-w-7xl p-6">
      {error
        ? <div className="rounded-2xl border border-rose-800 bg-rose-950/40 p-4 text-sm text-rose-200">{error}</div>
        : <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 size={16} className="animate-spin"/> Henter Corporate Account Workspace…</div>}
    </div>;
  }

  const { prospect } = data;

  return <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
    <header className="rounded-3xl border border-slate-800 bg-slate-900/75 p-5 sm:p-7">
      <Link href={`/workspace/${encodeURIComponent(brandKey)}`} className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-300">
        <ArrowLeft size={14}/> Tilbake til workspace
      </Link>
      <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-cyan-300">
            <Building2 size={16}/> Corporate Account
          </div>
          <h1 className="mt-2 text-3xl font-black text-white">{prospect.company_name}</h1>
          <p className="mt-2 text-sm text-slate-400">
            {[prospect.industry, prospect.city, prospect.organization_number ? `Org.nr. ${prospect.organization_number}` : null].filter(Boolean).join(" · ")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-cyan-950 px-3 py-1.5 font-semibold text-cyan-200">Fit {prospect.fit_tier} · {prospect.fit_score}/100</span>
            <span className="rounded-full bg-slate-800 px-3 py-1.5 text-slate-300">{prospect.status}</span>
            <span className="rounded-full bg-slate-800 px-3 py-1.5 text-slate-300">{strategy.priority}</span>
            <span className="rounded-full bg-slate-800 px-3 py-1.5 text-slate-300">{strategy.stage}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {prospect.website_url && <a href={prospect.website_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200">
            Nettside <ExternalLink size={14}/>
          </a>}
          {prospect.linkedin_company_url && <a href={prospect.linkedin_company_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200">
            LinkedIn <Linkedin size={14}/>
          </a>}
        </div>
      </div>
    </header>

    {error && <div className="rounded-2xl border border-rose-800 bg-rose-950/30 p-4 text-sm text-rose-200">{error}</div>}
    {notice && <div className="rounded-2xl border border-emerald-800 bg-emerald-950/30 p-4 text-sm text-emerald-200">{notice}</div>}

    <section className="grid gap-4 lg:grid-cols-3">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <div className="flex items-center gap-2"><Target size={18} className="text-cyan-300"/><h2 className="font-semibold">Kontostrategi</h2></div>
        <p className="mt-1 text-xs text-slate-500">Hva vil vi oppnå, hvorfor denne kontoen og hvilken inngang skal vi bruke?</p>

        <div className="mt-4 grid gap-3">
          <div className="grid grid-cols-2 gap-2">
            <select value={strategy.stage} onChange={e => setStrategy(s => ({ ...s, stage: e.target.value }))} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
              {["TARGET","RESEARCH","STRATEGY_READY","OUTREACH","ENGAGED","MEETING","BUSINESS_CASE","SHORTLIST","DECISION","NEGOTIATION","WON","LOST"].map(v => <option key={v}>{v}</option>)}
            </select>
            <select value={strategy.priority} onChange={e => setStrategy(s => ({ ...s, priority: e.target.value }))} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
              {["P1","P2","P3"].map(v => <option key={v}>{v}</option>)}
            </select>
          </div>
          <textarea value={strategy.objective} onChange={e => setStrategy(s => ({ ...s, objective: e.target.value }))} rows={3} placeholder="Mål: Hva ønsker vi å oppnå med denne kontoen?" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
          <textarea value={strategy.entryAngle} onChange={e => setStrategy(s => ({ ...s, entryAngle: e.target.value }))} rows={3} placeholder="Inngang: HR, medlemsfordel, firmabolig, ledersamling…" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
          <textarea value={strategy.firstOffer} onChange={e => setStrategy(s => ({ ...s, firstOffer: e.target.value }))} rows={3} placeholder="Første tilbud: f.eks. kostnadsfri Corporate Home Assessment" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <div className="flex items-center gap-2"><Users size={18} className="text-cyan-300"/><h2 className="font-semibold">Salgsmodell</h2></div>
        <div className="mt-4 grid gap-2">
          {MODELS.map(model => <label key={model} className="flex items-center gap-2 rounded-lg border border-slate-800 px-3 py-2 text-sm">
            <input type="checkbox" checked={strategy.accountModels.includes(model)}
              onChange={e => setStrategy(s => ({ ...s, accountModels: e.target.checked ? [...s.accountModels, model] : s.accountModels.filter(v => v !== model) }))}/>
            {model}
          </label>)}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <div className="flex items-center gap-2"><UserRound size={18} className="text-cyan-300"/><h2 className="font-semibold">Ansvar & verdi</h2></div>
        <div className="mt-4 grid gap-3">
          <input value={strategy.accountOwnerEmail} onChange={e => setStrategy(s => ({ ...s, accountOwnerEmail: e.target.value }))} placeholder="Account owner e-post" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
          <input value={strategy.strategicOwnerEmail} onChange={e => setStrategy(s => ({ ...s, strategicOwnerEmail: e.target.value }))} placeholder="Strategisk ansvarlig e-post" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
          <input type="number" min="0" value={strategy.estimatedValueEur} onChange={e => setStrategy(s => ({ ...s, estimatedValueEur: e.target.value }))} placeholder="Estimert verdi €" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
          <label className="text-xs text-slate-500">Måldato<input type="date" value={strategy.targetDate} onChange={e => setStrategy(s => ({ ...s, targetDate: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"/></label>
          <label className="text-xs text-slate-500">Neste strategigjennomgang<input type="datetime-local" value={strategy.nextReviewAt} onChange={e => setStrategy(s => ({ ...s, nextReviewAt: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"/></label>
          <select value={strategy.linkedinMotion} onChange={e => setStrategy(s => ({ ...s, linkedinMotion: e.target.value }))} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
            <option value="MANUAL_APPROVAL">LinkedIn: manuell godkjenning</option>
            <option value="RELATIONSHIP_ONLY">LinkedIn: relasjonsbygging</option>
            <option value="OFF">LinkedIn: av</option>
          </select>
          <textarea value={strategy.notes} onChange={e => setStrategy(s => ({ ...s, notes: e.target.value }))} rows={3} placeholder="Strateginotater" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
          <button type="button" onClick={() => void saveStrategy()} disabled={busy === "strategy"} className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            <Save size={15}/>{busy === "strategy" ? "Lagrer…" : "Lagre strategi"}
          </button>
        </div>
      </div>
    </section>

    <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-semibold"><Users size={18} className="text-cyan-300"/> Decision Unit</h2>
            <p className="mt-1 text-xs text-slate-500">Beslutningstakere, påvirkere og mulige champions.</p>
          </div>
          <span className="text-xs text-slate-500">{data.contacts.length} personer</span>
        </div>

        <div className="mt-4 space-y-3">
          {data.contacts.map(contact => <article key={contact.id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <strong>{contact.name}</strong>
                  {contact.is_primary && <span className="rounded-full bg-cyan-950 px-2 py-0.5 text-[10px] font-semibold text-cyan-300">Primær</span>}
                  {contact.relationship_status === "CHAMPION" && <span className="rounded-full bg-emerald-950 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">Champion</span>}
                </div>
                <p className="mt-1 text-xs text-slate-400">{[contact.title, contact.buying_role, contact.influence_level].filter(Boolean).join(" · ")}</p>
                {contact.professional_relevance && <p className="mt-2 text-sm text-slate-300">{contact.professional_relevance}</p>}
                {contact.professional_topics?.length ? <p className="mt-2 text-xs text-violet-300">Tema: {contact.professional_topics.join(" · ")}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {contact.email && <a href={`mailto:${contact.email}`} className="rounded-lg border border-slate-700 p-2 text-slate-300"><Mail size={14}/></a>}
                {contact.phone && <a href={`tel:${contact.phone}`} className="rounded-lg border border-slate-700 p-2 text-slate-300"><Phone size={14}/></a>}
                {contact.linkedin_url && <a href={contact.linkedin_url} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-700 p-2 text-slate-300"><Linkedin size={14}/></a>}
              </div>
            </div>
          </article>)}
          {!data.contacts.length && <p className="rounded-xl border border-dashed border-slate-800 p-6 text-center text-sm text-slate-500">Ingen personer er lagt til ennå.</p>}
        </div>

        <div className="mt-5 border-t border-slate-800 pt-5">
          <h3 className="text-sm font-semibold">Legg til person</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <input value={contactForm.name} onChange={e => setContactForm(s => ({ ...s, name: e.target.value }))} placeholder="Navn" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
            <input value={contactForm.title} onChange={e => setContactForm(s => ({ ...s, title: e.target.value }))} placeholder="Stilling" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
            <input value={contactForm.email} onChange={e => setContactForm(s => ({ ...s, email: e.target.value }))} placeholder="Jobb-e-post" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
            <input value={contactForm.phone} onChange={e => setContactForm(s => ({ ...s, phone: e.target.value }))} placeholder="Telefon" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
            <input value={contactForm.linkedinUrl} onChange={e => setContactForm(s => ({ ...s, linkedinUrl: e.target.value }))} placeholder="LinkedIn-URL" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
            <input value={contactForm.sourceUrl} onChange={e => setContactForm(s => ({ ...s, sourceUrl: e.target.value }))} placeholder="Kilde-URL (1881, bedriftsside, LinkedIn …)" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
            <select value={contactForm.relationshipStatus} onChange={e => setContactForm(s => ({ ...s, relationshipStatus: e.target.value }))} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
              {["UNKNOWN","NOT_CONTACTED","CONNECTED","ENGAGED","CHAMPION","BLOCKED"].map(v => <option key={v}>{v}</option>)}
            </select>
            <select value={contactForm.influenceLevel} onChange={e => setContactForm(s => ({ ...s, influenceLevel: e.target.value }))} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
              {["UNKNOWN","LOW","MEDIUM","HIGH","DECISION_MAKER"].map(v => <option key={v}>{v}</option>)}
            </select>
            <input value={contactForm.buyingRole} onChange={e => setContactForm(s => ({ ...s, buyingRole: e.target.value }))} placeholder="Kjøpsrolle: HR, CEO, CFO…" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
            <input value={contactForm.professionalTopics} onChange={e => setContactForm(s => ({ ...s, professionalTopics: e.target.value }))} placeholder="Profesjonelle temaer, komma-separert" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
            <textarea value={contactForm.professionalRelevance} onChange={e => setContactForm(s => ({ ...s, professionalRelevance: e.target.value }))} rows={3} placeholder="Hvorfor er denne personen relevant?" className="sm:col-span-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
            <label className="flex items-center gap-2"><input type="checkbox" checked={contactForm.isPrimary} onChange={e => setContactForm(s => ({ ...s, isPrimary: e.target.checked }))}/> Primær kontakt</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={contactForm.linkedinFollowing} onChange={e => setContactForm(s => ({ ...s, linkedinFollowing: e.target.checked }))}/> Følger på LinkedIn</label>
          </div>
          <button type="button" onClick={() => void saveContact()} disabled={busy === "contact"} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-cyan-700 px-4 py-2 text-sm font-semibold text-cyan-200 disabled:opacity-50">
            <Plus size={15}/>{busy === "contact" ? "Lagrer…" : "Legg til person"}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <h2 className="flex items-center gap-2 font-semibold"><CalendarClock size={18} className="text-cyan-300"/> Kontaktplan</h2>
          <p className="mt-1 text-xs text-slate-500">Planlegg e-post, LinkedIn, telefon og møter som én koordinert sekvens.</p>
          <div className="mt-4 grid gap-2">
            <select value={touchpoint.contactId} onChange={e => setTouchpoint(s => ({ ...s, contactId: e.target.value }))} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
              <option value="">Hele bedriften</option>
              {data.contacts.map(contact => <option key={contact.id} value={contact.id}>{contact.name}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <select value={touchpoint.channel} onChange={e => setTouchpoint(s => ({ ...s, channel: e.target.value }))} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
                {["LINKEDIN","EMAIL","CALL","MEETING","OTHER"].map(v => <option key={v}>{v}</option>)}
              </select>
              <select value={touchpoint.activityType} onChange={e => setTouchpoint(s => ({ ...s, activityType: e.target.value }))} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
                {["FOLLOW_COMPANY","VIEW_PROFILE","CONNECT","PERSONAL_MESSAGE","EMAIL_INTRO","EMAIL_FOLLOWUP","CALL","DISCOVERY_MEETING","SEND_MATERIAL"].map(v => <option key={v}>{v}</option>)}
              </select>
            </div>
            <input value={touchpoint.ownerEmail} onChange={e => setTouchpoint(s => ({ ...s, ownerEmail: e.target.value }))} placeholder="Ansvarlig e-post (valgfritt)" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
            <input type="datetime-local" value={touchpoint.dueAt} onChange={e => setTouchpoint(s => ({ ...s, dueAt: e.target.value }))} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
            <textarea value={touchpoint.summary} onChange={e => setTouchpoint(s => ({ ...s, summary: e.target.value }))} rows={3} placeholder="Hva skal gjøres / hvilket budskap?" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
            <button type="button" onClick={() => void addTouchpoint()} disabled={busy === "touchpoint"} className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              <Plus size={15}/>{busy === "touchpoint" ? "Lagrer…" : "Legg i kontaktplan"}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <h2 className="font-semibold">Neste aktiviteter</h2>
          <div className="mt-3 space-y-2">
            {upcomingTouchpoints.map(item => <article key={item.id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
              <div className="flex items-center justify-between gap-2">
                <strong className="text-sm">{item.channel} · {item.activity_type}</strong>
                {item.due_at && <span className="text-[11px] text-slate-500">{new Date(item.due_at).toLocaleString("no-NO")}</span>}
              </div>
              {item.summary && <p className="mt-2 text-xs text-slate-300">{item.summary}</p>}
              <button type="button" onClick={() => void completeTouchpoint(item)} disabled={busy === item.id} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-300">
                <CheckCircle2 size={13}/>{busy === item.id ? "Oppdaterer…" : "Marker utført"}
              </button>
            </article>)}
            {!upcomingTouchpoints.length && <p className="text-sm text-slate-500">Ingen planlagte aktiviteter ennå.</p>}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <h2 className="font-semibold">Datakilder</h2>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between rounded-lg border border-slate-800 px-3 py-2"><span>Brønnøysund</span><span className="text-emerald-300">Klar</span></div>
            <div className="rounded-lg border border-slate-800 px-3 py-2">
              <div className="flex justify-between gap-3"><span>1881 API</span><span className={data.enrichmentCapabilities.api1881.configured ? "text-emerald-300" : "text-amber-300"}>{data.enrichmentCapabilities.api1881.configured ? "Koblet" : "API-credentials mangler"}</span></div>
              <button
                type="button"
                disabled={!data.enrichmentCapabilities.api1881.configured || busy === "1881"}
                onClick={() => void run1881Enrichment()}
                className="mt-2 text-xs font-semibold text-cyan-300 underline disabled:text-slate-600 disabled:no-underline"
              >
                {busy === "1881" ? "Henter…" : "Berik bedriften fra 1881"}
              </button>
            </div>
            <div className="flex justify-between rounded-lg border border-slate-800 px-3 py-2"><span>LinkedIn</span><span className="text-cyan-300">Relasjonskanal</span></div>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">LinkedIn brukes ikke til automatisk profilscraping. Persondata skal være offentlig, relevant for B2B-arbeidet og kildebelagt.</p>
        </div>
      </div>
    </section>
  </div>;
}
