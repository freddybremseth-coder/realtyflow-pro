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
  TrendingUp, Target, Lightbulb, ListMusic, Flame, Sparkles, ArrowUpRight, Rocket, ChevronDown, ChevronUp,
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
  viewsPerDay?: number;
}

interface AIAnalysis {
  overallScore: number;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  viralStrategy: {
    titleFormulas: string[];
    thumbnailTips: string[];
    uploadSchedule: string;
    contentGaps: string[];
    trendingTopics: string[];
  };
  actionItems: Array<{ priority: string; action: string; expectedImpact: string }>;
  benchmarks: {
    currentGrowthRate: string;
    targetGrowthRate: string;
    estimatedTimeToMilestone: string;
  };
}

interface MixPlaylist {
  title: string;
  emoji: string;
  mood: string;
  description: string;
  targetAudience: string;
  suggestedLength: string;
  viralPotential: string;
  searchKeywords: string[];
  exampleSongs: string[];
}

interface RecommendationAction {
  type: 'update_metadata' | 'create_content' | 'strategy' | 'schedule';
  videoId?: string;
  currentTitle?: string;
  newTitle?: string;
  newDescription?: string;
  newTags?: string[];
  details?: string;
}

interface Recommendation {
  id: string;
  type: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  impact: string;
  effort: 'easy' | 'medium' | 'hard';
  action: RecommendationAction;
  status?: 'pending' | 'executing' | 'done' | 'dismissed' | 'error';
  result?: string;
}

interface ChannelHealth {
  score: number;
  trend: 'up' | 'down' | 'stable';
  summary: string;
}

type SongStatus = 'ready' | 'processing' | 'done' | 'error' | 'no-audio';

const PIPELINE_STEPS = [
  { name: 'Oppdater status', desc: 'Marker som prosesserer' },
  { name: 'Last ned lyd', desc: 'Hent lydfil fra lagring' },
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

  // AI Analytics state
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [mixPlaylists, setMixPlaylists] = useState<MixPlaylist[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsMetrics, setAnalyticsMetrics] = useState<{
    totalViews: number; avgViews: number; engagementRate: number;
  } | null>(null);
  const [fastestGrowing, setFastestGrowing] = useState<YouTubeVideo[]>([]);

  // Smart recommendations state
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [channelHealth, setChannelHealth] = useState<ChannelHealth | null>(null);
  const [quickWins, setQuickWins] = useState<string[]>([]);
  const [weeklyGoals, setWeeklyGoals] = useState<string[]>([]);
  const [recsLoading, setRecsLoading] = useState(false);
  const [recsError, setRecsError] = useState<string | null>(null);

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

  // Fetch AI-powered analytics
  const fetchAIAnalytics = useCallback(() => {
    setAnalyticsLoading(true);
    fetch('/api/neural-beat/analytics')
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        if (data.channel) setYtChannel(data.channel);
        if (data.topVideos) setYtVideos(data.topVideos);
        if (data.analysis) setAiAnalysis(data.analysis);
        if (data.mixes) setMixPlaylists(data.mixes);
        if (data.metrics) setAnalyticsMetrics(data.metrics);
        if (data.fastestGrowing) setFastestGrowing(data.fastestGrowing);
      })
      .catch((err) => console.error('Analytics error:', err))
      .finally(() => setAnalyticsLoading(false));
  }, []);

  // Fetch smart recommendations
  const fetchRecommendations = useCallback(async () => {
    setRecsLoading(true);
    setRecsError(null);
    try {
      const res = await fetch('/api/neural-beat/recommendations');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const recs = (data.recommendations || []).map((r: Recommendation) => ({ ...r, status: 'pending' as const }));
      setRecommendations(recs);
      if (data.channelHealth) setChannelHealth(data.channelHealth);
      if (data.quickWins) setQuickWins(data.quickWins);
      if (data.weeklyGoals) setWeeklyGoals(data.weeklyGoals);
      if (data.channel && !ytChannel) setYtChannel(data.channel);
    } catch (err) {
      setRecsError(err instanceof Error ? err.message : 'Kunne ikke hente anbefalinger');
    }
    setRecsLoading(false);
  }, [ytChannel]);

  // Execute a recommendation
  const executeRecommendation = useCallback(async (recId: string) => {
    const rec = recommendations.find((r) => r.id === recId);
    if (!rec) return;

    setRecommendations((prev) => prev.map((r) => r.id === recId ? { ...r, status: 'executing' as const } : r));

    try {
      const res = await fetch('/api/neural-beat/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: rec.action }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setRecommendations((prev) => prev.map((r) =>
        r.id === recId ? { ...r, status: 'done' as const, result: data.message || 'Utført' } : r
      ));
    } catch (err) {
      setRecommendations((prev) => prev.map((r) =>
        r.id === recId ? { ...r, status: 'error' as const, result: err instanceof Error ? err.message : 'Feil' } : r
      ));
    }
  }, [recommendations]);

  // Dismiss a recommendation
  const dismissRecommendation = useCallback((recId: string) => {
    setRecommendations((prev) => prev.map((r) =>
      r.id === recId ? { ...r, status: 'dismissed' as const } : r
    ));
  }, []);

  // Execute all pending recommendations
  const executeAllRecommendations = useCallback(async () => {
    const pending = recommendations.filter((r) => r.status === 'pending');
    for (const rec of pending) {
      await executeRecommendation(rec.id);
    }
  }, [recommendations, executeRecommendation]);

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

  // Two-step upload: get signed URL from API, then upload directly to Supabase
  // This bypasses both Vercel 4.5MB limit AND Supabase RLS
  const handleMp3Upload = async () => {
    if (!mp3File || !mp3Title) return;
    setIsUploading(true);
    try {
      // Step 1: Get a signed upload URL from our API (small JSON request)
      const signRes = await fetch('/api/neural-beat/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: mp3File.name }),
      });

      if (!signRes.ok) {
        const err = await signRes.json();
        throw new Error(err.error || 'Kunne ikke opprette opplastings-URL');
      }

      const { uploadUrl, token, publicUrl, method: uploadMethod } = await signRes.json();

      // Step 2: Upload MP3 directly to Supabase Storage (large file, no Vercel limit)
      // Signed URLs use PUT with token in URL (no Authorization header needed)
      // Direct URLs use POST with Authorization: Bearer <service_role_key>
      const headers: Record<string, string> = { 'Content-Type': 'audio/mpeg' };
      if (uploadMethod === 'direct') {
        headers['Authorization'] = `Bearer ${token}`;
        headers['x-upsert'] = 'true';
      }

      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers,
        body: mp3File,
      });

      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        throw new Error(`Opplasting feilet: ${errText}`);
      }

      const audioUrl = publicUrl;

      // 2. Register the song in the database
      const res = await fetch('/api/neural-beat', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: mp3Title,
          artist: mp3Artist,
          audioUrl,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        window.alert('Sang lastet opp! Klar for prosessering.');
        setMp3File(null);
        setMp3Title('');
        setMp3Artist('Neural Beat');
        if (fileInputRef.current) fileInputRef.current.value = '';
        setTimeout(fetchSongs, 1500);
      } else {
        // File is uploaded to storage even if DB registration fails
        window.alert('MP3 lastet opp til lagring, men databasefeil: ' + (data.error || 'Ukjent'));
        setTimeout(fetchSongs, 1500);
      }
    } catch (err) {
      window.alert('Feil: ' + (err instanceof Error ? err.message : 'Nettverksfeil ved opplasting'));
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
              <p className="text-slate-400">AI-drevet musikkproduksjon &bull; Supabase &rarr; YouTube</p>
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
              <p className="text-xs text-slate-500 mt-1">Filen lastes opp som ny sang til databasen</p>
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

      <Tabs defaultValue="pipeline" className="space-y-6" onValueChange={(val) => {
        if (val === 'youtube-stats' && !aiAnalysis && !analyticsLoading) fetchAIAnalytics();
        if (val === 'ai-recommendations' && recommendations.length === 0 && !recsLoading) fetchRecommendations();
      }}>
        <TabsList>
          <TabsTrigger value="pipeline">
            <Waves className="mr-2 h-4 w-4" /> Pipeline ({stats.ready + stats.processing + stats.errors})
          </TabsTrigger>
          <TabsTrigger value="published">
            <Youtube className="mr-2 h-4 w-4" /> Publiserte ({stats.done})
          </TabsTrigger>
          <TabsTrigger value="youtube-stats">
            <BarChart3 className="mr-2 h-4 w-4" /> YouTube AI Analytikk
          </TabsTrigger>
          <TabsTrigger value="ai-recommendations">
            <Zap className="mr-2 h-4 w-4" /> AI Anbefalinger
            {recommendations.filter((r) => r.status === 'pending').length > 0 && (
              <Badge variant="destructive" className="ml-1.5 text-[9px] px-1.5 py-0">
                {recommendations.filter((r) => r.status === 'pending').length}
              </Badge>
            )}
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
          ) : songs.filter((s) => !s.youtubeUrl).length === 0 ? (
            <Card className="bg-slate-800/50 border-slate-700/50">
              <CardContent className="p-12 text-center">
                <CheckCircle className="h-16 w-16 mx-auto mb-4 text-green-500/30" />
                <h3 className="text-lg font-semibold text-white mb-2">Alle sanger er publisert!</h3>
                <p className="text-slate-400 text-sm">
                  Last opp nye MP3-filer ovenfor for å legge til nye sanger.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {songs.filter((s) => !s.youtubeUrl).map((song) => {
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

        {/* YouTube AI Analytikk Tab */}
        <TabsContent value="youtube-stats" className="space-y-4">
          {(ytLoading || analyticsLoading) ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-red-500" />
              <p className="text-sm text-slate-400">{analyticsLoading ? 'AI analyserer kanalen din...' : 'Henter data...'}</p>
            </div>
          ) : (
            <>
              {/* Channel Stats + AI Score */}
              {ytChannel && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card className="bg-slate-800/50 border-slate-700/50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-white flex items-center gap-2 text-base">
                        <Youtube className="h-5 w-5 text-red-400" />
                        {ytChannel.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="text-center">
                          <div className="text-xl font-bold text-white">{ytChannel.subscriberCount.toLocaleString('nb-NO')}</div>
                          <div className="text-[10px] text-slate-400">Abonnenter</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xl font-bold text-white">{ytChannel.viewCount.toLocaleString('nb-NO')}</div>
                          <div className="text-[10px] text-slate-400">Totale visninger</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xl font-bold text-white">{ytChannel.videoCount.toLocaleString('nb-NO')}</div>
                          <div className="text-[10px] text-slate-400">Videoer</div>
                        </div>
                      </div>
                      {analyticsMetrics && (
                        <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-slate-700">
                          <div className="text-center">
                            <div className="text-lg font-bold text-cyan-400">{analyticsMetrics.avgViews.toLocaleString('nb-NO')}</div>
                            <div className="text-[10px] text-slate-400">Snitt visninger</div>
                          </div>
                          <div className="text-center">
                            <div className="text-lg font-bold text-emerald-400">{analyticsMetrics.engagementRate}%</div>
                            <div className="text-[10px] text-slate-400">Engasjement</div>
                          </div>
                          <div className="text-center">
                            <div className="text-lg font-bold text-amber-400">{analyticsMetrics.totalViews.toLocaleString('nb-NO')}</div>
                            <div className="text-[10px] text-slate-400">Totalt (videoer)</div>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* AI Score Card */}
                  {aiAnalysis && (
                    <Card className="bg-slate-800/50 border-slate-700/50">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-white flex items-center gap-2 text-base">
                          <Sparkles className="h-5 w-5 text-amber-400" />
                          AI Vurdering
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-4 mb-4">
                          <div className="relative w-20 h-20">
                            <svg className="w-20 h-20 -rotate-90" viewBox="0 0 36 36">
                              <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#334155" strokeWidth="3" />
                              <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none"
                                stroke={aiAnalysis.overallScore >= 70 ? '#10b981' : aiAnalysis.overallScore >= 40 ? '#f59e0b' : '#ef4444'}
                                strokeWidth="3" strokeDasharray={`${aiAnalysis.overallScore}, 100`} strokeLinecap="round" />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="text-xl font-bold text-white">{aiAnalysis.overallScore}</span>
                            </div>
                          </div>
                          <div className="flex-1">
                            <p className="text-sm text-slate-200">{typeof aiAnalysis.summary === 'string' ? aiAnalysis.summary.replace(/[{}\[\]"]/g, '').replace(/,\s*$/gm, '').trim() : 'AI-analyse utilgjengelig'}</p>
                          </div>
                        </div>
                        {aiAnalysis.benchmarks && (
                          <div className="space-y-1 text-xs">
                            <div className="flex justify-between text-slate-400">
                              <span>Nåværende vekst:</span>
                              <span className="text-white">{aiAnalysis.benchmarks.currentGrowthRate}</span>
                            </div>
                            <div className="flex justify-between text-slate-400">
                              <span>Mål for 1M views:</span>
                              <span className="text-cyan-400">{aiAnalysis.benchmarks.targetGrowthRate}</span>
                            </div>
                            <div className="flex justify-between text-slate-400">
                              <span>Neste milepæl:</span>
                              <span className="text-emerald-400">{aiAnalysis.benchmarks.estimatedTimeToMilestone}</span>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}

              {/* Viral Strategy */}
              {aiAnalysis?.viralStrategy && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card className="bg-slate-800/50 border-slate-700/50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-white flex items-center gap-2 text-sm">
                        <Target className="h-4 w-4 text-red-400" />
                        Viral Strategi
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <h4 className="text-xs font-semibold text-slate-300 mb-1">Tittelformler</h4>
                        {aiAnalysis.viralStrategy.titleFormulas.map((f, i) => (
                          <p key={i} className="text-xs text-slate-400 pl-2 border-l-2 border-red-500/30 mb-1">{f}</p>
                        ))}
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold text-slate-300 mb-1">Thumbnail-tips</h4>
                        {aiAnalysis.viralStrategy.thumbnailTips.map((t, i) => (
                          <p key={i} className="text-xs text-slate-400 pl-2 border-l-2 border-amber-500/30 mb-1">{t}</p>
                        ))}
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold text-slate-300 mb-1">Opplastingsplan</h4>
                        <p className="text-xs text-cyan-400">{aiAnalysis.viralStrategy.uploadSchedule}</p>
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold text-slate-300 mb-1">Trending Topics</h4>
                        <div className="flex flex-wrap gap-1">
                          {aiAnalysis.viralStrategy.trendingTopics.map((t, i) => (
                            <Badge key={i} variant="secondary" className="text-[10px]">{t}</Badge>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-slate-800/50 border-slate-700/50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-white flex items-center gap-2 text-sm">
                        <Lightbulb className="h-4 w-4 text-amber-400" />
                        Handlingsplan
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <h4 className="text-xs font-semibold text-emerald-400 mb-1">Styrker</h4>
                        {aiAnalysis.strengths?.map((s, i) => (
                          <p key={i} className="text-xs text-slate-300 flex items-start gap-1.5 mb-1">
                            <CheckCircle className="h-3 w-3 text-emerald-400 mt-0.5 shrink-0" />{s}
                          </p>
                        ))}
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold text-red-400 mb-1">Svakheter</h4>
                        {aiAnalysis.weaknesses?.map((w, i) => (
                          <p key={i} className="text-xs text-slate-300 flex items-start gap-1.5 mb-1">
                            <AlertCircle className="h-3 w-3 text-red-400 mt-0.5 shrink-0" />{w}
                          </p>
                        ))}
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold text-slate-300 mb-1">Prioriterte tiltak</h4>
                        {aiAnalysis.actionItems?.map((item, i) => (
                          <div key={i} className="flex items-start gap-2 mb-2 p-2 rounded bg-slate-700/30">
                            <Badge variant={item.priority === 'high' ? 'destructive' : item.priority === 'medium' ? 'warning' : 'secondary'} className="text-[9px] mt-0.5 shrink-0">
                              {item.priority === 'high' ? 'Høy' : item.priority === 'medium' ? 'Medium' : 'Lav'}
                            </Badge>
                            <div>
                              <p className="text-xs text-white">{item.action}</p>
                              <p className="text-[10px] text-slate-500">{item.expectedImpact}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Fastest Growing Videos */}
              {fastestGrowing.length > 0 && (
                <Card className="bg-slate-800/50 border-slate-700/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-white flex items-center gap-2 text-sm">
                      <TrendingUp className="h-4 w-4 text-emerald-400" />
                      Raskest Voksende Videoer
                    </CardTitle>
                    <CardDescription>Sortert etter visninger per dag</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {fastestGrowing.map((video, i) => (
                        <div key={video.id} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-700/30 hover:bg-slate-700/50 transition-colors">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <span className="text-sm font-bold text-slate-500 w-5">{i + 1}</span>
                            {video.thumbnailUrl ? (
                              <img src={video.thumbnailUrl} alt="" className="h-9 w-14 rounded object-cover shrink-0" />
                            ) : (
                              <div className="h-9 w-14 rounded bg-slate-700 flex items-center justify-center shrink-0">
                                <Play className="h-3 w-3 text-slate-500" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <h4 className="text-xs font-medium text-white truncate">{video.title}</h4>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 text-xs shrink-0 ml-4">
                            <div className="flex items-center gap-1 text-emerald-400">
                              <ArrowUpRight className="h-3 w-3" />
                              <span className="font-semibold">{video.viewsPerDay?.toLocaleString('nb-NO') || '?'}/dag</span>
                            </div>
                            <div className="flex items-center gap-1 text-slate-400">
                              <Eye className="h-3 w-3" />
                              <span>{video.viewCount.toLocaleString('nb-NO')}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Mix Playlists */}
              {mixPlaylists.length > 0 && (
                <Card className="bg-slate-800/50 border-slate-700/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-white flex items-center gap-2 text-sm">
                      <ListMusic className="h-4 w-4 text-purple-400" />
                      AI-foreslåtte Mix Spillelister
                    </CardTitle>
                    <CardDescription>Optimert for viral vekst og YouTube-søk</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {mixPlaylists.map((mix, i) => (
                        <div key={i} className="p-3 rounded-lg bg-slate-700/30 hover:bg-slate-700/50 transition-colors border border-slate-700/50">
                          <div className="flex items-start gap-2 mb-2">
                            <span className="text-xl">{mix.emoji}</span>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-semibold text-white">{mix.title}</h4>
                              <p className="text-[10px] text-slate-400">{mix.targetAudience} · {mix.suggestedLength}</p>
                            </div>
                            <Badge variant={mix.viralPotential === 'high' ? 'destructive' : mix.viralPotential === 'medium' ? 'warning' : 'secondary'} className="text-[9px] shrink-0">
                              <Flame className="h-2.5 w-2.5 mr-0.5" />
                              {mix.viralPotential === 'high' ? 'Høy' : mix.viralPotential === 'medium' ? 'Medium' : 'Lav'}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-slate-300 mb-2">{mix.description}</p>
                          <div className="flex flex-wrap gap-1">
                            {mix.searchKeywords?.slice(0, 4).map((kw, j) => (
                              <Badge key={j} variant="outline" className="text-[9px]">{kw}</Badge>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Top Videos by Views */}
              {ytVideos.length > 0 && !aiAnalysis && (
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
                              <p className="text-[10px] text-slate-500">{new Date(video.publishedAt).toLocaleDateString('nb-NO')}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-slate-400 shrink-0 ml-4">
                            <div className="flex items-center gap-1"><Eye className="h-3 w-3" /><span>{video.viewCount.toLocaleString('nb-NO')}</span></div>
                            <div className="flex items-center gap-1"><ThumbsUp className="h-3 w-3" /><span>{video.likeCount.toLocaleString('nb-NO')}</span></div>
                            <div className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /><span>{video.commentCount.toLocaleString('nb-NO')}</span></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {!ytChannel && !ytLoading && !analyticsLoading && (
                <Card className="bg-slate-800/50 border-slate-700/50">
                  <CardContent className="p-12 text-center">
                    <Youtube className="h-16 w-16 mx-auto mb-4 text-red-500/20" />
                    <h3 className="text-lg font-semibold text-white mb-2">YouTube ikke konfigurert</h3>
                    <p className="text-slate-400 text-sm">
                      Konfigurer YouTube API-tilkobling for AI-drevet kanalanalyse.
                    </p>
                    <Button onClick={fetchAIAnalytics} variant="outline" className="mt-4">
                      <Sparkles className="mr-2 h-4 w-4" /> Start AI-analyse
                    </Button>
                  </CardContent>
                </Card>
              )}

              {ytChannel && !aiAnalysis && !analyticsLoading && (
                <div className="flex justify-center">
                  <Button onClick={fetchAIAnalytics} className="gap-2">
                    <Sparkles className="h-4 w-4" /> Kjør AI-analyse av kanalen
                  </Button>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* AI Anbefalinger Tab */}
        <TabsContent value="ai-recommendations" className="space-y-4">
          {recsLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
              <p className="text-sm text-slate-400">AI analyserer kanalen og lager konkrete anbefalinger...</p>
            </div>
          ) : recsError ? (
            <Card className="bg-red-500/10 border-red-500/20">
              <CardContent className="p-6 text-center">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 text-red-400" />
                <p className="text-sm text-red-300">{recsError}</p>
                <Button onClick={fetchRecommendations} variant="outline" className="mt-4" size="sm">Prøv igjen</Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Channel Health + Quick Wins */}
              {channelHealth && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="bg-slate-800/50 border-slate-700/50">
                    <CardContent className="p-5">
                      <div className="flex items-center gap-4">
                        <div className="relative w-16 h-16">
                          <svg className="w-16 h-16 -rotate-90" viewBox="0 0 36 36">
                            <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#334155" strokeWidth="3" />
                            <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none"
                              stroke={channelHealth.score >= 70 ? '#10b981' : channelHealth.score >= 40 ? '#f59e0b' : '#ef4444'}
                              strokeWidth="3" strokeDasharray={`${channelHealth.score}, 100`} strokeLinecap="round" />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-lg font-bold text-white">{channelHealth.score}</span>
                          </div>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-sm font-semibold text-white">Kanalhelse</h3>
                            <Badge variant={channelHealth.trend === 'up' ? 'success' : channelHealth.trend === 'down' ? 'destructive' : 'secondary'} className="text-[9px]">
                              {channelHealth.trend === 'up' ? 'Vekst' : channelHealth.trend === 'down' ? 'Nedgang' : 'Stabil'}
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-400">{channelHealth.summary}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {quickWins.length > 0 && (
                    <Card className="bg-slate-800/50 border-slate-700/50">
                      <CardContent className="p-5">
                        <h3 className="text-sm font-semibold text-amber-400 flex items-center gap-1.5 mb-3">
                          <Zap className="h-4 w-4" /> Raske gevinster
                        </h3>
                        <div className="space-y-1.5">
                          {quickWins.map((win, i) => (
                            <p key={i} className="text-xs text-slate-300 flex items-start gap-1.5">
                              <Sparkles className="h-3 w-3 text-amber-400 mt-0.5 shrink-0" />{win}
                            </p>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {weeklyGoals.length > 0 && (
                    <Card className="bg-slate-800/50 border-slate-700/50">
                      <CardContent className="p-5">
                        <h3 className="text-sm font-semibold text-cyan-400 flex items-center gap-1.5 mb-3">
                          <Target className="h-4 w-4" /> Ukesmål
                        </h3>
                        <div className="space-y-1.5">
                          {weeklyGoals.map((goal, i) => (
                            <p key={i} className="text-xs text-slate-300 flex items-start gap-1.5">
                              <CheckCircle className="h-3 w-3 text-cyan-400 mt-0.5 shrink-0" />{goal}
                            </p>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}

              {/* Action bar */}
              {recommendations.filter((r) => r.status === 'pending').length > 0 && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/80 border border-slate-700/50">
                  <div className="flex items-center gap-2 text-sm text-slate-300">
                    <Rocket className="h-4 w-4 text-amber-400" />
                    <span className="font-medium">{recommendations.filter((r) => r.status === 'pending').length} anbefalinger venter</span>
                    <span className="text-slate-500">·</span>
                    <span className="text-slate-500">{recommendations.filter((r) => r.status === 'done').length} utført</span>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setRecommendations((prev) => prev.map((r) => r.status === 'pending' ? { ...r, status: 'dismissed' as const } : r))}>
                      Forkast alle
                    </Button>
                    <Button size="sm" onClick={executeAllRecommendations} className="gap-1.5">
                      <Zap className="h-3.5 w-3.5" /> Kjør alle
                    </Button>
                  </div>
                </div>
              )}

              {/* Recommendations list */}
              {recommendations.length > 0 && (
                <div className="space-y-3">
                  {recommendations.map((rec) => (
                    <Card key={rec.id} className={`bg-slate-800/50 border-slate-700/50 transition-all ${
                      rec.status === 'done' ? 'opacity-60 border-emerald-500/30' :
                      rec.status === 'dismissed' ? 'opacity-40' :
                      rec.status === 'error' ? 'border-red-500/30' :
                      rec.status === 'executing' ? 'border-amber-500/30 animate-pulse' : ''
                    }`}>
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          {/* Priority indicator */}
                          <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                            rec.priority === 'critical' ? 'bg-red-500' :
                            rec.priority === 'high' ? 'bg-amber-500' :
                            rec.priority === 'medium' ? 'bg-cyan-500' : 'bg-slate-500'
                          }`} />

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <h4 className="text-sm font-semibold text-white">{rec.title}</h4>
                              <Badge variant={
                                rec.priority === 'critical' ? 'destructive' :
                                rec.priority === 'high' ? 'warning' :
                                rec.priority === 'medium' ? 'default' : 'secondary'
                              } className="text-[9px]">
                                {rec.priority === 'critical' ? 'Kritisk' :
                                 rec.priority === 'high' ? 'Høy' :
                                 rec.priority === 'medium' ? 'Medium' : 'Lav'}
                              </Badge>
                              <Badge variant="outline" className="text-[9px]">
                                {rec.effort === 'easy' ? 'Lett' : rec.effort === 'medium' ? 'Middels' : 'Krevende'}
                              </Badge>
                              <Badge variant="secondary" className="text-[9px]">
                                {rec.type === 'optimize_title' ? 'Tittel' :
                                 rec.type === 'optimize_description' ? 'Beskrivelse' :
                                 rec.type === 'optimize_tags' ? 'Tags' :
                                 rec.type === 'upload_schedule' ? 'Plan' :
                                 rec.type === 'content_strategy' ? 'Strategi' :
                                 rec.type === 'thumbnail' ? 'Thumbnail' :
                                 rec.type === 'engagement' ? 'Engasjement' :
                                 rec.type === 'shorts' ? 'Shorts' :
                                 rec.type === 'playlist_strategy' ? 'Spilleliste' : rec.type}
                              </Badge>
                            </div>

                            <p className="text-xs text-slate-400 mb-2">{rec.description}</p>

                            {/* Show what will change */}
                            {rec.action.type === 'update_metadata' && rec.action.currentTitle && rec.action.newTitle && (
                              <div className="p-2 rounded bg-slate-700/50 mb-2 space-y-1">
                                <div className="flex items-center gap-2 text-xs">
                                  <span className="text-red-400 line-through">{rec.action.currentTitle}</span>
                                </div>
                                <div className="flex items-center gap-2 text-xs">
                                  <ArrowUpRight className="h-3 w-3 text-emerald-400 shrink-0" />
                                  <span className="text-emerald-400 font-medium">{rec.action.newTitle}</span>
                                </div>
                                {rec.action.newTags && rec.action.newTags.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {rec.action.newTags.slice(0, 8).map((tag, i) => (
                                      <Badge key={i} variant="outline" className="text-[8px] px-1">{tag}</Badge>
                                    ))}
                                    {rec.action.newTags.length > 8 && (
                                      <span className="text-[8px] text-slate-500">+{rec.action.newTags.length - 8} mer</span>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}

                            {rec.action.type !== 'update_metadata' && rec.action.details && (
                              <div className="p-2 rounded bg-slate-700/50 mb-2">
                                <p className="text-[11px] text-slate-300">{rec.action.details}</p>
                              </div>
                            )}

                            <div className="flex items-center gap-2">
                              <Lightbulb className="h-3 w-3 text-amber-400 shrink-0" />
                              <p className="text-[11px] text-amber-300">{rec.impact}</p>
                            </div>

                            {/* Result message */}
                            {rec.result && (
                              <div className={`mt-2 p-2 rounded text-xs ${
                                rec.status === 'done' ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' :
                                'bg-red-500/10 text-red-300 border border-red-500/20'
                              }`}>
                                {rec.status === 'done' ? <CheckCircle className="h-3 w-3 inline mr-1" /> : <AlertCircle className="h-3 w-3 inline mr-1" />}
                                {rec.result}
                              </div>
                            )}
                          </div>

                          {/* Action buttons */}
                          <div className="flex gap-1.5 shrink-0">
                            {rec.status === 'pending' && (
                              <>
                                <Button size="sm" onClick={() => executeRecommendation(rec.id)} className="gap-1 text-xs h-8 px-3 bg-emerald-600 hover:bg-emerald-500">
                                  <Zap className="h-3 w-3" /> {rec.action.type === 'update_metadata' ? 'Bruk endringer' : 'Kjør'}
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => dismissRecommendation(rec.id)} className="text-xs h-8 px-2 text-slate-500 hover:text-red-400">
                                  <XCircle className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                            {rec.status === 'executing' && (
                              <Loader2 className="h-5 w-5 animate-spin text-amber-400" />
                            )}
                            {rec.status === 'done' && (
                              <CheckCircle className="h-5 w-5 text-emerald-400" />
                            )}
                            {rec.status === 'error' && (
                              <Button size="sm" variant="ghost" onClick={() => executeRecommendation(rec.id)} className="text-xs h-8 px-2 text-red-400">
                                Prøv igjen
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* No recommendations yet */}
              {recommendations.length === 0 && !recsLoading && (
                <Card className="bg-slate-800/50 border-slate-700/50">
                  <CardContent className="p-12 text-center">
                    <Rocket className="h-16 w-16 mx-auto mb-4 text-amber-500/20" />
                    <h3 className="text-lg font-semibold text-white mb-2">AI Anbefalinger</h3>
                    <p className="text-slate-400 text-sm mb-4">
                      AI analyserer kanalen din og genererer konkrete, kjørbare anbefalinger for å øke vekst og visninger.
                    </p>
                    <Button onClick={fetchRecommendations} className="gap-2">
                      <Sparkles className="h-4 w-4" /> Generer anbefalinger
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Refresh button */}
              {recommendations.length > 0 && (
                <div className="flex justify-center">
                  <Button onClick={fetchRecommendations} variant="outline" size="sm" className="gap-2" disabled={recsLoading}>
                    {recsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Generer nye anbefalinger
                  </Button>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* Slik fungerer det Tab */}
        <TabsContent value="how-it-works">
          <Card className="bg-slate-800/50 border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-white">Neural Beat Pipeline &mdash; 8 steg</CardTitle>
              <CardDescription>Helautomatisert arbeidsflyt fra opplasting til YouTube</CardDescription>
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
                  <strong>Slik bruker du det:</strong> Last opp MP3-filer via opplastingsfeltet ovenfor.
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
