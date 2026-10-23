"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BarChart3, BookOpen, CalendarDays, FileText, Images, Megaphone, RefreshCw } from "lucide-react";
import { WorkspaceWebsiteContentStudio } from "@/components/workspaces/website-content-studio";
import { WorkspaceMarketingPanel } from "@/components/workspaces/marketing-panel";
import type { WorkspacePermission } from "@/lib/workspaces/brand-policy";

type Section = "articles" | "studio" | "drafts" | "calendar" | "analytics" | "images";
type Publication = {
  id: string;
  title: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  status: string;
  scheduledPlatforms: string[];
  updatedAt: string | null;
  scheduledAt?: string | null;
  publishedAt?: string | null;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
};

const sections: Array<{
  id: Section; title: string; permission: WorkspacePermission; icon: typeof BookOpen;
}> = [
  { id: "articles", title: "Artikler og guider", permission: "content.read", icon: BookOpen },
  { id: "studio", title: "Lag SoMe-innhold", permission: "marketing.read", icon: Megaphone },
  { id: "drafts", title: "Innlegg og historikk", permission: "marketing.read", icon: FileText },
  { id: "calendar", title: "Tidshjul og kalender", permission: "marketing.read", icon: CalendarDays },
  { id: "analytics", title: "Analytics", permission: "marketing.read", icon: BarChart3 },
  { id: "images", title: "Bildebibliotek", permission: "marketing.read", icon: Images },
];

export default function ScopedContentHubPage() {
  const params = useParams<{ brandKey: string }>();
  const brandKey = String(params?.brandKey || "");
  const [permissions, setPermissions] = useState<WorkspacePermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [section, setSection] = useState<Section>("articles");
  const [publications, setPublications] = useState<Publication[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [publicationsLoaded, setPublicationsLoaded] = useState(false);
  const [itemsError, setItemsError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [analyticsSort, setAnalyticsSort] = useState<"views" | "likes" | "comments" | "shares">("views");
  const [selectedPublication, setSelectedPublication] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [calendarView, setCalendarView] = useState<"week" | "month" | "year">("month");
  const [weekAnchor, setWeekAnchor] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (!["zeneco", "pinosoecolife"].includes(brandKey)) {
      setError("Merkevaren er ikke tilgjengelig."); setLoading(false); return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setPermissions([]);
    fetch("/api/workspaces/" + encodeURIComponent(brandKey) + "/capabilities", {
      cache: "no-store", signal: controller.signal,
    }).then(async response => {
      if (!response.ok) throw new Error("Du har ikke tilgang til dette arbeidsområdet.");
      return response.json();
    }).then(result => {
      if (controller.signal.aborted) return;
      const allowed: WorkspacePermission[] = Array.isArray(result.permissions) ? result.permissions : [];
      setPermissions(allowed);
      const fromSocial = new URLSearchParams(window.location.search).get("from") === "social-studio";
      const preferred: Section = fromSocial || allowed.includes("marketing.read") ? "drafts" : "articles";
      if (sections.some(entry => entry.id === preferred && allowed.includes(entry.permission))) setSection(preferred);
      else setSection(sections.find(entry => allowed.includes(entry.permission))?.id || "articles");
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Tilgangen kunne ikke kontrolleres.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [brandKey]);

  const canReadMarketing = permissions.includes("marketing.read");
  const available = useMemo(() => sections.filter(entry => permissions.includes(entry.permission)), [permissions]);

  async function loadPublications(signal?: AbortSignal) {
    if (!canReadMarketing) return;
    setItemsLoading(true);
    setItemsError("");
    try {
      const all: Publication[] = [];
      // Fetch every page, but keep each authenticated request bounded to 100 rows.
      // The API/RPC revalidates the selected brand and marketing.read per page.
      for (let page = 0; page <= 100; page += 1) {
        const response = await fetch(
          "/api/workspaces/" + encodeURIComponent(brandKey) + "/marketing?history=1&page=" + page,
          { cache: "no-store", signal },
        );
        if (!response.ok) throw new Error("Innleggshistorikken kunne ikke hentes.");
        const body = await response.json();
        if (!Array.isArray(body.publications)) throw new Error("Ugyldig svar fra innholdsarkivet.");
        all.push(...body.publications);
        if (!body.hasMore) break;
        if (page === 100) throw new Error("Historikken er større enn arkivgrensen. Kontakt administrator.");
      }
      if (!signal?.aborted) { setPublications(all); setPublicationsLoaded(true); }
    } catch (cause) {
      if (!signal?.aborted) setItemsError(cause instanceof Error ? cause.message : "Feil ved henting av historikken.");
    } finally {
      if (!signal?.aborted) setItemsLoading(false);
    }
  }

  useEffect(() => {
    if (!canReadMarketing) return;
    const controller = new AbortController();
    void loadPublications(controller.signal);
    return () => controller.abort();
    // Updated when selecting the drafts area or changing the selected brand.
  }, [brandKey, canReadMarketing]);

  const filteredPublications = publications.filter(item => statusFilter === "all" || item.status === statusFilter);
  const calendarItems = publications.filter(item => {
    const date = item.scheduledAt || item.publishedAt;
    return date && !Number.isNaN(new Date(date).getTime()) && date.slice(0, 7) === calendarMonth;
  }).sort((a, b) => String(a.scheduledAt || a.publishedAt).localeCompare(String(b.scheduledAt || b.publishedAt)));
  const images = publications.filter(item => item.thumbnailUrl && /^https:\/\//i.test(item.thumbnailUrl))
    .filter((item, index, items) => items.findIndex(other => other.thumbnailUrl === item.thumbnailUrl) === index);
  const total = (key: "views" | "likes" | "comments" | "shares") => publications.reduce((sum, item) => sum + (item[key] || 0), 0);
  const rankedPublications = [...publications].filter(item => item.status === "published")
    .sort((a, b) => (b[analyticsSort] || 0) - (a[analyticsSort] || 0) ||
      String(b.publishedAt || b.updatedAt).localeCompare(String(a.publishedAt || a.updatedAt)));
  const statusCounts = {
    draft: publications.filter(item => item.status === "draft").length,
    scheduled: publications.filter(item => item.status === "scheduled").length,
    published: publications.filter(item => item.status === "published").length,
    failed: publications.filter(item => item.status === "failed").length,
  };
  const year = Number(calendarMonth.slice(0, 4));
  const monthNumber = Number(calendarMonth.slice(5, 7)) - 1;
  const dateKey = (date: Date) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  const calendarDates = (calendarView === "week" ? (() => {
    const monday = new Date(weekAnchor + "T12:00:00");
    monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(monday); day.setDate(day.getDate() + index); return day;
    });
  })() : (() => {
    const first = new Date(year, monthNumber, 1, 12);
    first.setDate(first.getDate() - (first.getDay() + 6) % 7);
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(first); day.setDate(day.getDate() + index); return day;
    });
  })());
  const eventsOn = (day: Date) => publications.filter(item =>
    (item.scheduledAt || item.publishedAt || "").slice(0, 10) === dateKey(day));
  const monthTotals = Array.from({ length: 12 }, (_, index) => ({
    month: index,
    items: publications.filter(item => (item.scheduledAt || item.publishedAt || "").slice(0, 7) ===
      year + "-" + String(index + 1).padStart(2, "0")),
  }));

  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 text-slate-100">
    <header className="space-y-3">
      <Link className="text-sm text-cyan-300 underline" href={"/workspace/" + encodeURIComponent(brandKey) + "?tab=growth&focus=social"}>
        ← Tilbake til arbeidsområdet
      </Link>
      <h1 className="text-3xl font-bold">Innhold og innlegg · {brandKey === "zeneco" ? "Zen Eco Homes" : "PinosoEcolife"}</h1>
      <p className="max-w-3xl text-sm leading-relaxed text-slate-300">
        Arbeid med innhold og publikasjoner for denne merkevaren. Artikler, guider og SoMe bruker egne,
        sikre merkevaretilganger. Ingen systeminnstillinger, økonomi eller andre merkevarers innhold er tilgjengelig her.
      </p>
    </header>

    {loading && <p role="status" className="text-sm text-slate-300">Kontrollerer rettigheter…</p>}
    {error && <p role="alert" className="rounded-xl border border-amber-700 bg-amber-950/20 p-4 text-amber-200">{error}</p>}
    {!loading && !error && available.length === 0 && <p role="alert">Ingen innholdstilgang registrert.</p>}

    {!loading && !error && available.length > 0 && <>
      {canReadMarketing && publicationsLoaded && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {([
          ["Registrerte innlegg", publications.length, "Hele merkevarens innholdshistorikk"],
          ["Publisert", statusCounts.published, "Bekreftet publiserte"],
          ["Utkast", statusCounts.draft, "Ikke publisert ennå"],
          ["Planlagt", statusCounts.scheduled, "Venter på publisering"],
        ] as const).map(([label, value, note]) => <div key={label}
          className="rounded-xl border border-slate-700 bg-slate-900 p-4">
          <p className="text-sm text-slate-400">{label}</p>
          <p className="mt-1 text-2xl font-bold">{value.toLocaleString("nb-NO")}</p>
          <p className="text-xs text-slate-500">{note}</p>
        </div>)}
      </div>}
      <nav aria-label="Content Hub-verktøy" className="flex flex-wrap gap-2">
        {available.map(entry => {
          const Icon = entry.icon;
          return <button key={entry.id} type="button" onClick={() => setSection(entry.id)}
            aria-current={section === entry.id ? "page" : undefined}
            className={"flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm font-semibold transition " +
              (section === entry.id ? "border-cyan-600 bg-cyan-950/40 text-cyan-100" :
                "border-slate-700 bg-slate-900 text-slate-300 hover:border-cyan-700")}>
            <Icon size={18} aria-hidden="true"/>{entry.title}
          </button>;
        })}
      </nav>

      <div className="flex flex-wrap items-center gap-3 border-b border-slate-800 pb-4 text-sm">
        {permissions.includes("ads.read") && <Link href={"/workspace/" + encodeURIComponent(brandKey) + "?tab=growth&area=ads&focus=ads"} className="text-cyan-300 underline">Kampanjer</Link>}
        {permissions.includes("nexus.read") && <Link href={"/workspace/" + encodeURIComponent(brandKey) + "?tab=growth&focus=nexus"} className="text-cyan-300 underline">AI-strategi</Link>}
        <span className="text-xs text-slate-500">Kunde-PDF kommer når en merkevaresikker eksport er klar.</span>
      </div>

      {section === "articles" && permissions.includes("content.read") &&
        <WorkspaceWebsiteContentStudio
          brandKey={brandKey}
          canEdit={permissions.includes("content.edit")}
          canPublish={permissions.includes("content.publish")}
        />}

      {section === "studio" && canReadMarketing &&
        <WorkspaceMarketingPanel brandKey={brandKey} canDraft={permissions.includes("marketing.draft")} />}

      {section === "drafts" && canReadMarketing && <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Innlegg · produsert, planlagt og publisert</h2>
            <p className="mt-1 text-sm text-slate-400">
              Faktiske innlegg fra denne merkevaren. SoMe Studio er hovedverktøyet for å lage og håndtere innlegg.
            </p>
          </div>
          <button type="button" onClick={() => void loadPublications()} disabled={itemsLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800 disabled:opacity-50">
            <RefreshCw size={16}/> Oppdater
          </button>
        </div>
        {itemsLoading && <p role="status">Laster innhold…</p>}
        {itemsError && <p role="alert" className="rounded-xl border border-amber-800 p-4 text-amber-200">{itemsError}</p>}
        {!itemsLoading && !itemsError && publications.length === 0 &&
          <p className="rounded-xl border border-slate-700 p-5">Ingen SoMe-utkast eller publikasjoner ennå.</p>}
        <div className="flex flex-wrap gap-2 text-xs text-slate-300">
          <span className="rounded-full border border-slate-700 px-3 py-1">Publisert: {statusCounts.published}</span>
          <span className="rounded-full border border-slate-700 px-3 py-1">Utkast: {statusCounts.draft}</span>
          <span className="rounded-full border border-slate-700 px-3 py-1">Planlagt: {statusCounts.scheduled}</span>
          <span className="rounded-full border border-slate-700 px-3 py-1">Feilet: {statusCounts.failed}</span>
        </div>
        <label className="flex items-center gap-2 text-sm">Vis
          <select aria-label="Filtrer innlegg etter status" value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 p-2">
            <option value="all">Alle</option><option value="draft">Utkast</option><option value="scheduled">Planlagt</option><option value="processing">Behandles</option><option value="published">Publisert</option><option value="failed">Feilet</option>
          </select>
        </label>
        {!itemsLoading && !itemsError && <div className="grid gap-4 md:grid-cols-2">
          {filteredPublications.map(item => <article key={item.id} className="rounded-xl border border-slate-700 bg-slate-900 p-4">
            <button type="button" onClick={() => setSelectedPublication(current => current === item.id ? null : item.id)} aria-expanded={selectedPublication === item.id} className="mb-3 text-sm font-semibold text-cyan-300 underline">{selectedPublication === item.id ? "Lukk detaljer" : "Åpne innlegg"}</button>
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-semibold">{item.title || "Uten tittel"}</h3>
              <span className="rounded bg-slate-800 px-2 py-1 text-xs">{item.status}</span>
            </div>
            {item.thumbnailUrl && <img src={item.thumbnailUrl} alt="" loading="lazy" className="mt-3 h-44 w-full rounded object-cover"/>}
            <p className={"mt-3 whitespace-pre-wrap text-sm text-slate-300 " + (selectedPublication === item.id ? "" : "line-clamp-3")}>{item.description || "Ingen tekst registrert."}</p>
            {selectedPublication === item.id && <div className="mt-3 rounded-lg border border-slate-700 p-3 text-xs text-slate-300">
              <p>Planlagt: {item.scheduledAt ? new Date(item.scheduledAt).toLocaleString("nb-NO") : "Ikke planlagt"}</p>
              <p>Publisert: {item.publishedAt ? new Date(item.publishedAt).toLocaleString("nb-NO") : "Ikke publisert"}</p>
              <p>Visninger: {item.views || 0} · Liker: {item.likes || 0} · Kommentarer: {item.comments || 0} · Delinger: {item.shares || 0}</p>
              {item.status === "draft" && permissions.includes("marketing.publish") && <button type="button" onClick={() => setSection("studio")} className="mt-3 rounded bg-cyan-700 px-3 py-2 font-semibold text-white">Åpne SoMe Studio</button>}
            </div>}
            <p className="mt-3 text-xs text-slate-400">
              {(item.scheduledPlatforms || []).join(" · ") || "Kanal ikke valgt"}
              {item.updatedAt ? " · " + new Date(item.updatedAt).toLocaleDateString("nb-NO") : ""}
            </p>
          </article>)}
        </div>}
      </section>}

      {section === "calendar" && canReadMarketing && <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-xl font-semibold">Tidshjul og innholdskalender</h2>
            <p className="mt-1 text-sm text-slate-400">Samme uke- og månedsstruktur som i hoved-Content Hub, med en årsoversikt. Viser daterte innlegg for denne merkevaren.</p>
          </div>
          <div className="flex gap-2">
            {(["week", "month", "year"] as const).map(view => <button key={view} type="button"
              onClick={() => setCalendarView(view)}
              aria-pressed={calendarView === view}
              className={"rounded-lg border px-3 py-2 text-sm " + (calendarView === view ? "border-cyan-500 bg-cyan-950 text-cyan-100" : "border-slate-700 text-slate-300")}>
              {view === "week" ? "Uke" : view === "month" ? "Måned" : "Årshjul"}
            </button>)}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {calendarView === "week" ? <>
            <button type="button" aria-label="Forrige uke" onClick={() => {
              const date = new Date(weekAnchor + "T12:00:00"); date.setDate(date.getDate() - 7); setWeekAnchor(dateKey(date));
            }} className="rounded-lg border border-slate-700 px-3 py-2">←</button>
            <label className="text-sm">Uke fra <input type="date" value={weekAnchor}
              onChange={event => setWeekAnchor(event.target.value)} className="ml-2 rounded-lg border border-slate-700 bg-slate-900 p-2"/></label>
            <button type="button" aria-label="Neste uke" onClick={() => {
              const date = new Date(weekAnchor + "T12:00:00"); date.setDate(date.getDate() + 7); setWeekAnchor(dateKey(date));
            }} className="rounded-lg border border-slate-700 px-3 py-2">→</button>
          </> : <>
            <label className="text-sm">{calendarView === "year" ? "År" : "Måned"}
              <input type="month" value={calendarMonth} onChange={event => setCalendarMonth(event.target.value)}
                className="ml-2 rounded-lg border border-slate-700 bg-slate-900 p-2"/>
            </label>
          </>}
          <button type="button" onClick={() => void loadPublications()} disabled={itemsLoading}
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm">Oppdater</button>
        </div>
        {itemsLoading && <p role="status">Henter kalender…</p>}
        {itemsError && <p role="alert">{itemsError}</p>}
        {!itemsLoading && !itemsError && calendarView === "year" && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {monthTotals.map(({ month, items }) => <button key={month} type="button"
            onClick={() => { setCalendarMonth(year + "-" + String(month + 1).padStart(2, "0")); setCalendarView("month"); }}
            className="rounded-xl border border-slate-700 bg-slate-900 p-4 text-left hover:border-cyan-600">
            <p className="font-semibold">{new Date(year, month, 1).toLocaleDateString("nb-NO", { month: "long", year: "numeric" })}</p>
            <p className="mt-2 text-2xl font-bold text-cyan-200">{items.length}</p>
            <p className="text-xs text-slate-400">daterte innlegg · {items.filter(item => item.status === "published").length} publisert</p>
          </button>)}
        </div>}
        {!itemsLoading && !itemsError && calendarView !== "year" && <>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-400">
            {["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"].map(day => <span key={day}>{day}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calendarDates.map(day => {
              const events = eventsOn(day);
              const inMonth = day.getMonth() === monthNumber;
              return <div key={dateKey(day)} className={"min-h-24 rounded-lg border p-1.5 sm:p-2 " +
                (dateKey(day) === dateKey(new Date()) ? "border-cyan-600 bg-cyan-950/30" : "border-slate-800 bg-slate-900") +
                (calendarView === "month" && !inMonth ? " opacity-45" : "")}>
                <p className="mb-1 text-xs font-semibold text-slate-300">{day.getDate()}</p>
                <div className="space-y-1">{events.slice(0, 3).map(item => <button key={item.id} type="button"
                  onClick={() => { setSelectedPublication(item.id); setSection("drafts"); }}
                  title={item.title || "Åpne innlegg"}
                  className="block w-full truncate rounded bg-slate-800 px-1.5 py-1 text-left text-[10px] text-cyan-200 hover:bg-slate-700">
                  {item.title || "Uten tittel"}
                </button>)}
                {events.length > 3 && <p className="text-[10px] text-slate-400">+{events.length - 3} flere</p>}</div>
              </div>;
            })}
          </div>
          <p className="text-xs text-slate-500">Velg et innlegg i kalenderen for å åpne detaljene, inkludert status og publiseringsstatistikk.</p>
        </>}
        {!itemsLoading && !itemsError && calendarItems.length === 0 && calendarView === "month" &&
          <p className="text-sm text-slate-400">Ingen daterte innlegg i denne måneden.</p>}
      </section>}

      {section === "images" && canReadMarketing && <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Bildebibliotek fra innhold</h2>
          <p className="mt-2 text-sm text-slate-400">
            Bilder knyttet til alle registrerte innlegg for denne merkevaren. Velg et bilde for å åpne innlegget det er brukt i.
            Dette er en oversikt over innholdsbilder, ikke hele mediearkivet eller en opplastingsfunksjon.
          </p>
        </div>
        {itemsLoading && <p role="status">Henter bilder…</p>}
        {itemsError && <p role="alert">{itemsError}</p>}
        {!itemsLoading && !itemsError && images.length === 0 && <p className="rounded-lg border border-slate-700 p-4">Ingen bilder registrert i denne innholdsoversikten.</p>}
        {!itemsLoading && !itemsError && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {images.map(item => <button key={item.id} type="button" onClick={() => { setSelectedPublication(item.id); setSection("drafts"); }}
              className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900 text-left hover:border-cyan-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400">
            <img src={item.thumbnailUrl || ""} alt={item.title || "Innholdsbilde"} loading="lazy" className="h-44 w-full object-cover"/>
            <div className="p-3"><p className="truncate text-sm font-semibold">{item.title || "Uten tittel"}</p>
              <p className="mt-1 text-xs text-slate-400">{item.status} · Åpne tilknyttet innlegg</p></div>
          </button>)}
        </div>}
      </section>}

      {section === "analytics" && canReadMarketing && <section className="space-y-4">
        <h2 className="text-xl font-semibold">Analyseoversikt for innhold</h2>
        <p className="text-sm text-slate-400">Samlet historisk innholdsstatistikk for denne merkevaren. Dette er ikke en full kanal- eller leadrapport.</p>
        {itemsLoading && <p role="status">Henter statistikk…</p>}
        {itemsError && <p role="alert">{itemsError}</p>}
        {!itemsLoading && !itemsError && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {([["Visninger", total("views")], ["Liker", total("likes")], ["Kommentarer", total("comments")], ["Delinger", total("shares")]] as const).map(([name, count]) =>
            <div key={name} className="rounded-xl border border-slate-700 bg-slate-900 p-4"><p className="text-sm text-slate-400">{name}</p><p className="mt-2 text-2xl font-bold">{count.toLocaleString("nb-NO")}</p></div>)}
        </div>}
        {!itemsLoading && !itemsError && <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold">Resultater per publisert innlegg</h3>
            <label className="text-sm text-slate-300">Sorter etter
              <select value={analyticsSort} onChange={event => setAnalyticsSort(event.target.value as typeof analyticsSort)}
                className="ml-2 rounded-lg border border-slate-700 bg-slate-900 p-2">
                <option value="views">Visninger</option><option value="likes">Liker</option>
                <option value="comments">Kommentarer</option><option value="shares">Delinger</option>
              </select>
            </label>
          </div>
          <p className="text-xs text-slate-400">Klikk på lenker registreres foreløpig ikke som eget måltall i innholdsarkivet. Visninger, likerklikk, kommentarer og delinger vises når kanaldata er lagret.</p>
          {rankedPublications.length === 0 ? <p className="text-sm text-slate-400">Ingen publiserte innlegg med tilgjengelig historikk.</p> :
            <div className="overflow-x-auto rounded-xl border border-slate-700">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="bg-slate-900 text-slate-300"><tr>
                  <th scope="col" className="p-3">Innlegg</th>
                  <th scope="col" className="p-3 text-right">Visninger</th>
                  <th scope="col" className="p-3 text-right">Liker</th>
                  <th scope="col" className="p-3 text-right">Kommentarer</th>
                  <th scope="col" className="p-3 text-right">Delinger</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-800">{rankedPublications.map(item => <tr key={item.id} className="bg-slate-950/50">
                  <td className="p-3"><button type="button"
                    onClick={() => { setSelectedPublication(item.id); setStatusFilter("all"); setSection("drafts"); }}
                    className="max-w-sm text-left font-semibold text-cyan-300 underline hover:text-cyan-100">
                    {item.title || item.description?.slice(0, 70) || "Uten tittel"}</button>
                    <p className="mt-1 text-xs text-slate-500">{item.publishedAt ? new Date(item.publishedAt).toLocaleDateString("nb-NO") : "Dato ikke registrert"}</p>
                  </td>
                  {(["views", "likes", "comments", "shares"] as const).map(metric =>
                    <td key={metric} className="p-3 text-right tabular-nums">{(item[metric] || 0).toLocaleString("nb-NO")}</td>)}
                </tr>)}</tbody>
              </table>
            </div>}
        </section>}
        {!itemsLoading && !itemsError && <p className="text-sm text-slate-300">Utkast: {publications.filter(item => item.status === "draft").length} · Planlagt: {publications.filter(item => item.status === "scheduled").length} · Publisert: {publications.filter(item => item.status === "published").length} · Feilet: {publications.filter(item => item.status === "failed").length}</p>}
      </section>}
    </>}
  </main>;
}
