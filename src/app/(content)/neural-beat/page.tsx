"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Music, Play, Loader2, CheckCircle, Youtube, Trash2 } from "lucide-react";

interface Song {
  id: string;
  name: string;
  artist: string;
  genre: string;
  status: "ready" | "processing" | "completed" | "failed";
  youtubeUrl?: string;
  steps: string[];
}

const mockSongs: Song[] = [
  { id: "1", name: "Midnight Pulse", artist: "Neural Beat", genre: "EDM", status: "completed", youtubeUrl: "#", steps: ["Analyze", "Generate", "Render", "Upload"] },
  { id: "2", name: "Solar Waves", artist: "Neural Beat", genre: "Trance", status: "ready", steps: [] },
  { id: "3", name: "Digital Rain", artist: "Neural Beat", genre: "Synthwave", status: "ready", steps: [] },
];

const pipelineSteps = [
  "Henter sang fra Airtable",
  "Analyserer sjanger og stemning",
  "Genererer genre-bilder",
  "Lager video med FFmpeg",
  "Optimaliserer for YouTube",
  "Laster opp til YouTube",
];

export default function NeuralBeatPage() {
  const [songs, setSongs] = useState<Song[]>(mockSongs);
  const [processing, setProcessing] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);

  const handleProcess = async (songId: string) => {
    setProcessing(songId);
    setCurrentStep(0);

    for (let i = 0; i < pipelineSteps.length; i++) {
      setCurrentStep(i);
      await new Promise((r) => setTimeout(r, 1500));
    }

    setSongs((prev) =>
      prev.map((s) =>
        s.id === songId
          ? { ...s, status: "completed" as const, youtubeUrl: "#", steps: pipelineSteps }
          : s
      )
    );
    setProcessing(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Music className="text-pink-400" size={28} />
            Neural Beat
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Automatisert musikkvideopipeline: Airtable → AI → FFmpeg → YouTube
          </p>
        </div>
        <Button variant="outline">Synkroniser Airtable</Button>
      </div>

      {/* Pipeline Progress */}
      {processing && (
        <Card className="border-pink-500/30">
          <CardHeader>
            <CardTitle className="text-pink-300">Pipeline Aktiv</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pipelineSteps.map((step, i) => (
                <div key={i} className="flex items-center gap-3">
                  {i < currentStep ? (
                    <CheckCircle size={18} className="text-emerald-400" />
                  ) : i === currentStep ? (
                    <Loader2 size={18} className="text-pink-400 animate-spin" />
                  ) : (
                    <div className="w-[18px] h-[18px] rounded-full border border-slate-600" />
                  )}
                  <span className={i <= currentStep ? "text-slate-200" : "text-slate-500"}>
                    {step}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Songs Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {songs.map((song) => (
          <Card key={song.id}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-white">{song.name}</h3>
                  <p className="text-xs text-slate-400">{song.artist}</p>
                </div>
                <Badge
                  variant={
                    song.status === "completed"
                      ? "success"
                      : song.status === "processing"
                      ? "warning"
                      : "secondary"
                  }
                >
                  {song.status}
                </Badge>
              </div>
              <p className="text-xs text-slate-500 mb-4">Sjanger: {song.genre}</p>

              <div className="flex gap-2">
                {song.status === "ready" && (
                  <Button
                    size="sm"
                    onClick={() => handleProcess(song.id)}
                    disabled={!!processing}
                  >
                    <Play size={14} className="mr-1" />
                    Kjør Pipeline
                  </Button>
                )}
                {song.youtubeUrl && (
                  <Button size="sm" variant="outline">
                    <Youtube size={14} className="mr-1" />
                    Se på YouTube
                  </Button>
                )}
                <Button size="sm" variant="ghost">
                  <Trash2 size={14} />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
