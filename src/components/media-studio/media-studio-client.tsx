"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ElementType } from "react";
import {
  AlertCircle,
  Archive,
  BadgeCheck,
  Boxes,
  Briefcase,
  CheckCircle,
  Clapperboard,
  Copy,
  Download,
  ExternalLink,
  Film,
  Image as ImageIcon,
  Layers3,
  Library,
  Loader2,
  Mic2,
  Palette,
  PanelTop,
  RefreshCw,
  Rocket,
  Send,
  Settings,
  Sparkles,
  Star,
  UserRound,
  Wand2,
} from "lucide-react";
import { BRANDS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ViewId =
  | "overview"
  | "create"
  | "image"
  | "product"
  | "property"
  | "avatar"
  | "video"
  | "voice"
  | "brand"
  | "projects"
  | "library"
  | "templates"
  | "jobs"
  | "settings";

interface ProviderCapabilities {
  provider: string;
  displayName: string;
  status: "available" | "not_connected" | "degraded" | "unavailable" | "unknown";
  updatedAt: string;
  image: Record<string, boolean>;
  video: Record<string, boolean>;
  avatar: Record<string, boolean>;
  voice: Record<string, boolean>;
  tools: { name: string; description?: string }[];
  account: Record<string, unknown>;
  errorMessage?: string;
}

interface MediaPromptPlan {
  mediaType: "image" | "video" | "avatar" | "voice" | "audio";
  operation: string;
  useCase?: string;
  originalRequest: string;
  optimizedPrompt: string;
  negativePrompt?: string;
  platform?: string;
  audience?: string;
  brandId?: string;
  aspectRatio?: string;
  durationSeconds?: number;
  resolution?: string;
  qualityTier: "fast" | "balanced" | "premium";
  providerRecommendation: {
    provider: "gemini" | "openart";
    displayName: string;
    reason: string;
    estimatedCostTier: "low" | "medium" | "high" | "premium";
    model?: string;
  };
  referenceRequirements: { type: string; required: boolean; reason: string; consentRequired?: boolean }[];
  safetyNotes: string[];
  estimatedCostTier: "low" | "medium" | "high" | "premium";
  promptBlocks: Record<string, string>;
}

interface MediaJob {
  id: string;
  status: string;
  provider: string;
  provider_job_id?: string | null;
  media_type: string;
  operation: string;
  original_request: string;
  final_prompt: string;
  brand_id?: string | null;
  aspect_ratio?: string | null;
  quality_tier: string;
  estimated_cost?: string | null;
  progress: number;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
  result_assets_json?: MediaAsset[];
}

interface MediaAsset {
  id: string;
  title?: string | null;
  description?: string | null;
  media_type: string;
  public_url?: string | null;
  thumbnail_url?: string | null;
  provider?: string | null;
  brand_id?: string | null;
  aspect_ratio?: string | null;
  resolution?: string | null;
  is_favorite?: boolean;
  exported_to_content_hub_at?: string | null;
  content_hub_publication_id?: string | null;
  created_at: string;
  tags?: string[];
}

interface MediaProject {
  id: string;
  name: string;
  project_type?: string | null;
  brand_id?: string | null;
  status: string;
  updated_at: string;
}

interface MediaTemplate {
  id: string;
  name: string;
  category: string;
  media_type: string;
  default_aspect_ratio?: string | null;
  default_quality_tier: "fast" | "balanced" | "premium";
  required_inputs?: string[];
}

interface OverviewPayload {
  generatedLast30Days: number;
  imagesGenerated: number;
  videosGenerated: number;
  activeJobs: number;
  failedJobs: number;
  sentToContentHub: number;
  estimatedAiUsage: Record<string, number>;
  providerStatus: ProviderCapabilities[];
  recentProjects: MediaProject[];
  recentAssets: MediaAsset[];
  mostUsedBrands: { brandId: string; count: number }[];
  recommendedNextActions: { label: string; href: string }[];
}

const views: { id: ViewId; label: string; icon: ElementType }[] = [
  { id: "overview", label: "Overview", icon: PanelTop },
  { id: "create", label: "Create", icon: Wand2 },
  { id: "image", label: "Image", icon: ImageIcon },
  { id: "product", label: "Product", icon: Boxes },
  { id: "property", label: "Property", icon: Briefcase },
  { id: "avatar", label: "Avatar", icon: UserRound },
  { id: "video", label: "Video", icon: Film },
  { id: "voice", label: "Voice", icon: Mic2 },
  { id: "brand", label: "Brand", icon: Palette },
  { id: "projects", label: "Projects", icon: Layers3 },
  { id: "library", label: "Library", icon: Library },
  { id: "templates", label: "Templates", icon: BadgeCheck },
  { id: "jobs", label: "Jobs", icon: Rocket },
  { id: "settings", label: "Settings", icon: Settings },
];

const formatPacks = [
  { id: "instagram", label: "Instagram Pack", ratios: ["1:1", "4:5", "9:16"] },
  { id: "linkedin", label: "LinkedIn Pack", ratios: ["16:9", "1:1"] },
  { id: "website", label: "Website Pack", ratios: ["16:9", "3:2"] },
  { id: "book", label: "Book Cover Pack", ratios: ["2:3", "1:1"] },
];

function statusVariant(status: string) {
  if (status === "completed" || status === "available") return "success" as const;
  if (status === "failed" || status === "unavailable") return "destructive" as const;
  if (status === "processing" || status === "submitted" || status === "queued" || status === "degraded") return "warning" as const;
  return "secondary" as const;
}

function brandName(id?: string | null) {
  return BRANDS.find((brand) => brand.id === id)?.name || id || "Uten brand";
}

function costLabel(value?: string | null) {
  if (value === "low") return "Lav";
  if (value === "medium") return "Middels";
  if (value === "high") return "Høy";
  if (value === "premium") return "Premium";
  return "Ukjent";
}

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

export function MediaStudioClient() {
  const [view, setView] = useState<ViewId>("overview");
  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [capabilities, setCapabilities] = useState<ProviderCapabilities[]>([]);
  const [jobs, setJobs] = useState<MediaJob[]>([]);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [projects, setProjects] = useState<MediaProject[]>([]);
  const [templates, setTemplates] = useState<MediaTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const [requestText, setRequestText] = useState("Lag et eksklusivt bilde av en moderne villa i Altea Hills ved solnedgang, til LinkedIn, rettet mot skandinaviske boligkjøpere.");
  const [mode, setMode] = useState<"simple" | "guided" | "professional">("simple");
  const [brandId, setBrandId] = useState("soleada");
  const [mediaType, setMediaType] = useState<"" | "image" | "video" | "avatar" | "voice">("");
  const [platform, setPlatform] = useState("linkedin");
  const [audience, setAudience] = useState("");
  const [qualityTier, setQualityTier] = useState<"fast" | "balanced" | "premium">("balanced");
  const [aspectRatio, setAspectRatio] = useState("");
  const [durationSeconds, setDurationSeconds] = useState(5);
  const [sourceImageUrl, setSourceImageUrl] = useState("");
  const [multiFormat, setMultiFormat] = useState(false);
  const [formatPackId, setFormatPackId] = useState("linkedin");
  const [plan, setPlan] = useState<MediaPromptPlan | null>(null);

  const openArt = capabilities.find((capability) => capability.provider === "openart");
  const gemini = capabilities.find((capability) => capability.provider === "gemini");
  const selectedPack = formatPacks.find((pack) => pack.id === formatPackId) || formatPacks[0];

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [overviewRes, jobsRes, assetsRes, projectsRes, templatesRes, capsRes] = await Promise.all([
        readJson<{ overview: OverviewPayload }>("/api/media/overview"),
        readJson<{ jobs: MediaJob[] }>("/api/media/jobs?limit=40"),
        readJson<{ assets: MediaAsset[] }>("/api/media/assets?limit=60"),
        readJson<{ projects: MediaProject[] }>("/api/media/projects"),
        readJson<{ templates: MediaTemplate[] }>("/api/media/templates"),
        readJson<{ capabilities: ProviderCapabilities[] }>("/api/media/providers/capabilities"),
      ]);
      setOverview(overviewRes.overview);
      setJobs(jobsRes.jobs);
      setAssets(assetsRes.assets);
      setProjects(projectsRes.projects);
      setTemplates(templatesRes.templates);
      setCapabilities(capsRes.capabilities);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke laste Media Studio.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!jobs.some((job) => ["queued", "submitted", "processing"].includes(job.status))) return;
    const timer = window.setInterval(async () => {
      const active = jobs.filter((job) => ["queued", "submitted", "processing"].includes(job.status));
      const updated = await Promise.allSettled(
        active.map((job) => readJson<{ job: MediaJob }>(`/api/media/jobs/${job.id}`).then((res) => res.job)),
      );
      const latest = new Map<string, MediaJob>();
      for (const item of updated) {
        if (item.status === "fulfilled") latest.set(item.value.id, item.value);
      }
      if (latest.size) {
        setJobs((current) => current.map((job) => latest.get(job.id) || job));
        void readJson<{ assets: MediaAsset[] }>("/api/media/assets?limit=60").then((res) => setAssets(res.assets)).catch(() => undefined);
      }
    }, 6000);
    return () => window.clearInterval(timer);
  }, [jobs]);

  const createPlan = async (overrides: Partial<MediaPromptPlan> = {}) => {
    setBusy("plan");
    setError("");
    try {
      const data = await readJson<{ plan: MediaPromptPlan; capabilities: ProviderCapabilities[] }>("/api/media/create-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request: requestText,
          mode,
          mediaType: mediaType || undefined,
          brandId,
          platform,
          audience: audience || undefined,
          qualityTier,
          aspectRatio: aspectRatio || undefined,
          durationSeconds,
          sourceImageUrls: sourceImageUrl ? [sourceImageUrl] : [],
          ...overrides,
        }),
      });
      setPlan(data.plan);
      setCapabilities(data.capabilities);
      return data.plan;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke lage plan.");
      return null;
    } finally {
      setBusy(null);
    }
  };

  const generate = async () => {
    setBusy("generate");
    setError("");
    try {
      const activePlan = plan || await createPlan();
      if (!activePlan) return;
      const ratios = multiFormat ? selectedPack.ratios : [activePlan.aspectRatio || aspectRatio || "1:1"];
      const created: MediaJob[] = [];
      for (const ratio of ratios) {
        const jobPlan = { ...activePlan, aspectRatio: ratio };
        const res = await readJson<{ job: MediaJob }>("/api/media/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plan: jobPlan,
            brandId: jobPlan.brandId || brandId,
            sourceImageUrls: sourceImageUrl ? [sourceImageUrl] : [],
            idempotencyKey: `${crypto.randomUUID()}-${ratio}`,
          }),
        });
        created.push(res.job);
      }
      setJobs((current) => [...created, ...current]);
      setView("jobs");
      void loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke starte generering.");
    } finally {
      setBusy(null);
    }
  };

  const retryJob = async (jobId: string) => {
    setBusy(`retry-${jobId}`);
    try {
      const res = await readJson<{ job: MediaJob }>(`/api/media/jobs/${jobId}/retry`, { method: "POST" });
      setJobs((current) => current.map((job) => job.id === jobId ? res.job : job));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke prøve jobben på nytt.");
    } finally {
      setBusy(null);
    }
  };

  const exportAsset = async (assetId: string) => {
    setBusy(`export-${assetId}`);
    try {
      await readJson(`/api/media/assets/${assetId}/export`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      setAssets((current) => current.map((asset) => asset.id === assetId ? { ...asset, exported_to_content_hub_at: new Date().toISOString() } : asset));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke sende til Content Hub.");
    } finally {
      setBusy(null);
    }
  };

  const toggleFavorite = async (asset: MediaAsset) => {
    const next = !asset.is_favorite;
    setAssets((current) => current.map((item) => item.id === asset.id ? { ...item, is_favorite: next } : item));
    await readJson(`/api/media/assets/${asset.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isFavorite: next }),
    }).catch(() => undefined);
  };

  const useTemplate = (template: MediaTemplate) => {
    setMediaType(template.media_type as typeof mediaType);
    setAspectRatio(template.default_aspect_ratio || "");
    setQualityTier(template.default_quality_tier);
    setRequestText(`${template.name}: `);
    setView("create");
  };

  const startVariant = (asset: MediaAsset) => {
    setSourceImageUrl(asset.public_url || "");
    setMediaType(asset.media_type === "video" ? "video" : "image");
    setRequestText(`Lag en ny variant av denne asseten. Behold hovedmotiv og brand, men gjør uttrykket mer premium.`);
    setView("create");
  };

  const topStats = useMemo(() => ([
    { label: "Siste 30 dager", value: overview?.generatedLast30Days || 0, tone: "text-primary-300" },
    { label: "Bilder", value: overview?.imagesGenerated || 0, tone: "text-emerald-300" },
    { label: "Videoer", value: overview?.videosGenerated || 0, tone: "text-sky-300" },
    { label: "Aktive jobber", value: overview?.activeJobs || 0, tone: "text-amber-300" },
    { label: "Feilet", value: overview?.failedJobs || 0, tone: "text-red-300" },
    { label: "Til Content Hub", value: overview?.sentToContentHub || 0, tone: "text-fuchsia-300" },
  ]), [overview]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold text-white">
            <Clapperboard className="text-primary-400" size={28} />
            AI Media Studio
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge variant={statusVariant(openArt?.status || "unknown")}>OpenArt: {openArt?.status || "unknown"}</Badge>
            <Badge variant={statusVariant(gemini?.status || "unknown")}>Gemini: {gemini?.status || "unknown"}</Badge>
            {typeof openArt?.account?.credits === "number" && (
              <Badge variant="outline">{Math.round(Number(openArt.account.credits))} OpenArt-kreditter</Badge>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void loadAll()} disabled={loading} className="gap-2">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Oppdater
          </Button>
          <Button onClick={() => setView("create")} className="gap-2">
            <Wand2 size={16} />
            Create
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <Tabs defaultValue="overview" value={view} onValueChange={(value) => setView(value as ViewId)}>
        <div className="overflow-x-auto pb-1">
          <TabsList className="min-w-max">
            {views.map((item) => {
              const Icon = item.icon;
              return (
                <TabsTrigger key={item.id} value={item.id} className="gap-1.5 whitespace-nowrap text-xs">
                  <Icon size={14} />
                  {item.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        <TabsContent value="overview">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {topStats.map((stat) => (
              <Card key={stat.label}>
                <CardContent className="p-4">
                  <div className={`text-2xl font-semibold ${stat.tone}`}>{stat.value}</div>
                  <div className="text-xs text-slate-400">{stat.label}</div>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <Card>
              <CardHeader>
                <CardTitle>Nylige medier</CardTitle>
                <CardDescription>Faktiske assets fra Media Studio</CardDescription>
              </CardHeader>
              <CardContent>
                <AssetGrid assets={overview?.recentAssets || []} onExport={exportAsset} onVariant={startVariant} onFavorite={toggleFavorite} busy={busy} compact />
              </CardContent>
            </Card>
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Neste handlinger</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(overview?.recommendedNextActions || []).map((action) => (
                    <button key={action.label} onClick={() => setView(action.href.includes("jobs") ? "jobs" : action.href.includes("library") ? "library" : "create")} className="flex w-full items-center justify-between rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2 text-left text-sm text-slate-200 hover:border-primary-400/50">
                      {action.label}
                      <ExternalLink size={13} className="text-slate-500" />
                    </button>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Mest brukte brands</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(overview?.mostUsedBrands || []).length === 0 && <p className="text-sm text-slate-500">Ingen assets ennå.</p>}
                  {(overview?.mostUsedBrands || []).map((row) => (
                    <div key={row.brandId} className="flex items-center justify-between text-sm">
                      <span className="text-slate-300">{brandName(row.brandId)}</span>
                      <Badge variant="secondary">{row.count}</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="create">
          <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Hva ønsker du å lage?</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  {(["simple", "guided", "professional"] as const).map((item) => (
                    <button key={item} onClick={() => setMode(item)} className={`rounded-lg border px-3 py-2 text-xs ${mode === item ? "border-primary-400 bg-primary-500/15 text-primary-200" : "border-slate-700 text-slate-400 hover:border-slate-500"}`}>
                      {item === "simple" ? "Enkel" : item === "guided" ? "Veiledet" : "Profesjonell"}
                    </button>
                  ))}
                </div>
                <textarea
                  value={requestText}
                  onChange={(event) => setRequestText(event.target.value)}
                  rows={7}
                  className="w-full resize-none rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-slate-100 outline-none focus:border-primary-400"
                />
                <GuidedFields
                  visible={mode !== "simple"}
                  brandId={brandId}
                  setBrandId={setBrandId}
                  mediaType={mediaType}
                  setMediaType={setMediaType}
                  platform={platform}
                  setPlatform={setPlatform}
                  audience={audience}
                  setAudience={setAudience}
                  qualityTier={qualityTier}
                  setQualityTier={setQualityTier}
                  aspectRatio={aspectRatio}
                  setAspectRatio={setAspectRatio}
                  durationSeconds={durationSeconds}
                  setDurationSeconds={setDurationSeconds}
                  sourceImageUrl={sourceImageUrl}
                  setSourceImageUrl={setSourceImageUrl}
                />
                <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
                  <label className="flex items-center gap-2 text-sm text-slate-200">
                    <input type="checkbox" checked={multiFormat} onChange={(event) => setMultiFormat(event.target.checked)} />
                    Lag flere formater
                  </label>
                  {multiFormat && (
                    <select value={formatPackId} onChange={(event) => setFormatPackId(event.target.value)} className="mt-3 h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100">
                      {formatPacks.map((pack) => <option key={pack.id} value={pack.id}>{pack.label} ({pack.ratios.join(", ")})</option>)}
                    </select>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => void createPlan()} disabled={busy === "plan" || !requestText.trim()} variant="outline" className="gap-2">
                    {busy === "plan" ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                    Lag forslag
                  </Button>
                  <Button onClick={() => void generate()} disabled={busy === "generate" || !requestText.trim()} className="gap-2">
                    {busy === "generate" ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                    Generer
                  </Button>
                  <Button variant="ghost" onClick={() => { setQualityTier("fast"); void createPlan({ qualityTier: "fast" } as Partial<MediaPromptPlan>); }}>Rimeligere</Button>
                  <Button variant="ghost" onClick={() => { setQualityTier("premium"); void createPlan({ qualityTier: "premium" } as Partial<MediaPromptPlan>); }}>Beste kvalitet</Button>
                </div>
              </CardContent>
            </Card>

            <PlanPanel plan={plan} onCopy={() => plan && navigator.clipboard.writeText(plan.optimizedPrompt)} />
          </div>
        </TabsContent>

        <TabsContent value="image">
          <TaskStudio
            title="Image Studio 2.0"
            icon={ImageIcon}
            tasks={["Sosial post", "Annonse", "Hero-bilde", "Portrett", "Eiendom", "Produkt", "Bokomslag", "Bytt bakgrunn", "Lag variant", "Endre format"]}
            onPick={(task) => { setMediaType("image"); setRequestText(`${task}: `); setView("create"); }}
          />
        </TabsContent>

        <TabsContent value="product">
          <TaskStudio
            title="Product Studio"
            icon={Boxes}
            tasks={["Studiobilde", "Premium reklame", "Middelhavsmiljø", "Kjøkken", "Sommer", "Jul", "Instagram", "LinkedIn", "Annonsebanner"]}
            onPick={(task) => { setMediaType("image"); setRequestText(`${task} for produkt. Preserve the real product identity, package shape, label, logo, colors and recognizable details.`); setView("create"); }}
          />
        </TabsContent>

        <TabsContent value="property">
          <TaskStudio
            title="Property Studio"
            icon={Briefcase}
            tasks={["Forbedre boligfoto", "Dag til solnedgang", "Virtuell styling", "Annonsebilde", "Drone-lignende hero", "Kort eiendoms-Reel"]}
            onPick={(task) => { setMediaType(task.includes("Reel") ? "video" : "image"); setRequestText(`${task}. Merk som AI-generert visualisering dersom resultatet er konseptuelt.`); setView("create"); }}
          />
        </TabsContent>

        <TabsContent value="video">
          <TaskStudio
            title="Video Studio"
            icon={Film}
            tasks={["Text-to-video", "Image-to-video", "Animer bilde", "Eiendoms-Reel", "Produktvideo", "Sosial annonse", "Boktrailer", "Logoanimasjon"]}
            disabled={!openArt?.video?.textToVideo && !openArt?.video?.imageToVideo}
            onPick={(task) => { setMediaType("video"); setRequestText(`${task}: `); setAspectRatio("9:16"); setQualityTier("premium"); setView("create"); }}
          />
        </TabsContent>

        <TabsContent value="avatar">
          <CapabilityShell title="Avatar Studio" icon={UserRound} capability={openArt?.avatar?.avatarCreation || openArt?.avatar?.talkingAvatar} />
        </TabsContent>

        <TabsContent value="voice">
          <CapabilityShell title="Voice Studio" icon={Mic2} capability={openArt?.voice?.textToSpeech} />
        </TabsContent>

        <TabsContent value="brand">
          <BrandStudio brands={BRANDS.map((brand) => ({ id: brand.id, name: brand.name, color: brand.color, tone: brand.tone || "", audience: brand.target_audience || "" }))} />
        </TabsContent>

        <TabsContent value="projects">
          <Card>
            <CardHeader>
              <CardTitle>Projects</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {projects.map((project) => (
                <div key={project.id} className="rounded-lg border border-slate-700 bg-slate-900/40 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-medium text-slate-100">{project.name}</h3>
                      <p className="text-xs text-slate-500">{project.project_type || "general"} · {brandName(project.brand_id)}</p>
                    </div>
                    <Badge variant={statusVariant(project.status)}>{project.status}</Badge>
                  </div>
                </div>
              ))}
              {projects.length === 0 && <p className="text-sm text-slate-500">Ingen prosjekter ennå.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="library">
          <Card>
            <CardHeader>
              <CardTitle>Media Library</CardTitle>
              <CardDescription>{assets.length} assets</CardDescription>
            </CardHeader>
            <CardContent>
              <AssetGrid assets={assets} onExport={exportAsset} onVariant={startVariant} onFavorite={toggleFavorite} busy={busy} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {templates.map((template) => (
              <Card key={template.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-medium text-slate-100">{template.name}</h3>
                      <p className="text-xs text-slate-500">{template.category} · {template.media_type}</p>
                    </div>
                    <Badge variant="outline">{template.default_aspect_ratio || "auto"}</Badge>
                  </div>
                  <Button size="sm" className="mt-4 gap-2" onClick={() => useTemplate(template)}>
                    <Wand2 size={14} />
                    Bruk
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="jobs">
          <div className="space-y-3">
            {jobs.map((job) => (
              <Card key={job.id}>
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={statusVariant(job.status)}>{job.status}</Badge>
                        <Badge variant="secondary">{job.provider}</Badge>
                        <Badge variant="outline">{job.media_type}</Badge>
                        <Badge variant="outline">{costLabel(job.estimated_cost)}</Badge>
                      </div>
                      <p className="mt-2 truncate text-sm font-medium text-slate-100">{job.original_request}</p>
                      {job.error_message && <p className="mt-1 text-xs text-red-300">{job.error_message}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-700">
                        <div className="h-full bg-primary-400" style={{ width: `${Math.max(0, Math.min(job.progress || 0, 100))}%` }} />
                      </div>
                      {job.status === "failed" && (
                        <Button size="sm" variant="outline" onClick={() => void retryJob(job.id)} disabled={busy === `retry-${job.id}`} className="gap-1.5">
                          {busy === `retry-${job.id}` ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                          Retry
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {jobs.length === 0 && <Card><CardContent className="p-6 text-sm text-slate-500">Ingen jobber ennå.</CardContent></Card>}
          </div>
        </TabsContent>

        <TabsContent value="settings">
          <div className="grid gap-4 lg:grid-cols-2">
            {capabilities.map((capability) => (
              <Card key={capability.provider}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-3">
                    {capability.displayName}
                    <Badge variant={statusVariant(capability.status)}>{capability.status}</Badge>
                  </CardTitle>
                  {capability.errorMessage && <CardDescription>{capability.errorMessage}</CardDescription>}
                </CardHeader>
                <CardContent className="space-y-3">
                  <CapabilityRow label="Image" values={capability.image} />
                  <CapabilityRow label="Video" values={capability.video} />
                  <CapabilityRow label="Avatar" values={capability.avatar} />
                  <CapabilityRow label="Voice" values={capability.voice} />
                  {capability.provider === "openart" && (
                    <Button variant="outline" size="sm" className="gap-2" onClick={async () => {
                      setBusy("refresh-openart");
                      try {
                        const res = await readJson<{ capabilities: ProviderCapabilities }>("/api/media/openart/refresh-capabilities", { method: "POST" });
                        setCapabilities((current) => current.map((item) => item.provider === "openart" ? res.capabilities : item));
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Kunne ikke refreshe OpenArt.");
                      } finally {
                        setBusy(null);
                      }
                    }}>
                      {busy === "refresh-openart" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                      Refresh OpenArt
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function GuidedFields(props: {
  visible: boolean;
  brandId: string;
  setBrandId: (value: string) => void;
  mediaType: "" | "image" | "video" | "avatar" | "voice";
  setMediaType: (value: "" | "image" | "video" | "avatar" | "voice") => void;
  platform: string;
  setPlatform: (value: string) => void;
  audience: string;
  setAudience: (value: string) => void;
  qualityTier: "fast" | "balanced" | "premium";
  setQualityTier: (value: "fast" | "balanced" | "premium") => void;
  aspectRatio: string;
  setAspectRatio: (value: string) => void;
  durationSeconds: number;
  setDurationSeconds: (value: number) => void;
  sourceImageUrl: string;
  setSourceImageUrl: (value: string) => void;
}) {
  if (!props.visible) return null;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <SelectField label="Brand" value={props.brandId} onChange={props.setBrandId} options={BRANDS.map((brand) => ({ value: brand.id, label: brand.name }))} />
      <SelectField label="Type" value={props.mediaType} onChange={(value) => props.setMediaType(value as typeof props.mediaType)} options={[
        { value: "", label: "Auto" },
        { value: "image", label: "Bilde" },
        { value: "video", label: "Video" },
        { value: "avatar", label: "Avatar" },
        { value: "voice", label: "Voice" },
      ]} />
      <SelectField label="Plattform" value={props.platform} onChange={props.setPlatform} options={["linkedin", "instagram", "facebook", "tiktok", "website", "youtube"].map((value) => ({ value, label: value }))} />
      <SelectField label="Kvalitet" value={props.qualityTier} onChange={(value) => props.setQualityTier(value as typeof props.qualityTier)} options={[
        { value: "fast", label: "Rask og rimelig" },
        { value: "balanced", label: "Balansert" },
        { value: "premium", label: "Beste kvalitet" },
      ]} />
      <SelectField label="Format" value={props.aspectRatio} onChange={props.setAspectRatio} options={["", "1:1", "4:5", "16:9", "9:16", "3:2", "2:3"].map((value) => ({ value, label: value || "Auto" }))} />
      <div>
        <label className="mb-1 block text-xs text-slate-400">Varighet</label>
        <input type="number" min={3} max={15} value={props.durationSeconds} onChange={(event) => props.setDurationSeconds(Number(event.target.value))} className="h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100" />
      </div>
      <div className="md:col-span-2">
        <label className="mb-1 block text-xs text-slate-400">Referanse-URL</label>
        <input value={props.sourceImageUrl} onChange={(event) => props.setSourceImageUrl(event.target.value)} className="h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100" placeholder="https://..." />
      </div>
      <div className="md:col-span-2">
        <label className="mb-1 block text-xs text-slate-400">Målgruppe</label>
        <input value={props.audience} onChange={(event) => props.setAudience(event.target.value)} className="h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100" />
      </div>
    </div>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-slate-400">{label}</label>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100">
        {options.map((option) => <option key={option.value || "auto"} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  );
}

function PlanPanel({ plan, onCopy }: { plan: MediaPromptPlan | null; onCopy: () => void }) {
  if (!plan) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Produksjonsplan</CardTitle>
          <CardDescription>Prompt Director lager en validert plan for neste jobb.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-slate-500">Ingen plan ennå.</CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3">
          Produksjonsplan
          <Badge variant="outline">{plan.providerRecommendation.displayName}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Mini label="Type" value={plan.mediaType} />
          <Mini label="Bruk" value={plan.useCase || plan.operation} />
          <Mini label="Format" value={plan.aspectRatio || "auto"} />
          <Mini label="Kost" value={costLabel(plan.estimatedCostTier)} />
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-300">Forbedret prompt</span>
            <Button size="sm" variant="ghost" onClick={onCopy} className="gap-1.5">
              <Copy size={13} />
              Kopier
            </Button>
          </div>
          <pre className="max-h-72 whitespace-pre-wrap text-xs leading-5 text-slate-300">{plan.optimizedPrompt}</pre>
        </div>
        {plan.referenceRequirements.length > 0 && (
          <div className="space-y-2">
            {plan.referenceRequirements.map((item) => (
              <div key={`${item.type}-${item.reason}`} className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-2 text-xs text-amber-200">
                {item.required ? "Krever referanse: " : "Anbefalt referanse: "}{item.reason}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-medium text-slate-200">{value}</p>
    </div>
  );
}

function AssetGrid({ assets, onExport, onVariant, onFavorite, busy, compact = false }: { assets: MediaAsset[]; onExport: (id: string) => void; onVariant: (asset: MediaAsset) => void; onFavorite: (asset: MediaAsset) => void; busy: string | null; compact?: boolean }) {
  if (assets.length === 0) return <p className="text-sm text-slate-500">Ingen assets ennå.</p>;
  return (
    <div className={`grid gap-3 ${compact ? "md:grid-cols-2" : "md:grid-cols-2 xl:grid-cols-3"}`}>
      {assets.map((asset) => (
        <div key={asset.id} className="overflow-hidden rounded-lg border border-slate-700 bg-slate-900/40">
          <div className="aspect-video bg-slate-950">
            {asset.media_type === "image" && (asset.thumbnail_url || asset.public_url) ? (
              <img src={asset.thumbnail_url || asset.public_url || ""} alt={asset.title || "Media asset"} className="h-full w-full object-cover" loading="lazy" decoding="async" />
            ) : asset.media_type === "video" && asset.public_url ? (
              <video src={asset.public_url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
            ) : (
              <div className="flex h-full items-center justify-center text-slate-600"><Library size={32} /></div>
            )}
          </div>
          <div className="space-y-3 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-100">{asset.title || "AI asset"}</p>
                <p className="text-xs text-slate-500">{brandName(asset.brand_id)} · {asset.provider || "provider"}</p>
              </div>
              <button onClick={() => onFavorite(asset)} className="rounded p-1 hover:bg-slate-800" title="Favoritt">
                <Star size={15} className={asset.is_favorite ? "fill-amber-400 text-amber-400" : "text-slate-500"} />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {asset.public_url && (
                <Button asChild size="sm" variant="ghost" className="gap-1.5">
                  <a href={asset.public_url} download target="_blank" rel="noreferrer">
                    <Download size={13} />
                    Last ned
                  </a>
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => onVariant(asset)} className="gap-1.5">
                <Wand2 size={13} />
                Variant
              </Button>
              <Button size="sm" variant={asset.exported_to_content_hub_at ? "secondary" : "outline"} disabled={Boolean(asset.exported_to_content_hub_at) || busy === `export-${asset.id}`} onClick={() => onExport(asset.id)} className="gap-1.5">
                {busy === `export-${asset.id}` ? <Loader2 size={13} className="animate-spin" /> : asset.exported_to_content_hub_at ? <CheckCircle size={13} /> : <Send size={13} />}
                {asset.exported_to_content_hub_at ? "I Hub" : "Content Hub"}
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function TaskStudio({ title, icon: Icon, tasks, onPick, disabled = false }: { title: string; icon: ElementType; tasks: string[]; onPick: (task: string) => void; disabled?: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Icon size={18} className="text-primary-400" />{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {tasks.map((task) => (
          <button key={task} disabled={disabled} onClick={() => onPick(task)} className="rounded-lg border border-slate-700 bg-slate-900/40 p-3 text-left text-sm text-slate-200 transition hover:border-primary-400/60 disabled:opacity-50">
            {task}
          </button>
        ))}
      </CardContent>
    </Card>
  );
}

function CapabilityShell({ title, icon: Icon, capability }: { title: string; icon: ElementType; capability?: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Icon size={18} className="text-primary-400" />{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`rounded-lg border p-4 ${capability ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-slate-700 bg-slate-900/40 text-slate-400"}`}>
          {capability ? "Capability tilgjengelig. Bruk Create for provider-styrt generering." : "Ingen tilkoblet provider rapporterer denne capabilityen nå."}
        </div>
      </CardContent>
    </Card>
  );
}

function CapabilityRow({ label, values }: { label: string; values: Record<string, boolean> }) {
  const entries = Object.entries(values || {});
  return (
    <div>
      <p className="mb-1 text-xs text-slate-500">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {entries.length === 0 && <Badge variant="secondary">Ingen</Badge>}
        {entries.map(([key, value]) => (
          <Badge key={key} variant={value ? "success" : "secondary"}>{key}</Badge>
        ))}
      </div>
    </div>
  );
}

function BrandStudio({ brands }: { brands: { id: string; name: string; color: string; tone: string; audience: string }[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {brands.map((brand) => (
        <Card key={brand.id}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <span className="h-4 w-4 rounded-full" style={{ backgroundColor: brand.color }} />
              <div>
                <h3 className="font-medium text-slate-100">{brand.name}</h3>
                <p className="text-xs text-slate-500">{brand.tone}</p>
              </div>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-400">{brand.audience}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
