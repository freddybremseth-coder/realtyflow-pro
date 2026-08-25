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

  const [channelsR, conversationsR, draftsR, eventsR, runtimeR] = await Promise.all([
    supabase.from("social_channels").select("id,brand_id,platform,display_name,is_active").in("platform", ["instagram", "facebook"]).eq("is_active", true),
    supabase.from("nexus_social_conversations").select("id,brand_id,platform,status,priority,last_inbound_at,last_outbound_at,last_synced_at,created_at").order("updated_at", { ascending: false }).limit(500),
    supabase.from("nexus_social_reply_drafts").select("id,brand_id,platform,status,ai_confidence,created_at").order("created_at", { ascending: false }).limit(500),
    supabase.from("nexus_social_communication_events").select("id,brand_id,platform,event_type,outcome,occurred_at").gte("occurred_at", new Date(Date.now()-30*86_400_000).toISOString()).limit(2000),
    supabase.from("nexus_runtime_controls").select("control_key,enabled,risk_level,config,updated_at").in("control_key", ["feature:social_inbox_sync","feature:social_reply_draft","feature:social_auto_reply_live"]),
  ]);

  if (channelsR.error) return NextResponse.json({ error: channelsR.error.message }, { status: 500 });
  if (conversationsR.error) return NextResponse.json({ error: conversationsR.error.message }, { status: 500 });
  if (draftsR.error) return NextResponse.json({ error: draftsR.error.message }, { status: 500 });
  if (eventsR.error) return NextResponse.json({ error: eventsR.error.message }, { status: 500 });

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
  return NextResponse.json({
    generatedAt:new Date().toISOString(),
    sourceState: {
      canonicalTablesReady:true,
      externalInboxSyncActive:Boolean((runtimeR.data??[]).find((x:any)=>x.control_key==="feature:social_inbox_sync")?.enabled),
      note:"0 samtaler betyr 0 canonical synkroniserte samtaler. Det betyr ikke at Meta-innboksen er tom før external inbox sync er aktiv og capability-verifisert.",
    },
    summary:{
      channels:readiness.length,
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
  });
}
