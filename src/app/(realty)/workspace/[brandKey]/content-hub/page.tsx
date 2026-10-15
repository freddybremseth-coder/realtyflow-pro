"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BookOpen, FileText, Megaphone, RefreshCw, Send } from "lucide-react";
import { WorkspaceWebsiteContentStudio } from "@/components/workspaces/website-content-studio";
import { WorkspaceMarketingPanel } from "@/components/workspaces/marketing-panel";
import { WorkspaceSocialPublishPanel } from "@/components/workspaces/social-publish-panel";
import type { WorkspacePermission } from "@/lib/workspaces/brand-policy";

type Section = "articles" | "studio" | "drafts" | "publish";
type Publication = {
  id: string;
  title: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  status: string;
  scheduledPlatforms: string[];
  updatedAt: string | null;
};

const sections: Array<{
  id: Section; title: string; permission: WorkspacePermission; icon: typeof BookOpen;
}> = [
  { id: "articles", title: "Artikler og guider", permission: "content.read", icon: BookOpen },
  { id: "studio", title: "Lag SoMe-innhold", permission: "marketing.read", icon: Megaphone },
  { id: "drafts", title: "SoMe-utkast og historikk", permission: "marketing.read", icon: FileText },
  { id: "publish", title: "Publiser SoMe", permission: "marketing.publish", icon: Send },
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
    if (!canReadMarketing || section !== "drafts") return;
    const controller = new AbortController();
    void loadPublications(controller.signal);
    return () => controller.abort();
    // Updated when selecting the drafts area or changing the selected brand.
  }, [brandKey, canReadMarketing, section]);

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
      <nav aria-label="Content Hub-verktøy" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {available.map(entry => {
          const Icon = entry.icon;
          return <button key={entry.id} type="button" onClick={() => setSection(entry.id)}
            aria-current={section === entry.id ? "page" : undefined}
            className={"flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-semibold transition " +
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
        {!itemsLoading && !itemsError && <div className="grid gap-4 md:grid-cols-2">
          {publications.map(item => <article key={item.id} className="rounded-xl border border-slate-700 bg-slate-900 p-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-semibold">{item.title || "Uten tittel"}</h3>
              <span className="rounded bg-slate-800 px-2 py-1 text-xs">{item.status}</span>
            </div>
            {item.thumbnailUrl && <img src={item.thumbnailUrl} alt="" loading="lazy" className="mt-3 h-44 w-full rounded object-cover"/>}
            <p className="mt-3 whitespace-pre-wrap text-sm text-slate-300">{item.description || "Ingen tekst registrert."}</p>
            <p className="mt-3 text-xs text-slate-400">
              {(item.scheduledPlatforms || []).join(" · ") || "Kanal ikke valgt"}
              {item.updatedAt ? " · " + new Date(item.updatedAt).toLocaleDateString("nb-NO") : ""}
            </p>
          </article>)}
        </div>}
      </section>}
    </>}
  </main>;
}
