import { z } from "zod";

export const SOCIAL_INTELLIGENCE_PROMPT_VERSION = "social-intelligence-linkedin-mvp-v1";
export const SOCIAL_INTELLIGENCE_MODEL = "claude-sonnet-structured-json-or-rule-fallback";
export const SOCIAL_DEFAULT_ORGANIZATION_ID = "realtyflow";

export const SOCIAL_PLATFORMS = [
  "linkedin",
  "facebook",
  "instagram",
  "x",
  "youtube",
  "newsletter",
  "blog",
  "other",
] as const;

export const SOCIAL_LANGUAGES = ["no", "en", "es"] as const;

export const PROFESSIONAL_ROLES = [
  "real_estate_advisor",
  "real_estate_agent",
  "home_seller",
  "property_developer",
  "founder",
  "consultant",
  "author",
  "photographer",
  "marketer",
  "leader",
  "advisor",
  "investor",
  "course_creator",
  "speaker",
  "other",
] as const;

export const SOCIAL_TONES = [
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
] as const;

export const POST_STATUSES = [
  "idea",
  "draft",
  "review",
  "approved",
  "scheduled",
  "published",
  "archived",
] as const;

export const CONTENT_IDEA_STATUSES = ["idea", "drafted", "scheduled", "used", "archived"] as const;

export const RECOMMENDATION_PRIORITIES = [
  "critical",
  "high_impact",
  "medium_impact",
  "optional",
] as const;

export const CRM_ENTITY_TYPES = [
  "lead",
  "contact",
  "company",
  "property",
  "development",
  "campaign",
  "opportunity",
  "sale",
] as const;

export const QUALITY_SCORE_CATEGORIES = [
  "hookStrength",
  "clarity",
  "relevance",
  "credibility",
  "readability",
  "specificity",
  "personalVoice",
  "value",
  "callToAction",
  "brandConsistency",
  "platformFit",
] as const;

export const PROFILE_SECTION_TYPES = [
  "headline",
  "about",
  "experience",
  "skills",
  "services",
  "featured",
  "contact",
  "positioning",
  "profile_summary",
] as const;

export const KNOWLEDGE_SOURCE_TYPES = [
  "master_profile",
  "uploaded_markdown",
  "uploaded_text",
  "manual_note",
  "linkedin_profile",
  "website",
  "company_profile",
  "crm_profile",
  "other",
] as const;

export const KNOWLEDGE_CATEGORIES = [
  "identity",
  "role",
  "experience",
  "company",
  "service",
  "expertise",
  "education",
  "achievement",
  "market",
  "location",
  "publication",
  "speaking",
  "course",
  "skill",
  "value",
  "story",
  "audience",
  "restriction",
  "positioning",
  "other",
] as const;

export const KNOWLEDGE_VERIFICATION_STATUSES = [
  "needs_review",
  "user_confirmed",
  "document_verified",
  "rejected",
  "conflict",
  "outdated",
  "deleted",
] as const;

export const KNOWLEDGE_VISIBILITIES = [
  "private",
  "internal",
  "public_candidate",
  "public_approved",
] as const;

export const PROFILE_VARIANT_TYPES = [
  "linkedin",
  "website_bio",
  "real_estate",
  "ai_crm",
  "author",
  "speaker",
  "consultant",
  "company",
  "general",
] as const;

export const PROFILE_FACT_TYPES = [
  "user_claim",
  "document_derived",
  "positioning_suggestion",
  "restriction",
  "third_party_reference",
] as const;

export const PROFILE_SUGGESTION_STATUSES = [
  "draft",
  "approved",
  "rejected",
  "archived",
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];
export type SocialLanguage = (typeof SOCIAL_LANGUAGES)[number];
export type SocialTone = (typeof SOCIAL_TONES)[number];
export type PostStatus = (typeof POST_STATUSES)[number];
export type QualityScoreCategory = (typeof QUALITY_SCORE_CATEGORIES)[number];
export type ProfileSectionType = (typeof PROFILE_SECTION_TYPES)[number];
export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];
export type KnowledgeSourceType = (typeof KNOWLEDGE_SOURCE_TYPES)[number];
export type KnowledgeVerificationStatus = (typeof KNOWLEDGE_VERIFICATION_STATUSES)[number];
export type KnowledgeVisibility = (typeof KNOWLEDGE_VISIBILITIES)[number];
export type ProfileVariantType = (typeof PROFILE_VARIANT_TYPES)[number];
export type ProfileFactType = (typeof PROFILE_FACT_TYPES)[number];

const nullableText = (max: number) =>
  z.preprocess((value) => {
    const text = String(value ?? "").trim();
    return text || null;
  }, z.string().max(max).nullable());

const optionalText = (max: number) =>
  z.preprocess((value) => String(value ?? "").trim(), z.string().max(max));

const textList = (maxItems = 20, maxItemLength = 120) =>
  z.preprocess((value) => {
    if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
    if (typeof value === "string") {
      return value
        .split(/[,\n]/)
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return [];
  }, z.array(z.string().trim().min(1).max(maxItemLength)).max(maxItems));

const safeJson = z.record(z.string().max(120), z.unknown()).default({});

export const BrandProfileInputSchema = z
  .object({
    professionalName: nullableText(180),
    currentPosition: nullableText(180),
    primaryRole: z.enum(PROFESSIONAL_ROLES).default("real_estate_advisor"),
    secondaryRoles: textList(12),
    companyName: nullableText(180),
    location: nullableText(180),
    markets: textList(20),
    geographicAreas: textList(20),
    industries: textList(20),
    targetAudiences: textList(20),
    services: textList(30),
    expertise: textList(30),
    languages: z.preprocess((value) => {
      const rows = Array.isArray(value) ? value : String(value || "no").split(/[,\n]/);
      return rows.map((item) => String(item).trim().toLowerCase()).filter(Boolean);
    }, z.array(z.enum(SOCIAL_LANGUAGES)).min(1).max(3)).default(["no"]),
    professionalValues: textList(20),
    positioningGoal: nullableText(1200),
    preferredTones: z.preprocess((value) => {
      const rows = Array.isArray(value) ? value : String(value || "professional").split(/[,\n]/);
      return rows.map((item) => String(item).trim()).filter(Boolean);
    }, z.array(z.enum(SOCIAL_TONES)).min(1).max(8)).default(["professional"]),
    businessGoals: textList(20),
    excludedTopics: textList(20),
    publishingFrequency: nullableText(80),
    onboardingStep: z.coerce.number().int().min(1).max(6).default(1),
    setupCompleted: z.coerce.boolean().default(false),
    analysisConsent: z.coerce.boolean().default(true),
  })
  .strict();

export type BrandProfileInput = z.infer<typeof BrandProfileInputSchema>;

export const SocialProfileImportInputSchema = z
  .object({
    platform: z.enum(SOCIAL_PLATFORMS).default("linkedin"),
    importType: z.enum(["manual_text", "text_file", "pdf", "exported_profile", "manual_stats"]).default("manual_text"),
    reviewedText: z.string().trim().min(12).max(12_000),
  })
  .strict();

export const SocialAnalyzeRequestSchema = z
  .object({
    profile: BrandProfileInputSchema,
    import: SocialProfileImportInputSchema,
    locale: z.enum(["no", "en"]).default("no"),
  })
  .strict();

export type SocialAnalyzeRequest = z.infer<typeof SocialAnalyzeRequestSchema>;

export const SocialPostInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    title: nullableText(220),
    content: z.string().trim().min(1).max(8_000),
    platform: z.enum(SOCIAL_PLATFORMS).default("linkedin"),
    language: z.enum(SOCIAL_LANGUAGES).default("no"),
    tone: textList(8, 80),
    contentType: optionalText(80).default("linkedin_post"),
    pillarId: z.string().uuid().nullable().optional(),
    goal: nullableText(240),
    targetAudience: nullableText(240),
    hookType: nullableText(120),
    ctaType: nullableText(120),
    status: z.enum(POST_STATUSES).default("draft"),
    scheduledAt: z.string().datetime().nullable().optional(),
    publishedAt: z.string().datetime().nullable().optional(),
    campaignId: nullableText(160).optional(),
  })
  .strict();

export type SocialPostInput = z.infer<typeof SocialPostInputSchema>;

export const SocialMetricsInputSchema = z
  .object({
    postId: z.string().uuid(),
    recordedAt: z.string().datetime().optional(),
    impressions: z.coerce.number().int().nonnegative().max(1_000_000_000).default(0),
    reach: z.coerce.number().int().nonnegative().max(1_000_000_000).default(0),
    reactions: z.coerce.number().int().nonnegative().max(1_000_000_000).default(0),
    comments: z.coerce.number().int().nonnegative().max(1_000_000_000).default(0),
    shares: z.coerce.number().int().nonnegative().max(1_000_000_000).default(0),
    saves: z.coerce.number().int().nonnegative().max(1_000_000_000).default(0),
    clicks: z.coerce.number().int().nonnegative().max(1_000_000_000).default(0),
    profileViews: z.coerce.number().int().nonnegative().max(1_000_000_000).default(0),
    followersGained: z.coerce.number().int().nonnegative().max(1_000_000_000).default(0),
    messages: z.coerce.number().int().nonnegative().max(1_000_000_000).default(0),
    leads: z.coerce.number().int().nonnegative().max(1_000_000_000).default(0),
    meetings: z.coerce.number().int().nonnegative().max(1_000_000_000).default(0),
    sales: z.coerce.number().int().nonnegative().max(1_000_000_000).default(0),
    notes: nullableText(2_000),
  })
  .strict();

export type SocialMetricsInput = z.infer<typeof SocialMetricsInputSchema>;

export const SocialEntityLinkInputSchema = z
  .object({
    socialEntityType: z.enum(["profile", "section", "idea", "post", "metric", "recommendation"]),
    socialEntityId: z.string().uuid(),
    crmEntityType: z.enum(CRM_ENTITY_TYPES),
    crmEntityId: z.string().trim().min(1).max(180),
    relationshipType: z.string().trim().min(1).max(120).default("attributed_to"),
  })
  .strict();

export type SocialEntityLinkInput = z.infer<typeof SocialEntityLinkInputSchema>;

export const SocialRecommendationStatusInputSchema = z
  .object({
    id: z.string().uuid(),
    status: z.enum(["open", "done", "dismissed", "expired"]),
  })
  .strict();

export const KnowledgeFileImportInputSchema = z
  .object({
    sourceName: optionalText(180).default("Opplastet kunnskapskilde"),
    sourceType: z.enum(KNOWLEDGE_SOURCE_TYPES).default("uploaded_markdown"),
    filename: nullableText(260).optional(),
    mimeType: nullableText(120).optional(),
    text: z.string().trim().min(20).max(120_000),
    aiUseAllowed: z.coerce.boolean().default(true),
    publicUseAllowed: z.coerce.boolean().default(false),
    visibility: z.enum(KNOWLEDGE_VISIBILITIES).default("internal"),
  })
  .strict();

export type KnowledgeFileImportInput = z.infer<typeof KnowledgeFileImportInputSchema>;

export const KnowledgeItemUpdateInputSchema = z
  .object({
    id: z.string().uuid(),
    verificationStatus: z.enum(KNOWLEDGE_VERIFICATION_STATUSES).optional(),
    publicUseAllowed: z.coerce.boolean().optional(),
    sensitive: z.coerce.boolean().optional(),
    visibility: z.enum(KNOWLEDGE_VISIBILITIES).optional(),
    title: optionalText(220).optional(),
    content: z.string().trim().min(1).max(6_000).optional(),
    summary: optionalText(1_200).optional(),
    tags: textList(30, 80).optional(),
    allowedProfileTypes: z.array(z.enum(PROFILE_VARIANT_TYPES)).max(12).optional(),
    reviewNotes: nullableText(2_000).optional(),
  })
  .strict();

export type KnowledgeItemUpdateInput = z.infer<typeof KnowledgeItemUpdateInputSchema>;

export const KnowledgeSourceUpdateInputSchema = z
  .object({
    id: z.string().uuid(),
    status: z.enum(["active", "disabled", "deleted"]).optional(),
    aiUseAllowed: z.coerce.boolean().optional(),
    publicUseAllowed: z.coerce.boolean().optional(),
    visibility: z.enum(KNOWLEDGE_VISIBILITIES).optional(),
  })
  .strict();

export type KnowledgeSourceUpdateInput = z.infer<typeof KnowledgeSourceUpdateInputSchema>;

export const ProfileGoalInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: optionalText(160).default("Profesjonelt profilmal"),
    description: nullableText(1_500),
    primaryPlatform: z.enum(SOCIAL_PLATFORMS).default("linkedin"),
    profileType: z.enum(PROFILE_VARIANT_TYPES).default("linkedin"),
    successMetrics: textList(12, 120),
    priority: z.coerce.number().int().min(1).max(5).default(3),
    isActive: z.coerce.boolean().default(true),
  })
  .strict();

export type ProfileGoalInput = z.infer<typeof ProfileGoalInputSchema>;

export const TargetAudienceInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: optionalText(160).default("Primær målgruppe"),
    description: nullableText(1_500),
    markets: textList(20, 120),
    needs: textList(20, 140),
    objections: textList(20, 140),
    languages: z.array(z.enum(SOCIAL_LANGUAGES)).min(1).max(3).default(["no"]),
    isActive: z.coerce.boolean().default(true),
  })
  .strict();

export type TargetAudienceInput = z.infer<typeof TargetAudienceInputSchema>;

export const ProfileVariantInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: optionalText(160).default("LinkedIn hovedprofil"),
    profileType: z.enum(PROFILE_VARIANT_TYPES).default("linkedin"),
    primaryPlatform: z.enum(SOCIAL_PLATFORMS).default("linkedin"),
    goalId: z.string().uuid().nullable().optional(),
    audienceId: z.string().uuid().nullable().optional(),
    tone: textList(8, 80),
    focusTags: textList(20, 80),
    instructions: nullableText(2_000),
    status: z.enum(["draft", "generated", "approved", "archived"]).default("draft"),
  })
  .strict();

export type ProfileVariantInput = z.infer<typeof ProfileVariantInputSchema>;

export const GenerateProfileSuggestionsInputSchema = z
  .object({
    variantId: z.string().uuid(),
  })
  .strict();

export type GenerateProfileSuggestionsInput = z.infer<typeof GenerateProfileSuggestionsInputSchema>;

export const ProfileSuggestionDecisionInputSchema = z
  .object({
    id: z.string().uuid(),
    status: z.enum(["approved", "rejected"]),
    approvedValue: z.unknown().optional(),
  })
  .strict();

export type ProfileSuggestionDecisionInput = z.infer<typeof ProfileSuggestionDecisionInputSchema>;

export const SocialIntelligenceActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save_profile"), profile: BrandProfileInputSchema }).strict(),
  z.object({ action: z.literal("analyze_profile"), payload: SocialAnalyzeRequestSchema }).strict(),
  z.object({
    action: z.literal("accept_section"),
    section: z.object({
      id: z.string().uuid(),
      approvedContent: z.string().trim().min(1).max(6_000),
    }).strict(),
  }).strict(),
  z.object({ action: z.literal("save_post"), post: SocialPostInputSchema }).strict(),
  z.object({ action: z.literal("save_metrics"), metrics: SocialMetricsInputSchema }).strict(),
  z.object({ action: z.literal("link_entity"), link: SocialEntityLinkInputSchema }).strict(),
  z.object({ action: z.literal("update_recommendation"), recommendation: SocialRecommendationStatusInputSchema }).strict(),
  z.object({ action: z.literal("import_knowledge_file"), import: KnowledgeFileImportInputSchema }).strict(),
  z.object({ action: z.literal("update_knowledge_item"), item: KnowledgeItemUpdateInputSchema }).strict(),
  z.object({ action: z.literal("update_knowledge_source"), source: KnowledgeSourceUpdateInputSchema }).strict(),
  z.object({ action: z.literal("save_profile_goal"), goal: ProfileGoalInputSchema }).strict(),
  z.object({ action: z.literal("save_target_audience"), audience: TargetAudienceInputSchema }).strict(),
  z.object({ action: z.literal("save_profile_variant"), variant: ProfileVariantInputSchema }).strict(),
  z.object({ action: z.literal("generate_profile_suggestions"), payload: GenerateProfileSuggestionsInputSchema }).strict(),
  z.object({ action: z.literal("decide_profile_suggestion"), decision: ProfileSuggestionDecisionInputSchema }).strict(),
]);

export type SocialIntelligenceAction = z.infer<typeof SocialIntelligenceActionSchema>;

export interface ScoreBreakdownItem {
  key: string;
  label: string;
  score: number | null;
  explanation: string;
  suggestions: string[];
  dataAvailable: boolean;
}

export interface SocialQualityScore {
  total: number;
  disclaimer: string;
  categories: Record<QualityScoreCategory, ScoreBreakdownItem>;
}

export interface SocialPerformanceMetrics {
  engagementRate: number | null;
  commentsPerThousand: number | null;
  sharesPerThousand: number | null;
  clickRate: number | null;
  leadConversionRate: number | null;
  followerConversionRate: number | null;
  formulas: Record<string, string>;
  dataWarning: string | null;
}

export interface SocialGeneratedSection {
  sectionType: ProfileSectionType;
  currentContent: string | null;
  optimizedContent: string;
  score: number;
  analysis: {
    strengths: string[];
    weaknesses: string[];
    suggestions: string[];
    rationale: string;
    keywords: string[];
    alternatives: string[];
  };
}

export interface SocialGeneratedSkill {
  skillName: string;
  category: string;
  source: string;
  relevanceScore: number;
  priority: number;
  isVerified: boolean;
}

export interface SocialGeneratedPillar {
  name: string;
  description: string;
  targetPercentage: number;
  targetAudience: string;
  businessGoal: string;
}

export interface SocialGeneratedIdea {
  title: string;
  hook: string;
  angle: string;
  description: string;
  pillarName: string;
  targetAudience: string;
  goal: string;
  format: string;
  suggestedCta: string;
  sourceContext: Record<string, unknown>;
}

export interface SocialGeneratedRecommendation {
  category: string;
  priority: (typeof RECOMMENDATION_PRIORITIES)[number];
  title: string;
  description: string;
  rationale: string;
  evidence: Record<string, unknown>;
  actionType: string;
  actionPayload: Record<string, unknown>;
}

export interface SocialProfileAnalysis {
  summary: string;
  sections: SocialGeneratedSection[];
  skills: SocialGeneratedSkill[];
  pillars: SocialGeneratedPillar[];
  ideas: SocialGeneratedIdea[];
  recommendations: SocialGeneratedRecommendation[];
  model: string;
  promptVersion: string;
  aiUsed: boolean;
  missingInformation: string[];
}

export function normalizeOrganizationId(value: unknown) {
  const text = String(value || SOCIAL_DEFAULT_ORGANIZATION_ID)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return text || SOCIAL_DEFAULT_ORGANIZATION_ID;
}

export function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export function compactText(value: unknown, max = 2_000) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function toArray(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
  return [];
}

export function safeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
