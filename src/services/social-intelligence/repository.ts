import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { RequestAccessContext } from "@/lib/api-admin";
import {
  BrandProfileInputSchema,
  SOCIAL_DEFAULT_ORGANIZATION_ID,
  SOCIAL_INTELLIGENCE_PROMPT_VERSION,
  SocialPostInputSchema,
  normalizeEmail,
  normalizeOrganizationId,
  safeRecord,
  type BrandProfileInput,
  type SocialAnalyzeRequest,
  type SocialEntityLinkInput,
  type SocialMetricsInput,
  type SocialProfileAnalysis,
} from "./contracts";
import { analyzeProfessionalProfile, generatePostDraft, sha256ContentHash } from "./analysis";
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
  ]);

  for (const result of [profileRes, importsRes, sectionsRes, skillsRes, pillarsRes, ideasRes, postsRes, metricsRes, recommendationsRes, linksRes]) {
    if (result.error) databaseError(result.error);
  }

  const profile = profileFromRow(profileRes.data);
  const sections = (sectionsRes.data || []) as SocialSectionLike[];
  const posts = (postsRes.data || []) as SocialPostLike[];
  const metrics = (metricsRes.data || []) as SocialMetricLike[];
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
    },
  };
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
