"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BarChart3, BookOpen, CalendarDays, FileText, Images, Megaphone, RefreshCw, Send } from "lucide-react";
import { WorkspaceWebsiteContentStudio } from "@/components/workspaces/website-content-studio";
import { WorkspaceMarketingPanel } from "@/components/workspaces/marketing-panel";
import { WorkspaceSocialPublishPanel } from "@/components/workspaces/social-publish-panel";
import type { WorkspacePermission } from "@/lib/workspaces/brand-policy";

type Section = "articles" | "studio" | "drafts" | "publish" | "calendar" | "analytics" | "images";
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
  { id: "drafts", title: "SoMe-utkast og historikk", permission: "marketing.read", icon: FileText },
  { id: "publish", title: "Publiser", permission: "marketing.publish", icon: Send },
  { id: "calendar", title: "Innholdskalender", permission: "marketing.read", icon: CalendarDays },
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
  const [itemsError, setItemsError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedPublication, setSelectedPublication] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().toISOString().slice(0, 7));

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
      const preferred: Section = fromSocial ? "drafts" : "articles";
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
      const response = await fetch("/api/workspaces/" + encodeURIComponent(brandKey) + "/marketing", {
        cache: "no-store", signal,
      });
      if (!response.ok) throw new Error("SoMe-utkastene kunne ikke hentes.");
      const body = await response.json();
      if (!signal?.aborted) setPublications(Array.isArray(body.publications) ? body.publications : []);
    } catch (cause) {
      if (!signal?.aborted) setItemsError(cause instanceof Error ? cause.message : "Feil ved henting av utkast.");
    } finally {
      if (!signal?.aborted) setItemsLoading(false);
    }
  }

  useEffect(() => {
    if (!canReadMarketing || !["drafts", "calendar", "analytics", "images"].includes(section)) return;
    const controller = new AbortController();
    void loadPublications(controller.signal);
    return () => controller.abort();
    // Updated when selecting the drafts area or changing the selected brand.
  }, [brandKey, canReadMarketing, section]);

  const filteredPublications = publications.filter(item => statusFilter === "all" || item.status === statusFilter);
  const calendarItems = publications.filter(item => {
    const date = item.scheduledAt || item.publishedAt;
    return date && !Number.isNaN(new Date(date).getTime()) && date.slice(0, 7) === calendarMonth;
  }).sort((a, b) => String(a.scheduledAt || a.publishedAt).localeCompare(String(b.scheduledAt || b.publishedAt)));
  const images = publications.filter(item => item.thumbnailUrl && /^https:\/\//i.test(item.thumbnailUrl))
    .filter((item, index, items) => items.findIndex(other => other.thumbnailUrl === item.thumbnailUrl) === index);
  const total = (key: "views" | "likes" | "comments" | "shares") => publications.reduce((sum, item) => sum + (item[key] || 0), 0);

  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 text-slate-100">
    <header className="space-y-3">
      <Link className="text-sm text-cyan-300 underline" href={"/workspace/" + encodeURIComponent(brandKey) + "?tab=growth&focus=social"}>
        ← Tilbake til arbeidsområdet
      </Link>
      <h1 className="text-3xl font-bold">Content Hub · {brandKey === "zeneco" ? "Zen Eco Homes" : "PinosoEcolife"}</h1>
      <p className="max-w-3xl text-sm leading-relaxed text-slate-300">
        Arbeid med innhold og publikasjoner for denne merkevaren. Artikler, guider og SoMe bruker egne,
        sikre merkevaretilganger. Ingen systeminnstillinger, økonomi eller andre merkevarers innhold er tilgjengelig her.
      </p>
    </header>

    {loading && <p role="status" className="text-sm text-slate-300">Kontrollerer rettigheter…</p>}
    {error && <p role="alert" className="rounded-xl border border-amber-700 bg-amber-950/20 p-4 text-amber-200">{error}</p>}
    {!loading && !error && available.length === 0 && <p role="alert">Ingen innholdstilgang registrert.</p>}

    {!loading && !error && available.length > 0 && <>
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

      {section === "articles" && permissions.includes("content.read") &&
        <WorkspaceWebsiteContentStudio
          brandKey={brandKey}
          canEdit={permissions.includes("content.edit")}
          canPublish={permissions.includes("content.publish")}
        />}

      {section === "studio" && canReadMarketing &&
        <WorkspaceMarketingPanel brandKey={brandKey} canDraft={permissions.includes("marketing.draft")} />}

      {section === "publish" && permissions.includes("marketing.publish") &&
        <WorkspaceSocialPublishPanel brandKey={brandKey}/>}

      {section === "drafts" && canReadMarketing && <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">SoMe-utkast og historikk</h2>
            <p className="mt-1 text-sm text-slate-400">
              Utkastene kan opprettes i SoMe Studio. Godkjente workspace-utkast kan publiseres under «Publiser SoMe».
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
              {item.status === "draft" && permissions.includes("marketing.publish") && <button type="button" onClick={() => setSection("publish")} className="mt-3 rounded bg-cyan-700 px-3 py-2 font-semibold text-white">Gå til publisering</button>}
            </div>}
            <p className="mt-3 text-xs text-slate-400">
              {(item.scheduledPlatforms || []).join(" · ") || "Kanal ikke valgt"}
              {item.updatedAt ? " · " + new Date(item.updatedAt).toLocaleDateString("nb-NO") : ""}
            </p>
          </article>)}
        </div>}
      </section>}

      {section === "calendar" && canReadMarketing && <section className="space-y-4">
        <h2 className="text-xl font-semibold">Innholdskalender</h2>
        <p className="text-sm text-slate-400">Viser innlegg som har en registrert planlagt eller faktisk publiseringsdato. Utkast uten dato vises i Innhold.</p>
        <label className="flex items-center gap-2 text-sm">Måned
          <input type="month" value={calendarMonth} onChange={event => setCalendarMonth(event.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 p-2"/>
        </label>
        {itemsLoading && <p role="status">Henter kalender…</p>}
        {itemsError && <p role="alert">{itemsError}</p>}
        {!itemsLoading && !itemsError && calendarItems.length === 0 && <p className="rounded-lg border border-slate-700 p-4">Ingen daterte innlegg denne måneden.</p>}
        <div className="space-y-2">
          {calendarItems.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900 p-4">
            <div><p className="text-xs text-cyan-300">{new Date(item.scheduledAt || item.publishedAt || "").toLocaleString("nb-NO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
              <strong>{item.title || "Uten tittel"}</strong><p className="text-xs text-slate-400">{item.status} · {(item.scheduledPlatforms || []).join(", ")}</p></div>
            <button type="button" onClick={() => { setSelectedPublication(item.id); setSection("drafts"); }} className="rounded-lg border border-cyan-700 px-3 py-2 text-sm text-cyan-200">Åpne innlegg</button>
          </div>)}
        </div>
      </section>}

      {section === "images" && canReadMarketing && <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Bildebibliotek fra innhold</h2>
          <p className="mt-2 text-sm text-slate-400">
            Bilder knyttet til de siste opptil 60 innleggene for denne merkevaren. Velg et bilde for å åpne innlegget det er brukt i.
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
        <p className="text-sm text-slate-400">Registrerte summer fra de siste opptil 60 innleggene i denne merkevaren. Dette er ikke en komplett kanal- eller leadrapport.</p>
        {itemsLoading && <p role="status">Henter statistikk…</p>}
        {itemsError && <p role="alert">{itemsError}</p>}
        {!itemsLoading && !itemsError && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {([["Visninger", total("views")], ["Liker", total("likes")], ["Kommentarer", total("comments")], ["Delinger", total("shares")]] as const).map(([name, count]) =>
            <div key={name} className="rounded-xl border border-slate-700 bg-slate-900 p-4"><p className="text-sm text-slate-400">{name}</p><p className="mt-2 text-2xl font-bold">{count.toLocaleString("nb-NO")}</p></div>)}
        </div>}
        {!itemsLoading && !itemsError && <p className="text-sm text-slate-300">Utkast: {publications.filter(item => item.status === "draft").length} · Planlagt: {publications.filter(item => item.status === "scheduled").length} · Publisert: {publications.filter(item => item.status === "published").length} · Feilet: {publications.filter(item => item.status === "failed").length}</p>}
      </section>}
    </>}
  </main>;
}
