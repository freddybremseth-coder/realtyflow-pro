"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, ArrowRight } from "lucide-react";
import { BRANDS } from "@/lib/constants";

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
  const [offer, setOffer] = useState("15% on first order");

  const selectedBrand = BRANDS.find((b) => b.id === brandId);

  // Auto-fill brand voice when brand changes
  const handleBrandChange = (id: string) => {
    setBrandId(id);
    const b = BRANDS.find((x) => x.id === id);
    if (b?.tone && !brandVoice) setBrandVoice(b.tone);
    if (b?.target_audience && !audienceSegments) setAudienceSegments(b.target_audience);
  };

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
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Produktbilde URL (offentlig tilgjengelig)</label>
            <Input value={productImageUrl} onChange={(e) => setProductImageUrl(e.target.value)}
              placeholder="https://..." />
            <p className="text-xs text-gray-500 mt-1">Last opp via Image Studio eller bruk eksisterende CDN-URL.</p>
          </div>
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
