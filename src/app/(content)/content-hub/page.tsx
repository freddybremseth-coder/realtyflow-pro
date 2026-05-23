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
  Palette, ChevronDown, ChevronRight, Play, Pause, X, Inbox, Trash2, Edit3, RefreshCw,
} from "lucide-react";
import { BRANDS } from "@/lib/constants";
import { prepareImageForUpload } from "@/lib/client/image-files";
import { createClient } from "@supabase/supabase-js";
import ContentCalendar from "@/components/ContentCalendar"

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
  thumbnail_url?: string | null;
  status: string;
  created_at: string;
  scheduled_at?: string;
  scheduled_platforms?: string[];
  ai_timing_reasoning?: string;
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
  { id: "newsletter", name: "Nyhetsbrev", icon: Inbox },
  { id: "document", name: "Dokument", icon: FileText },
  { id: "proposal", name: "Salgsbrev/tilbud", icon: Send },
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

// Campaigns and calendar are now loaded from database (no mock data)

const PLATFORM_ASSESSMENT = `PLATTFORM-VURDERING:

✓ YouTube - Allerede integrert og fungerer. Sterkeste plattform for
   eiendom (virtuelle visninger), Neural Beat (musikkvideoer) og
   Freddy Bremseth (personal brand).

✓ Instagram - Essensielt for eiendom og livsstil. Reels for
   korte eiendommvisninger, Stories for behind-the-scenes,
   Posts for nye listings.

✓ Facebook - Viktig for Soleada.no (skandinavisk målgruppe 35-65),
   Facebook Groups for expat-communities, Marketplace for eiendommer.

✓ LinkedIn - Kritisk for ChatGenius.pro (B2B SaaS), Freddy Bremseth
   (thought leadership), og nettverksbygging.

✓ TikTok - ANBEFALT for vekst. Eksplosiv organisk rekkevidde.
   Perfekt for: eiendomsturer, "Day in the life in Spain",
   Neural Beat clips, matlagingsvideoer (Dona Anna).

✓ Pinterest - ANBEFALT for eiendom og livsstil. Høy kjøpsintensjon.
   Pinoso Ecolife (drømmeboliger), Dona Anna (oppskrifter),
   Soleada.no (drømmehus i Spania). Eviggrønt innhold.

⏳ Twitter/X - Lavere prioritet. Nyttig for ChatGenius.pro (tech),
   men begrenset for eiendom i Spania.`;

function createFallbackContent(brandName: string, brandDescription: string, contentType: string) {
  if (contentType === "newsletter") {
    return `Emne: Nytt fra ${brandName}
Preheader: Praktiske oppdateringer, muligheter og neste steg.

Hei,

Her er det viktigste akkurat nå:
1. Hva som skjer i markedet/prosjektet.
2. Hva dette betyr for deg som kunde.
3. Hvilket neste steg vi anbefaler.

Svar på denne e-posten hvis du vil at vi skal se på saken din konkret.`;
  }

  if (contentType === "document") {
    return `Dokumentutkast for ${brandName}

Formål:
Forklar temaet enkelt, praktisk og uten løfter som må juridisk kontrolleres.

Hovedpunkter:
1. Hva kunden må forstå.
2. Hvilke valg kunden har.
3. Risiko og forbehold.
4. Neste steg og oppfølging.

Kvalitetssikring:
Fakta, priser, regler og juridiske formuleringer må verifiseres før dokumentet sendes.`;
  }

  if (contentType === "proposal") {
    return `Salgsbrev/tilbud for ${brandName}

Problem:
Kunden bruker for mye tid på manuelle prosesser, taper leads eller mangler systemkontroll.

Løsning:
Vi bygger en praktisk AI-app eller spesialsoftware som samler prosess, data og oppfølging.

Leveranse:
Kartlegging, prototype, integrasjon, opplæring og videreutvikling.

Neste steg:
Book en kort gjennomgang slik at vi kan avklare behov, prisnivå og tidslinje.`;
  }

  return `Utforsk ${brandDescription || "nye muligheter"} med ${brandName}.`;
}

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

  // Calendar state - loaded from database (scheduled posts)
  const [calendarView, setCalendarView] = useState<"weekly" | "monthly">("weekly");
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);

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
  const [draftsError, setDraftsError] = useState("");
  const [draftsSourceHost, setDraftsSourceHost] = useState("");
  const [editingDraft, setEditingDraft] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");

  // Publish modal state
  const [publishDraft, setPublishDraft] = useState<DraftItem | null>(null);
  const [publishPlatforms, setPublishPlatforms] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [publishResults, setPublishResults] = useState<{platform: string; success: boolean; postUrl?: string; error?: string}[]>([]);
  const [connectedAccounts, setConnectedAccounts] = useState<{platform: string; account_name: string; brand: string; brand_id?: string | null}[]>([]);

  // Image picker state
  const [imagePickerDraft, setImagePickerDraft] = useState<string | null>(null);
  const [availableImages, setAvailableImages] = useState<DraftItem[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);

  // Image upload state
  const [uploadingImage, setUploadingImage] = useState<string | null>(null);

  // -------------------------------------------------------------------
  // Customer-PDF state — pick several properties matching a buyer's
  // criteria and bundle them into one prospect PDF (overview list +
  // per-property pages). Sent via /api/property-pdf/multi.
  // -------------------------------------------------------------------
  interface PropertyRow {
    id: string;
    title?: string | null;
    location?: string | null;
    price?: number | null;
    property_type?: string | null;
    bedrooms?: number | null;
    bathrooms?: number | null;
    built_area?: number | null;
    primary_image?: string | null;
    ref?: string | null;
    status?: string | null;
  }
  const [pdfBrand, setPdfBrand] = useState<string>(
    BRANDS.find((b) => b.type === "real_estate")?.id || BRANDS[0].id,
  );
  const [pdfProperties, setPdfProperties] = useState<PropertyRow[]>([]);
  const [pdfPropertiesLoading, setPdfPropertiesLoading] = useState(false);
  const [pdfSelected, setPdfSelected] = useState<Set<string>>(new Set());
  const [pdfFilters, setPdfFilters] = useState({
    search: "",
    type: "Alle",
    bedrooms: "Alle",
    priceMin: "",
    priceMax: "",
    onlyAvailable: true,
  });
  const [pdfHeadline, setPdfHeadline] = useState("");
  const [pdfIntro, setPdfIntro] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfStatus, setPdfStatus] = useState<string | null>(null);

  // Load properties whenever the customer-PDF tab might be opened — we
  // fetch lazily on first interaction to keep the initial page light.
  // Using a separate fn so the button can also trigger a refresh.
  const loadPdfProperties = useCallback(async () => {
    setPdfPropertiesLoading(true);
    try {
      const res = await fetch("/api/properties");
      const data = await res.json();
      if (Array.isArray(data)) {
        setPdfProperties(data as PropertyRow[]);
      }
    } catch {
      // silent — UI shows empty list
    } finally {
      setPdfPropertiesLoading(false);
    }
  }, []);
  useEffect(() => {
    void loadPdfProperties();
  }, [loadPdfProperties]);

  // Scheduling state
  const [scheduleMode, setScheduleMode] = useState<"now" | "schedule">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [aiRecommendation, setAiRecommendation] = useState<{
    recommendations?: { platform: string; recommended_datetime: string; confidence: number; reasoning: string }[];
    general_advice?: string;
  } | null>(null);
  const [loadingAiTime, setLoadingAiTime] = useState(false);

  const fetchDrafts = useCallback(async () => {
    setDraftsLoading(true);
    setDraftsError("");
    try {
      const res = await fetch("/api/content-hub/drafts?limit=100", { cache: "no-store" });
      const data = await res.json();
      setDraftsSourceHost(data.supabaseHost || "");
      if (!res.ok) {
        throw new Error(data.error || "Kunne ikke hente Content Hub-utkast");
      }
      console.log(`[Content Hub] Fetched ${data.count || 0} publications from ${data.supabaseHost || "Supabase"}`);
      setDrafts(data.drafts || []);
      if (data.usedFallback) {
        setDraftsError("Content Hub leser utkast, men live-databasen mangler scheduled_platforms-kolonnen. Kjør scheduling-migrasjonen i samme Supabase-prosjekt.");
      }
    } catch (err) {
      console.error("Failed to fetch drafts:", err);
      setDraftsError(err instanceof Error ? err.message : "Kunne ikke hente Content Hub-utkast");
      setDrafts([]);
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
    const n = b.toLowerCase().replace(/[-_.\s]/g, "");
    if (n === "zenecohomes" || n === "zeneco") return "zeneco";
    if (n === "pinoso" || n === "pinosoecolife") return "pinosoecolife";
    return n.replace(/homes$/, "").replace(/pro$/, "");
  }, []);

  const brandMatches = useCallback((accountBrand: string, draftBrand: string, accountBrandId?: string | null) => {
    return normalizeBrand(accountBrand) === normalizeBrand(draftBrand)
      || normalizeBrand(accountBrandId || "") === normalizeBrand(draftBrand);
  }, [normalizeBrand]);

  const fetchAvailableImages = useCallback(async (brandId?: string) => {
    setLoadingImages(true);
    try {
      const supabase = getSupabase();
      if (!supabase) return;
      let query = supabase
        .from("content_publications")
        .select("id, brand_id, content_type, title, description, tags, ai_generated, ai_image_url, thumbnail_url, status, created_at")
        .not("ai_image_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(50);
      if (brandId) {
        query = query.eq("brand_id", brandId);
      }
      const { data } = await query;
      const bankRes = await fetch("/api/neural-beat/image-bank?owner=all&limit=24");
      const bankData = await bankRes.json().catch(() => ({ images: [] }));
      const bankImages: DraftItem[] = (bankData.images || [])
        .filter((img: { url?: string; kind?: string }) => img.url && ["product", "variant", "image", "thumbnail"].includes(img.kind || ""))
        .map((img: { id: string; url: string; thumbnail_url?: string | null; name?: string | null; kind: string; tags?: string[] | null; created_at: string }) => ({
          id: `bank-${img.id}`,
          brand_id: brandId || "image-bank",
          content_type: img.kind,
          title: img.name || (img.kind === "product" ? "Produktbilde" : "Bildearkiv"),
          description: "Lagret bilde fra Bilde Studio / produktarkiv",
          tags: img.tags || [],
          ai_generated: img.kind === "variant",
          ai_image_url: img.url,
          thumbnail_url: img.thumbnail_url || null,
          status: "draft",
          created_at: img.created_at,
          scheduled_platforms: [],
        }));
      setAvailableImages([...(data || []), ...bankImages]);
    } catch (err) {
      console.error("Failed to fetch images:", err);
    } finally {
      setLoadingImages(false);
    }
  }, []);

  const attachImageToDraft = useCallback(async (draftId: string, imageUrl: string, thumbnailUrl?: string | null) => {
    setUploadingImage(draftId);
    try {
      const res = await fetch("/api/content-hub/images/attach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId, imageUrl, thumbnailUrl }),
      });
      const data = await res.json().catch(() => ({ error: "Kunne ikke koble bildet til utkastet." }));
      if (!res.ok) throw new Error(data.error || "Kunne ikke koble bildet til utkastet.");

      setDrafts((prev) =>
        prev.map((d) => d.id === draftId ? { ...d, ai_image_url: imageUrl, thumbnail_url: thumbnailUrl || null } : d)
      );
      setImagePickerDraft(null);
    } catch (err) {
      console.error("Attach image error:", err);
      alert(err instanceof Error ? err.message : "Kunne ikke koble bildet til utkastet.");
    } finally {
      setUploadingImage(null);
    }
  }, []);

  const handleImageUpload = useCallback(async (draftId: string, file: File) => {
    setUploadingImage(draftId);
    try {
      const prepared = await prepareImageForUpload(file);
      const formData = new FormData();
      formData.append("file", prepared.file);
      formData.append("draft_id", draftId);
      formData.append("save_to_bank", "true");
      formData.append("bank_kind", "image");
      formData.append("bank_owner", "content-hub");
      formData.append("bank_name", file.name);
      formData.append("bank_tags", "content-hub,uploaded");

      const res = await fetch("/api/upload-image", {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({ error: "Opplasting feilet. Bildet kan være for stort." }));
      if (!res.ok) {
        throw new Error(data.error || "Opplasting feilet");
      }
      if (data.url) {
        setDrafts((prev) =>
          prev.map((d) => d.id === draftId ? { ...d, ai_image_url: data.url, thumbnail_url: data.thumbnailUrl || data.url } : d)
        );
        setImagePickerDraft(null);
      } else {
        throw new Error(data.error || "Opplasting feilet");
      }
    } catch (err) {
      console.error("Upload error:", err);
      alert(err instanceof Error ? err.message : "Opplasting feilet");
    } finally {
      setUploadingImage(null);
    }
  }, []);

  const fetchConnectedAccounts = useCallback(async () => {
    try {
      const [legacyRes, oauthRes] = await Promise.allSettled([
        fetch("/api/social-accounts", { cache: "no-store" }),
        fetch("/api/oauth/channels", { cache: "no-store" }),
      ]);

      const merged: { platform: string; account_name: string; brand: string; brand_id?: string | null }[] = [];
      const seen = new Set<string>();

      if (legacyRes.status === "fulfilled" && legacyRes.value.ok) {
        const legacyData = await legacyRes.value.json();
        for (const row of legacyData.accounts || []) {
          const item = {
            platform: String(row.platform || ""),
            account_name: String(row.account_name || row.display_name || row.platform || "Konto"),
            brand: String(row.brand || row.brand_id || ""),
            brand_id: row.brand_id || row.brand || null,
          };
          const key = `${item.brand_id}|${item.platform}|${item.account_name}`.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push(item);
        }
      }

      if (oauthRes.status === "fulfilled" && oauthRes.value.ok) {
        const oauthData = await oauthRes.value.json();
        for (const row of oauthData.channels || []) {
          const item = {
            platform: String(row.platform || ""),
            account_name: String(row.display_name || row.external_id || row.platform || "Konto"),
            brand: String(row.brand_id || ""),
            brand_id: row.brand_id || null,
          };
          const key = `${item.brand_id}|${item.platform}|${item.account_name}`.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push(item);
        }
      }

      setConnectedAccounts(merged);
    } catch (err) {
      console.error("Failed to fetch connected accounts:", err);
      setConnectedAccounts([]);
    }
  }, []);

  const openPublishModal = useCallback((draft: DraftItem) => {
    setPublishDraft(draft);
    setPublishResults([]);
    setPublishing(false);
    setScheduleMode("now");
    setScheduledAt("");
    setAiRecommendation(null);
    // Pre-select intended platforms from the draft when present. Property
    // SoMe drafts are created per platform, so this avoids publishing an
    // Instagram variant to every connected account by accident.
    const brandAccounts = connectedAccounts
      .filter((a) => brandMatches(a.brand, draft.brand_id, a.brand_id))
      .map((a) => a.platform);
    const intended = Array.isArray(draft.scheduled_platforms) && draft.scheduled_platforms.length > 0
      ? draft.scheduled_platforms
      : draft.tags?.filter((tag) => ["facebook", "instagram", "linkedin", "pinterest", "tiktok"].includes(String(tag).toLowerCase())) || [];
    const preselected = intended.length > 0
      ? intended.filter((platform) => brandAccounts.includes(platform))
      : brandAccounts;
    setPublishPlatforms(Array.from(new Set(preselected)));
  }, [connectedAccounts, brandMatches]);

  const fetchAiRecommendation = useCallback(async () => {
    if (!publishDraft || publishPlatforms.length === 0) return;
    setLoadingAiTime(true);
    try {
      const res = await fetch("/api/ai/recommend-time", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platforms: publishPlatforms,
          brand_id: publishDraft.brand_id,
          content_type: publishDraft.content_type,
          content_preview: publishDraft.description?.substring(0, 200) || "",
        }),
      });
      const data = await res.json();
      if (data.success) {
        setAiRecommendation(data);
        // Auto-fill the first recommendation's time
        if (data.recommendations?.[0]?.recommended_datetime) {
          const dt = new Date(data.recommendations[0].recommended_datetime);
          // Format for datetime-local input
          const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
          setScheduledAt(local);
        }
      }
    } catch (err) {
      console.error("AI recommendation failed:", err);
    } finally {
      setLoadingAiTime(false);
    }
  }, [publishDraft, publishPlatforms]);

  const executePublish = useCallback(async () => {
    if (!publishDraft || publishPlatforms.length === 0) return;
    setPublishing(true);
    setPublishResults([]);

    try {
      if (scheduleMode === "schedule" && scheduledAt) {
        // Schedule for future
        const res = await fetch("/api/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            draft_id: publishDraft.id,
            platforms: publishPlatforms,
            scheduled_at: new Date(scheduledAt).toISOString(),
            ai_timing_reasoning: aiRecommendation?.recommendations?.[0]?.reasoning || null,
          }),
        });
        const data = await res.json();
        if (data.success) {
          setPublishResults([{
            platform: "system",
            success: true,
            postUrl: undefined,
            error: undefined,
          }]);
          // Update draft in local state to show as scheduled
          setDrafts((prev) => prev.map((d) =>
            d.id === publishDraft.id ? { ...d, status: "scheduled" } : d
          ));
        } else {
          setPublishResults([{ platform: "system", success: false, error: data.error }]);
        }
      } else {
        // Publish now
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
        const results = data.results?.length
          ? data.results
          : [{ platform: "system", success: false, error: data.error || "Ingen respons fra publiseringstjenesten" }];
        setPublishResults(results);

        if (data.success) {
          setDrafts((prev) => prev.filter((d) => d.id !== publishDraft.id));
        }
      }
    } catch (err) {
      setPublishResults([{ platform: "system", success: false, error: err instanceof Error ? err.message : "Nettverksfeil" }]);
    } finally {
      setPublishing(false);
    }
  }, [publishDraft, publishPlatforms, scheduleMode, scheduledAt, aiRecommendation]);

  // Stats counters (from all statuses)
  const [statsCount, setStatsCount] = useState({ total: 0, published: 0, failed: 0, scheduled: 0 });

  // Analytics state - real data from Supabase
  const [brandPostCounts, setBrandPostCounts] = useState<Record<string, number>>({});
  const [topContent, setTopContent] = useState<{title: string; brand: string; platform: string; status: string; created_at: string}[]>([]);
  const [platformPostCounts, setPlatformPostCounts] = useState<Record<string, number>>({});

  // Engagement state - real SoMe data
  const [engagementTotals, setEngagementTotals] = useState({ likes: 0, comments: 0, shares: 0, views: 0, reach: 0, impressions: 0 });
  const [engagementPosts, setEngagementPosts] = useState<{
    id: string; title: string; brand: string; platform: string; published_at: string;
    likes: number; comments: number; shares: number; views: number; reach: number; impressions: number;
  }[]>([]);

  const fetchCalendarEvents = useCallback(async () => {
    try {
      const supabase = getSupabase();
      if (!supabase) return;
      // Load scheduled and published posts for calendar + stats
      const { data } = await supabase
        .from("content_publications")
        .select("id, title, brand_id, tags, scheduled_at, published_at, status, created_at")
        .in("status", ["scheduled", "published"])
        .order("created_at", { ascending: false })
        .limit(100);
      if (data) {
        const events: CalendarEvent[] = [];
        for (const p of data) {
          const dateStr = p.scheduled_at || p.published_at || p.created_at || "";
          const d = new Date(dateStr);
          if (isNaN(d.getTime())) continue;
          const brand = BRANDS.find((b) => b.id === p.brand_id);
          events.push({
            id: p.id,
            title: p.title || "Uten tittel",
            brand: brand?.name || p.brand_id,
            brandColor: brand?.color || "#64748b",
            platform: (p.tags && p.tags[0]) || "post",
            date: d.toISOString().split("T")[0],
            time: d.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" }),
            status: p.status === "published" ? "publisert" : "planlagt",
          });
        }
        setCalendarEvents(events);
      }
      // Fetch total counts for stats
      const { count: totalCount } = await supabase
        .from("content_publications")
        .select("id", { count: "exact", head: true });
      const { count: publishedCount } = await supabase
        .from("content_publications")
        .select("id", { count: "exact", head: true })
        .eq("status", "published");
      const { count: failedCount } = await supabase
        .from("content_publications")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed");
      const { count: scheduledCount } = await supabase
        .from("content_publications")
        .select("id", { count: "exact", head: true })
        .eq("status", "scheduled");
      setStatsCount({
        total: totalCount || 0,
        published: publishedCount || 0,
        failed: failedCount || 0,
        scheduled: scheduledCount || 0,
      });

      // Fetch per-brand post counts
      const { data: allPubs } = await supabase
        .from("content_publications")
        .select("brand_id, tags, status");
      if (allPubs) {
        const brandCounts: Record<string, number> = {};
        const platCounts: Record<string, number> = {};
        for (const pub of allPubs) {
          brandCounts[pub.brand_id] = (brandCounts[pub.brand_id] || 0) + 1;
          if (pub.tags && Array.isArray(pub.tags)) {
            for (const tag of pub.tags) {
              const t = tag.toLowerCase();
              if (["youtube","instagram","facebook","linkedin","tiktok","pinterest"].includes(t)) {
                platCounts[t] = (platCounts[t] || 0) + 1;
              }
            }
          }
        }
        setBrandPostCounts(brandCounts);
        setPlatformPostCounts(platCounts);
      }

      // Fetch top content (most recent published)
      const { data: topPubs } = await supabase
        .from("content_publications")
        .select("title, brand_id, tags, status, created_at")
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .limit(5);
      if (topPubs) {
        setTopContent(topPubs.map((p) => ({
          title: p.title || "Uten tittel",
          brand: BRANDS.find((b) => b.id === p.brand_id)?.name || p.brand_id,
          platform: (p.tags && p.tags[0]) || "post",
          status: p.status,
          created_at: p.created_at,
        })));
      }

      // Fetch real engagement data from content_publications + engagement_snapshots
      const { data: pubsWithEngagement } = await supabase
        .from("content_publications")
        .select("id, title, brand_id, tags, published_at, total_likes, total_comments, total_shares, total_views")
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(50);

      const { data: snapshots } = await supabase
        .from("engagement_snapshots")
        .select("publication_id, platform, likes, comments, shares, reach, impressions")
        .order("snapshot_at", { ascending: false })
        .limit(500);

      // Build per-post engagement from snapshots (latest per publication+platform)
      const snapByPub = new Map<string, { likes: number; comments: number; shares: number; reach: number; impressions: number }>();
      if (snapshots) {
        for (const snap of snapshots) {
          const existing = snapByPub.get(snap.publication_id);
          if (existing) {
            existing.likes += snap.likes || 0;
            existing.comments += snap.comments || 0;
            existing.shares += snap.shares || 0;
            existing.reach += snap.reach || 0;
            existing.impressions += snap.impressions || 0;
          } else {
            snapByPub.set(snap.publication_id, {
              likes: snap.likes || 0,
              comments: snap.comments || 0,
              shares: snap.shares || 0,
              reach: snap.reach || 0,
              impressions: snap.impressions || 0,
            });
          }
        }
      }

      if (pubsWithEngagement) {
        let totalLikes = 0, totalComments = 0, totalShares = 0, totalViews = 0, totalReach = 0, totalImpressions = 0;
        const posts = pubsWithEngagement.map((p) => {
          const snapData = snapByPub.get(p.id);
          const likes = (p.total_likes || 0) + (snapData?.likes || 0);
          const comments = (p.total_comments || 0) + (snapData?.comments || 0);
          const shares = (p.total_shares || 0) + (snapData?.shares || 0);
          const views = p.total_views || 0;
          const reach = snapData?.reach || 0;
          const impressions = snapData?.impressions || 0;
          totalLikes += likes;
          totalComments += comments;
          totalShares += shares;
          totalViews += views;
          totalReach += reach;
          totalImpressions += impressions;
          return {
            id: p.id,
            title: p.title || "Uten tittel",
            brand: BRANDS.find((b) => b.id === p.brand_id)?.name || p.brand_id,
            platform: (p.tags && p.tags[0]) || "–",
            published_at: p.published_at || "",
            likes, comments, shares, views, reach, impressions,
          };
        });
        setEngagementPosts(posts);
        setEngagementTotals({ likes: totalLikes, comments: totalComments, shares: totalShares, views: totalViews, reach: totalReach, impressions: totalImpressions });
      }
    } catch (err) {
      console.error("Failed to fetch calendar events:", err);
    }
  }, []);

  useEffect(() => {
    fetchDrafts();
    fetchConnectedAccounts();
    fetchCalendarEvents();
  }, [fetchDrafts, fetchConnectedAccounts, fetchCalendarEvents]);

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
              content_type: selectedContentType,
              platform: selectedPlatforms[0] || 'instagram',
              existing_title: title,
              existing_description: description,
              instruction: field === 'title'
                ? `Lag en profesjonell tittel for ${brand?.name}. Innholdstype: ${selectedContentType}. Kun tittel, ingen annet.`
                : field === 'description'
                ? `Skriv et kjøper-/kundevennlig utkast for ${brand?.name}. Innholdstype: ${selectedContentType}. For newsletter: bruk emnelinje, preheader og 3 korte blokker. For document: bruk kvalitetssikret struktur. For proposal: bruk problem, løsning, leveranse, prisforbehold og CTA. Maks 250 ord.`
                : `Generer 8-12 relevante tags/temaer for ${brand?.name} og innholdstype ${selectedContentType}. Kun tags separert med mellomrom.`,
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
        if (field === "title") setTitle(`${brand?.name} - ${selectedContentType === "newsletter" ? "nyhetsbrev" : selectedContentType === "proposal" ? "tilbud og løsning" : "oppdag nye muligheter"}`);
        else if (field === "description") setDescription(createFallbackContent(brand?.name || selectedBrand, brand?.description || "", selectedContentType));
        else if (field === "tags") setTags((brand?.specialties || []).map((s) => `#${s.replace(/\s+/g, "")}`).join(" "));
      }
    } catch {
      const brand = BRANDS.find((b) => b.id === selectedBrand);
      if (field === "title") setTitle(`${brand?.name} - ${selectedContentType === "newsletter" ? "nyhetsbrev" : selectedContentType === "proposal" ? "tilbud og løsning" : "oppdag nye muligheter"}`);
      else if (field === "description") setDescription(createFallbackContent(brand?.name || selectedBrand, brand?.description || "", selectedContentType));
      else if (field === "tags") setTags((brand?.specialties || []).map((s) => `#${s.replace(/\s+/g, "")}`).join(" "));
    }
    setAiGenerating(null);
  }, [selectedBrand, selectedPlatforms, selectedContentType, title, description]);

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
      case "aktiv": case "published": case "publisert": return <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">Publisert</Badge>;
      case "planlagt": case "scheduled": return <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30">Planlagt</Badge>;
      case "fullfort": return <Badge variant="secondary">Fullført</Badge>;
      case "pauset": return <Badge className="bg-yellow-500/20 text-yellow-300 border-yellow-500/30">Pauset</Badge>;
      case "draft": case "utkast": return <Badge variant="outline">Utkast</Badge>;
      case "failed": return <Badge className="bg-red-500/20 text-red-300 border-red-500/30">Feilet</Badge>;
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
                <p className="text-xs text-slate-400">Totalt innhold</p>
                <p className="text-2xl font-bold text-white">{statsCount.total}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {statsCount.published} publisert, {drafts.length} utkast
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
                <p className="text-xs text-slate-400">Publisert</p>
                <p className="text-2xl font-bold text-white">{statsCount.published}</p>
                <p className="text-xs text-emerald-400 flex items-center gap-1 mt-1">
                  <TrendingUp size={12} /> {statsCount.failed > 0 ? `${statsCount.failed} feilet` : "Totalt publisert"}
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
                <p className="text-xs text-slate-400">Utkast klare</p>
                <p className="text-2xl font-bold text-white">{drafts.filter((d) => d.status === "draft").length}</p>
                <p className="text-xs text-slate-400 mt-1">
                  Klare til publisering
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
                <p className="text-xs text-slate-400">Planlagte poster</p>
                <p className="text-2xl font-bold text-white">
                  {statsCount.scheduled}
                </p>
                <p className="text-xs text-amber-400 mt-1">
                  Venter på publisering
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
            <Inbox size={14} /> Innhold {drafts.length > 0 && <Badge variant="secondary" className="ml-1 text-xs">{drafts.length}</Badge>}
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
          <TabsTrigger value="kunde-pdf" className="flex items-center gap-2">
            <FileText size={14} /> Kunde-PDF
          </TabsTrigger>
        </TabsList>

        {/* TAB 0: UTKAST (AI-genererte drafts) */}
        <TabsContent value="utkast">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">AI-genererte utkast</h3>
                <p className="text-sm text-zinc-400">
                  Utkast fra Markedsføringskit og AI-agenter. Rediger og publiser.
                  {draftsSourceHost && <span className="ml-1 text-zinc-500">Supabase: {draftsSourceHost}</span>}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={fetchDrafts} disabled={draftsLoading}>
                {draftsLoading ? <Loader2 size={14} className="animate-spin mr-2" /> : null}
                Oppdater
              </Button>
            </div>

            {draftsError && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                {draftsError}
              </div>
            )}

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
                              {statusBadge(draft.status)}
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
                                      src={draft.thumbnail_url || draft.ai_image_url}
                                      alt={draft.title || "AI-generert bilde"}
                                      loading="lazy"
                                      decoding="async"
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
                              {draft.status === "draft" && (
                                <>
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
                                    variant="outline"
                                    className="text-xs"
                                    onClick={() => {
                                      setImagePickerDraft(draft.id);
                                      fetchAvailableImages(draft.brand_id);
                                    }}
                                  >
                                    <Image size={12} className="mr-1" /> {draft.ai_image_url ? "Bytt bilde" : "Velg bilde"}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-xs"
                                    disabled={uploadingImage === draft.id}
                                    onClick={() => {
                                      const input = document.createElement("input");
                                      input.type = "file";
                                      input.accept = "image/jpeg,image/png,image/webp";
                                      input.onchange = (e) => {
                                        const f = (e.target as HTMLInputElement).files?.[0];
                                        if (f) handleImageUpload(draft.id, f);
                                      };
                                      input.click();
                                    }}
                                  >
                                    {uploadingImage === draft.id ? (
                                      <Loader2 size={12} className="mr-1 animate-spin" />
                                    ) : (
                                      <Upload size={12} className="mr-1" />
                                    )}
                                    Last opp bilde
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
                                    onClick={() => updateDraftStatus(draft.id, "archived")}
                                  >
                                    <Trash2 size={12} className="mr-1" /> Forkast
                                  </Button>
                                </>
                              )}
                              {draft.status === "scheduled" && (
                                <>
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
                                    variant="ghost"
                                    className="text-xs text-red-400 hover:text-red-300"
                                    onClick={() => updateDraftStatus(draft.id, "archived")}
                                  >
                                    <Trash2 size={12} className="mr-1" /> Slett
                                  </Button>
                                </>
                              )}
                              {draft.status === "failed" && (
                                <Button
                                  size="sm"
                                  className="text-xs bg-amber-600 hover:bg-amber-700"
                                  onClick={() => updateDraftStatus(draft.id, "draft")}
                                >
                                  <RefreshCw size={12} className="mr-1" /> Prøv igjen
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          {/* Image Picker Modal */}
          {imagePickerDraft && (
            <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setImagePickerDraft(null)}>
              <div className="bg-zinc-900 border border-zinc-700 rounded-xl max-w-3xl w-full max-h-[80vh] p-6 space-y-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Image size={18} className="text-purple-400" />
                    Velg bilde fra arkivet
                  </h3>
                  <button onClick={() => setImagePickerDraft(null)} className="text-zinc-400 hover:text-white">
                    <X size={20} />
                  </button>
                </div>

                {/* Upload from computer */}
                <div className="flex items-center gap-3 p-3 bg-zinc-800 rounded-lg border border-zinc-700">
                  <Upload size={18} className="text-cyan-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-200">Last opp fra datamaskinen</p>
                    <p className="text-xs text-zinc-500">JPG, PNG eller WebP (maks 10MB)</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    disabled={uploadingImage === imagePickerDraft}
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = "image/jpeg,image/png,image/webp";
                      input.onchange = (e) => {
                        const f = (e.target as HTMLInputElement).files?.[0];
                        if (f && imagePickerDraft) handleImageUpload(imagePickerDraft, f);
                      };
                      input.click();
                    }}
                  >
                    {uploadingImage === imagePickerDraft ? (
                      <Loader2 size={12} className="mr-1 animate-spin" />
                    ) : (
                      <Upload size={12} className="mr-1" />
                    )}
                    Last opp bilde
                  </Button>
                </div>

                <div className="border-t border-zinc-700 pt-3">
                  <p className="text-xs text-zinc-500 mb-3">Eller velg fra arkivet:</p>
                </div>

                {loadingImages ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 size={24} className="animate-spin text-zinc-400" />
                  </div>
                ) : availableImages.length === 0 ? (
                  <div className="text-center py-12">
                    <Image size={48} className="text-zinc-600 mx-auto mb-4" />
                    <p className="text-sm text-zinc-400">Ingen genererte bilder funnet.</p>
                    <p className="text-xs text-zinc-500 mt-1">Gå til Bilde Studio for å generere bilder først.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 overflow-y-auto max-h-[55vh] pr-1">
                    {availableImages.map((img) => (
                      <button
                        key={img.id}
                        onClick={() => img.ai_image_url && attachImageToDraft(imagePickerDraft, img.ai_image_url, img.thumbnail_url)}
                        className="group relative rounded-lg overflow-hidden border border-zinc-700 hover:border-purple-500 transition-all bg-zinc-800"
                      >
                        <img
                          src={img.thumbnail_url || img.ai_image_url!}
                          alt={img.title || "AI-bilde"}
                          loading="lazy"
                          decoding="async"
                          className="w-full aspect-square object-cover"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center">
                          <span className="text-white text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity bg-purple-600 px-3 py-1.5 rounded-lg">
                            Velg dette
                          </span>
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                          <p className="text-xs text-white truncate">{img.title || "Uten tittel"}</p>
                          <p className="text-[10px] text-zinc-400">{new Date(img.created_at).toLocaleDateString("nb-NO")}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
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
                      { id: "pinterest", name: "Pinterest", icon: Target, color: "text-rose-400", bg: "bg-rose-500/20" },
                      { id: "tiktok", name: "TikTok", icon: Music, color: "text-emerald-400", bg: "bg-emerald-500/20" },
                    ].map((p) => {
                      const isConnected = connectedAccounts.some(
                        (a) => a.platform === p.id && brandMatches(a.brand, publishDraft.brand_id, a.brand_id)
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

                  {connectedAccounts.filter((a) => brandMatches(a.brand, publishDraft.brand_id, a.brand_id)).length === 0 && (
                    <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                      <p className="text-xs text-yellow-300">
                        Ingen kontoer koblet til for dette brandet. Gå til{" "}
                        <a href="/settings" className="underline font-medium">Innstillinger → Sosiale Medier</a>{" "}
                        og koble til Facebook/Instagram/LinkedIn via OAuth.
                      </p>
                    </div>
                  )}
                </div>

                {/* Schedule Mode Toggle */}
                <div>
                  <p className="text-sm font-medium mb-2">Tidspunkt:</p>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <button
                      onClick={() => setScheduleMode("now")}
                      className={`p-3 rounded-lg border text-sm font-medium transition-all ${
                        scheduleMode === "now"
                          ? "border-green-500 bg-green-500/10 text-green-300"
                          : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                      }`}
                    >
                      <Send size={16} className="mx-auto mb-1" />
                      Publiser nå
                    </button>
                    <button
                      onClick={() => setScheduleMode("schedule")}
                      className={`p-3 rounded-lg border text-sm font-medium transition-all ${
                        scheduleMode === "schedule"
                          ? "border-purple-500 bg-purple-500/10 text-purple-300"
                          : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                      }`}
                    >
                      <Clock size={16} className="mx-auto mb-1" />
                      Planlegg
                    </button>
                  </div>

                  {scheduleMode === "schedule" && (
                    <div className="space-y-3 p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
                      <div>
                        <label className="text-xs text-zinc-400 mb-1 block">Velg dato og tid</label>
                        <input
                          type="datetime-local"
                          value={scheduledAt}
                          onChange={(e) => setScheduledAt(e.target.value)}
                          min={new Date().toISOString().slice(0, 16)}
                          className="w-full h-10 rounded-lg border border-zinc-600 bg-zinc-900 px-3 text-sm text-zinc-100"
                        />
                      </div>

                      <button
                        onClick={fetchAiRecommendation}
                        disabled={loadingAiTime || publishPlatforms.length === 0}
                        className="w-full flex items-center justify-center gap-2 p-2.5 rounded-lg border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 text-sm font-medium transition-all disabled:opacity-50"
                      >
                        {loadingAiTime ? (
                          <><Loader2 size={14} className="animate-spin" /> AI analyserer...</>
                        ) : (
                          <><Sparkles size={14} /> La AI velge beste tidspunkt</>
                        )}
                      </button>

                      {aiRecommendation?.recommendations && (
                        <div className="space-y-2">
                          {aiRecommendation.recommendations.map((rec, i) => (
                            <button
                              key={i}
                              onClick={() => {
                                const dt = new Date(rec.recommended_datetime);
                                const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                                setScheduledAt(local);
                              }}
                              className="w-full text-left p-2.5 rounded-lg bg-purple-500/5 border border-purple-500/20 hover:border-purple-500/40 transition-all"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-purple-300 capitalize">{rec.platform}</span>
                                <span className="text-xs text-zinc-400">
                                  {new Date(rec.recommended_datetime).toLocaleString("nb-NO", {
                                    weekday: "short", day: "numeric", month: "short",
                                    hour: "2-digit", minute: "2-digit",
                                  })}
                                </span>
                              </div>
                              <p className="text-xs text-zinc-400 mt-1">{rec.reasoning}</p>
                              <div className="flex items-center gap-1 mt-1">
                                <div className="h-1.5 rounded-full bg-purple-500/30 flex-1">
                                  <div
                                    className="h-full rounded-full bg-purple-400"
                                    style={{ width: `${(rec.confidence || 0.5) * 100}%` }}
                                  />
                                </div>
                                <span className="text-[10px] text-zinc-500">{Math.round((rec.confidence || 0.5) * 100)}%</span>
                              </div>
                            </button>
                          ))}
                          {aiRecommendation.general_advice && (
                            <p className="text-xs text-zinc-500 italic">{aiRecommendation.general_advice}</p>
                          )}
                        </div>
                      )}
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
                        <span className="capitalize font-medium">{r.platform === "system" ? (scheduleMode === "schedule" ? "Planlegging" : "System") : r.platform}</span>
                        {r.success ? (
                          r.postUrl ? (
                            <a href={r.postUrl} target="_blank" rel="noopener" className="ml-auto text-xs underline">
                              Se post →
                            </a>
                          ) : (
                            <span className="ml-auto text-xs">
                              {scheduleMode === "schedule"
                                ? `Planlagt: ${scheduledAt ? new Date(scheduledAt).toLocaleString("nb-NO", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "OK"}`
                                : "Publisert!"}
                            </span>
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
                        className={`flex-1 ${scheduleMode === "schedule" ? "bg-purple-600 hover:bg-purple-700" : "bg-green-600 hover:bg-green-700"}`}
                        onClick={executePublish}
                        disabled={publishing || publishPlatforms.length === 0 || (scheduleMode === "schedule" && !scheduledAt)}
                      >
                        {publishing ? (
                          <><Loader2 size={14} className="animate-spin mr-2" /> {scheduleMode === "schedule" ? "Planlegger..." : "Publiserer..."}</>
                        ) : scheduleMode === "schedule" ? (
                          <><Clock size={14} className="mr-1" /> Planlegg til {publishPlatforms.length} plattform{publishPlatforms.length > 1 ? "er" : ""}</>
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

            {/* Campaign Cards - placeholder until campaigns feature is built */}
            <Card>
              <CardContent className="p-8 text-center">
                <Target size={32} className="mx-auto text-slate-600 mb-3" />
                <p className="text-slate-400">Ingen kampanjer opprettet ennå</p>
                <p className="text-xs text-slate-500 mt-1">Bruk knappen over for å opprette din første kampanje</p>
              </CardContent>
            </Card>
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
                  const dayEvents = calendarEvents.filter((e) => e.date === dateStr);
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
                      Viser {calendarEvents.length} planlagte innlegg denne maneden
                    </p>
                    <div className="mt-6 grid grid-cols-7 gap-1">
                      {dayNames.map((d) => (
                        <p key={d} className="text-[10px] text-slate-500 text-center py-1">{d}</p>
                      ))}
                      {Array.from({ length: 31 }, (_, i) => {
                        const dayDate = `2026-03-${String(i + 1).padStart(2, "0")}`;
                        const hasEvents = calendarEvents.some((e) => e.date === dayDate);
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
                  {calendarEvents.filter((e) => e.status === "planlagt").slice(0, 5).map((event) => (
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

            {/* Google Calendar drag & drop */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar size={16} className="text-blue-400" />
                  Google Kalender
                </CardTitle>
                <p className="text-xs text-slate-400">Dra og slipp hendelser for å endre dato. Klikk på ledig tid for å opprette ny hendelse. Krever GOOGLE_CALENDAR_REFRESH_TOKEN i env.</p>
              </CardHeader>
              <CardContent className="p-2">
                <ContentCalendar />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB 4: ANALYTICS */}
        <TabsContent value="analytics">
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-white">Ytelsesdashboard</h2>

            {/* Aggregate engagement totals */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {[
                { label: "Visninger", value: engagementTotals.views, icon: Eye, color: "text-primary-400" },
                { label: "Likes", value: engagementTotals.likes, icon: ThumbsUp, color: "text-pink-400" },
                { label: "Kommentarer", value: engagementTotals.comments, icon: MessageSquare, color: "text-sky-400" },
                { label: "Delinger", value: engagementTotals.shares, icon: Share2, color: "text-emerald-400" },
                { label: "Rekkevidde", value: engagementTotals.reach, icon: TrendingUp, color: "text-amber-400" },
                { label: "Visningsrekkevidde", value: engagementTotals.impressions, icon: Eye, color: "text-purple-400" },
              ].map((m) => {
                const Icon = m.icon;
                return (
                  <Card key={m.label}>
                    <CardContent className="p-4 text-center">
                      <Icon size={20} className={`mx-auto ${m.color} mb-2`} />
                      <p className="text-2xl font-bold text-white">{m.value.toLocaleString("nb-NO")}</p>
                      <p className="text-xs text-slate-400">{m.label}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Content counts row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4 text-center">
                  <Eye size={20} className="mx-auto text-primary-400 mb-2" />
                  <p className="text-2xl font-bold text-white">{statsCount.total}</p>
                  <p className="text-xs text-slate-400">Totalt innhold</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <CheckCircle size={20} className="mx-auto text-emerald-400 mb-2" />
                  <p className="text-2xl font-bold text-white">{statsCount.published}</p>
                  <p className="text-xs text-slate-400">Publisert</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <Clock size={20} className="mx-auto text-amber-400 mb-2" />
                  <p className="text-2xl font-bold text-white">{statsCount.scheduled}</p>
                  <p className="text-xs text-slate-400">Planlagt</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <FileText size={20} className="mx-auto text-slate-400 mb-2" />
                  <p className="text-2xl font-bold text-white">{drafts.filter((d) => d.status === "draft").length}</p>
                  <p className="text-xs text-slate-400">Utkast</p>
                </CardContent>
              </Card>
            </div>

            {/* Published posts engagement table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 size={16} className="text-primary-400" />
                  SoMe Engasjement per Innlegg
                </CardTitle>
                <CardDescription>Ekte data fra publiserte innlegg</CardDescription>
              </CardHeader>
              <CardContent>
                {engagementPosts.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-8">Ingen publiserte innlegg med engasjementsdata enna.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-700">
                          <th className="text-left py-2 px-2 text-slate-400 font-medium">Tittel</th>
                          <th className="text-left py-2 px-2 text-slate-400 font-medium">Plattform</th>
                          <th className="text-left py-2 px-2 text-slate-400 font-medium">Publisert</th>
                          <th className="text-right py-2 px-2 text-slate-400 font-medium">Visninger</th>
                          <th className="text-right py-2 px-2 text-slate-400 font-medium">Likes</th>
                          <th className="text-right py-2 px-2 text-slate-400 font-medium">Kommentarer</th>
                          <th className="text-right py-2 px-2 text-slate-400 font-medium">Delinger</th>
                          <th className="text-right py-2 px-2 text-slate-400 font-medium">Rekkevidde</th>
                        </tr>
                      </thead>
                      <tbody>
                        {engagementPosts.map((post) => (
                          <tr key={post.id} className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors">
                            <td className="py-2.5 px-2">
                              <p className="text-slate-200 truncate max-w-[200px]">{post.title}</p>
                              <p className="text-xs text-slate-500">{post.brand}</p>
                            </td>
                            <td className="py-2.5 px-2">
                              <Badge variant="outline" className="text-xs capitalize">{post.platform}</Badge>
                            </td>
                            <td className="py-2.5 px-2 text-slate-400 text-xs whitespace-nowrap">
                              {post.published_at ? new Date(post.published_at).toLocaleDateString("nb-NO") : "–"}
                            </td>
                            <td className="py-2.5 px-2 text-right text-slate-200">{post.views.toLocaleString("nb-NO")}</td>
                            <td className="py-2.5 px-2 text-right text-pink-400">{post.likes.toLocaleString("nb-NO")}</td>
                            <td className="py-2.5 px-2 text-right text-sky-400">{post.comments.toLocaleString("nb-NO")}</td>
                            <td className="py-2.5 px-2 text-right text-emerald-400">{post.shares.toLocaleString("nb-NO")}</td>
                            <td className="py-2.5 px-2 text-right text-amber-400">{post.reach.toLocaleString("nb-NO")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Per Platform Breakdown - real counts */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Innlegg per plattform</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    { platform: "YouTube", key: "youtube", icon: Youtube, color: "text-red-400", bg: "bg-red-500" },
                    { platform: "Instagram", key: "instagram", icon: Camera, color: "text-pink-400", bg: "bg-pink-500" },
                    { platform: "Facebook", key: "facebook", icon: Globe, color: "text-blue-400", bg: "bg-blue-500" },
                    { platform: "LinkedIn", key: "linkedin", icon: Link, color: "text-sky-400", bg: "bg-sky-500" },
                    { platform: "TikTok", key: "tiktok", icon: Music, color: "text-emerald-400", bg: "bg-emerald-500" },
                    { platform: "Pinterest", key: "pinterest", icon: Target, color: "text-rose-400", bg: "bg-rose-500" },
                  ].map((item) => {
                    const Icon = item.icon;
                    const count = platformPostCounts[item.key] || 0;
                    const maxCount = Math.max(1, ...Object.values(platformPostCounts));
                    const width = maxCount > 0 ? Math.max(2, (count / maxCount) * 100) : 2;
                    return (
                      <div key={item.platform} className="flex items-center gap-4">
                        <div className="flex items-center gap-2 w-28">
                          <Icon size={16} className={item.color} />
                          <span className="text-sm text-slate-300">{item.platform}</span>
                        </div>
                        <div className="flex-1">
                          <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
                            <div className={`h-full rounded-full ${item.bg}`} style={{ width: `${count > 0 ? width : 0}%` }} />
                          </div>
                        </div>
                        <span className="text-sm text-slate-200 w-16 text-right">{count} innlegg</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Per Brand Breakdown - real data */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Innlegg per merkevare</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {BRANDS.map((brand) => {
                    const postCount = brandPostCounts[brand.id] || 0;
                    return (
                      <div key={brand.id} className="p-3 rounded-lg bg-slate-900/50 border border-slate-700/30">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: brand.color }} />
                          <span className="text-sm font-medium text-slate-200">{brand.name}</span>
                        </div>
                        <div className="grid grid-cols-1 gap-2 text-center">
                          <div>
                            <p className="text-sm font-bold text-white">{postCount}</p>
                            <p className="text-[10px] text-slate-500">Totalt innlegg</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Top Content - real from database */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sist publisert innhold</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {topContent.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-6">Ingen publisert innhold enna.</p>
                  ) : (
                    topContent.map((item, i) => (
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
                            <p className="text-xs text-slate-400">
                              {new Date(item.created_at).toLocaleDateString("nb-NO")}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
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

        {/* ============================================================ */}
        {/* TAB: KUNDE-PDF                                                */}
        {/*                                                               */}
        {/* Pick a brand + filter properties to a customer's criteria,   */}
        {/* tick boxes, generate one combined PDF or send straight via    */}
        {/* SMTP. Each row links back to the inventory page for a deep    */}
        {/* dive on a specific property.                                  */}
        {/* ============================================================ */}
        <TabsContent value="kunde-pdf">
          <div className="space-y-4">
            {/* Header card with brand picker + cover info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText size={18} className="text-emerald-400" />
                  Kuratert eiendoms-PDF til kunde
                </CardTitle>
                <CardDescription>
                  Filtrer og velg eiendommer som matcher kundens kriterier. Vi
                  lager én PDF med oversiktsliste først og detaljside per eiendom,
                  inkludert megler-kontaktinfo til slutt.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">
                      Merkevare (logo + megler)
                    </label>
                    <select
                      value={pdfBrand}
                      onChange={(e) => setPdfBrand(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                    >
                      {BRANDS.filter((b) => b.type === "real_estate").map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">
                      Forside-tittel (valgfritt)
                    </label>
                    <Input
                      value={pdfHeadline}
                      onChange={(e) => setPdfHeadline(e.target.value)}
                      placeholder="For familien Hansen"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">
                      Forside-intro (valgfritt)
                    </label>
                    <Input
                      value={pdfIntro}
                      onChange={(e) => setPdfIntro(e.target.value)}
                      placeholder="Et utvalg basert på samtalen vår..."
                    />
                  </div>
                </div>

                {/* Filter row */}
                <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
                  <div className="md:col-span-2">
                    <label className="text-xs text-slate-400 mb-1 block">Søk</label>
                    <Input
                      value={pdfFilters.search}
                      onChange={(e) => setPdfFilters({ ...pdfFilters, search: e.target.value })}
                      placeholder="tittel, sted, ref..."
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Type</label>
                    <select
                      value={pdfFilters.type}
                      onChange={(e) => setPdfFilters({ ...pdfFilters, type: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-sm text-white"
                    >
                      {["Alle","Villa","Leilighet","Penthouse","Rekkehus","Bungalow","Finca","Duplex","Byggetomt"].map(t => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Soverom</label>
                    <select
                      value={pdfFilters.bedrooms}
                      onChange={(e) => setPdfFilters({ ...pdfFilters, bedrooms: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-sm text-white"
                    >
                      {["Alle","1+","2+","3+","4+","5+"].map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Pris fra (€)</label>
                    <Input
                      type="number"
                      value={pdfFilters.priceMin}
                      onChange={(e) => setPdfFilters({ ...pdfFilters, priceMin: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Pris til (€)</label>
                    <Input
                      type="number"
                      value={pdfFilters.priceMax}
                      onChange={(e) => setPdfFilters({ ...pdfFilters, priceMax: e.target.value })}
                      placeholder="∞"
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pdfFilters.onlyAvailable}
                    onChange={(e) => setPdfFilters({ ...pdfFilters, onlyAvailable: e.target.checked })}
                    className="rounded border-slate-600 bg-slate-800"
                  />
                  Kun tilgjengelige
                </label>
              </CardContent>
            </Card>

            {/* Properties grid + selection */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">
                    {pdfSelected.size > 0
                      ? `${pdfSelected.size} valgt`
                      : "Velg eiendommer"}
                  </CardTitle>
                  <CardDescription>
                    Klikk på en rad for å markere. Trykk «Vis» for å åpne
                    eiendommen i ny fane.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPdfSelected(new Set())}
                    disabled={pdfSelected.size === 0}
                  >
                    <X size={14} className="mr-1.5" /> Tøm utvalg
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void loadPdfProperties()}
                    disabled={pdfPropertiesLoading}
                  >
                    {pdfPropertiesLoading ? (
                      <Loader2 size={14} className="mr-1.5 animate-spin" />
                    ) : (
                      <RefreshCw size={14} className="mr-1.5" />
                    )}
                    Oppdater
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {(() => {
                  // Build the filtered list inline so render stays a single block.
                  const minBeds = pdfFilters.bedrooms === "Alle" ? 0 : parseInt(pdfFilters.bedrooms);
                  const min = pdfFilters.priceMin ? Number(pdfFilters.priceMin) : 0;
                  const max = pdfFilters.priceMax ? Number(pdfFilters.priceMax) : Infinity;
                  const q = pdfFilters.search.toLowerCase().trim();

                  const filtered = pdfProperties.filter((p) => {
                    if (pdfFilters.onlyAvailable && p.status && p.status !== "TILGJENGELIG") return false;
                    if (pdfFilters.type !== "Alle" && (p.property_type || "") !== pdfFilters.type) return false;
                    if (minBeds && (p.bedrooms || 0) < minBeds) return false;
                    const price = Number(p.price || 0);
                    if (price < min || price > max) return false;
                    if (q) {
                      const hay = `${p.title || ""} ${p.location || ""} ${p.ref || ""}`.toLowerCase();
                      if (!hay.includes(q)) return false;
                    }
                    return true;
                  });

                  if (pdfPropertiesLoading) {
                    return (
                      <div className="py-8 text-center text-sm text-slate-400">
                        <Loader2 size={20} className="mx-auto mb-2 animate-spin" />
                        Laster eiendommer...
                      </div>
                    );
                  }
                  if (filtered.length === 0) {
                    return (
                      <p className="text-sm text-slate-400 py-6 text-center">
                        Ingen eiendommer matcher filtrene.
                      </p>
                    );
                  }
                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[460px] overflow-y-auto pr-1">
                      {filtered.map((p) => {
                        const checked = pdfSelected.has(p.id);
                        const toggle = () => {
                          setPdfSelected((prev) => {
                            const next = new Set(prev);
                            if (next.has(p.id)) next.delete(p.id);
                            else next.add(p.id);
                            return next;
                          });
                        };
                        return (
                          <div
                            key={p.id}
                            onClick={toggle}
                            className={`flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition ${
                              checked
                                ? "border-emerald-500 bg-emerald-500/10"
                                : "border-slate-700 bg-slate-900/40 hover:border-slate-500"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={toggle}
                              onClick={(e) => e.stopPropagation()}
                              className="h-4 w-4"
                            />
                            {p.primary_image ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={p.primary_image}
                                alt=""
                                loading="lazy"
                                decoding="async"
                                className="w-16 h-12 object-cover rounded bg-slate-800"
                              />
                            ) : (
                              <div className="w-16 h-12 rounded bg-slate-800 flex items-center justify-center text-slate-600 text-xs">
                                —
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-white truncate">{p.title || "Uten tittel"}</p>
                              <p className="text-xs text-slate-400 truncate">
                                {(p.property_type || "Eiendom")}
                                {p.bedrooms ? ` · ${p.bedrooms} sov` : ""}
                                {p.built_area ? ` · ${p.built_area} m²` : ""}
                                {p.location ? ` · ${p.location}` : ""}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold text-emerald-400">
                                €{Number(p.price || 0).toLocaleString("nb-NO")}
                              </p>
                              {p.ref && (
                                <p className="text-[10px] text-slate-500">Ref. {p.ref}</p>
                              )}
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(`/inventory?id=${encodeURIComponent(p.id)}`, "_blank");
                              }}
                            >
                              Vis
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

            {/* Action bar */}
            <Card>
              <CardContent className="py-4 flex flex-wrap items-center gap-2">
                <Button
                  disabled={pdfSelected.size === 0 || pdfBusy}
                  onClick={async () => {
                    setPdfBusy(true);
                    setPdfStatus(null);
                    try {
                      const res = await fetch("/api/property-pdf/multi", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          propertyIds: Array.from(pdfSelected),
                          brandId: pdfBrand,
                          headline: pdfHeadline || undefined,
                          intro: pdfIntro || undefined,
                        }),
                      });
                      if (!res.ok) {
                        const data = await res.json().catch(() => ({}));
                        throw new Error(data.error || `Feilet (${res.status})`);
                      }
                      const blob = await res.blob();
                      const url = URL.createObjectURL(blob);
                      window.open(url, "_blank");
                      // Free the blob after the new tab has had a moment to load it
                      setTimeout(() => URL.revokeObjectURL(url), 60_000);
                      setPdfStatus(`Generert PDF med ${pdfSelected.size} eiendommer.`);
                    } catch (err) {
                      setPdfStatus(`Feil: ${err instanceof Error ? err.message : "ukjent"}`);
                    } finally {
                      setPdfBusy(false);
                    }
                  }}
                >
                  {pdfBusy ? (
                    <Loader2 size={14} className="mr-1.5 animate-spin" />
                  ) : (
                    <FileText size={14} className="mr-1.5" />
                  )}
                  Generer PDF ({pdfSelected.size})
                </Button>
                <Button
                  variant="outline"
                  disabled={pdfSelected.size === 0 || pdfBusy}
                  onClick={async () => {
                    const to = window.prompt("Send PDF til (e-postadresse):", "");
                    if (!to || !to.trim()) return;
                    setPdfBusy(true);
                    setPdfStatus(null);
                    try {
                      const res = await fetch("/api/property-pdf/multi/send", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          propertyIds: Array.from(pdfSelected),
                          brandId: pdfBrand,
                          to: to.trim(),
                          headline: pdfHeadline || undefined,
                          intro: pdfIntro || undefined,
                        }),
                      });
                      const data = await res.json();
                      if (res.ok && data.success) {
                        setPdfStatus(`Sendt til ${to.trim()} (${data.properties} eiendommer).`);
                      } else {
                        throw new Error(data.error || "Sending feilet");
                      }
                    } catch (err) {
                      setPdfStatus(`Feil: ${err instanceof Error ? err.message : "ukjent"}`);
                    } finally {
                      setPdfBusy(false);
                    }
                  }}
                >
                  <Send size={14} className="mr-1.5" />
                  Send PDF på e-post
                </Button>
                {pdfStatus && (
                  <span className="text-xs text-slate-300 ml-2">{pdfStatus}</span>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
