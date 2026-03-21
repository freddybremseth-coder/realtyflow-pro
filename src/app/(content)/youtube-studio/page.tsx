"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Youtube, Upload, Eye, Heart, MessageCircle, TrendingUp, Play, Clock,
  Plus, X, Users, BarChart3, MousePointerClick,
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
  thumbnailColor: string;
  tags: string[];
  visibility: "public" | "unlisted" | "private";
}

const initialVideos: Video[] = [
  {
    id: "V001",
    title: "Villa med havutsikt i Altea - Virtuell tur | Soleada Eiendom",
    description: "Oppdag denne fantastiske villaen med panoramisk havutsikt i Altea, Costa Blanca.",
    channel: "Soleada",
    brand: "Soleada.no",
    views: 12450,
    likes: 342,
    comments: 56,
    ctr: 6.8,
    publishedAt: "2026-03-10",
    duration: "8:24",
    status: "published",
    thumbnailColor: "bg-gradient-to-br from-blue-600/40 to-cyan-500/30",
    tags: ["eiendom", "spania", "costa blanca"],
    visibility: "public",
  },
  {
    id: "V002",
    title: "Midnight Pulse - Neural Beat | Official Visualizer",
    description: "AI-generert EDM-track med futuristisk visualizer. Produsert av Neural Beat.",
    channel: "Neural Beat",
    brand: "Neural Beat",
    views: 8920,
    likes: 567,
    comments: 89,
    ctr: 9.2,
    publishedAt: "2026-03-08",
    duration: "3:45",
    status: "published",
    thumbnailColor: "bg-gradient-to-br from-purple-600/40 to-pink-500/30",
    tags: ["edm", "ai music", "neural beat"],
    visibility: "public",
  },
  {
    id: "V003",
    title: "5 tips for å kjøpe eiendom i Spania som nordmann",
    description: "Alt du trenger å vite før du kjøper bolig i Spania. Juridiske tips og fallgruver.",
    channel: "Freddy Bremseth",
    brand: "Freddy Bremseth",
    views: 5230,
    likes: 198,
    comments: 34,
    ctr: 5.4,
    publishedAt: "2026-03-05",
    duration: "12:15",
    status: "published",
    thumbnailColor: "bg-gradient-to-br from-amber-600/40 to-orange-500/30",
    tags: ["boligkjøp", "spania", "tips"],
    visibility: "public",
  },
  {
    id: "V004",
    title: "Zen Eco Homes - Bærekraftig luksus på Costa Blanca",
    description: "Se vårt nye bærekraftige boligprosjekt med solceller og grønn teknologi.",
    channel: "Zen Eco Homes",
    brand: "Zen Eco Homes",
    views: 0,
    likes: 0,
    comments: 0,
    ctr: 0,
    publishedAt: "",
    duration: "6:30",
    status: "draft",
    thumbnailColor: "bg-gradient-to-br from-emerald-600/40 to-teal-500/30",
    tags: ["bærekraft", "eco homes"],
    visibility: "private",
  },
  {
    id: "V005",
    title: "Synthwave Dreams - Neural Beat | AI Visualizer",
    description: "Ny synthwave-track generert av Neural Beat AI-pipeline.",
    channel: "Neural Beat",
    brand: "Neural Beat",
    views: 0,
    likes: 0,
    comments: 0,
    ctr: 0,
    publishedAt: "",
    duration: "4:12",
    status: "processing",
    thumbnailColor: "bg-gradient-to-br from-indigo-600/40 to-violet-500/30",
    tags: ["synthwave", "ai music"],
    visibility: "unlisted",
  },
  {
    id: "V006",
    title: "ChatGenius Demo - AI Kundeservice på 5 minutter",
    description: "Se hvor enkelt det er å sette opp AI-drevet kundeservice med ChatGenius.",
    channel: "ChatGenius",
    brand: "ChatGenius.pro",
    views: 3100,
    likes: 124,
    comments: 18,
    ctr: 7.1,
    publishedAt: "2026-02-28",
    duration: "5:02",
    status: "published",
    thumbnailColor: "bg-gradient-to-br from-violet-600/40 to-purple-500/30",
    tags: ["ai", "kundeservice", "chatbot"],
    visibility: "public",
  },
];

const brandOptions = ["Soleada.no", "Zen Eco Homes", "ChatGenius.pro", "Dona Anna", "Freddy Bremseth", "Pinosos Ecolife", "Neural Beat"];

const statusConfig = {
  published: { label: "Publisert", variant: "success" as const },
  draft: { label: "Kladd", variant: "secondary" as const },
  processing: { label: "Behandles", variant: "warning" as const },
};

export default function YouTubeStudioPage() {
  const [videos, setVideos] = useState<Video[]>(initialVideos);
  const [activeTab, setActiveTab] = useState("all");
  const [showUpload, setShowUpload] = useState(false);
  const [expandedVideo, setExpandedVideo] = useState<string | null>(null);
  const [newVideo, setNewVideo] = useState({
    title: "",
    description: "",
    tags: "",
    brand: "Soleada.no",
    visibility: "public" as "public" | "unlisted" | "private",
  });

  const publishedVideos = videos.filter((v) => v.status === "published");
  const totalViews = publishedVideos.reduce((s, v) => s + v.views, 0);
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

  const addVideo = () => {
    if (!newVideo.title) return;
    const colors = [
      "bg-gradient-to-br from-rose-600/40 to-red-500/30",
      "bg-gradient-to-br from-sky-600/40 to-blue-500/30",
      "bg-gradient-to-br from-lime-600/40 to-green-500/30",
      "bg-gradient-to-br from-fuchsia-600/40 to-pink-500/30",
    ];
    const video: Video = {
      id: `V${Date.now()}`,
      title: newVideo.title,
      description: newVideo.description,
      channel: newVideo.brand,
      brand: newVideo.brand,
      views: 0,
      likes: 0,
      comments: 0,
      ctr: 0,
      publishedAt: "",
      duration: "0:00",
      status: "draft",
      thumbnailColor: colors[Math.floor(Math.random() * colors.length)],
      tags: newVideo.tags.split(",").map((t) => t.trim()).filter(Boolean),
      visibility: newVideo.visibility,
    };
    setVideos((prev) => [video, ...prev]);
    setNewVideo({ title: "", description: "", tags: "", brand: "Soleada.no", visibility: "public" });
    setShowUpload(false);
  };

  const publishVideo = (id: string) => {
    setVideos((prev) =>
      prev.map((v) =>
        v.id === id
          ? { ...v, status: "published" as const, publishedAt: new Date().toISOString().split("T")[0], visibility: "public" }
          : v
      )
    );
  };

  const deleteVideo = (id: string) => {
    setVideos((prev) => prev.filter((v) => v.id !== id));
    if (expandedVideo === id) setExpandedVideo(null);
  };

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
        <Button onClick={() => setShowUpload(true)}>
          <Upload size={16} className="mr-2" />
          Last opp video
        </Button>
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowUpload(false)}>
          <Card className="w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Last opp ny video</h2>
                <Button variant="ghost" size="icon" onClick={() => setShowUpload(false)}>
                  <X size={18} />
                </Button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1.5 block">Tittel</label>
                  <Input
                    value={newVideo.title}
                    onChange={(e) => setNewVideo((p) => ({ ...p, title: e.target.value }))}
                    placeholder="Skriv inn videotittelen..."
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1.5 block">Beskrivelse</label>
                  <textarea
                    value={newVideo.description}
                    onChange={(e) => setNewVideo((p) => ({ ...p, description: e.target.value }))}
                    placeholder="Beskriv videoen..."
                    className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 h-24 resize-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1.5 block">Tags (kommaseparert)</label>
                  <Input
                    value={newVideo.tags}
                    onChange={(e) => setNewVideo((p) => ({ ...p, tags: e.target.value }))}
                    placeholder="eiendom, spania, luksus"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1.5 block">Thumbnail</label>
                  <div className="w-full h-28 rounded-lg border-2 border-dashed border-slate-600 bg-slate-800/50 flex items-center justify-center cursor-pointer hover:border-slate-500 transition-colors">
                    <div className="text-center">
                      <Upload size={24} className="mx-auto text-slate-500 mb-1" />
                      <p className="text-xs text-slate-500">Klikk for å laste opp thumbnail</p>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-300 mb-1.5 block">Brand</label>
                    <select
                      value={newVideo.brand}
                      onChange={(e) => setNewVideo((p) => ({ ...p, brand: e.target.value }))}
                      className="w-full h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100"
                    >
                      {brandOptions.map((b) => (
                        <option key={b}>{b}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-300 mb-1.5 block">Synlighet</label>
                    <select
                      value={newVideo.visibility}
                      onChange={(e) => setNewVideo((p) => ({ ...p, visibility: e.target.value as "public" | "unlisted" | "private" }))}
                      className="w-full h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100"
                    >
                      <option value="public">Offentlig</option>
                      <option value="unlisted">Ikke oppført</option>
                      <option value="private">Privat</option>
                    </select>
                  </div>
                </div>
                <Button onClick={addVideo} className="w-full" disabled={!newVideo.title}>
                  <Upload size={16} className="mr-1" />
                  Opprett som kladd
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Channel Overview Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Abonnenter", value: "1 240", icon: Users, color: "text-emerald-400" },
          { label: "Totale visninger", value: totalViews.toLocaleString("nb-NO"), icon: Eye, color: "text-blue-400" },
          { label: "Snitt engasjement", value: `${avgEngagement}%`, icon: TrendingUp, color: "text-amber-400" },
          { label: "Videoer", value: videos.length.toString(), icon: Play, color: "text-red-400" },
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

      {/* Tabs */}
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
                            className={`w-40 h-24 rounded-lg ${video.thumbnailColor} flex-shrink-0 flex items-center justify-center relative cursor-pointer`}
                            onClick={() => setExpandedVideo(isExpanded ? null : video.id)}
                          >
                            <Play size={24} className="text-white/40" />
                            <span className="absolute bottom-1 right-1 text-[10px] bg-black/70 text-white px-1 rounded">
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
                            {video.status === "draft" && (
                              <Button size="sm" onClick={() => publishVideo(video.id)} className="text-xs">
                                <Youtube size={12} className="mr-1" />
                                Publiser
                              </Button>
                            )}
                            {video.status === "processing" && (
                              <Badge variant="warning" className="text-[10px] animate-pulse">
                                <Clock size={10} className="mr-1" />
                                Behandler...
                              </Badge>
                            )}
                            <Button size="sm" variant="ghost" className="text-xs" onClick={() => setExpandedVideo(isExpanded ? null : video.id)}>
                              <BarChart3 size={12} className="mr-1" />
                              Analyse
                            </Button>
                            <Button size="sm" variant="ghost" className="text-xs text-red-400 hover:text-red-300" onClick={() => deleteVideo(video.id)}>
                              <X size={12} className="mr-1" />
                              Slett
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
                                  <MousePointerClick size={14} />
                                  <span className="text-[10px] uppercase tracking-wider">CTR</span>
                                </div>
                                <p className="text-lg font-bold text-white">{video.ctr}%</p>
                              </div>
                            </div>
                            <p className="text-xs text-slate-500 mt-3">{video.description}</p>
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
    </div>
  );
}
