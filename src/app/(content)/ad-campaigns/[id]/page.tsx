"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  FileText,
  Layers3,
  LayoutGrid,
  Library,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
  Star,
  Wand2,
} from "lucide-react";
import { AdCampaignCreativeGallery } from "@/components/ad-campaigns/creative-gallery";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { AdCampaign, AdCreative } from "@/types/ads";
import { BRANDS } from "@/lib/constants";

const STATUS_LABEL: Record<string, string> = {
  draft: "Utkast",
  brief_pending: "Brief klar",
  matrix_pending: "Klar for generering",
  generating: "Genererer",
  completed: "Ferdig",
  failed: "Feilet",
};

function providerLabel(provider: string) {
  if (provider === "flux") return "Flux Kontext Pro";
  if (provider === "openart") return "OpenArt";
  if (provider === "gemini") return "Gemini";
  if (provider === "auto") return "Auto";
  return provider;
}

export default function AdCampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [campaign, setCampaign] = useState<AdCampaign | null>(null);
  const [creatives, setCreatives] = useState<AdCreative[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const pollRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/ad-campaigns/${id}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Kunne ikke hente kampanjen.");
    setCampaign(data.campaign || null);
    setCreatives(data.creatives || []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load().catch((caught) => {
      setError(caught instanceof Error ? caught.message : String(caught));
      setLoading(false);
    });
  }, [load]);

  useEffect(() => {
    if (campaign?.status !== "generating") {
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
      return;
    }
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(() => void load().catch(() => undefined), 5_000);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [campaign?.status, load]);

  const post = async (path: string, body?: Record<string, unknown>) => {
    setBusy(path);
    setError("");
    setNotice("");
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Handlingen feilet.");
      await load();
      return data;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return null;
    } finally {
      setBusy("");
    }
  };

  const generateBatch = async () => {
    let keepGoing = true;
    let iterations = 0;
    let lastCompleted = -1;
    let stalledRounds = 0;

    while (keepGoing && iterations < 70) {
      iterations += 1;
      const response = await fetch(`/api/ad-campaigns/${id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch_size: 3 }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Genereringen feilet.");
      await load();

      if (data.rate_limited) {
        setError("En provider nådde kreditt- eller rategrensen. De gjenværende annonsene ligger fortsatt i køen. Fyll på kreditt eller velg Auto/regenerer med en annen provider.");
        break;
      }

      if (data.completed_total === lastCompleted) {
        stalledRounds += 1;
        if (stalledRounds >= 8) {
          setNotice("Noen eksterne bildejobber behandler fortsatt. Trykk «Fortsett generering» om litt; eksisterende provider-jobber gjenopptas uten dobbelt innsending.");
          break;
        }
      } else {
        lastCompleted = data.completed_total;
        stalledRounds = 0;
      }

      keepGoing = data.pending_total > 0 || data.generating_total > 0;
      if (data.status === "completed" || data.status === "failed") keepGoing = false;
    }
  };

  const startGeneration = async () => {
    setBusy("generate");
    setError("");
    setNotice("");
    try {
      await generateBatch();
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy("");
    }
  };

  const exportAll = async () => {
    setBusy("export-all");
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/ad-campaigns/${id}/export-all`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kampanjeeksporten feilet.");
      setNotice(`${data.exported || 0} nye annonser ble sendt til Content Hub. ${data.alreadyExported || 0} var allerede eksportert.${data.failed?.length ? ` ${data.failed.length} feilet.` : ""}`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy("");
    }
  };

  const providerCounts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const creative of creatives) {
      if (creative.provider) result[creative.provider] = (result[creative.provider] || 0) + 1;
    }
    return result;
  }, [creatives]);

  if (loading) {
    return <div className="flex items-center gap-2 p-6 text-gray-400"><Loader2 className="h-4 w-4 animate-spin" />Laster kampanjen…</div>;
  }
  if (!campaign) return <div className="p-6 text-red-400">Kampanjen ble ikke funnet.</div>;

  const brand = BRANDS.find((item) => item.id === campaign.brand_id);
  const total = campaign.total_creatives || creatives.length || 50;
  const done = campaign.succeeded_count || creatives.filter((creative) => creative.status === "completed").length;
  const failed = campaign.failed_count || creatives.filter((creative) => creative.status === "failed").length;
  const pending = creatives.filter((creative) => creative.status === "pending").length;
  const processing = creatives.filter((creative) => creative.status === "generating").length;
  const percent = total > 0 ? (done / total) * 100 : 0;
  const canGenerate = Boolean(campaign.matrix && (pending > 0 || processing > 0 || failed > 0));

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Sparkles className="h-6 w-6 text-amber-400" />{campaign.name}</h1>
          <p className="mt-1 text-sm text-gray-400">{brand?.name || campaign.brand_id} · {campaign.product_name}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge>{STATUS_LABEL[campaign.status] || campaign.status}</Badge>
            <Badge variant="outline">Motor: {providerLabel(campaign.image_provider || "auto")}</Badge>
            <Badge variant="outline">{campaign.campaign_style?.replace(/_/g, " ") || "mixed"}</Badge>
            <Badge variant="outline">Overlay: {campaign.overlay_mode || "suggestions"}</Badge>
            {campaign.preserve_product_identity && <Badge variant="success">Produktidentitet låst</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/ad-campaigns/${id}/performance`}><Button variant="outline" className="gap-2"><BarChart3 className="h-4 w-4" />Creative Intelligence</Button></Link>
          <Link href="/ad-campaigns/new"><Button variant="outline">Ny kampanje</Button></Link>
          <Link href="/media-studio"><Button variant="outline" className="gap-2"><Library className="h-4 w-4" />Media Library</Button></Link>
        </div>
      </div>

      {error && <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}
      {notice && <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><span>{notice}</span></div>}

      <Card>
        <CardContent className="space-y-4 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className="text-gray-400">Kampanjefremgang</span>
            <span className="font-medium">{done}/{total} ferdige · {pending} i kø · {processing} behandler · {failed} feil</span>
          </div>
          <Progress value={percent} className="h-2" />
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Estimert kostnad: ${Number(campaign.estimated_cost_usd || 0).toFixed(2)}</Badge>
            {Object.entries(providerCounts).map(([provider, count]) => <Badge key={provider} variant="outline">{providerLabel(provider)}: {count}</Badge>)}
            {campaign.matrix?.concept_groups && <Badge variant="outline">{campaign.matrix.concept_groups.length} konsepter</Badge>}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4" />1. Creative Brief</CardTitle>
            {!campaign.brief && <Button size="sm" disabled={Boolean(busy)} onClick={() => void post(`/api/ad-campaigns/${id}/research`)} className="gap-2">{busy.includes("research") ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}Generer brief</Button>}
          </CardHeader>
          <CardContent>
            {campaign.brief ? (
              <div className="space-y-3 text-sm">
                <ul className="space-y-1.5 text-gray-300">{campaign.brief.bullets?.map((bullet, index) => <li key={index} className="flex gap-2"><span className="text-amber-400">•</span><span>{bullet}</span></li>)}</ul>
                <div className="flex flex-wrap gap-1.5">{campaign.brief.top_angles?.map((angle) => <Badge key={angle} variant="outline">{angle}</Badge>)}</div>
              </div>
            ) : <p className="text-sm text-gray-500">Research og brief må genereres før kampanjematrisen bygges.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base"><LayoutGrid className="h-4 w-4" />2. Konseptmatrise</CardTitle>
            {campaign.brief && !campaign.matrix && <Button size="sm" disabled={Boolean(busy)} onClick={() => void post(`/api/ad-campaigns/${id}/matrix`)} className="gap-2">{busy.includes("matrix") ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />}Bygg kampanjematrise</Button>}
          </CardHeader>
          <CardContent>
            {campaign.matrix ? (
              <div className="space-y-3">
                <p className="text-sm text-gray-400">{campaign.matrix.concept_groups?.length || campaign.matrix.scenes.length} konseptfamilier · {campaign.matrix.total_creatives} annonser · {campaign.matrix.aspect_ratios.join(", ")}</p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {(campaign.matrix.concept_groups || campaign.matrix.scenes.map((scene) => ({ id: scene.id, angle: scene.angle, description: scene.prompt_body }))).map((concept) => <div key={concept.id} className="rounded-lg border border-gray-800 p-2"><p className="text-xs font-medium text-gray-200">{concept.angle}</p><p className="mt-1 line-clamp-2 text-[11px] text-gray-500">{concept.description}</p></div>)}
                </div>
              </div>
            ) : <p className="text-sm text-gray-500">Bygg matrisen for å opprette provider-rutede annonsevarianter.</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-col items-start gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div><CardTitle className="flex items-center gap-2 text-base"><Layers3 className="h-4 w-4" />3. Produksjon og annonser</CardTitle><p className="mt-1 text-xs text-gray-500">Resultatene grupperes etter annonsevinkel. Teksten ligger separat fra AI-bildet og kan redigeres uten regenerering.</p></div>
          <div className="flex flex-wrap gap-2">
            {campaign.matrix && canGenerate && <Button size="sm" disabled={Boolean(busy)} onClick={() => void startGeneration()} className="gap-2">{busy === "generate" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}{done > 0 ? "Fortsett generering" : "Start generering"}</Button>}
            {failed > 0 && campaign.status !== "generating" && <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={async () => { const result = await post(`/api/ad-campaigns/${id}/retry-failed`); if (result) await startGeneration(); }} className="gap-2 text-amber-300"><RefreshCw className="h-3 w-3" />Prøv {failed} feil på nytt</Button>}
          </div>
        </CardHeader>
        <CardContent>
          {creatives.length ? <AdCampaignCreativeGallery campaign={campaign} creatives={creatives} onRefresh={load} onError={setError} /> : <p className="text-sm text-gray-500">Ingen annonser er opprettet ennå. Generer brief og bygg matrisen først.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-col items-start gap-3 lg:flex-row lg:items-center lg:justify-between">
          <CardTitle className="flex items-center gap-2 text-base"><Send className="h-4 w-4" />4. Leveranse og Content Hub</CardTitle>
          <div className="flex flex-wrap gap-2">
            {done > 0 && <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => void exportAll()} className="gap-2">{busy === "export-all" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}Eksporter alle ferdige</Button>}
            {campaign.status === "completed" && !campaign.delivery && <Button size="sm" disabled={Boolean(busy)} onClick={() => void post(`/api/ad-campaigns/${id}/delivery`)} className="gap-2">{busy.includes("delivery") ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}Captions og toppliste</Button>}
            {campaign.delivery && <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => void post(`/api/ad-campaigns/${id}/push-to-hub`)} className="gap-2"><Star className="h-3 w-3" />Push toppliste</Button>}
          </div>
        </CardHeader>
        <CardContent>
          {campaign.delivery ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <div><h3 className="mb-2 text-sm font-medium">Top picks</h3><ol className="space-y-2 text-sm text-gray-300">{campaign.delivery.top_picks?.map((pick) => { const creative = creatives.find((item) => item.id === pick.creative_id); return <li key={pick.creative_id} className="rounded-lg border border-gray-800 p-2"><strong>#{pick.rank} {creative?.angle || creative?.scene_id}</strong><span className="mt-1 block text-xs text-gray-500">{pick.rationale}</span></li>; })}</ol></div>
              <div><h3 className="mb-2 text-sm font-medium">Captions per vinkel</h3><div className="space-y-2">{Object.entries(campaign.delivery.per_angle_captions || {}).map(([angle, pack]) => <div key={angle} className="rounded-lg border border-gray-800 p-3"><p className="text-xs font-medium text-amber-300">{angle}</p><p className="mt-1 text-sm text-gray-300">{pack.primary}</p><p className="mt-1 text-xs text-gray-500">{pack.hashtags?.join(" ")}</p></div>)}</div></div>
            </div>
          ) : <p className="text-sm text-gray-500">Ferdige annonser kan eksporteres direkte. Når hele kampanjen er ferdig, kan AI også lage captions, toppliste og lanseringsforslag.</p>}
        </CardContent>
      </Card>
    </div>
  );
}