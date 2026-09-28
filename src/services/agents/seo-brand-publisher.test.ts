import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GSCBrandSnapshot } from "./seo-search-console";
import { runBrandPublisher, brandPublicationId, requestBrandRollback, portfolioPublicationStatuses, secondExperimentReady } from "./seo-brand-publisher";
import { SEO_BRAND_PUBLISHERS, patchBrandHtml, secondVariantForBrand } from "./seo-brand-publishing";
import { githubForSite, type GithubRequest } from "./seo-brand-github";
const site=SEO_BRAND_PUBLISHERS[1],now=new Date("2026-09-27T12:00:00Z");
const A="a".repeat(40),B="b".repeat(40),C="c".repeat(40);
const before={title:"Existing title",description:"Existing description"};
const html=(title=before.title,description=before.description)=>`<html><head><title>${title}</title><meta name="description" content="${description}"><link rel="canonical" href="${site.origin}/"></head><body>Original content</body></html>`;
const snapshot:GSCBrandSnapshot={brandId:site.brandId,connected:true,property:site.origin+"/",collectedAt:now.toISOString(),
  period:{currentStart:"2026-08-26",currentEnd:"2026-09-24",previousStart:"2026-07-27",previousEnd:"2026-08-25"},
  metric:"Google Search Console web Search Analytics; grouped by canonical page",
  totals:{currentClicks:1,currentImpressions:150,previousClicks:0,previousImpressions:0,currentCtr:1/150,previousCtr:null},
  topPages:[{path:"/",clicks:1,impressions:150,ctr:1/150,position:8}],
  topQueryPages:[{page:"/",query:"relevant search",clicks:1,impressions:50,ctr:.02,position:8}],
  dataQuality:{truncated:false,queryRowsSampled:true,note:"measured"}};
type Row=Record<string,any>;
function database(){
  const rows:Row[]=[],fail={intent:false,effect:false,finalize:false};
  const client={from(table:string){
    assert.equal(table,"automation_logs");
    let op="read",payload:Row={};const filters:Array<(row:Row)=>boolean>=[];
    function execute(){
      if(op==="insert"||op==="upsert"){
        if((payload.action==="seo_autopilot_change"&&fail.effect)||(payload.action==="seo_brand_publication_v1"&&fail.intent))return{data:null,error:{code:"TEST"}};
        const existing=rows.find(r=>r.id===payload.id);
        if(existing)return op==="insert"?{data:null,error:{code:"23505"}}:{data:null,error:null};
        rows.push(structuredClone(payload));return{data:null,error:null};
      }
      const found=rows.filter(r=>filters.every(f=>f(r)));
      if(op==="update"){
        if(payload.details?.phase==="done"&&fail.finalize)return{data:null,error:{code:"TEST"}};
        found.forEach(r=>Object.assign(r,structuredClone(payload)));
      }
      return{data:structuredClone(found),error:null};
    }
    const chain:any={select:()=>chain,eq:(k:string,v:unknown)=>{filters.push(r=>r[k]===v);return chain;},
      in:(k:string,v:unknown[])=>{filters.push(r=>v.includes(r[k]));return chain;},
      contains:(k:string,v:Row)=>{filters.push(r=>Object.entries(v).every(([key,value])=>r[k]?.[key]===value));return chain;},
      insert:(r:Row)=>{op="insert";payload=r;return chain;},upsert:(r:Row)=>{op="upsert";payload=r;return chain;},
      update:(r:Row)=>{op="update";payload=r;return chain;},
      maybeSingle:async()=>{const r=execute();return{...r,data:r.data?.[0]||null};},
      then:(resolve:any,reject:any)=>Promise.resolve(execute()).then(resolve,reject)};
    return chain;
  }} as unknown as SupabaseClient;
  return{client,rows,fail};
}
function environment(){
  const db=database();
  const state={main:A,source:html(),branch:html(),live:html(),green:true,extraFile:false,push:true,
    headRepo:site.repository as string,refreshes:0,merges:0,branchExists:false,prepareSaveFailure:false};
  const writes:Row[]=[],pulls:Row[]=[];
  const github:GithubRequest=async(method,path,body)=>{
    const suffix=path.replace("/repos/"+site.repository,"");const data=body as any;
    if(method!=="GET")writes.push({method,path:suffix,body:data});
    if(suffix==="")return{full_name:site.repository,default_branch:"main",permissions:{push:state.push}};
    if(suffix==="/git/ref/heads/main")return{object:{sha:state.main}};
    if(suffix.startsWith("/contents/")&&method==="GET"){
      const ref=new URL("https://test"+suffix).searchParams.get("ref");
      const content=ref===state.main||ref===A?state.source:state.branch;
      return{type:"file",encoding:"base64",size:content.length,sha:A,content:Buffer.from(content).toString("base64")};
    }
    if(suffix==="/git/refs"){
      if(state.branchExists)throw new Error("already exists");state.branchExists=true;state.branch=state.source;return{};
    }
    if(suffix.startsWith("/git/ref/heads/"))return{object:{sha:B}};
    if(suffix.startsWith("/contents/")&&method==="PUT"){state.branch=Buffer.from(data.content,"base64").toString("utf8");return{};}
    if(suffix.startsWith("/pulls?"))return pulls;
    if(suffix==="/pulls"&&method==="POST"){
      const pull={number:pulls.length+1,state:"open",head:{ref:data.head,sha:B,repo:{full_name:state.headRepo}},
        base:{ref:"main",repo:{full_name:site.repository}},html_url:"https://github.com/"+site.repository+"/pull/1",merged:false};
      pulls.push(pull);return pull;
    }
    if(/^\/pulls\/\d+$/.test(suffix))return pulls.at(-1);
    if(suffix.includes("/files?"))return[{filename:site.file,status:"modified"},...(state.extraFile?[{filename:"other",status:"modified"}]:[])];
    if(suffix.includes("/status?"))return{state:state.green?"success":"pending",total_count:1,statuses:[{context:"Vercel – freddybremseth",state:state.green?"success":"pending"}]};
    if(suffix.includes("/check-runs?"))return{total_count:1,check_runs:[{status:"completed",conclusion:"success"}]};
    if(suffix==="/merges"){state.refreshes++;return{};}
    if(suffix.endsWith("/merge")){
      state.merges++;state.main=C;state.source=state.branch;
      Object.assign(pulls.at(-1)!,{merged:true,merge_commit_sha:C,merged_at:now.toISOString()});
      return{merged:true,sha:C};
    }
    throw new Error("Unexpected request: "+method+" "+suffix);
  };
  const run=(s:GSCBrandSnapshot|null=snapshot,date=now)=>runBrandPublisher(db.client,site,s,{github,now:date,publicHtml:async()=>state.live});
  return{db,state,writes,pulls,run,github};
}
test("publisher waits for evidence and refuses live/source mismatch or missing repo write access",async()=>{
  const e=environment();assert.equal((await e.run(null)).status,"monitor");assert.equal(e.writes.length,0);
  e.state.live=html("different");assert.equal((await e.run()).status,"blocked");assert.equal(e.writes.length,0);
  e.state.live=html();e.state.push=false;assert.equal((await e.run()).status,"blocked");assert.equal(e.db.rows.length,0);
});
test("no remote writes before durable intent; concurrent claims produce only one intent",async()=>{
  const e=environment();e.db.fail.intent=true;await assert.rejects(e.run(),/intent/);assert.equal(e.writes.length,0);
  e.db.fail.intent=false;await Promise.all([e.run(),e.run()]);assert.equal(e.db.rows.length,1);
  assert.equal(e.pulls.length,1);assert.equal(e.db.rows[0].details.phase,"checks");
});
test("complete lifecycle requires green checks and actual public HTML; retries count/log only once",async()=>{
  const e=environment();assert.equal((await e.run()).status,"pending");
  e.state.green=false;await e.run();assert.equal(e.state.merges,0);
  e.state.green=true;await e.run();assert.equal(e.state.merges,1);assert.equal(e.db.rows[0].details.phase,"deploy");
  assert.equal((await e.run()).published,0);assert.equal(e.db.rows.length,1);
  e.state.live=html(site.title,site.description);e.db.fail.effect=true;
  await assert.rejects(e.run(),/Effect measurement/);assert.equal(e.db.rows[0].details.phase,"deploy");
  e.db.fail.effect=false;e.db.fail.finalize=true;await assert.rejects(e.run(),/progress/);
  e.db.fail.finalize=false;assert.equal((await e.run()).published,1);assert.equal((await e.run()).published,0);
  assert.equal(e.db.rows.filter(r=>r.action==="seo_autopilot_change").length,1);
  assert.equal(e.db.rows[0].details.phase,"done");
});
test("prepared PR waits when fresh Google evidence expires or disappears",async()=>{
  const e=environment();await e.run();
  assert.match((await e.run(null)).reason,/ferske Google/);
  await e.run(snapshot,new Date(+now+8*86400000));assert.equal(e.state.merges,0);
  const changed=structuredClone(snapshot);changed.topQueryPages[0].query="other search";
  await e.run(changed);assert.equal(e.state.merges,0);
});
test("changed target, extra files and foreign head repo cannot be auto merged",async()=>{
  for(const fault of ["file","extra","repo"]){
    const e=environment();await e.run();
    if(fault==="file")e.state.branch=e.state.branch.replace("Original content","Unexpected");
    if(fault==="extra")e.state.extraFile=true;
    if(fault==="repo")e.pulls[0].head.repo.full_name="other/repo";
    assert.equal((await e.run()).status,"blocked");assert.equal(e.state.merges,0);
  }
});
test("moving main refreshes and rechecks before merge; manual metadata conflict is preserved",async()=>{
  const e=environment();await e.run();e.state.main="d".repeat(40);await e.run();
  assert.equal(e.state.refreshes,1);assert.equal(e.state.merges,0);assert.equal(e.db.rows[0].details.baseSha,e.state.main);
  await e.run();assert.equal(e.state.merges,1);
  const conflict=environment();await conflict.run();conflict.state.main="d".repeat(40);conflict.state.source=html("Manual edit");
  await assert.rejects(conflict.run(),/changed/);assert.equal(conflict.state.merges,0);assert.equal(conflict.state.refreshes,0);
});
test("dashboard recovers pending state from durable intent when daily summary is missing",async()=>{
  const e=environment();await e.run();
  const states=await portfolioPublicationStatuses(e.db.client,null);
  const current=states.find(s=>s.brandId===site.brandId)!;
  assert.equal(current.status,"pending");assert.match(current.pullUrl!,/\/pull\/1$/);
  assert.equal(states.filter(s=>s.status==="monitor").length,6);
});
test("merge success with lost DB save is recovered without merging again",async()=>{
  const e=environment();await e.run();await e.run();e.db.rows[0].details.phase="checks";
  await e.run();assert.equal(e.state.merges,1);assert.equal(e.db.rows[0].details.phase,"deploy");
});
test("unverified after 72h queues rollback; owner cannot roll back stale or pending revision",async()=>{
  const e=environment();await e.run();await e.run();
  assert.equal(await requestBrandRollback(e.db.client,site.brandId,C),false);
  await e.run(null,new Date(+now+73*3600000));assert.equal(e.db.rows[0].details.phase,"rollback_prepare");
  const statuses=await portfolioPublicationStatuses(e.db.client,[]);
  assert.equal(statuses.length,7);assert.match(statuses.find(s=>s.brandId===site.brandId)!.reason,/Tilbakeføring/);
});
test("owner rollback follows checks and live verification, preserves body, and ends effect measurement",async()=>{
  const e=environment();await e.run();await e.run();e.state.live=html(site.title,site.description);await e.run();
  assert.equal(await requestBrandRollback(e.db.client,site.brandId,A),false);
  assert.equal(await requestBrandRollback(e.db.client,site.brandId,C),true);
  assert.equal(await requestBrandRollback(e.db.client,site.brandId,C),false);
  e.state.branchExists=false;await e.run();assert.equal(e.db.rows[0].details.phase,"rollback_checks");
  assert.equal(e.state.branch,patchBrandHtml(e.state.source,site,before));
  await e.run();assert.equal(e.db.rows[0].details.phase,"rollback_deploy");
  assert.equal((await e.run()).status,"pending");e.state.live=html();
  assert.equal((await e.run()).status,"rollback");assert.equal(e.db.rows[0].details.phase,"rolled_back");
  assert.equal(e.db.rows.find(r=>r.action==="seo_autopilot_change")?.status,"partial");
  assert.equal((await e.run()).status,"rollback");
});
test("GitHub gate requires exact brand deployment plus complete passing checks",async()=>{
  let status:any={state:"success",total_count:1,statuses:[{context:"Vercel – freddybremseth",state:"success"}]};
  let checks:any={total_count:1,check_runs:[{status:"completed",conclusion:"success"}]};
  const gh=githubForSite(site,async(_m,path)=>path.includes("check-runs")?checks:status);
  assert.equal(await gh.green(A),true);
  checks.check_runs[0].conclusion="failure";assert.equal(await gh.green(A),false);
  checks={total_count:101,check_runs:[]};assert.equal(await gh.green(A),false);
  checks={total_count:0,check_runs:[]};status.statuses[0].context="Vercel – freddybremseth-books";
  assert.equal(await gh.green(A),false);
  await assert.rejects(gh.green("main"),/revision/);
});


test("every portfolio brand has a distinct fixed v2 metadata variant",()=>{
  for(const configured of SEO_BRAND_PUBLISHERS){
    const second=secondVariantForBrand(configured.brandId);
    assert.ok(second.title.length > 10);
    assert.ok(second.description.length > 30);
    assert.notEqual(second.title,configured.title);
    assert.notEqual(second.description,configured.description);
  }
});

test("v2 remains locked until v1 has a complete measured post-change period",()=>{
  const measured=structuredClone(snapshot);
  measured.period.currentStart="2026-09-02";
  measured.period.currentEnd="2026-10-01";
  measured.topPages=[{path:"/",clicks:2,impressions:180,ctr:2/180,position:7}];
  measured.topQueryPages=[{page:"/",query:"relevant search",clicks:2,impressions:60,ctr:2/60,position:7}];
  const effect={
    change_id:"sam_"+site.brandId+"_homepage_v1",
    brand_id:site.brandId,
    page:"/",
    query:"relevant search",
    commit_sha:C,
    applied_at:"2026-08-01T12:00:00Z",
    site_verified:true,
    publisher:"github_metadata_v1",
    baseline_period_start:"2026-07-01",
    baseline_period_end:"2026-07-30",
    baseline_impressions:50,
    baseline_clicks:1,
    baseline_position:8,
  };
  assert.equal(secondExperimentReady(effect,measured),true);
  const overlapping=structuredClone(measured);
  overlapping.period.currentStart="2026-08-01";
  overlapping.period.currentEnd="2026-08-30";
  assert.equal(secondExperimentReady(effect,overlapping),false);
  assert.equal(secondExperimentReady({...effect,site_verified:false},measured),false);
  assert.equal(secondExperimentReady(effect,null),false);
});


test("owner rollback only accepts the latest valid experiment revision",async()=>{
  const e=environment();
  await e.run();
  await e.run();
  e.state.live=html(site.title,site.description);
  await e.run();
  const v1=e.db.rows.find(r=>r.action==="seo_brand_publication_v1")!;
  assert.equal(v1.details.phase,"done");
  const v2Revision="d".repeat(40);
  e.db.rows.push({
    id:brandPublicationId(site.brandId,":v2"),
    action:"seo_brand_publication_v1",
    agent_name:"Sam SEO Expert",
    status:"success",
    details:{
      ...structuredClone(v1.details),
      experimentVersion:"v2",
      target:secondVariantForBrand(site.brandId),
      phase:"done",
      mergeSha:v2Revision,
      mergedAt:"2026-09-27T13:00:00Z",
    },
  });
  assert.equal(await requestBrandRollback(e.db.client,site.brandId,C),false);
  assert.equal(await requestBrandRollback(e.db.client,site.brandId,v2Revision),true);
});
