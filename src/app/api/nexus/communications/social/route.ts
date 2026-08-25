import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { evaluateMetaCapabilities, isMetaCommunicationReady } from "@/lib/oauth/meta-capabilities";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const [channelsR, conversationsR, draftsR, eventsR, runtimeR, syncLogsR] = await Promise.all([
    supabase.from("social_channels").select("id,brand_id,platform,display_name,is_active").in("platform", ["instagram", "facebook"]).eq("is_active", true),
    supabase.from("nexus_social_conversations").select("id,brand_id,platform,status,priority,last_inbound_at,last_outbound_at,last_synced_at,created_at").order("updated_at", { ascending: false }).limit(500),
    supabase.from("nexus_social_reply_drafts").select("id,brand_id,platform,status,ai_confidence,created_at").order("created_at", { ascending: false }).limit(500),
    supabase.from("nexus_social_communication_events").select("id,brand_id,platform,event_type,outcome,occurred_at").gte("occurred_at", new Date(Date.now()-30*86_400_000).toISOString()).limit(2000),
    supabase.from("nexus_runtime_controls").select("control_key,enabled,risk_level,config,updated_at").in("control_key", ["feature:social_inbox_sync","feature:social_reply_draft","feature:social_auto_reply_live"]),
    supabase.from("automation_logs").select("action,agent_name,status,details,created_at").eq("action","social_inbox_sync").order("created_at", { ascending:false }).limit(10),
  ]);

  if (channelsR.error) return NextResponse.json({ error: channelsR.error.message }, { status: 500 });
  if (conversationsR.error) return NextResponse.json({ error: conversationsR.error.message }, { status: 500 });
  if (draftsR.error) return NextResponse.json({ error: draftsR.error.message }, { status: 500 });
  if (eventsR.error) return NextResponse.json({ error: eventsR.error.message }, { status: 500 });
  if (runtimeR.error) return NextResponse.json({ error: runtimeR.error.message }, { status: 500 });

  const channelIds=(channelsR.data??[]).map((x:any)=>x.id);
  const { data: tokenRows, error: tokenError } = channelIds.length
    ? await supabase.from("oauth_tokens").select("social_channel_id,scopes,expires_at").in("social_channel_id", channelIds)
    : { data: [] as any[], error: null };
  if (tokenError) return NextResponse.json({ error: tokenError.message }, { status: 500 });
  const tokenByChannel=new Map((tokenRows??[]).map((x:any)=>[String(x.social_channel_id),x]));

  const readiness=(channelsR.data??[]).map((channel:any)=>{
    const token:any=tokenByChannel.get(String(channel.id));
    const scopes:string[]=Array.isArray(token?.scopes)?token.scopes.map(String):[];
    const capabilities=evaluateMetaCapabilities(String(channel.platform),scopes);
    return {
      channelId:channel.id,
      brandId:channel.brand_id,
      platform:channel.platform,
      displayName:channel.display_name,
      capabilities,
      needsCommunicationReconnect:!isMetaCommunicationReady(String(channel.platform),scopes),
      scopes,
    };
  });

  const conversations:any[]=conversationsR.data??[];
  const drafts:any[]=draftsR.data??[];
  const events:any[]=eventsR.data??[];
  const syncEnabled=Boolean((runtimeR.data??[]).find((x:any)=>x.control_key==="feature:social_inbox_sync")?.enabled);
  const syncLogs:any[]=syncLogsR.error ? [] : (syncLogsR.data??[]);
  const lastSync:any=syncLogs[0]??null;
  const lastDetails:any=lastSync?.details && typeof lastSync.details==="object" ? lastSync.details : {};

  return NextResponse.json({
    generatedAt:new Date().toISOString(),
    sourceState: {
      canonicalTablesReady:true,
      externalInboxSyncActive:syncEnabled,
      lastSync: lastSync ? {
        status:lastSync.status,
        agentName:lastSync.agent_name,
        createdAt:lastSync.created_at,
        source:lastDetails.source??null,
        commentsFetched:Number(lastDetails.comments_fetched??0),
        conversationsUpserted:Number(lastDetails.conversations_upserted??0),
        messagesUpserted:Number(lastDetails.messages_upserted??0),
        eligibleChannels:Number(lastDetails.eligible_channels??0),
        skippedMissingToken:Number(lastDetails.skipped_missing_token??0),
        skippedMissingCapability:Number(lastDetails.skipped_missing_capability??0),
        channelErrors:Number(lastDetails.channel_errors??0),
        readOnly:Boolean(lastDetails.read_only),
      } : null,
      note: syncEnabled
        ? "External read-only inbox sync er aktiv. Canonical 0 kan nå tolkes som 0 synkroniserte kommentarer for kanaler og poster som faktisk har nødvendig read-capability; skipped kanaler er fortsatt ukjent."
        : "0 samtaler betyr 0 canonical synkroniserte samtaler. Det betyr ikke at Meta-innboksen er tom før external inbox sync er aktiv og capability-verifisert.",
    },
    summary:{
      channels:readiness.length,
      commentReadReady:readiness.filter((x:any)=>x.capabilities.readComments).length,
      communicationReady:readiness.filter((x:any)=>!x.needsCommunicationReconnect).length,
      conversations:conversations.length,
      openConversations:conversations.filter((x:any)=>["open","draft_ready","awaiting_approval"].includes(x.status)).length,
      highPriority:conversations.filter((x:any)=>["high","critical"].includes(x.priority)).length,
      drafts:drafts.filter((x:any)=>x.status==="draft").length,
      approvedDrafts:drafts.filter((x:any)=>x.status==="approved").length,
      sentEvents30d:events.filter((x:any)=>x.event_type==="sent").length,
    },
    runtime:runtimeR.data??[],
    readiness,
    conversations,
    recentDrafts:drafts.slice(0,100),
    events30d:events,
    recentSyncs:syncLogs,
  });
}
