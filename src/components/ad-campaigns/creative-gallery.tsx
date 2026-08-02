"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  CopyPlus,
  Download,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  Pencil,
  RefreshCw,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AdCampaign, AdCreative } from "@/types/ads";

interface Props {
  campaign: AdCampaign;
  creatives: AdCreative[];
  onRefresh: () => Promise<void>;
  onError: (message: string) => void;
}

type ConcreteProvider = "openart" | "gemini" | "flux";

function providerLabel(provider: string | null) {
  if (provider === "flux") return "Flux Kontext Pro";
  if (provider === "gemini") return "Gemini";
  if (provider === "openart") return "OpenArt";
  return provider || "Ikke valgt";
}

function providerBadge(provider: string | null) {
  if (provider === "flux") return "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-200";
  if (provider === "gemini") return "border-blue-500/40 bg-blue-500/10 text-blue-200";
  if (provider === "openart") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  return "border-gray-700 bg-gray-800 text-gray-300";
}

function wrapCanvasText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function downloadComposite(creative: AdCreative, campaign: AdCampaign) {
  if (!creative.image_url) return;
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.src = creative.image_url;
  await image.decode();

  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Nettleseren kunne ikke lage annonsefilen.");
  context.drawImage(image, 0, 0);

  const showOverlay = campaign.overlay_mode === "automatic" || creative.overlay_applied;
  if (showOverlay && (creative.overlay_headline || creative.overlay_subheadline || creative.overlay_cta || creative.overlay_badge)) {
    const width = canvas.width;
    const height = canvas.height;
    const padding = Math.round(width * 0.065);
    const maxTextWidth = width - padding * 2;
    const gradient = context.createLinearGradient(0, height * 0.42, 0, height);
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(0.52, "rgba(0,0,0,0.38)");
    gradient.addColorStop(1, "rgba(0,0,0,0.82)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    let cursorY = height - padding;
    context.textBaseline = "bottom";
    context.textAlign = "left";

    if (creative.overlay_cta) {
      const ctaFont = Math.max(18, Math.round(width * 0.035));
      context.font = `600 ${ctaFont}px Arial, sans-serif`;
      const ctaWidth = context.measureText(creative.overlay_cta).width + ctaFont * 1.3;
      const ctaHeight = ctaFont * 1.75;
      context.fillStyle = "rgba(255,255,255,0.94)";
      context.beginPath();
      context.roundRect(padding, cursorY - ctaHeight, ctaWidth, ctaHeight, ctaHeight / 2);
      context.fill();
      context.fillStyle = "#101827";
      context.fillText(creative.overlay_cta, padding + ctaFont * 0.65, cursorY - ctaFont * 0.35);
      cursorY -= ctaHeight + Math.round(height * 0.025);
    }

    if (creative.overlay_subheadline) {
      const subFont = Math.max(18, Math.round(width * 0.037));
      context.font = `400 ${subFont}px Arial, sans-serif`;
      context.fillStyle = "rgba(255,255,255,0.88)";
      const lines = wrapCanvasText(context, creative.overlay_subheadline, maxTextWidth);
      for (let index = lines.length - 1; index >= 0; index -= 1) {
        context.fillText(lines[index], padding, cursorY);
        cursorY -= subFont * 1.3;
      }
      cursorY -= Math.round(height * 0.012);
    }

    if (creative.overlay_headline) {
      const headlineFont = Math.max(28, Math.round(width * 0.068));
      context.font = `700 ${headlineFont}px Arial, sans-serif`;
      context.fillStyle = "#ffffff";
      const lines = wrapCanvasText(context, creative.overlay_headline, maxTextWidth);
      for (let index = lines.length - 1; index >= 0; index -= 1) {
        context.fillText(lines[index], padding, cursorY);
        cursorY -= headlineFont * 1.05;
      }
      cursorY -= Math.round(height * 0.018);
    }

    if (creative.overlay_badge) {
      const badgeFont = Math.max(16, Math.round(width * 0.03));
      context.font = `600 ${badgeFont}px Arial, sans-serif`;
      const badgeWidth = context.measureText(creative.overlay_badge).width + badgeFont * 1.2;
      const badgeHeight = badgeFont * 1.7;
      context.fillStyle = "rgba(15,23,42,0.82)";
      context.beginPath();
      context.roundRect(padding, Math.max(padding, cursorY - badgeHeight), badgeWidth, badgeHeight, badgeHeight / 2);
      context.fill();
      context.fillStyle = "#ffffff";
      context.fillText(creative.overlay_badge, padding + badgeFont * 0.6, Math.max(padding, cursorY - badgeFont * 0.25));
    }
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Kunne ikke lage PNG-filen.")), "image/png", 0.95);
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${campaign.name}-${creative.scene_id}-${creative.aspect_ratio.replace(":", "x")}.png`.replace(/[^a-z0-9._-]+/gi, "-");
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function AdCampaignCreativeGallery({ campaign, creatives, onRefresh, onError }: Props) {
  const [busy, setBusy] = useState("");
  const [editing, setEditing] = useState<AdCreative | null>(null);
  const [overlay, setOverlay] = useState({ headline: "", subheadline: "", cta: "", badge: "", applied: false });

  const groups = useMemo(() => {
    const result = new Map<string, AdCreative[]>();
    for (const creative of creatives) {
      const key = creative.concept_group || creative.angle;
      const current = result.get(key) || [];
      current.push(creative);
      result.set(key, current);
    }
    return [...result.entries()].map(([key, items]) => ({
      key,
      angle: items[0]?.angle || key,
      items: items.sort((left, right) => (left.variant_index || 0) - (right.variant_index || 0)),
    }));
  }, [creatives]);

  const creativeAction = async (creative: AdCreative, action: "regenerate" | "create_variant", provider?: ConcreteProvider) => {
    setBusy(`${action}-${creative.id}`);
    onError("");
    try {
      const response = await fetch(`/api/ad-campaigns/${campaign.id}/creatives/${creative.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, provider }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Creative-handlingen feilet.");
      await onRefresh();
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  };

  const saveOverlay = async () => {
    if (!editing) return;
    setBusy(`overlay-${editing.id}`);
    onError("");
    try {
      const response = await fetch(`/api/ad-campaigns/${campaign.id}/creatives/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          overlay_headline: overlay.headline || null,
          overlay_subheadline: overlay.subheadline || null,
          overlay_cta: overlay.cta || null,
          overlay_badge: overlay.badge || null,
          overlay_applied: overlay.applied,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunne ikke lagre overlay.");
      setEditing(null);
      await onRefresh();
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  };

  const exportOne = async (creative: AdCreative) => {
    if (!creative.output_asset_id) {
      onError("Denne annonsen er ikke koblet til Media Library ennå.");
      return;
    }
    setBusy(`export-${creative.id}`);
    onError("");
    try {
      const response = await fetch(`/api/media/assets/${creative.output_asset_id}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Eksporten feilet.");
      await onRefresh();
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  };

  const openEditor = (creative: AdCreative) => {
    setEditing(creative);
    setOverlay({
      headline: creative.overlay_headline || "",
      subheadline: creative.overlay_subheadline || "",
      cta: creative.overlay_cta || "",
      badge: creative.overlay_badge || "",
      applied: campaign.overlay_mode === "automatic" || creative.overlay_applied,
    });
  };

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <section key={group.key} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-base font-semibold text-gray-200">{group.angle}</h4>
              <p className="text-xs text-gray-500">{group.items.length} varianter · {group.key}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[...new Set(group.items.map((item) => item.provider).filter(Boolean))].map((provider) => <Badge key={provider} variant="outline" className={providerBadge(provider)}>{providerLabel(provider)}</Badge>)}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {group.items.map((creative) => {
              const showOverlay = campaign.overlay_mode === "automatic" || creative.overlay_applied;
              return (
                <article key={creative.id} className="overflow-hidden rounded-xl border border-gray-800 bg-gray-950/40">
                  <div className={`relative overflow-hidden bg-gray-900 ${creative.aspect_ratio === "9:16" ? "aspect-[9/16]" : creative.aspect_ratio === "4:5" ? "aspect-[4/5]" : creative.aspect_ratio === "1.91:1" ? "aspect-[1.91/1]" : "aspect-square"}`}>
                    {creative.image_url ? (
                      <img src={creative.thumbnail_url || creative.image_url} alt={creative.scene_id} loading="lazy" className="h-full w-full object-cover" />
                    ) : creative.status === "generating" ? (
                      <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-cyan-400" /></div>
                    ) : creative.status === "failed" ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center text-red-300"><X className="mb-2 h-5 w-5" /><p className="line-clamp-5 text-xs">{creative.error || "Generering feilet"}</p></div>
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center gap-2 text-xs text-gray-600"><ImageIcon className="h-4 w-4" />Venter</div>
                    )}

                    {creative.image_url && showOverlay && (
                      <div className="pointer-events-none absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/85 via-black/20 to-transparent p-4 text-white">
                        {creative.overlay_badge && <span className="mb-2 w-fit rounded-full bg-white/15 px-2 py-1 text-[10px] font-semibold backdrop-blur">{creative.overlay_badge}</span>}
                        {creative.overlay_headline && <p className="text-lg font-bold leading-tight drop-shadow">{creative.overlay_headline}</p>}
                        {creative.overlay_subheadline && <p className="mt-1 line-clamp-3 text-xs text-white/85">{creative.overlay_subheadline}</p>}
                        {creative.overlay_cta && <span className="mt-3 w-fit rounded-full bg-white px-3 py-1.5 text-[10px] font-semibold text-slate-900">{creative.overlay_cta}</span>}
                      </div>
                    )}

                    <div className="absolute left-2 top-2 flex flex-wrap gap-1">
                      <Badge variant="outline" className={providerBadge(creative.provider)}>{providerLabel(creative.provider)}</Badge>
                      <Badge variant="outline" className="border-black/30 bg-black/55 text-white">{creative.aspect_ratio}</Badge>
                    </div>
                    {creative.status === "completed" && <CheckCircle2 className="absolute right-2 top-2 h-4 w-4 text-emerald-400 drop-shadow" />}
                  </div>

                  <div className="space-y-3 p-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-gray-200">Variant {creative.variant_index || 1}</span>
                      <span className="text-gray-500">{creative.scene_id}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5">
                      <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => openEditor(creative)}><Pencil className="h-3 w-3" />Tekst</Button>
                      <Button size="sm" variant="outline" className="gap-1 text-xs" disabled={Boolean(busy)} onClick={() => void creativeAction(creative, "create_variant")}>
                        {busy === `create_variant-${creative.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <CopyPlus className="h-3 w-3" />}Variant
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1 text-xs" disabled={Boolean(busy)} onClick={() => void creativeAction(creative, "regenerate")}>
                        {busy === `regenerate-${creative.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}På nytt
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1 text-xs" disabled={!creative.image_url} onClick={() => void downloadComposite(creative, campaign).catch((error) => onError(error instanceof Error ? error.message : String(error)))}><Download className="h-3 w-3" />PNG</Button>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {creative.image_url && <Button asChild size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px]"><a href={creative.image_url} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3" />Åpne</a></Button>}
                      {creative.output_asset_id && <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px]" disabled={Boolean(busy) || creative.pushed_to_hub} onClick={() => void exportOne(creative)}>{busy === `export-${creative.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : creative.pushed_to_hub ? <CheckCircle2 className="h-3 w-3" /> : <Send className="h-3 w-3" />}{creative.pushed_to_hub ? "I Hub" : "Content Hub"}</Button>}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onClick={() => setEditing(null)}>
          <div className="w-full max-w-xl rounded-xl border border-gray-700 bg-slate-950 p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div><h3 className="flex items-center gap-2 text-lg font-semibold"><Sparkles className="h-4 w-4 text-cyan-400" />Rediger annonsetekst</h3><p className="mt-1 text-xs text-gray-500">Teksten lagres separat fra AI-bildet og kan lastes ned som korrekt kompositt.</p></div>
              <button type="button" onClick={() => setEditing(null)}><X className="h-5 w-5 text-gray-400" /></button>
            </div>
            <div className="mt-5 space-y-3">
              <OverlayField label="Badge / tilbud" value={overlay.badge} onChange={(value) => setOverlay((current) => ({ ...current, badge: value }))} maxLength={100} />
              <OverlayField label="Headline" value={overlay.headline} onChange={(value) => setOverlay((current) => ({ ...current, headline: value }))} maxLength={160} />
              <OverlayField label="Undertittel" value={overlay.subheadline} onChange={(value) => setOverlay((current) => ({ ...current, subheadline: value }))} maxLength={300} multiline />
              <OverlayField label="CTA" value={overlay.cta} onChange={(value) => setOverlay((current) => ({ ...current, cta: value }))} maxLength={80} />
              <label className="flex items-center gap-2 rounded-lg border border-gray-700 p-3 text-sm text-gray-300"><input type="checkbox" checked={overlay.applied} onChange={(event) => setOverlay((current) => ({ ...current, applied: event.target.checked }))} />Vis overlay på denne annonsen</label>
            </div>
            <div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={() => setEditing(null)}>Avbryt</Button><Button onClick={() => void saveOverlay()} disabled={Boolean(busy)}>{busy === `overlay-${editing.id}` && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Lagre tekst</Button></div>
          </div>
        </div>
      )}
    </div>
  );
}

function OverlayField({ label, value, onChange, maxLength, multiline = false }: { label: string; value: string; onChange: (value: string) => void; maxLength: number; multiline?: boolean }) {
  return <div><div className="mb-1 flex items-center justify-between"><label className="text-xs text-gray-400">{label}</label><span className="text-[10px] text-gray-600">{value.length}/{maxLength}</span></div>{multiline ? <textarea value={value} onChange={(event) => onChange(event.target.value)} maxLength={maxLength} rows={3} className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm" /> : <input value={value} onChange={(event) => onChange(event.target.value)} maxLength={maxLength} className="h-10 w-full rounded-md border border-gray-700 bg-gray-900 px-3 text-sm" />}</div>;
}
