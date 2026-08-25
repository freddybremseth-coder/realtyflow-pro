"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Cpu,
  Image as ImageIcon,
  Layers3,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Type,
  Wand2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ImageUpload } from "@/components/ui/image-upload";
import { BRANDS } from "@/lib/constants";
import type { AdGrowthGoal } from "@/lib/ads/creative-dna";
import {
  planAdCampaign,
  type AdCampaignStyle,
  type AdImageProvider,
  type AdOverlayMode,
} from "@/services/ads/campaign-planner";
import type { AspectRatio } from "@/types/ads";

interface BankImage {
  id: string;
  url: string;
  thumbnail_url?: string | null;
  name: string | null;
  kind: "product" | "variant" | "image" | "logo" | "thumbnail";
  tags: string[] | null;
  created_at: string;
}

interface ProviderStatus {
  id: AdImageProvider;
  label: string;
  available: boolean;
  description: string;
  estimatedUnitCostUsd: number;
}

const PROVIDER_FALLBACKS: ProviderStatus[] = [
  { id: "auto", label: "Auto", available: true, description: "Gemini + OpenArt + Flux etter oppgave.", estimatedUnitCostUsd: 0.03 },
  { id: "openart", label: "OpenArt", available: false, description: "Produktvariasjoner via OpenArt.", estimatedUnitCostUsd: 0.03 },
  { id: "gemini", label: "Gemini", available: false, description: "Raske konsepter og rimelige varianter.", estimatedUnitCostUsd: 0.02 },
  { id: "flux", label: "Flux Kontext Pro", available: false, description: "Premium produkt- og etikettbevaring.", estimatedUnitCostUsd: 0.04 },
];

const CAMPAIGN_STYLES: Array<{ id: AdCampaignStyle; label: string; description: string }> = [
  { id: "mixed", label: "Komplett miks", description: "10 ulike annonsevinkler for bred testing." },
  { id: "product_focused", label: "Produktfokus", description: "Hero, etikett, detaljer og emballasje." },
  { id: "lifestyle", label: "Lifestyle", description: "Produktet brukt i troverdige situasjoner." },
  { id: "luxury", label: "Luxury", description: "Eksklusivt, raffinert og editorialt." },
  { id: "scandinavian_clean", label: "Skandinavisk rent", description: "Minimalistisk, rolig og moderne." },
  { id: "organic_natural", label: "Naturlig", description: "Opprinnelse, materialer og håndverk." },
  { id: "seasonal", label: "Sesong", description: "Aktuelle kampanjeøyeblikk og farger." },
  { id: "social_proof", label: "Tillit", description: "Troverdig uttrykk uten oppdiktede bevis." },
  { id: "promo_sale", label: "Tilbud", description: "Konvertering, CTA og kampanjerom." },
];

const FORMAT_OPTIONS: Array<{ id: AspectRatio; label: string; use: string }> = [
  { id: "1:1", label: "1:1", use: "Feed" },
  { id: "4:5", label: "4:5", use: "IG portrait" },
  { id: "9:16", label: "9:16", use: "Stories/Reels" },
  { id: "1.91:1", label: "1.91:1", use: "Meta landscape" },
];

const GROWTH_GOALS: Array<{ id: AdGrowthGoal; label: string; description: string }> = [
  { id: "lead_generation", label: "Flere leads", description: "Optimaliser læringen mot kvalifiserte henvendelser, bookinger og videre salgssteg." },
  { id: "follower_growth", label: "Flere følgere", description: "Bygg creative learning rundt profilbesøk, follows, saves, shares og engasjement." },
  { id: "direct_sales", label: "Mer salg", description: "Prioriter creatives som kan knyttes til kjøp, inntekt og margin når økonomidata finnes." },
  { id: "retargeting", label: "Retargeting", description: "Lag budskap for varme besøkende, engasjerte brukere og eksisterende leads." },
  { id: "awareness", label: "Awareness", description: "Optimaliser for reach, views og attention uten å late som dette er direkte salg." },
];

export default function NewAdCampaignPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [brandId, setBrandId] = useState(BRANDS[0]?.id ?? "");
  const [name, setName] = useState("");
  const [productName, setProductName] = useState("");
  const [productImageUrl, setProductImageUrl] = useState("");
  const [labelDescription, setLabelDescription] = useState("");
  const [targetMarkets, setTargetMarkets] = useState("ES, NO");
  const [audienceSegments, setAudienceSegments] = useState("Premium consumers, Scandinavian buyers");
  const [brandVoice, setBrandVoice] = useState("");
  const [funnelStage, setFunnelStage] = useState("cold");
  const [growthGoal, setGrowthGoal] = useState<AdGrowthGoal>("lead_generation");
  const [defaultLanguage, setDefaultLanguage] = useState("");
  const [offer, setOffer] = useState("15% på første bestilling");
  const [targetTotal, setTargetTotal] = useState(50);
  const [aspectRatios, setAspectRatios] = useState<AspectRatio[]>(["1:1", "4:5", "9:16"]);
  const [providerMode, setProviderMode] = useState<AdImageProvider>("auto");
  const [campaignStyle, setCampaignStyle] = useState<AdCampaignStyle>("mixed");
  const [overlayMode, setOverlayMode] = useState<AdOverlayMode>("suggestions");
  const [preserveProductIdentity, setPreserveProductIdentity] = useState(true);

  const [providers, setProviders] = useState<ProviderStatus[]>(PROVIDER_FALLBACKS);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [bankImages, setBankImages] = useState<BankImage[]>([]);
  const [bankLoading, setBankLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState("");
  const [aiFilled, setAiFilled] = useState(false);
  const [analysisConfidence, setAnalysisConfidence] = useState<"high" | "medium" | "low" | null>(null);

  const selectedBrand = BRANDS.find((brand) => brand.id === brandId);
  const selectedProvider = providers.find((provider) => provider.id === providerMode);
  const selectedGrowthGoal = GROWTH_GOALS.find((goal) => goal.id === growthGoal);

  const previewPlan = useMemo(() => planAdCampaign({
    productName: productName || "produktet",
    productImageUrl: productImageUrl || "https://example.com/product.png",
    labelDescription: labelDescription || "preserve the uploaded package and label",
    audienceSegments: audienceSegments.split(",").map((value) => value.trim()).filter(Boolean),
    targetMarkets: targetMarkets.split(",").map((value) => value.trim()).filter(Boolean),
    brandVoice: brandVoice || selectedBrand?.tone || null,
    offer: offer || null,
    providerMode,
    campaignStyle,
    overlayMode,
    preserveProductIdentity,
    totalCreatives: targetTotal,
    aspectRatios,
    conceptCount: Math.min(10, targetTotal),
    variantsPerConcept: Math.max(1, Math.ceil(targetTotal / Math.min(10, targetTotal))),
  }), [
    aspectRatios,
    audienceSegments,
    brandVoice,
    campaignStyle,
    labelDescription,
    offer,
    overlayMode,
    preserveProductIdentity,
    productImageUrl,
    productName,
    providerMode,
    selectedBrand?.tone,
    targetMarkets,
    targetTotal,
  ]);

  const runImageAnalysis = async (url: string) => {
    if (!url) return;
    setAnalyzing(true);
    setAnalyzeError("");
    try {
      const response = await fetch("/api/ad-campaigns/analyze-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: url, enrich: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Analyse feilet");
      const analysis = data.analysis || {};
      if (analysis.product_name && !productName) setProductName(analysis.product_name);
      if (analysis.label_description && !labelDescription) setLabelDescription(analysis.label_description);
      if (!name && analysis.brand_hint && analysis.category_hint) {
        setName(`${analysis.brand_hint} — ${analysis.category_hint} kampanje`);
      }
      setAnalysisConfidence(analysis.confidence || null);
      setAiFilled(true);
    } catch (caught) {
      setAnalyzeError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setAnalyzing(false);
    }
  };

  const handleImageChange = (url: string) => {
    setProductImageUrl(url);
    setAiFilled(false);
    setAnalysisConfidence(null);
    if (url) void runImageAnalysis(url);
  };

  const handleBrandChange = (id: string) => {
    setBrandId(id);
    const brand = BRANDS.find((item) => item.id === id);
    if (brand?.tone) setBrandVoice(brand.tone);
    if (brand?.target_audience) setAudienceSegments(brand.target_audience);
  };

  useEffect(() => {
    const loadProviders = async () => {
      setProvidersLoading(true);
      try {
        const response = await fetch("/api/ad-campaigns/providers", { cache: "no-store" });
        const data = await response.json();
        if (response.ok && Array.isArray(data.providers)) setProviders(data.providers);
      } finally {
        setProvidersLoading(false);
      }
    };
    void loadProviders();
  }, []);

  useEffect(() => {
    const loadBankImages = async () => {
      setBankLoading(true);
      try {
        const [productsResponse, variantsResponse] = await Promise.all([
          fetch("/api/neural-beat/image-bank?kind=product&owner=all&limit=12"),
          fetch("/api/neural-beat/image-bank?kind=variant&owner=all&limit=8"),
        ]);
        const products = await productsResponse.json().catch(() => ({}));
        const variants = await variantsResponse.json().catch(() => ({}));
        setBankImages([
          ...((products.images || []) as BankImage[]),
          ...((variants.images || []) as BankImage[]),
        ]);
      } catch {
        setBankImages([]);
      } finally {
        setBankLoading(false);
      }
    };
    void loadBankImages();
  }, []);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/ad-campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand_id: brandId,
          name,
          product_name: productName,
          product_image_url: productImageUrl,
          label_description: labelDescription,
          target_markets: targetMarkets.split(",").map((value) => value.trim()).filter(Boolean),
          audience_segments: audienceSegments.split(",").map((value) => value.trim()).filter(Boolean),
          brand_voice: brandVoice || null,
          funnel_stage: funnelStage,
          growth_goal: growthGoal,
          default_language: defaultLanguage.trim() || null,
          optimization_event: null,
          offer: offer || null,
          total_creatives: targetTotal,
          aspect_ratios: aspectRatios,
          image_provider: providerMode,
          campaign_style: campaignStyle,
          overlay_mode: overlayMode,
          preserve_product_identity: preserveProductIdentity,
          concept_count: Math.min(10, targetTotal),
          variants_per_concept: Math.max(1, Math.ceil(targetTotal / Math.min(10, targetTotal))),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunne ikke opprette kampanjen.");
      router.push(`/ad-campaigns/${data.campaign.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setSubmitting(false);
    }
  };

  const ready = Boolean(brandId && name.trim() && productName.trim() && productImageUrl && labelDescription.trim() && aspectRatios.length);
  const explicitProviderUnavailable = providerMode !== "auto" && selectedProvider && !selectedProvider.available;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Sparkles className="h-6 w-6 text-amber-400" />
            Ny annonsekampanje
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            10 profesjonelle annonsevinkler · Gemini, OpenArt og Flux Kontext Pro · Creative DNA og attribution
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{targetTotal} annonser</Badge>
          <Badge variant="outline">{selectedGrowthGoal?.label}</Badge>
          <Badge variant="outline">{previewPlan.concepts.length} konseptfamilier</Badge>
          <Badge variant="outline">est. ${previewPlan.estimatedCostUsd.toFixed(2)}</Badge>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>1. Merkevare</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
          {BRANDS.map((brand) => (
            <button
              key={brand.id}
              type="button"
              onClick={() => handleBrandChange(brand.id)}
              className={`rounded-lg border p-3 text-left transition ${brandId === brand.id ? "border-amber-400 bg-amber-400/10" : "border-gray-700 hover:border-gray-500"}`}
            >
              <div className="mb-1 flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: brand.color }} />
                <span className="text-sm font-medium">{brand.name}</span>
              </div>
              <p className="text-xs capitalize text-gray-500">{brand.type}</p>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ImageIcon className="h-4 w-4" />2. Produkt og referanse</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Kampanjenavn"><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Doña Anna høstkampanje" /></Field>
            <Field label="Produktnavn"><Input value={productName} onChange={(event) => setProductName(event.target.value)} placeholder="Doña Anna Verde Alto olive oil bottle" /></Field>
          </div>
          <ImageUpload
            value={productImageUrl}
            onChange={handleImageChange}
            label="Produktbilde"
            hint="Dette bildet brukes som identitetsreferanse i alle annonser."
            uploadFields={{
              save_to_bank: "true",
              bank_kind: "product",
              bank_owner: brandId || "system",
              bank_name: productName || name || "Ad campaign product",
              bank_tags: `product,ad-campaign,${brandId}`,
            }}
          />

          {bankImages.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span>Eller velg fra bildebanken</span>
                {bankLoading && <span>Laster…</span>}
              </div>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-10">
                {bankImages.slice(0, 10).map((image) => (
                  <button
                    key={image.id}
                    type="button"
                    onClick={() => handleImageChange(image.url)}
                    className={`relative aspect-square overflow-hidden rounded-md border bg-gray-900 ${productImageUrl === image.url ? "border-amber-400 ring-2 ring-amber-400/30" : "border-gray-700"}`}
                  >
                    <img src={image.thumbnail_url || image.url} alt={image.name || "Produkt"} className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {analyzing && <StatusLine icon={<Loader2 className="h-4 w-4 animate-spin" />} text="AI analyserer produkt og etikett…" tone="amber" />}
          {aiFilled && !analyzing && <StatusLine icon={<Wand2 className="h-4 w-4" />} text={`AI-analyse fullført${analysisConfidence ? ` · ${analysisConfidence} confidence` : ""}`} tone="green" />}
          {analyzeError && <StatusLine icon={<AlertCircle className="h-4 w-4" />} text={analyzeError} tone="red" />}

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs text-gray-400">Produkt- og etikettbeskrivelse</label>
              {productImageUrl && <button type="button" onClick={() => void runImageAnalysis(productImageUrl)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-amber-300"><RefreshCw className="h-3 w-3" />Analyser på nytt</button>}
            </div>
            <textarea
              value={labelDescription}
              onChange={(event) => setLabelDescription(event.target.value)}
              rows={5}
              className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm"
              placeholder="Beskriv flaske, emballasje, etikett, logo, farger og all viktig tekst som skal bevares."
            />
          </div>
          <label className="flex items-start gap-3 rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-3 text-sm text-emerald-50">
            <input type="checkbox" checked={preserveProductIdentity} onChange={(event) => setPreserveProductIdentity(event.target.checked)} className="mt-1" />
            <span><strong>Bevar produktidentitet</strong><span className="mt-1 block text-xs text-emerald-100/70">Låser emballasjeform, logo, etikettstruktur, farger og gjenkjennelige produktdetaljer i provider-promptene.</span></span>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Cpu className="h-4 w-4" />3. Bildemotor</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {providers.map((provider) => (
              <button
                key={provider.id}
                type="button"
                onClick={() => setProviderMode(provider.id)}
                className={`rounded-xl border p-4 text-left transition ${providerMode === provider.id ? "border-cyan-400 bg-cyan-400/10" : "border-gray-700 hover:border-gray-500"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{provider.label}</span>
                  {providersLoading ? <Loader2 className="h-3 w-3 animate-spin text-gray-500" /> : provider.available ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <AlertCircle className="h-4 w-4 text-amber-400" />}
                </div>
                <p className="mt-2 text-xs leading-5 text-gray-400">{provider.description}</p>
                <p className="mt-2 text-[11px] text-gray-500">est. ${provider.estimatedUnitCostUsd.toFixed(2)} / bilde</p>
              </button>
            ))}
          </div>

          {providerMode === "auto" && (
            <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/10 p-4">
              <p className="text-sm font-medium text-cyan-100">Auto-plan for denne kampanjen</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {Object.entries(previewPlan.providerStrategy.counts).map(([provider, count]) => <Badge key={provider} variant="outline">{provider}: {count}</Badge>)}
              </div>
              <p className="mt-3 text-xs text-cyan-100/70">Gemini brukes til raske konseptvarianter, OpenArt til art-directed variasjon og Flux til premium hero/detail. Hvis en provider mangler konfigurasjon, prøver Auto en kompatibel reserve.</p>
            </div>
          )}
          {explicitProviderUnavailable && <StatusLine icon={<AlertCircle className="h-4 w-4" />} text={`${selectedProvider?.label} er ikke tilgjengelig akkurat nå. Velg Auto eller konfigurer provideren før generering.`} tone="amber" />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Layers3 className="h-4 w-4" />4. Kampanjestruktur</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <div>
            <label className="mb-2 block text-xs text-gray-400">Hva skal denne batchen oppnå?</label>
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-5">
              {GROWTH_GOALS.map((goal) => (
                <button key={goal.id} type="button" onClick={() => setGrowthGoal(goal.id)} className={`rounded-lg border p-3 text-left transition ${growthGoal === goal.id ? "border-emerald-400 bg-emerald-400/10" : "border-gray-700 hover:border-gray-500"}`}>
                  <p className="text-sm font-semibold">{goal.label}</p>
                  <p className="mt-1 text-[11px] leading-4 text-gray-500">{goal.description}</p>
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-500">Målet lagres i Creative DNA. Det endrer hva RealtyFlow skal lære av senere, men publiserer eller flytter annonsebudsjett ikke automatisk.</p>
          </div>

          <div>
            <label className="mb-2 block text-xs text-gray-400">Kampanjestil</label>
            <div className="grid gap-2 md:grid-cols-3">
              {CAMPAIGN_STYLES.map((style) => (
                <button key={style.id} type="button" onClick={() => setCampaignStyle(style.id)} className={`rounded-lg border p-3 text-left ${campaignStyle === style.id ? "border-amber-400 bg-amber-400/10" : "border-gray-700"}`}>
                  <p className="text-sm font-medium">{style.label}</p><p className="mt-1 text-xs text-gray-500">{style.description}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <label className="mb-2 block text-xs text-gray-400">Antall annonser</label>
              <div className="grid grid-cols-4 gap-2">
                {[5, 10, 25, 50].map((count) => <button key={count} type="button" onClick={() => setTargetTotal(count)} className={`rounded-lg border p-3 ${targetTotal === count ? "border-amber-400 bg-amber-400/10" : "border-gray-700"}`}><strong>{count}</strong><span className="block text-[11px] text-gray-500">ads</span></button>)}
              </div>
            </div>
            <div>
              <label className="mb-2 block text-xs text-gray-400">Formater</label>
              <div className="grid grid-cols-4 gap-2">
                {FORMAT_OPTIONS.map((format) => (
                  <button key={format.id} type="button" onClick={() => setAspectRatios((current) => current.includes(format.id) ? current.length > 1 ? current.filter((item) => item !== format.id) : current : [...current, format.id])} className={`rounded-lg border p-2 ${aspectRatios.includes(format.id) ? "border-amber-400 bg-amber-400/10" : "border-gray-700"}`}>
                    <strong className="text-sm">{format.label}</strong><span className="block text-[10px] text-gray-500">{format.use}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-700 bg-gray-900/40 p-4">
            <p className="text-sm font-medium">{previewPlan.concepts.length} konsepter × strukturerte varianter</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {previewPlan.concepts.map((concept) => <div key={concept.id} className="rounded-md border border-gray-800 p-2"><p className="text-xs font-medium text-gray-200">{concept.angle}</p><p className="mt-1 line-clamp-2 text-[10px] text-gray-500">{concept.description}</p></div>)}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Type className="h-4 w-4" />5. Tekst og målgruppe</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Markeder"><Input value={targetMarkets} onChange={(event) => setTargetMarkets(event.target.value)} placeholder="ES, NO" /></Field>
            <Field label="Funnel"><select value={funnelStage} onChange={(event) => setFunnelStage(event.target.value)} className="h-10 w-full rounded-md border border-gray-700 bg-gray-900 px-3 text-sm"><option value="cold">Cold prospecting</option><option value="warm">Warm retargeting</option></select></Field>
            <Field label="Språk (valgfritt)"><Input value={defaultLanguage} onChange={(event) => setDefaultLanguage(event.target.value)} placeholder="nb-NO, en, es…" /></Field>
          </div>
          <Field label="Målgrupper"><Input value={audienceSegments} onChange={(event) => setAudienceSegments(event.target.value)} /></Field>
          <Field label="Brand voice"><Input value={brandVoice} onChange={(event) => setBrandVoice(event.target.value)} /></Field>
          <Field label="Tilbud / CTA"><Input value={offer} onChange={(event) => setOffer(event.target.value)} /></Field>

          <div>
            <label className="mb-2 block text-xs text-gray-400">Tekst-overlay</label>
            <div className="grid gap-2 md:grid-cols-3">
              {[
                { id: "none" as const, label: "Ingen", text: "Kun rene bilder." },
                { id: "suggestions" as const, label: "Forslag", text: "Headline, undertittel og CTA lagres separat." },
                { id: "automatic" as const, label: "Automatisk", text: "Overlay vises automatisk i galleri og nedlasting." },
              ].map((mode) => <button key={mode.id} type="button" onClick={() => setOverlayMode(mode.id)} className={`rounded-lg border p-3 text-left ${overlayMode === mode.id ? "border-cyan-400 bg-cyan-400/10" : "border-gray-700"}`}><p className="text-sm font-medium">{mode.label}</p><p className="mt-1 text-xs text-gray-500">{mode.text}</p></button>)}
            </div>
            <p className="mt-2 flex items-start gap-2 text-xs text-gray-500"><ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" />AI-providerne blir bedt om å la være å male annonseteksten inn i bildet. RealtyFlow håndterer korrekt tekst som et separat lag.</p>
          </div>
        </CardContent>
      </Card>

      {error && <StatusLine icon={<AlertCircle className="h-4 w-4" />} text={error} tone="red" />}

      <div className="flex flex-col items-end gap-2">
        <Button onClick={handleSubmit} disabled={!ready || submitting || Boolean(explicitProviderUnavailable)} className="gap-2">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          Opprett kampanje og start research
        </Button>
        {!ready && <p className="text-xs text-gray-500">Legg inn kampanjenavn, produkt, bilde og produktbeskrivelse.</p>}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="mb-1 block text-xs text-gray-400">{label}</label>{children}</div>;
}

function StatusLine({ icon, text, tone }: { icon: React.ReactNode; text: string; tone: "amber" | "green" | "red" }) {
  const classes = tone === "green" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : tone === "red" ? "border-red-500/30 bg-red-500/10 text-red-200" : "border-amber-500/30 bg-amber-500/10 text-amber-200";
  return <div className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${classes}`}>{icon}<span>{text}</span></div>;
}