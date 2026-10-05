import { NextRequest, NextResponse } from "next/server";
import { requireBrandWorkspace } from "@/lib/workspaces/require-brand-workspace";
import { api1881Configured, search1881Company } from "@/lib/corporate-enrichment/api1881";
import { fetchBrregCompanySnapshot } from "@/lib/corporate-enrichment/brreg";
import { buildCorporateEnrichmentProfile } from "@/lib/corporate-enrichment/company-profile";
import { buildCorporateAccountAdvice } from "@/lib/nexus/corporate-account-advisor";
import { runCorporateSalesCoach } from "@/lib/nexus/corporate-sales-coach";
import { evaluateCorporateStageGate, stageIndex } from "@/lib/nexus/corporate-sales-stage-gate";
import { getAdminEmails } from "@/lib/admin-auth";
import { runAccountDeepResearch, summarizeIntelligenceForAccount } from "@/lib/corporate-intelligence";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const noStore = { "Cache-Control": "private, no-store" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fail(status: number, code: string, message?: string) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status, headers: noStore });
}

function safeWrite(request: NextRequest) {
  const origin = request.headers.get("origin");
  return request.headers.get("content-type")?.toLowerCase().startsWith("application/json") &&
    (!origin || origin === new URL(request.url).origin) &&
    request.headers.get("sec-fetch-site") !== "cross-site";
}

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function nullable(value: unknown, max: number) {
  const result = clean(value, max);
  return result || null;
}

function cleanEmail(value: unknown) {
  const result = clean(value, 254).toLowerCase();
  return result && emailPattern.test(result) ? result : null;
}

function cleanUrl(value: unknown, linkedinOnly = false) {
  const result = clean(value, 800);
  if (!result) return null;
  try {
    const parsed = new URL(result);
    if (!["https:", "http:"].includes(parsed.protocol)) return null;
    if (linkedinOnly && !/(^|\.)linkedin\.com$/i.test(parsed.hostname)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function stringList(value: unknown, maxItems = 12, maxLength = 120) {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => clean(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}


function ownerDisplayName(email: string) {
  const local = email.split("@")[0] || email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || email;
}

async function loadAssignableCorporateOwners(supabase: any, brandKey: string, actorEmail?: string) {
  const configuredOwners = getAdminEmails()
    .map(email => email.trim().toLowerCase())
    .filter(email => emailPattern.test(email));

  // core is intentionally not exposed through the Data API. Use the existing
  // service-role-only snapshot RPC, then return only active Corporate users
  // for this brand to the client.
  const { data: snapshot, error: snapshotError } = await supabase.rpc("workspace_user_admin_snapshot");
  const snapshotUsers = !snapshotError &&
    snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) &&
    Array.isArray((snapshot as Record<string, unknown>).users)
      ? (snapshot as { users: any[] }).users
      : [];

  const byEmail = new Map<string, { email: string; displayName: string; role: "OWNER" | "MEMBER" }>();
  for (const email of configuredOwners) {
    byEmail.set(email, { email, displayName: ownerDisplayName(email), role: "OWNER" });
  }

  const now = Date.now();
  for (const user of snapshotUsers) {
    if (String(user?.status || "") !== "active") continue;
    const expiresAt = user?.access_expires_at ? Date.parse(String(user.access_expires_at)) : null;
    if (expiresAt && Number.isFinite(expiresAt) && expiresAt <= now) continue;

    const memberships = Array.isArray(user?.memberships) ? user.memberships : [];
    const membership = memberships.find((item: any) =>
      String(item?.brand_key || "") === brandKey &&
      String(item?.status || "") === "active",
    );
    if (!membership) continue;

    const permissions = Array.isArray(membership.permissions) ? membership.permissions : [];
    if (!permissions.includes("corporate.read") && !permissions.includes("corporate.plan")) continue;

    const email = String(user?.email || "").trim().toLowerCase();
    if (!emailPattern.test(email)) continue;
    byEmail.set(email, {
      email,
      displayName: String(user?.display_name || "").trim() || ownerDisplayName(email),
      role: configuredOwners.includes(email) ? "OWNER" : "MEMBER",
    });
  }

  const normalizedActor = String(actorEmail || "").trim().toLowerCase();
  if (normalizedActor && emailPattern.test(normalizedActor) && !byEmail.has(normalizedActor)) {
    byEmail.set(normalizedActor, {
      email: normalizedActor,
      displayName: ownerDisplayName(normalizedActor),
      role: configuredOwners.includes(normalizedActor) ? "OWNER" : "MEMBER",
    });
  }

  const users = [...byEmail.values()].sort((a, b) => {
    if (a.role !== b.role) return a.role === "OWNER" ? -1 : 1;
    return a.displayName.localeCompare(b.displayName, "nb");
  });
  const defaultOwnerEmail = configuredOwners[0] || normalizedActor || users[0]?.email || null;

  return {
    users,
    defaultOwnerEmail,
    degraded: Boolean(snapshotError),
  };
}

function api1881FailureMessage(cause: unknown) {
  const error = cause as Error & { status?: number; body?: unknown; endpoint?: string };
  const status = Number.isFinite(error?.status) ? Number(error.status) : null;
  const body = error?.body && typeof error.body === "object" && !Array.isArray(error.body)
    ? error.body as Record<string, unknown>
    : null;
  const providerMessage = [
    body?.message,
    body?.error_description,
    body?.detail,
    body?.title,
    typeof body?.error === "string" ? body.error : null,
  ].find(value => typeof value === "string" && value.trim());
  const cleanedProviderMessage = typeof providerMessage === "string"
    ? providerMessage.replace(/[\r\n\t]+/g, " ").trim().slice(0, 280)
    : "";
  if (status) return `1881 svarte HTTP ${status}${cleanedProviderMessage ? `: ${cleanedProviderMessage}` : "."}`;
  return error instanceof Error && error.message
    ? `1881-oppslaget feilet (${error.message}).`
    : "1881-oppslaget feilet.";
}

async function loadAccount(supabase: any, prospectId: string, brandKey: string, actorEmail: string) {
  const [
    prospectResult,
    strategyResult,
    contactsResult,
    touchpointsResult,
    enrichmentResult,
    coachRunsResult,
    intelligenceResult,
    marketIntelligenceResult,
    regulatoryIntelligenceResult,
  ] = await Promise.all([
    supabase.from("corporate_prospects")
      .select("id,company_name,organization_number,domain,organization_type,country_code,city,industry,employee_count,employee_band,member_count,website_url,linkedin_company_url,status,fit_score,fit_tier,fit_reasons,evidence_gaps,decision_roles,source_url,evidence,next_action,next_followup,updated_at")
      .eq("id", prospectId).eq("brand_id", "zeneco").maybeSingle(),
    supabase.from("corporate_account_strategies")
      .select("*").eq("prospect_id", prospectId).maybeSingle(),
    supabase.from("corporate_prospect_contacts")
      .select("id,name,title,buying_role,seniority,email,phone,linkedin_url,source_url,confidence,status,is_primary,relationship_status,influence_level,professional_relevance,professional_topics,linkedin_following,linkedin_last_touched_at,verified_at,updated_at")
      .eq("prospect_id", prospectId)
      .order("is_primary", { ascending: false })
      .order("updated_at", { ascending: false }),
    supabase.from("corporate_account_touchpoints")
      .select("id,contact_id,channel,activity_type,status,direction,owner_email,due_at,completed_at,summary,external_url,metadata,created_by_email,updated_at")
      .eq("prospect_id", prospectId)
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(120),
    supabase.from("corporate_account_enrichment")
      .select("id,provider,data_kind,provider_record_id,source_url,payload,fetched_at,verified_at,verified_by_email")
      .eq("prospect_id", prospectId)
      .order("fetched_at", { ascending: false })
      .limit(60),
    supabase.from("corporate_sales_coach_runs")
      .select("id,mode,source_text,seller_context,output,provider,model,created_by_email,created_at,applied_at,applied_by_email,applied_fields")
      .eq("prospect_id", prospectId)
      .order("created_at", { ascending: false })
      .limit(12),
    supabase.from("corporate_intelligence_findings")
      .select("id,scope,signal_type,title,summary,why_it_matters,source_url,source_title,source_kind,source_published_at,first_seen_at,last_seen_at,change_status,direction,relevance,strength,freshness,source_authority,confidence,fit_delta,timing_delta,intent_delta,financial_capacity_delta,evidence,active")
      .eq("prospect_id", prospectId)
      .eq("scope", "ACCOUNT")
      .eq("active", true)
      .order("last_seen_at", { ascending: false })
      .limit(40),
    supabase.from("corporate_intelligence_findings")
      .select("id,scope,signal_type,title,summary,why_it_matters,source_url,source_title,source_kind,source_published_at,last_seen_at,change_status,direction,relevance,confidence")
      .is("prospect_id", null)
      .eq("scope", "MARKET")
      .eq("active", true)
      .order("last_seen_at", { ascending: false })
      .limit(8),
    supabase.from("corporate_intelligence_findings")
      .select("id,scope,signal_type,title,summary,why_it_matters,source_url,source_title,source_kind,source_published_at,last_seen_at,change_status,direction,relevance,confidence")
      .is("prospect_id", null)
      .eq("scope", "REGULATORY")
      .eq("active", true)
      .order("last_seen_at", { ascending: false })
      .limit(8),
  ]);

  const error = prospectResult.error || strategyResult.error || contactsResult.error ||
    touchpointsResult.error || enrichmentResult.error || coachRunsResult.error ||
    intelligenceResult.error || marketIntelligenceResult.error || regulatoryIntelligenceResult.error;
  if (error) return { error };
  if (!prospectResult.data) return { notFound: true };

  const assignmentOptions = await loadAssignableCorporateOwners(supabase, brandKey, actorEmail);
  const intelligenceSummary = summarizeIntelligenceForAccount(intelligenceResult.data || []);
  const advisor = buildCorporateAccountAdvice({
    prospect: prospectResult.data,
    strategy: strategyResult.data || null,
    contacts: contactsResult.data || [],
    touchpoints: touchpointsResult.data || [],
    enrichment: enrichmentResult.data || [],
    intelligence: intelligenceSummary,
  });
  const stageGate = evaluateCorporateStageGate({
    strategy: strategyResult.data || null,
    advisor,
    contacts: contactsResult.data || [],
    touchpoints: touchpointsResult.data || [],
  });

  return {
    data: {
      prospect: prospectResult.data,
      strategy: strategyResult.data || null,
      assignmentOptions,
      contacts: contactsResult.data || [],
      touchpoints: touchpointsResult.data || [],
      enrichment: enrichmentResult.data || [],
      coachRuns: coachRunsResult.data || [],
      intelligence: {
        account: intelligenceResult.data || [],
        summary: intelligenceSummary,
        market: marketIntelligenceResult.data || [],
        regulatory: regulatoryIntelligenceResult.data || [],
      },
      companyProfile: buildCorporateEnrichmentProfile(
        prospectResult.data,
        enrichmentResult.data || [],
      ),
      advisor,
      stageGate,
      enrichmentCapabilities: {
        brreg: { available: true, mode: "company_open_data" },
        api1881: {
          available: api1881Configured(),
          mode: "licensed_provider",
          configured: api1881Configured(),
        },
        linkedin: {
          available: true,
          mode: "manual_relationship_channel",
          scraping: false,
          arbitraryProfileApiEnrichment: false,
        },
      },
    },
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: { brandKey: string; prospectId: string } },
) {
  if (params.brandKey !== "zeneco" || !uuid.test(params.prospectId)) return fail(404, "ACCOUNT_NOT_FOUND");

  const access = await requireBrandWorkspace(request, params.brandKey, "corporate.read");
  if (!access.value) return access.response;

  const account = await loadAccount(access.value.supabase, params.prospectId, params.brandKey, access.value.verifiedEmail);
  if ("error" in account) return fail(503, "CORPORATE_ACCOUNT_UNAVAILABLE");
  if ("notFound" in account) return fail(404, "ACCOUNT_NOT_FOUND");

  return NextResponse.json({ ok: true, brand: params.brandKey, ...account.data }, { headers: noStore });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { brandKey: string; prospectId: string } },
) {
  if (!safeWrite(request)) return fail(403, "INVALID_REQUEST_ORIGIN");
  if (params.brandKey !== "zeneco" || !uuid.test(params.prospectId)) return fail(404, "ACCOUNT_NOT_FOUND");

  const access = await requireBrandWorkspace(request, params.brandKey, "corporate.plan");
  if (!access.value) return access.response;

  const input: unknown = await request.json().catch(() => null);
  if (!input || typeof input !== "object" || Array.isArray(input)) return fail(400, "INVALID_REQUEST");
  const body = input as Record<string, unknown>;
  const action = clean(body.action, 40);

  const { data: prospect, error: prospectError } = await access.value.supabase
    .from("corporate_prospects")
    .select("id")
    .eq("id", params.prospectId)
    .eq("brand_id", "zeneco")
    .maybeSingle();
  if (prospectError) return fail(503, "CORPORATE_ACCOUNT_UNAVAILABLE");
  if (!prospect) return fail(404, "ACCOUNT_NOT_FOUND");

  const actorEmail = access.value.verifiedEmail;

  if (action === "run_intelligence") {
    try {
      const result = await runAccountDeepResearch(access.value.supabase, params.prospectId, {
        trigger: "manual",
        createdByEmail: actorEmail,
      });
      return NextResponse.json({
        ok: true,
        result,
        externalAction: false,
        outreachStarted: false,
        pipelineMoved: false,
      }, { headers: noStore });
    } catch (cause) {
      return fail(503, "CORPORATE_INTELLIGENCE_FAILED", cause instanceof Error ? cause.message : "Corporate Intelligence feilet.");
    }
  }

    if (action === "sales_coach") {
    const mode = clean(body.mode, 30).toUpperCase();
    if (!["NEXT_STEP","DISCOVERY","EMAIL","ARGUMENTS","OBJECTION","MEETING"].includes(mode)) {
      return fail(400, "INVALID_COACH_MODE");
    }

    const account = await loadAccount(access.value.supabase, params.prospectId, params.brandKey, actorEmail);
    if ("error" in account) return fail(503, "CORPORATE_ACCOUNT_UNAVAILABLE");
    if ("notFound" in account) return fail(404, "ACCOUNT_NOT_FOUND");

    const result = await runCorporateSalesCoach({
      mode: mode as any,
      companyName: account.data.prospect.company_name,
      companyContext: account.data.prospect,
      strategy: account.data.strategy,
      contacts: account.data.contacts,
      touchpoints: account.data.touchpoints,
      advisor: account.data.advisor,
      sourceText: clean(body.sourceText, 16000),
      sellerContext: clean(body.sellerContext, 6000),
    });

    const { data: saved, error: saveError } = await access.value.supabase
      .from("corporate_sales_coach_runs")
      .insert({
        prospect_id: params.prospectId,
        mode,
        source_text: nullable(body.sourceText, 16000),
        seller_context: nullable(body.sellerContext, 6000),
        output: result.output,
        provider: result.provider,
        model: result.model,
        created_by_email: actorEmail,
      })
      .select("id,mode,source_text,seller_context,output,provider,model,created_by_email,created_at")
      .single();
    if (saveError || !saved) return fail(409, "SALES_COACH_SAVE_FAILED");

    return NextResponse.json({
      ok: true,
      coachRun: saved,
      output: result.output,
      provider: result.provider,
      model: result.model,
      externalAction: false,
      emailSent: false,
      linkedinMessageSent: false,
    }, { headers: noStore });
  }

  if (action === "apply_coach_strategy") {
    const coachRunId = clean(body.coachRunId, 80);
    if (!uuid.test(coachRunId)) return fail(400, "INVALID_COACH_RUN");

    const allowed = new Set([
      "problemHypothesis",
      "problemAcceptanceGoal",
      "solutionHypothesis",
      "solutionAcceptanceGoal",
      "nextBestAction",
      "nextActionReason",
    ]);
    const requested = stringList(body.fields, 8, 80).filter(field => allowed.has(field));
    if (!requested.length) return fail(400, "NO_COACH_FIELDS_SELECTED");

    const { data: run, error: runError } = await access.value.supabase
      .from("corporate_sales_coach_runs")
      .select("id,output")
      .eq("id", coachRunId)
      .eq("prospect_id", params.prospectId)
      .maybeSingle();
    if (runError || !run) return fail(404, "COACH_RUN_NOT_FOUND");

    const output = run.output && typeof run.output === "object" && !Array.isArray(run.output)
      ? run.output as Record<string, any> : {};
    const problem = output.problem && typeof output.problem === "object" ? output.problem : {};
    const solution = output.solution && typeof output.solution === "object" ? output.solution : {};
    const nextBest = output.nextBestAction && typeof output.nextBestAction === "object" ? output.nextBestAction : {};

    const candidates: Record<string, { column: string; value: string }> = {
      problemHypothesis: { column: "problem_hypothesis", value: clean(problem.hypothesis, 4000) },
      problemAcceptanceGoal: {
        column: "problem_acceptance_goal",
        value: stringList(problem.acceptanceSignals, 8, 500).join("\n"),
      },
      solutionHypothesis: { column: "solution_hypothesis", value: clean(solution.positioning, 4000) },
      solutionAcceptanceGoal: {
        column: "solution_acceptance_goal",
        value: stringList(solution.acceptanceQuestions, 8, 500).join("\n"),
      },
      nextBestAction: { column: "next_best_action", value: clean(nextBest.action, 3000) },
      nextActionReason: { column: "next_action_reason", value: clean(nextBest.why, 3000) },
    };

    const strategyUpdate: Record<string, unknown> = {};
    const appliedFields: string[] = [];
    for (const field of requested) {
      const candidate = candidates[field];
      if (!candidate?.value) continue;
      strategyUpdate[candidate.column] = candidate.value;
      appliedFields.push(field);
    }
    if (!appliedFields.length) return fail(409, "COACH_FIELDS_EMPTY");

    const { data: existingStrategy, error: existingStrategyError } = await access.value.supabase
      .from("corporate_account_strategies")
      .select("prospect_id")
      .eq("prospect_id", params.prospectId)
      .maybeSingle();
    if (existingStrategyError) return fail(409, "COACH_STRATEGY_APPLY_FAILED");

    let strategyData: Record<string, unknown> | null = null;
    if (existingStrategy) {
      const write = await access.value.supabase
        .from("corporate_account_strategies")
        .update({
          ...strategyUpdate,
          updated_by_email: actorEmail,
          updated_at: new Date().toISOString(),
        })
        .eq("prospect_id", params.prospectId)
        .select("*")
        .single();
      if (write.error || !write.data) return fail(409, "COACH_STRATEGY_APPLY_FAILED");
      strategyData = write.data as Record<string, unknown>;
    } else {
      const write = await access.value.supabase
        .from("corporate_account_strategies")
        .insert({
          prospect_id: params.prospectId,
          ...strategyUpdate,
          updated_by_email: actorEmail,
          created_by_email: actorEmail,
        })
        .select("*")
        .single();
      if (write.error || !write.data) return fail(409, "COACH_STRATEGY_APPLY_FAILED");
      strategyData = write.data as Record<string, unknown>;
    }

    const { error: runUpdateError } = await access.value.supabase
      .from("corporate_sales_coach_runs")
      .update({
        applied_at: new Date().toISOString(),
        applied_by_email: actorEmail,
        applied_fields: appliedFields,
      })
      .eq("id", coachRunId)
      .eq("prospect_id", params.prospectId);
    if (runUpdateError) return fail(409, "COACH_APPLY_AUDIT_FAILED");

    return NextResponse.json({
      ok: true,
      strategy: strategyData,
      appliedFields,
      humanApproved: true,
      externalAction: false,
      emailSent: false,
      linkedinMessageSent: false,
    }, { headers: noStore });
  }

  if (action === "enrich_brreg") {
    const { data: company, error: companyError } = await access.value.supabase
      .from("corporate_prospects")
      .select("id,company_name,organization_number")
      .eq("id", params.prospectId)
      .eq("brand_id", "zeneco")
      .maybeSingle();
    if (companyError || !company) return fail(404, "ACCOUNT_NOT_FOUND");

    const organizationNumber = String(company.organization_number || "").replace(/\D/g, "");
    if (!/^\d{9}$/.test(organizationNumber)) {
      return fail(409, "BRREG_ORGNR_UNAVAILABLE", "Organisasjonsnummer mangler eller er ugyldig.");
    }

    let result: unknown;
    try {
      result = await fetchBrregCompanySnapshot(organizationNumber);
    } catch (cause) {
      const error = cause as Error & { status?: number };
      const status = Number.isFinite(error?.status) ? Number(error.status) : null;
      return fail(
        502,
        error instanceof Error ? error.message : "BRREG_FAILED",
        status ? `Brønnøysund svarte HTTP ${status}.` : "Brønnøysund-oppslaget feilet.",
      );
    }

    const { data: saved, error: saveError } = await access.value.supabase
      .from("corporate_account_enrichment")
      .insert({
        prospect_id: params.prospectId,
        provider: "brreg",
        data_kind: "company_and_roles",
        provider_record_id: organizationNumber,
        source_url: `https://data.brreg.no/enhetsregisteret/api/enheter/${organizationNumber}`,
        payload: result && typeof result === "object" ? result : { value: result },
        verified_at: new Date().toISOString(),
        verified_by_email: actorEmail,
      })
      .select("id,provider,data_kind,source_url,payload,fetched_at")
      .single();
    if (saveError || !saved) return fail(409, "BRREG_SAVE_FAILED");

    return NextResponse.json({
      ok: true,
      enrichment: saved,
      openData: true,
      automaticPersonCreation: false,
      automaticOutreach: false,
      externalContactStarted: false,
    }, { headers: noStore });
  }

  if (action === "enrich_1881") {
    if (!api1881Configured()) {
      return fail(409, "API1881_NOT_CONFIGURED", "1881 API-credentials mangler i RealtyFlow.");
    }

    const { data: company, error: companyError } = await access.value.supabase
      .from("corporate_prospects")
      .select("id,company_name,organization_number")
      .eq("id", params.prospectId)
      .eq("brand_id", "zeneco")
      .maybeSingle();
    if (companyError || !company) return fail(404, "ACCOUNT_NOT_FOUND");

    const query = String(company.organization_number || company.company_name || "").trim();
    if (!query) return fail(409, "API1881_QUERY_UNAVAILABLE");

    let result: unknown;
    try {
      result = await search1881Company(query);
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "API1881_FAILED";
      return fail(502, code, api1881FailureMessage(cause));
    }

    const { data: saved, error: saveError } = await access.value.supabase
      .from("corporate_account_enrichment")
      .insert({
        prospect_id: params.prospectId,
        provider: "api1881",
        data_kind: "company_search",
        provider_record_id: null,
        source_url: "https://www.api1881.no/soke-api",
        payload: result && typeof result === "object" ? result : { value: result },
        verified_at: null,
        verified_by_email: null,
      })
      .select("id,provider,data_kind,source_url,payload,fetched_at")
      .single();
    if (saveError || !saved) return fail(409, "API1881_SAVE_FAILED");

    return NextResponse.json({
      ok: true,
      enrichment: saved,
      automaticPersonCreation: false,
      automaticOutreach: false,
      externalContactStarted: false,
    }, { headers: noStore });
  }

  if (action === "save_strategy") {
    const stage = clean(body.stage, 40).toUpperCase() || "TARGET";
    const priority = clean(body.priority, 10).toUpperCase() || "P2";
    const linkedinMotion = clean(body.linkedinMotion, 40).toUpperCase() || "MANUAL_APPROVAL";
    if (![
      "TARGET","RESEARCH","STRATEGY_READY","OUTREACH","ENGAGED","MEETING",
      "BUSINESS_CASE","SHORTLIST","DECISION","NEGOTIATION","WON","LOST",
    ].includes(stage) || !["P1","P2","P3"].includes(priority) ||
      !["OFF","MANUAL_APPROVAL","RELATIONSHIP_ONLY"].includes(linkedinMotion)) {
      return fail(400, "INVALID_STRATEGY");
    }

    const estimatedValue = body.estimatedValueEur === null || body.estimatedValueEur === ""
      ? null : Number(body.estimatedValueEur);
    if (estimatedValue !== null && (!Number.isFinite(estimatedValue) || estimatedValue < 0 || estimatedValue > 100000000)) {
      return fail(400, "INVALID_ESTIMATED_VALUE");
    }

    const targetDate = clean(body.targetDate, 20);
    const nextReviewAt = clean(body.nextReviewAt, 40);
    if (targetDate && !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return fail(400, "INVALID_TARGET_DATE");
    if (nextReviewAt && Number.isNaN(Date.parse(nextReviewAt))) return fail(400, "INVALID_REVIEW_DATE");

    const problemAcceptanceStatus = clean(body.problemAcceptanceStatus, 20).toUpperCase() || "UNKNOWN";
    const solutionAcceptanceStatus = clean(body.solutionAcceptanceStatus, 20).toUpperCase() || "UNKNOWN";
    const stageOverrideReason = clean(body.stageOverrideReason, 2000);
    if (!["UNKNOWN","PARTIAL","CONFIRMED","REJECTED"].includes(problemAcceptanceStatus) ||
        !["UNKNOWN","PARTIAL","CONFIRMED","REJECTED"].includes(solutionAcceptanceStatus)) {
      return fail(400, "INVALID_ACCEPTANCE_STATUS");
    }

    const assignable = await loadAssignableCorporateOwners(
      access.value.supabase,
      params.brandKey,
      actorEmail,
    );
    const allowedOwnerEmails = new Set(assignable.users.map(item => item.email));
    const fallbackOwnerEmail = assignable.defaultOwnerEmail || actorEmail;
    const accountOwnerEmail = cleanEmail(body.accountOwnerEmail) || fallbackOwnerEmail;
    const strategicOwnerEmail = cleanEmail(body.strategicOwnerEmail) || fallbackOwnerEmail;
    if ((accountOwnerEmail && !allowedOwnerEmails.has(accountOwnerEmail)) ||
        (strategicOwnerEmail && !allowedOwnerEmails.has(strategicOwnerEmail))) {
      return fail(
        400,
        "INVALID_ACCOUNT_OWNER",
        "Velg en aktiv RealtyFlow-bruker med Corporate-tilgang.",
      );
    }

    const payload = {
      prospect_id: params.prospectId,
      stage,
      priority,
      account_models: stringList(body.accountModels, 8, 80),
      objective: nullable(body.objective, 3000),
      entry_angle: nullable(body.entryAngle, 3000),
      first_offer: nullable(body.firstOffer, 3000),
      account_owner_email: accountOwnerEmail,
      strategic_owner_email: strategicOwnerEmail,
      estimated_value_eur: estimatedValue,
      target_date: targetDate || null,
      next_review_at: nextReviewAt ? new Date(nextReviewAt).toISOString() : null,
      notes: nullable(body.notes, 8000),
      linkedin_motion: linkedinMotion,
      account_role: ["END_CUSTOMER","PARTNER","MEMBER_ORGANIZATION","ADVISOR","REFERRAL_PARTNER"].includes(clean(body.accountRole, 40).toUpperCase())
        ? clean(body.accountRole, 40).toUpperCase() : "END_CUSTOMER",
      primary_model: nullable(body.primaryModel, 120),
      secondary_model: nullable(body.secondaryModel, 120),
      expansion_model: nullable(body.expansionModel, 120),
      recommended_entry_role: nullable(body.recommendedEntryRole, 180),
      champion_hypothesis: nullable(body.championHypothesis, 2000),
      problem_hypothesis: nullable(body.problemHypothesis, 4000),
      problem_acceptance_goal: nullable(body.problemAcceptanceGoal, 3000),
      solution_hypothesis: nullable(body.solutionHypothesis, 4000),
      solution_acceptance_goal: nullable(body.solutionAcceptanceGoal, 3000),
      core_message: nullable(body.coreMessage, 4000),
      avoid_message: nullable(body.avoidMessage, 3000),
      next_best_action: nullable(body.nextBestAction, 3000),
      next_action_reason: nullable(body.nextActionReason, 3000),
      business_case: body.businessCase && typeof body.businessCase === "object" && !Array.isArray(body.businessCase)
        ? body.businessCase : {},
      problem_acceptance_status: problemAcceptanceStatus,
      problem_acceptance_evidence: nullable(body.problemAcceptanceEvidence, 5000),
      solution_acceptance_status: solutionAcceptanceStatus,
      solution_acceptance_evidence: nullable(body.solutionAcceptanceEvidence, 5000),
      stage_override_reason: stageOverrideReason || null,
      updated_by_email: actorEmail,
      updated_at: new Date().toISOString(),
    };

    const currentAccount = await loadAccount(access.value.supabase, params.prospectId, params.brandKey, actorEmail);
    if ("error" in currentAccount) return fail(503, "CORPORATE_ACCOUNT_UNAVAILABLE");
    if ("notFound" in currentAccount) return fail(404, "ACCOUNT_NOT_FOUND");
    payload.stage_override_reason = stageOverrideReason || currentAccount.data.strategy?.stage_override_reason || null;
    const currentStage = clean(currentAccount.data.strategy?.stage, 40).toUpperCase() || "TARGET";
    const currentIndex = stageIndex(currentStage);
    const requestedIndex = stageIndex(stage);
    const proposedStrategy = { ...(currentAccount.data.strategy || {}), ...payload, stage: currentStage };
    const proposedAdvisor = buildCorporateAccountAdvice({
      prospect: currentAccount.data.prospect,
      strategy: proposedStrategy,
      contacts: currentAccount.data.contacts,
      touchpoints: currentAccount.data.touchpoints,
      enrichment: currentAccount.data.enrichment,
    });
    const gate = evaluateCorporateStageGate({
      strategy: proposedStrategy,
      advisor: proposedAdvisor,
      contacts: currentAccount.data.contacts,
      touchpoints: currentAccount.data.touchpoints,
    });
    const advancing = stage !== "LOST" && currentIndex >= 0 && requestedIndex > currentIndex;
    const skippingStage = advancing && requestedIndex > currentIndex + 1;
    if (advancing && (!gate.readyToAdvance || skippingStage) && stageOverrideReason.length < 12) {
      const missing = gate.criteria.filter(item => !item.met).map(item => item.label);
      const detail = skippingStage
        ? `Du forsøker å hoppe fra ${currentStage} til ${stage}.`
        : `Mangler: ${missing.join(" · ") || "fasekriterier"}.`;
      return fail(
        409,
        "STAGE_GATE_NOT_READY",
        `Fasevakt: ${detail} Legg inn en kort begrunnelse i «Overstyr fasevakt» dersom du bevisst skal gå videre.`,
      );
    }

    const { data, error } = await access.value.supabase
      .from("corporate_account_strategies")
      .upsert({ ...payload, created_by_email: actorEmail }, { onConflict: "prospect_id" })
      .select("*")
      .single();
    if (error || !data) return fail(409, "STRATEGY_SAVE_FAILED");

    return NextResponse.json({
      ok: true,
      strategy: data,
      externalAction: false,
      emailSent: false,
      linkedinMessageSent: false,
    }, { headers: noStore });
  }

  if (action === "save_contact") {
    const contactId = clean(body.contactId, 80);
    if (contactId && !uuid.test(contactId)) return fail(400, "INVALID_CONTACT");

    const name = clean(body.name, 180);
    const title = clean(body.title, 180);
    const email = cleanEmail(body.email);
    const phone = nullable(body.phone, 80);
    const linkedinUrl = cleanUrl(body.linkedinUrl, true);
    const sourceUrl = cleanUrl(body.sourceUrl);
    const relationshipStatus = clean(body.relationshipStatus, 40).toUpperCase() || "UNKNOWN";
    const influenceLevel = clean(body.influenceLevel, 40).toUpperCase() || "UNKNOWN";
    const status = clean(body.status, 40).toUpperCase() || "IDENTIFIED";
    const confidence = clean(body.confidence, 20).toUpperCase() || null;

    if (!name || !["UNKNOWN","NOT_CONTACTED","CONNECTED","ENGAGED","CHAMPION","BLOCKED"].includes(relationshipStatus) ||
      !["UNKNOWN","LOW","MEDIUM","HIGH","DECISION_MAKER"].includes(influenceLevel) ||
      !["IDENTIFIED","VERIFIED","CONTACT_READY","DO_NOT_CONTACT"].includes(status) ||
      (confidence && !["HIGH","MEDIUM","LOW"].includes(confidence))) {
      return fail(400, "INVALID_CONTACT");
    }
    if (status !== "IDENTIFIED" && status !== "DO_NOT_CONTACT" && !sourceUrl) {
      return fail(400, "SOURCE_REQUIRED_FOR_VERIFIED_CONTACT", "Verifiserte personopplysninger må ha en kilde.");
    }

    const payload = {
      prospect_id: params.prospectId,
      name,
      title: title || null,
      buying_role: nullable(body.buyingRole, 120),
      seniority: nullable(body.seniority, 80),
      email,
      phone,
      linkedin_url: linkedinUrl,
      source_url: sourceUrl,
      confidence,
      status,
      is_primary: body.isPrimary === true,
      relationship_status: relationshipStatus,
      influence_level: influenceLevel,
      professional_relevance: nullable(body.professionalRelevance, 2500),
      professional_topics: stringList(body.professionalTopics, 12, 100),
      linkedin_following: body.linkedinFollowing === true,
      linkedin_last_touched_at: body.linkedinLastTouchedAt && !Number.isNaN(Date.parse(String(body.linkedinLastTouchedAt)))
        ? new Date(String(body.linkedinLastTouchedAt)).toISOString() : null,
      verified_at: ["VERIFIED","CONTACT_READY"].includes(status) ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };

    const query = contactId
      ? access.value.supabase.from("corporate_prospect_contacts").update(payload).eq("id", contactId).eq("prospect_id", params.prospectId)
      : access.value.supabase.from("corporate_prospect_contacts").insert(payload);
    const { data, error } = await query.select("*").single();
    if (error || !data) return fail(409, "CONTACT_SAVE_FAILED");

    return NextResponse.json({
      ok: true,
      contact: data,
      externalAction: false,
      linkedinProfileReadAutomatically: false,
    }, { headers: noStore });
  }

  if (action === "add_touchpoint") {
    const channel = clean(body.channel, 20).toUpperCase();
    const status = clean(body.status, 20).toUpperCase() || "PLANNED";
    const direction = clean(body.direction, 20).toUpperCase() || "OUTBOUND";
    const activityType = clean(body.activityType, 100);
    const contactId = clean(body.contactId, 80) || null;
    const dueAt = clean(body.dueAt, 40);
    const completedAt = clean(body.completedAt, 40);
    if (!["EMAIL","LINKEDIN","CALL","MEETING","OTHER"].includes(channel) ||
      !["PLANNED","COMPLETED","CANCELLED"].includes(status) ||
      !["OUTBOUND","INBOUND","INTERNAL"].includes(direction) ||
      !activityType || (contactId && !uuid.test(contactId)) ||
      (dueAt && Number.isNaN(Date.parse(dueAt))) ||
      (completedAt && Number.isNaN(Date.parse(completedAt)))) {
      return fail(400, "INVALID_TOUCHPOINT");
    }

    if (contactId) {
      const { data: contact } = await access.value.supabase.from("corporate_prospect_contacts")
        .select("id").eq("id", contactId).eq("prospect_id", params.prospectId).maybeSingle();
      if (!contact) return fail(400, "INVALID_CONTACT");
    }

    const { data, error } = await access.value.supabase.from("corporate_account_touchpoints").insert({
      prospect_id: params.prospectId,
      contact_id: contactId,
      channel,
      activity_type: activityType,
      status,
      direction,
      owner_email: cleanEmail(body.ownerEmail) || actorEmail,
      due_at: dueAt ? new Date(dueAt).toISOString() : null,
      completed_at: status === "COMPLETED"
        ? (completedAt ? new Date(completedAt).toISOString() : new Date().toISOString())
        : null,
      summary: nullable(body.summary, 4000),
      external_url: cleanUrl(body.externalUrl),
      metadata: {},
      created_by_email: actorEmail,
      updated_by_email: actorEmail,
    }).select("*").single();
    if (error || !data) return fail(409, "TOUCHPOINT_SAVE_FAILED");

    return NextResponse.json({
      ok: true,
      touchpoint: data,
      externalAction: false,
      emailSent: false,
      linkedinMessageSent: false,
    }, { status: 201, headers: noStore });
  }

  if (action === "complete_touchpoint") {
    const touchpointId = clean(body.touchpointId, 80);
    if (!uuid.test(touchpointId)) return fail(400, "INVALID_TOUCHPOINT");

    const { data, error } = await access.value.supabase.from("corporate_account_touchpoints")
      .update({
        status: "COMPLETED",
        completed_at: new Date().toISOString(),
        summary: nullable(body.summary, 4000),
        updated_by_email: actorEmail,
        updated_at: new Date().toISOString(),
      })
      .eq("id", touchpointId)
      .eq("prospect_id", params.prospectId)
      .select("*")
      .single();
    if (error || !data) return fail(404, "TOUCHPOINT_NOT_FOUND");

    return NextResponse.json({
      ok: true,
      touchpoint: data,
      externalAction: false,
    }, { headers: noStore });
  }

  return fail(400, "INVALID_ACTION");
}
