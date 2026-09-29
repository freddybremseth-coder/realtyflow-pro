"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, FileText, Mail, Megaphone, RefreshCw, Search, Video } from "lucide-react";
import { WorkspaceWebsiteContentStudio } from "@/components/workspaces/website-content-studio";
import { WorkspaceEmailReachPanel, type WorkspaceEmailHandoff } from "@/components/workspaces/email-reach-panel";
import { corporateOutreachTemplates, personalizeCorporateOutreach } from "@/lib/corporate-outreach";
import { buildCorporatePartnerOutreach } from "@/lib/corporate-partner-outreach";
import type { WorkspacePermission } from "@/lib/workspaces/brand-policy";

type CorporateRow = {
  id: string; companyName: string; status: string; fitScore: number; fitTier: string;
  city?: string | null; industry?: string | null; nextAction?: string | null;
  websiteUrl?: string | null; partnerType?: string | null; referralAngle?: string | null;
};
type Visibility = {
  searchDiscovery?: Array<{ source: string; arrivals: number }>;
  topPaths?: Array<{ path: string; arrivals: number }>;
  seoWork?: Array<{ id: string; title: string; status: string; priority: string; nextAction?: string | null }>;
  seoSam?: {
    collectedAt?: string | null;
    gsc?: { status?: string | null; error?: string | null; result?: unknown } | null;
    diagnostics?: Array<{ kind?: string; title?: string; category?: string; finding?: string; evidence?: string; nextStep?: string }>;
  } | null;
};
type AdRow = {
  id: string; name: string; productName: string; status: string; growthGoal?: string | null;
  targetMarkets?: string[] | null; totalCreatives?: number | null; estimatedCostUsd?: number | null;
};
type Planned = {
  id: string; kind: string; title: string; status: string; priority: string;
  dueDate?: string | null; nextAction?: string | null; sourceId?: string | null;
};
type GrowthData = {
  corporate: { prospects?: CorporateRow[]; partners?: CorporateRow[] } | null;
  visibility: Visibility | null;
  ads: AdRow[] | null;
  plannedWork: Planned[];
};
type WorkArea = "corporate" | "content" | "email" | "visibility" | "ads" | "plan";

const kindLabels: Record<string, string> = {
  corporate: "Corporate research / neste steg",
  seo: "SEO",
  geo: "GEO · generativ søk",
  aeo: "AEO · svarmotorer",
  keywords: "Søkeord",
  content: "Tekst / landingsside",
  ads: "Annonsebrief / annonseutkast",
  video: "Video",
  info_meeting: "Informasjonsmøte / webinar",
};

export function GrowthCorporatePanel({
  brandKey,
  permissions,
}: {
  brandKey: string;
  permissions: WorkspacePermission[];
}) {
  const [data, setData] = useState<GrowthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [kind, setKind] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [sourceId, setSourceId] = useState("");
  const [area, setArea] = useState<WorkArea>("corporate");
  const [emailHandoff, setEmailHandoff] = useState<WorkspaceEmailHandoff | null>(null);

  const allowedKinds = useMemo(() => {
    const values: string[] = [];
    if (brandKey === "zeneco" && permissions.includes("corporate.plan")) values.push("corporate");
    if (permissions.includes("visibility.plan")) values.push("seo", "geo", "aeo", "keywords", "content");
    if (permissions.includes("ads.draft")) values.push("ads");
    if (permissions.includes("events.plan")) values.push("video", "info_meeting");
    return values;
  }, [brandKey, permissions]);

  const availableAreas = useMemo(() => {
    const values: WorkArea[] = [];
    if (brandKey === "zeneco" && permissions.includes("corporate.read")) values.push("corporate");
    if (permissions.includes("content.read")) values.push("content");
    if (permissions.includes("email.read")) values.push("email");
    if (permissions.includes("visibility.read")) values.push("visibility");
    if (permissions.includes("ads.read")) values.push("ads");
    if (allowedKinds.length > 0) values.push("plan");
    return values;
  }, [brandKey, permissions, allowedKinds]);

  useEffect(() => {
    if (!allowedKinds.includes(kind)) setKind(allowedKinds[0] || "");
  }, [allowedKinds, kind]);

  useEffect(() => {
    if (!availableAreas.includes(area)) {
      setArea(availableAreas[0] || "plan");
    }
  }, [availableAreas, area]);

  const needsGrowthSnapshot = permissions.some(permission => [
    "corporate.read", "corporate.plan", "visibility.read", "visibility.plan",
    "ads.read", "ads.draft", "events.plan",
  ].includes(permission));

  function corporatePlanPreset(row: CorporateRow, targetType: "corporate" | "partner") {
    const status = String(row.status || "").toUpperCase();

    if (targetType === "partner") {
      if (status === "CONTACTED") {
        return {
          label: "Planlegg partneroppfølging",
          title: `Følg opp partner · ${row.companyName}`,
          description: "Første partnerhenvendelse er sendt. Avklar om virksomheten ønsker en kort samtale om henvisninger, webinar, medlemsopplegg eller annet samarbeid.",
          nextAction: row.nextAction || "Følg opp den første partnerhenvendelsen og avklar interesse for en kort partnersamtale.",
        };
      }
      if (status === "ENGAGED") {
        return {
          label: "Forbered partnersamtale",
          title: `Partnersamtale · ${row.companyName}`,
          description: "Partneren har vist interesse. Forbered en kort samtale med samarbeidsvinkel, målgruppe, introduksjonsmodell og tydelig ansvarsdeling.",
          nextAction: row.nextAction || "Forbered partnersamtalen og avklar neste konkrete samarbeidstest.",
        };
      }
      return {
        label: "Lag arbeidsoppgave",
        title: `Corporate partner · ${row.companyName}`,
        description: row.referralAngle || "Planlegg neste kontrollerte steg for partnerprospektet.",
        nextAction: row.nextAction || "",
      };
    }

    if (status === "CONTACTED") {
      return {
        label: "Planlegg oppfølging",
        title: `Følg opp Corporate · ${row.companyName}`,
        description: "Første Corporate-henvendelse er sendt. Følg opp uten å gjenta budskapet og styr mot et tydelig ja/nei til en kort behovsavklaring.",
        nextAction: row.nextAction || "Følg opp første henvendelse og avklar om selskapet ønsker et Corporate Home Assessment.",
      };
    }
    if (status === "ENGAGED") {
      return {
        label: "Forbered discovery-møte",
        title: `Corporate discovery · ${row.companyName}`,
        description: "Forbered mål, brukere, budsjett, tidslinje, beslutningsprosess og ønsket boligmodell. Ingen møteinvitasjon sendes fra denne oppgaven.",
        nextAction: row.nextAction || "Forbered discovery-møte og samle det som mangler til Corporate Home Assessment.",
      };
    }
    if (status === "MEETING") {
      return {
        label: "Forbered registrert møte",
        title: `Møteforberedelse · ${row.companyName}`,
        description: "Møte er registrert. Samle selskapets mål, brukergruppe, budsjett, beslutningstakere, tidslinje og spørsmål som må avklares.",
        nextAction: row.nextAction || "Gjør Corporate discovery klar før det registrerte møtet.",
      };
    }
    if (status === "OPPORTUNITY") {
      return {
        label: "Forbered Decision Pack",
        title: `Decision Pack · ${row.companyName}`,
        description: "Selskapet er en aktiv opportunity. Samle beslutningskriterier, relevant shortlist, kostnadsbilde og åpne avklaringer før neste beslutningspunkt.",
        nextAction: row.nextAction || "Forbered Decision Pack med beslutningskriterier og relevante boligalternativer.",
      };
    }
    return {
      label: "Lag arbeidsoppgave",
      title: `Corporate · ${row.companyName}`,
      description: "Planlegg neste kontrollerte steg for Corporate-prospektet.",
      nextAction: row.nextAction || "",
    };
  }

  function prepareCorporateWork(row: CorporateRow, targetType: "corporate" | "partner") {
    if (!permissions.includes("corporate.plan")) return;
    const preset = corporatePlanPreset(row, targetType);
    setKind("corporate");
    setSourceId(row.id);
    setTitle(preset.title);
    setDescription(preset.description);
    setNextAction(preset.nextAction);
    setArea("plan");
    setNotice("");
    setError("");
  }

  function prepareCorporateEmail(row: CorporateRow, targetType: "corporate" | "partner") {
    if (!permissions.includes("email.draft")) return;

    const prepared = targetType === "partner"
      ? buildCorporatePartnerOutreach({
          company_name: row.companyName,
          partner_type: row.partnerType || "other",
          referral_angle: row.referralAngle || null,
        })[0]
      : personalizeCorporateOutreach(corporateOutreachTemplates[0], {
          firstName: null,
          companyName: row.companyName,
        });

    setEmailHandoff({
      targetType,
      targetId: row.id,
      subject: prepared.subject,
      bodyText: prepared.body,
      sourceLabel: row.companyName,
    });
    setArea("email");
    setNotice("");
    setError("");
  }

  async function load() {
    setLoading(true); setError("");
    if (!needsGrowthSnapshot) {
      setData({ corporate: null, visibility: null, ads: null, plannedWork: [] });
      setLoading(false);
      return;
    }
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(brandKey)}/growth`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(response.status === 403
        ? "Du har ikke Growth/Corporate-tilgang i dette arbeidsområdet."
        : "Growth/Corporate-data kunne ikke hentes.");
      setData({
        corporate: body.corporate || null,
        visibility: body.visibility || null,
        ads: Array.isArray(body.ads) ? body.ads : null,
        plannedWork: Array.isArray(body.plannedWork) ? body.plannedWork : [],
      });
    } catch (cause) {
      setData(null);
      setError(cause instanceof Error ? cause.message : "Growth/Corporate-data kunne ikke hentes.");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [brandKey, needsGrowthSnapshot]);

  async function createWork() {
    if (!kind || !title.trim() || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(brandKey)}/growth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind, title: title.trim(), description: description.trim(),
          nextAction: nextAction.trim(), dueDate: dueDate || null,
          priority, sourceId: sourceId.trim(),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(
        response.status === 403 ? "Du har ikke rettighet til denne typen arbeid."
          : response.status === 400 ? "Kontroller oppgavetypen og feltene."
          : "Arbeidsoppgaven kunne ikke opprettes.",
      );
      setNotice("Arbeidsoppgaven er opprettet. Ingen publisering, utsending, invitasjon eller annonsebruk er startet.");
      setTitle(""); setDescription(""); setNextAction(""); setDueDate(""); setSourceId("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Arbeidsoppgaven kunne ikke opprettes.");
    } finally { setBusy(false); }
  }

  if (loading) return <p className="text-sm text-slate-400">Laster Growth & Corporate…</p>;

  return <section className="space-y-5">
    {error && <p role="alert" className="rounded-xl border border-amber-800 bg-amber-950/30 p-4 text-sm text-amber-200">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-emerald-800 bg-emerald-950/25 p-4 text-sm text-emerald-200">{notice}</p>}

    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">Velg hva du vil gjøre</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {availableAreas.includes("corporate") && <button type="button" onClick={() => setArea("corporate")}
          className={`rounded-xl border p-4 text-left ${area === "corporate" ? "border-cyan-500 bg-cyan-950/30" : "border-slate-800 bg-slate-950/50 hover:border-slate-600"}`}>
          <Building2 size={20} className="text-cyan-400"/><strong className="mt-2 block text-sm">Finn og jobb med bedrifter</strong>
          <span className="mt-1 block text-xs text-slate-500">Corporate Homes og partnerkanaler</span>
        </button>}
        {availableAreas.includes("content") && <button type="button" onClick={() => setArea("content")}
          className={`rounded-xl border p-4 text-left ${area === "content" ? "border-cyan-500 bg-cyan-950/30" : "border-slate-800 bg-slate-950/50 hover:border-slate-600"}`}>
          <FileText size={20} className="text-cyan-400"/><strong className="mt-2 block text-sm">Lag eller forbedre nettsideinnhold</strong>
          <span className="mt-1 block text-xs text-slate-500">Artikler, guider, søkeord og publisering</span>
        </button>}
        {availableAreas.includes("email") && <button type="button" onClick={() => setArea("email")}
          className={`rounded-xl border p-4 text-left ${area === "email" ? "border-cyan-500 bg-cyan-950/30" : "border-slate-800 bg-slate-950/50 hover:border-slate-600"}`}>
          <Mail size={20} className="text-cyan-400"/><strong className="mt-2 block text-sm">Følg opp med e-post / Reach</strong>
          <span className="mt-1 block text-xs text-slate-500">Godkjente leads, Corporate og kampanjeutkast</span>
        </button>}
        {availableAreas.includes("visibility") && <button type="button" onClick={() => setArea("visibility")}
          className={`rounded-xl border p-4 text-left ${area === "visibility" ? "border-cyan-500 bg-cyan-950/30" : "border-slate-800 bg-slate-950/50 hover:border-slate-600"}`}>
          <Search size={20} className="text-cyan-400"/><strong className="mt-2 block text-sm">Forbedre Google & AI-søk</strong>
          <span className="mt-1 block text-xs text-slate-500">SEO, GEO, AEO, søkeord og tekster</span>
        </button>}
        {availableAreas.includes("ads") && <button type="button" onClick={() => setArea("ads")}
          className={`rounded-xl border p-4 text-left ${area === "ads" ? "border-cyan-500 bg-cyan-950/30" : "border-slate-800 bg-slate-950/50 hover:border-slate-600"}`}>
          <Megaphone size={20} className="text-cyan-400"/><strong className="mt-2 block text-sm">Jobb med annonser</strong>
          <span className="mt-1 block text-xs text-slate-500">Se kampanjer og lag neste annonsebrief</span>
        </button>}
        {availableAreas.includes("plan") && <button type="button" onClick={() => setArea("plan")}
          className={`rounded-xl border p-4 text-left ${area === "plan" ? "border-cyan-500 bg-cyan-950/30" : "border-slate-800 bg-slate-950/50 hover:border-slate-600"}`}>
          <Video size={20} className="text-cyan-400"/><strong className="mt-2 block text-sm">Planlegg neste aktivitet</strong>
          <span className="mt-1 block text-xs text-slate-500">Video, webinar, møte, SEO eller Corporate</span>
        </button>}
      </div>
    </div>

    {area === "corporate" && data?.corporate && <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold"><Building2 size={19}/> Corporate Homes</h2>
          <p className="mt-1 text-xs text-slate-400">Bedrifter og partnerkanaler for Zen Eco Homes. Ingen automatisk kontakt eller statusendring.</p>
        </div>
        <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 text-sm text-cyan-300"><RefreshCw size={15}/> Oppdater</button>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-cyan-200">Bedriftsprospekter · {data.corporate.prospects?.length || 0}</h3>
          <div className="mt-2 max-h-[420px] space-y-2 overflow-y-auto">
            {(data.corporate.prospects || []).map(row => <article key={row.id} className="rounded-xl border border-slate-800 bg-slate-950/55 p-3">
              <div className="flex justify-between gap-3"><strong className="text-sm">{row.companyName}</strong><span className="text-xs text-cyan-300">{row.fitTier} · {row.fitScore}</span></div>
              <p className="mt-1 text-xs text-slate-400">{[row.city,row.industry,row.status].filter(Boolean).join(" · ")}</p>
              {row.nextAction && <p className="mt-2 text-xs text-slate-300">Neste: {row.nextAction}</p>}
              {<div className="mt-2 flex flex-wrap gap-3">
                {permissions.includes("email.draft") && <button type="button" className="text-xs font-semibold text-cyan-300 underline"
                  onClick={() => prepareCorporateEmail(row, "corporate")}>
                  Lag e-postutkast
                </button>}
                {permissions.includes("corporate.plan") && <button type="button" className="text-xs text-cyan-300 underline"
                  onClick={() => prepareCorporateWork(row, "corporate")}>
                  {corporatePlanPreset(row, "corporate").label}
                </button>}
              </div>}
            </article>)}
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-cyan-200">Partnerprospekter · {data.corporate.partners?.length || 0}</h3>
          <div className="mt-2 max-h-[420px] space-y-2 overflow-y-auto">
            {(data.corporate.partners || []).map(row => <article key={row.id} className="rounded-xl border border-slate-800 bg-slate-950/55 p-3">
              <div className="flex justify-between gap-3"><strong className="text-sm">{row.companyName}</strong><span className="text-xs text-cyan-300">{row.fitTier} · {row.fitScore}</span></div>
              <p className="mt-1 text-xs text-slate-400">{[row.partnerType,row.city,row.status].filter(Boolean).join(" · ")}</p>
              {row.referralAngle && <p className="mt-2 text-xs text-slate-300">{row.referralAngle}</p>}
              {<div className="mt-2 flex flex-wrap gap-3">
                {permissions.includes("email.draft") && <button type="button" className="text-xs font-semibold text-cyan-300 underline"
                  onClick={() => prepareCorporateEmail(row, "partner")}>
                  Lag e-postutkast
                </button>}
                {permissions.includes("corporate.plan") && <button type="button" className="text-xs text-cyan-300 underline"
                  onClick={() => prepareCorporateWork(row, "partner")}>
                  {corporatePlanPreset(row, "partner").label}
                </button>}
              </div>}
            </article>)}
          </div>
        </div>
      </div>
    </div>}

    {area === "content" && <WorkspaceWebsiteContentStudio
      brandKey={brandKey}
      canEdit={permissions.includes("content.edit")}
      canPublish={permissions.includes("content.publish")}
    />}

    {area === "email" && <WorkspaceEmailReachPanel
      brandKey={brandKey}
      canDraft={permissions.includes("email.draft")}
      canSend={permissions.includes("email.send")}
      initialDirectDraft={emailHandoff}
      onInitialDirectDraftConsumed={() => setEmailHandoff(null)}
    />}

    {area === "visibility" && data?.visibility && <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <h2 className="flex items-center gap-2 text-xl font-semibold"><Search size={19}/> SEO · GEO · AEO · søkeord</h2>
      <p className="mt-1 text-xs text-slate-400">Førsteparts søke-/AI-henvisninger og aktive SEO-oppgaver for denne merkevaren.</p>
      {permissions.includes("visibility.plan") && <button type="button"
        onClick={() => { setKind("seo"); setTitle("Forbedre synlighet"); setArea("plan"); }}
        className="mt-3 rounded-lg bg-cyan-600 px-3 py-2 text-xs font-semibold text-white">
        Lag SEO / GEO / AEO-oppgave
      </button>}
      {data.visibility.seoSam && <div className="mt-4 rounded-xl border border-cyan-900/60 bg-cyan-950/15 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-cyan-200">SEO Sam · siste brand-status</h3>
          {data.visibility.seoSam.collectedAt && <span className="text-[11px] text-slate-500">{new Date(data.visibility.seoSam.collectedAt).toLocaleString("no-NO")}</span>}
        </div>
        {data.visibility.seoSam.gsc && <p className={`mt-2 text-xs ${data.visibility.seoSam.gsc.status === "success" ? "text-emerald-300" : "text-amber-300"}`}>
          Google Search Console: {data.visibility.seoSam.gsc.status || "ukjent"}
          {data.visibility.seoSam.gsc.error ? ` · ${data.visibility.seoSam.gsc.error}` : ""}
        </p>}
        <div className="mt-3 space-y-2">
          {(data.visibility.seoSam.diagnostics || []).map((item, index) => <article key={index} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-xs">
            <strong>{item.title || item.category || "SEO-funn"}</strong>
            {item.finding && <p className="mt-1 text-slate-300">{item.finding}</p>}
            {item.nextStep && <p className="mt-1 text-cyan-300">Neste: {item.nextStep}</p>}
          </article>)}
        </div>
      </div>}
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-950/55 p-4">
          <h3 className="text-sm font-semibold">Søk/AI siste 30 dager</h3>
          <div className="mt-2 space-y-1 text-xs text-slate-300">{(data.visibility.searchDiscovery || []).map(row =>
            <div key={row.source} className="flex justify-between gap-2"><span>{row.source}</span><strong>{row.arrivals}</strong></div>)}
            {!data.visibility.searchDiscovery?.length && <span className="text-slate-500">Ingen målte henvisninger.</span>}
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/55 p-4">
          <h3 className="text-sm font-semibold">Topp landingssider</h3>
          <div className="mt-2 space-y-1 text-xs text-slate-300">{(data.visibility.topPaths || []).slice(0,10).map(row =>
            <div key={row.path} className="flex justify-between gap-2"><span className="truncate">{row.path}</span><strong>{row.arrivals}</strong></div>)}
            {!data.visibility.topPaths?.length && <span className="text-slate-500">Ingen målte sider ennå.</span>}
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/55 p-4">
          <h3 className="text-sm font-semibold">SEO-oppgaver</h3>
          <div className="mt-2 space-y-2 text-xs">{(data.visibility.seoWork || []).slice(0,10).map(row =>
            <div key={row.id}><strong>{row.title}</strong><div className="text-slate-500">{row.priority} · {row.status}</div></div>)}
            {!data.visibility.seoWork?.length && <span className="text-slate-500">Ingen aktive SEO-oppgaver.</span>}
          </div>
        </div>
      </div>
    </div>}

    {area === "ads" && data?.ads && <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <h2 className="flex items-center gap-2 text-xl font-semibold"><Megaphone size={19}/> Annonser</h2>
      <p className="mt-1 text-xs text-slate-400">Kampanjeoversikt. Denne medarbeiderflaten kan ikke starte spend eller publisering.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">{data.ads.map(row =>
        <article key={row.id} className="rounded-xl border border-slate-800 bg-slate-950/55 p-4">
          <div className="flex justify-between gap-3"><strong>{row.name}</strong><span className="text-xs text-cyan-300">{row.status}</span></div>
          <p className="mt-1 text-xs text-slate-400">{row.productName}{row.growthGoal ? ` · ${row.growthGoal}` : ""}</p>
          {permissions.includes("ads.draft") && <button type="button" className="mt-2 text-xs text-cyan-300 underline"
            onClick={() => { setKind("ads"); setSourceId(row.id); setTitle(`Annonse · ${row.name}`); setArea("plan"); }}>
            Lag ny annonseoppgave
          </button>}
        </article>)}
        {data.ads.length === 0 && <p className="text-sm text-slate-500">Ingen kampanjer for denne merkevaren.</p>}
      </div>
    </div>}

    {area === "plan" && allowedKinds.length > 0 && <form onSubmit={event => { event.preventDefault(); void createWork(); }}
      className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <h2 className="flex items-center gap-2 text-xl font-semibold"><Video size={19}/> Hva skal gjøres?</h2>
      <p className="mt-1 text-xs text-slate-400">Beskriv neste konkrete aktivitet. RealtyFlow legger den i arbeidslisten din.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-xs text-slate-300">Type
          <select value={kind} onChange={e => setKind(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
            {allowedKinds.map(value => <option key={value} value={value}>{kindLabels[value] || value}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-300">Prioritet
          <select value={priority} onChange={e => setPriority(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
            <option value="LOW">Lav</option><option value="MEDIUM">Medium</option><option value="HIGH">Høy</option><option value="CRITICAL">Kritisk</option>
          </select>
        </label>
        <label className="text-xs text-slate-300 md:col-span-2">Tittel *
          <input required maxLength={180} value={title} onChange={e => setTitle(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
        </label>
        <label className="text-xs text-slate-300 md:col-span-2">Beskrivelse
          <textarea rows={4} maxLength={4000} value={description} onChange={e => setDescription(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
        </label>
        <label className="text-xs text-slate-300">Neste handling
          <input maxLength={1000} value={nextAction} onChange={e => setNextAction(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
        </label>
        <label className="text-xs text-slate-300">Frist
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
        </label>
      </div>
      <button type="submit" disabled={busy || !kind || !title.trim()}
        className="mt-4 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
        {busy ? "Oppretter…" : "Opprett arbeidsoppgave"}
      </button>
    </form>}

    {area === "plan" && <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <h2 className="text-xl font-semibold">Mine neste oppgaver</h2>
      <div className="mt-3 space-y-2">{(data?.plannedWork || []).map(row =>
        <article key={row.id} className="rounded-xl border border-slate-800 bg-slate-950/55 p-3">
          <div className="flex justify-between gap-3"><strong className="text-sm">{row.title}</strong><span className="text-xs text-cyan-300">{kindLabels[row.kind] || row.kind}</span></div>
          <p className="mt-1 text-xs text-slate-500">{row.priority} · {row.status}{row.dueDate ? ` · frist ${row.dueDate}` : ""}</p>
          {row.nextAction && <p className="mt-2 text-xs text-slate-300">{row.nextAction}</p>}
        </article>)}
        {!data?.plannedWork.length && <p className="text-sm text-slate-500">Ingen egne Growth-oppgaver ennå.</p>}
      </div>
    </div>}
  </section>;
}
