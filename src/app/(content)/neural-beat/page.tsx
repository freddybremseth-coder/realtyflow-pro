"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Music, Play, Upload, Youtube, Zap, Clock, CheckCircle,
  Plus, X, Eye, TrendingUp, Disc3,
} from "lucide-react";

type PipelineStep = "compose" | "render" | "upload" | "publish";

interface Song {
  id: string;
  title: string;
  genre: string;
  bpm: number;
  duration: string;
  mood: string;
  status: "generated" | "rendered" | "uploaded" | "published";
  pipelineStep: PipelineStep;
  views: number;
  likes: number;
  comments: number;
  createdAt: string;
}

const pipelineSteps: { key: PipelineStep; label: string; icon: typeof Music }[] = [
  { key: "compose", label: "Komponer", icon: Music },
  { key: "render", label: "Render", icon: Zap },
  { key: "upload", label: "Last opp", icon: Upload },
  { key: "publish", label: "Publiser", icon: Youtube },
];

const stepIndex: Record<PipelineStep, number> = { compose: 0, render: 1, upload: 2, publish: 3 };

const statusConfig = {
  generated: { label: "Generert", variant: "secondary" as const },
  rendered: { label: "Rendret", variant: "warning" as const },
  uploaded: { label: "Lastet opp", variant: "outline" as const },
  published: { label: "Publisert", variant: "success" as const },
};

const genres = ["EDM", "House", "Techno", "Ambient", "Synthwave", "Drum & Bass"];

const initialSongs: Song[] = [
  {
    id: "NB001",
    title: "Midnight Pulse",
    genre: "EDM",
    bpm: 128,
    duration: "3:45",
    mood: "Energisk, mørk, drivende",
    status: "published",
    pipelineStep: "publish",
    views: 8920,
    likes: 567,
    comments: 89,
    createdAt: "2026-03-08",
  },
  {
    id: "NB002",
    title: "Synthwave Dreams",
    genre: "Synthwave",
    bpm: 110,
    duration: "4:12",
    mood: "Nostalgisk, varm, retro",
    status: "published",
    pipelineStep: "publish",
    views: 4350,
    likes: 312,
    comments: 45,
    createdAt: "2026-03-05",
  },
  {
    id: "NB003",
    title: "Deep Current",
    genre: "House",
    bpm: 124,
    duration: "5:30",
    mood: "Groovy, dyp, hypnotisk",
    status: "rendered",
    pipelineStep: "render",
    views: 0,
    likes: 0,
    comments: 0,
    createdAt: "2026-03-15",
  },
  {
    id: "NB004",
    title: "Neon Horizon",
    genre: "Techno",
    bpm: 138,
    duration: "6:15",
    mood: "Intens, industriell, pulserende",
    status: "uploaded",
    pipelineStep: "upload",
    views: 0,
    likes: 0,
    comments: 0,
    createdAt: "2026-03-18",
  },
  {
    id: "NB005",
    title: "Ethereal Flow",
    genre: "Ambient",
    bpm: 85,
    duration: "7:42",
    mood: "Rolig, drømmende, atmosfærisk",
    status: "generated",
    pipelineStep: "compose",
    views: 0,
    likes: 0,
    comments: 0,
    createdAt: "2026-03-20",
  },
  {
    id: "NB006",
    title: "Velocity",
    genre: "Drum & Bass",
    bpm: 174,
    duration: "4:58",
    mood: "Rask, aggressiv, elektrisk",
    status: "generated",
    pipelineStep: "compose",
    views: 0,
    likes: 0,
    comments: 0,
    createdAt: "2026-03-21",
  },
];

const genreColors: Record<string, string> = {
  EDM: "from-pink-600/40 to-rose-500/30",
  House: "from-amber-600/40 to-orange-500/30",
  Techno: "from-slate-600/40 to-zinc-500/30",
  Ambient: "from-sky-600/40 to-cyan-500/30",
  Synthwave: "from-violet-600/40 to-purple-500/30",
  "Drum & Bass": "from-red-600/40 to-orange-500/30",
};

export default function NeuralBeatPage() {
  const [songs, setSongs] = useState<Song[]>(initialSongs);
  const [showNewSong, setShowNewSong] = useState(false);
  const [newSong, setNewSong] = useState({
    title: "",
    genre: "EDM",
    bpm: "128",
    mood: "",
  });

  const publishedSongs = songs.filter((s) => s.status === "published");
  const totalViews = publishedSongs.reduce((sum, s) => sum + s.views, 0);
  const totalLikes = publishedSongs.reduce((sum, s) => sum + s.likes, 0);
  const avgEngagement = publishedSongs.length > 0
    ? ((totalLikes / Math.max(totalViews, 1)) * 100).toFixed(1)
    : "0";

  const addSong = () => {
    if (!newSong.title) return;
    const durations = ["3:20", "4:05", "3:55", "5:10", "4:30", "6:00"];
    const song: Song = {
      id: `NB${Date.now()}`,
      title: newSong.title,
      genre: newSong.genre,
      bpm: parseInt(newSong.bpm) || 128,
      duration: durations[Math.floor(Math.random() * durations.length)],
      mood: newSong.mood,
      status: "generated",
      pipelineStep: "compose",
      views: 0,
      likes: 0,
      comments: 0,
      createdAt: new Date().toISOString().split("T")[0],
    };
    setSongs((prev) => [song, ...prev]);
    setNewSong({ title: "", genre: "EDM", bpm: "128", mood: "" });
    setShowNewSong(false);
  };

  const advancePipeline = (id: string, targetStep: PipelineStep) => {
    const statusMap: Record<PipelineStep, Song["status"]> = {
      compose: "generated",
      render: "rendered",
      upload: "uploaded",
      publish: "published",
    };
    setSongs((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, pipelineStep: targetStep, status: statusMap[targetStep] }
          : s
      )
    );
  };

  const deleteSong = (id: string) => {
    setSongs((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Music className="text-pink-400" size={28} />
            Neural Beat
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            AI-drevet musikkproduksjon: Komponer, render, last opp og publiser
          </p>
        </div>
        <Button onClick={() => setShowNewSong(true)}>
          <Plus size={16} className="mr-2" />
          Ny sang
        </Button>
      </div>

      {/* New Song Modal */}
      {showNewSong && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowNewSong(false)}>
          <Card className="w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Ny sang</h2>
                <Button variant="ghost" size="icon" onClick={() => setShowNewSong(false)}>
                  <X size={18} />
                </Button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1.5 block">Tittel</label>
                  <Input
                    value={newSong.title}
                    onChange={(e) => setNewSong((p) => ({ ...p, title: e.target.value }))}
                    placeholder="Skriv inn sangtittelen..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-300 mb-1.5 block">Sjanger</label>
                    <select
                      value={newSong.genre}
                      onChange={(e) => setNewSong((p) => ({ ...p, genre: e.target.value }))}
                      className="w-full h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100"
                    >
                      {genres.map((g) => (
                        <option key={g}>{g}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-300 mb-1.5 block">BPM</label>
                    <Input
                      type="number"
                      value={newSong.bpm}
                      onChange={(e) => setNewSong((p) => ({ ...p, bpm: e.target.value }))}
                      placeholder="128"
                      min={60}
                      max={200}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1.5 block">Stemning / Beskrivelse</label>
                  <textarea
                    value={newSong.mood}
                    onChange={(e) => setNewSong((p) => ({ ...p, mood: e.target.value }))}
                    placeholder="Beskriv stemningen og stilen du er ute etter..."
                    className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 h-24 resize-none"
                  />
                </div>
                <Button onClick={addSong} className="w-full" disabled={!newSong.title}>
                  <Zap size={16} className="mr-1" />
                  Generer sang
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Totalt sanger", value: songs.length.toString(), icon: Music, color: "text-pink-400" },
          { label: "Publisert på YouTube", value: publishedSongs.length.toString(), icon: Youtube, color: "text-red-400" },
          { label: "Totale visninger", value: totalViews.toLocaleString("nb-NO"), icon: Eye, color: "text-blue-400" },
          { label: "Snitt engasjement", value: `${avgEngagement}%`, icon: TrendingUp, color: "text-emerald-400" },
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

      {/* Pipeline Visualization */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-medium text-slate-300 mb-4 flex items-center gap-2">
            <Zap size={16} className="text-pink-400" />
            Pipeline oversikt
          </h3>
          <div className="flex items-center justify-between mb-2">
            {pipelineSteps.map((step, i) => {
              const count = songs.filter((s) => stepIndex[s.pipelineStep] === i).length;
              return (
                <div key={step.key} className="flex-1 text-center relative">
                  <div className={`w-10 h-10 rounded-full mx-auto flex items-center justify-center ${
                    count > 0 ? "bg-pink-500/20 text-pink-300 border border-pink-500/30" : "bg-slate-800 text-slate-500 border border-slate-700"
                  }`}>
                    <step.icon size={18} />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1.5">{step.label}</p>
                  {count > 0 && (
                    <Badge variant="secondary" className="text-[9px] mt-1">{count}</Badge>
                  )}
                  {i < pipelineSteps.length - 1 && (
                    <div className="absolute top-5 left-[calc(50%+24px)] right-[calc(-50%+24px)] h-px bg-slate-700" />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Song Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {songs.map((song) => {
          const config = statusConfig[song.status];
          const currentStepIdx = stepIndex[song.pipelineStep];
          const progressPercent = ((currentStepIdx + 1) / pipelineSteps.length) * 100;
          const gradientColor = genreColors[song.genre] || "from-pink-600/40 to-rose-500/30";

          return (
            <Card key={song.id} className="hover:border-slate-500 transition-all">
              <CardContent className="p-5">
                {/* Header with genre color strip */}
                <div className={`-mx-5 -mt-5 mb-4 h-2 rounded-t-lg bg-gradient-to-r ${gradientColor}`} />

                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${gradientColor} flex items-center justify-center`}>
                      <Disc3 size={16} className="text-white/70" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white text-sm">{song.title}</h3>
                      <p className="text-[10px] text-slate-500">{song.genre} - {song.bpm} BPM - {song.duration}</p>
                    </div>
                  </div>
                  <Badge variant={config.variant} className="text-[10px]">
                    {config.label}
                  </Badge>
                </div>

                {song.mood && (
                  <p className="text-xs text-slate-400 mb-3 line-clamp-2">{song.mood}</p>
                )}

                {/* Pipeline progress */}
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] text-slate-500">Pipeline</span>
                    <span className="text-[10px] text-slate-500">{currentStepIdx + 1}/{pipelineSteps.length}</span>
                  </div>
                  <Progress value={progressPercent} className="h-1.5" />
                  <div className="flex justify-between mt-2">
                    {pipelineSteps.map((step, i) => (
                      <div key={step.key} className="flex items-center gap-0.5">
                        {i <= currentStepIdx ? (
                          <CheckCircle size={12} className="text-emerald-400" />
                        ) : (
                          <Clock size={12} className="text-slate-600" />
                        )}
                        <span className={`text-[9px] ${i <= currentStepIdx ? "text-slate-300" : "text-slate-600"}`}>
                          {step.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Stats for published songs */}
                {song.status === "published" && (
                  <div className="flex gap-3 mb-3 text-xs text-slate-400 border-t border-slate-700/50 pt-3">
                    <span className="flex items-center gap-1"><Eye size={11} /> {song.views.toLocaleString("nb-NO")}</span>
                    <span className="flex items-center gap-1"><Play size={11} /> {song.likes}</span>
                    <span className="flex items-center gap-1"><Youtube size={11} /> {song.comments}</span>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 flex-wrap">
                  {song.status === "generated" && (
                    <Button size="sm" onClick={() => advancePipeline(song.id, "render")} className="text-xs">
                      <Zap size={12} className="mr-1" />
                      Render video
                    </Button>
                  )}
                  {song.status === "rendered" && (
                    <Button size="sm" onClick={() => advancePipeline(song.id, "upload")} className="text-xs">
                      <Upload size={12} className="mr-1" />
                      Last opp til YouTube
                    </Button>
                  )}
                  {song.status === "uploaded" && (
                    <Button size="sm" onClick={() => advancePipeline(song.id, "publish")} className="text-xs">
                      <Youtube size={12} className="mr-1" />
                      Publiser
                    </Button>
                  )}
                  {song.status === "published" && (
                    <Button size="sm" variant="outline" className="text-xs">
                      <Play size={12} className="mr-1" />
                      Se på YouTube
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="text-xs text-red-400 hover:text-red-300 ml-auto" onClick={() => deleteSong(song.id)}>
                    <X size={12} />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
