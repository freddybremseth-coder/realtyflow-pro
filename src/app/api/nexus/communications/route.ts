import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

function ageHours(value: string | null | undefined) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, (Date.now() - time) / 3_600_000);
}
function urgencyWeight(value: string | null | undefined) {
  const v = String(value || "").toLowerCase();
  if (["critical", "urgent", "high"].includes(v)) return 40;
  if (["medium", "normal"].includes(v)) return 15;
  return 0;
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const limit = Math.max(10, Math.min(200, Number(request.nextUrl.searchParams.get("limit") || 80)));
  const [emailsR, draftsR, configsR, nurtureR, focusR, runtimeR, socialChannelsR] = await Promise.all([
    supabase.from("email_messages").select("id,brand_id,from_address,from_name,subject,ai_summary,ai_intent,ai_urgency,ai_sentiment,ai_suggested_action,is_read,is_archived,has_draft_reply,replied_at,received_at,created_at").eq("direction", "inbound").eq("is_archived", false).order("received_at", { ascending: false }).limit(limit),
    supabase.from("email_drafts").select("id,email_message_id,brand_id,subject,body_text,ai_confidence,status,created_at").order("created_at", { ascending: false }).limit(500),
    supabase.from("brand_email_configs").select("id,brand_id,email_address,display_name,is_active,auto_fetch,fetch_interval_minutes,ai_auto_draft,last_fetched_at,health_status,health_message,consecutive_failures,last_error_at,last_success_at,auto_fetch_paused_by_system").eq("is_active", true),
    supabase.from("lead_nurture_events").select("brand_id,status,dry_run,created_at,sent_at,error").gte("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString()).limit(2000),
    supabase.from("nexus_owner_focus").select("brand_id,focus_key,title,notes,intensity,status,success_definition,review_due_at").eq("status", "active"),
    supabase.from("nexus_runtime_controls").select("control_key,enabled,risk_level,updated_at,config").in("control_key", ["cron:/api/cron/email-ingest", "cron:/api/cron/email-auto-draft", "feature:nurture_live", "feature:routine_email_reply_live"]),
    supabase.from("social_channels").select("id,brand_id,platform,display_name,is_active").in("platform", ["instagram", "facebook"]).eq("is_active", true),
  ]);

  const channelIds = (socialChannelsR.data ?? []).map((x:any)=>x.id);
  const { data: tokenRows } = channelIds.length
    ? await supabase.from("oauth_tokens").select("social_channel_id,scopes,expires_at").in("social_channel_id", channelIds)
    : { data: [] as any[] };
  const tokenByChannel = new Map((tokenRows ?? []).map((x:any)=>[String(x.social_channel_id),x]));
  const socialReadiness = (socialChannelsR.data ?? []).map((channel:any)=>{
    const token:any = tokenByChannel.get(String(channel.id));
    const scopes:string[] = Array.isArray(token?.scopes) ? token.scopes.map(String) : [];
    const nonWhatsappMessaging = scopes.some((s)=>/messag/i.test(s) && !/whatsapp/i.test(s));
    const commentWrite = scopes.some((s)=>/manage.*engagement|manage.*comment|comment.*manage/i.test(s));
    const readEngagement = scopes.some((s)=>/read.*engagement|read.*user.*content/i.test(s));
    const publish = channel.platform === "instagram"
      ? scopes.some((s)=>/content_publish/i.test(s))
      : scopes.some((s)=>/manage_posts/i.test(s));
    return {
      channelId: channel.id,
      brandId: channel.brand_id,
      platform: channel.platform,
      displayName: channel.display_name,
      scopes,
      capabilities: {
        publish,
        readEngagement,
        directMessages: nonWhatsappMessaging,
        commentReply: commentWrite,
      },
      needsCommunicationReconnect: !nonWhatsappMessaging || !commentWrite,
      note: (!nonWhatsappMessaging || !commentWrite)
        ? "Canonical token mangler scope for full DM/comment-write. Reconnect/utvid Meta-tilgang før automatiske svar aktiveres."
        : "Kommunikasjonsscope finnes; execution må fortsatt følge Runtime/Autonomy-policy.",
    };
  });

  const drafts = draftsR.data ?? [];
  const latestDraftByEmail = new Map<string, any>();
  for (const draft of drafts as any[]) if (draft.email_message_id && !latestDraftByEmail.has(String(draft.email_message_id))) latestDraftByEmail.set(String(draft.email_message_id), draft);
  const focusByBrand = new Map((focusR.data ?? []).map((f: any) => [String(f.brand_id), f]));
  const inbox = (emailsR.data ?? []).map((email: any) => {
    const hours = ageHours(email.received_at || email.created_at);
    const focus: any = focusByBrand.get(String(email.brand_id));
    const draft = latestDraftByEmail.get(String(email.id)) ?? null;
    let score = 0; const reasons: string[] = [];
    if (!email.is_read) { score += 30; reasons.push("ulest"); }
    score += urgencyWeight(email.ai_urgency);
    if (email.ai_urgency) reasons.push(`AI urgency: ${email.ai_urgency}`);
    if (!email.has_draft_reply) { score += 12; reasons.push("mangler svarutkast"); }
    if (!email.replied_at && hours != null && hours > 24) { score += Math.min(35, hours / 12); reasons.push(`${Math.round(hours)}t uten svar`); }
    if (focus) { score += Math.min(50, Number(focus.intensity || 5) * 5); reasons.push(`Owner Focus: ${focus.title}`); }
    if (draft?.ai_confidence != null && Number(draft.ai_confidence) < 0.7) reasons.push("lav draft-confidence");
    return { ...email, ageHours: hours == null ? null : Math.round(hours * 10) / 10, score: Math.round(score * 10) / 10, reasons, draft: draft ? { id: draft.id, subject: draft.subject, body_text: draft.body_text, confidence: draft.ai_confidence, status: draft.status, created_at: draft.created_at } : null, ownerFocus: focus || null };
  }).sort((a: any, b: any) => b.score - a.score || String(b.received_at || "").localeCompare(String(a.received_at || "")));

  const configHealth = (configsR.data ?? []).map((row: any) => {
    const hours = ageHours(row.last_fetched_at);
    const unhealthy = ["degraded", "paused"].includes(String(row.health_status || ""));
    return { ...row, lastFetchAgeHours: hours == null ? null : Math.round(hours * 10) / 10, stale: row.auto_fetch && (hours == null || hours > Math.max(1, Number(row.fetch_interval_minutes || 15) / 60 * 4)), unhealthy, needsReconnect: unhealthy || Boolean(row.auto_fetch_paused_by_system) };
  });
  const nurture = nurtureR.data ?? [];
  const nurtureSummary = { sent: nurture.filter((x: any) => x.status === "sent").length, dryRun: nurture.filter((x: any) => x.status === "dry_run").length, failed: nurture.filter((x: any) => x.status === "failed").length };

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    summary: {
      inbox: inbox.length,
      unread: inbox.filter((x: any) => !x.is_read).length,
      withoutDraft: inbox.filter((x: any) => !x.has_draft_reply).length,
      unreplied24h: inbox.filter((x: any) => !x.replied_at && Number(x.ageHours || 0) > 24).length,
      staleEmailAccounts: configHealth.filter((x: any) => x.stale).length,
      unhealthyEmailAccounts: configHealth.filter((x: any) => x.unhealthy).length,
      pausedEmailAccounts: configHealth.filter((x: any) => x.health_status === "paused").length,
      socialChannels: socialReadiness.length,
      socialCommunicationReady: socialReadiness.filter((x:any)=>!x.needsCommunicationReconnect).length,
      nurture30d: nurtureSummary,
    },
    runtime: runtimeR.data ?? [],
    emailAccounts: configHealth,
    socialReadiness,
    ownerFocus: focusR.data ?? [],
    inbox,
    policy: {
      autoSend: false,
      analyzeAndDraft: true,
      socialAutoReply: false,
      note: "Nexus kan analysere og forberede kommunikasjon. E-post- og SoMe-sending styres separat av capability scopes + Runtime + Autonomy-policy.",
    },
  });
}
