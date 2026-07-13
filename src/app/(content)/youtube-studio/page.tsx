"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Youtube, Upload, Eye, Heart, MessageCircle, TrendingUp, Play, Clock,
  Plus, X, Users, BarChart3, MousePointerClick, Loader2, RefreshCw, AlertCircle,
  Link2, CheckCircle2, KeyRound,
} from "lucide-react";

interface Video {
  id: string;
  title: string;
  description: string;
  channel: string;
  brand: string;
  views: number;
  likes: number;
  comments: number;
  ctr: number;
  publishedAt: string;
  duration: string;
  status: "published" | "draft" | "processing";
  thumbnailUrl: string;
  thumbnailColor: string;
  tags: string[];
  visibility: "public" | "unlisted" | "private";
}

interface ChannelStats {
  subscriberCount: string;
  viewCount: string;
  videoCount: string;
}

// `oauthBrandId` is what we pass to /api/oauth/google — Re-Master Freddy's
// channel has historically been connected under "remasterfreddy", so we keep
// reconnecting under that id (neuralbeat resolves to it via token aliases).
const brandOptions: { id: string; name: string; oauthBrandId?: string }[] = [
  { id: "zeneco", name: "Zen Eco Homes" },
  { id: "soleada", name: "Soleada.no" },
  { id: "chatgenius", name: "ChatGenius.pro" },
  { id: "donaanna", name: "Dona Anna" },
  { id: "freddyb", name: "Freddy Bremseth" },
  { id: "pinosoecolife", name: "Pinoso Ecolife" },
  { id: "neuralbeat", name: "Re-Master Freddy", oauthBrandId: "remasterfreddy" },
];

// Channel rows may be stored under an alias id — map them to the option id.
const CHANNEL_BRAND_ALIASES: Record<string, string> = {
  remasterfreddy: "neuralbeat",
  zenecohomes: "zeneco",
  pinoso: "pinosoecolife",
};

function connectUrlFor(brand: { id: string; oauthBrandId?: string }): string {
  const brandId = brand.oauthBrandId || brand.id;
  return `/api/oauth/google?brand_id=${encodeURIComponent(brandId)}&service=youtube&return_to=${encodeURIComponent("/youtube-studio")}`;
}

interface ConnectedChannel {
  id: string;
  brand_id: string;
  display_name: string;
  external_id: string;
  has_token: boolean;
  token_rotated_at: string | null;
}

const statusConfig = {
  published: { label: "Publisert", variant: "success" as const },
  draft: { label: "Kladd", variant: "secondary" as const },
  processing: { label: "Behandles", variant: "warning" as const },
};

function parseDuration(iso: string): string {
  if (!iso) return "0:00";
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return "0:00";
  const h = parseInt(m[1] || "0");
  const min = parseInt(m[2] || "0");
  const sec = parseInt(m[3] || "0");
  if (h > 0) return `${h}:${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${min}:${String(sec).padStart(2, "0")}`;
}

export default function YouTubeStudioPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [channelStats, setChannelStats] = useState<ChannelStats | null>(null);
  const [channelTitle, setChannelTitle] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBrandId, setSelectedBrandId] = useState("neuralbeat");
  const [notConnected, setNotConnected] = useState<{ message: string; reconnectUrl: string } | null>(null);
  const [connectedChannels, setConnectedChannels] = useState<ConnectedChannel[]>([]);
  const [showConnections, setShowConnections] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const [showUpload, setShowUpload] = useState(false);
  const [expandedVideo, setExpandedVideo] = useState<string | null>(null);
  const [newVideo, setNewVideo] = useState({
    title: "",
    description: "",
    tags: "",
    brandId: "zeneco",
    visibility: "public" as "public" | "unlisted" | "private",
  });
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<{ url: string; videoId: string } | null>(null);

  const fetchYouTubeData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotConnected(null);
    try {
      const res = await fetch(`/api/youtube?brandId=${encodeURIComponent(selectedBrandId)}`);
      if (!res.ok) throw new Error("Kunne ikke hente YouTube-data");
      const data = await res.json();

      if (!data.configured) {
        setConfigured(false);
        setLoading(false);
        return;
      }

      setConfigured(true);

      if (data.connected === false) {
        // This brand has no working YouTube connection — show the connect
        // card instead of a generic error.
        const fallback = connectUrlFor(
          brandOptions.find((b) => b.id === selectedBrandId) || { id: selectedBrandId },
        );
        setNotConnected({
          message: data.message || "Ingen YouTube-tilkobling for dette brandet.",
          reconnectUrl: data.reconnectUrl || fallback,
        });
        setVideos([]);
        setChannelStats(null);
        setChannelTitle("");
        setLoading(false);
        return;
      }

      setChannelTitle(data.channel?.title || "");
      if (data.channel) {
        setChannelStats({
          subscriberCount: String(data.channel.subscriberCount || 0),
          viewCount: String(data.channel.viewCount || 0),
          videoCount: String(data.channel.videoCount || 0),
        });
      }

      if (data.videos && Array.isArray(data.videos)) {
        const mapped: Video[] = data.videos.map((v: Record<string, unknown>) => ({
          id: (v.id as string) || "",
          title: (v.title as string) || "",
          description: (v.description as string) || "",
          channel: "",
          brand: "",
          views: Number(v.viewCount || 0),
          likes: Number(v.likeCount || 0),
          comments: Number(v.commentCount || 0),
          ctr: 0,
          publishedAt: v.publishedAt
            ? new Date(v.publishedAt as string).toLocaleDateString("nb-NO")
            : "",
          duration: "",
          status: "published" as const,
          thumbnailUrl: (v.thumbnailUrl as string) || "",
          thumbnailColor: "bg-gradient-to-br from-slate-600/40 to-slate-500/30",
          tags: Array.isArray(v.tags) ? (v.tags as string[]).slice(0, 10) : [],
          visibility: "public" as const,
        }));
        setVideos(mapped);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ukjent feil");
    }
    setLoading(false);
  }, [selectedBrandId]);

  useEffect(() => {
    fetchYouTubeData();
  }, [fetchYouTubeData]);

  // Connected-channels overview for the "Kanaler & tilkobling" panel.
  const loadConnections = useCallback(async () => {
    try {
      const res = await fetch("/api/oauth/channels?platform=youtube");
      const data = await res.json();
      if (res.ok && Array.isArray(data.channels)) {
        setConnectedChannels(data.channels as ConnectedChannel[]);
      }
    } catch {
      // Non-fatal — panel just shows brands as not connected.
    }
  }, []);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  const channelsForBrand = (brandId: string): ConnectedChannel[] =>
    connectedChannels.filter(
      (c) => (CHANNEL_BRAND_ALIASES[c.brand_id] || c.brand_id) === brandId,
    );

  const publishedVideos = videos.filter((v) => v.status === "published");
  const totalViews = channelStats ? parseInt(channelStats.viewCount, 10) : publishedVideos.reduce((s, v) => s + v.views, 0);
  const totalLikes = publishedVideos.reduce((s, v) => s + v.likes, 0);
  const avgEngagement = publishedVideos.length > 0
    ? ((totalLikes / Math.max(totalViews, 1)) * 100).toFixed(1)
    : "0";

  const filteredVideos =
    activeTab === "all"
      ? videos
      : activeTab === "published"
      ? videos.filter((v) => v.status === "published")
      : videos.filter((v) => v.status === "draft");

  const resetUploadForm = () => {
    setNewVideo({ title: "", description: "", tags: "", brandId: selectedBrandId, visibility: "public" });
    setVideoFile(null);
    setUploadError(null);
    setUploadResult(null);
  };

  const uploadVideo = async () => {
    if (!videoFile || !newVideo.title) return;
    setUploading(true);
    setUploadError(null);
    setUploadResult(null);
    try {
      const formData = new FormData();
      formData.append("file", videoFile);
      formData.append("title", newVideo.title);
      formData.append("description", newVideo.description);
      formData.append("tags", newVideo.tags);
      // Music goes under category 10, everything else uses 22 (People & Blogs).
      formData.append("categoryId", newVideo.brandId === "neuralbeat" ? "10" : "22");
      formData.append("privacyStatus", newVideo.visibility);
      formData.append("brandId", newVideo.brandId);

      const res = await fetch("/api/youtube", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Opplasting feilet");
      }
      setUploadResult({ url: data.youtubeUrl || data.videoUrl, videoId: data.videoId });
      await fetchYouTubeData();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Ukjent feil");
    } finally {
      setUploading(false);
    }
  };

  const deleteVideo = (id: string) => {
    setVideos((prev) => prev.filter((v) => v.id !== id));
    if (expandedVideo === id) setExpandedVideo(null);
  };

  // Not configured state
  if (!loading && !configured) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <Youtube className="text-red-400" size={28} />
              YouTube Studio
            </h1>
          </div>
        </div>
        <Card>
          <CardContent className="p-12 text-center">
            <AlertCircle size={48} className="mx-auto text-amber-400 mb-4" />
            <h2 className="text-lg font-semibold text-white mb-2">YouTube er ikke konfigurert</h2>
            <p className="text-sm text-slate-400 max-w-md mx-auto">
              Gå til Innstillinger og legg inn YouTube API-nøkler og refresh token for å koble til YouTube-kanalen din.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Youtube className="text-red-400" size={28} />
            YouTube Studio
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Administrer videoer, analyser ytelse og last opp nytt innhold
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowConnections((v) => !v)}>
            <Link2 size={14} className="mr-1.5" />
            Kanaler &amp; tilkobling
          </Button>
          <Button variant="outline" size="sm" onClick={fetchYouTubeData} disabled={loading}>
            <RefreshCw size={14} className={`mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Oppdater
          </Button>
          <Button onClick={() => {
            setNewVideo((p) => ({ ...p, brandId: selectedBrandId }));
            setShowUpload(true);
          }}>
            <Upload size={16} className="mr-2" />
            Last opp video
          </Button>
        </div>
      </div>

      {/* Brand selector — data below is scoped to ONE brand's channel */}
      <div className="flex flex-wrap gap-2">
        {brandOptions.map((b) => {
          const isConnected = channelsForBrand(b.id).some((c) => c.has_token);
          return (
            <button
              key={b.id}
              onClick={() => setSelectedBrandId(b.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 ${
                selectedBrandId === b.id
                  ? "bg-red-500/20 text-red-200 border-red-500/40"
                  : "bg-slate-800/50 text-slate-400 border-slate-700 hover:border-slate-500"
              }`}
            >
              {b.name}
              {isConnected ? (
                <CheckCircle2 size={12} className="text-emerald-400" />
              ) : (
                <AlertCircle size={12} className="text-slate-600" />
              )}
            </button>
          );
        })}
      </div>
      {channelTitle && !loading && !notConnected && (
        <p className="text-xs text-slate-500 -mt-3">
          Viser kanal: <span className="text-slate-300 font-medium">{channelTitle}</span>
        </p>
      )}

      {/* Connections panel: setup + reauth per brand */}
      {showConnections && (
        <Card>
          <CardContent className="p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <KeyRound size={15} className="text-amber-400" />
                YouTube-tilkobling per brand
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Hvert brand har sin egen YouTube-kanal og sitt eget innloggingstoken. Systemet blander
                aldri kanaler så lenge hvert brand er koblet til separat her.
              </p>
            </div>

            <div className="space-y-2">
              {brandOptions.map((b) => {
                const chans = channelsForBrand(b.id);
                const connected = chans.filter((c) => c.has_token);
                return (
                  <div
                    key={b.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-700 bg-slate-800/40"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-200">{b.name}</p>
                      {connected.length > 0 ? (
                        <p className="text-xs text-emerald-400 truncate">
                          Tilkoblet: {connected.map((c) => c.display_name).join(", ")}
                          {connected[0]?.token_rotated_at && (
                            <span className="text-slate-500">
                              {" "}· token fornyet {new Date(connected[0].token_rotated_at).toLocaleDateString("nb-NO")}
                            </span>
                          )}
                        </p>
                      ) : (
                        <p className="text-xs text-slate-500">Ikke tilkoblet</p>
                      )}
                    </div>
                    <a
                      href={connectUrlFor(b)}
                      className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        connected.length > 0
                          ? "bg-slate-700 text-slate-200 hover:bg-slate-600"
                          : "bg-red-600 text-white hover:bg-red-500"
                      }`}
                    >
                      <RefreshCw size={12} />
                      {connected.length > 0 ? "Re-autentiser" : "Koble til YouTube"}
                    </a>
                  </div>
                );
              })}
            </div>

            <div className="p-3 rounded-lg bg-slate-800/60 border border-slate-700">
              <p className="text-xs font-medium text-slate-300 mb-1.5">Slik setter du opp YouTube for et brand:</p>
              <ol className="text-xs text-slate-400 space-y-1 list-decimal list-inside">
                <li>Klikk «Koble til YouTube» på brandet over.</li>
                <li>Logg inn med Google-kontoen som <span className="text-slate-200">eier akkurat den kanalen</span> — bruk kontovelgeren hvis du har flere.</li>
                <li>Har kontoen flere kanaler, får du en kanalvelger etterpå — velg kanalen som hører til brandet.</li>
                <li>Tokenet lagres kun for dette brandet. Gjenta for hvert brand med egen kanal.</li>
              </ol>
              <p className="text-xs text-slate-500 mt-2">
                Slutter en kanal å virke (utløpt/tilbakekalt token), klikk «Re-autentiser» — det påvirker ikke de andre brandene.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Selected brand has no working connection */}
      {!loading && notConnected && (
        <Card className="border-amber-500/30">
          <CardContent className="p-8 text-center">
            <Youtube size={40} className="mx-auto text-red-400 mb-3" />
            <h2 className="text-base font-semibold text-white mb-1">
              {brandOptions.find((b) => b.id === selectedBrandId)?.name} er ikke koblet til YouTube
            </h2>
            <p className="text-xs text-slate-400 max-w-md mx-auto mb-4">{notConnected.message}</p>
            <a
              href={notConnected.reconnectUrl}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-500 transition-colors"
            >
              <Link2 size={14} />
              Koble til / re-autentiser kanalen
            </a>
            <p className="text-[11px] text-slate-500 mt-3">
              Logg inn med Google-kontoen som eier kanalen for dette brandet. Se «Kanaler &amp; tilkobling» øverst for full oppskrift.
            </p>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-red-500/30">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertCircle size={16} className="text-red-400 flex-shrink-0" />
            <p className="text-sm text-red-300">{error}</p>
            <Button variant="ghost" size="sm" onClick={fetchYouTubeData} className="ml-auto">Prøv igjen</Button>
          </CardContent>
        </Card>
      )}

      {/* Upload Modal */}
      {showUpload && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => {
            if (uploading) return;
            setShowUpload(false);
            resetUploadForm();
          }}
        >
          <Card className="w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Last opp ny video</h2>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => { setShowUpload(false); resetUploadForm(); }}
                  disabled={uploading}
                >
                  <X size={18} />
                </Button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1.5 block">Videofil</label>
                  <label
                    htmlFor="yt-upload-file"
                    className="w-full h-28 rounded-lg border-2 border-dashed border-slate-600 bg-slate-800/50 flex items-center justify-center cursor-pointer hover:border-slate-500 transition-colors"
                  >
                    <div className="text-center px-4">
                      <Upload size={24} className="mx-auto text-slate-500 mb-1" />
                      {videoFile ? (
                        <>
                          <p className="text-sm text-slate-200 break-all">{videoFile.name}</p>
                          <p className="text-[10px] text-slate-500 mt-0.5">{(videoFile.size / 1024 / 1024).toFixed(1)} MB</p>
                        </>
                      ) : (
                        <p className="text-xs text-slate-500">Klikk for å velge videofil (mp4, mov, …)</p>
                      )}
                    </div>
                  </label>
                  <input
                    id="yt-upload-file"
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
                    disabled={uploading}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1.5 block">Tittel</label>
                  <Input
                    value={newVideo.title}
                    onChange={(e) => setNewVideo((p) => ({ ...p, title: e.target.value }))}
                    placeholder="Skriv inn videotittelen..."
                    disabled={uploading}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1.5 block">Beskrivelse</label>
                  <textarea
                    value={newVideo.description}
                    onChange={(e) => setNewVideo((p) => ({ ...p, description: e.target.value }))}
                    placeholder="Beskriv videoen..."
                    className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 h-24 resize-none"
                    disabled={uploading}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1.5 block">Tags (kommaseparert)</label>
                  <Input
                    value={newVideo.tags}
                    onChange={(e) => setNewVideo((p) => ({ ...p, tags: e.target.value }))}
                    placeholder="eiendom, spania, luksus"
                    disabled={uploading}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-300 mb-1.5 block">Brand</label>
                    <select
                      value={newVideo.brandId}
                      onChange={(e) => setNewVideo((p) => ({ ...p, brandId: e.target.value }))}
                      className="w-full h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100"
                      disabled={uploading}
                    >
                      {brandOptions.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-300 mb-1.5 block">Synlighet</label>
                    <select
                      value={newVideo.visibility}
                      onChange={(e) => setNewVideo((p) => ({ ...p, visibility: e.target.value as "public" | "unlisted" | "private" }))}
                      className="w-full h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100"
                      disabled={uploading}
                    >
                      <option value="public">Offentlig</option>
                      <option value="unlisted">Ikke oppført</option>
                      <option value="private">Privat</option>
                    </select>
                  </div>
                </div>

                {uploadError && (
                  <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2">
                    <AlertCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-red-300">{uploadError}</p>
                  </div>
                )}

                {uploadResult && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                    <p className="text-xs text-emerald-300 mb-1">Video lastet opp!</p>
                    <a
                      href={uploadResult.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-emerald-200 underline break-all"
                    >
                      {uploadResult.url}
                    </a>
                  </div>
                )}

                <Button
                  onClick={uploadVideo}
                  className="w-full"
                  disabled={!videoFile || !newVideo.title || uploading}
                >
                  {uploading ? (
                    <>
                      <Loader2 size={16} className="mr-1 animate-spin" />
                      Laster opp til YouTube…
                    </>
                  ) : (
                    <>
                      <Upload size={16} className="mr-1" />
                      Last opp til YouTube
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Channel Overview Stats */}
      {!notConnected && (loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-3">
                <div className="animate-pulse space-y-2">
                  <div className="h-3 bg-slate-700 rounded w-16" />
                  <div className="h-6 bg-slate-700 rounded w-12" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              label: "Abonnenter",
              value: channelStats ? parseInt(channelStats.subscriberCount).toLocaleString("nb-NO") : "—",
              icon: Users,
              color: "text-emerald-400",
            },
            {
              label: "Totale visninger",
              value: totalViews.toLocaleString("nb-NO"),
              icon: Eye,
              color: "text-blue-400",
            },
            {
              label: "Snitt engasjement",
              value: `${avgEngagement}%`,
              icon: TrendingUp,
              color: "text-amber-400",
            },
            {
              label: "Videoer",
              value: channelStats ? parseInt(channelStats.videoCount).toLocaleString("nb-NO") : videos.length.toString(),
              icon: Play,
              color: "text-red-400",
            },
          ].map((stat) => (
            <Card key={stat.label}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider">{stat.label}</p>
                    <p className="text-xl font-bold text-white mt-0.5">{stat.value}</p>
                  </div>
                  <stat.icon size={20} className={`${stat.color} opacity-60`} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ))}

      {/* Tabs */}
      {!notConnected && (loading ? (
        <Card>
          <CardContent className="p-12 flex flex-col items-center justify-center">
            <Loader2 size={32} className="text-red-400 animate-spin mb-3" />
            <p className="text-sm text-slate-400">Henter videoer fra YouTube...</p>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="all">Alle videoer ({videos.length})</TabsTrigger>
            <TabsTrigger value="published">Publiserte ({videos.filter((v) => v.status === "published").length})</TabsTrigger>
            <TabsTrigger value="draft">Kladder ({videos.filter((v) => v.status === "draft").length})</TabsTrigger>
          </TabsList>

          {["all", "published", "draft"].map((tab) => (
            <TabsContent key={tab} value={tab}>
              <div className="space-y-3">
                {filteredVideos.length === 0 ? (
                  <p className="text-slate-500 text-sm py-8 text-center">Ingen videoer i denne kategorien</p>
                ) : (
                  filteredVideos.map((video) => {
                    const config = statusConfig[video.status];
                    const isExpanded = expandedVideo === video.id;
                    return (
                      <Card key={video.id} className="hover:border-slate-500 transition-all">
                        <CardContent className="p-4">
                          <div className="flex gap-4">
                            {/* Thumbnail */}
                            <div
                              className="w-40 h-24 rounded-lg flex-shrink-0 relative cursor-pointer overflow-hidden bg-slate-800"
                              onClick={() => setExpandedVideo(isExpanded ? null : video.id)}
                            >
                              {video.thumbnailUrl ? (
                                <img
                                  src={video.thumbnailUrl}
                                  alt={video.title}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className={`w-full h-full ${video.thumbnailColor} flex items-center justify-center`}>
                                  <Play size={24} className="text-white/40" />
                                </div>
                              )}
                              <span className="absolute bottom-1 right-1 text-[10px] bg-black/80 text-white px-1 rounded">
                                {video.duration}
                              </span>
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <h3
                                  className="text-sm font-semibold text-slate-100 line-clamp-2 cursor-pointer hover:text-white"
                                  onClick={() => setExpandedVideo(isExpanded ? null : video.id)}
                                >
                                  {video.title}
                                </h3>
                                <Badge variant={config.variant} className="text-[10px] flex-shrink-0">
                                  {config.label}
                                </Badge>
                              </div>

                              <div className="flex items-center gap-2 mt-1">
                                <p className="text-xs text-slate-500">{video.channel}</p>
                                {video.tags.slice(0, 3).map((tag) => (
                                  <Badge key={tag} variant="outline" className="text-[9px] px-1.5 py-0">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>

                              <div className="flex items-center gap-4 mt-3 text-xs text-slate-400">
                                <span className="flex items-center gap-1">
                                  <Eye size={12} />
                                  {video.views.toLocaleString("nb-NO")}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Heart size={12} />
                                  {video.likes.toLocaleString("nb-NO")}
                                </span>
                                <span className="flex items-center gap-1">
                                  <MessageCircle size={12} />
                                  {video.comments}
                                </span>
                                {video.publishedAt && (
                                  <span className="flex items-center gap-1">
                                    <Clock size={12} />
                                    {video.publishedAt}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Actions */}
                            <div className="flex flex-col gap-1.5 flex-shrink-0">
                              <a
                                href={`https://youtube.com/watch?v=${video.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center rounded-md text-xs h-8 px-3 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                              >
                                <Youtube size={12} className="mr-1" />
                                Se på YT
                              </a>
                              <Button size="sm" variant="ghost" className="text-xs" onClick={() => setExpandedVideo(isExpanded ? null : video.id)}>
                                <BarChart3 size={12} className="mr-1" />
                                Analyse
                              </Button>
                            </div>
                          </div>

                          {/* Expanded Analytics */}
                          {isExpanded && (
                            <div className="mt-4 pt-4 border-t border-slate-700/50">
                              <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">Videoanalyse</h4>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div className="rounded-lg bg-slate-800/60 p-3">
                                  <div className="flex items-center gap-1.5 text-blue-400 mb-1">
                                    <Eye size={14} />
                                    <span className="text-[10px] uppercase tracking-wider">Visninger</span>
                                  </div>
                                  <p className="text-lg font-bold text-white">{video.views.toLocaleString("nb-NO")}</p>
                                </div>
                                <div className="rounded-lg bg-slate-800/60 p-3">
                                  <div className="flex items-center gap-1.5 text-rose-400 mb-1">
                                    <Heart size={14} />
                                    <span className="text-[10px] uppercase tracking-wider">Likes</span>
                                  </div>
                                  <p className="text-lg font-bold text-white">{video.likes.toLocaleString("nb-NO")}</p>
                                </div>
                                <div className="rounded-lg bg-slate-800/60 p-3">
                                  <div className="flex items-center gap-1.5 text-amber-400 mb-1">
                                    <MessageCircle size={14} />
                                    <span className="text-[10px] uppercase tracking-wider">Kommentarer</span>
                                  </div>
                                  <p className="text-lg font-bold text-white">{video.comments}</p>
                                </div>
                                <div className="rounded-lg bg-slate-800/60 p-3">
                                  <div className="flex items-center gap-1.5 text-emerald-400 mb-1">
                                    <TrendingUp size={14} />
                                    <span className="text-[10px] uppercase tracking-wider">Engasjement</span>
                                  </div>
                                  <p className="text-lg font-bold text-white">
                                    {video.views > 0 ? ((video.likes / video.views) * 100).toFixed(1) : "0"}%
                                  </p>
                                </div>
                              </div>
                              <p className="text-xs text-slate-500 mt-3 line-clamp-3">{video.description}</p>
                              {video.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {video.tags.map((tag) => (
                                    <Badge key={tag} variant="outline" className="text-[9px]">{tag}</Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      ))}
    </div>
  );
}
