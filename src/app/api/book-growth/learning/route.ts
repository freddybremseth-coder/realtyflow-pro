import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

function unavailable(message: string) {
  return /publishing_learning_(proposals|proposal_evidence|proposal_decisions)|publishing_(generate_learning_proposals|stage_next_book_proposal|decide_learning_proposal)|schema cache|does not exist|relation/i.test(message);
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const sb = getServiceSupabase();
  if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const [proposalsRes,evidenceRes,decisionsRes,worksRes,editionsRes,legacyRulesRes] = await Promise.all([
    sb.from("publishing_learning_proposals").select("*").order("proposed_at",{ascending:false}).limit(500),
    sb.from("publishing_learning_proposal_evidence").select("id,proposal_id,experiment_id,evidence_type,evidence,created_at").limit(5000),
    sb.from("publishing_learning_proposal_decisions").select("id,proposal_id,decision,actor,note,decided_at").order("decided_at",{ascending:false}).limit(1000),
    sb.from("publishing_catalog_works").select("id,canonical_title,series_name"),
    sb.from("publishing_catalog_editions").select("id,work_id,title,language,format"),
    sb.from("book_growth_learning_rules").select("id,dimension,value,sample,lift,evidence_level,verdict,finding,updated_at").order("updated_at",{ascending:false}).limit(300),
  ]);
  const error = proposalsRes.error || evidenceRes.error || decisionsRes.error || worksRes.error || editionsRes.error;
  if (error) return NextResponse.json({ available:false,error:unavailable(error.message)?"Fase 5.3-migreringen er ikke installert ennå.":error.message },{status:unavailable(error.message)?503:500});
  const works=new Map((worksRes.data??[]).map((row:any)=>[String(row.id),row]));
  const editions=new Map((editionsRes.data??[]).map((row:any)=>[String(row.id),row]));
  const proposals=(proposalsRes.data??[]).map((row:any)=>({...row,work:works.get(String(row.work_id))??null,edition:editions.get(String(row.edition_id))??null,evidence:(evidenceRes.data??[]).filter((item:any)=>item.proposal_id===row.id),decisions:(decisionsRes.data??[]).filter((item:any)=>item.proposal_id===row.id)}));
  return NextResponse.json({available:true,proposals,legacyRules:legacyRulesRes.error?[]:legacyRulesRes.data??[],legacyRulesReadOnly:true});
}

export async function POST(request: NextRequest) {
  const denied=await requireAdminApi(request);
  if(denied) return denied;
  const body=await request.json().catch(()=>null);
  const sb=getServiceSupabase();
  if(!sb) return NextResponse.json({error:"Supabase not configured"},{status:503});
  let rpc=""; let args:Record<string,unknown>={};
  if(body?.action==="generate") {
    rpc="publishing_generate_learning_proposals"; args={p_actor:"admin_ui"};
  } else if(body?.action==="stage_next_book") {
    const required=["seriesName","title","rationale","catalogGap","authorFit","marketEvidence"];
    if(required.some((key)=>typeof body[key]!=="string"||!body[key].trim())) return NextResponse.json({error:"Serie, tittel, begrunnelse og alle tre evidenstypene er påkrevd"},{status:400});
    rpc="publishing_stage_next_book_proposal";
    args={p_series_name:body.seriesName,p_title:body.title,p_rationale:body.rationale,p_evidence:{catalog_gap:body.catalogGap,author_fit:body.authorFit,market_evidence:body.marketEvidence},p_actor:"admin_ui"};
  } else if(body?.action==="decide"&&typeof body.proposalId==="string"&&["approve","reject"].includes(body.decision)) {
    if(body.decision==="reject"&&(typeof body.note!=="string"||!body.note.trim())) return NextResponse.json({error:"Avvisning krever begrunnelse"},{status:400});
    rpc="publishing_decide_learning_proposal";
    args={p_proposal_id:body.proposalId,p_decision:body.decision,p_actor:"admin_ui",p_note:typeof body.note==="string"?body.note.trim().slice(0,1000):null};
  } else return NextResponse.json({error:"Ugyldig fase 5.3-handling"},{status:400});
  const {data,error}=await sb.rpc(rpc,args);
  if(error) return NextResponse.json({error:error.message},{status:unavailable(error.message)?503:409});
  return NextResponse.json({ok:true,result:data});
}
