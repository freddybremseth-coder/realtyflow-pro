import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { RequestAccessContext } from "@/lib/api-admin";
import {
  BrandProfileInputSchema,
  GenerateProfileSuggestionsInputSchema,
  KnowledgeFileImportInputSchema,
  KnowledgeItemUpdateInputSchema,
  KnowledgeSourceUpdateInputSchema,
  ProfileGoalInputSchema,
  ProfileSuggestionDecisionInputSchema,
  ProfileVariantInputSchema,
  SOCIAL_DEFAULT_ORGANIZATION_ID,
  SOCIAL_INTELLIGENCE_PROMPT_VERSION,
  SocialPostInputSchema,
  TargetAudienceInputSchema,
  normalizeEmail,
  normalizeOrganizationId,
  safeRecord,
  type BrandProfileInput,
  type GenerateProfileSuggestionsInput,
  type KnowledgeFileImportInput,
  type KnowledgeItemUpdateInput,
  type KnowledgeSourceUpdateInput,
  type ProfileGoalInput,
  type ProfileSuggestionDecisionInput,
  type ProfileVariantInput,
  type SocialAnalyzeRequest,
  type SocialEntityLinkInput,
  type SocialMetricsInput,
  type SocialProfileAnalysis,
  type TargetAudienceInput,
} from "./contracts";
import { analyzeProfessionalProfile, generatePostDraft, sha256ContentHash } from "./analysis";
import {
  annotateDuplicatesAndConflicts,
  extractKnowledgeItemsFromText,
  generateProfileSuggestionsFromKnowledge,
  selectRelevantKnowledgeForProfile,
  type KnowledgeItemLike,
  type KnowledgeSourceLike,
  type ProfileVariantLike,
} from "./knowledge";
import {
  buildOverviewScores,
  calculatePerformanceMetrics,
  scoreSocialPost,
  type SocialMetricLike,
  type SocialPostLike,
  type SocialSectionLike,
} from "./scoring";

export type SocialSupabaseClient = SupabaseClient<any, "public", any>;

let socialSupabaseFactoryForTests: (() => SocialSupabaseClient | null) | null = null;

export function setSocialSupabaseFactoryForTests(factory: (() => SocialSupabaseClient | null) | null) {
  socialSupabaseFactoryForTests = factory;
}

export function getSocialSupabase() {
  if (socialSupabaseFactoryForTests) return socialSupabaseFactoryForTests();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export class SocialIntelligencePersistenceError extends Error {
  constructor(
    public readonly code: "DATABASE_NOT_CONFIGURED" | "DATABASE_ERROR" | "ACCESS_DENIED" | "SCHEMA_NOT_READY",
    message: string,
    public readonly status = 500,
  ) {
    super(message);
    this.name = "SocialIntelligencePersistenceError";
  }
}

export interface SocialRouteContext {
  organizationId: string;
  userEmail: string;
  access: RequestAccessContext;
}

export function getSocialRouteContext(access: RequestAccessContext): SocialRouteContext {
  return {
    organizationId: normalizeOrganizationId(process.env.REALTYFLOW_SOCIAL_ORGANIZATION_ID || SOCIAL_DEFAULT_ORGANIZATION_ID),
    userEmail: normalizeEmail(access.email),
    access,
  };
}

function requireSupabase() {
  const supabase = getSocialSupabase();
  if (!supabase) {
    throw new SocialIntelligencePersistenceError(
      "DATABASE_NOT_CONFIGURED",
      "Supabase er ikke konfigurert for Social Intelligence.",
      503,
    );
  }
  return supabase;
}

function databaseError(error: unknown): never {
  const message = error && typeof error === "object" && "message" in error
    ? String((error as { message?: unknown }).message)
    : "Social Intelligence database operation failed";
  const code = /does not exist|schema cache|Could not find/i.test(message) ? "SCHEMA_NOT_READY" : "DATABASE_ERROR";
  throw new SocialIntelligencePersistenceError(code, message, code === "SCHEMA_NOT_READY" ? 503 : 500);
}

function scope(context: SocialRouteContext) {
  return {
    organization_id: context.organizationId,
    user_email: context.userEmail,
  };
}

function profileToDb(context: SocialRouteContext, input: BrandProfileInput) {
  return {
    ...scope(context),
    professional_name: input.professionalName,
    current_position: input.currentPosition,
    primary_role: input.primaryRole,
    secondary_roles: input.secondaryRoles,
    company_name: input.companyName,
    location: input.location,
    markets: input.markets,
    geographic_areas: input.geographicAreas,
    industries: input.industries,
    target_audiences: input.targetAudiences,
    services: input.services,
    expertise: input.expertise,
    languages: input.languages,
    professional_values: input.professionalValues,
    positioning_goal: input.positioningGoal,
    preferred_tones: input.preferredTones,
    business_goals: input.businessGoals,
    excluded_topics: input.excludedTopics,
    publishing_frequency: input.publishingFrequency,
    onboarding_step: input.onboardingStep,
    setup_completed: input.setupCompleted,
    analysis_consent: input.analysisConsent,
    updated_at: new Date().toISOString(),
  };
}

export function profileFromRow(row: any): BrandProfileInput | null {
  if (!row) return null;
  return BrandProfileInputSchema.parse({
    professionalName: row.professional_name ?? null,
    currentPosition: row.current_position ?? null,
    primaryRole: row.primary_role || "real_estate_advisor",
    secondaryRoles: row.secondary_roles || [],
    companyName: row.company_name ?? null,
    location: row.location ?? null,
    markets: row.markets || [],
    geographicAreas: row.geographic_areas || [],
    industries: row.industries || [],
    targetAudiences: row.target_audiences || [],
    services: row.services || [],
    expertise: row.expertise || [],
    languages: row.languages || ["no"],
    professionalValues: row.professional_values || [],
    positioningGoal: row.positioning_goal ?? null,
    preferredTones: row.preferred_tones || ["professional"],
    businessGoals: row.business_goals || [],
    excludedTopics: row.excluded_topics || [],
    publishingFrequency: row.publishing_frequency ?? null,
    onboardingStep: row.onboarding_step || 1,
    setupCompleted: Boolean(row.setup_completed),
    analysisConsent: row.analysis_consent !== false,
  });
}

function knowledgeItemFromRow(row: any): KnowledgeItemLike {
  return {
    id: row.id,
    sourceId: row.source_id || null,
    sourceType: row.source_type || "other",
    sourceName: row.source_name || "Ukjent kilde",
    sourceRef: row.source_ref || null,
    sourceExcerpt: row.source_excerpt || null,
    category: row.category || "other",
    subcategory: row.subcategory || null,
    title: row.title || "Kunnskapselement",
    content: row.content || "",
    summary: row.summary || null,
    structuredData: safeRecord(row.structured_data_json),
    tags: Array.isArray(row.tags) ? row.tags : [],
    visibility: row.visibility || "internal",
    verificationStatus: row.verification_status || "needs_review",
    confidence: Number(row.confidence ?? 0.5),
    relevanceScore: Number(row.relevance_score ?? 0),
    publicUseAllowed: Boolean(row.public_use_allowed),
    sensitive: Boolean(row.sensitive),
    allowedProfileTypes: Array.isArray(row.allowed_profile_types) ? row.allowed_profile_types : [],
    platforms: Array.isArray(row.platforms) ? row.platforms : [],
    factType: row.fact_type || "document_derived",
    possibleDuplicateOf: row.possible_duplicate_of || null,
    conflictGroup: row.conflict_group || null,
    conflictReason: row.conflict_reason || null,
    reviewNotes: row.review_notes || null,
  };
}

function knowledgeItemToDb(context: SocialRouteContext, item: KnowledgeItemLike) {
  return {
    ...scope(context),
    source_id: item.sourceId,
    source_type: item.sourceType,
    source_name: item.sourceName,
    source_ref: item.sourceRef,
    source_excerpt: item.sourceExcerpt,
    category: item.category,
    subcategory: item.subcategory,
    title: item.title,
    content: item.content,
    summary: item.summary,
    structured_data_json: item.structuredData,
    tags: item.tags,
    visibility: item.visibility,
    verification_status: item.verificationStatus,
    confidence: item.confidence,
    relevance_score: item.relevanceScore,
    public_use_allowed: item.publicUseAllowed,
    sensitive: item.sensitive,
    allowed_profile_types: item.allowedProfileTypes,
    platforms: item.platforms,
    fact_type: item.factType,
    possible_duplicate_of: item.possibleDuplicateOf,
    conflict_group: item.conflictGroup,
    conflict_reason: item.conflictReason,
    review_notes: item.reviewNotes,
  };
}

function sourceFromRow(row: any): KnowledgeSourceLike {
  return {
    id: row.id,
    status: row.status || "active",
    aiUseAllowed: row.ai_use_allowed !== false,
    publicUseAllowed: Boolean(row.public_use_allowed),
  };
}

function profileVariantFromRow(row: any, goal?: any | null, audience?: any | null): ProfileVariantLike {
  return {
    id: row.id,
    name: row.name || "Profilvariant",
    profileType: row.profile_type || "linkedin",
    primaryPlatform: row.primary_platform || "linkedin",
    goalName: goal?.name || null,
    goalDescription: goal?.description || null,
    audienceName: audience?.name || null,
    audienceDescription: audience?.description || null,
    tone: Array.isArray(row.tone) ? row.tone : [],
    focusTags: Array.isArray(row.focus_tags) ? row.focus_tags : [],
    instructions: row.instructions || null,
  };
}

function sourceSummaryForSuggestion(itemsById: Map<string, KnowledgeItemLike>, sourceKnowledgeIds: string[]) {
  return sourceKnowledgeIds.map((id) => {
    const item = itemsById.get(id);
    return {
      id,
      title: item?.title || "Kilde",
      category: item?.category || "other",
      sourceName: item?.sourceName || "Ukjent kilde",
      sourceRef: item?.sourceRef || null,
      excerpt: item?.sourceExcerpt || null,
    };
  });
}

function uniqueStrings(values: unknown[]) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

async function logAudit(
  supabase: SocialSupabaseClient,
  context: SocialRouteContext,
  eventType: string,
  entityType?: string,
  entityId?: string | null,
  details?: Record<string, unknown>,
) {
  await supabase.from("social_audit_events").insert({
    ...scope(context),
    event_type: eventType,
    entity_type: entityType || null,
    entity_id: entityId || null,
    details: details || {},
  });
}

export async function saveBrandProfile(context: SocialRouteContext, input: BrandProfileInput) {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("social_brand_profiles")
    .upsert(profileToDb(context, input), { onConflict: "organization_id,user_email" })
    .select("*")
    .single();
  if (error) databaseError(error);
  await logAudit(supabase, context, "profile_saved", "profile", data.id, { setupCompleted: input.setupCompleted });
  return data;
}

async function insertGeneratedPillars(
  supabase: SocialSupabaseClient,
  context: SocialRouteContext,
  analysis: SocialProfileAnalysis,
) {
  const { data: existing, error: existingError } = await supabase
    .from("social_content_pillars")
    .select("id,name")
    .eq("organization_id", context.organizationId)
    .eq("user_email", context.userEmail)
    .eq("is_active", true);
  if (existingError) databaseError(existingError);
  if ((existing || []).length > 0) return existing || [];

  const rows = analysis.pillars.map((pillar) => ({
    ...scope(context),
    name: pillar.name,
    description: pillar.description,
    target_percentage: pillar.targetPercentage,
    target_audience: pillar.targetAudience,
    business_goal: pillar.businessGoal,
    is_active: true,
  }));
  if (!rows.length) return [];
  const { data, error } = await supabase.from("social_content_pillars").insert(rows).select("id,name");
  if (error) databaseError(error);
  return data || [];
}

async function saveAnalysisOutput(
  supabase: SocialSupabaseClient,
  context: SocialRouteContext,
  request: SocialAnalyzeRequest,
  analysis: SocialProfileAnalysis,
) {
  const hash = sha256ContentHash(request.import.reviewedText);
  const { data: imported, error: importError } = await supabase
    .from("social_profile_imports")
    .insert({
      ...scope(context),
      platform: request.import.platform,
      import_type: request.import.importType,
      extracted_text: request.import.reviewedText,
      reviewed_text: request.import.reviewedText,
      content_hash: hash,
      status: "analyzed",
      analysis_json: {
        summary: analysis.summary,
        aiUsed: analysis.aiUsed,
        model: analysis.model,
        promptVersion: analysis.promptVersion,
        missingInformation: analysis.missingInformation,
      },
    })
    .select("*")
    .single();
  if (importError) databaseError(importError);

  const sectionRows = [];
  for (const item of analysis.sections) {
    const { data: savedSection, error } = await supabase
      .from("social_profile_sections")
      .upsert({
        ...scope(context),
        platform: request.import.platform,
        section_type: item.sectionType,
        current_content: item.currentContent,
        optimized_content: item.optimizedContent,
        analysis_json: item.analysis,
        score: item.score,
        version: 1,
      }, { onConflict: "organization_id,user_email,platform,section_type" })
      .select("*")
      .single();
    if (error) databaseError(error);
    sectionRows.push(savedSection);
    const { error: versionError } = await supabase.from("social_profile_versions").insert({
      ...scope(context),
      section_id: savedSection.id,
      content: item.optimizedContent,
      generated_by: analysis.aiUsed ? "ai" : "manual",
      prompt_version: analysis.promptVersion,
    });
    if (versionError) databaseError(versionError);
  }

  const { error: deleteSkillError } = await supabase
    .from("social_skills")
    .delete()
    .eq("organization_id", context.organizationId)
    .eq("user_email", context.userEmail)
    .eq("status", "suggested");
  if (deleteSkillError) databaseError(deleteSkillError);

  if (analysis.skills.length) {
    const { error: skillError } = await supabase.from("social_skills").insert(
      analysis.skills.map((skill) => ({
        ...scope(context),
        skill_name: skill.skillName,
        category: skill.category,
        source: skill.source,
        relevance_score: skill.relevanceScore,
        is_verified: skill.isVerified,
        priority: skill.priority,
        status: "suggested",
      })),
    );
    if (skillError) databaseError(skillError);
  }

  const pillars = await insertGeneratedPillars(supabase, context, analysis);
  const pillarByName = new Map((pillars || []).map((pillar: any) => [String(pillar.name).toLowerCase(), String(pillar.id)]));
  if (analysis.ideas.length) {
    const { error: ideasError } = await supabase.from("social_content_ideas").insert(
      analysis.ideas.map((idea) => ({
        ...scope(context),
        title: idea.title,
        hook: idea.hook,
        angle: idea.angle,
        description: idea.description,
        pillar_id: pillarByName.get(idea.pillarName.toLowerCase()) || null,
        target_audience: idea.targetAudience,
        goal: idea.goal,
        platform: request.import.platform,
        format: idea.format,
        suggested_cta: idea.suggestedCta,
        source_context_json: idea.sourceContext,
        status: "idea",
      })),
    );
    if (ideasError) databaseError(ideasError);
  }

  if (analysis.recommendations.length) {
    const { error: recError } = await supabase.from("social_ai_recommendations").insert(
      analysis.recommendations.map((recommendation) => ({
        ...scope(context),
        category: recommendation.category,
        priority: recommendation.priority,
        title: recommendation.title,
        description: recommendation.description,
        rationale: recommendation.rationale,
        evidence_json: recommendation.evidence,
        action_type: recommendation.actionType,
        action_payload_json: recommendation.actionPayload,
        status: "open",
      })),
    );
    if (recError) databaseError(recError);
  }

  const { error: profileUpdateError } = await supabase
    .from("social_brand_profiles")
    .update({
      setup_completed: true,
      onboarding_step: 6,
      last_analyzed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", context.organizationId)
    .eq("user_email", context.userEmail);
  if (profileUpdateError) databaseError(profileUpdateError);

  await logAudit(supabase, context, "profile_analyzed", "profile_import", imported.id, {
    contentHash: hash,
    aiUsed: analysis.aiUsed,
    sectionCount: sectionRows.length,
  });

  return { import: imported, sections: sectionRows };
}

export async function analyzeAndPersistProfile(context: SocialRouteContext, request: SocialAnalyzeRequest) {
  const supabase = requireSupabase();
  await saveBrandProfile(context, { ...request.profile, setupCompleted: true, onboardingStep: 6 });
  const analysis = await analyzeProfessionalProfile(request);
  await saveAnalysisOutput(supabase, context, request, analysis);
  return analysis;
}

export async function loadSocialDashboard(context: SocialRouteContext) {
  const supabase = requireSupabase();
  const scoped = { organization_id: context.organizationId, user_email: context.userEmail };

  const [
    profileRes,
    importsRes,
    sectionsRes,
    skillsRes,
    pillarsRes,
    ideasRes,
    postsRes,
    metricsRes,
    recommendationsRes,
    linksRes,
    knowledgeSourcesRes,
    knowledgeItemsRes,
    profileGoalsRes,
    targetAudiencesRes,
    profileVariantsRes,
    profileSuggestionsRes,
  ] = await Promise.all([
    supabase.from("social_brand_profiles").select("*").match(scoped).maybeSingle(),
    supabase.from("social_profile_imports").select("id,platform,import_type,status,content_hash,analysis_json,created_at,updated_at").match(scoped).order("created_at", { ascending: false }).limit(20),
    supabase.from("social_profile_sections").select("*").match(scoped).order("section_type"),
    supabase.from("social_skills").select("*").match(scoped).order("priority").limit(100),
    supabase.from("social_content_pillars").select("*").match(scoped).eq("is_active", true).order("created_at"),
    supabase.from("social_content_ideas").select("*").match(scoped).order("created_at", { ascending: false }).limit(100),
    supabase.from("social_posts").select("*").match(scoped).neq("status", "archived").order("created_at", { ascending: false }).limit(100),
    supabase.from("social_post_metrics").select("*").match(scoped).order("recorded_at", { ascending: false }).limit(300),
    supabase.from("social_ai_recommendations").select("*").match(scoped).neq("status", "dismissed").order("created_at", { ascending: false }).limit(50),
    supabase.from("social_entity_links").select("*").match(scoped).order("created_at", { ascending: false }).limit(100),
    supabase.from("social_knowledge_sources").select("*").match(scoped).neq("status", "deleted").order("imported_at", { ascending: false }).limit(50),
    supabase.from("social_knowledge_items").select("*").match(scoped).neq("verification_status", "deleted").order("created_at", { ascending: false }).limit(300),
    supabase.from("social_profile_goals").select("*").match(scoped).order("priority").order("created_at", { ascending: false }).limit(40),
    supabase.from("social_target_audiences").select("*").match(scoped).order("created_at", { ascending: false }).limit(40),
    supabase.from("social_profile_variants").select("*").match(scoped).neq("status", "archived").order("updated_at", { ascending: false }).limit(50),
    supabase.from("social_profile_suggestions").select("*").match(scoped).neq("status", "archived").order("created_at", { ascending: false }).limit(100),
  ]);

  for (const result of [
    profileRes,
    importsRes,
    sectionsRes,
    skillsRes,
    pillarsRes,
    ideasRes,
    postsRes,
    metricsRes,
    recommendationsRes,
    linksRes,
    knowledgeSourcesRes,
    knowledgeItemsRes,
    profileGoalsRes,
    targetAudiencesRes,
    profileVariantsRes,
    profileSuggestionsRes,
  ]) {
    if (result.error) databaseError(result.error);
  }

  const profile = profileFromRow(profileRes.data);
  const sections = (sectionsRes.data || []) as SocialSectionLike[];
  const posts = (postsRes.data || []) as SocialPostLike[];
  const metrics = (metricsRes.data || []) as SocialMetricLike[];
  const knowledgeItems = knowledgeItemsRes.data || [];
  const overviewScores = buildOverviewScores({
    profile,
    sections,
    skillCount: skillsRes.data?.filter((skill: any) => skill.status !== "removed").length || 0,
    pillarCount: pillarsRes.data?.length || 0,
    ideaCount: ideasRes.data?.length || 0,
    posts,
    metrics,
    crmLinkCount: linksRes.data?.length || 0,
  });
  const performance = calculatePerformanceMetrics(metrics);
  const scoredPosts = posts.filter((post) => typeof post.quality_score === "number");
  const bestPost = scoredPosts.slice().sort((a, b) => (b.quality_score || 0) - (a.quality_score || 0))[0] || null;
  const weakestPost = scoredPosts.slice().sort((a, b) => (a.quality_score || 0) - (b.quality_score || 0))[0] || null;

  return {
    organizationId: context.organizationId,
    userEmail: context.userEmail,
    profile,
    rawProfile: profileRes.data || null,
    imports: importsRes.data || [],
    sections: sectionsRes.data || [],
    skills: skillsRes.data || [],
    pillars: pillarsRes.data || [],
    ideas: ideasRes.data || [],
    posts: postsRes.data || [],
    metrics: metricsRes.data || [],
    recommendations: recommendationsRes.data || [],
    links: linksRes.data || [],
    knowledgeSources: knowledgeSourcesRes.data || [],
    knowledgeItems,
    profileGoals: profileGoalsRes.data || [],
    targetAudiences: targetAudiencesRes.data || [],
    profileVariants: profileVariantsRes.data || [],
    profileSuggestions: profileSuggestionsRes.data || [],
    knowledgeSummary: {
      totalItems: knowledgeItems.length,
      needsReview: knowledgeItems.filter((item: any) => item.verification_status === "needs_review").length,
      approved: knowledgeItems.filter((item: any) => ["user_confirmed", "document_verified"].includes(item.verification_status)).length,
      rejected: knowledgeItems.filter((item: any) => item.verification_status === "rejected").length,
      duplicates: knowledgeItems.filter((item: any) => item.possible_duplicate_of).length,
      conflicts: knowledgeItems.filter((item: any) => item.conflict_group).length,
      sensitive: knowledgeItems.filter((item: any) => item.sensitive).length,
      publicApproved: knowledgeItems.filter((item: any) => item.public_use_allowed && !item.sensitive).length,
      activeSources: (knowledgeSourcesRes.data || []).filter((source: any) => source.status === "active").length,
    },
    overviewScores,
    performance,
    bestPost,
    weakestPost,
    counts: {
      ideas: ideasRes.data?.length || 0,
      postsLast30Days: posts.filter((post) => {
        const date = post.published_at || post.scheduled_at || null;
        return date ? Date.now() - new Date(date).getTime() <= 30 * 24 * 60 * 60 * 1000 : false;
      }).length,
      publishedPosts: posts.filter((post) => post.status === "published").length,
      scheduledPosts: posts.filter((post) => post.status === "scheduled").length,
      recommendations: recommendationsRes.data?.filter((rec: any) => rec.status === "open").length || 0,
      knowledgeNeedsReview: knowledgeItems.filter((item: any) => item.verification_status === "needs_review").length,
      profileSuggestions: profileSuggestionsRes.data?.filter((suggestion: any) => suggestion.status === "draft").length || 0,
    },
  };
}

export async function importKnowledgeFile(context: SocialRouteContext, rawInput: KnowledgeFileImportInput) {
  const supabase = requireSupabase();
  const input = KnowledgeFileImportInputSchema.parse(rawInput);
  const contentHash = sha256ContentHash(input.text);
  const sourceName = input.sourceName || input.filename || "Opplastet kunnskapskilde";

  const { data: existingSource, error: existingSourceError } = await supabase
    .from("social_knowledge_sources")
    .select("*")
    .match(scope(context))
    .eq("content_hash", contentHash)
    .maybeSingle();
  if (existingSourceError) databaseError(existingSourceError);

  if (existingSource) {
    const { data: existingItems, error: existingItemsError } = await supabase
      .from("social_knowledge_items")
      .select("*")
      .match(scope(context))
      .eq("source_id", existingSource.id)
      .neq("verification_status", "deleted")
      .order("created_at", { ascending: false });
    if (existingItemsError) databaseError(existingItemsError);
    await logAudit(supabase, context, "knowledge_import_skipped_unchanged", "knowledge_source", existingSource.id, {
      contentHash,
      itemCount: existingItems?.length || 0,
    });
    return {
      source: existingSource,
      items: existingItems || [],
      summary: {
        skipped: true,
        reason: "Kilden finnes allerede med samme innholdshash.",
        itemCount: existingItems?.length || 0,
      },
    };
  }

  const { data: source, error: sourceError } = await supabase
    .from("social_knowledge_sources")
    .insert({
      ...scope(context),
      source_type: input.sourceType,
      source_name: sourceName,
      source_filename: input.filename || null,
      mime_type: input.mimeType || null,
      content_hash: contentHash,
      source_metadata_json: {
        filename: input.filename || null,
        mimeType: input.mimeType || null,
        textLength: input.text.length,
      },
      extracted_summary: input.text.replace(/\s+/g, " ").trim().slice(0, 700),
      status: "active",
      visibility: input.visibility,
      ai_use_allowed: input.aiUseAllowed,
      public_use_allowed: input.publicUseAllowed,
      last_analyzed_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (sourceError) databaseError(sourceError);

  const { data: existingRows, error: existingRowsError } = await supabase
    .from("social_knowledge_items")
    .select("*")
    .match(scope(context))
    .neq("verification_status", "deleted")
    .limit(1_000);
  if (existingRowsError) databaseError(existingRowsError);

  const extracted = extractKnowledgeItemsFromText({
    text: input.text,
    source: {
      id: source.id,
      sourceType: input.sourceType,
      sourceName,
      filename: input.filename || null,
      contentHash,
      visibility: input.visibility,
      aiUseAllowed: input.aiUseAllowed,
      publicUseAllowed: input.publicUseAllowed,
    },
  });
  const existingItems = (existingRows || []).map(knowledgeItemFromRow);
  const annotated = annotateDuplicatesAndConflicts(extracted, existingItems);
  const rows = annotated.map((item) => knowledgeItemToDb(context, item));

  const { data: insertedItems, error: itemsError } = rows.length
    ? await supabase.from("social_knowledge_items").insert(rows).select("*")
    : { data: [], error: null };
  if (itemsError) databaseError(itemsError);

  const byCategory = (insertedItems || []).reduce((acc: Record<string, number>, item: any) => {
    acc[item.category] = (acc[item.category] || 0) + 1;
    return acc;
  }, {});

  const { data: updatedSource, error: updateSourceError } = await supabase
    .from("social_knowledge_sources")
    .update({
      item_count: insertedItems?.length || 0,
      source_metadata_json: {
        filename: input.filename || null,
        mimeType: input.mimeType || null,
        textLength: input.text.length,
        categories: byCategory,
      },
    })
    .eq("id", source.id)
    .eq("organization_id", context.organizationId)
    .eq("user_email", context.userEmail)
    .select("*")
    .single();
  if (updateSourceError) databaseError(updateSourceError);

  await logAudit(supabase, context, "knowledge_file_imported", "knowledge_source", source.id, {
    contentHash,
    itemCount: insertedItems?.length || 0,
    categories: byCategory,
  });

  return {
    source: updatedSource,
    items: insertedItems || [],
    summary: {
      skipped: false,
      itemCount: insertedItems?.length || 0,
      categories: byCategory,
      needsReview: insertedItems?.filter((item: any) => item.verification_status === "needs_review").length || 0,
      duplicates: insertedItems?.filter((item: any) => item.possible_duplicate_of).length || 0,
      conflicts: insertedItems?.filter((item: any) => item.conflict_group).length || 0,
      sensitive: insertedItems?.filter((item: any) => item.sensitive).length || 0,
    },
  };
}

export async function updateKnowledgeItem(context: SocialRouteContext, rawInput: KnowledgeItemUpdateInput) {
  const supabase = requireSupabase();
  const input = KnowledgeItemUpdateInputSchema.parse(rawInput);

  const { data: existing, error: existingError } = await supabase
    .from("social_knowledge_items")
    .select("*")
    .eq("id", input.id)
    .eq("organization_id", context.organizationId)
    .eq("user_email", context.userEmail)
    .maybeSingle();
  if (existingError) databaseError(existingError);
  if (!existing) throw new SocialIntelligencePersistenceError("ACCESS_DENIED", "Kunnskapselementet finnes ikke eller er utilgjengelig.", 404);

  const willBeSensitive = input.sensitive ?? Boolean(existing.sensitive);
  if (input.publicUseAllowed && willBeSensitive) {
    throw Object.assign(new Error("Sensitive elementer kan ikke brukes i offentlig profiltekst uten særskilt manuell prosess."), {
      code: "SENSITIVE_PUBLIC_USE_BLOCKED",
      status: 400,
    });
  }

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.verificationStatus !== undefined) {
    payload.verification_status = input.verificationStatus;
    if (["user_confirmed", "document_verified"].includes(input.verificationStatus)) {
      payload.approved_at = new Date().toISOString();
      payload.rejected_at = null;
    }
    if (input.verificationStatus === "rejected") {
      payload.rejected_at = new Date().toISOString();
      payload.public_use_allowed = false;
    }
  }
  if (input.publicUseAllowed !== undefined) {
    payload.public_use_allowed = input.publicUseAllowed && !willBeSensitive;
    if (input.publicUseAllowed && !willBeSensitive) payload.visibility = "public_approved";
  }
  if (input.sensitive !== undefined) {
    payload.sensitive = input.sensitive;
    if (input.sensitive) {
      payload.public_use_allowed = false;
      payload.visibility = "private";
    }
  }
  if (input.visibility !== undefined) payload.visibility = input.visibility;
  if (input.title !== undefined) payload.title = input.title;
  if (input.content !== undefined) payload.content = input.content;
  if (input.summary !== undefined) payload.summary = input.summary;
  if (input.tags !== undefined) payload.tags = input.tags;
  if (input.allowedProfileTypes !== undefined) payload.allowed_profile_types = input.allowedProfileTypes;
  if (input.reviewNotes !== undefined) payload.review_notes = input.reviewNotes;

  const { data, error } = await supabase
    .from("social_knowledge_items")
    .update(payload)
    .eq("id", input.id)
    .eq("organization_id", context.organizationId)
    .eq("user_email", context.userEmail)
    .select("*")
    .single();
  if (error) databaseError(error);

  await logAudit(supabase, context, "knowledge_item_updated", "knowledge_item", data.id, {
    verificationStatus: data.verification_status,
    publicUseAllowed: data.public_use_allowed,
    sensitive: data.sensitive,
  });
  return data;
}

export async function updateKnowledgeSource(context: SocialRouteContext, rawInput: KnowledgeSourceUpdateInput) {
  const supabase = requireSupabase();
  const input = KnowledgeSourceUpdateInputSchema.parse(rawInput);
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.status !== undefined) payload.status = input.status;
  if (input.aiUseAllowed !== undefined) payload.ai_use_allowed = input.aiUseAllowed;
  if (input.publicUseAllowed !== undefined) payload.public_use_allowed = input.publicUseAllowed;
  if (input.visibility !== undefined) payload.visibility = input.visibility;

  const { data, error } = await supabase
    .from("social_knowledge_sources")
    .update(payload)
    .eq("id", input.id)
    .eq("organization_id", context.organizationId)
    .eq("user_email", context.userEmail)
    .select("*")
    .single();
  if (error) databaseError(error);

  await logAudit(supabase, context, "knowledge_source_updated", "knowledge_source", data.id, payload);
  return data;
}

export async function saveProfileGoal(context: SocialRouteContext, rawInput: ProfileGoalInput) {
  const supabase = requireSupabase();
  const input = ProfileGoalInputSchema.parse(rawInput);
  const payload = {
    ...scope(context),
    name: input.name,
    description: input.description,
    primary_platform: input.primaryPlatform,
    profile_type: input.profileType,
    success_metrics: input.successMetrics,
    priority: input.priority,
    is_active: input.isActive,
    updated_at: new Date().toISOString(),
  };
  const query = input.id
    ? supabase.from("social_profile_goals").update(payload).eq("id", input.id).eq("organization_id", context.organizationId).eq("user_email", context.userEmail)
    : supabase.from("social_profile_goals").insert(payload);
  const { data, error } = await query.select("*").single();
  if (error) databaseError(error);
  await logAudit(supabase, context, input.id ? "profile_goal_updated" : "profile_goal_created", "profile_goal", data.id, { profileType: input.profileType });
  return data;
}

export async function saveTargetAudience(context: SocialRouteContext, rawInput: TargetAudienceInput) {
  const supabase = requireSupabase();
  const input = TargetAudienceInputSchema.parse(rawInput);
  const payload = {
    ...scope(context),
    name: input.name,
    description: input.description,
    markets: input.markets,
    needs: input.needs,
    objections: input.objections,
    languages: input.languages,
    is_active: input.isActive,
    updated_at: new Date().toISOString(),
  };
  const query = input.id
    ? supabase.from("social_target_audiences").update(payload).eq("id", input.id).eq("organization_id", context.organizationId).eq("user_email", context.userEmail)
    : supabase.from("social_target_audiences").insert(payload);
  const { data, error } = await query.select("*").single();
  if (error) databaseError(error);
  await logAudit(supabase, context, input.id ? "target_audience_updated" : "target_audience_created", "target_audience", data.id, { markets: input.markets });
  return data;
}

export async function saveProfileVariant(context: SocialRouteContext, rawInput: ProfileVariantInput) {
  const supabase = requireSupabase();
  const input = ProfileVariantInputSchema.parse(rawInput);
  const payload = {
    ...scope(context),
    name: input.name,
    profile_type: input.profileType,
    primary_platform: input.primaryPlatform,
    goal_id: input.goalId || null,
    audience_id: input.audienceId || null,
    tone: input.tone,
    focus_tags: input.focusTags,
    instructions: input.instructions,
    status: input.status,
    updated_at: new Date().toISOString(),
  };
  const query = input.id
    ? supabase.from("social_profile_variants").update(payload).eq("id", input.id).eq("organization_id", context.organizationId).eq("user_email", context.userEmail)
    : supabase.from("social_profile_variants").insert(payload);
  const { data, error } = await query.select("*").single();
  if (error) databaseError(error);
  await logAudit(supabase, context, input.id ? "profile_variant_updated" : "profile_variant_created", "profile_variant", data.id, { profileType: input.profileType });
  return data;
}

export async function generateProfileSuggestions(context: SocialRouteContext, rawInput: GenerateProfileSuggestionsInput) {
  const supabase = requireSupabase();
  const input = GenerateProfileSuggestionsInputSchema.parse(rawInput);
  const scoped = scope(context);

  const { data: variant, error: variantError } = await supabase
    .from("social_profile_variants")
    .select("*")
    .match(scoped)
    .eq("id", input.variantId)
    .maybeSingle();
  if (variantError) databaseError(variantError);
  if (!variant) throw new SocialIntelligencePersistenceError("ACCESS_DENIED", "Profilvarianten finnes ikke eller er utilgjengelig.", 404);

  const [goalRes, audienceRes, profileRes, itemsRes, sourcesRes] = await Promise.all([
    variant.goal_id ? supabase.from("social_profile_goals").select("*").match(scoped).eq("id", variant.goal_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    variant.audience_id ? supabase.from("social_target_audiences").select("*").match(scoped).eq("id", variant.audience_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    supabase.from("social_brand_profiles").select("*").match(scoped).maybeSingle(),
    supabase.from("social_knowledge_items").select("*").match(scoped).neq("verification_status", "deleted").limit(1_000),
    supabase.from("social_knowledge_sources").select("*").match(scoped).neq("status", "deleted").limit(200),
  ]);
  for (const result of [goalRes, audienceRes, profileRes, itemsRes, sourcesRes]) {
    if (result.error) databaseError(result.error);
  }

  const items = (itemsRes.data || []).map(knowledgeItemFromRow);
  const sources = (sourcesRes.data || []).map(sourceFromRow);
  const variantLike = profileVariantFromRow(variant, goalRes.data, audienceRes.data);
  const relevant = selectRelevantKnowledgeForProfile({ items, sources, variant: variantLike });
  const generated = generateProfileSuggestionsFromKnowledge({
    relevant,
    variant: variantLike,
    currentProfile: profileFromRow(profileRes.data),
  });
  const itemsById = new Map(items.map((item) => [String(item.id), item]));

  const { error: archiveError } = await supabase
    .from("social_profile_suggestions")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .match(scoped)
    .eq("variant_id", variant.id)
    .eq("status", "draft");
  if (archiveError) databaseError(archiveError);

  const suggestionRows = generated.suggestions.map((suggestion) => ({
    ...scoped,
    variant_id: variant.id,
    field_key: suggestion.fieldKey,
    label: suggestion.label,
    suggested_value_json: suggestion.suggestedValue,
    current_value_json: suggestion.currentValue ?? null,
    rationale: suggestion.rationale,
    confidence: suggestion.confidence,
    source_knowledge_ids: suggestion.sourceKnowledgeIds,
    source_summary_json: sourceSummaryForSuggestion(itemsById, suggestion.sourceKnowledgeIds),
    safety_warnings: suggestion.safetyWarnings,
    status: "draft",
  }));

  const { data: suggestions, error: suggestionError } = suggestionRows.length
    ? await supabase.from("social_profile_suggestions").insert(suggestionRows).select("*")
    : { data: [], error: null };
  if (suggestionError) databaseError(suggestionError);

  const generatedProfile = generated.suggestions.reduce((acc: Record<string, unknown>, suggestion) => {
    acc[suggestion.fieldKey] = suggestion.suggestedValue;
    return acc;
  }, {});

  const { data: updatedVariant, error: updateVariantError } = await supabase
    .from("social_profile_variants")
    .update({
      status: "generated",
      generated_profile_json: generatedProfile,
      coverage_json: generated.sourceCoverage,
      last_generated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", variant.id)
    .eq("organization_id", context.organizationId)
    .eq("user_email", context.userEmail)
    .select("*")
    .single();
  if (updateVariantError) databaseError(updateVariantError);

  await logAudit(supabase, context, "profile_suggestions_generated", "profile_variant", variant.id, {
    suggestionCount: suggestions?.length || 0,
    selectedKnowledgeItems: generated.sourceCoverage.selectedKnowledgeItems,
  });

  return { variant: updatedVariant, suggestions: suggestions || [], coverage: generated.sourceCoverage };
}

export async function decideProfileSuggestion(context: SocialRouteContext, rawInput: ProfileSuggestionDecisionInput) {
  const supabase = requireSupabase();
  const input = ProfileSuggestionDecisionInputSchema.parse(rawInput);
  const scoped = scope(context);

  const { data: suggestion, error: suggestionError } = await supabase
    .from("social_profile_suggestions")
    .select("*")
    .match(scoped)
    .eq("id", input.id)
    .maybeSingle();
  if (suggestionError) databaseError(suggestionError);
  if (!suggestion) throw new SocialIntelligencePersistenceError("ACCESS_DENIED", "Profilforslaget finnes ikke eller er utilgjengelig.", 404);

  const approvedValue = input.approvedValue === undefined ? suggestion.suggested_value_json : input.approvedValue;
  const { data: updatedSuggestion, error: updateSuggestionError } = await supabase
    .from("social_profile_suggestions")
    .update({
      status: input.status,
      approved_value_json: input.status === "approved" ? approvedValue : null,
      decided_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .match(scoped)
    .eq("id", input.id)
    .select("*")
    .single();
  if (updateSuggestionError) databaseError(updateSuggestionError);

  if (input.status === "approved") {
    const { data: variant, error: variantError } = await supabase
      .from("social_profile_variants")
      .select("*")
      .match(scoped)
      .eq("id", suggestion.variant_id)
      .maybeSingle();
    if (variantError) databaseError(variantError);
    if (!variant) throw new SocialIntelligencePersistenceError("ACCESS_DENIED", "Profilvarianten finnes ikke eller er utilgjengelig.", 404);

    const approvedProfile = {
      ...safeRecord(variant.approved_profile_json),
      [suggestion.field_key]: approvedValue,
    };
    const sourceKnowledgeIds = Array.isArray(suggestion.source_knowledge_ids) ? suggestion.source_knowledge_ids : [];
    const approvedSuggestionIds = Array.isArray(variant.approved_suggestion_ids)
      ? uniqueStrings([...variant.approved_suggestion_ids, suggestion.id])
      : [suggestion.id];

    const { error: updateVariantError } = await supabase
      .from("social_profile_variants")
      .update({
        status: "approved",
        approved_profile_json: approvedProfile,
        approved_suggestion_ids: approvedSuggestionIds,
        updated_at: new Date().toISOString(),
      })
      .match(scoped)
      .eq("id", variant.id);
    if (updateVariantError) databaseError(updateVariantError);

    const { error: versionError } = await supabase.from("social_profile_variant_versions").insert({
      ...scoped,
      variant_id: variant.id,
      profile_json: approvedProfile,
      approved_suggestion_ids: approvedSuggestionIds,
      source_knowledge_ids: sourceKnowledgeIds,
      created_by: "user",
    });
    if (versionError) databaseError(versionError);
  }

  await logAudit(supabase, context, "profile_suggestion_decided", "profile_suggestion", suggestion.id, {
    status: input.status,
    fieldKey: suggestion.field_key,
  });

  return updatedSuggestion;
}

export async function saveSocialPost(context: SocialRouteContext, rawInput: unknown) {
  const supabase = requireSupabase();
  const input = SocialPostInputSchema.parse(rawInput);
  const dashboard = await loadSocialDashboard(context);
  const profile = dashboard.profile;
  const content = input.content || generatePostDraft({
    profile: profile || BrandProfileInputSchema.parse({}),
    goal: input.goal,
    targetAudience: input.targetAudience,
    language: input.language,
  });
  const quality = scoreSocialPost({
    content,
    goal: input.goal,
    platform: input.platform,
    targetAudience: input.targetAudience,
    tone: input.tone,
    brandKeywords: profile ? [...profile.expertise, ...profile.services, ...profile.markets, ...profile.geographicAreas] : [],
  });
  const payload = {
    ...scope(context),
    platform: input.platform,
    title: input.title,
    content,
    language: input.language,
    tone: input.tone,
    content_type: input.contentType,
    pillar_id: input.pillarId || null,
    goal: input.goal,
    target_audience: input.targetAudience,
    hook_type: input.hookType,
    cta_type: input.ctaType,
    quality_score: quality.total,
    quality_analysis_json: quality,
    status: input.status,
    scheduled_at: input.scheduledAt || null,
    published_at: input.publishedAt || (input.status === "published" ? new Date().toISOString() : null),
    campaign_id: input.campaignId || null,
    updated_at: new Date().toISOString(),
  };

  const query = input.id
    ? supabase.from("social_posts").update(payload).eq("id", input.id).eq("organization_id", context.organizationId).eq("user_email", context.userEmail)
    : supabase.from("social_posts").insert(payload);
  const { data, error } = await query.select("*").single();
  if (error) databaseError(error);

  const { error: versionError } = await supabase.from("social_post_versions").insert({
    ...scope(context),
    post_id: data.id,
    content,
    generation_instruction: input.id ? "saved_edit" : "created_draft",
    model: "rule-quality-score",
    prompt_version: SOCIAL_INTELLIGENCE_PROMPT_VERSION,
  });
  if (versionError) databaseError(versionError);
  await logAudit(supabase, context, input.id ? "post_updated" : "post_created", "post", data.id, { status: input.status });
  return { post: data, quality };
}

export async function acceptProfileSection(context: SocialRouteContext, input: { id: string; approvedContent: string }) {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("social_profile_sections")
    .update({
      approved_content: input.approvedContent,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id)
    .eq("organization_id", context.organizationId)
    .eq("user_email", context.userEmail)
    .select("*")
    .single();
  if (error) databaseError(error);
  const { error: versionError } = await supabase.from("social_profile_versions").insert({
    ...scope(context),
    section_id: data.id,
    content: input.approvedContent,
    generated_by: "accepted_ai",
    prompt_version: SOCIAL_INTELLIGENCE_PROMPT_VERSION,
  });
  if (versionError) databaseError(versionError);
  await logAudit(supabase, context, "section_approved", "section", data.id, { sectionType: data.section_type });
  return data;
}

export async function savePostMetrics(context: SocialRouteContext, input: SocialMetricsInput) {
  const supabase = requireSupabase();
  const { data: post, error: postError } = await supabase
    .from("social_posts")
    .select("id")
    .eq("id", input.postId)
    .eq("organization_id", context.organizationId)
    .eq("user_email", context.userEmail)
    .maybeSingle();
  if (postError) databaseError(postError);
  if (!post) throw new SocialIntelligencePersistenceError("ACCESS_DENIED", "Innlegget finnes ikke eller er utilgjengelig.", 404);

  const { data, error } = await supabase
    .from("social_post_metrics")
    .insert({
      ...scope(context),
      post_id: input.postId,
      recorded_at: input.recordedAt || new Date().toISOString(),
      impressions: input.impressions,
      reach: input.reach,
      reactions: input.reactions,
      comments: input.comments,
      shares: input.shares,
      saves: input.saves,
      clicks: input.clicks,
      profile_views: input.profileViews,
      followers_gained: input.followersGained,
      messages: input.messages,
      leads: input.leads,
      meetings: input.meetings,
      sales: input.sales,
      notes: input.notes,
    })
    .select("*")
    .single();
  if (error) databaseError(error);
  await logAudit(supabase, context, "metrics_recorded", "metric", data.id, { postId: input.postId });
  return data;
}

export async function linkSocialEntity(context: SocialRouteContext, input: SocialEntityLinkInput) {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("social_entity_links")
    .insert({
      ...scope(context),
      social_entity_type: input.socialEntityType,
      social_entity_id: input.socialEntityId,
      crm_entity_type: input.crmEntityType,
      crm_entity_id: input.crmEntityId,
      relationship_type: input.relationshipType,
    })
    .select("*")
    .single();
  if (error) databaseError(error);
  await logAudit(supabase, context, "crm_entity_linked", input.socialEntityType, input.socialEntityId, {
    crmEntityType: input.crmEntityType,
    crmEntityId: input.crmEntityId,
  });
  return data;
}

export async function updateRecommendationStatus(context: SocialRouteContext, input: { id: string; status: string }) {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("social_ai_recommendations")
    .update({ status: input.status, updated_at: new Date().toISOString() })
    .eq("id", input.id)
    .eq("organization_id", context.organizationId)
    .eq("user_email", context.userEmail)
    .select("*")
    .single();
  if (error) databaseError(error);
  await logAudit(supabase, context, "recommendation_status_updated", "recommendation", data.id, { status: input.status });
  return data;
}

export function summarizeSafeError(error: unknown) {
  if (error instanceof SocialIntelligencePersistenceError) {
    return { code: error.code, message: error.message, status: error.status };
  }
  if (error instanceof Error) {
    return { code: "INTERNAL_ERROR", message: error.message, status: 500 };
  }
  return { code: "INTERNAL_ERROR", message: "Ukjent feil", status: 500 };
}

export function compactAnalysisForClient(analysis: SocialProfileAnalysis) {
  return {
    ...analysis,
    sections: analysis.sections.map((section) => ({
      ...section,
      analysis: safeRecord(section.analysis),
    })),
  };
}
