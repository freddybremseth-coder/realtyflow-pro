"use client";

import { useState, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Target, Calendar, BarChart3, Sparkles, Youtube,
  Camera, Globe, Link, Send, Plus, Image, Video, FileText,
  TrendingUp, Zap, Bot, Layout, Eye, ThumbsUp, MessageSquare,
  Share2, Clock, CheckCircle, Loader2, Upload, Music, PieChart,
  Palette, ChevronDown, ChevronRight, Play, Pause, X, Inbox, Trash2, Edit3,
} from "lucide-react";
import { BRANDS } from "@/lib/constants";
import { createClient } from "@supabase/supabase-js";

// --- Types ---
interface PublishProgress {
  platform: string;
  status: "pending" | "uploading" | "processing" | "done" | "error";
  message: string;
  progress: number;
}

interface CampaignItem {
  id: string;
  name: string;
  brand: string;
  brandColor: string;
  platforms: string[];
  status: "aktiv" | "planlagt" | "fullfort" | "pauset";
  startDate: string;
  endDate: string;
  posts: number;
  reach: number;
  engagement: number;
}

interface CalendarEvent {
  id: string;
  title: string;
  brand: string;
  brandColor: string;
  platform: string;
  date: string;
  time: string;
  status: "planlagt" | "publisert" | "utkast";
}

interface StrategyMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface DraftItem {
  id: string;
  brand_id: string;
  content_type: string;
  title: string;
  description: string;
  tags: string[];
  ai_generated: boolean;
  ai_image_url: string | null;
  status: string;
  created_at: string;
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// --- Constants ---
const CONTENT_TYPES = [
  { id: "video", name: "Video", icon: Video },
  { id: "slideshow", name: "Bildevisning", icon: Layout },
  { id: "post", name: "Post", icon: FileText },
  { id: "reel", name: "Reel", icon: Play },
  { id: "story", name: "Story", icon: Clock },
  { id: "article", name: "Artikkel", icon: FileText },
];

const PLATFORMS = [
  { id: "youtube", name: "YouTube", icon: Youtube, color: "text-red-400", bg: "bg-red-500/20" },
  { id: "instagram", name: "Instagram", icon: Camera, color: "text-pink-400", bg: "bg-pink-500/20" },
  { id: "facebook", name: "Facebook", icon: Globe, color: "text-blue-400", bg: "bg-blue-500/20" },
  { id: "linkedin", name: "LinkedIn", icon: Link, color: "text-sky-400", bg: "bg-sky-500/20" },
  { id: "tiktok", name: "TikTok", icon: Music, color: "text-emerald-400", bg: "bg-emerald-500/20" },
  { id: "pinterest", name: "Pinterest", icon: Target, color: "text-rose-400", bg: "bg-rose-500/20" },
];

const IMAGE_STYLES = [
  "Fotorealistisk", "Illustrasjon", "Minimalistisk", "Luksus",
  "Moderne arkitektur", "Natur og landskap", "Infografikk", "Abstrakt",
];

// --- Mock Data ---
const MOCK_CAMPAIGNS: CampaignItem[] = [
  {
    id: "1", name: "Varkampanje Costa Blanca", brand: "Soleada.no", brandColor: "#06b6d4",
    platforms: ["youtube", "instagram", "facebook"], status: "aktiv",
    startDate: "2026-03-01", endDate: "2026-04-30", posts: 24, reach: 45200, engagement: 3.8,
  },
  {
    id: "2", name: "ChatGenius Lansering v3", brand: "ChatGenius.pro", brandColor: "#8b5cf6",
    platforms: ["linkedin", "youtube", "tiktok"], status: "planlagt",
    startDate: "2026-04-01", endDate: "2026-04-15", posts: 12, reach: 0, engagement: 0,
  },
  {
    id: "3", name: "Neural Beat Album Release", brand: "Neural Beat", brandColor: "#ec4899",
    platforms: ["youtube", "instagram", "tiktok"], status: "aktiv",
    startDate: "2026-03-10", endDate: "2026-03-31", posts: 18, reach: 32100, engagement: 5.2,
  },
  {
    id: "4", name: "Olivenolje Sesong", brand: "Dona Anna", brandColor: "#f59e0b",
    platforms: ["instagram", "facebook", "pinterest"], status: "fullfort",
    startDate: "2026-01-15", endDate: "2026-02-28", posts: 30, reach: 18900, engagement: 4.1,
  },
];

const MOCK_CALENDAR: CalendarEvent[] = [
  { id: "1", title: "Villa Costa Blanca Tour", brand: "Soleada.no", brandColor: "#06b6d4", platform: "youtube", date: "2026-03-22", time: "10:00", status: "planlagt" },
  { id: "2", title: "Ny eiendom - Pinosos", brand: "Pinosos Ecolife", brandColor: "#84cc16", platform: "instagram", date: "2026-03-22", time: "14:00", status: "planlagt" },
  { id: "3", title: "AI Chatbot Tips", brand: "ChatGenius.pro", brandColor: "#8b5cf6", platform: "linkedin", date: "2026-03-23", time: "09:00", status: "utkast" },
  { id: "4", title: "Sunset Beat - Musikkvideo", brand: "Neural Beat", brandColor: "#ec4899", platform: "youtube", date: "2026-03-23", time: "18:00", status: "planlagt" },
  { id: "5", title: "Behind the scenes oliven", brand: "Dona Anna", brandColor: "#f59e0b", platform: "instagram", date: "2026-03-24", time: "12:00", status: "planlagt" },
  { id: "6", title: "Drommehus i Spania", brand: "Soleada.no", brandColor: "#06b6d4", platform: "facebook", date: "2026-03-24", time: "16:00", status: "planlagt" },
  { id: "7", title: "Eiendomstrender 2026", brand: "Freddy Bremseth", brandColor: "#3b82f6", platform: "linkedin", date: "2026-03-25", time: "08:00", status: "utkast" },
  { id: "8", title: "Eco Home Showcase", brand: "Zen Eco Homes", brandColor: "#10b981", platform: "youtube", date: "2026-03-25", time: "15:00", status: "planlagt" },
  { id: "9", title: "Quick villa reel", brand: "Soleada.no", brandColor: "#06b6d4", platform: "tiktok", date: "2026-03-26", time: "11:00", status: "planlagt" },
  { id: "10", title: "Oppskrift - Oliventapenade", brand: "Dona Anna", brandColor: "#f59e0b", platform: "pinterest", date: "2026-03-26", time: "13:00", status: "planlagt" },
];

const PLATFORM_ASSESSMENT = `PLATTFORM-VURDERING:

\u2705 YouTube - Allerede integrert og fungerer. Sterkeste plattform for
   eiendom (virtuelle visninger), Neural Beat (musikkvideoer) og
   Freddy Bremseth (personal brand).

\u2705 Instagram - Essensielt for eiendom og livsstil. Reels for
   korte eiendommvisninger, Stories for behind-the-scenes,
   Posts for nye listings.

\u2705 Facebook - Viktig for Soleada.no (skandinavisk m\u00e5lgruppe 35-65),
   Facebook Groups for expat-communities, Marketplace for eiendommer.

\u2705 LinkedIn - Kritisk for ChatGenius.pro (B2B SaaS), Freddy Bremseth
   (thought leadership), og nettverksbygging.

\u2705 TikTok - ANBEFALT for vekst. Eksplosiv organisk rekkevidde.
   Perfekt for: eiendomsturer, "Day in the life in Spain",
   Neural Beat clips, matlagingsvideoer (Dona Anna).

\u2705 Pinterest - ANBEFALT for eiendom og livsstil. H\u00f8y kj\u00f8psintensjon.
   Pinosos Ecolife (dr\u00f8mmeboliger), Dona Anna (oppskrifter),
   Soleada.no (dr\u00f8mmehus i Spania). Evigr\u00f8nt innhold.

\u23f3 Twitter/X - Lavere prioritet. Nyttig for ChatGenius.pro (tech),
   men begrenset for eiendom i Spania.`;

// --- Component ---
export default function ContentHubPage() {
  // Publish state
  const [selectedBrand, setSelectedBrand] = useState(BRANDS[0].id);
  const [selectedContentType, setSelectedContentType] = useState("post");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [imageStyle, setImageStyle] = useState(IMAGE_STYLES[0]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishProgress, setPublishProgress] = useState<PublishProgress[]>([]);
  const [aiGenerating, setAiGenerating] = useState<string | null>(null);

  // Campaign state
  const [showCampaignForm, setShowCampaignForm] = useState(false);
  const [campaignName, setCampaignName] = useState("");
  const [campaignGoal, setCampaignGoal] = useState("");
  const [campaignDesc, setCampaignDesc] = useState("");
  const [campaignBrand, setCampaignBrand] = useState(BRANDS[0].id);
  const [campaignPlatforms, setCampaignPlatforms] = useState<string[]>([]);
  const [campaignDuration, setCampaignDuration] = useState("30");

  // Calendar state
  const [calendarView, setCalendarView] = useState<"weekly" | "monthly">("weekly");

  // Strategy state
  const [strategyInput, setStrategyInput] = useState("");
  const [strategyMessages, setStrategyMessages] = useState<StrategyMessage[]>([
    {
      id: "1",
      role: "assistant",
      content: "Hei! Jeg er Victoria, din CEO AI-agent. Jeg kan hjelpe deg med vekststrategi, innholdsplanlegging og ytelsesanalyse for alle dine merkevarer. Hva vil du jobbe med i dag?",
      timestamp: new Date().toISOString(),
    },
  ]);
  const [strategyLoading, setStrategyLoading] = useState(false);

  // Drafts state
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [editingDraft, setEditingDraft] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");

  // Publish modal state
  const [publishDraft, setPublishDraft] = useState<DraftItem | null>(null);
  const [publishPlatforms, setPublishPlatforms] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [publishResults, setPublishResults] = useState<{platform: string; success: boolean; postUrl?: string; error?: string}[]>([]);
  const [connectedAccounts, setConnectedAccounts] = useState<{platform: string; account_name: string; brand: string}[]>([]);

  const fetchDrafts = useCallback(async () => {
    setDraftsLoading(true);
    try {
      const supabase = getSupabase();
      if (!supabase) return;
      const { data } = await supabase
        .from("content_publications")
        .select("id, brand_id, content_type, title, description, tags, ai_generated, ai_image_url, status, created_at")
        .in("status", ["draft", "scheduled"])
        .order("created_at", { ascending: false })
        .limit(50);
      if (data) setDrafts(data);
    } catch (err) {
      console.error("Failed to fetch drafts:", err);
    } finally {
      setDraftsLoading(false);
    }
  }, []);

  const updateDraftStatus = useCallback(async (id: string, status: string) => {
    const supabase = getSupabase();
    if (!supabase) return;
    await supabase.from("content_publications").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const saveDraftEdit = useCallback(async (id: string) => {
    const supabase = getSupabase();
    if (!supabase) return;
    await supabase.from("content_publications").update({
      title: editTitle,
      description: editDescription,
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    setDrafts((prev) => prev.map((d) => d.id === id ? { ...d, title: editTitle, description: editDescription } : d));
    setEditingDraft(null);
  }, [editTitle, editDescription]);

  // Normalize brand IDs for matching (zen-eco, zeneco, zen-eco-homes → zeneco)
  const normalizeBrand = useCallback((b: string) => {
    return b.toLowerCase().replace(/[-_.\s]/g, "").replace(/homes$/, "").replace(/pro$/, "");
  }, []);

  const brandMatches = useCallback((accountBrand: string, draftBrand: string) => {
    return normalizeBrand(accountBrand) === normalizeBrand(draftBrand);
  }, [normalizeBrand]);

  const fetchConnectedAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/social-accounts");
      const data = await res.json();
      if (data.accounts) setConnectedAccounts(data.accounts);
    } catch {}
  }, []);

  const openPublishModal = useCallback((draft: DraftItem) => {
    setPublishDraft(draft);
    setPublishPlatforms([]);
    setPublishResults([]);
    setPublishing(false);
    // Pre-select platforms that have accounts for this brand
    const brandAccounts = connectedAccounts
      .filter((a) => brandMatches(a.brand, draft.brand_id))
      .map((a) => a.platform);
    setPublishPlatforms(Array.from(new Set(brandAccounts)));
  }, [connectedAccounts]);

  const executePublish = useCallback(async () => {
    if (!publishDraft || publishPlatforms.length === 0) return;
    setPublishing(true);
    setPublishResults([]);

    try {
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft_id: publishDraft.id,
          platforms: publishPlatforms,
          content: publishDraft.description || "",
          title: publishDraft.title || "",
          brand_id: publishDraft.brand_id,
          image_url: publishDraft.ai_image_url || undefined,
        }),
      });
      const data = await res.json();
      setPublishResults(data.results || []);

      if (data.success) {
        // Remove from drafts list
        setDrafts((prev) => prev.filter((d) => d.id !== publishDraft.id));
      }
    } catch (err) {
      setPublishResults([{ platform: "system", success: false, error: "Nettverksfeil" }]);
    } finally {
      setPublishing(false);
    }
  }, [publishDraft, publishPlatforms]);

  useEffect(() => {
    fetchDrafts();
    fetchConnectedAccounts();
  }, [fetchDrafts, fetchConnectedAccounts]);

  // Handlers
  const togglePlatform = useCallback((platformId: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(platformId) ? prev.filter((p) => p !== platformId) : [...prev, platformId]
    );
  }, []);

  const toggleCampaignPlatform = useCallback((platformId: string) => {
    setCampaignPlatforms((prev) =>
      prev.includes(platformId) ? prev.filter((p) => p !== platformId) : [...prev, platformId]
    );
  }, []);

  const handleAiGenerate = useCallback(async (field: string) => {
    setAiGenerating(field);
    const brand = BRANDS.find((b) => b.id === selectedBrand);
    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent: 'marketing',
          tasks: [{
            type: 'create_content',
            parameters: {
              brand: brand?.id || selectedBrand,
              brand_name: brand?.name,
              brand_description: brand?.description,
              target_audience: brand?.target_audience,
              tone: brand?.tone,
              specialties: brand?.specialties,
              field,
              platform: selectedPlatforms[0] || 'instagram',
              existing_title: title,
              existing_description: description,
              instruction: field === 'title'
                ? `Lag en fengende tittel for ${brand?.name} innlegg. Kun tittel, ingen annet.`
                : field === 'description'
                ? `Skriv en engasjerende beskrivelse/caption for ${brand?.name}. Maks 200 ord. Inkluder relevante hashtags.`
                : `Generer 8-12 relevante hashtags for ${brand?.name}. Kun hashtags separert med mellomrom.`,
            }
          }]
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const output = data.results?.[0]?.output || '';
        const text = typeof output === 'string' ? output : JSON.stringify(output);
        if (field === 'title') setTitle(text.replace(/^["']|["']$/g, '').trim());
        else if (field === 'description') setDescription(text.trim());
        else if (field === 'tags') setTags(text.trim());
      } else {
        // Fallback
        if (field === "title") setTitle(`${brand?.name} - Oppdag ${brand?.specialties?.[0] || "nye muligheter"}`);
        else if (field === "description") setDescription(`Utforsk ${brand?.description || "fantastiske muligheter"} med ${brand?.name}.`);
        else if (field === "tags") setTags((brand?.specialties || []).map((s) => `#${s.replace(/\s+/g, "")}`).join(" "));
      }
    } catch {
      const brand = BRANDS.find((b) => b.id === selectedBrand);
      if (field === "title") setTitle(`${brand?.name} - Oppdag ${brand?.specialties?.[0] || "nye muligheter"}`);
      else if (field === "description") setDescription(`Utforsk ${brand?.description || "fantastiske muligheter"} med ${brand?.name}.`);
      else if (field === "tags") setTags((brand?.specialties || []).map((s) => `#${s.replace(/\s+/g, "")}`).join(" "));
    }
    setAiGenerating(null);
  }, [selectedBrand, selectedPlatforms, title, description]);

  const handlePublish = useCallback(async () => {
    if (selectedPlatforms.length === 0) return;
    setIsPublishing(true);
    const progress: PublishProgress[] = selectedPlatforms.map((p) => ({
      platform: p,
      status: "pending",
      message: "Venter...",
      progress: 0,
    }));
    setPublishProgress(progress);

    // Simulate SSE-like progress for each platform
    for (let i = 0; i < selectedPlatforms.length; i++) {
      const platformId = selectedPlatforms[i];
      // Uploading
      setPublishProgress((prev) =>
        prev.map((pp) =>
          pp.platform === platformId
            ? { ...pp, status: "uploading", message: "Laster opp...", progress: 30 }
            : pp
        )
      );
      await new Promise((r) => setTimeout(r, 800));
      // Processing
      setPublishProgress((prev) =>
        prev.map((pp) =>
          pp.platform === platformId
            ? { ...pp, status: "processing", message: "Behandler...", progress: 70 }
            : pp
        )
      );
      await new Promise((r) => setTimeout(r, 1000));
      // Done
      setPublishProgress((prev) =>
        prev.map((pp) =>
          pp.platform === platformId
            ? { ...pp, status: "done", message: "Publisert!", progress: 100 }
            : pp
        )
      );
    }
    await new Promise((r) => setTimeout(r, 500));
    setIsPublishing(false);
  }, [selectedPlatforms]);

  const handleStrategySubmit = useCallback(async (message?: string) => {
    const text = message || strategyInput.trim();
    if (!text) return;
    const userMsg: StrategyMessage = {
      id: Date.now().toString(),
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };
    setStrategyMessages((prev) => [...prev, userMsg]);
    setStrategyInput("");
    setStrategyLoading(true);

    const brand = BRANDS.find((b) => b.id === selectedBrand);
    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent: 'ceo',
          tasks: [{
            type: 'plan_content_calendar',
            parameters: {
              message: text,
              brand: brand?.id,
              brand_name: brand?.name,
              brand_description: brand?.description,
              target_audience: brand?.target_audience,
              tone: brand?.tone,
              specialties: brand?.specialties,
              conversation_history: strategyMessages.slice(-6).map(m => ({
                role: m.role,
                content: m.content,
              })),
            }
          }]
        }),
      });
      let response = '';
      if (res.ok) {
        const data = await res.json();
        const output = data.results?.[0]?.output || data.results?.[0]?.result;
        response = typeof output === 'string' ? output : JSON.stringify(output, null, 2);
      } else {
        response = `Beklager, AI-agenten er ikke tilgjengelig akkurat nå. Sjekk at ANTHROPIC_API_KEY er konfigurert i Vercel.`;
      }
      const assistantMsg: StrategyMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: response,
        timestamp: new Date().toISOString(),
      };
      setStrategyMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setStrategyMessages((prev) => [...prev, {
        id: (Date.now() + 1).toString(),
        role: "assistant" as const,
        content: "Kunne ikke nå AI-agenten. Prøv igjen om litt.",
        timestamp: new Date().toISOString(),
      }]);
    }
    setStrategyLoading(false);
  }, [strategyInput, selectedBrand, strategyMessages]);

  const currentBrand = BRANDS.find((b) => b.id === selectedBrand);

  const statusBadge = (status: string) => {
    switch (status) {
      case "aktiv": return <Badge variant="success">Aktiv</Badge>;
      case "planlagt": return <Badge variant="default">Planlagt</Badge>;
      case "fullfort": return <Badge variant="secondary">Fullfort</Badge>;
      case "pauset": return <Badge variant="warning">Pauset</Badge>;
      case "publisert": return <Badge variant="success">Publisert</Badge>;
      case "utkast": return <Badge variant="outline">Utkast</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getPlatformIcon = (platformId: string) => {
    const p = PLATFORMS.find((pl) => pl.id === platformId);
    if (!p) return null;
    const Icon = p.icon;
    return <Icon size={14} className={p.color} />;
  };

  // Calendar helper - get days for current week
  const getWeekDays = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const start = new Date(today);
    start.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d);
    }
    return days;
  };

  const weekDays = getWeekDays();
  const dayNames = ["Man", "Tir", "Ons", "Tor", "Fre", "Lor", "Son"];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-primary-400 to-primary-600">
              <Target size={24} className="text-white" />
            </div>
            Content Hub
          </h1>
          <p className="text-slate-400 mt-1">
            Sentralt kommandosenter for innhold, publisering og vekst
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-slate-400">Victoria AI aktiv</span>
          </div>
          <Badge variant="default">{BRANDS.length} merkevarer</Badge>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">Total rekkevidde</p>
                <p className="text-2xl font-bold text-white">127.4K</p>
                <p className="text-xs text-emerald-400 flex items-center gap-1 mt-1">
                  <TrendingUp size={12} /> +18% denne maneden
                </p>
              </div>
              <div className="p-3 rounded-lg bg-primary-500/20">
                <Eye size={20} className="text-primary-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">Engasjement</p>
                <p className="text-2xl font-bold text-white">4.2%</p>
                <p className="text-xs text-emerald-400 flex items-center gap-1 mt-1">
                  <TrendingUp size={12} /> +0.8% fra snitt
                </p>
              </div>
              <div className="p-3 rounded-lg bg-pink-500/20">
                <ThumbsUp size={20} className="text-pink-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">Publisert denne uka</p>
                <p className="text-2xl font-bold text-white">12</p>
                <p className="text-xs text-slate-400 mt-1">
                  av 18 planlagt
                </p>
              </div>
              <div className="p-3 rounded-lg bg-emerald-500/20">
                <Send size={20} className="text-emerald-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">Aktive kampanjer</p>
                <p className="text-2xl font-bold text-white">
                  {MOCK_CAMPAIGNS.filter((c) => c.status === "aktiv").length}
                </p>
                <p className="text-xs text-amber-400 mt-1">
                  {MOCK_CAMPAIGNS.filter((c) => c.status === "planlagt").length} planlagt
                </p>
              </div>
              <div className="p-3 rounded-lg bg-amber-500/20">
                <Target size={20} className="text-amber-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="utkast">
        <TabsList className="flex flex-wrap gap-1">
          <TabsTrigger value="utkast" className="flex items-center gap-2">
            <Inbox size={14} /> Utkast {drafts.length > 0 && <Badge variant="secondary" className="ml-1 text-xs">{drafts.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="publiser" className="flex items-center gap-2">
            <Send size={14} /> Publiser
          </TabsTrigger>
          <TabsTrigger value="kampanjer" className="flex items-center gap-2">
            <Target size={14} /> Kampanjer
          </TabsTrigger>
          <TabsTrigger value="kalender" className="flex items-center gap-2">
            <Calendar size={14} /> Innholdskalender
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <BarChart3 size={14} /> Analytics
          </TabsTrigger>
          <TabsTrigger value="strategi" className="flex items-center gap-2">
            <Bot size={14} /> AI Strategi
          </TabsTrigger>
        </TabsList>

        {/* TAB 0: UTKAST (AI-genererte drafts) */}
        <TabsContent value="utkast">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">AI-genererte utkast</h3>
                <p className="text-sm text-zinc-400">Utkast fra Markedsføringskit og AI-agenter. Rediger og publiser.</p>
              </div>
              <Button variant="outline" size="sm" onClick={fetchDrafts} disabled={draftsLoading}>
                {draftsLoading ? <Loader2 size={14} className="animate-spin mr-2" /> : null}
                Oppdater
              </Button>
            </div>

            {draftsLoading && drafts.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={24} className="animate-spin text-zinc-400" />
              </div>
            ) : drafts.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <Inbox size={48} className="text-zinc-600 mb-4" />
                  <h4 className="text-lg font-medium mb-2">Ingen utkast ennå</h4>
                  <p className="text-sm text-zinc-400 max-w-md">
                    Gå til Eiendommer → velg en eiendom → klikk &quot;Generer Markedsføringskit&quot; for å opprette AI-utkast som vises her.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {drafts.map((draft) => {
                  const brand = BRANDS.find((b) => b.id === draft.brand_id);
                  const isEditing = editingDraft === draft.id;
                  return (
                    <Card key={draft.id} className="border-zinc-800">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: brand?.color || "#888" }} />
                              <span className="text-xs text-zinc-400">{brand?.name || draft.brand_id}</span>
                              <Badge variant="outline" className="text-xs">{draft.content_type}</Badge>
                              {draft.ai_generated && (
                                <Badge className="bg-purple-500/20 text-purple-300 text-xs">
                                  <Sparkles size={10} className="mr-1" /> AI
                                </Badge>
                              )}
                              <span className="text-xs text-zinc-500 ml-auto">
                                {new Date(draft.created_at).toLocaleDateString("nb-NO")}
                              </span>
                            </div>

                            {isEditing ? (
                              <div className="space-y-2">
                                <Input
                                  value={editTitle}
                                  onChange={(e) => setEditTitle(e.target.value)}
                                  className="text-sm"
                                  placeholder="Tittel"
                                />
                                <textarea
                                  value={editDescription}
                                  onChange={(e) => setEditDescription(e.target.value)}
                                  className="w-full bg-zinc-900 border border-zinc-700 rounded-md p-2 text-sm min-h-[80px] resize-y"
                                  placeholder="Beskrivelse"
                                />
                                <div className="flex gap-2">
                                  <Button size="sm" onClick={() => saveDraftEdit(draft.id)}>
                                    <CheckCircle size={14} className="mr-1" /> Lagre
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={() => setEditingDraft(null)}>
                                    Avbryt
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <h4 className="font-medium text-sm mb-1 truncate">{draft.title || "Uten tittel"}</h4>
                                {draft.ai_image_url && (
                                  <div className="rounded-lg overflow-hidden mb-2 bg-zinc-800 max-h-48">
                                    <img
                                      src={draft.ai_image_url}
                                      alt={draft.title || "AI-generert bilde"}
                                      className="w-full h-auto object-cover max-h-48"
                                    />
                                  </div>
                                )}
                                <p className="text-xs text-zinc-400 line-clamp-3 whitespace-pre-wrap">
                                  {draft.description || "Ingen beskrivelse"}
                                </p>
                                {draft.tags && draft.tags.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-2">
                                    {draft.tags.slice(0, 5).map((tag) => (
                                      <span key={tag} className="text-xs bg-zinc-800 px-2 py-0.5 rounded">
                                        #{tag}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </>
                            )}
                          </div>

                          {!isEditing && (
                            <div className="flex flex-col gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs"
                                onClick={() => {
                                  setEditingDraft(draft.id);
                                  setEditTitle(draft.title || "");
                                  setEditDescription(draft.description || "");
                                }}
                              >
                                <Edit3 size={12} className="mr-1" /> Rediger
                              </Button>
                              <Button
                                size="sm"
                                className="text-xs bg-green-600 hover:bg-green-700"
                                onClick={() => openPublishModal(draft)}
                              >
                                <Send size={12} className="mr-1" /> Publiser
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-xs text-zinc-500"
                                onClick={() => updateDraftStatus(draft.id, "failed")}
                              >
                                <Trash2 size={12} className="mr-1" /> Forkast
                              </Button>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          {/* Publish Modal */}
          {publishDraft && (
            <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => !publishing && setPublishDraft(null)}>
              <div className="bg-zinc-900 border border-zinc-700 rounded-xl max-w-lg w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Publiser til sosiale medier</h3>
                  {!publishing && (
                    <button onClick={() => setPublishDraft(null)} className="text-zinc-400 hover:text-white">
                      <X size={20} />
                    </button>
                  )}
                </div>

                <div className="bg-zinc-800 rounded-lg p-3">
                  <p className="text-sm font-medium truncate">{publishDraft.title || "Uten tittel"}</p>
                  <p className="text-xs text-zinc-400 line-clamp-2 mt-1">{publishDraft.description?.substring(0, 120)}...</p>
                </div>

                {/* Platform selection */}
                <div>
                  <p className="text-sm font-medium mb-2">Velg plattformer:</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: "facebook", name: "Facebook", icon: Globe, color: "text-blue-400", bg: "bg-blue-500/20" },
                      { id: "instagram", name: "Instagram", icon: Camera, color: "text-pink-400", bg: "bg-pink-500/20" },
                      { id: "linkedin", name: "LinkedIn", icon: Link, color: "text-sky-400", bg: "bg-sky-500/20" },
                    ].map((p) => {
                      const isConnected = connectedAccounts.some(
                        (a) => a.platform === p.id && brandMatches(a.brand, publishDraft.brand_id)
                      );
                      const isSelected = publishPlatforms.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          onClick={() => {
                            if (!isConnected) return;
                            setPublishPlatforms((prev) =>
                              prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id]
                            );
                          }}
                          disabled={!isConnected || publishing}
                          className={`flex flex-col items-center gap-1 p-3 rounded-lg border transition-all ${
                            isSelected
                              ? "border-green-500 bg-green-500/10"
                              : isConnected
                                ? "border-zinc-700 hover:border-zinc-500"
                                : "border-zinc-800 opacity-40 cursor-not-allowed"
                          }`}
                        >
                          <p.icon size={20} className={isSelected ? "text-green-400" : p.color} />
                          <span className="text-xs">{p.name}</span>
                          {!isConnected && (
                            <span className="text-[10px] text-red-400">Ikke koblet</span>
                          )}
                          {isConnected && (
                            <span className="text-[10px] text-green-400">Tilkoblet</span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {connectedAccounts.filter((a) => brandMatches(a.brand, publishDraft.brand_id)).length === 0 && (
                    <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                      <p className="text-xs text-yellow-300">
                        Ingen kontoer koblet til for dette brandet. Gå til{" "}
                        <a href="/settings" className="underline font-medium">Innstillinger → Sosiale Medier</a>{" "}
                        og koble til Facebook/Instagram/LinkedIn via OAuth.
                      </p>
                    </div>
                  )}
                </div>

                {/* Results */}
                {publishResults.length > 0 && (
                  <div className="space-y-2">
                    {publishResults.map((r, i) => (
                      <div
                        key={i}
                        className={`flex items-center gap-2 p-2 rounded-lg text-sm ${
                          r.success ? "bg-green-500/10 text-green-300" : "bg-red-500/10 text-red-300"
                        }`}
                      >
                        {r.success ? <CheckCircle size={16} /> : <X size={16} />}
                        <span className="capitalize font-medium">{r.platform}</span>
                        {r.success ? (
                          r.postUrl ? (
                            <a href={r.postUrl} target="_blank" rel="noopener" className="ml-auto text-xs underline">
                              Se post →
                            </a>
                          ) : (
                            <span className="ml-auto text-xs">Publisert!</span>
                          )
                        ) : (
                          <span className="ml-auto text-xs">{r.error}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  {publishResults.length > 0 ? (
                    <Button className="w-full" onClick={() => setPublishDraft(null)}>
                      Lukk
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => setPublishDraft(null)}
                        disabled={publishing}
                      >
                        Avbryt
                      </Button>
                      <Button
                        className="flex-1 bg-green-600 hover:bg-green-700"
                        onClick={executePublish}
                        disabled={publishing || publishPlatforms.length === 0}
                      >
                        {publishing ? (
                          <><Loader2 size={14} className="animate-spin mr-2" /> Publiserer...</>
                        ) : (
                          <><Send size={14} className="mr-1" /> Publiser til {publishPlatforms.length} plattform{publishPlatforms.length > 1 ? "er" : ""}</>
                        )}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
          </div>
        </TabsContent>

        {/* TAB 1: PUBLISER */}
        <TabsContent value="publiser">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left - Form */}
            <div className="lg:col-span-2 space-y-4">
              {/* Brand + Content Type */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Innholdsoppsett</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-slate-400 mb-1.5 block">Merkevare</label>
                      <div className="relative">
                        <select
                          value={selectedBrand}
                          onChange={(e) => setSelectedBrand(e.target.value)}
                          className="w-full h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100 appearance-none cursor-pointer focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                        >
                          {BRANDS.map((brand) => (
                            <option key={brand.id} value={brand.id}>
                              {brand.name}
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={14} className="absolute right-3 top-3 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 mb-1.5 block">Innholdstype</label>
                      <div className="flex flex-wrap gap-2">
                        {CONTENT_TYPES.map((ct) => {
                          const Icon = ct.icon;
                          return (
                            <button
                              key={ct.id}
                              onClick={() => setSelectedContentType(ct.id)}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                selectedContentType === ct.id
                                  ? "bg-primary-500/20 text-primary-300 border border-primary-500/30"
                                  : "bg-slate-700/50 text-slate-400 border border-slate-600/50 hover:bg-slate-700"
                              }`}
                            >
                              <Icon size={12} />
                              {ct.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Platforms */}
                  <div>
                    <label className="text-xs text-slate-400 mb-1.5 block">Plattformer</label>
                    <div className="flex flex-wrap gap-2">
                      {PLATFORMS.map((p) => {
                        const Icon = p.icon;
                        const isSelected = selectedPlatforms.includes(p.id);
                        return (
                          <button
                            key={p.id}
                            onClick={() => togglePlatform(p.id)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                              isSelected
                                ? `${p.bg} ${p.color} border border-current/30`
                                : "bg-slate-700/50 text-slate-400 border border-slate-600/50 hover:bg-slate-700"
                            }`}
                          >
                            <Icon size={16} />
                            {p.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Media Upload */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Media</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="border-2 border-dashed border-slate-600 rounded-lg p-8 text-center hover:border-primary-500/50 transition-colors cursor-pointer">
                    <Upload size={32} className="mx-auto text-slate-500 mb-3" />
                    <p className="text-sm text-slate-300 mb-1">Dra og slipp filer her</p>
                    <p className="text-xs text-slate-500">Bilder, videoer, eller lydfiler</p>
                    <Button variant="outline" size="sm" className="mt-3">
                      Velg filer
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Title, Description, Tags */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Innhold</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs text-slate-400">Tittel</label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleAiGenerate("title")}
                        disabled={aiGenerating !== null}
                        className="h-6 text-xs"
                      >
                        {aiGenerating === "title" ? (
                          <Loader2 size={12} className="animate-spin mr-1" />
                        ) : (
                          <Sparkles size={12} className="mr-1" />
                        )}
                        AI Generer
                      </Button>
                    </div>
                    <Input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Skriv tittel eller la AI generere..."
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs text-slate-400">Beskrivelse</label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleAiGenerate("description")}
                        disabled={aiGenerating !== null}
                        className="h-6 text-xs"
                      >
                        {aiGenerating === "description" ? (
                          <Loader2 size={12} className="animate-spin mr-1" />
                        ) : (
                          <Sparkles size={12} className="mr-1" />
                        )}
                        AI Generer
                      </Button>
                    </div>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Beskriv innholdet ditt..."
                      rows={4}
                      className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs text-slate-400">Tags / Hashtags</label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleAiGenerate("tags")}
                        disabled={aiGenerating !== null}
                        className="h-6 text-xs"
                      >
                        {aiGenerating === "tags" ? (
                          <Loader2 size={12} className="animate-spin mr-1" />
                        ) : (
                          <Sparkles size={12} className="mr-1" />
                        )}
                        AI Generer
                      </Button>
                    </div>
                    <Input
                      value={tags}
                      onChange={(e) => setTags(e.target.value)}
                      placeholder="#eiendom #spania #bolig ..."
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Image Generation */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Image size={16} className="text-primary-400" />
                    Bildegenerering
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-400 mb-1.5 block">Stil</label>
                    <div className="relative">
                      <select
                        value={imageStyle}
                        onChange={(e) => setImageStyle(e.target.value)}
                        className="w-full h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100 appearance-none cursor-pointer focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      >
                        {IMAGE_STYLES.map((style) => (
                          <option key={style} value={style}>{style}</option>
                        ))}
                      </select>
                      <ChevronDown size={14} className="absolute right-3 top-3 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                  <Button variant="outline" className="w-full">
                    <Palette size={14} className="mr-2" />
                    Generer bilde
                  </Button>
                </CardContent>
              </Card>

              {/* Publish Actions */}
              <div className="flex gap-3">
                <Button
                  onClick={handlePublish}
                  disabled={isPublishing || selectedPlatforms.length === 0}
                  className="flex-1 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700"
                >
                  {isPublishing ? (
                    <Loader2 size={16} className="animate-spin mr-2" />
                  ) : (
                    <Send size={16} className="mr-2" />
                  )}
                  {isPublishing ? "Publiserer..." : "Publiser na"}
                </Button>
                <Button variant="outline" disabled={isPublishing}>
                  <Clock size={16} className="mr-2" />
                  Planlegg
                </Button>
              </div>

              {/* Publish Progress */}
              {publishProgress.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Publiseringsstatus</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {publishProgress.map((pp) => {
                      const platform = PLATFORMS.find((p) => p.id === pp.platform);
                      return (
                        <div key={pp.platform} className="space-y-1.5">
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              {platform && <platform.icon size={14} className={platform.color} />}
                              <span className="text-slate-300">{platform?.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {pp.status === "done" ? (
                                <CheckCircle size={14} className="text-emerald-400" />
                              ) : pp.status === "error" ? (
                                <X size={14} className="text-red-400" />
                              ) : (
                                <Loader2 size={14} className="text-primary-400 animate-spin" />
                              )}
                              <span className={`text-xs ${pp.status === "done" ? "text-emerald-400" : pp.status === "error" ? "text-red-400" : "text-slate-400"}`}>
                                {pp.message}
                              </span>
                            </div>
                          </div>
                          <Progress value={pp.progress} />
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Right - Preview */}
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Eye size={16} />
                    Forhåndsvisning
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedPlatforms.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                      <Layout size={32} className="mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Velg plattformer for forhåndsvisning</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {selectedPlatforms.map((pid) => {
                        const platform = PLATFORMS.find((p) => p.id === pid);
                        if (!platform) return null;
                        const Icon = platform.icon;
                        return (
                          <div key={pid} className="rounded-lg border border-slate-700/50 bg-slate-900/50 p-3 space-y-2">
                            <div className="flex items-center gap-2 pb-2 border-b border-slate-700/30">
                              <Icon size={14} className={platform.color} />
                              <span className="text-xs font-medium text-slate-300">{platform.name}</span>
                            </div>
                            <div className="bg-slate-800/50 rounded-lg h-24 flex items-center justify-center">
                              <Image size={24} className="text-slate-600" />
                            </div>
                            <p className="text-sm font-medium text-slate-200 line-clamp-1">
                              {title || "Tittel vises her..."}
                            </p>
                            <p className="text-xs text-slate-400 line-clamp-2">
                              {description || "Beskrivelse vises her..."}
                            </p>
                            {tags && (
                              <p className="text-xs text-primary-400 line-clamp-1">{tags}</p>
                            )}
                            <div className="flex items-center gap-3 text-slate-500 pt-1">
                              <ThumbsUp size={12} />
                              <MessageSquare size={12} />
                              <Share2 size={12} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Brand Info */}
              {currentBrand && (
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: currentBrand.color }}
                      />
                      <span className="text-sm font-medium text-slate-200">{currentBrand.name}</span>
                    </div>
                    <p className="text-xs text-slate-400 mb-2">{currentBrand.description}</p>
                    <div className="flex flex-wrap gap-1">
                      {currentBrand.specialties?.map((s) => (
                        <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        {/* TAB 2: KAMPANJER */}
        <TabsContent value="kampanjer">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Kampanjer</h2>
              <Button onClick={() => setShowCampaignForm(!showCampaignForm)}>
                <Plus size={16} className="mr-2" />
                Ny kampanje
              </Button>
            </div>

            {/* Campaign Form */}
            {showCampaignForm && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Opprett ny kampanje</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-slate-400 mb-1.5 block">Kampanjenavn</label>
                      <Input
                        value={campaignName}
                        onChange={(e) => setCampaignName(e.target.value)}
                        placeholder="F.eks. Sommerkampanje 2026"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 mb-1.5 block">Merkevare</label>
                      <div className="relative">
                        <select
                          value={campaignBrand}
                          onChange={(e) => setCampaignBrand(e.target.value)}
                          className="w-full h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100 appearance-none cursor-pointer focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                        >
                          {BRANDS.map((brand) => (
                            <option key={brand.id} value={brand.id}>{brand.name}</option>
                          ))}
                        </select>
                        <ChevronDown size={14} className="absolute right-3 top-3 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1.5 block">Mal</label>
                    <Input
                      value={campaignGoal}
                      onChange={(e) => setCampaignGoal(e.target.value)}
                      placeholder="F.eks. Oke merkekjennskap med 30%"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1.5 block">Beskrivelse</label>
                    <textarea
                      value={campaignDesc}
                      onChange={(e) => setCampaignDesc(e.target.value)}
                      placeholder="Beskriv kampanjens formål og strategi..."
                      rows={3}
                      className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1.5 block">Plattformer</label>
                    <div className="flex flex-wrap gap-2">
                      {PLATFORMS.map((p) => {
                        const Icon = p.icon;
                        const isSelected = campaignPlatforms.includes(p.id);
                        return (
                          <button
                            key={p.id}
                            onClick={() => toggleCampaignPlatform(p.id)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                              isSelected
                                ? `${p.bg} ${p.color} border border-current/30`
                                : "bg-slate-700/50 text-slate-400 border border-slate-600/50 hover:bg-slate-700"
                            }`}
                          >
                            <Icon size={16} />
                            {p.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1.5 block">Varighet (dager)</label>
                    <Input
                      type="number"
                      value={campaignDuration}
                      onChange={(e) => setCampaignDuration(e.target.value)}
                      placeholder="30"
                    />
                  </div>
                  <div className="flex gap-3">
                    <Button className="bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700">
                      <Plus size={14} className="mr-2" />
                      Opprett kampanje
                    </Button>
                    <Button variant="outline">
                      <Bot size={14} className="mr-2" />
                      La Victoria (CEO AI) planlegge
                    </Button>
                    <Button variant="ghost" onClick={() => setShowCampaignForm(false)}>
                      Avbryt
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Campaign Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {MOCK_CAMPAIGNS.map((campaign) => (
                <Card key={campaign.id} className="hover:border-slate-600/80 transition-colors cursor-pointer">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-sm font-semibold text-white mb-1">{campaign.name}</h3>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: campaign.brandColor }}
                          />
                          <span className="text-xs text-slate-400">{campaign.brand}</span>
                        </div>
                      </div>
                      {statusBadge(campaign.status)}
                    </div>
                    <div className="flex items-center gap-2 mb-3">
                      {campaign.platforms.map((pid) => (
                        <span key={pid}>{getPlatformIcon(pid)}</span>
                      ))}
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="bg-slate-900/50 rounded-lg p-2">
                        <p className="text-lg font-bold text-white">{campaign.posts}</p>
                        <p className="text-[10px] text-slate-500">Innlegg</p>
                      </div>
                      <div className="bg-slate-900/50 rounded-lg p-2">
                        <p className="text-lg font-bold text-white">
                          {campaign.reach > 0 ? `${(campaign.reach / 1000).toFixed(1)}K` : "-"}
                        </p>
                        <p className="text-[10px] text-slate-500">Rekkevidde</p>
                      </div>
                      <div className="bg-slate-900/50 rounded-lg p-2">
                        <p className="text-lg font-bold text-white">
                          {campaign.engagement > 0 ? `${campaign.engagement}%` : "-"}
                        </p>
                        <p className="text-[10px] text-slate-500">Engasjement</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
                      <span>{campaign.startDate} - {campaign.endDate}</span>
                      <ChevronRight size={14} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* TAB 3: INNHOLDSKALENDER */}
        <TabsContent value="kalender">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Innholdskalender</h2>
              <div className="flex items-center gap-2">
                <Button
                  variant={calendarView === "weekly" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setCalendarView("weekly")}
                >
                  Uke
                </Button>
                <Button
                  variant={calendarView === "monthly" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setCalendarView("monthly")}
                >
                  Maned
                </Button>
              </div>
            </div>

            {calendarView === "weekly" ? (
              <div className="grid grid-cols-7 gap-2">
                {weekDays.map((day, i) => {
                  const dateStr = day.toISOString().split("T")[0];
                  const dayEvents = MOCK_CALENDAR.filter((e) => e.date === dateStr);
                  const isToday = dateStr === new Date().toISOString().split("T")[0];
                  return (
                    <div key={i} className="space-y-2">
                      <div className={`text-center py-2 rounded-lg ${isToday ? "bg-primary-500/20 border border-primary-500/30" : "bg-slate-800/50"}`}>
                        <p className="text-[10px] text-slate-500 uppercase">{dayNames[i]}</p>
                        <p className={`text-sm font-semibold ${isToday ? "text-primary-300" : "text-slate-300"}`}>
                          {day.getDate()}
                        </p>
                      </div>
                      <div className="space-y-1.5 min-h-[120px]">
                        {dayEvents.map((event) => (
                          <div
                            key={event.id}
                            className="p-2 rounded-lg bg-slate-800/80 border border-slate-700/50 cursor-pointer hover:border-slate-600 transition-colors"
                            style={{ borderLeftColor: event.brandColor, borderLeftWidth: 3 }}
                          >
                            <p className="text-[10px] text-slate-500">{event.time}</p>
                            <p className="text-xs text-slate-200 line-clamp-2 leading-tight">{event.title}</p>
                            <div className="flex items-center justify-between mt-1">
                              {getPlatformIcon(event.platform)}
                              {statusBadge(event.status)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <Card>
                <CardContent className="p-6">
                  <div className="text-center py-12">
                    <Calendar size={48} className="mx-auto text-slate-600 mb-3" />
                    <p className="text-slate-400">Manedsvisning</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Viser {MOCK_CALENDAR.length} planlagte innlegg denne maneden
                    </p>
                    <div className="mt-6 grid grid-cols-7 gap-1">
                      {dayNames.map((d) => (
                        <p key={d} className="text-[10px] text-slate-500 text-center py-1">{d}</p>
                      ))}
                      {Array.from({ length: 31 }, (_, i) => {
                        const dayDate = `2026-03-${String(i + 1).padStart(2, "0")}`;
                        const hasEvents = MOCK_CALENDAR.some((e) => e.date === dayDate);
                        const isToday = i + 1 === new Date().getDate();
                        return (
                          <div
                            key={i}
                            className={`relative text-center py-2 rounded text-xs cursor-pointer transition-colors ${
                              isToday
                                ? "bg-primary-500/20 text-primary-300 font-bold"
                                : hasEvents
                                ? "bg-slate-700/50 text-slate-200 hover:bg-slate-700"
                                : "text-slate-500 hover:bg-slate-800"
                            }`}
                          >
                            {i + 1}
                            {hasEvents && (
                              <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary-400" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Upcoming Events List */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Kommende innlegg</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {MOCK_CALENDAR.filter((e) => e.status === "planlagt").slice(0, 5).map((event) => (
                    <div key={event.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-900/50 hover:bg-slate-800/50 transition-colors cursor-pointer">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-1 h-8 rounded-full"
                          style={{ backgroundColor: event.brandColor }}
                        />
                        <div>
                          <p className="text-sm text-slate-200">{event.title}</p>
                          <p className="text-xs text-slate-500">{event.brand} - {event.date} kl. {event.time}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getPlatformIcon(event.platform)}
                        {statusBadge(event.status)}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB 4: ANALYTICS */}
        <TabsContent value="analytics">
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-white">Ytelsesdashboard</h2>

            {/* Overall Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4 text-center">
                  <Eye size={20} className="mx-auto text-primary-400 mb-2" />
                  <p className="text-2xl font-bold text-white">312.8K</p>
                  <p className="text-xs text-slate-400">Total rekkevidde</p>
                  <p className="text-xs text-emerald-400 mt-1">+24% siste 30 dager</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <ThumbsUp size={20} className="mx-auto text-pink-400 mb-2" />
                  <p className="text-2xl font-bold text-white">18.4K</p>
                  <p className="text-xs text-slate-400">Totalt engasjement</p>
                  <p className="text-xs text-emerald-400 mt-1">+15% siste 30 dager</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <Share2 size={20} className="mx-auto text-sky-400 mb-2" />
                  <p className="text-2xl font-bold text-white">2.1K</p>
                  <p className="text-xs text-slate-400">Delinger</p>
                  <p className="text-xs text-emerald-400 mt-1">+31% siste 30 dager</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <TrendingUp size={20} className="mx-auto text-emerald-400 mb-2" />
                  <p className="text-2xl font-bold text-white">87</p>
                  <p className="text-xs text-slate-400">Konverteringer</p>
                  <p className="text-xs text-emerald-400 mt-1">+42% siste 30 dager</p>
                </CardContent>
              </Card>
            </div>

            {/* Per Platform Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ytelse per plattform</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    { platform: "YouTube", icon: Youtube, color: "text-red-400", bg: "bg-red-500", reach: "128.2K", engagement: "4.8%", growth: "+22%", width: 85 },
                    { platform: "Instagram", icon: Camera, color: "text-pink-400", bg: "bg-pink-500", reach: "89.4K", engagement: "5.1%", growth: "+18%", width: 60 },
                    { platform: "Facebook", icon: Globe, color: "text-blue-400", bg: "bg-blue-500", reach: "52.1K", engagement: "3.2%", growth: "+12%", width: 35 },
                    { platform: "LinkedIn", icon: Link, color: "text-sky-400", bg: "bg-sky-500", reach: "28.7K", engagement: "6.3%", growth: "+35%", width: 20 },
                    { platform: "TikTok", icon: Music, color: "text-emerald-400", bg: "bg-emerald-500", reach: "12.1K", engagement: "8.7%", growth: "+156%", width: 10 },
                    { platform: "Pinterest", icon: Target, color: "text-rose-400", bg: "bg-rose-500", reach: "2.3K", engagement: "3.9%", growth: "+45%", width: 3 },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <div key={item.platform} className="flex items-center gap-4">
                        <div className="flex items-center gap-2 w-28">
                          <Icon size={16} className={item.color} />
                          <span className="text-sm text-slate-300">{item.platform}</span>
                        </div>
                        <div className="flex-1">
                          <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
                            <div className={`h-full rounded-full ${item.bg}`} style={{ width: `${item.width}%` }} />
                          </div>
                        </div>
                        <span className="text-sm text-slate-200 w-16 text-right">{item.reach}</span>
                        <span className="text-xs text-slate-400 w-12 text-right">{item.engagement}</span>
                        <span className="text-xs text-emerald-400 w-14 text-right">{item.growth}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Per Brand Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ytelse per merkevare</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {BRANDS.map((brand) => {
                    const mockReach = Math.floor(Math.random() * 50000 + 5000);
                    const mockEng = (Math.random() * 5 + 2).toFixed(1);
                    const mockPosts = Math.floor(Math.random() * 20 + 5);
                    return (
                      <div key={brand.id} className="p-3 rounded-lg bg-slate-900/50 border border-slate-700/30">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: brand.color }} />
                          <span className="text-sm font-medium text-slate-200">{brand.name}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div>
                            <p className="text-sm font-bold text-white">{(mockReach / 1000).toFixed(1)}K</p>
                            <p className="text-[10px] text-slate-500">Rekkevidde</p>
                          </div>
                          <div>
                            <p className="text-sm font-bold text-white">{mockEng}%</p>
                            <p className="text-[10px] text-slate-500">Engasjement</p>
                          </div>
                          <div>
                            <p className="text-sm font-bold text-white">{mockPosts}</p>
                            <p className="text-[10px] text-slate-500">Innlegg</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Top Performing Content */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Topp-innhold</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {[
                    { title: "Villa Tour - Luxury Costa Blanca", brand: "Soleada.no", platform: "youtube", views: "12.3K", engagement: "6.2%" },
                    { title: "AI Chatbot Demo - Kundeservice", brand: "ChatGenius.pro", platform: "linkedin", views: "8.7K", engagement: "7.8%" },
                    { title: "Sunset Beats Vol. 3", brand: "Neural Beat", platform: "youtube", views: "7.2K", engagement: "5.4%" },
                    { title: "Eco Home Showcase - Solar Living", brand: "Zen Eco Homes", platform: "instagram", views: "5.8K", engagement: "4.9%" },
                    { title: "Olivenhosting Behind the Scenes", brand: "Dona Anna", platform: "instagram", views: "4.1K", engagement: "8.1%" },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-slate-900/50 hover:bg-slate-800/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-slate-600 w-6">{i + 1}</span>
                        <div>
                          <p className="text-sm text-slate-200">{item.title}</p>
                          <p className="text-xs text-slate-500">{item.brand}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {getPlatformIcon(item.platform)}
                        <div className="text-right">
                          <p className="text-sm font-medium text-white">{item.views}</p>
                          <p className="text-xs text-emerald-400">{item.engagement} eng.</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Growth Trends Placeholder */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <PieChart size={16} className="text-primary-400" />
                  Veksttrender
                </CardTitle>
                <CardDescription>Siste 6 maneder</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-48 flex items-center justify-center border border-dashed border-slate-700 rounded-lg">
                  <div className="text-center">
                    <BarChart3 size={32} className="mx-auto text-slate-600 mb-2" />
                    <p className="text-sm text-slate-500">Graf-visning kommer snart</p>
                    <p className="text-xs text-slate-600 mt-1">Integrasjon med analytics-data pagar</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB 5: AI STRATEGI */}
        <TabsContent value="strategi">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Chat Interface */}
            <div className="lg:col-span-2">
              <Card className="flex flex-col" style={{ minHeight: 500 }}>
                <CardHeader className="border-b border-slate-700/50">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600">
                      <Bot size={18} className="text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Victoria - CEO AI Agent</CardTitle>
                      <CardDescription>Strategisk AI-radgiver for alle merkevarer</CardDescription>
                    </div>
                    <div className="ml-auto flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-xs text-emerald-400">Online</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto p-4 space-y-4" style={{ maxHeight: 400 }}>
                  {strategyMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg p-3 text-sm ${
                          msg.role === "user"
                            ? "bg-primary-500/20 text-primary-100 border border-primary-500/30"
                            : "bg-slate-800 text-slate-200 border border-slate-700/50"
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                        <p className="text-[10px] text-slate-500 mt-2">
                          {new Date(msg.timestamp).toLocaleTimeString("no-NO", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  ))}
                  {strategyLoading && (
                    <div className="flex justify-start">
                      <div className="bg-slate-800 border border-slate-700/50 rounded-lg p-3 flex items-center gap-2">
                        <Loader2 size={14} className="animate-spin text-primary-400" />
                        <span className="text-sm text-slate-400">Victoria tenker...</span>
                      </div>
                    </div>
                  )}
                </CardContent>
                <div className="p-4 border-t border-slate-700/50">
                  <div className="flex gap-2">
                    <Input
                      value={strategyInput}
                      onChange={(e) => setStrategyInput(e.target.value)}
                      placeholder="Spor Victoria om strategi, ytelse eller innholdsplanlegging..."
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleStrategySubmit();
                        }
                      }}
                    />
                    <Button onClick={() => handleStrategySubmit()} disabled={strategyLoading || !strategyInput.trim()}>
                      <Send size={16} />
                    </Button>
                  </div>
                </div>
              </Card>
            </div>

            {/* Right sidebar - Quick Actions + Platform Assessment */}
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Zap size={16} className="text-amber-400" />
                    Hurtighandlinger
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {[
                    { label: `Lag vekststrategi for ${currentBrand?.name || "merkevare"}`, query: `Lag vekststrategi for ${currentBrand?.name}` },
                    { label: "Analyser ytelse siste 30 dager", query: "Analyser ytelse siste 30 dager" },
                    { label: "Foresla neste ukes innhold", query: "Foresla neste ukes innhold" },
                    { label: "Optimaliser publiseringstidspunkt", query: "Hva er de beste tidspunktene a publisere innhold pa?" },
                    { label: "Konkurrentanalyse", query: "Gjor en konkurrentanalyse for eiendomsmarkedet i Spania" },
                  ].map((action, i) => (
                    <button
                      key={i}
                      onClick={() => handleStrategySubmit(action.query)}
                      disabled={strategyLoading}
                      className="w-full flex items-center gap-2 p-2.5 rounded-lg text-left text-sm text-slate-300 bg-slate-900/50 border border-slate-700/30 hover:bg-slate-800 hover:border-slate-600 transition-colors disabled:opacity-50"
                    >
                      <Sparkles size={12} className="text-primary-400 shrink-0" />
                      {action.label}
                    </button>
                  ))}
                </CardContent>
              </Card>

              {/* Brand Selector for Strategy */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Aktiv merkevare</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    {BRANDS.map((brand) => (
                      <button
                        key={brand.id}
                        onClick={() => setSelectedBrand(brand.id)}
                        className={`w-full flex items-center gap-2 p-2 rounded-lg text-left text-sm transition-colors ${
                          selectedBrand === brand.id
                            ? "bg-slate-700/50 text-white"
                            : "text-slate-400 hover:bg-slate-800 hover:text-slate-300"
                        }`}
                      >
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: brand.color }} />
                        {brand.name}
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Platform Assessment */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Target size={16} className="text-emerald-400" />
                    Plattformvurdering
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="text-xs text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">
                    {PLATFORM_ASSESSMENT}
                  </pre>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
