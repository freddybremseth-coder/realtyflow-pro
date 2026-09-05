import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { classifyEmailConfigReadiness } from "@/lib/email/config-readiness";
import { assessWhatsAppReadiness } from "@/lib/nexus/whatsapp-readiness";
import { evaluateMetaCapabilities } from "@/lib/oauth/meta-capabilities";
import { buildOsAttention } from "@/lib/os/attention";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

const SUCCESS_AUTOMATION_STATUSES = new Set(["success", "ok", "completed", "drafted"]);
const DEDICATED_ATTENTION_AUTOMATIONS = new Set(["remaster_health_monitor"]);
const SCHEDULED_AUTOMATIONS = [
  { action: "email_ingest", runtimeKey: "cron:/api/cron/email-ingest", label: "E-postinnhenting", expectedMinutes: 15, freshnessMinutes: 40, href: "/nexus-os/communications" },
  { action: "email_auto_draft", runtimeKey: "cron:/api/cron/email-auto-draft", label: "E-post AI auto-draft", expectedMinutes: 15, freshnessMinutes: 40, href: "/nexus-os/communications" },
] as const;

function sourceError(sourceErrors: Array<{ source: string; message: string; href: string }>, source: string, error: { message?: string } | null | undefined, href: string) {
  if (error?.message) sourceErrors.push({ source, message: error.message, href });
}

function ageMinutes(value: string | null | undefined, nowMs: number) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.floor((nowMs - time) / 60_000));
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const nowMs = Date.now();
  const since24h = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString();
  const [approvalsR, recsR, experimentsR, automationR, runtimeR, channelsR, emailConfigsR] = await Promise.all([
    supabase.from("agentic_approvals").select("id,title,risk,estimated_opportunity_eur,status,created_at").eq("status", "pending").order("created_at", { ascending: true }).limit(100),
    supabase.from("book_growth_recommendations").select("status"),
    supabase.from("book_growth_experiments").select("status"),
    supabase.from("automation_logs").select("action,agent_name,status,details,created_at").gte("created_at", since24h).order("created_at", { ascending: false }).limit(300),
    supabase.from("nexus_runtime_controls").select("control_key,label,category,enabled,risk_level,updated_at").order("control_key"),
    supabase.from("social_channels").select("id,brand_id,platform,display_name,is_active").eq("is_active", true).in("platform", ["facebook", "instagram"]),
    supabase.from("brand_email_configs").select("id,brand_id,email_address,is_active,imap_host,encrypted_password,encryption_iv,health_status,health_message,auto_fetch_paused_by_system,last_success_at,consecutive_failures").eq("is_active", true),
  ]);

  const candidateTables = [
    "book_growth_asin_candidates",
    "book_growth_work_merge_candidates",
    "book_growth_edition_language_candidates",
    "book_growth_channel_metadata_candidates",
  ] as const;
  const candidateResults = await Promise.all(candidateTables.map(async (table) => {
    const result = await supabase.from(table).select("id", { count: "exact", head: true }).eq("status", "pending");
    return { table, count: result.count ?? 0, error: result.error };
  }));

  const channelIds = (channelsR.data ?? []).map((row: any) => row.id);
  const tokenR = channelIds.length
    ? await supabase.from("oauth_tokens").select("social_channel_id,scopes,expires_at").in("social_channel_id", channelIds)
    : { data: [] as any[], error: null };

  const sourceErrors: Array<{ source: string; message: string; href: string }> = [];
  sourceError(sourceErrors, "Approvals", approvalsR.error, "/approvals");
  sourceError(sourceErrors, "Book Growth", recsR.error || experimentsR.error, "/book-growth");
  sourceError(sourceErrors, "Automation", automationR.error, "/automation");
  sourceError(sourceErrors, "Runtime", runtimeR.error, "/nexus-os/runtime");
  sourceError(sourceErrors, "Social", channelsR.error || tokenR.error, "/nexus-os/communications/social");
  sourceError(sourceErrors, "Email", emailConfigsR.error, "/nexus-os/communications/readiness");
  for (const result of candidateResults) sourceError(sourceErrors, `Book Growth/${result.table}`, result.error, "/book-growth");

  const approvals = approvalsR.error ? [] : (approvalsR.data ?? []);
  const approvalsHighRisk = approvals.filter((row: any) => ["high", "critical"].includes(String(row.risk || "").toLowerCase())).length;
  const approvalOpportunityEur = approvals.reduce((sum: number, row: any) => sum + Number(row.estimated_opportunity_eur || 0), 0);

  const recs = recsR.error ? [] : (recsR.data ?? []);
  const experiments = experimentsR.error ? [] : (experimentsR.data ?? []);
  const countRec = (status: string) => recs.filter((row: any) => row.status === status).length;
  const bookReviewCandidatesPending = candidateResults.reduce((sum, row) => sum + (row.error ? 0 : row.count), 0);

  const automationLogs = automationR.error ? [] : (automationR.data ?? []);
  const genericAutomationLogs = automationLogs.filter((row: any) => !DEDICATED_ATTENTION_AUTOMATIONS.has(String(row.action || "")));
  const automationFailures = genericAutomationLogs.filter((row: any) => {
    const status = String(row.status || "").toLowerCase();
    return status && status !== "partial" && !SUCCESS_AUTOMATION_STATUSES.has(status);
  });
  const automationPartial = genericAutomationLogs.filter((row: any) => String(row.status || "").toLowerCase() === "partial");
  const lastRemasterHealth: any = automationLogs.find((row: any) => row.action === "remaster_health_monitor") ?? null;
  const lastRemasterHealthStatus = String(lastRemasterHealth?.status || "").toLowerCase();
  const lastRemasterHealthDetails: any = lastRemasterHealth?.details && typeof lastRemasterHealth.details === "object" ? lastRemasterHealth.details : {};
  const lastSocialSync: any = automationLogs.find((row: any) => row.action === "social_inbox_sync") ?? null;
  const lastSocialDetails: any = lastSocialSync?.details && typeof lastSocialSync.details === "object" ? lastSocialSync.details : {};

  const runtime = runtimeR.error ? [] : (runtimeR.data ?? []);
  const runtimeByKey = new Map(runtime.map((row: any) => [String(row.control_key), row]));
  const socialSyncEnabled = Boolean((runtimeByKey.get("feature:social_inbox_sync") as any)?.enabled);
  const socialAutoReplyLive = Boolean((runtimeByKey.get("feature:social_auto_reply_live") as any)?.enabled);
  const highRiskEnabled = runtime.filter((row: any) => row.enabled && ["high", "critical"].includes(String(row.risk_level || "").toLowerCase()));

  const scheduledAutomation = SCHEDULED_AUTOMATIONS.map((job) => {
    const runtimeControl: any = runtimeByKey.get(job.runtimeKey);
    const enabled = Boolean(runtimeControl?.enabled);
    const lastRun: any = automationLogs.find((row: any) => row.action === job.action) ?? null;
    const lastRunAt = lastRun?.created_at ?? null;
    const age = ageMinutes(lastRunAt, nowMs);
    const stale = enabled && (age === null || age > job.freshnessMinutes);
    return {
      action: job.action,
      label: job.label,
      href: job.href,
      runtimeKey: job.runtimeKey,
      enabled,
      expectedMinutes: job.expectedMinutes,
      freshnessMinutes: job.freshnessMinutes,
      lastRunAt,
      lastStatus: lastRun?.status ?? null,
      ageMinutes: age,
      stale,
    };
  });
  const scheduledAutomationEnabled = scheduledAutomation.filter((job) => job.enabled);
  const scheduledAutomationStale = scheduledAutomationEnabled.filter((job) => job.stale);

  const emailReadiness = (emailConfigsR.error ? [] : (emailConfigsR.data ?? [])).map((row: any) => ({
    id: row.id,
    brandId: row.brand_id,
    emailAddress: row.email_address,
    readiness: classifyEmailConfigReadiness(row),
  }));
  const emailAccountsNotReady = emailReadiness.filter((row) => row.readiness.state !== "ready").length;
  const emailAccountsSystemPaused = emailReadiness.filter((row) => row.readiness.state === "paused").length;

  const tokenByChannel = new Map((tokenR.data ?? []).map((row: any) => [String(row.social_channel_id), row]));
  const socialChannels = channelsR.error ? [] : (channelsR.data ?? []);
  const socialReadiness = socialChannels.map((channel: any) => {
    const token: any = tokenByChannel.get(String(channel.id));
    const scopes = Array.isArray(token?.scopes) ? token.scopes.map(String) : [];
    const capabilities = evaluateMetaCapabilities(String(channel.platform), scopes);
    return {
      channelId: channel.id,
      brandId: channel.brand_id,
      platform: channel.platform,
      displayName: channel.display_name,
      readComments: capabilities.readComments,
      directMessages: capabilities.directMessages,
      commentReply: capabilities.commentReply,
      tokenExpiresAt: token?.expires_at ?? null,
    };
  });
  const instagram = socialReadiness.filter((row: any) => row.platform === "instagram");
  const whatsappReadiness = assessWhatsAppReadiness(process.env);

  const summary = {
    approvalsPending: approvals.length,
    approvalsHighRisk,
    approvalOpportunityEur,
    bookPending: countRec("pending"),
    bookApproved: countRec("approved"),
    bookApplied: countRec("applied"),
    bookMeasuring: countRec("measuring"),
    bookMeasured: countRec("measured"),
    bookRunningExperiments: experiments.filter((row: any) => row.status === "running").length,
    bookReviewCandidatesPending,
    automationRuns24h: automationLogs.length,
    automationFailures24h: automationFailures.length,
    automationPartial24h: automationPartial.length,
    scheduledAutomationEnabled: scheduledAutomationEnabled.length,
    scheduledAutomationHealthy: scheduledAutomationEnabled.filter((job) => !job.stale).length,
    scheduledAutomationStale: scheduledAutomationStale.length,
    runtimeEnabled: runtime.filter((row: any) => row.enabled).length,
    runtimeHighRiskEnabled: highRiskEnabled.length,
    emailAccounts: emailReadiness.length,
    emailAccountsNotReady,
    emailAccountsSystemPaused,
    socialChannels: socialReadiness.length,
    instagramConnected: instagram.length,
    instagramCommentReadReady: instagram.filter((row: any) => row.readComments).length,
    socialSyncEnabled,
    socialAutoReplyLive,
    whatsappStatus: whatsappReadiness.status,
    whatsappInboundReady: whatsappReadiness.inboundReady,
    whatsappAutoReplyEnabled: whatsappReadiness.autoReplyEnabled,
    remasterHealthStatus: lastRemasterHealth?.status ?? null,
    remasterHealthAt: lastRemasterHealth?.created_at ?? null,
  };

  const attention = buildOsAttention({
    sourceErrors,
    approvalsPending: summary.approvalsPending,
    approvalsHighRisk: summary.approvalsHighRisk,
    approvalOpportunityEur: summary.approvalOpportunityEur,
    automationFailures24h: summary.automationFailures24h,
    automationPartial24h: summary.automationPartial24h,
    scheduledAutomationStale: scheduledAutomationStale.map((job) => ({
      action: job.action,
      label: job.label,
      lastRunAt: job.lastRunAt,
      expectedMinutes: job.expectedMinutes,
      href: job.href,
    })),
    emailAccountsNotReady,
    emailAccountsSystemPaused,
    socialSyncEnabled,
    socialLastSyncAt: lastSocialSync?.created_at ?? null,
    socialLastSyncStatus: lastSocialSync?.status ?? null,
    instagramConnected: summary.instagramConnected,
    instagramCommentReadReady: summary.instagramCommentReadReady,
    socialSkippedMissingCapability: Number(lastSocialDetails.skipped_missing_capability ?? 0),
    socialAutoReplyLive,
    bookPending: summary.bookPending,
    bookApproved: summary.bookApproved,
    bookApplied: summary.bookApplied,
    bookMeasuring: summary.bookMeasuring,
    bookRunningExperiments: summary.bookRunningExperiments,
    bookReviewCandidatesPending,
  });

  if (lastRemasterHealth && ["partial", "error"].includes(lastRemasterHealthStatus)) {
    const clearIndex = attention.findIndex((item) => item.id === "os:clear");
    if (clearIndex >= 0) attention.splice(clearIndex, 1);
    const reasons = Array.isArray(lastRemasterHealthDetails.reasons)
      ? lastRemasterHealthDetails.reasons.map(String).filter(Boolean)
      : [];
    attention.unshift({
      id: "remaster:health",
      severity: lastRemasterHealthStatus === "error" ? "high" : "medium",
      score: lastRemasterHealthStatus === "error" ? 94 : 68,
      title: lastRemasterHealthStatus === "error" ? "Re-Master Growth OS trenger oppmerksomhet" : "Re-Master Growth OS er delvis degradert",
      detail: reasons.length ? reasons.slice(0, 3).join(" · ") : "Re-Master health-monitoren rapporterte et operasjonelt avvik.",
      href: "/remaster-freddy",
      source: "Re-Master Health",
    });
  }

  if (whatsappReadiness.status === "BLOCKED") {
    attention.unshift({
      id: "whatsapp:inbound-blocked",
      severity: "high",
      score: 96,
      title: "WhatsApp lead capture is blocked",
      detail: `Nexus cannot rely on WhatsApp inbound capture. Missing: ${whatsappReadiness.missingRequired.join(", ") || "required configuration"}.`,
      href: "/nexus-os/communications",
      source: "Nexus WhatsApp Readiness",
    });
  } else if (whatsappReadiness.status === "PARTIAL" && whatsappReadiness.inboundReady) {
    attention.push({
      id: "whatsapp:inbound-ready-autoreply-off",
      severity: "low",
      score: 42,
      title: "WhatsApp inbound is ready; automatic replies are not fully active",
      detail: whatsappReadiness.autoReplyEnabled
        ? `Inbound capture is healthy, but automatic replies are incomplete. Missing: ${whatsappReadiness.missingRequired.join(", ") || "outbound configuration"}.`
        : "Inbound lead capture is healthy. Automatic replies remain intentionally disabled.",
      href: "/nexus-os/communications",
      source: "Nexus WhatsApp Readiness",
    });
  }

  return NextResponse.json({
    generatedAt: new Date(nowMs).toISOString(),
    sourceState: {
      healthy: sourceErrors.length === 0,
      errors: sourceErrors,
    },
    summary,
    attention,
    whatsapp: {
      status: whatsappReadiness.status,
      inboundReady: whatsappReadiness.inboundReady,
      outboundReady: whatsappReadiness.outboundReady,
      autoReplyEnabled: whatsappReadiness.autoReplyEnabled,
      missingRequired: whatsappReadiness.missingRequired,
      missingOptional: whatsappReadiness.missingOptional,
    },
    approvals: approvals.slice(0, 10),
    social: {
      readiness: socialReadiness,
      lastSync: lastSocialSync ? {
        status: lastSocialSync.status,
        createdAt: lastSocialSync.created_at,
        readOnly: Boolean(lastSocialDetails.read_only),
        commentsFetched: Number(lastSocialDetails.comments_fetched ?? 0),
        conversationsUpserted: Number(lastSocialDetails.conversations_upserted ?? 0),
        messagesUpserted: Number(lastSocialDetails.messages_upserted ?? 0),
        eligibleChannels: Number(lastSocialDetails.eligible_channels ?? 0),
        skippedMissingToken: Number(lastSocialDetails.skipped_missing_token ?? 0),
        skippedMissingCapability: Number(lastSocialDetails.skipped_missing_capability ?? 0),
        channelErrors: Number(lastSocialDetails.channel_errors ?? 0),
      } : null,
    },
    automation: {
      scheduled: scheduledAutomation,
      failures: automationFailures.slice(0, 20),
      partial: automationPartial.slice(0, 20),
      remasterHealth: lastRemasterHealth ? {
        status: lastRemasterHealth.status,
        createdAt: lastRemasterHealth.created_at,
        reasons: Array.isArray(lastRemasterHealthDetails.reasons) ? lastRemasterHealthDetails.reasons : [],
      } : null,
    },
    runtime: {
      highRiskEnabled,
      controls: runtime,
    },
    bookGrowth: {
      candidateQueues: candidateResults.map((row) => ({ table: row.table, pending: row.error ? null : row.count, error: row.error?.message ?? null })),
    },
  });
}
