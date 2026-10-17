import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SEOControlReport } from "./seo-control-report";
import type { SiteAudit } from "./seo-audit";
import { planVisibilityReviewItems } from "./visibility-review-items";
import { planVisibilityWorkItem } from "./visibility-work-queue";
import { evaluateInvestigation, investigateVisibilityTasks, MAX_INVESTIGATED_SITES } from "./visibility-investigation";

const date = "2026-10-17T07:40:00Z";
const now = new Date("2026-10-17T08:15:00Z");
const base = "https://remaster.freddybremseth.com";
function makeAudit(h1: number|null = 0, robotStatus: number|null = 200):SiteAudit {
 return {
  brandId:"remasterfreddy",base,checkedAt:date,
  home:{status:200,finalUrl:base+"/",title:"Example",description:null,
   canonical:base+"/",h1Count:h1,xRobots:null,robotsMeta:null,
   jsonLdCount:0,jsonLdParseErrors:0},
  robots:{status:robotStatus,sitemapDeclared:true,googlebotBlocked:false},
  sitemap:{status:200,urlCountSample:1,xmlLike:true},
  observations:[],samples:[],limitations:robotStatus===null?["robots unavailable"]:[],
 };
}
const report:SEOControlReport={
 checkedAt:date,leadsAvailable:false,referralsAvailable:false,collector:null,
 sites:[{
  brandId:"remasterfreddy",checkedAt:date,pagesChecked:1,findings:1,incomplete:false,
  sampledPaths:[],accessibilityFindings:0,invalidStructuredData:0,
  pagesWithContactOrForm:0,qualityPagesChecked:1,
  visibilityDiagnostic:{
   brandId:"remasterfreddy",sampledOnly:true,incomplete:false,publicationEligible:false,
   diagnosticStatus:"REVIEW_RECOMMENDED",
   issues:[{code:"HEADING_STRUCTURE",evidence:"Missing server-rendered heading",affectedUrl:base}],
  },
 }],
};
const item=planVisibilityReviewItems(report)[0];
const plan=planVisibilityWorkItem({
 id:item.key,brandId:item.brandId,title:item.title,detail:item.evidence,nextStep:item.nextStep,
 priority:"medium",url:item.affectedUrl,category:"technical",updatedAt:item.checkedAt,evidenceAge:"RECENT",
});
test("Independent observation repeats missing homepage H1 without authorizing repair",()=>{
 const result=evaluateInvestigation(item,makeAudit());
 assert.equal(result.result,"OBSERVED_AGAIN");
 assert.equal(result.issueCode,"HEADING_STRUCTURE");
 assert.equal(result.evidence.h1Count,0);
});
test("A now-present H1 is NOT_REPRODUCED and is not proof of a published fix",()=>{
 assert.equal(evaluateInvestigation(item,makeAudit(1)).result,"NOT_REPRODUCED");
 assert.equal(evaluateInvestigation(item,makeAudit(1,null)).result,"INCONCLUSIVE");
});
test("A missing homepage cannot be mistaken for a resolved heading issue",()=>{
 const audit=makeAudit(null);
 audit.home.status=503;
 assert.equal(evaluateInvestigation(item,audit).result,"INCONCLUSIVE");
});
test("A data gap never becomes a website error",()=>{
 const gap={...item,key:"visibility:remasterfreddy:data-gap",type:"DATA_GAP" as const,affectedUrl:null};
 assert.equal(evaluateInvestigation(gap,makeAudit(1,null)).result,"DATA_STILL_INCOMPLETE");
 assert.equal(evaluateInvestigation(gap,makeAudit(1)).result,"DATA_NOW_AVAILABLE");
});
function dbMock(recent:any[]=[]){
 const inserted:any[]=[];
 const chain=(table:string)=>({
  select:()=>({
   eq:()=>({
    in:()=>({
      limit:async()=>({data:[{id:"00000000-0000-4000-8000-000000000001",brand_id:"remasterfreddy",
       source_id:plan.source_id,status:"TO_DO",metadata:{product:"altovena_visibility"}}],error:null}),
      order:()=>({limit:async()=>({data:recent,error:null})}),
    }),
    order:()=>({limit:async()=>({data:recent,error:null})}),
   }),
  }),
  insert:async(row:any)=>{inserted.push({table,row});return {error:null}},
 });
 return {db:{from:chain} as unknown as SupabaseClient,inserted};
}
test("Service-only log stores bounded evidence and does not mutate task status",async()=>{
 const {db,inserted}=dbMock();
 let probes=0;
 const result=await investigateVisibilityTasks(db,report,now,async()=>{probes++;return makeAudit()});
 assert.equal(result.investigated,1);
 assert.equal(result.failed,0);
 assert.equal(probes,1);
 assert.equal(inserted.length,1);
 assert.equal(inserted[0].table,"automation_logs");
 assert.equal(inserted[0].row.details.read_only,true);
 assert.equal(inserted[0].row.details.publication_authorized,false);
 assert.equal(inserted[0].row.details.resolution_verified,false);
});
test("Old reports and current recheck cooldown do not trigger public requests",async()=>{
 const {db}=dbMock([{created_at:"2026-10-17T07:55:00Z",details:{source_id:plan.source_id}}]);
 let probes=0;
 const check=async()=>{probes++;return makeAudit()};
 const first=await investigateVisibilityTasks(db,report,now,check);
 const stale=await investigateVisibilityTasks(db,report,new Date("2026-11-01T08:00:00Z"),check);
 assert.equal(first.investigated,0);
 assert.equal(stale.investigated,0);
 assert.equal(probes,0);
 assert.equal(MAX_INVESTIGATED_SITES,2);
});
