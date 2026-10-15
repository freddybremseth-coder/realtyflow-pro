import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import type { SEOControlReport } from "@/services/agents/seo-control-report";
import { planVisibilityReviewItems } from "@/services/agents/visibility-review-items";
import { visibilityEvidenceAge } from "@/services/agents/visibility-evidence-age";
import { planVisibilityWorkItem } from "@/services/agents/visibility-work-queue";
import { VISIBILITY_BRANDS, type VisibilityFinding } from "@/lib/visibility-product";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Canonical, server-side ingestion. This only creates PROPOSED investigation
 * tasks in existing Nexus work_items. It NEVER performs repairs, grants
 * approval, starts GitHub/Vercel deployments, or trusts client findings.
 */
export async function POST(request: NextRequest) {
 const denied=await requireAdminApi(request); if(denied) return denied;
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return NextResponse.json({error:"Database not configured"},{status:503});
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 // Fetch latest actually persisted control report, rather than a caller-provided one.
 const {data,error}=await db.from("automation_logs").select("created_at,details")
  .eq("action","seo_gsc_live_read").in("status",["success","partial"])
  .order("created_at",{ascending:false}).limit(1).maybeSingle();
 if(error)return NextResponse.json({error:"SEO report unavailable"},{status:503});
 const raw=(data?.details as {controlReport?:SEOControlReport}|null)?.controlReport;
 if(!raw||!Array.isArray(raw.sites))return NextResponse.json({error:"No stored canonical SEO report"},{status:409});
 // Never create active remediation proposals from aged/unknown evidence.
 const checkedAt=visibilityEvidenceAge(raw.checkedAt);
 if(checkedAt!=="RECENT")return NextResponse.json({error:"Stored SEO report requires refresh",evidenceAge:checkedAt},{status:409});
 const items=planVisibilityReviewItems(raw).filter(x=>visibilityEvidenceAge(x.checkedAt)==="RECENT" && Object.hasOwn(VISIBILITY_BRANDS,x.brandId));
 const created:string[]=[];const errors:string[]=[];
 for(const i of items.slice(0,60)){
  const f:VisibilityFinding={id:i.key,brandId:i.brandId,title:i.title,category:i.type==="DATA_GAP"?"missing-data":"technical",detail:i.evidence,nextStep:i.nextStep,priority:i.priority==="HIGH"?"high":i.priority==="MEDIUM"?"medium":"unknown",url:i.affectedUrl,updatedAt:i.checkedAt,evidenceAge:"RECENT"};
  let p;try{p=planVisibilityWorkItem(f);}catch{errors.push(i.key);continue;}
  const {data:id,error:enqueueError}=await db.rpc("enqueue_visibility_review",{
   p_brand_id:p.brand_id,p_finding_id:p.metadata.finding_id,p_title:p.title,
   p_description:p.description,p_next_action:p.next_action,p_priority:p.priority,
   p_evidence_at:p.metadata.evidence_at,p_evidence_age:p.metadata.evidence_age,
   p_category:p.metadata.category,p_target_url:p.metadata.target_url
  });
  if(enqueueError){errors.push(i.key);break;}
  created.push(String(id));
 }
 return NextResponse.json({accepted:created.length,work_item_ids:created,errors:errors.length,
  state:"PROPOSED",execution_started:false,publication_authorized:false,
  source:"stored_seo_gsc_live_read",incomplete:items.length>60||errors.length>0},
  {status:errors.length?503:200,headers:{"Cache-Control":"no-store"}});
}
