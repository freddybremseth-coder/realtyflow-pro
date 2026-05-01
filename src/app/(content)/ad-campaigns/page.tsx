"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Sparkles, Loader2, ExternalLink } from "lucide-react";
import { BRANDS } from "@/lib/constants";
import type { AdCampaign } from "@/types/ads";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: "Utkast", color: "bg-gray-500" },
  brief_pending: { label: "Brief klar", color: "bg-blue-500" },
  matrix_pending: { label: "Matrise klar", color: "bg-blue-500" },
  generating: { label: "Genererer…", color: "bg-amber-500" },
  completed: { label: "Ferdig", color: "bg-emerald-500" },
  failed: { label: "Feil", color: "bg-red-500" },
};

export default function AdCampaignsPage() {
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/ad-campaigns")
      .then((r) => r.json())
      .then((d) => setCampaigns(d.campaigns ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-amber-400" />
            Ad Campaign Generator
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            50 IG/Meta annonser fra ett produktbilde · Flux Kontext Pro · ~$2 per kampanje
          </p>
        </div>
        <Link href="/ad-campaigns/new">
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            Ny kampanje
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" /> Laster kampanjer…
        </div>
      ) : campaigns.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-400">
            <p className="mb-4">Ingen kampanjer ennå.</p>
            <Link href="/ad-campaigns/new">
              <Button variant="outline" className="gap-2">
                <Plus className="w-4 h-4" />
                Lag din første kampanje
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((c) => {
            const brand = BRANDS.find((b) => b.id === c.brand_id);
            const status = STATUS_LABELS[c.status] ?? STATUS_LABELS.draft;
            return (
              <Link key={c.id} href={`/ad-campaigns/${c.id}`}>
                <Card className="hover:bg-gray-800/40 transition-colors cursor-pointer">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-base">{c.name}</CardTitle>
                      <Badge className={`${status.color} text-white text-xs`}>
                        {status.label}
                      </Badge>
                    </div>
                    {brand && (
                      <p className="text-xs text-gray-400 flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: brand.color }}
                        />
                        {brand.name}
                      </p>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-gray-300">
                    <p className="line-clamp-2 text-gray-400">{c.product_name}</p>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span>{c.succeeded_count}/{c.total_creatives} ferdige</span>
                      {c.estimated_cost_usd && (
                        <span>· est. ${c.estimated_cost_usd}</span>
                      )}
                    </div>
                    <ExternalLink className="w-4 h-4 text-gray-500 ml-auto" />
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
