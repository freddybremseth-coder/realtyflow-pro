import { NextRequest, NextResponse } from "next/server";
import { requireCronApi } from "@/lib/api-cron";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import {
  COMMUNICATION_LEARNING_SAFETY,
  deriveCommunicationLearningDimensions,
  evaluateCommunicationRule,
} from "@/lib/nexus/communication-learning";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

function normalizeEmail(v: unknown) { return String(v || "").trim().toLowerCase(); }
function normalizeSubject(v: unknown) {
  return String(v || "").toLowerCase().replace(/^\s*((re|fw|fwd)\s*:\s*)+/g, "").replace(/\s+/g, " ").trim();
}

export async function GET(request: NextRequest) {
  const unauthorized = requireCronApi(request);
  if (unauthorized) return unauthorized;
  const safeMode = await evaluateCronSafeMode("/api/cron/communications-learning");
  if (safeMode.skip) return NextResponse.json({ success:true, skipped:true, mode:safeMode.mode, reason:safeMode.reason });
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error:"Supabase not configured" }, { status:500 });

  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const [{ data: drafts }, { data: observations }, { data: inbound }] = await Promise.all([
    supabase.from("email_drafts").select("id,email_message_id,brand_id,subject,body_text,ai_context,ai_confidence,tone,language,status,edited_by_user,sent_at").not("sent_at","is",null).gte("sent_at",since).limit(5000),
    supabase.from("nexus_communication_learning_observations").select("id,brand_id,email_message_id,draft_id,event_type,edit_ratio,metadata,occurred_at").gte("occurred_at",since).limit(10000),
    supabase.from("email_messages").select("id,brand_id,from_address,subject,received_at,direction").eq("direction","inbound").gte("received_at",since).limit(10000),
  ]);

  const originalIds = Array.from(new Set((drafts || []).map((d:any)=>d.email_message_id).filter(Boolean)));
  const { data: originals } = originalIds.length
    ? await supabase.from("email_messages").select("id,brand_id,from_address,subject,received_at").in("id", originalIds)
    : { data: [] as any[] };
  const originalById = new Map((originals || []).map((x:any)=>[String(x.id),x]));
  const obsByDraft = new Map<string, any[]>();
  for (const o of observations || []) {
    const key = String((o as any).draft_id || "");
    if (!key) continue;
    if (!obsByDraft.has(key)) obsByDraft.set(key, []);
    obsByDraft.get(key)!.push(o);
  }

  let repliesInserted = 0;
  for (const d of drafts || []) {
    const draft:any = d;
    const existing = obsByDraft.get(String(draft.id)) || [];
    if (existing.some((o:any)=>o.event_type === "reply_received")) continue;
    const original:any = originalById.get(String(draft.email_message_id));
    if (!original?.from_address || !draft.sent_at) continue;
    const sentAt = new Date(draft.sent_at).getTime();
    const deadline = sentAt + 14 * 86_400_000;
    const expectedEmail = normalizeEmail(original.from_address);
    const expectedSubject = normalizeSubject(original.subject || draft.subject);
    const reply = (inbound || []).find((m:any) => {
      const at = new Date(m.received_at).getTime();
      return m.brand_id === draft.brand_id && normalizeEmail(m.from_address) === expectedEmail && at > sentAt && at <= deadline && normalizeSubject(m.subject) === expectedSubject;
    });
    if (!reply) continue;
    const { error } = await supabase.from("nexus_communication_learning_observations").insert({
      brand_id:draft.brand_id,email_message_id:draft.email_message_id,draft_id:draft.id,event_type:"reply_received",ai_confidence:draft.ai_confidence,
      outcome:"reply",metadata:{ reply_email_message_id:reply.id, matching:"same_brand_sender_subject_14d" },occurred_at:reply.received_at,
    });
    if (!error) repliesInserted++;
  }

  const refreshed = await supabase.from("nexus_communication_learning_observations").select("brand_id,draft_id,event_type,edit_ratio,metadata").gte("occurred_at",since).limit(15000);
  const allObs:any[] = refreshed.data || [];
  const byDraft = new Map<string, any[]>();
  for (const o of allObs) { const k=String(o.draft_id||""); if(!k) continue; if(!byDraft.has(k)) byDraft.set(k,[]); byDraft.get(k)!.push(o); }

  const groups = new Map<string,{brand:string;dimension:string;value:string;sent:number;replies:number;editSum:number}>();
  const baseline = new Map<string,{sent:number;replies:number}>();
  for (const d of drafts || []) {
    const draft:any = d; const obs=byDraft.get(String(draft.id))||[];
    if (!obs.some((o:any)=>o.event_type==="sent")) continue;
    const replied = obs.some((o:any)=>o.event_type==="reply_received");
    const edit = obs.filter((o:any)=>o.event_type==="user_edit").map((o:any)=>Number(o.edit_ratio||0)).sort((a:number,b:number)=>b-a)[0] || 0;
    const b=baseline.get(draft.brand_id)||{sent:0,replies:0}; b.sent++; if(replied)b.replies++; baseline.set(draft.brand_id,b);
    const original:any = draft.ai_context?.original_draft || {};
    const dims = deriveCommunicationLearningDimensions({
      sentAt: draft.sent_at,
      bodyText: draft.body_text,
      tone: original.tone || draft.tone || "unknown",
      language: original.language || draft.language || "unknown",
      intent: draft.ai_context?.analysis?.intent || "unknown",
    });
    for (const [dimension,value] of dims) {
      if (!value || value === "unknown") continue;
      const key=`${draft.brand_id}|${dimension}|${value}`;
      const g=groups.get(key)||{brand:draft.brand_id,dimension,value,sent:0,replies:0,editSum:0};
      g.sent++; if(replied)g.replies++; g.editSum+=edit; groups.set(key,g);
    }
  }

  let rulesUpserted=0;
  for (const g of groups.values()) {
    const base=baseline.get(g.brand)||{sent:0,replies:0};
    const evaluated = evaluateCommunicationRule({ sent:g.sent, replies:g.replies, editSum:g.editSum, baselineSent:base.sent, baselineReplies:base.replies });
    const finding=`${g.dimension}=${g.value}: ${g.sent} sent, ${Math.round(evaluated.replyRate*100)}% reply, ${Math.round(evaluated.avgEditRatio*100)}% avg edit; brand baseline ${Math.round(evaluated.baselineReplyRate*100)}%.`;
    const { error } = await supabase.from("nexus_communication_learning_rules").upsert({
      brand_id:g.brand,dimension:g.dimension,value:g.value,sample:g.sent,avg_edit_ratio:evaluated.avgEditRatio,reply_rate:evaluated.replyRate,evidence:evaluated.evidence,verdict:evaluated.verdict,finding,updated_at:new Date().toISOString(),
    }, { onConflict:"brand_id,dimension,value" });
    if (!error) rulesUpserted++;
  }

  return NextResponse.json({
    success:true,
    drafts:(drafts||[]).length,
    repliesInserted,
    rulesUpserted,
    windowDays:90,
    dimensions:["tone","language","intent","send_hour_utc","weekday_utc","message_length"],
    safety:COMMUNICATION_LEARNING_SAFETY,
  });
}
