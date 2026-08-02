"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Cpu,
  ExternalLink,
  Layers3,
  Loader2,
  Plus,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BRANDS } from "@/lib/constants";
import type { AdCampaign } from "@/types/ads";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: "Utkast", color: "bg-gray-500" },
  brief_pending: { label: "Brief klar", color: "bg-blue-500" },
  matrix_pending: { label: "Klar", color: "bg-cyan-600" },
  generating: { label: "Genererer…", color: "bg-amber-500" },
  completed: { label: "Ferdig", color: "bg-emerald-500" },
  failed: { label: "Feil", color: "bg-red-500" },
};

function providerLabel(provider?: string | null) {
  if (provider === "flux" || provider === "replicate") return "Flux Kontext Pro";
  if (provider === "openart") return "OpenArt";
  if (provider === "gemini") return "Gemini";
  return "Auto";
}

export default function AdCampaignsPage() {
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/ad-campaigns", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Kunne ikke hente kampanjer.");
        setCampaigns(data.campaigns || []);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : String(caught)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Sparkles className="h-6 w-6 text-amber-400" />Ad Campaign Generator</h1>
          <p className="mt-1 text-sm text-gray-400">Opptil 50 IG/Meta-annonser fra ett produktbilde · Auto, OpenArt, Gemini og Flux Kontext Pro</p>
          <div className="mt-3 flex flex-wrap gap-2"><Badge variant="outline">10 annonsevinkler</Badge><Badge variant="outline">Separate tekst-overlays</Badge><Badge variant="outline">Media Library + Content Hub</Badge></div>
        </div>
        <Link href="/ad-campaigns/new"><Button className="gap-2"><Plus className="h-4 w-4" />Ny kampanje</Button></Link>
      </div>

      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400"><Loader2 className="h-4 w-4 animate-spin" />Laster kampanjer…</div>
      ) : campaigns.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-gray-400"><p className="mb-4">Ingen kampanjer ennå.</p><Link href="/ad-campaigns/new"><Button variant="outline" className="gap-2"><Plus className="h-4 w-4" />Lag din første kampanje</Button></Link></CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((campaign) => {
            const brand = BRANDS.find((item) => item.id === campaign.brand_id);
            const status = STATUS_LABELS[campaign.status] || STATUS_LABELS.draft;
            return (
              <Link key={campaign.id} href={`/ad-campaigns/${campaign.id}`}>
                <Card className="h-full cursor-pointer transition-colors hover:bg-gray-800/40">
                  <CardHeader className="space-y-3">
                    <div className="flex items-start justify-between gap-3"><CardTitle className="text-base">{campaign.name}</CardTitle><Badge className={`${status.color} text-xs text-white`}>{status.label}</Badge></div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="outline" className="gap-1"><Cpu className="h-3 w-3" />{providerLabel(campaign.image_provider)}</Badge>
                      <Badge variant="outline" className="gap-1"><Layers3 className="h-3 w-3" />{campaign.concept_count || campaign.matrix?.concept_groups?.length || 10} konsepter</Badge>
                    </div>
                    {brand && <p className="flex items-center gap-1.5 text-xs text-gray-400"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: brand.color }} />{brand.name}</p>}
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <p className="line-clamp-2 text-gray-400">{campaign.product_name}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500"><span>{campaign.succeeded_count}/{campaign.total_creatives} ferdige</span><span>·</span><span>est. ${Number(campaign.estimated_cost_usd || 0).toFixed(2)}</span></div>
                    <div className="flex items-center justify-between text-xs text-gray-500"><span>{campaign.campaign_style?.replace(/_/g, " ") || "mixed"} · {campaign.overlay_mode || "suggestions"}</span><ExternalLink className="h-4 w-4" /></div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
