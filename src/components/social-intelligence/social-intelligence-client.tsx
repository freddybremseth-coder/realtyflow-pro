"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  Database,
  Eye,
  EyeOff,
  FileText,
  GitCompare,
  Layers3,
  Link2,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrendingUp,
  Upload,
  UserRound,
  Users,
  Wand2,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type Locale = "no" | "en";

type BrandProfileForm = {
  professionalName: string | null;
  currentPosition: string | null;
  primaryRole: string;
  secondaryRoles: string[];
  companyName: string | null;
  location: string | null;
  markets: string[];
  geographicAreas: string[];
  industries: string[];
  targetAudiences: string[];
  services: string[];
  expertise: string[];
  languages: Array<"no" | "en" | "es">;
  professionalValues: string[];
  positioningGoal: string | null;
  preferredTones: string[];
  businessGoals: string[];
  excludedTopics: string[];
  publishingFrequency: string | null;
  onboardingStep: number;
  setupCompleted: boolean;
  analysisConsent: boolean;
};

type ScoreItem = {
  label: string;
  score: number | null;
  explanation: string;
  suggestions: string[];
  dataAvailable: boolean;
};

type Dashboard = {
  profile: BrandProfileForm | null;
  rawProfile: { id?: string; last_analyzed_at?: string | null } | null;
  sections: Array<{
    id: string;
    section_type: string;
    current_content: string | null;
    optimized_content: string | null;
    approved_content: string | null;
    analysis_json: {
      strengths?: string[];
      weaknesses?: string[];
      suggestions?: string[];
      rationale?: string;
      keywords?: string[];
      alternatives?: string[];
    };
    score: number | null;
  }>;
  skills: Array<{ id: string; skill_name: string; category: string; source: string | null; relevance_score: number; is_verified: boolean; priority: number; status: string }>;
  pillars: Array<{ id: string; name: string; description: string | null; target_percentage: number; target_audience: string | null; business_goal: string | null }>;
  ideas: Array<{ id: string; title: string; hook: string | null; angle: string | null; description: string | null; pillar_id: string | null; target_audience: string | null; goal: string | null; format: string | null; suggested_cta: string | null; status: string }>;
  posts: Array<{ id: string; title: string | null; content: string; platform: string; language: string; tone: string[]; content_type: string; pillar_id: string | null; goal: string | null; target_audience: string | null; hook_type: string | null; cta_type: string | null; quality_score: number | null; quality_analysis_json: any; status: string; scheduled_at: string | null; published_at: string | null; campaign_id: string | null; created_at: string }>;
  metrics: Array<{ id: string; post_id: string; impressions: number; reactions: number; comments: number; shares: number; saves: number; clicks: number; leads: number; meetings: number; sales: number; recorded_at: string }>;
  recommendations: Array<{ id: string; priority: string; category: string; title: string; description: string; rationale: string | null; status: string; action_type: string | null; evidence_json: Record<string, unknown> }>;
  links: Array<{ id: string; social_entity_type: string; social_entity_id: string; crm_entity_type: string; crm_entity_id: string; relationship_type: string; created_at: string }>;
  knowledgeSources: Array<{
    id: string;
    source_type: string;
    source_name: string;
    source_filename: string | null;
    mime_type: string | null;
    content_hash: string;
    item_count: number;
    status: string;
    visibility: string;
    ai_use_allowed: boolean;
    public_use_allowed: boolean;
    imported_at: string;
    source_metadata_json: Record<string, unknown>;
  }>;
  knowledgeItems: Array<{
    id: string;
    source_id: string | null;
    source_type: string;
    source_name: string;
    source_ref: string | null;
    source_excerpt: string | null;
    category: string;
    subcategory: string | null;
    title: string;
    content: string;
    summary: string | null;
    tags: string[];
    visibility: string;
    verification_status: string;
    confidence: number;
    public_use_allowed: boolean;
    sensitive: boolean;
    allowed_profile_types: string[];
    platforms: string[];
    fact_type: string;
    possible_duplicate_of: string | null;
    conflict_group: string | null;
    conflict_reason: string | null;
    review_notes: string | null;
    created_at: string;
  }>;
  profileGoals: Array<{ id: string; name: string; description: string | null; primary_platform: string; profile_type: string; success_metrics: string[]; priority: number; is_active: boolean }>;
  targetAudiences: Array<{ id: string; name: string; description: string | null; markets: string[]; needs: string[]; objections: string[]; languages: string[]; is_active: boolean }>;
  profileVariants: Array<{ id: string; name: string; profile_type: string; primary_platform: string; goal_id: string | null; audience_id: string | null; tone: string[]; focus_tags: string[]; instructions: string | null; status: string; generated_profile_json: Record<string, unknown>; approved_profile_json: Record<string, unknown>; approved_suggestion_ids: string[]; coverage_json: Record<string, unknown>; last_generated_at: string | null }>;
  profileSuggestions: Array<{ id: string; variant_id: string; field_key: string; label: string; suggested_value_json: unknown; current_value_json: unknown; rationale: string | null; confidence: number; source_knowledge_ids: string[]; source_summary_json: Array<{ id: string; title: string; category: string; sourceName: string; sourceRef: string | null; excerpt: string | null }>; safety_warnings: string[]; status: string; approved_value_json: unknown; created_at: string }>;
  knowledgeSummary: {
    totalItems: number;
    needsReview: number;
    approved: number;
    rejected: number;
    duplicates: number;
    conflicts: number;
    sensitive: number;
    publicApproved: number;
    activeSources: number;
  };
  overviewScores: Record<string, ScoreItem>;
  performance: {
    engagementRate: number | null;
    commentsPerThousand: number | null;
    sharesPerThousand: number | null;
    clickRate: number | null;
    leadConversionRate: number | null;
    followerConversionRate: number | null;
    formulas: Record<string, string>;
    dataWarning: string | null;
  };
  bestPost: { title: string | null; quality_score: number | null; content: string } | null;
  weakestPost: { title: string | null; quality_score: number | null; content: string } | null;
  counts: {
    ideas: number;
    postsLast30Days: number;
    publishedPosts: number;
    scheduledPosts: number;
    recommendations: number;
    knowledgeNeedsReview: number;
    profileSuggestions: number;
  };
};

const text = {
  no: {
    title: "AI Personal Brand",
    subtitle: "LinkedIn-fokusert personlig merkevarebygging koblet til RealtyFlow CRM.",
    overview: "Oversikt",
    brand: "Brand Profile",
    optimizer: "Profile Optimizer",
    knowledge: "Kunnskap",
    sources: "Datakilder",
    builder: "Profilbygger",
    variants: "Varianter",
    strategy: "Content Strategy",
    studio: "Post Studio",
    calendar: "Kalender",
    analytics: "Analytics",
    crm: "CRM",
    recommendations: "Anbefalinger",
    settings: "Innstillinger",
    save: "Lagre",
    analyze: "Analyser profil",
    saveDraft: "Lagre utkast",
    recordMetrics: "Registrer metrics",
    linkCrm: "Koble til CRM",
    notEnough: "Ikke nok data ennå",
  },
  en: {
    title: "AI Personal Brand",
    subtitle: "LinkedIn-focused personal brand workflow connected to RealtyFlow CRM.",
    overview: "Overview",
    brand: "Brand Profile",
    optimizer: "Profile Optimizer",
    knowledge: "Knowledge",
    sources: "Sources",
    builder: "Profile Builder",
    variants: "Variants",
    strategy: "Content Strategy",
    studio: "Post Studio",
    calendar: "Calendar",
    analytics: "Analytics",
    crm: "CRM",
    recommendations: "Recommendations",
    settings: "Settings",
    save: "Save",
    analyze: "Analyze profile",
    saveDraft: "Save draft",
    recordMetrics: "Record metrics",
    linkCrm: "Link to CRM",
    notEnough: "Not enough data yet",
  },
} as const;

const roles = [
  ["real_estate_advisor", "Eiendomsrådgiver"],
  ["real_estate_agent", "Eiendomsmegler"],
  ["property_developer", "Eiendomsutvikler"],
  ["founder", "Gründer"],
  ["consultant", "Konsulent"],
  ["author", "Forfatter"],
  ["leader", "Leder"],
  ["investor", "Investor"],
  ["speaker", "Foredragsholder"],
  ["other", "Annet"],
] as const;

const toneOptions = [
  "professional",
  "authoritative",
  "personal",
  "warm",
  "analytical",
  "educational",
  "direct",
  "exclusive",
  "inspiring",
  "grounded",
];

const emptyProfile: BrandProfileForm = {
  professionalName: "",
  currentPosition: "",
  primaryRole: "real_estate_advisor",
  secondaryRoles: [],
  companyName: "",
  location: "",
  markets: [],
  geographicAreas: [],
  industries: [],
  targetAudiences: [],
  services: [],
  expertise: [],
  languages: ["no"],
  professionalValues: [],
  positioningGoal: "",
  preferredTones: ["professional", "grounded"],
  businessGoals: [],
  excludedTopics: [],
  publishingFrequency: "weekly",
  onboardingStep: 1,
  setupCompleted: false,
  analysisConsent: true,
};

function listToText(value: string[] | null | undefined) {
  return (value || []).join(", ");
}

function textToList(value: string) {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function percent(value: number | null | undefined) {
  if (value === null || value === undefined) return "N/A";
  return `${Math.round(value * 1000) / 10}%`;
}

function numberOrEmpty(value: number | string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function firstWords(value: string, max = 18) {
  const words = value.split(/\s+/).filter(Boolean);
  return words.length > max ? `${words.slice(0, max).join(" ")}...` : value;
}

function valueToText(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item)).join(", ");
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${key}: ${Array.isArray(item) ? item.join(", ") : String(item ?? "")}`)
      .join("\n");
  }
  return String(value ?? "");
}

function badgeVariantForReview(status: string) {
  if (status === "user_confirmed" || status === "document_verified" || status === "approved") return "success" as const;
  if (status === "rejected" || status === "deleted") return "destructive" as const;
  if (status === "conflict" || status === "outdated") return "warning" as const;
  return "outline" as const;
}

function sourceShortHash(hash: string | null | undefined) {
  return hash ? hash.replace("sha256:v1:", "").slice(0, 8) : "ingen hash";
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-slate-200">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "min-h-28 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-500 focus:border-primary-500 focus:ring-1 focus:ring-primary-500",
        props.className,
      )}
    />
  );
}

function ScoreCard({ item, icon: Icon }: { item: ScoreItem; icon: React.ElementType }) {
  const hasScore = typeof item.score === "number";
  return (
    <Card className="min-h-[170px]">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icon size={18} className="text-primary-300" />
            <CardTitle className="text-base">{item.label}</CardTitle>
          </div>
          <span className={cn("text-2xl font-semibold", hasScore ? "text-slate-50" : "text-slate-500")}>
            {hasScore ? item.score : "N/A"}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Progress value={hasScore ? item.score || 0 : 0} className={hasScore ? "" : "opacity-40"} />
        <p className="text-sm leading-6 text-slate-400">{item.explanation}</p>
        {item.suggestions?.[0] ? <p className="text-xs text-amber-300">{item.suggestions[0]}</p> : null}
      </CardContent>
    </Card>
  );
}

function StatusNotice({ type, message }: { type: "error" | "success" | "info"; message: string }) {
  return (
    <div
      className={cn(
        "rounded-lg border px-4 py-3 text-sm",
        type === "error" && "border-red-500/30 bg-red-500/10 text-red-200",
        type === "success" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
        type === "info" && "border-primary-500/30 bg-primary-500/10 text-primary-100",
      )}
    >
      {message}
    </div>
  );
}

export function SocialIntelligenceClient() {
  const [locale, setLocale] = useState<Locale>("no");
  const t = text[locale];
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [profile, setProfile] = useState<BrandProfileForm>(emptyProfile);
  const [profileText, setProfileText] = useState("");
  const [sectionDrafts, setSectionDrafts] = useState<Record<string, string>>({});
  const [postForm, setPostForm] = useState({
    title: "",
    content: "",
    pillarId: "",
    ideaId: "",
    goal: "bygge autoritet",
    targetAudience: "",
    status: "draft",
    scheduledAt: "",
  });
  const [metricsForm, setMetricsForm] = useState({
    postId: "",
    impressions: 0,
    reactions: 0,
    comments: 0,
    shares: 0,
    saves: 0,
    clicks: 0,
    leads: 0,
    meetings: 0,
    sales: 0,
  });
  const [linkForm, setLinkForm] = useState({
    postId: "",
    crmEntityType: "contact",
    crmEntityId: "",
    relationshipType: "attributed_to",
  });
  const [knowledgeImport, setKnowledgeImport] = useState({
    sourceName: "Opplastet masterprofil",
    sourceType: "master_profile",
    filename: "",
    mimeType: "text/markdown",
    text: "",
    aiUseAllowed: true,
    publicUseAllowed: false,
    visibility: "internal",
  });
  const [goalForm, setGoalForm] = useState({
    id: "",
    name: "Bygge profesjonell LinkedIn-profil",
    description: "Tydelig personlig profil med offentlig godkjente fakta og kildebevis.",
    primaryPlatform: "linkedin",
    profileType: "linkedin",
    successMetrics: "profilvisninger, relevante henvendelser, tillit",
    priority: 2,
    isActive: true,
  });
  const [audienceForm, setAudienceForm] = useState({
    id: "",
    name: "Skandinaviske boligkjøpere i Spania",
    description: "Personer som vurderer kjøp, rådgivning eller nybygg i Spania.",
    markets: "Spania, Costa Blanca",
    needs: "trygg prosess, lokal kunnskap, tydelige vurderinger",
    objections: "usikkerhet, språk, risiko, finansiering",
    languages: ["no"] as string[],
    isActive: true,
  });
  const [variantForm, setVariantForm] = useState({
    id: "",
    name: "LinkedIn hovedprofil",
    profileType: "linkedin",
    primaryPlatform: "linkedin",
    goalId: "",
    audienceId: "",
    tone: "professional, warm, grounded",
    focusTags: "real_estate, ai_crm, consultant",
    instructions: "Bruk bare godkjente offentlige fakta. Hold private og sensitive opplysninger utenfor profiltekst.",
    status: "draft",
  });
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "error" | "success" | "info"; text: string } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/social-intelligence", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message || payload?.error || "Kunne ikke hente Social Intelligence.");
      setDashboard(payload.dashboard);
      setProfile(payload.dashboard?.profile || emptyProfile);
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Kunne ikke hente modulen." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const drafts: Record<string, string> = {};
    for (const section of dashboard?.sections || []) {
      drafts[section.id] = section.approved_content || section.optimized_content || section.current_content || "";
    }
    setSectionDrafts(drafts);
    const firstPost = dashboard?.posts?.[0];
    if (firstPost) {
      setMetricsForm((current) => current.postId ? current : { ...current, postId: firstPost.id });
      setLinkForm((current) => current.postId ? current : { ...current, postId: firstPost.id });
    }
    const firstGoal = dashboard?.profileGoals?.[0];
    const firstAudience = dashboard?.targetAudiences?.[0];
    const firstVariant = dashboard?.profileVariants?.[0];
    if (firstGoal) setGoalForm((current) => current.id ? current : {
      id: firstGoal.id,
      name: firstGoal.name,
      description: firstGoal.description || "",
      primaryPlatform: firstGoal.primary_platform,
      profileType: firstGoal.profile_type,
      successMetrics: listToText(firstGoal.success_metrics),
      priority: firstGoal.priority,
      isActive: firstGoal.is_active,
    });
    if (firstAudience) setAudienceForm((current) => current.id ? current : {
      id: firstAudience.id,
      name: firstAudience.name,
      description: firstAudience.description || "",
      markets: listToText(firstAudience.markets),
      needs: listToText(firstAudience.needs),
      objections: listToText(firstAudience.objections),
      languages: firstAudience.languages || ["no"],
      isActive: firstAudience.is_active,
    });
    if (firstVariant) setVariantForm((current) => current.id ? current : {
      id: firstVariant.id,
      name: firstVariant.name,
      profileType: firstVariant.profile_type,
      primaryPlatform: firstVariant.primary_platform,
      goalId: firstVariant.goal_id || firstGoal?.id || "",
      audienceId: firstVariant.audience_id || firstAudience?.id || "",
      tone: listToText(firstVariant.tone),
      focusTags: listToText(firstVariant.focus_tags),
      instructions: firstVariant.instructions || "",
      status: firstVariant.status,
    });
  }, [dashboard]);

  const callAction = async (action: Record<string, unknown>, success: string) => {
    setWorking(String(action.action || "action"));
    setMessage(null);
    try {
      const response = await fetch("/api/social-intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message || payload?.error || "Handlingen feilet.");
      if (payload.dashboard) {
        setDashboard(payload.dashboard);
        setProfile(payload.dashboard.profile || profile);
      }
      if (payload.analysis) {
        setMessage({ type: "success", text: `${success} ${payload.analysis.aiUsed ? "AI-analyse brukt." : "Regelbasert fallback brukt."}` });
      } else {
        setMessage({ type: "success", text: success });
      }
      return payload;
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Handlingen feilet." });
      return null;
    } finally {
      setWorking(null);
    }
  };

  const saveProfile = () => callAction({ action: "save_profile", profile }, "Brand Profile er lagret.");
  const analyze = () =>
    callAction(
      {
        action: "analyze_profile",
        payload: {
          profile: { ...profile, setupCompleted: true, onboardingStep: 6 },
          import: { platform: "linkedin", importType: "manual_text", reviewedText: profileText },
          locale,
        },
      },
      "Profilanalysen er lagret.",
    );

  const selectedIdea = useMemo(
    () => dashboard?.ideas.find((idea) => idea.id === postForm.ideaId) || null,
    [dashboard?.ideas, postForm.ideaId],
  );
  const sourceById = useMemo(
    () => new Map((dashboard?.knowledgeSources || []).map((source) => [source.id, source])),
    [dashboard?.knowledgeSources],
  );
  const activeVariant = useMemo(
    () => dashboard?.profileVariants.find((variant) => variant.id === variantForm.id) || dashboard?.profileVariants[0] || null,
    [dashboard?.profileVariants, variantForm.id],
  );
  const activeVariantSuggestions = useMemo(
    () => (dashboard?.profileSuggestions || []).filter((suggestion) => suggestion.variant_id === activeVariant?.id),
    [dashboard?.profileSuggestions, activeVariant?.id],
  );

  const seedPostFromIdea = () => {
    const idea = selectedIdea || dashboard?.ideas[0];
    if (!idea) return;
    setPostForm((current) => ({
      ...current,
      ideaId: idea.id,
      title: idea.title,
      pillarId: idea.pillar_id || current.pillarId,
      goal: idea.goal || current.goal,
      targetAudience: idea.target_audience || current.targetAudience,
      content: [
        idea.hook || idea.title,
        "",
        idea.description || "Del en konkret observasjon fra egen arbeidshverdag og knytt den til et praktisk råd.",
        "",
        "Dette er ikke ment som en snarvei til store påstander. Det er et forsøk på å gjøre vurderingen tydeligere, mer etterprøvbar og mer nyttig.",
        "",
        idea.suggested_cta || "Hva ville du lagt til?",
      ].join("\n"),
    }));
  };

  const savePost = () =>
    callAction(
      {
        action: "save_post",
        post: {
          title: postForm.title,
          content: postForm.content,
          platform: "linkedin",
          language: locale,
          tone: profile.preferredTones,
          contentType: "linkedin_post",
          pillarId: postForm.pillarId || null,
          goal: postForm.goal,
          targetAudience: postForm.targetAudience,
          hookType: selectedIdea?.angle || null,
          ctaType: "conversation",
          status: postForm.status,
          scheduledAt: postForm.scheduledAt ? new Date(postForm.scheduledAt).toISOString() : null,
        },
      },
      "Innlegg er lagret med forklarbar kvalitetsscore.",
    );

  const markPostPublished = (post: Dashboard["posts"][number]) =>
    callAction(
      {
        action: "save_post",
        post: {
          id: post.id,
          title: post.title,
          content: post.content,
          platform: post.platform,
          language: post.language,
          tone: post.tone || [],
          contentType: post.content_type,
          pillarId: post.pillar_id,
          goal: post.goal,
          targetAudience: post.target_audience,
          hookType: post.hook_type,
          ctaType: post.cta_type,
          status: "published",
          scheduledAt: post.scheduled_at,
          publishedAt: new Date().toISOString(),
          campaignId: post.campaign_id,
        },
      },
      "Innlegg er merket som publisert.",
    );

  const saveMetrics = () =>
    callAction(
      {
        action: "save_metrics",
        metrics: {
          postId: metricsForm.postId,
          impressions: numberOrEmpty(metricsForm.impressions),
          reactions: numberOrEmpty(metricsForm.reactions),
          comments: numberOrEmpty(metricsForm.comments),
          shares: numberOrEmpty(metricsForm.shares),
          saves: numberOrEmpty(metricsForm.saves),
          clicks: numberOrEmpty(metricsForm.clicks),
          leads: numberOrEmpty(metricsForm.leads),
          meetings: numberOrEmpty(metricsForm.meetings),
          sales: numberOrEmpty(metricsForm.sales),
          profileViews: 0,
          followersGained: 0,
          messages: 0,
          notes: null,
        },
      },
      "Metrics er registrert.",
    );

  const saveCrmLink = () =>
    callAction(
      {
        action: "link_entity",
        link: {
          socialEntityType: "post",
          socialEntityId: linkForm.postId,
          crmEntityType: linkForm.crmEntityType,
          crmEntityId: linkForm.crmEntityId,
          relationshipType: linkForm.relationshipType,
        },
      },
      "CRM-koblingen er lagret.",
    );

  const readKnowledgeFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    setKnowledgeImport((current) => ({
      ...current,
      filename: file.name,
      mimeType: file.type || (file.name.endsWith(".md") ? "text/markdown" : "text/plain"),
      sourceName: current.sourceName || file.name,
      sourceType: file.name.endsWith(".md") ? "uploaded_markdown" : "uploaded_text",
      text,
    }));
  };

  const importKnowledge = () =>
    callAction(
      {
        action: "import_knowledge_file",
        import: knowledgeImport,
      },
      "Kunnskapskilden er importert. Elementene ligger klare til gjennomgang.",
    );

  const reviewKnowledgeItem = (
    item: Dashboard["knowledgeItems"][number],
    verificationStatus: string,
    publicUseAllowed: boolean,
  ) =>
    callAction(
      {
        action: "update_knowledge_item",
        item: {
          id: item.id,
          verificationStatus,
          publicUseAllowed,
          visibility: publicUseAllowed ? "public_approved" : item.sensitive ? "private" : "internal",
        },
      },
      publicUseAllowed ? "Elementet er godkjent for offentlig profilbruk." : verificationStatus === "rejected" ? "Elementet er avvist." : "Elementet er godkjent internt.",
    );

  const updateKnowledgeSourceSetting = (id: string, source: Record<string, unknown>) =>
    callAction({ action: "update_knowledge_source", source: { id, ...source } }, "Datakilden er oppdatert.");

  const saveGoal = () =>
    callAction(
      {
        action: "save_profile_goal",
        goal: {
          id: goalForm.id || undefined,
          name: goalForm.name,
          description: goalForm.description,
          primaryPlatform: goalForm.primaryPlatform,
          profileType: goalForm.profileType,
          successMetrics: textToList(goalForm.successMetrics),
          priority: goalForm.priority,
          isActive: goalForm.isActive,
        },
      },
      "Profilmålet er lagret.",
    );

  const saveAudience = () =>
    callAction(
      {
        action: "save_target_audience",
        audience: {
          id: audienceForm.id || undefined,
          name: audienceForm.name,
          description: audienceForm.description,
          markets: textToList(audienceForm.markets),
          needs: textToList(audienceForm.needs),
          objections: textToList(audienceForm.objections),
          languages: audienceForm.languages,
          isActive: audienceForm.isActive,
        },
      },
      "Målgruppen er lagret.",
    );

  const saveVariant = () =>
    callAction(
      {
        action: "save_profile_variant",
        variant: {
          id: variantForm.id || undefined,
          name: variantForm.name,
          profileType: variantForm.profileType,
          primaryPlatform: variantForm.primaryPlatform,
          goalId: variantForm.goalId || null,
          audienceId: variantForm.audienceId || null,
          tone: textToList(variantForm.tone),
          focusTags: textToList(variantForm.focusTags),
          instructions: variantForm.instructions,
          status: variantForm.status,
        },
      },
      "Profilvarianten er lagret.",
    );

  const generateSuggestions = async () => {
    const variantPayload = await saveVariant();
    const variantId = variantPayload?.variant?.id || variantForm.id || activeVariant?.id;
    if (!variantId) return;
    setVariantForm((current) => ({ ...current, id: variantId }));
    await callAction(
      { action: "generate_profile_suggestions", payload: { variantId } },
      "Profilforslagene er bygget fra godkjente kilder.",
    );
  };

  const decideSuggestion = (id: string, status: "approved" | "rejected", approvedValue?: unknown) =>
    callAction(
      {
        action: "decide_profile_suggestion",
        decision: {
          id,
          status,
          approvedValue,
        },
      },
      status === "approved" ? "Profilforslaget er godkjent og versjonert." : "Profilforslaget er avvist.",
    );

  const scoreIcons = [Sparkles, UserRound, TrendingUp, FileText, CalendarDays, Target, BarChart3, Link2];
  const overviewScoreItems = dashboard?.overviewScores
    ? [
        dashboard.overviewScores.personalBrandScore,
        dashboard.overviewScores.profileScore,
        dashboard.overviewScores.authorityScore,
        dashboard.overviewScores.contentScore,
        dashboard.overviewScores.consistencyScore,
        dashboard.overviewScores.networkScore,
        dashboard.overviewScores.engagementScore,
        dashboard.overviewScores.leadPotentialScore,
      ].filter(Boolean)
    : [];

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-800/70 px-5 py-4 text-slate-200">
          <Loader2 className="animate-spin text-primary-300" size={18} />
          Laster Social Intelligence
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary-500/15 text-primary-300">
              <Sparkles size={22} />
            </div>
            <div>
              <h1 className="text-3xl font-semibold text-slate-50">{t.title}</h1>
              <p className="text-sm text-slate-400">{t.subtitle}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="default">LinkedIn MVP</Badge>
            <Badge variant="outline">Server-side AI</Badge>
            <Badge variant="outline">CRM attribution</Badge>
            <Badge variant={dashboard?.knowledgeSummary?.needsReview ? "warning" : "outline"}>
              {dashboard?.knowledgeSummary?.needsReview || 0} til gjennomgang
            </Badge>
            <Badge variant={dashboard?.knowledgeSummary?.publicApproved ? "success" : "outline"}>
              {dashboard?.knowledgeSummary?.publicApproved || 0} offentlige fakta
            </Badge>
            {dashboard?.rawProfile?.last_analyzed_at ? <Badge variant="success">Analysert</Badge> : <Badge variant="warning">Onboarding</Badge>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={locale}
            onChange={(event) => setLocale(event.target.value as Locale)}
            className="h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100 outline-none"
          >
            <option value="no">Norsk</option>
            <option value="en">English</option>
          </select>
          <Button variant="outline" onClick={() => void refresh()}>
            <RefreshCw size={16} className="mr-2" />
            Oppdater
          </Button>
        </div>
      </div>

      {message ? <StatusNotice type={message.type} message={message.text} /> : null}

      <Tabs defaultValue="overview">
        <div className="overflow-x-auto pb-1">
          <TabsList className="min-w-max">
            <TabsTrigger value="overview">{t.overview}</TabsTrigger>
            <TabsTrigger value="brand">{t.brand}</TabsTrigger>
            <TabsTrigger value="optimizer">{t.optimizer}</TabsTrigger>
            <TabsTrigger value="knowledge">{t.knowledge}</TabsTrigger>
            <TabsTrigger value="sources">{t.sources}</TabsTrigger>
            <TabsTrigger value="builder">{t.builder}</TabsTrigger>
            <TabsTrigger value="variants">{t.variants}</TabsTrigger>
            <TabsTrigger value="strategy">{t.strategy}</TabsTrigger>
            <TabsTrigger value="studio">{t.studio}</TabsTrigger>
            <TabsTrigger value="calendar">{t.calendar}</TabsTrigger>
            <TabsTrigger value="analytics">{t.analytics}</TabsTrigger>
            <TabsTrigger value="crm">{t.crm}</TabsTrigger>
            <TabsTrigger value="recommendations">{t.recommendations}</TabsTrigger>
            <TabsTrigger value="settings">{t.settings}</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {overviewScoreItems.map((item, index) => (
              <ScoreCard key={item.label} item={item} icon={scoreIcons[index] || Sparkles} />
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Prioritet akkurat nå</CardTitle>
                <CardDescription>Basert på lagrede data og åpne anbefalinger.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {dashboard?.recommendations?.[0] ? (
                  <div className="rounded-lg border border-primary-500/20 bg-primary-500/10 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={dashboard.recommendations[0].priority === "critical" ? "destructive" : "default"}>
                        {dashboard.recommendations[0].priority.replace("_", " ")}
                      </Badge>
                      <h3 className="text-lg font-semibold text-slate-100">{dashboard.recommendations[0].title}</h3>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{dashboard.recommendations[0].description}</p>
                    {dashboard.recommendations[0].rationale ? <p className="mt-2 text-xs text-slate-500">{dashboard.recommendations[0].rationale}</p> : null}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">Ingen åpne anbefalinger ennå. Kjør første profilanalysen for å fylle denne listen.</p>
                )}
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg bg-slate-900/60 p-3">
                    <p className="text-xs text-slate-500">Innholdsideer</p>
                    <p className="text-2xl font-semibold text-slate-50">{dashboard?.counts.ideas || 0}</p>
                  </div>
                  <div className="rounded-lg bg-slate-900/60 p-3">
                    <p className="text-xs text-slate-500">Innlegg siste 30 dager</p>
                    <p className="text-2xl font-semibold text-slate-50">{dashboard?.counts.postsLast30Days || 0}</p>
                  </div>
                  <div className="rounded-lg bg-slate-900/60 p-3">
                    <p className="text-xs text-slate-500">Engagement rate</p>
                    <p className="text-2xl font-semibold text-slate-50">{percent(dashboard?.performance.engagementRate)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Neste innlegg</CardTitle>
                <CardDescription>Manuell publisering i MVP.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {dashboard?.posts.find((post) => post.status === "scheduled") ? (
                  <div className="space-y-2 text-sm">
                    <p className="font-medium text-slate-100">{dashboard.posts.find((post) => post.status === "scheduled")?.title || "Planlagt innlegg"}</p>
                    <p className="text-slate-400">{dashboard.posts.find((post) => post.status === "scheduled")?.scheduled_at?.slice(0, 16).replace("T", " ")}</p>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">Ingen planlagt publisering ennå.</p>
                )}
                <div className="rounded-lg border border-slate-700/70 p-3 text-sm">
                  <p className="text-slate-500">Beste innlegg</p>
                  <p className="mt-1 text-slate-100">{dashboard?.bestPost ? firstWords(dashboard.bestPost.title || dashboard.bestPost.content) : t.notEnough}</p>
                </div>
                <div className="rounded-lg border border-slate-700/70 p-3 text-sm">
                  <p className="text-slate-500">Svakeste innlegg</p>
                  <p className="mt-1 text-slate-100">{dashboard?.weakestPost ? firstWords(dashboard.weakestPost.title || dashboard.weakestPost.content) : t.notEnough}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="brand" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Onboarding</CardTitle>
              <CardDescription>Mål, profil, import, merkevare, strategi og første analyse.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <Progress value={(profile.onboardingStep / 6) * 100} />
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Field label="Profesjonelt navn">
                  <Input value={profile.professionalName || ""} onChange={(event) => setProfile({ ...profile, professionalName: event.target.value })} />
                </Field>
                <Field label="Nåværende stilling">
                  <Input value={profile.currentPosition || ""} onChange={(event) => setProfile({ ...profile, currentPosition: event.target.value })} />
                </Field>
                <Field label="Primær rolle">
                  <select value={profile.primaryRole} onChange={(event) => setProfile({ ...profile, primaryRole: event.target.value })} className="h-10 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100">
                    {roles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </Field>
                <Field label="Selskap">
                  <Input value={profile.companyName || ""} onChange={(event) => setProfile({ ...profile, companyName: event.target.value })} />
                </Field>
                <Field label="Lokasjon">
                  <Input value={profile.location || ""} onChange={(event) => setProfile({ ...profile, location: event.target.value })} />
                </Field>
                <Field label="Publiseringsfrekvens">
                  <Input value={profile.publishingFrequency || ""} onChange={(event) => setProfile({ ...profile, publishingFrequency: event.target.value })} placeholder="weekly, 2x per week..." />
                </Field>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Field label="Målgrupper" hint="Kommaseparert">
                  <TextArea value={listToText(profile.targetAudiences)} onChange={(event) => setProfile({ ...profile, targetAudiences: textToList(event.target.value) })} />
                </Field>
                <Field label="Tjenester">
                  <TextArea value={listToText(profile.services)} onChange={(event) => setProfile({ ...profile, services: textToList(event.target.value) })} />
                </Field>
                <Field label="Ekspertområder">
                  <TextArea value={listToText(profile.expertise)} onChange={(event) => setProfile({ ...profile, expertise: textToList(event.target.value) })} />
                </Field>
                <Field label="Markeder og geografiske områder">
                  <TextArea value={listToText([...profile.markets, ...profile.geographicAreas])} onChange={(event) => setProfile({ ...profile, markets: textToList(event.target.value), geographicAreas: textToList(event.target.value) })} />
                </Field>
                <Field label="Ønsket posisjonering">
                  <TextArea value={profile.positioningGoal || ""} onChange={(event) => setProfile({ ...profile, positioningGoal: event.target.value })} />
                </Field>
                <Field label="Temaer som bør unngås">
                  <TextArea value={listToText(profile.excludedTopics)} onChange={(event) => setProfile({ ...profile, excludedTopics: textToList(event.target.value) })} />
                </Field>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-200">Tone</p>
                <div className="flex flex-wrap gap-2">
                  {toneOptions.map((tone) => {
                    const selected = profile.preferredTones.includes(tone);
                    return (
                      <button
                        key={tone}
                        onClick={() => setProfile({
                          ...profile,
                          preferredTones: selected ? profile.preferredTones.filter((item) => item !== tone) : [...profile.preferredTones, tone],
                        })}
                        className={cn("rounded-lg border px-3 py-2 text-sm", selected ? "border-primary-400 bg-primary-500/20 text-primary-100" : "border-slate-700 text-slate-400 hover:text-slate-100")}
                      >
                        {tone}
                      </button>
                    );
                  })}
                </div>
              </div>
              <Button onClick={() => void saveProfile()} disabled={Boolean(working)}>
                {working === "save_profile" ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Save size={16} className="mr-2" />}
                {t.save}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="optimizer" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>LinkedIn profilimport</CardTitle>
              <CardDescription>Lim inn profiltekst. Ingen scraping brukes i MVP.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <TextArea
                className="min-h-52"
                value={profileText}
                onChange={(event) => setProfileText(event.target.value)}
                placeholder="Lim inn headline, About, experience og skills fra LinkedIn..."
              />
              <Button onClick={() => void analyze()} disabled={Boolean(working) || profileText.trim().length < 12}>
                {working === "analyze_profile" ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Wand2 size={16} className="mr-2" />}
                {t.analyze}
              </Button>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {dashboard?.sections.map((section) => (
              <Card key={section.id}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="capitalize">{section.section_type.replace("_", " ")}</CardTitle>
                    <Badge variant={section.approved_content ? "success" : "outline"}>{section.score ?? "N/A"}</Badge>
                  </div>
                  <CardDescription>{section.analysis_json?.rationale || "Analyse lagret strukturert."}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {section.current_content ? (
                    <div className="rounded-lg bg-slate-900/50 p-3 text-sm text-slate-400">
                      <p className="mb-1 text-xs text-slate-500">Nåværende innhold</p>
                      {firstWords(section.current_content, 55)}
                    </div>
                  ) : null}
                  <TextArea
                    className="min-h-44"
                    value={sectionDrafts[section.id] || ""}
                    onChange={(event) => setSectionDrafts({ ...sectionDrafts, [section.id]: event.target.value })}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => void callAction({ action: "accept_section", section: { id: section.id, approvedContent: sectionDrafts[section.id] || "" } }, "Seksjonen er godkjent og versjonert.")}
                      disabled={Boolean(working) || !sectionDrafts[section.id]?.trim()}
                    >
                      <CheckCircle2 size={14} className="mr-2" />
                      Accept
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setSectionDrafts({ ...sectionDrafts, [section.id]: (sectionDrafts[section.id] || "").split(/\s+/).slice(0, 55).join(" ") })}>
                      Make shorter
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setSectionDrafts({ ...sectionDrafts, [section.id]: `${sectionDrafts[section.id] || ""}\n\nNøkkelord: ${(section.analysis_json?.keywords || []).slice(0, 5).join(", ")}`.trim() })}>
                      Add keywords
                    </Button>
                  </div>
                  <div className="space-y-1 text-xs text-slate-500">
                    {(section.analysis_json?.suggestions || []).slice(0, 3).map((suggestion) => <p key={suggestion}>{suggestion}</p>)}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="knowledge" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            {[
              { label: "Elementer", count: dashboard?.knowledgeSummary?.totalItems || 0, icon: BookOpen },
              { label: "Må vurderes", count: dashboard?.knowledgeSummary?.needsReview || 0, icon: AlertTriangle },
              { label: "Mulige duplikater", count: dashboard?.knowledgeSummary?.duplicates || 0, icon: GitCompare },
              { label: "Sensitive", count: dashboard?.knowledgeSummary?.sensitive || 0, icon: ShieldCheck },
            ].map(({ label, count, icon: Icon }) => (
              <Card key={label}>
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <p className="text-xs text-slate-500">{label}</p>
                    <p className="text-2xl font-semibold text-slate-50">{count}</p>
                  </div>
                  <Icon className="text-primary-300" size={22} />
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Importer kunnskap</CardTitle>
              <CardDescription>MD/TXT støttes i denne versjonen. Innholdet behandles som brukeropplastet data.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Kildenavn">
                  <Input value={knowledgeImport.sourceName} onChange={(event) => setKnowledgeImport({ ...knowledgeImport, sourceName: event.target.value })} />
                </Field>
                <Field label="Kildetype">
                  <select value={knowledgeImport.sourceType} onChange={(event) => setKnowledgeImport({ ...knowledgeImport, sourceType: event.target.value })} className="h-10 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100">
                    {["master_profile", "uploaded_markdown", "uploaded_text", "manual_note", "linkedin_profile", "website", "company_profile", "crm_profile", "other"].map((type) => (
                      <option key={type} value={type}>{type.replace("_", " ")}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Fil">
                  <Input type="file" accept=".md,.txt,text/markdown,text/plain" onChange={(event) => void readKnowledgeFile(event.target.files?.[0])} />
                </Field>
              </div>
              <div className="flex flex-wrap gap-3 text-sm text-slate-300">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={knowledgeImport.aiUseAllowed} onChange={(event) => setKnowledgeImport({ ...knowledgeImport, aiUseAllowed: event.target.checked })} />
                  Kan brukes av profilbyggeren
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={knowledgeImport.publicUseAllowed} onChange={(event) => setKnowledgeImport({ ...knowledgeImport, publicUseAllowed: event.target.checked })} />
                  Ikke-sensitive elementer kan foreslås offentlig etter godkjenning
                </label>
              </div>
              <TextArea
                className="min-h-56"
                value={knowledgeImport.text}
                onChange={(event) => setKnowledgeImport({ ...knowledgeImport, text: event.target.value })}
                placeholder="Lim inn markdown eller tekst hvis du ikke velger fil..."
              />
              <Button onClick={() => void importKnowledge()} disabled={Boolean(working) || knowledgeImport.text.trim().length < 20}>
                {working === "import_knowledge_file" ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Upload size={16} className="mr-2" />}
                Importer kunnskap
              </Button>
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            {(dashboard?.knowledgeItems || [])
              .slice()
              .sort((a, b) => (a.verification_status === "needs_review" ? -1 : 1) - (b.verification_status === "needs_review" ? -1 : 1))
              .slice(0, 80)
              .map((item) => {
                const source = item.source_id ? sourceById.get(item.source_id) : null;
                return (
                  <Card key={item.id}>
                    <CardHeader>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-2">
                          <CardTitle className="text-base">{item.title}</CardTitle>
                          <div className="flex flex-wrap gap-2">
                            <Badge variant={badgeVariantForReview(item.verification_status)}>{item.verification_status.replace("_", " ")}</Badge>
                            <Badge variant="outline">{item.category}</Badge>
                            {item.sensitive ? <Badge variant="destructive">sensitiv</Badge> : null}
                            {item.public_use_allowed ? <Badge variant="success">offentlig tillatt</Badge> : null}
                            {item.possible_duplicate_of ? <Badge variant="warning">mulig duplikat</Badge> : null}
                            {item.conflict_group ? <Badge variant="warning">mulig konflikt</Badge> : null}
                          </div>
                        </div>
                        <span className="text-xs text-slate-500">{Math.round(Number(item.confidence || 0) * 100)}%</span>
                      </div>
                      <CardDescription>
                        {source?.source_name || item.source_name} · {item.source_ref || "kilde"} · {sourceShortHash(source?.content_hash)}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-sm leading-6 text-slate-300">{firstWords(item.content, 70)}</p>
                      {item.review_notes || item.conflict_reason ? (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                          {item.review_notes || item.conflict_reason}
                        </div>
                      ) : null}
                      {item.tags?.length ? <p className="text-xs text-slate-500">Tags: {item.tags.join(", ")}</p> : null}
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => void reviewKnowledgeItem(item, "user_confirmed", false)} disabled={Boolean(working)}>
                          <Check size={14} className="mr-2" />
                          Godkjenn internt
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => void reviewKnowledgeItem(item, "user_confirmed", true)} disabled={Boolean(working) || item.sensitive}>
                          <Eye size={14} className="mr-2" />
                          Godkjenn offentlig
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => void reviewKnowledgeItem(item, "rejected", false)} disabled={Boolean(working)}>
                          <XCircle size={14} className="mr-2" />
                          Avvis
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
          </div>
        </TabsContent>

        <TabsContent value="sources" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Datakilder</CardTitle>
              <CardDescription>Velg hvilke kilder profilbyggeren kan bruke. Offentlig profiltekst krever også godkjente elementer.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
              {dashboard?.knowledgeSources.length ? dashboard.knowledgeSources.map((source) => (
                <div key={source.id} className="rounded-lg border border-slate-700/70 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-slate-100">{source.source_name}</h3>
                      <p className="mt-1 text-sm text-slate-500">{source.source_type.replace("_", " ")} · {source.source_filename || "tekst"} · {sourceShortHash(source.content_hash)}</p>
                    </div>
                    <Badge variant={source.status === "active" ? "success" : "outline"}>{source.status}</Badge>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg bg-slate-900/60 p-3">
                      <p className="text-xs text-slate-500">Elementer</p>
                      <p className="text-xl font-semibold text-slate-50">{source.item_count}</p>
                    </div>
                    <div className="rounded-lg bg-slate-900/60 p-3">
                      <p className="text-xs text-slate-500">AI-bruk</p>
                      <p className="text-sm text-slate-100">{source.ai_use_allowed ? "Tillatt" : "Av"}</p>
                    </div>
                    <div className="rounded-lg bg-slate-900/60 p-3">
                      <p className="text-xs text-slate-500">Offentlig</p>
                      <p className="text-sm text-slate-100">{source.public_use_allowed ? "Kandidat" : "Av"}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => void updateKnowledgeSourceSetting(source.id, { aiUseAllowed: !source.ai_use_allowed })}>
                      {source.ai_use_allowed ? <EyeOff size={14} className="mr-2" /> : <Eye size={14} className="mr-2" />}
                      {source.ai_use_allowed ? "Slå av AI-bruk" : "Bruk i profilbygger"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void updateKnowledgeSourceSetting(source.id, { publicUseAllowed: !source.public_use_allowed })}>
                      <ShieldCheck size={14} className="mr-2" />
                      {source.public_use_allowed ? "Fjern offentlig kandidat" : "Tillat offentlige kandidater"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void updateKnowledgeSourceSetting(source.id, { status: source.status === "active" ? "disabled" : "active" })}>
                      <Database size={14} className="mr-2" />
                      {source.status === "active" ? "Deaktiver" : "Aktiver"}
                    </Button>
                  </div>
                </div>
              )) : <p className="text-sm text-slate-400">Ingen datakilder importert ennå.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="builder" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Profilmål</CardTitle>
                <CardDescription>Hva profilen skal oppnå.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Field label="Navn">
                  <Input value={goalForm.name} onChange={(event) => setGoalForm({ ...goalForm, name: event.target.value })} />
                </Field>
                <Field label="Beskrivelse">
                  <TextArea value={goalForm.description} onChange={(event) => setGoalForm({ ...goalForm, description: event.target.value })} />
                </Field>
                <Field label="Suksessmål">
                  <Input value={goalForm.successMetrics} onChange={(event) => setGoalForm({ ...goalForm, successMetrics: event.target.value })} />
                </Field>
                <Button size="sm" onClick={() => void saveGoal()} disabled={Boolean(working)}>
                  <Save size={14} className="mr-2" />
                  Lagre mål
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Målgruppe</CardTitle>
                <CardDescription>Hvem profilen skal treffe.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Field label="Navn">
                  <Input value={audienceForm.name} onChange={(event) => setAudienceForm({ ...audienceForm, name: event.target.value })} />
                </Field>
                <Field label="Beskrivelse">
                  <TextArea value={audienceForm.description} onChange={(event) => setAudienceForm({ ...audienceForm, description: event.target.value })} />
                </Field>
                <Field label="Markeder">
                  <Input value={audienceForm.markets} onChange={(event) => setAudienceForm({ ...audienceForm, markets: event.target.value })} />
                </Field>
                <Field label="Behov">
                  <Input value={audienceForm.needs} onChange={(event) => setAudienceForm({ ...audienceForm, needs: event.target.value })} />
                </Field>
                <Button size="sm" onClick={() => void saveAudience()} disabled={Boolean(working)}>
                  <Users size={14} className="mr-2" />
                  Lagre målgruppe
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Profilvariant</CardTitle>
                <CardDescription>Velg retning før forslag bygges.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Field label="Eksisterende variant">
                  <select value={variantForm.id} onChange={(event) => {
                    const variant = dashboard?.profileVariants.find((item) => item.id === event.target.value);
                    if (!variant) {
                      setVariantForm({ ...variantForm, id: "" });
                      return;
                    }
                    setVariantForm({
                      id: variant.id,
                      name: variant.name,
                      profileType: variant.profile_type,
                      primaryPlatform: variant.primary_platform,
                      goalId: variant.goal_id || "",
                      audienceId: variant.audience_id || "",
                      tone: listToText(variant.tone),
                      focusTags: listToText(variant.focus_tags),
                      instructions: variant.instructions || "",
                      status: variant.status,
                    });
                  }} className="h-10 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100">
                    <option value="">Ny variant</option>
                    {dashboard?.profileVariants.map((variant) => <option key={variant.id} value={variant.id}>{variant.name}</option>)}
                  </select>
                </Field>
                <Field label="Navn">
                  <Input value={variantForm.name} onChange={(event) => setVariantForm({ ...variantForm, name: event.target.value })} />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Type">
                    <select value={variantForm.profileType} onChange={(event) => setVariantForm({ ...variantForm, profileType: event.target.value })} className="h-10 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100">
                      {["linkedin", "real_estate", "ai_crm", "author", "speaker", "consultant", "website_bio", "general"].map((type) => <option key={type} value={type}>{type.replace("_", " ")}</option>)}
                    </select>
                  </Field>
                  <Field label="Plattform">
                    <select value={variantForm.primaryPlatform} onChange={(event) => setVariantForm({ ...variantForm, primaryPlatform: event.target.value })} className="h-10 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100">
                      {["linkedin", "newsletter", "blog", "facebook", "instagram", "youtube", "other"].map((platform) => <option key={platform} value={platform}>{platform}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="Mål">
                  <select value={variantForm.goalId} onChange={(event) => setVariantForm({ ...variantForm, goalId: event.target.value })} className="h-10 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100">
                    <option value="">Ingen</option>
                    {dashboard?.profileGoals.map((goal) => <option key={goal.id} value={goal.id}>{goal.name}</option>)}
                  </select>
                </Field>
                <Field label="Målgruppe">
                  <select value={variantForm.audienceId} onChange={(event) => setVariantForm({ ...variantForm, audienceId: event.target.value })} className="h-10 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100">
                    <option value="">Ingen</option>
                    {dashboard?.targetAudiences.map((audience) => <option key={audience.id} value={audience.id}>{audience.name}</option>)}
                  </select>
                </Field>
                <Field label="Fokus-tags">
                  <Input value={variantForm.focusTags} onChange={(event) => setVariantForm({ ...variantForm, focusTags: event.target.value })} />
                </Field>
                <Field label="Instruks">
                  <TextArea value={variantForm.instructions} onChange={(event) => setVariantForm({ ...variantForm, instructions: event.target.value })} />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => void saveVariant()} disabled={Boolean(working)}>
                    <Save size={14} className="mr-2" />
                    Lagre variant
                  </Button>
                  <Button size="sm" onClick={() => void generateSuggestions()} disabled={Boolean(working)}>
                    {working === "generate_profile_suggestions" ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Sparkles size={14} className="mr-2" />}
                    Bygg profil med AI
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {activeVariantSuggestions.length ? activeVariantSuggestions.map((suggestion) => (
              <Card key={suggestion.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">{suggestion.label}</CardTitle>
                      <CardDescription>{suggestion.rationale || "Forslag fra godkjente kilder."}</CardDescription>
                    </div>
                    <Badge variant={badgeVariantForReview(suggestion.status)}>{suggestion.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg border border-slate-700/70 bg-slate-900/40 p-3">
                    <p className="mb-2 text-xs text-slate-500">Forslag</p>
                    <p className="whitespace-pre-wrap text-sm leading-6 text-slate-100">{valueToText(suggestion.suggested_value_json)}</p>
                  </div>
                  {suggestion.safety_warnings?.length ? (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                      {suggestion.safety_warnings.join(" ")}
                    </div>
                  ) : null}
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-slate-400">Kilder bak forslaget</p>
                    {suggestion.source_summary_json?.length ? suggestion.source_summary_json.slice(0, 6).map((source) => (
                      <div key={`${suggestion.id}-${source.id}`} className="rounded-lg border border-slate-700/70 p-3 text-xs text-slate-400">
                        <span className="font-medium text-slate-200">{source.title}</span> · {source.category} · {source.sourceName} · {source.sourceRef || "kilde"}
                        {source.excerpt ? <p className="mt-1 text-slate-500">{firstWords(source.excerpt, 28)}</p> : null}
                      </div>
                    )) : <p className="text-sm text-slate-500">Ingen kilde knyttet til forslaget.</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => void decideSuggestion(suggestion.id, "approved", suggestion.suggested_value_json)} disabled={Boolean(working) || suggestion.status === "approved"}>
                      <CheckCircle2 size={14} className="mr-2" />
                      Godkjenn
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void decideSuggestion(suggestion.id, "rejected")} disabled={Boolean(working) || suggestion.status === "rejected"}>
                      <XCircle size={14} className="mr-2" />
                      Avvis
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )) : (
              <Card>
                <CardContent className="p-6 text-sm text-slate-400">
                  Ingen forslag ennå. Godkjenn noen ikke-sensitive fakta for offentlig bruk, lagre en variant og bygg profilen.
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="variants" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {dashboard?.profileVariants.length ? dashboard.profileVariants.map((variant) => (
              <Card key={variant.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">{variant.name}</CardTitle>
                      <CardDescription>{variant.profile_type.replace("_", " ")} · {variant.primary_platform}</CardDescription>
                    </div>
                    <Badge variant={variant.status === "approved" ? "success" : variant.status === "generated" ? "default" : "outline"}>{variant.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg bg-slate-900/60 p-3">
                      <p className="text-xs text-slate-500">Kilder valgt</p>
                      <p className="text-xl font-semibold text-slate-50">{Number(variant.coverage_json?.selectedKnowledgeItems || 0)}</p>
                    </div>
                    <div className="rounded-lg bg-slate-900/60 p-3">
                      <p className="text-xs text-slate-500">Offentlige fakta</p>
                      <p className="text-xl font-semibold text-slate-50">{Number(variant.coverage_json?.publicFactItems || 0)}</p>
                    </div>
                    <div className="rounded-lg bg-slate-900/60 p-3">
                      <p className="text-xs text-slate-500">Godkjent</p>
                      <p className="text-xl font-semibold text-slate-50">{Object.keys(variant.approved_profile_json || {}).length}</p>
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-700/70 p-3">
                    <p className="mb-2 text-xs text-slate-500">Godkjent profil</p>
                    <pre className="max-h-80 overflow-auto whitespace-pre-wrap text-xs leading-5 text-slate-300">{valueToText(variant.approved_profile_json || {}) || "Ingen godkjente felt ennå."}</pre>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => {
                    setVariantForm({
                      id: variant.id,
                      name: variant.name,
                      profileType: variant.profile_type,
                      primaryPlatform: variant.primary_platform,
                      goalId: variant.goal_id || "",
                      audienceId: variant.audience_id || "",
                      tone: listToText(variant.tone),
                      focusTags: listToText(variant.focus_tags),
                      instructions: variant.instructions || "",
                      status: variant.status,
                    });
                  }}>
                    <SlidersHorizontal size={14} className="mr-2" />
                    Rediger i profilbygger
                  </Button>
                </CardContent>
              </Card>
            )) : <p className="text-sm text-slate-400">Ingen profilvarianter ennå.</p>}
          </div>
        </TabsContent>

        <TabsContent value="strategy" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Innholdspilarer</CardTitle>
                <CardDescription>Fordeling og målgruppe for LinkedIn-strategien.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {dashboard?.pillars.length ? dashboard.pillars.map((pillar) => (
                  <div key={pillar.id} className="rounded-lg border border-slate-700/70 p-4">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <h3 className="font-semibold text-slate-100">{pillar.name}</h3>
                      <Badge variant="secondary">{pillar.target_percentage}%</Badge>
                    </div>
                    <p className="text-sm leading-6 text-slate-400">{pillar.description}</p>
                    <p className="mt-2 text-xs text-slate-500">{pillar.business_goal}</p>
                  </div>
                )) : <p className="text-sm text-slate-400">Kjør profilanalysen for å generere første strategi.</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Idébank</CardTitle>
                <CardDescription>Ideer er merket med hvorfor de er relevante.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {dashboard?.ideas.slice(0, 8).map((idea) => (
                  <button
                    key={idea.id}
                    onClick={() => setPostForm({ ...postForm, ideaId: idea.id, title: idea.title, content: postForm.content })}
                    className="block w-full rounded-lg border border-slate-700/70 p-4 text-left transition-colors hover:border-primary-500/50 hover:bg-slate-800"
                  >
                    <h3 className="font-semibold text-slate-100">{idea.title}</h3>
                    <p className="mt-1 text-sm text-slate-400">{idea.hook}</p>
                    <p className="mt-2 text-xs text-slate-500">{idea.angle} · {idea.goal}</p>
                  </button>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="studio" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Post Studio</CardTitle>
              <CardDescription>Lag LinkedIn-utkast, score kvalitet og lagre til kalender.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-3">
                <Field label="Idé">
                  <select value={postForm.ideaId} onChange={(event) => setPostForm({ ...postForm, ideaId: event.target.value })} className="h-10 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100">
                    <option value="">Velg idé</option>
                    {dashboard?.ideas.map((idea) => <option key={idea.id} value={idea.id}>{idea.title}</option>)}
                  </select>
                </Field>
                <Field label="Innholdspilar">
                  <select value={postForm.pillarId} onChange={(event) => setPostForm({ ...postForm, pillarId: event.target.value })} className="h-10 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100">
                    <option value="">Ingen</option>
                    {dashboard?.pillars.map((pillar) => <option key={pillar.id} value={pillar.id}>{pillar.name}</option>)}
                  </select>
                </Field>
                <Field label="Status">
                  <select value={postForm.status} onChange={(event) => setPostForm({ ...postForm, status: event.target.value })} className="h-10 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100">
                    {["draft", "review", "approved", "scheduled", "published"].map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </Field>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Field label="Tittel">
                  <Input value={postForm.title} onChange={(event) => setPostForm({ ...postForm, title: event.target.value })} />
                </Field>
                <Field label="Planlagt dato">
                  <Input type="datetime-local" value={postForm.scheduledAt} onChange={(event) => setPostForm({ ...postForm, scheduledAt: event.target.value })} />
                </Field>
                <Field label="Målgruppe">
                  <Input value={postForm.targetAudience} onChange={(event) => setPostForm({ ...postForm, targetAudience: event.target.value })} />
                </Field>
                <Field label="Mål">
                  <Input value={postForm.goal} onChange={(event) => setPostForm({ ...postForm, goal: event.target.value })} />
                </Field>
              </div>
              <TextArea className="min-h-64" value={postForm.content} onChange={(event) => setPostForm({ ...postForm, content: event.target.value })} />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={seedPostFromIdea} disabled={!dashboard?.ideas.length}>
                  <MessageSquareText size={16} className="mr-2" />
                  Bruk valgt idé
                </Button>
                <Button onClick={() => void savePost()} disabled={Boolean(working) || !postForm.content.trim()}>
                  {working === "save_post" ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Save size={16} className="mr-2" />}
                  {t.saveDraft}
                </Button>
              </div>
            </CardContent>
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            {dashboard?.posts.slice(0, 6).map((post) => (
              <Card key={post.id}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-base">{post.title || "LinkedIn-utkast"}</CardTitle>
                    <Badge variant={post.status === "published" ? "success" : "outline"}>{post.status}</Badge>
                  </div>
                  <CardDescription>Kvalitetsscore: {post.quality_score ?? "N/A"}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm leading-6 text-slate-300">{firstWords(post.content, 70)}</p>
                  <p className="text-xs text-slate-500">{post.quality_analysis_json?.disclaimer}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="calendar" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Content Calendar</CardTitle>
              <CardDescription>Første versjon bruker manuell publiseringsstatus.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {dashboard?.posts.length ? dashboard.posts.map((post) => (
                <div key={post.id} className="flex flex-col gap-3 rounded-lg border border-slate-700/70 p-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-medium text-slate-100">{post.title || firstWords(post.content, 10)}</p>
                    <p className="text-sm text-slate-500">{post.status} · {post.scheduled_at ? post.scheduled_at.slice(0, 16).replace("T", " ") : "ikke planlagt"}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => void markPostPublished(post)} disabled={post.status === "published" || Boolean(working)}>
                    Merk publisert
                  </Button>
                </div>
              )) : <p className="text-sm text-slate-400">Ingen innlegg i kalenderen ennå.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          {dashboard?.performance.dataWarning ? <StatusNotice type="info" message={dashboard.performance.dataWarning} /> : null}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Manuelle resultater</CardTitle>
                <CardDescription>Registrer LinkedIn-tall etter publisering.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Field label="Innlegg">
                  <select value={metricsForm.postId} onChange={(event) => setMetricsForm({ ...metricsForm, postId: event.target.value })} className="h-10 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100">
                    <option value="">Velg innlegg</option>
                    {dashboard?.posts.map((post) => <option key={post.id} value={post.id}>{post.title || firstWords(post.content, 12)}</option>)}
                  </select>
                </Field>
                <div className="grid gap-3 sm:grid-cols-3">
                  {(["impressions", "reactions", "comments", "shares", "saves", "clicks", "leads", "meetings", "sales"] as const).map((key) => (
                    <Field key={key} label={key}>
                      <Input type="number" min={0} value={metricsForm[key]} onChange={(event) => setMetricsForm({ ...metricsForm, [key]: Number(event.target.value) })} />
                    </Field>
                  ))}
                </div>
                <Button onClick={() => void saveMetrics()} disabled={Boolean(working) || !metricsForm.postId}>
                  <BarChart3 size={16} className="mr-2" />
                  {t.recordMetrics}
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Formler</CardTitle>
                <CardDescription>Alle tall er beregnet, ikke predikert.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-slate-100">Engagement rate: {percent(dashboard?.performance.engagementRate)}</p>
                <p className="text-slate-100">Click rate: {percent(dashboard?.performance.clickRate)}</p>
                <p className="text-slate-100">Lead conversion: {percent(dashboard?.performance.leadConversionRate)}</p>
                <div className="space-y-2 pt-2 text-xs text-slate-500">
                  {Object.entries(dashboard?.performance.formulas || {}).slice(0, 4).map(([key, formula]) => (
                    <p key={key}>{key}: {formula}</p>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="crm" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>CRM-kobling</CardTitle>
              <CardDescription>Koble innlegg til lead, contact, company, property, campaign eller sale uten å endre CRM-tabeller.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Innlegg">
                  <select value={linkForm.postId} onChange={(event) => setLinkForm({ ...linkForm, postId: event.target.value })} className="h-10 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100">
                    <option value="">Velg innlegg</option>
                    {dashboard?.posts.map((post) => <option key={post.id} value={post.id}>{post.title || firstWords(post.content, 12)}</option>)}
                  </select>
                </Field>
                <Field label="CRM-type">
                  <select value={linkForm.crmEntityType} onChange={(event) => setLinkForm({ ...linkForm, crmEntityType: event.target.value })} className="h-10 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100">
                    {["lead", "contact", "company", "property", "development", "campaign", "opportunity", "sale"].map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </Field>
                <Field label="CRM ID">
                  <Input value={linkForm.crmEntityId} onChange={(event) => setLinkForm({ ...linkForm, crmEntityId: event.target.value })} />
                </Field>
                <Field label="Relasjon">
                  <Input value={linkForm.relationshipType} onChange={(event) => setLinkForm({ ...linkForm, relationshipType: event.target.value })} />
                </Field>
              </div>
              <Button onClick={() => void saveCrmLink()} disabled={Boolean(working) || !linkForm.postId || !linkForm.crmEntityId.trim()}>
                <Link2 size={16} className="mr-2" />
                {t.linkCrm}
              </Button>
              <div className="space-y-2">
                {dashboard?.links.slice(0, 8).map((link) => (
                  <div key={link.id} className="rounded-lg border border-slate-700/70 p-3 text-sm text-slate-300">
                    {link.social_entity_type} {"->"} {link.crm_entity_type}: <span className="text-slate-100">{link.crm_entity_id}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recommendations" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {dashboard?.recommendations.length ? dashboard.recommendations.map((recommendation) => (
              <Card key={recommendation.id}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-base">{recommendation.title}</CardTitle>
                    <Badge variant={recommendation.priority === "critical" ? "destructive" : recommendation.priority === "high_impact" ? "warning" : "outline"}>
                      {recommendation.priority.replace("_", " ")}
                    </Badge>
                  </div>
                  <CardDescription>{recommendation.category}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm leading-6 text-slate-300">{recommendation.description}</p>
                  <p className="text-xs text-slate-500">{recommendation.rationale}</p>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => void callAction({ action: "update_recommendation", recommendation: { id: recommendation.id, status: "done" } }, "Anbefalingen er markert som utført.")}>
                      Utført
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void callAction({ action: "update_recommendation", recommendation: { id: recommendation.id, status: "dismissed" } }, "Anbefalingen er skjult.")}>
                      Skjul
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )) : <p className="text-sm text-slate-400">Ingen anbefalinger ennå.</p>}
          </div>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Personvern og kostnadskontroll</CardTitle>
              <CardDescription>Server-side AI, inputgrenser og ingen scraping.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-slate-700/70 p-4">
                <ShieldCheck className="mb-3 text-emerald-300" size={22} />
                <h3 className="font-semibold text-slate-100">Data isoleres</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">Alle spørringer filtreres på organisasjon og bruker. Direkte browser-tilgang til tabellene er stengt i migrasjonen.</p>
              </div>
              <div className="rounded-lg border border-slate-700/70 p-4">
                <Sparkles className="mb-3 text-primary-300" size={22} />
                <h3 className="font-semibold text-slate-100">AI er kontrollert</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">Profiltekst behandles som data, ikke instruksjoner. AI-output valideres og faller tilbake til regler ved feil.</p>
              </div>
              <div className="rounded-lg border border-slate-700/70 p-4">
                <FileText className="mb-3 text-amber-300" size={22} />
                <h3 className="font-semibold text-slate-100">MVP-begrensning</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">PDF/CSV-import, automatisk publisering, full network intelligence og competitor intelligence er planlagt for neste fase.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
