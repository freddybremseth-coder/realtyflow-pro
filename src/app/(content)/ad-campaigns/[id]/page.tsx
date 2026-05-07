"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Loader2, Sparkles, FileText, LayoutGrid, Wand2, Send, Star,
  CheckCircle, AlertCircle, RefreshCw, ArrowRight,
} from "lucide-react";
import type { AdCampaign, AdCreative } from "@/types/ads";
import { BRANDS } from "@/lib/constants";

export default function AdCampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [campaign, setCampaign] = useState<AdCampaign | null>(null);
  const [creatives, setCreatives] = useState<AdCreative[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string>("");
  const [error, setError] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/ad-campaigns/${id}`);
    const data = await res.json();
    setCampaign(data.campaign);
    setCreatives(data.creatives ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Poll while generating
  useEffect(() => {
    if (campaign?.status === "generating") {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(load, 4000);
      return () => { if (pollRef.current) clearInterval(pollRef.current); };
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [campaign?.status, load]);

  const post = async (path: string, body?: Record<string, unknown>) => {
    setBusy(path);
    setError("");
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      await load();
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  };

  // Auto-batch loop while generating. Stops on safety conditions to
  // avoid runaway loops if the API is misbehaving.
  const generateBatch = async () => {
    let keepGoing = true;
    let iterations = 0;
    let lastCompleted = -1;
    let stalledRounds = 0;
    while (keepGoing && iterations < 60) {  // hard cap: 60 iterations
      iterations++;
      try {
        const res = await fetch(`/api/ad-campaigns/${id}/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batch_size: 4 }),
        });
        const data = await res.json();
        await load();

        // Detect stalls: if completed_total isn't increasing across rounds, stop
        if (data.completed_total === lastCompleted) {
          stalledRounds++;
          if (stalledRounds >= 3) {
            setError("Generation ser ut til å henge — prøv 'Retry failed' for å gjenoppta.");
            break;
          }
        } else {
          stalledRounds = 0;
          lastCompleted = data.completed_total;
        }

        keepGoing = data.pending_total > 0;
        if (data.status === "completed" || data.status === "failed") keepGoing = false;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        break;
      }
    }
    setBusy("");
  };

  const startGeneration = async () => {
    setBusy("/api/ad-campaigns/generate");
    setError("");
    try {
      await generateBatch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy("");
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin" /> Laster…
      </div>
    );
  }
  if (!campaign) {
    return <div className="p-6 text-red-400">Kampanje ikke funnet.</div>;
  }

  const brand = BRANDS.find((b) => b.id === campaign.brand_id);
  const total = campaign.total_creatives || 50;
  const done = campaign.succeeded_count || 0;
  const failed = campaign.failed_count || 0;
  const pct = total > 0 ? (done / total) * 100 : 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-amber-400" />
            {campaign.name}
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            {brand?.name} · {campaign.product_name}
          </p>
        </div>
        <Badge className="text-xs">{campaign.status}</Badge>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-md text-sm text-red-400 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="flex-1">{error}</div>
        </div>
      )}

      {/* Progress strip */}
      <Card>
        <CardContent className="py-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">Fremgang</span>
            <span className="font-medium">{done}/{total} ferdige · {failed} feil</span>
          </div>
          <Progress value={pct} className="h-2" />
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span>Estimert: ${campaign.estimated_cost_usd ?? "?"}</span>
          </div>
        </CardContent>
      </Card>

      {/* Step 1 — Brief */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="w-4 h-4" /> 1. Creative Brief
          </CardTitle>
          {!campaign.brief && (
            <Button size="sm" disabled={!!busy} onClick={() => post(`/api/ad-campaigns/${id}/research`)} className="gap-2">
              {busy.includes("research") ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
              Generer brief
            </Button>
          )}
        </CardHeader>
        {campaign.brief && (
          <CardContent className="space-y-3 text-sm">
            <ul className="space-y-1.5 list-disc list-inside text-gray-300">
              {campaign.brief.bullets?.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
            <div className="flex flex-wrap gap-1.5 pt-2">
              {campaign.brief.top_angles?.map((a) => (
                <Badge key={a} variant="outline" className="text-xs">{a}</Badge>
              ))}
            </div>
            {campaign.brief.sources?.length > 0 && (
              <div className="text-xs text-gray-500 pt-2">
                Kilder: {campaign.brief.sources.map((s, i) => (
                  <a key={i} href={s.url} target="_blank" rel="noreferrer" className="text-amber-400 hover:underline ml-1">
                    {s.title}
                  </a>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Step 2 — Matrix */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <LayoutGrid className="w-4 h-4" /> 2. 50-Ad Matrix
          </CardTitle>
          {campaign.brief && !campaign.matrix && (
            <Button size="sm" disabled={!!busy} onClick={() => post(`/api/ad-campaigns/${id}/matrix`)} className="gap-2">
              {busy.includes("matrix") ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3" />}
              Bygg matrise
            </Button>
          )}
        </CardHeader>
        {campaign.matrix && (
          <CardContent className="space-y-2 text-sm">
            <div className="text-gray-400">
              {campaign.matrix.scenes.length} scener × {campaign.matrix.aspect_ratios.length} ratios = {campaign.matrix.total_creatives} ads
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-1.5 pt-2">
              {Object.entries(campaign.matrix.mood_distribution || {}).map(([mood, count]) => (
                <Badge key={mood} variant="outline" className="text-xs justify-center">
                  {mood}: {count as number}
                </Badge>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Step 3 — Generation */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wand2 className="w-4 h-4" /> 3. Generering
          </CardTitle>
          {campaign.matrix && campaign.status !== "completed" && campaign.status !== "generating" && (
            <Button size="sm" disabled={!!busy} onClick={startGeneration} className="gap-2">
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
              Start generering (~$2, ~9 min)
            </Button>
          )}
          {campaign.status === "generating" && (
            <Button size="sm" disabled={!!busy} onClick={startGeneration} variant="outline" className="gap-2">
              <RefreshCw className="w-3 h-3 animate-spin" /> Behandler…
            </Button>
          )}
          {failed > 0 && campaign.status !== "generating" && (
            <Button
              size="sm"
              variant="outline"
              disabled={!!busy}
              onClick={async () => {
                await post(`/api/ad-campaigns/${id}/retry-failed`);
                await startGeneration();
              }}
              className="gap-2 text-amber-300 border-amber-500/40"
            >
              <RefreshCw className="w-3 h-3" />
              Retry {failed} failed
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {creatives.length === 0 ? (
            <p className="text-sm text-gray-500">Ingen creatives ennå — bygg matrisen først.</p>
          ) : (
            <CreativeGallery creatives={creatives} />
          )}
        </CardContent>
      </Card>

      {/* Step 4 — Delivery */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Send className="w-4 h-4" /> 4. Leveranse
          </CardTitle>
          <div className="flex gap-2">
            {campaign.status === "completed" && !campaign.delivery && (
              <Button size="sm" disabled={!!busy} onClick={() => post(`/api/ad-campaigns/${id}/delivery`)} className="gap-2">
                {busy.includes("delivery") ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                Generer captions + top 5
              </Button>
            )}
            {campaign.delivery && (
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => post(`/api/ad-campaigns/${id}/push-to-hub`)} className="gap-2">
                {busy.includes("push-to-hub") ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                Push top 5 til Content Hub
              </Button>
            )}
          </div>
        </CardHeader>
        {campaign.delivery && (
          <CardContent className="space-y-4 text-sm">
            <div>
              <h3 className="font-medium mb-2 flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-400" /> Top 5 A/B picks
              </h3>
              <ol className="space-y-1.5 list-decimal list-inside text-gray-300">
                {campaign.delivery.top_picks?.map((p) => {
                  const c = creatives.find((x) => x.id === p.creative_id);
                  return (
                    <li key={p.creative_id}>
                      <span className="font-medium">{c?.scene_id} {c?.aspect_ratio}</span>
                      <span className="text-gray-400"> — {p.rationale}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
            {campaign.delivery.per_angle_captions && (
              <div>
                <h3 className="font-medium mb-2">Captions per angle</h3>
                <div className="space-y-2">
                  {Object.entries(campaign.delivery.per_angle_captions).map(([angle, pack]) => (
                    <div key={angle} className="p-3 bg-gray-900/40 rounded-md">
                      <div className="text-xs text-amber-400 mb-1">{angle}</div>
                      <div className="text-gray-300">{pack.primary}</div>
                      {pack.secondary && (
                        <div className="text-gray-400 text-xs italic">{pack.secondary}</div>
                      )}
                      <div className="text-xs text-gray-500 mt-1">{pack.hashtags?.join(" ")}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}

// ─── Gallery component ─────────────────────────────────────────────────
function CreativeGallery({ creatives }: { creatives: AdCreative[] }) {
  const byAngle: Record<string, AdCreative[]> = {};
  for (const c of creatives) {
    (byAngle[c.angle] ||= []).push(c);
  }

  return (
    <div className="space-y-6">
      {Object.entries(byAngle).map(([angle, items]) => (
        <div key={angle}>
          <h4 className="text-sm font-medium text-gray-300 mb-2">{angle}</h4>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {items.map((c) => (
              <div key={c.id} className="relative aspect-square bg-gray-900 rounded-md overflow-hidden border border-gray-800">
                {c.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.image_url} alt={c.scene_id} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                ) : c.status === "generating" ? (
                  <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                  </div>
                ) : c.status === "failed" ? (
                  <div
                    className="absolute inset-0 flex flex-col items-center justify-center text-red-400 p-2 text-center cursor-help"
                    title={c.error || "Failed"}
                  >
                    <AlertCircle className="w-4 h-4 mb-1" />
                    <span className="text-[10px] line-clamp-3">{c.error?.slice(0, 80) || "Failed"}</span>
                  </div>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-gray-600 text-xs">
                    pending
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-black/70 text-xs flex items-center justify-between">
                  <span>{c.scene_id} {c.aspect_ratio}</span>
                  {c.is_top_pick && <Star className="w-3 h-3 text-amber-400 fill-amber-400" />}
                </div>
                {c.status === "completed" && (
                  <CheckCircle className="absolute top-1 right-1 w-3 h-3 text-emerald-400" />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
