"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImageUpload } from "@/components/ui/image-upload";
import { Loader2, Sparkles, ArrowRight, Wand2, RefreshCw } from "lucide-react";
import { BRANDS } from "@/lib/constants";

interface BankImage {
  id: string;
  url: string;
  thumbnail_url?: string | null;
  name: string | null;
  kind: "product" | "variant" | "image" | "logo" | "thumbnail";
  tags: string[] | null;
  created_at: string;
}

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
  const [audienceSegments, setAudienceSegments] = useState("Premium consumers, B2B");
  const [brandVoice, setBrandVoice] = useState("");
  const [funnelStage, setFunnelStage] = useState("cold");

  // ─── AI image analysis state ──────────────────────────
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState("");
  const [aiFilled, setAiFilled] = useState(false);
  const [analysisConfidence, setAnalysisConfidence] = useState<"high" | "medium" | "low" | null>(null);

  const runImageAnalysis = async (url: string) => {
    if (!url) return;
    setAnalyzing(true);
    setAnalyzeError("");
    try {
      const res = await fetch("/api/ad-campaigns/analyze-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: url, enrich: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analyse feilet");
      const a = data.analysis;
      // Only auto-fill empty fields so the user's edits aren't overwritten
      if (a.product_name && !productName) setProductName(a.product_name);
      if (a.label_description && !labelDescription) setLabelDescription(a.label_description);
      if (!name && a.brand_hint && a.category_hint) {
        setName(`${a.brand_hint} — ${a.category_hint} kampanje`);
      }
      setAnalysisConfidence(a.confidence);
      setAiFilled(true);
    } catch (e) {
      setAnalyzeError(e instanceof Error ? e.message : String(e));
    } finally {
      setAnalyzing(false);
    }
  };

  const handleImageChange = (url: string) => {
    setProductImageUrl(url);
    setAiFilled(false);
    setAnalysisConfidence(null);
    if (url) runImageAnalysis(url);
  };
  const [offer, setOffer] = useState("15% on first order");
  const [targetTotal, setTargetTotal] = useState(50);
  const [aspectRatios, setAspectRatios] = useState<string[]>(["1:1", "9:16"]);
  const [bankImages, setBankImages] = useState<BankImage[]>([]);
  const [bankLoading, setBankLoading] = useState(false);

  const selectedBrand = BRANDS.find((b) => b.id === brandId);
  const estimatedCost = (targetTotal * 0.04).toFixed(2);
  const estimatedMinutes = Math.max(2, Math.ceil(targetTotal / 5)); // ~5 ads/min at concurrency 2

  // Auto-fill brand voice when brand changes
  const handleBrandChange = (id: string) => {
    setBrandId(id);
    const b = BRANDS.find((x) => x.id === id);
    if (b?.tone && !brandVoice) setBrandVoice(b.tone);
    if (b?.target_audience && !audienceSegments) setAudienceSegments(b.target_audience);
  };

  useEffect(() => {
    const loadBankImages = async () => {
      setBankLoading(true);
      try {
        const [productsRes, variantsRes] = await Promise.all([
          fetch("/api/neural-beat/image-bank?kind=product&owner=all&limit=12"),
          fetch("/api/neural-beat/image-bank?kind=variant&owner=all&limit=8"),
        ]);
        const products = await productsRes.json().catch(() => ({}));
        const variants = await variantsRes.json().catch(() => ({}));
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
      const res = await fetch("/api/ad-campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand_id: brandId,
          name,
          product_name: productName,
          product_image_url: productImageUrl,
          label_description: labelDescription,
          target_markets: targetMarkets.split(",").map((s) => s.trim()).filter(Boolean),
          audience_segments: audienceSegments.split(",").map((s) => s.trim()).filter(Boolean),
          brand_voice: brandVoice || null,
          funnel_stage: funnelStage,
          offer: offer || null,
          total_creatives: targetTotal,
          aspect_ratios: aspectRatios,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create");
      router.push(`/ad-campaigns/${data.campaign.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  };

  const ready = brandId && name && productName && productImageUrl && labelDescription;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-amber-400" />
          Ny ad-kampanje
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          50 IG/Meta-annonser fra ett produktbilde · ~$2 · ~9 min
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>1. Brand</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {BRANDS.map((b) => (
            <button
              key={b.id}
              onClick={() => handleBrandChange(b.id)}
              className={`p-3 rounded-lg border text-left transition-all ${
                brandId === b.id
                  ? "border-amber-400 bg-amber-400/10"
                  : "border-gray-700 hover:border-gray-500"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: b.color }} />
                <span className="font-medium text-sm">{b.name}</span>
              </div>
              <p className="text-xs text-gray-400 capitalize">{b.type}</p>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>2. Produkt</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Kampanje-navn</label>
            <Input value={name} onChange={(e) => setName(e.target.value)}
              placeholder="f.eks. Verde Alto Sommerkampanje 2026" />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Produktnavn (eksakt, slik det skal vises i prompts)</label>
            <Input value={productName} onChange={(e) => setProductName(e.target.value)}
              placeholder="Doña Anna Verde Alto olive oil bottle" />
          </div>
          <ImageUpload
            value={productImageUrl}
            onChange={handleImageChange}
            label="Produktbilde"
            hint="JPG, PNG eller WebP — maks 10MB. AI analyserer automatisk."
            uploadFields={{
              save_to_bank: "true",
              bank_kind: "product",
              bank_owner: brandId || "system",
              bank_name: productName || name || "Ad campaign produktbilde",
              bank_tags: `product,ad-campaign,${brandId}`,
            }}
          />

          {bankImages.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-gray-400 block">Eller velg et opplastet produktbilde</label>
                {bankLoading && <span className="text-[10px] text-gray-500">Laster arkiv...</span>}
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {bankImages.slice(0, 10).map((img) => (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => {
                      handleImageChange(img.url);
                      if (!productName && img.name) setProductName(img.name.replace(/\.[a-z0-9]+$/i, ""));
                    }}
                    className={`relative aspect-square rounded-md overflow-hidden border transition-all bg-gray-900 ${
                      productImageUrl === img.url
                        ? "border-amber-400 ring-2 ring-amber-400/30"
                        : "border-gray-700 hover:border-amber-300"
                    }`}
                    title={img.name || "Produktbilde"}
                  >
                    <img src={img.thumbnail_url || img.url} alt={img.name || "Produktbilde"} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                    <span className="absolute left-1 bottom-1 right-1 truncate rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                      {img.kind === "variant" ? "Variant" : img.name || "Produkt"}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* AI analysis status */}
          {analyzing && (
            <div className="flex items-center gap-2 text-sm text-amber-400 -mt-1">
              <Loader2 className="w-4 h-4 animate-spin" />
              AI analyserer bildet og fyller ut produktnavn + etikett-beskrivelse…
            </div>
          )}
          {aiFilled && !analyzing && (
            <div className="flex items-center justify-between gap-2 text-sm -mt-1">
              <span className="flex items-center gap-2 text-emerald-400">
                <Wand2 className="w-4 h-4" />
                AI-analyse fullført
                {analysisConfidence && (
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    analysisConfidence === "high" ? "bg-emerald-500/20 text-emerald-300" :
                    analysisConfidence === "medium" ? "bg-amber-500/20 text-amber-300" :
                    "bg-red-500/20 text-red-300"
                  }`}>
                    {analysisConfidence} confidence
                  </span>
                )}
              </span>
              <button
                onClick={() => runImageAnalysis(productImageUrl)}
                className="text-xs text-gray-400 hover:text-amber-400 flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" /> Analyser på nytt
              </button>
            </div>
          )}
          {analyzeError && (
            <div className="text-xs text-red-400 -mt-1">
              AI-analyse feilet: {analyzeError}. Du kan fylle inn manuelt nedenfor.
            </div>
          )}

          <p className="text-xs text-gray-500 -mt-1">
            Bildet lastes opp til Supabase Storage og brukes som referanse for hver av de 50 ads.
          </p>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">
              Etikett-beskrivelse <span className="text-amber-400">(kritisk for label-bevaring)</span>
            </label>
            <textarea
              value={labelDescription}
              onChange={(e) => setLabelDescription(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-sm"
              placeholder="cream label with gold foil DOÑA ANNA text, the elegant gold seated woman illustration, VERDE ALTO subtitle, and small text 'Aceite de Oliva Virgen Extra Ecológico…'. The dark green glass bottle with gold cap"
            />
            <p className="text-xs text-gray-500 mt-1">
              Beskriv hver detalj på etiketten verbatim — farger, typografi, illustrasjoner, all småtekst. Dette låser nøyaktigheten.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>3. Strategi</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Markeder (komma-separert)</label>
              <Input value={targetMarkets} onChange={(e) => setTargetMarkets(e.target.value)}
                placeholder="ES, NO" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Funnel</label>
              <select
                value={funnelStage}
                onChange={(e) => setFunnelStage(e.target.value)}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-sm"
              >
                <option value="cold">Cold prospecting</option>
                <option value="warm">Warm retargeting</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Audience (komma-separert)</label>
            <Input value={audienceSegments} onChange={(e) => setAudienceSegments(e.target.value)}
              placeholder="Premium restaurants, Health-conscious consumers" />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Brand voice</label>
            <Input value={brandVoice} onChange={(e) => setBrandVoice(e.target.value)}
              placeholder="elegant, refined, Mediterranean-feminine" />
            {selectedBrand?.tone && (
              <p className="text-xs text-gray-500 mt-1">Forhåndsutfylt fra brand: {selectedBrand.tone}</p>
            )}
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Tilbud / CTA</label>
            <Input value={offer} onChange={(e) => setOffer(e.target.value)}
              placeholder="15% on first order" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>4. Antall &amp; format</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 mb-2 block">Antall ads</label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {[10, 25, 50, 100, 200].map((n) => (
                <button
                  key={n}
                  onClick={() => setTargetTotal(n)}
                  className={`p-3 rounded-lg border text-center transition-all ${
                    targetTotal === n
                      ? "border-amber-400 bg-amber-400/10"
                      : "border-gray-700 hover:border-gray-500"
                  }`}
                >
                  <div className="font-semibold">{n}</div>
                  <div className="text-xs text-gray-500">ads</div>
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Estimat: <span className="text-amber-400">${estimatedCost}</span> · ~{estimatedMinutes} min
            </p>
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-2 block">Format</label>
            <div className="flex gap-2">
              {[
                { id: "1:1", label: "1:1 Feed" },
                { id: "9:16", label: "9:16 Reels/Stories" },
              ].map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    setAspectRatios((prev) =>
                      prev.includes(r.id)
                        ? prev.length > 1 ? prev.filter((x) => x !== r.id) : prev
                        : [...prev, r.id]
                    );
                  }}
                  className={`flex-1 p-3 rounded-lg border text-sm transition-all ${
                    aspectRatios.includes(r.id)
                      ? "border-amber-400 bg-amber-400/10 text-amber-100"
                      : "border-gray-700 hover:border-gray-500 text-gray-400"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Du kan velge ett eller begge — minst ett må være valgt.
            </p>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-md text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button onClick={handleSubmit} disabled={!ready || submitting} className="gap-2">
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
          Opprett og start research
        </Button>
      </div>
      {!ready && (
        <p className="text-xs text-gray-500 text-right">
          Fyll inn alle obligatoriske felter for å fortsette.
        </p>
      )}
    </div>
  );
}
