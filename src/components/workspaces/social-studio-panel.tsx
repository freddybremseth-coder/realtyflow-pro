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

type SourceType = "property" | "article" | "topic";
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
};

const PROPERTY_STYLES = [
  ["hero_property", "Hero Property"],
  ["lifestyle", "Lifestyle"],
  ["fact_card", "Fact Card"],
  ["advisor", "Advisor"],
  ["carousel", "Carousel"],
  ["question_hook", "Question Hook"],
  ["minimal_premium", "Minimal Premium"],
] as const;

const sourceOptions: Array<{ id: SourceType; label: string; hint: string; icon: typeof Building2 }> = [
  { id: "property", label: "Eiendom", hint: "Tre konsepter fra verifiserte boligfakta", icon: Building2 },
  { id: "article", label: "Guide / magasin", hint: "Hent artikkelen fra brand-nettsiden", icon: BookOpenText },
  { id: "topic", label: "Eget tema", hint: "Beskriv hva du ønsker å fronte", icon: WandSparkles },
];

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
    setPropertyLookup(initialProperty.id);
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

  const canGenerate = useMemo(() => {
    if (!canDraft || busy) return false;
    if (sourceType === "property") return propertyLookup.trim().length > 0;
    if (sourceType === "article") return articleUrl.trim().length > 0;
    return topic.trim().length >= 5;
  }, [canDraft, busy, sourceType, propertyLookup, articleUrl, topic]);

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
            : "SoMe Studio kunne ikke lage forslagene.",
        );
      }
      const nextVariants = Array.isArray(body.variants) ? body.variants as Variant[] : [];
      if (nextVariants.length !== 3) throw new Error("SoMe Studio returnerte ikke tre forslag.");
      setSource(body.source as GeneratedSource);
      setVariants(nextVariants);
      setStyles(Object.fromEntries(nextVariants.map((item) => [item.id, item.creativeStyle])));
      setNotice("Tre forskjellige konsepter er klare. Velg kanal og eventuelt en annen eiendomsmal før du lagrer.");
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
        onClick={() => { setSourceType(id); setVariants([]); setSource(null); setError(""); setNotice(""); }}
        className={"rounded-xl border p-4 text-left transition " + (sourceType === id
          ? "border-cyan-600 bg-cyan-950/35"
          : "border-slate-800 bg-slate-900/70 hover:border-slate-600")}>
        <Icon size={20} className={sourceType === id ? "text-cyan-300" : "text-slate-400"}/>
        <div className="mt-2 font-semibold">{label}</div>
        <div className="mt-1 text-xs text-slate-400">{hint}</div>
      </button>)}
    </div>

    <div className="mt-5 grid gap-3">
      {sourceType === "property" && <>
        {propertyLabel && <p className="rounded-lg border border-emerald-900 bg-emerald-950/20 px-3 py-2 text-sm text-emerald-200">{propertyLabel}</p>}
        <label className="text-xs text-slate-300">Boligreferanse eller RealtyFlow-ID
          <input value={propertyLookup} onChange={(event) => { setPropertyLookup(event.target.value); setPropertyLabel(""); }}
            maxLength={100} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            placeholder="F.eks. N9950"/>
        </label>
      </>}
      {sourceType === "article" && <label className="text-xs text-slate-300">Lenke til Guide / Magasin
        <input type="url" value={articleUrl} onChange={(event) => setArticleUrl(event.target.value)}
          maxLength={2000} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
          placeholder={brandKey === "zeneco" ? "https://www.zenecohomes.com/guide/…" : "https://www.pinosoecolife.com/…"} />
        <span className="mt-1 block text-[11px] text-slate-500">Kun merkevarens eget nettsted kan hentes. Artikkelteksten brukes som faktakilde.</span>
      </label>}
      {sourceType === "topic" && <label className="text-xs text-slate-300">Tema
        <textarea value={topic} onChange={(event) => setTopic(event.target.value)} maxLength={1200} rows={3}
          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
          placeholder="F.eks. Hva bør en norsk kjøper vite før han velger Finestrat som helårsbolig?"/>
      </label>}
      {sourceType !== "property" && <label className="text-xs text-slate-300">Bildeadresse <span className="text-slate-500">(valgfritt)</span>
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
