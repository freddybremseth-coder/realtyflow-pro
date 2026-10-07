"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpenText, Building2, Facebook, Instagram, Sparkles, WandSparkles } from "lucide-react";

export type WorkspaceSocialPropertySeed = {
  id: string;
  ref: string | null;
  title: string | null;
  town: string | null;
  location: string | null;
  primary_image?: string | null;
};

type SourceType = "property" | "article" | "area" | "topic";
type Channel = "facebook" | "instagram";
type Variant = {
  id: "editorial_premium" | "lifestyle_story" | "advisor_insight";
  label: string;
  creativeStyle: string;
  hook: string;
  angle: string;
  visualDirection: string;
  facebookText: string;
  instagramText: string;
  tags: string[];
};
type GeneratedSource = {
  type: SourceType;
  title: string;
  url: string;
  imageUrl: string | null;
  propertyId: string | null;
  propertyLookup: string | null;
  contentId?: string | null;
  areaId?: string | null;
  companionPropertyId?: string | null;
};

type EditorialItem = {
  id: string;
  kind: "guide" | "magazine" | "article" | "area";
  sourceType: "article" | "area";
  title: string;
  summary: string;
  url: string;
  imageUrl: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
  lastSharedAt: string | null;
  notShared60Days: boolean;
  score: number;
  contentId: string | null;
  areaId: string | null;
};

type EditorialDiscovery = {
  recommended: EditorialItem[];
  newGuides: EditorialItem[];
  magazine: EditorialItem[];
  areas: EditorialItem[];
  notShared60Days: EditorialItem[];
  pairings: Array<{
    itemId: string;
    contentId: string | null;
    areaId: string | null;
    sourceType: "article" | "area";
    title: string;
    recommendation: string;
    concept: "advisor_insight";
    reason: string;
  }>;
};

type EditorialCategory = "recommended" | "newGuides" | "magazine" | "areas" | "notShared60Days";

const PROPERTY_STYLES = [
  ["hero_property", "Hero Property"],
  ["lifestyle", "Lifestyle"],
  ["fact_card", "Fact Card"],
  ["advisor", "Advisor"],
  ["carousel", "Carousel"],
  ["question_hook", "Question Hook"],
  ["minimal_premium", "Minimal Premium"],
] as const;

const sourceOptions: Array<{ id: "property" | "article" | "topic"; label: string; hint: string; icon: typeof Building2 }> = [
  { id: "property", label: "Eiendom", hint: "Tre konsepter fra verifiserte boligfakta", icon: Building2 },
  { id: "article", label: "Guide / magasin", hint: "Hent artikkelen fra brand-nettsiden", icon: BookOpenText },
  { id: "topic", label: "Eget tema", hint: "Beskriv hva du ønsker å fronte", icon: WandSparkles },
];

const EDITORIAL_CATEGORIES: Array<{ id: EditorialCategory; label: string }> = [
  { id: "recommended", label: "Anbefalt å fronte nå" },
  { id: "newGuides", label: "Nye guider" },
  { id: "magazine", label: "Magasin" },
  { id: "areas", label: "Områder" },
  { id: "notShared60Days", label: "Ikke delt siste 60 dager" },
];

function formatContentDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("nb-NO", { day: "2-digit", month: "short" });
}

export function WorkspaceSocialStudio({
  brandKey,
  canDraft,
  activePlatforms,
  initialProperty,
  onInitialPropertyConsumed,
  onDraftSaved,
}: {
  brandKey: string;
  canDraft: boolean;
  activePlatforms: Set<string>;
  initialProperty?: WorkspaceSocialPropertySeed | null;
  onInitialPropertyConsumed?: () => void;
  onDraftSaved?: () => void | Promise<void>;
}) {
  const [sourceType, setSourceType] = useState<SourceType>("topic");
  const [propertyLookup, setPropertyLookup] = useState("");
  const [propertyLabel, setPropertyLabel] = useState("");
  const [articleUrl, setArticleUrl] = useState("");
  const [areaLookup, setAreaLookup] = useState("");
  const [contentId, setContentId] = useState("");
  const [propertyContext, setPropertyContext] = useState<WorkspaceSocialPropertySeed | null>(null);
  const [editorial, setEditorial] = useState<EditorialDiscovery | null>(null);
  const [editorialCategory, setEditorialCategory] = useState<EditorialCategory>("recommended");
  const [editorialBusy, setEditorialBusy] = useState(false);
  const [editorialError, setEditorialError] = useState("");
  const [selectedContent, setSelectedContent] = useState<EditorialItem | null>(null);
  const [topic, setTopic] = useState("");
  const [brief, setBrief] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [source, setSource] = useState<GeneratedSource | null>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [styles, setStyles] = useState<Record<string, string>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [previewing, setPreviewing] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!initialProperty?.id) return;
    setSourceType("property");
    setPropertyContext(initialProperty);
    setEditorial(null);
    setSelectedContent(null);
    setContentId("");
    setAreaLookup("");
    // Prefer the canonical property reference when available. Inventory can contain
    // non-UUID local/import IDs, while the server accepts either UUID or unique ref.
    setPropertyLookup(initialProperty.ref || initialProperty.id);
    setPropertyLabel([
      initialProperty.title || initialProperty.ref || "Bolig",
      initialProperty.town || initialProperty.location || "",
      initialProperty.ref ? "Ref " + initialProperty.ref : "",
    ].filter(Boolean).join(" · "));
    setVariants([]);
    setPreviews({});
    setSource(null);
    setError("");
    setNotice("Boligen er hentet fra Eiendommer. Lag tre forslag når du er klar.");
    onInitialPropertyConsumed?.();
  }, [initialProperty?.id]);

  const companionPropertyLookup = propertyContext?.ref || propertyContext?.id || "";

  const canGenerate = useMemo(() => {
    if (!canDraft || busy) return false;
    if (sourceType === "property") return propertyLookup.trim().length > 0;
    if (sourceType === "article") return articleUrl.trim().length > 0;
    if (sourceType === "area") return areaLookup.trim().length > 0;
    return topic.trim().length >= 5;
  }, [canDraft, busy, sourceType, propertyLookup, articleUrl, areaLookup, topic]);

  const editorialItems = editorial?.[editorialCategory] || [];

  async function loadEditorialContent() {
    if (editorialBusy) return;
    setEditorialBusy(true);
    setEditorialError("");
    try {
      const response = await fetch("/api/workspaces/" + encodeURIComponent(brandKey) + "/social-studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "discover_content",
          propertyLookup: companionPropertyLookup,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error("Innholdsvelgeren kunne ikke hente forslag akkurat nå.");
      setEditorial({
        recommended: Array.isArray(body.recommended) ? body.recommended : [],
        newGuides: Array.isArray(body.newGuides) ? body.newGuides : [],
        magazine: Array.isArray(body.magazine) ? body.magazine : [],
        areas: Array.isArray(body.areas) ? body.areas : [],
        notShared60Days: Array.isArray(body.notShared60Days) ? body.notShared60Days : [],
        pairings: Array.isArray(body.pairings) ? body.pairings : [],
      });
    } catch (cause) {
      setEditorialError(cause instanceof Error ? cause.message : "Kunne ikke hente innhold.");
    } finally {
      setEditorialBusy(false);
    }
  }

  function chooseEditorialItem(item: EditorialItem) {
    setSelectedContent(item);
    setContentId(item.contentId || "");
    // Let the server re-fetch/register the canonical brand image for selected content.
    setImageUrl("");
    setVariants([]);
    setPreviews({});
    setSource(null);
    setError("");
    if (item.sourceType === "area") {
      setSourceType("area");
      setAreaLookup(item.areaId || item.id.replace(/^area:/, ""));
      setArticleUrl("");
    } else {
      setSourceType("article");
      setArticleUrl(item.url);
      setAreaLookup("");
    }
    setNotice(
      companionPropertyLookup
        ? "Valgt «" + item.title + "». RealtyFlow kombinerer innholdet med den valgte boligen og lager tre vinkler."
        : "Valgt «" + item.title + "» fra RealtyFlow.",
    );
  }

  useEffect(() => {
    if (editorial || editorialBusy) return;
    if (sourceType !== "article" && sourceType !== "area" && !propertyContext?.id) return;
    void loadEditorialContent();
  }, [sourceType, brandKey, companionPropertyLookup, propertyContext?.id]);

  async function generate() {
    if (!canGenerate) return;
    setBusy(true);
    setError("");
    setNotice("");
    setVariants([]);
    setPreviews({});
    try {
      const response = await fetch("/api/workspaces/" + encodeURIComponent(brandKey) + "/social-studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          sourceType,
          propertyLookup: propertyLookup.trim(),
          articleUrl: articleUrl.trim(),
          areaLookup: areaLookup.trim(),
          contentId: contentId.trim(),
          companionPropertyLookup: sourceType === "property" ? "" : companionPropertyLookup,
          topic: topic.trim(),
          brief: brief.trim(),
          imageUrl: imageUrl.trim(),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const code = body?.error?.code || "";
        throw new Error(
          code === "PROPERTY_NOT_MARKETABLE_FOR_BRAND" ? "Denne boligen kan brukes til kundematching, men ikke markedsføres fra denne merkevaren."
            : code === "PROPERTY_NOT_FOUND" ? "Fant ikke boligen. Bruk referansen eller åpne den fra Eiendommer."
            : code === "ARTICLE_URL_OUTSIDE_BRAND" || code === "ARTICLE_REDIRECT_OUTSIDE_BRAND" ? "Guide/Magasin kan bare hentes fra denne merkevarens eget nettsted."
            : code === "ARTICLE_FETCH_FAILED" ? "Artikkelen kunne ikke hentes fra nettsiden."
            : code === "AREA_NOT_FOUND" ? "Fant ikke områdeinnholdet i RealtyFlow."
            : "SoMe Studio kunne ikke lage forslagene.",
        );
      }
      const nextVariants = Array.isArray(body.variants) ? body.variants as Variant[] : [];
      if (nextVariants.length !== 3) throw new Error("SoMe Studio returnerte ikke tre forslag.");
      setSource(body.source as GeneratedSource);
      setVariants(nextVariants);
      setStyles(Object.fromEntries(nextVariants.map((item) => [item.id, item.creativeStyle])));
      setNotice(body.source?.companionPropertyId
        ? "Tre konsepter er klare, inkludert koblingen mellom valgt innhold og boligen."
        : "Tre forskjellige konsepter er klare. Velg kanal og eventuelt en annen eiendomsmal før du lagrer.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke lage forslag.");
    } finally {
      setBusy(false);
    }
  }

  async function previewVariant(variant: Variant) {
    if (source?.type !== "property" || !source.propertyLookup || previewing) return;
    setPreviewing(variant.id);
    setError("");
    try {
      const channel: Channel = activePlatforms.has("instagram") ? "instagram" : "facebook";
      const previewUrl = await renderPropertyImage(variant, channel);
      if (!previewUrl) throw new Error("Forhåndsvisningen kunne ikke rendres.");
      setPreviews(current => ({ ...current, [variant.id]: previewUrl }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Forhåndsvisningen kunne ikke rendres.");
    } finally {
      setPreviewing("");
    }
  }

  async function renderPropertyImage(variant: Variant, channel: Channel) {
    if (source?.type !== "property" || !source.propertyLookup) return source?.imageUrl || imageUrl.trim();
    const response = await fetch("/api/workspaces/" + encodeURIComponent(brandKey) + "/social-studio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "render_property_card",
        propertyLookup: source.propertyLookup,
        creativeStyle: styles[variant.id] || variant.creativeStyle,
        channel,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.imageUrl) throw new Error("Det profesjonelle eiendomskortet kunne ikke rendres.");
    return String(body.imageUrl);
  }

  async function saveVariant(variant: Variant, channel: Channel) {
    if (!canDraft || saving) return;
    if (!activePlatforms.has(channel)) {
      setError((channel === "facebook" ? "Facebook" : "Instagram") + " er ikke aktivert for denne merkevaren.");
      return;
    }
    setSaving(variant.id + ":" + channel);
    setError("");
    setNotice("");
    try {
      const approvedImageUrl = await renderPropertyImage(variant, channel);
      if (channel === "instagram" && !approvedImageUrl) {
        throw new Error("Instagram trenger et godkjent bilde. Legg inn bilde fra brand-media eller bruk en eiendom med bilde.");
      }
      const text = channel === "facebook" ? variant.facebookText : variant.instagramText;
      const response = await fetch("/api/workspaces/" + encodeURIComponent(brandKey) + "/marketing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: (source?.title || variant.hook || variant.label).slice(0, 200),
          description: text,
          tags: Array.from(new Set([
            ...variant.tags,
            "concept-" + variant.id.replace(/_/g, "-"),
            "source-" + (source?.type || sourceType),
            ...(source?.contentId ? ["source-content-" + source.contentId] : []),
            ...(source?.areaId ? ["source-area-" + source.areaId] : []),
            ...(source?.companionPropertyId ? ["paired-property"] : []),
            ...(source?.type === "property"
              ? ["style-" + (styles[variant.id] || variant.creativeStyle).replace(/_/g, "-")]
              : []),
          ])).slice(0, 20),
          platforms: [channel],
          imageUrl: approvedImageUrl || "",
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const code = body?.error?.code || "";
        throw new Error(
          code === "IMAGE_NOT_APPROVED_FOR_BRAND" ? "Bildet er ikke registrert som godkjent brand-media. Velg en eiendom eller et bilde som finnes i RealtyFlow."
            : code === "INSTAGRAM_IMAGE_REQUIRED" ? "Instagram krever et godkjent bilde."
            : code === "CHANNEL_NOT_ACTIVE_FOR_BRAND" ? "Kanalen er ikke aktivert for denne merkevaren."
            : "Utkastet kunne ikke lagres i Content Hub.",
        );
      }
      setNotice((channel === "facebook" ? "Facebook" : "Instagram") + "-utkastet er lagret i Content Hub. Ingenting er publisert.");
      await onDraftSaved?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Utkastet kunne ikke lagres.");
    } finally {
      setSaving("");
    }
  }

  return <section className="rounded-2xl border border-cyan-900/70 bg-gradient-to-b from-cyan-950/25 to-slate-950/70 p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">SoMe Studio</p>
        <h2 className="mt-1 flex items-center gap-2 text-2xl font-semibold"><Sparkles size={21}/> Tre ideer, ikke tre omskrivninger</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          Start med en eiendom, en guide/magasinartikkel eller et eget tema. RealtyFlow lager Editorial/Premium, Story/Lifestyle og Advisor/Insight med egne Facebook- og Instagram-versjoner.
        </p>
      </div>
      <span className="rounded-full border border-cyan-800 px-3 py-1 text-xs text-cyan-200">7 eiendomsmaler</span>
    </div>

    {error && <p role="alert" className="mt-4 rounded-xl border border-amber-800 bg-amber-950/30 p-3 text-sm text-amber-200">{error}</p>}
    {notice && <p role="status" className="mt-4 rounded-xl border border-emerald-800 bg-emerald-950/25 p-3 text-sm text-emerald-200">{notice}</p>}

    <div className="mt-5 grid gap-3 md:grid-cols-3">
      {sourceOptions.map(({ id, label, hint, icon: Icon }) => <button type="button" key={id}
        onClick={() => {
          setSourceType(id);
          setVariants([]);
          setSource(null);
          setError("");
          setNotice("");
          if (id === "article") {
            setSelectedContent(null);
            setContentId("");
            setAreaLookup("");
          }
        }}
        className={"rounded-xl border p-4 text-left transition " + (
          (sourceType === id || (id === "article" && sourceType === "area"))
            ? "border-cyan-600 bg-cyan-950/35"
            : "border-slate-800 bg-slate-900/70 hover:border-slate-600")}>
        <Icon size={20} className={(sourceType === id || (id === "article" && sourceType === "area")) ? "text-cyan-300" : "text-slate-400"}/>
        <div className="mt-2 font-semibold">{label}</div>
        <div className="mt-1 text-xs text-slate-400">{hint}</div>
      </button>)}
    </div>

    {(sourceType === "article" || sourceType === "area" || propertyContext?.id) && <section className="mt-5 rounded-2xl border border-violet-900/60 bg-violet-950/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-violet-300">Redaksjonell innholdsvelger</p>
          <h3 className="mt-1 text-lg font-semibold">Velg hva som er smartest å fronte nå</h3>
          <p className="mt-1 max-w-3xl text-xs text-slate-400">
            RealtyFlow rangerer publiserte guider, magasininnhold og områder, og ser samtidig på hva som ikke er delt de siste 60 dagene.
          </p>
        </div>
        <button type="button" onClick={() => void loadEditorialContent()} disabled={editorialBusy}
          className="rounded-lg border border-violet-700 px-3 py-2 text-xs text-violet-200 disabled:opacity-40">
          {editorialBusy ? "Henter…" : editorial ? "Oppdater forslag" : "Hent forslag"}
        </button>
      </div>

      {propertyContext?.id && <div className="mt-3 rounded-xl border border-cyan-900/60 bg-cyan-950/20 p-3">
        <p className="text-xs font-semibold text-cyan-200">Kontekstbolig</p>
        <p className="mt-1 text-sm text-slate-200">
          {propertyContext.title || propertyContext.ref || "Valgt bolig"}
          {propertyContext.location ? " · " + propertyContext.location : ""}
          {propertyContext.ref ? " · Ref " + propertyContext.ref : ""}
        </p>
        <p className="mt-1 text-xs text-slate-400">Velger du innhold under, lager RealtyFlow tre konsepter som kan koble innholdet til denne boligen uten å blande fakta.</p>
      </div>}

      {editorialError && <p className="mt-3 rounded-lg border border-amber-800 bg-amber-950/20 p-3 text-xs text-amber-200">{editorialError}</p>}

      {editorial && editorial.pairings.length > 0 && propertyContext?.id && <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">Foreslåtte kombinasjoner</p>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          {editorial.pairings.map(pairing => {
            const item = [
              ...editorial.recommended,
              ...editorial.newGuides,
              ...editorial.magazine,
              ...editorial.areas,
              ...editorial.notShared60Days,
            ].find(candidate => candidate.id === pairing.itemId);
            if (!item) return null;
            return <button key={pairing.itemId} type="button" onClick={() => chooseEditorialItem(item)}
              className="rounded-xl border border-cyan-900/60 bg-slate-950/55 p-3 text-left hover:border-cyan-600">
              <div className="text-sm font-semibold text-slate-100">{pairing.recommendation}</div>
              <div className="mt-1 text-xs text-slate-400">{pairing.reason}</div>
              <div className="mt-2 text-[11px] font-semibold text-cyan-300">Anbefalt vinkel: Advisor / Insight →</div>
            </button>;
          })}
        </div>
      </div>}

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {EDITORIAL_CATEGORIES.map(category => <button key={category.id} type="button"
          onClick={() => setEditorialCategory(category.id)}
          className={"shrink-0 rounded-full border px-3 py-1.5 text-xs " + (editorialCategory === category.id
            ? "border-violet-500 bg-violet-950/60 text-violet-100"
            : "border-slate-700 text-slate-400 hover:border-slate-500")}>
          {category.label}
        </button>)}
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {editorialItems.map(item => <button key={item.id} type="button" onClick={() => chooseEditorialItem(item)}
          className={"rounded-xl border p-3 text-left transition " + (selectedContent?.id === item.id
            ? "border-emerald-600 bg-emerald-950/20"
            : "border-slate-800 bg-slate-950/50 hover:border-slate-600")}>
          <div className="flex items-start justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-300">
              {item.kind === "area" ? "Område" : item.kind === "guide" ? "Guide" : item.kind === "magazine" ? "Magasin" : "Artikkel"}
            </span>
            {item.notShared60Days && <span className="rounded-full border border-amber-800 px-2 py-0.5 text-[9px] text-amber-300">60+ dager</span>}
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-100">{item.title}</div>
          {item.summary && <div className="mt-1 line-clamp-2 text-xs text-slate-400">{item.summary}</div>}
          <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-500">
            {formatContentDate(item.publishedAt || item.updatedAt) && <span>{formatContentDate(item.publishedAt || item.updatedAt)}</span>}
            {item.score > 0 && <span>Relevans {item.score}</span>}
          </div>
        </button>)}
        {!editorialBusy && editorial && editorialItems.length === 0 && <p className="text-xs text-slate-500">Ingen innholdskilder i denne kategorien ennå.</p>}
      </div>
    </section>}

    <div className="mt-5 grid gap-3">
      {sourceType === "property" && <>
        {propertyLabel && <p className="rounded-lg border border-emerald-900 bg-emerald-950/20 px-3 py-2 text-sm text-emerald-200">{propertyLabel}</p>}
        <label className="text-xs text-slate-300">Boligreferanse eller RealtyFlow-ID
          <input value={propertyLookup} onChange={(event) => { setPropertyLookup(event.target.value); setPropertyLabel(""); }}
            maxLength={100} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            placeholder="F.eks. N9950"/>
        </label>
      </>}
      {sourceType === "article" && <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
        {selectedContent?.sourceType === "article" && <div className="mb-3 rounded-lg border border-emerald-900 bg-emerald-950/20 p-3">
          <p className="text-xs font-semibold text-emerald-300">Valgt fra innholdsvelgeren</p>
          <p className="mt-1 text-sm font-semibold text-slate-100">{selectedContent.title}</p>
          {propertyContext?.id && <p className="mt-1 text-xs text-slate-400">Kombineres med valgt bolig. Advisor/Insight vil bruke koblingen når den er naturlig.</p>}
        </div>}
        <label className="text-xs text-slate-300">Guide / Magasin-URL
          <input type="url" value={articleUrl} onChange={(event) => {
              setArticleUrl(event.target.value);
              setSelectedContent(null);
              setContentId("");
            }}
            maxLength={2000} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            placeholder={brandKey === "zeneco" ? "https://www.zenecohomes.com/guide/…" : "https://www.pinosoecolife.com/…"} />
          <span className="mt-1 block text-[11px] text-slate-500">Du kan fortsatt lime inn URL manuelt. Kun merkevarens godkjente domene hentes.</span>
        </label>
      </div>}
      {sourceType === "area" && <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
        <p className="text-xs font-semibold text-emerald-300">Valgt område</p>
        <p className="mt-1 text-sm font-semibold text-slate-100">{selectedContent?.title || "Område fra RealtyFlow"}</p>
        <p className="mt-1 text-xs text-slate-400">Områdeprofilen brukes direkte som faktakilde. Ingen nettside-URL trenger å limes inn.</p>
      </div>}
      {sourceType === "topic" && <label className="text-xs text-slate-300">Tema
        <textarea value={topic} onChange={(event) => setTopic(event.target.value)} maxLength={1200} rows={3}
          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
          placeholder="F.eks. Hva bør en norsk kjøper vite før han velger Finestrat som helårsbolig?"/>
      </label>}
      {sourceType !== "property" && sourceType !== "area" && <label className="text-xs text-slate-300">Bildeadresse <span className="text-slate-500">(valgfritt)</span>
        <input type="url" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} maxLength={2000}
          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" placeholder="https://…"/>
        <span className="mt-1 block text-[11px] text-slate-500">Instagram krever at bildet allerede er godkjent brand-media i RealtyFlow.</span>
      </label>}
      <label className="text-xs text-slate-300">Hva vil du vektlegge? <span className="text-slate-500">(valgfritt)</span>
        <textarea value={brief} onChange={(event) => setBrief(event.target.value)} maxLength={1500} rows={2}
          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
          placeholder="F.eks. mindre salgsaktig, mer lokal livsstil og tydelig rådgiverperspektiv"/>
      </label>
    </div>

    <button type="button" onClick={() => void generate()} disabled={!canGenerate}
      className="mt-4 inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
      <Sparkles size={16}/>{busy ? "Lager tre konsepter…" : "Lag 3 forskjellige forslag"}
    </button>

    {variants.length === 3 && <div className="mt-6 grid gap-4 xl:grid-cols-3">
      {variants.map((variant) => <article key={variant.id} className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">{variant.label}</p>
            <h3 className="mt-1 text-lg font-semibold">{variant.hook || variant.label}</h3>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-400">{variant.angle}</p>
        <p className="mt-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-300">
          <span className="font-semibold text-slate-200">Visuell retning:</span> {variant.visualDirection}
        </p>

        {source?.type === "property" && <label className="mt-3 block text-xs text-slate-300">Eiendomsmal
          <select value={styles[variant.id] || variant.creativeStyle}
            onChange={(event) => {
              setStyles(current => ({ ...current, [variant.id]: event.target.value }));
              setPreviews(current => {
                const next = { ...current };
                delete next[variant.id];
                return next;
              });
            }}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
            {PROPERTY_STYLES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <button type="button" onClick={() => void previewVariant(variant)} disabled={Boolean(previewing)}
            className="mt-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 disabled:opacity-40">
            {previewing === variant.id ? "Renderer…" : "Forhåndsvis valgt mal"}
          </button>
          {previews[variant.id] && <img src={previews[variant.id]} alt={"Forhåndsvisning av " + variant.label}
            className="mt-3 aspect-[4/5] w-full rounded-xl border border-slate-700 object-cover" />}
        </label>}

        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-blue-900/60 bg-blue-950/15 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-blue-200"><Facebook size={14}/> Facebook</div>
            <p className="mt-2 whitespace-pre-line text-sm text-slate-300">{variant.facebookText}</p>
            <button type="button" disabled={Boolean(saving) || !activePlatforms.has("facebook")}
              onClick={() => void saveVariant(variant, "facebook")}
              className="mt-3 rounded-lg border border-blue-800 px-3 py-2 text-xs text-blue-200 disabled:opacity-40">
              {saving === variant.id + ":facebook" ? "Lagrer…" : "Lagre Facebook-utkast"}
            </button>
          </div>
          <div className="rounded-xl border border-fuchsia-900/50 bg-fuchsia-950/10 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-fuchsia-200"><Instagram size={14}/> Instagram</div>
            <p className="mt-2 whitespace-pre-line text-sm text-slate-300">{variant.instagramText}</p>
            <button type="button" disabled={Boolean(saving) || !activePlatforms.has("instagram")}
              onClick={() => void saveVariant(variant, "instagram")}
              className="mt-3 rounded-lg border border-fuchsia-800 px-3 py-2 text-xs text-fuchsia-200 disabled:opacity-40">
              {saving === variant.id + ":instagram" ? "Lagrer…" : "Lagre Instagram-utkast"}
            </button>
          </div>
        </div>
        {variant.tags.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">
          {variant.tags.map((tag) => <span key={tag} className="rounded-full border border-slate-700 px-2 py-1 text-[10px] text-slate-400">#{tag}</span>)}
        </div>}
      </article>)}
    </div>}
  </section>;
}
