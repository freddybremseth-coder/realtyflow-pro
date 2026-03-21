'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Music, Loader2, Play, CheckCircle, XCircle, Clock, Zap, Youtube, Radio, Disc3,
  Waves, PlayCircle, AlertCircle, Trash2, Upload, BarChart3, Eye, ThumbsUp, MessageSquare,
} from 'lucide-react';

interface Song {
  id: string;
  title: string;
  artist: string;
  audioUrl?: string;
  genre?: string;
  mood?: string;
  youtubeUrl?: string;
  imageUrl?: string;
  metadata?: Record<string, any>;
  createdTime?: string;
}

interface PipelineStep {
  name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  error?: string;
}

interface PipelineStatus {
  id: string;
  recordId: string;
  status: 'running' | 'completed' | 'failed';
  steps: PipelineStep[];
  output?: any;
  error?: string;
}

interface YouTubeChannel {
  title: string;
  subscriberCount: number;
  videoCount: number;
  viewCount: number;
  thumbnailUrl?: string;
}

interface YouTubeVideo {
  id: string;
  title: string;
  publishedAt: string;
  thumbnailUrl?: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
}

type SongStatus = 'ready' | 'processing' | 'done' | 'error' | 'no-audio';

const PIPELINE_STEPS = [
  { name: 'Oppdater Airtable', desc: 'Marker som prosesserer' },
  { name: 'Last ned lyd', desc: 'Hent lydfil fra Airtable' },
  { name: 'AI-analyse', desc: 'Gemini analyserer sjanger, stemning, stil' },
  { name: 'YouTube SEO', desc: 'Gemini genererer tittel, beskrivelse, tagger' },
  { name: 'Generer og hent bilder', desc: 'AI-genererte + sjangerbilder fra database' },
  { name: 'FFmpeg Render', desc: 'Lokal videorendering med slideshow' },
  { name: 'YouTube Opplasting', desc: 'Last opp video med AI-metadata' },
  { name: 'Lagre resultater', desc: 'Skriv tilbake YouTube URL og metadata' },
];

export default function NeuralBeatPage() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingIds, setProcessingIds] = useState<Map<string, string>>(new Map());
  const [pipelineStatuses, setPipelineStatuses] = useState<Record<string, PipelineStatus>>({});
  const [processingAll, setProcessingAll] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const abortControllers = useRef<Map<string, AbortController>>(new Map());

  // MP3 upload state
  const [mp3File, setMp3File] = useState<File | null>(null);
  const [mp3Title, setMp3Title] = useState('');
  const [mp3Artist, setMp3Artist] = useState('Neural Beat');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // YouTube stats state
  const [ytChannel, setYtChannel] = useState<YouTubeChannel | null>(null);
  const [ytVideos, setYtVideos] = useState<YouTubeVideo[]>([]);
  const [ytLoading, setYtLoading] = useState(false);

  const fetchSongs = useCallback(() => {
    fetch('/api/neural-beat')
      .then((res) => res.json())
      .then((data) => setSongs(data.songs || []))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => { fetchSongs(); }, [fetchSongs]);

  // Cleanup abort controllers on unmount
  useEffect(() => {
    return () => {
      abortControllers.current.forEach((ctrl) => ctrl.abort());
    };
  }, []);

  // Fetch YouTube stats
  const fetchYouTubeStats = useCallback(() => {
    setYtLoading(true);
    fetch('/api/youtube')
      .then((res) => res.json())
      .then((data) => {
        if (data.channel) setYtChannel(data.channel);
        if (data.videos) setYtVideos(data.videos);
      })
      .catch(() => {})
      .finally(() => setYtLoading(false));
  }, []);

  // Handle MP3 file selection
  const handleMp3Select = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'audio/mpeg') {
      setMp3File(file);
      // Auto-extract title from filename (remove .mp3 extension)
      const name = file.name.replace(/\.mp3$/i, '').replace(/[-_]/g, ' ');
      setMp3Title(name);
      setMp3Artist('Neural Beat');
    }
  };

  // Upload MP3 as new song record
  const handleMp3Upload = async () => {
    if (!mp3File || !mp3Title) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', mp3File);
      formData.append('title', mp3Title);
      formData.append('artist', mp3Artist);

      const res = await fetch('/api/neural-beat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          upload: true,
          title: mp3Title,
          artist: mp3Artist,
          fileName: mp3File.name,
        }),
      });

      if (res.ok) {
        setMp3File(null);
        setMp3Title('');
        setMp3Artist('Neural Beat');
        if (fileInputRef.current) fileInputRef.current.value = '';
        setTimeout(fetchSongs, 1000);
      }
    } catch {
      // silently fail
    } finally {
      setIsUploading(false);
    }
  };

  /**
   * Recovery mode: when SSE connection drops, poll the songs API to check
   * if the pipeline actually completed (Vercel function keeps running even
   * after the CDN drops the streaming connection).
   */
  const pollForCompletion = async (
    recordId: string,
    lastStatus: PipelineStatus | null
  ): Promise<boolean> => {
    setPipelineStatuses((prev) => ({
      ...prev,
      [recordId]: {
        id: lastStatus?.id || '',
        recordId,
        status: 'running',
        steps: lastStatus?.steps?.map((s) =>
          s.status === 'in_progress'
            ? { ...s, name: s.name, status: 'in_progress' as const, result: 'Tilkobling tapt - sjekker server...' }
            : s
        ) || PIPELINE_STEPS.map((s) => ({ name: s.name, status: 'pending' as const })),
      },
    }));

    const MAX_POLLS = 24;
    const POLL_INTERVAL = 10000;

    for (let attempt = 1; attempt <= MAX_POLLS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));

      try {
        const res = await fetch('/api/neural-beat');
        const data = await res.json();
        const song = data.songs?.find((s: Song) => s.id === recordId);

        if (song?.youtubeUrl) {
          setPipelineStatuses((prev) => ({
            ...prev,
            [recordId]: {
              id: lastStatus?.id || '',
              recordId,
              status: 'completed',
              steps: PIPELINE_STEPS.map((s) => ({
                name: s.name,
                status: 'completed' as const,
              })),
              output: { youtubeUrl: song.youtubeUrl },
            },
          }));
          setProcessingIds((prev) => {
            const next = new Map(prev);
            next.delete(recordId);
            return next;
          });
          setTimeout(fetchSongs, 2000);
          return true;
        }
      } catch {
        // Network error - keep trying
      }

      setPipelineStatuses((prev) => ({
        ...prev,
        [recordId]: {
          ...prev[recordId],
          id: lastStatus?.id || prev[recordId]?.id || '',
          recordId,
          status: 'running',
          steps: prev[recordId]?.steps?.map((s) =>
            s.status === 'in_progress'
              ? { ...s, result: `Tilkobling tapt - sjekker server (${attempt}/${MAX_POLLS})...` }
              : s
          ) || [],
        },
      }));
    }

    setPipelineStatuses((prev) => ({
      ...prev,
      [recordId]: {
        id: lastStatus?.id || '',
        recordId,
        status: 'failed',
        steps: lastStatus?.steps || [],
        error: 'Pipeline-tilkobling tapt. Serveren kan fortsatt prosessere - oppdater siden om noen minutter for a sjekke.',
      },
    }));
    return false;
  };

  const handleProcess = async (recordId: string) => {
    setProcessingIds((prev) => new Map(prev).set(recordId, ''));
    setPipelineStatuses((prev) => {
      const next = { ...prev };
      delete next[recordId];
      return next;
    });

    const controller = new AbortController();
    abortControllers.current.set(recordId, controller);

    try {
      const res = await fetch('/api/neural-beat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({ error: 'Ukjent feil' }));
        setPipelineStatuses((prev) => ({
          ...prev,
          [recordId]: {
            id: '', recordId, status: 'failed', steps: [],
            error: data.error || 'Kunne ikke starte pipeline',
          },
        }));
        setProcessingIds((prev) => {
          const next = new Map(prev);
          next.delete(recordId);
          return next;
        });
        return;
      }

      // Read SSE stream
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let lastStatus: PipelineStatus | null = null;

      const processSSEMessages = (raw: string) => {
        const messages = raw.split('\n\n');
        const remainder = messages.pop() || '';

        for (const msg of messages) {
          const dataLine = msg.split('\n').find((l) => l.startsWith('data: '));
          if (!dataLine) continue;

          try {
            const data: PipelineStatus = JSON.parse(dataLine.slice(6));

            // Skip heartbeat keep-alive messages
            if ((data as any).type === 'heartbeat') continue;

            lastStatus = data;

            setProcessingIds((prev) => new Map(prev).set(recordId, data.id || recordId));
            setPipelineStatuses((prev) => ({ ...prev, [recordId]: data }));

            if (data.status === 'completed' || data.status === 'failed') {
              setProcessingIds((prev) => {
                const next = new Map(prev);
                next.delete(recordId);
                return next;
              });
              if (data.status === 'completed') {
                setTimeout(fetchSongs, 2000);
              }
            }
          } catch {
            // Skip malformed messages
          }
        }

        return remainder;
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        buffer = processSSEMessages(buffer);
      }

      if (buffer.trim()) {
        processSSEMessages(buffer + '\n\n');
      }

      const finalStatus = lastStatus as PipelineStatus | null;
      if (!finalStatus || finalStatus.status === 'running') {
        const recovered = await pollForCompletion(recordId, finalStatus);
        if (!recovered) {
          setProcessingIds((prev) => {
            const next = new Map(prev);
            next.delete(recordId);
            return next;
          });
        }
      } else {
        setProcessingIds((prev) => {
          const next = new Map(prev);
          next.delete(recordId);
          return next;
        });
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return;
      const lastKnown = pipelineStatuses[recordId] || null;
      const recovered = await pollForCompletion(recordId, lastKnown as PipelineStatus | null);
      if (!recovered) {
        setProcessingIds((prev) => {
          const next = new Map(prev);
          next.delete(recordId);
          return next;
        });
      }
    } finally {
      abortControllers.current.delete(recordId);
    }
  };

  const handleProcessAll = async () => {
    const readySongs = songs.filter((s) => getSongStatus(s) === 'ready');
    if (readySongs.length === 0) return;
    setProcessingAll(true);
    for (const song of readySongs) {
      await handleProcess(song.id);
    }
    setProcessingAll(false);
  };

  const handleDelete = async (recordId: string, youtubeUrl: string) => {
    setDeletingIds((prev) => new Set(prev).add(recordId));
    setDeleteConfirm(null);
    try {
      const res = await fetch('/api/neural-beat', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId, youtubeUrl }),
      });
      if (res.ok) {
        setPipelineStatuses((prev) => {
          const next = { ...prev };
          delete next[recordId];
          return next;
        });
        setTimeout(fetchSongs, 1000);
      } else {
        const data = await res.json();
        alert(`Sletting feilet: ${data.error || 'Ukjent feil'}`);
      }
    } catch {
      alert('Nettverksfeil ved sletting av video');
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(recordId);
        return next;
      });
    }
  };

  const getSongStatus = (song: Song): SongStatus => {
    if (processingIds.has(song.id)) return 'processing';
    if (pipelineStatuses[song.id]?.status === 'failed') return 'error';
    if (song.youtubeUrl) return 'done';
    if (!song.audioUrl) return 'no-audio';
    return 'ready';
  };

  const getStepProgress = (recordId: string): { completed: number; total: number; currentStep: string } => {
    const status = pipelineStatuses[recordId];
    if (!status?.steps?.length) return { completed: 0, total: 8, currentStep: 'Starter...' };
    const completed = status.steps.filter((s) => s.status === 'completed').length;
    const current = status.steps.find((s) => s.status === 'in_progress');
    return {
      completed,
      total: status.steps.length || 8,
      currentStep: current?.name || (completed === status.steps.length ? 'Ferdig!' : 'Starter...'),
    };
  };

  const statusIcon = (status: SongStatus) => {
    switch (status) {
      case 'done': return <CheckCircle className="h-4 w-4 text-green-400" />;
      case 'processing': return <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />;
      case 'error': return <XCircle className="h-4 w-4 text-red-400" />;
      case 'no-audio': return <AlertCircle className="h-4 w-4 text-slate-500" />;
      case 'ready': return <PlayCircle className="h-4 w-4 text-pink-400" />;
      default: return <Clock className="h-4 w-4 text-slate-400" />;
    }
  };

  const statusLabel = (status: SongStatus) => {
    switch (status) {
      case 'done': return 'Publisert';
      case 'processing': return 'Prosesserer...';
      case 'error': return 'Feil';
      case 'no-audio': return 'Ingen lyd';
      case 'ready': return 'Klar';
      default: return 'Ukjent';
    }
  };

  const statusBadgeClass = (status: SongStatus) => {
    switch (status) {
      case 'done': return 'bg-green-500/20 text-green-400';
      case 'processing': return 'bg-blue-500/20 text-blue-400';
      case 'error': return 'bg-red-500/20 text-red-400';
      case 'no-audio': return 'bg-slate-500/20 text-slate-500';
      case 'ready': return 'bg-pink-500/20 text-pink-400';
      default: return 'bg-slate-500/20 text-slate-400';
    }
  };

  const readySongs = songs.filter((s) => getSongStatus(s) === 'ready');
  const stats = {
    total: songs.length,
    done: songs.filter((s) => s.youtubeUrl).length,
    processing: processingIds.size,
    ready: readySongs.length,
    errors: Object.values(pipelineStatuses).filter((r) => r.status === 'failed').length,
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500 to-rose-600">
              <Music className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Neural Beat</h1>
              <p className="text-slate-400">AI-drevet musikkproduksjon &bull; Airtable &rarr; YouTube</p>
            </div>
          </div>
          {readySongs.length > 0 && (
            <Button
              onClick={handleProcessAll}
              disabled={processingAll || processingIds.size > 0}
              className="bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500"
            >
              {processingAll ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Prosesserer...</>
              ) : (
                <><Zap className="mr-2 h-4 w-4" /> Prosesser alle ({readySongs.length})</>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* MP3 Upload Section */}
      <Card className="bg-slate-800/50 border-slate-700/50 mb-6">
        <CardContent className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <Upload className="h-5 w-5 text-pink-400" />
            <h3 className="text-sm font-medium text-white">Last opp MP3</h3>
          </div>
          {!mp3File ? (
            <div
              className="border-2 border-dashed border-slate-600 rounded-lg p-6 text-center cursor-pointer hover:border-pink-500/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Music className="h-8 w-8 mx-auto mb-2 text-slate-500" />
              <p className="text-sm text-slate-400">Klikk for a velge en MP3-fil</p>
              <p className="text-xs text-slate-500 mt-1">Filen lastes opp som ny sang til Airtable</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".mp3,audio/mpeg"
                onChange={handleMp3Select}
                className="hidden"
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-700/50">
                <Disc3 className="h-5 w-5 text-pink-400" />
                <span className="text-sm text-white flex-1 truncate">{mp3File.name}</span>
                <span className="text-xs text-slate-400">{(mp3File.size / (1024 * 1024)).toFixed(1)} MB</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setMp3File(null);
                    setMp3Title('');
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="h-7 w-7 p-0 text-slate-500 hover:text-red-400"
                >
                  <XCircle className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1.5 block">Tittel</label>
                  <input
                    type="text"
                    value={mp3Title}
                    onChange={(e) => setMp3Title(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100 focus:border-pink-500 focus:outline-none"
                    placeholder="Sangtittel"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1.5 block">Artist</label>
                  <input
                    type="text"
                    value={mp3Artist}
                    onChange={(e) => setMp3Artist(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100 focus:border-pink-500 focus:outline-none"
                    placeholder="Neural Beat"
                  />
                </div>
              </div>
              <Button
                onClick={handleMp3Upload}
                disabled={isUploading || !mp3Title}
                className="w-full bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500"
              >
                {isUploading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Laster opp...</>
                ) : (
                  <><Upload className="mr-2 h-4 w-4" /> Last opp sang</>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 mb-6 md:grid-cols-5">
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardContent className="p-4 text-center">
            <Disc3 className="h-5 w-5 mx-auto mb-1 text-pink-400" />
            <div className="text-2xl font-bold text-white">{stats.total}</div>
            <div className="text-xs text-slate-400">Totalt spor</div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardContent className="p-4 text-center">
            <Youtube className="h-5 w-5 mx-auto mb-1 text-green-400" />
            <div className="text-2xl font-bold text-green-400">{stats.done}</div>
            <div className="text-xs text-slate-400">Publiserte</div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardContent className="p-4 text-center">
            <Loader2 className={`h-5 w-5 mx-auto mb-1 text-blue-400 ${stats.processing > 0 ? 'animate-spin' : ''}`} />
            <div className="text-2xl font-bold text-blue-400">{stats.processing}</div>
            <div className="text-xs text-slate-400">Prosesserer</div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardContent className="p-4 text-center">
            <PlayCircle className="h-5 w-5 mx-auto mb-1 text-pink-400" />
            <div className="text-2xl font-bold text-pink-400">{stats.ready}</div>
            <div className="text-xs text-slate-400">Klar</div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardContent className="p-4 text-center">
            <XCircle className="h-5 w-5 mx-auto mb-1 text-red-400" />
            <div className="text-2xl font-bold text-red-400">{stats.errors}</div>
            <div className="text-xs text-slate-400">Feil</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="pipeline" className="space-y-6">
        <TabsList>
          <TabsTrigger value="pipeline">
            <Waves className="mr-2 h-4 w-4" /> Pipeline
          </TabsTrigger>
          <TabsTrigger value="published">
            <Youtube className="mr-2 h-4 w-4" /> Publiserte
          </TabsTrigger>
          <TabsTrigger value="youtube-stats" onClick={fetchYouTubeStats}>
            <BarChart3 className="mr-2 h-4 w-4" /> YouTube Statistikk
          </TabsTrigger>
          <TabsTrigger value="how-it-works">
            <Radio className="mr-2 h-4 w-4" /> Slik fungerer det
          </TabsTrigger>
        </TabsList>

        {/* Pipeline Tab */}
        <TabsContent value="pipeline" className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-pink-500" />
            </div>
          ) : songs.length === 0 ? (
            <Card className="bg-slate-800/50 border-slate-700/50">
              <CardContent className="p-12 text-center">
                <Music className="h-16 w-16 mx-auto mb-4 text-pink-500/30" />
                <h3 className="text-lg font-semibold text-white mb-2">Ingen spor funnet</h3>
                <p className="text-slate-400 text-sm">
                  Legg til sanger i Airtable-tabellen &quot;Make.com Songs&quot; for a komme i gang.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {songs.map((song) => {
                const status = getSongStatus(song);
                const pipelineStatus = pipelineStatuses[song.id];
                const stepProgress = getStepProgress(song.id);
                return (
                  <Card key={song.id} className="bg-slate-800/50 border-slate-700/50 hover:bg-slate-800/80 transition-all">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-pink-500/20 to-rose-600/20 border border-pink-500/20">
                            <Music className="h-6 w-6 text-pink-400" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-white">{song.title}</h3>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-xs text-slate-400">{song.artist}</span>
                              {song.audioUrl && (
                                <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-300">
                                  Lyd &#10003;
                                </Badge>
                              )}
                              {song.genre && (
                                <Badge variant="outline" className="text-[10px] border-pink-500/30 text-pink-300">
                                  {song.genre}
                                </Badge>
                              )}
                              {song.mood && (
                                <Badge variant="outline" className="text-[10px] border-slate-600 text-slate-400">
                                  {song.mood}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          {status === 'processing' && (
                            <div className="w-44">
                              <Progress value={(stepProgress.completed / stepProgress.total) * 100} className="h-1.5" />
                              <p className="text-[10px] text-blue-400 mt-1 text-center truncate">
                                Steg {stepProgress.completed + 1}/{stepProgress.total}: {stepProgress.currentStep}
                              </p>
                            </div>
                          )}

                          <div className="flex items-center gap-2">
                            {statusIcon(status)}
                            <Badge className={statusBadgeClass(status)}>
                              {statusLabel(status)}
                            </Badge>
                          </div>

                          {status === 'ready' && (
                            <Button
                              size="sm"
                              onClick={() => handleProcess(song.id)}
                              disabled={processingIds.size > 0}
                              className="bg-pink-600 hover:bg-pink-700"
                            >
                              <Zap className="mr-1 h-3 w-3" /> Prosesser
                            </Button>
                          )}

                          {status === 'error' && (
                            <Button
                              size="sm"
                              onClick={() => handleProcess(song.id)}
                              disabled={processingIds.size > 0}
                              variant="outline"
                              className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                            >
                              <Zap className="mr-1 h-3 w-3" /> Prove igjen
                            </Button>
                          )}

                          {song.youtubeUrl && (
                            <>
                              <a
                                href={song.youtubeUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-red-400 hover:text-red-300"
                              >
                                <Youtube className="h-4 w-4" />
                              </a>
                              {deleteConfirm === song.id ? (
                                <div className="flex items-center gap-1">
                                  <Button
                                    size="sm"
                                    onClick={() => handleDelete(song.id, song.youtubeUrl!)}
                                    disabled={deletingIds.has(song.id)}
                                    className="bg-red-600 hover:bg-red-700 h-6 px-2 text-[10px]"
                                  >
                                    {deletingIds.has(song.id) ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      'Bekreft'
                                    )}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setDeleteConfirm(null)}
                                    className="h-6 px-2 text-[10px] text-slate-400"
                                  >
                                    Avbryt
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setDeleteConfirm(song.id)}
                                  className="h-7 w-7 p-0 text-slate-500 hover:text-red-400 hover:bg-red-500/10"
                                  title="Slett fra YouTube"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      {/* Live pipeline step progress */}
                      {status === 'processing' && pipelineStatus?.steps && pipelineStatus.steps.length > 0 && (
                        <div className="mt-3 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
                          <div className="grid grid-cols-4 gap-1.5 md:grid-cols-8">
                            {pipelineStatus.steps.map((step, i) => (
                              <div key={i} className="flex flex-col items-center gap-1">
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                  step.status === 'completed' ? 'bg-green-500 text-white' :
                                  step.status === 'in_progress' ? 'bg-blue-500 text-white animate-pulse' :
                                  step.status === 'failed' ? 'bg-red-500 text-white' :
                                  'bg-slate-700 text-slate-400'
                                }`}>
                                  {step.status === 'completed' ? '\u2713' :
                                   step.status === 'in_progress' ? '\u25CF' :
                                   step.status === 'failed' ? '\u2717' :
                                   i + 1}
                                </div>
                                <span className="text-[8px] text-slate-500 text-center leading-tight">
                                  {PIPELINE_STEPS[i]?.name || step.name}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Completed/Failed result details */}
                      {pipelineStatus && pipelineStatus.status !== 'running' && (
                        <div className={`mt-3 p-3 rounded-lg border ${
                          pipelineStatus.status === 'completed'
                            ? 'bg-green-500/5 border-green-500/20'
                            : 'bg-red-500/5 border-red-500/20'
                        }`}>
                          {pipelineStatus.status === 'completed' ? (
                            <div className="flex items-center gap-2 text-sm text-green-400">
                              <CheckCircle className="h-4 w-4" />
                              Pipeline fullfort! Video lastet opp til YouTube.
                              {pipelineStatus.output?.youtubeUrl && (
                                <a
                                  href={pipelineStatus.output.youtubeUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline hover:text-green-300 ml-2"
                                >
                                  Se &rarr;
                                </a>
                              )}
                            </div>
                          ) : (
                            <div>
                              <div className="flex items-center gap-2 text-sm text-red-400">
                                <XCircle className="h-4 w-4" />
                                {pipelineStatus.error}
                              </div>
                              {pipelineStatus.steps && pipelineStatus.steps.length > 0 && (
                                <div className="mt-2 space-y-1">
                                  {pipelineStatus.steps.map((step, i) => (
                                    <div key={i} className="flex items-center gap-2 text-xs">
                                      {step.status === 'completed' ? (
                                        <CheckCircle className="h-3 w-3 text-green-500" />
                                      ) : step.status === 'failed' ? (
                                        <XCircle className="h-3 w-3 text-red-500" />
                                      ) : (
                                        <Clock className="h-3 w-3 text-slate-500" />
                                      )}
                                      <span className={step.status === 'failed' ? 'text-red-300' : 'text-slate-400'}>
                                        {step.name}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Published Tab */}
        <TabsContent value="published" className="space-y-4">
          {songs.filter((s) => s.youtubeUrl).length === 0 ? (
            <Card className="bg-slate-800/50 border-slate-700/50">
              <CardContent className="p-12 text-center">
                <Youtube className="h-16 w-16 mx-auto mb-4 text-red-500/20" />
                <h3 className="text-lg font-semibold text-white mb-2">Ingen publiserte videoer enna</h3>
                <p className="text-slate-400 text-sm">
                  Prosesser sanger fra Pipeline-fanen for a publisere dem pa YouTube.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {songs
                .filter((s) => s.youtubeUrl)
                .map((song) => (
                  <Card key={song.id} className="bg-slate-800/50 border-slate-700/50 hover:bg-slate-800/80 transition-all overflow-hidden">
                    <div className="aspect-video bg-gradient-to-br from-pink-900/50 to-purple-900/50 flex items-center justify-center relative">
                      <Play className="h-12 w-12 text-white/60" />
                      <div className="absolute bottom-2 left-2 flex items-center gap-1">
                        <Youtube className="h-3 w-3 text-red-400" />
                        <span className="text-[10px] text-red-300">Publisert</span>
                      </div>
                    </div>
                    <CardContent className="p-4">
                      <h3 className="font-semibold text-white text-sm">{song.title}</h3>
                      <p className="text-xs text-slate-400 mt-1">{song.artist}</p>
                      <div className="flex items-center gap-2 mt-2">
                        {song.genre && <Badge className="bg-pink-500/20 text-pink-300 text-[10px]">{song.genre}</Badge>}
                        {song.mood && <Badge className="bg-slate-600/30 text-slate-300 text-[10px]">{song.mood}</Badge>}
                      </div>
                      <div className="flex items-center justify-between mt-3">
                        {song.youtubeUrl && (
                          <a
                            href={song.youtubeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-red-400 hover:text-red-300 underline"
                          >
                            Se pa YouTube &rarr;
                          </a>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            if (deleteConfirm === song.id) {
                              handleDelete(song.id, song.youtubeUrl!);
                            } else {
                              setDeleteConfirm(song.id);
                            }
                          }}
                          disabled={deletingIds.has(song.id)}
                          className={`h-7 px-2 text-[10px] ${
                            deleteConfirm === song.id
                              ? 'bg-red-600 hover:bg-red-700 text-white'
                              : 'text-slate-500 hover:text-red-400 hover:bg-red-500/10'
                          }`}
                        >
                          {deletingIds.has(song.id) ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : deleteConfirm === song.id ? (
                            'Bekreft sletting'
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
            </div>
          )}
        </TabsContent>

        {/* YouTube Statistikk Tab */}
        <TabsContent value="youtube-stats" className="space-y-4">
          {ytLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-red-500" />
            </div>
          ) : (
            <>
              {/* Channel Stats */}
              {ytChannel && (
                <Card className="bg-slate-800/50 border-slate-700/50">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <Youtube className="h-5 w-5 text-red-400" />
                      {ytChannel.title}
                    </CardTitle>
                    <CardDescription>Kanalstatistikk</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-white">{ytChannel.subscriberCount.toLocaleString('nb-NO')}</div>
                        <div className="text-xs text-slate-400">Abonnenter</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-white">{ytChannel.viewCount.toLocaleString('nb-NO')}</div>
                        <div className="text-xs text-slate-400">Totale visninger</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-white">{ytChannel.videoCount.toLocaleString('nb-NO')}</div>
                        <div className="text-xs text-slate-400">Videoer</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {!ytChannel && !ytLoading && (
                <Card className="bg-slate-800/50 border-slate-700/50">
                  <CardContent className="p-12 text-center">
                    <Youtube className="h-16 w-16 mx-auto mb-4 text-red-500/20" />
                    <h3 className="text-lg font-semibold text-white mb-2">YouTube ikke konfigurert</h3>
                    <p className="text-slate-400 text-sm">
                      Konfigurer YouTube API-tilkobling for a se kanalstatistikk.
                    </p>
                    <Button onClick={fetchYouTubeStats} variant="outline" className="mt-4">
                      <Loader2 className="mr-2 h-4 w-4" /> Last inn statistikk
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Per-video analytics */}
              {ytVideos.length > 0 && (
                <Card className="bg-slate-800/50 border-slate-700/50">
                  <CardHeader>
                    <CardTitle className="text-white text-sm">Videoanalyse</CardTitle>
                    <CardDescription>Statistikk per video</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {ytVideos.map((video) => (
                        <div key={video.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-700/30 hover:bg-slate-700/50 transition-colors">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            {video.thumbnailUrl ? (
                              <img src={video.thumbnailUrl} alt="" className="h-10 w-16 rounded object-cover shrink-0" />
                            ) : (
                              <div className="h-10 w-16 rounded bg-slate-700 flex items-center justify-center shrink-0">
                                <Play className="h-4 w-4 text-slate-500" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <h4 className="text-sm font-medium text-white truncate">{video.title}</h4>
                              <p className="text-[10px] text-slate-500">
                                {new Date(video.publishedAt).toLocaleDateString('nb-NO')}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-slate-400 shrink-0 ml-4">
                            <div className="flex items-center gap-1">
                              <Eye className="h-3 w-3" />
                              <span>{video.viewCount.toLocaleString('nb-NO')}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <ThumbsUp className="h-3 w-3" />
                              <span>{video.likeCount.toLocaleString('nb-NO')}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <MessageSquare className="h-3 w-3" />
                              <span>{video.commentCount.toLocaleString('nb-NO')}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* Slik fungerer det Tab */}
        <TabsContent value="how-it-works">
          <Card className="bg-slate-800/50 border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-white">Neural Beat Pipeline &mdash; 8 steg</CardTitle>
              <CardDescription>Helautomatisert arbeidsflyt fra Airtable til YouTube</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {PIPELINE_STEPS.map((step, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 to-rose-600 text-white text-sm font-bold shrink-0">
                      {i + 1}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-white">{step.name}</p>
                      <p className="text-xs text-slate-400">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 p-4 rounded-lg bg-pink-500/10 border border-pink-500/20">
                <p className="text-sm text-pink-200">
                  <strong>Slik bruker du det:</strong> Legg til sanger med lydfiler i Airtable-tabellen &quot;Make.com Songs&quot;.
                  Klikk deretter <strong>Prosesser</strong> pa et spor &mdash; eller <strong>Prosesser alle</strong> for a kjore hele pipelinen
                  pa alle sanger. AI-en vil analysere, lage kunstverk, rendre en video og laste opp til YouTube automatisk.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
