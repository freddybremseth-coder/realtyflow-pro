import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createVisibilityDesignProposal } from "./visibility-design-proposal";

const now=new Date("2026-10-17T09:00:00Z");
const work={
 id:"a8202b51-5613-4b9f-af28-79d133a93d16",
 brand_id:"remasterfreddy",source_id:"visibility:remasterfreddy:7271ade9de82004a051d0f86c441a3d9cef2be35",
 status:"TO_DO",metadata:{product:"altovena_visibility",category:"technical",target_url:"https://remaster.freddybremseth.com"},
};
const evidence={
 work_item_id:work.id,source_id:work.source_id,brand_id:work.brand_id,
 checked_at:"2026-10-17T08:30:00Z",target_origin:"https://remaster.freddybremseth.com",
 issue_code:"HEADING_STRUCTURE",result:"OBSERVED_AGAIN",
 read_only:true,publication_authorized:false,resolution_verified:false,
 evidence:{homepageStatus:200,h1Count:0,incomplete:false},
};
test("fresh service-only repeated H1 finding allows a code DESIGN request, never execution",()=>{
 const result=createVisibilityDesignProposal(work,evidence,now);
 assert.equal(result.status,"READY_FOR_DESIGN_REVIEW");
 assert.equal(result.canRequestDraft,true);
 assert.equal(result.executionStarted,false);
 assert.equal(result.publicationAuthorized,false);
 assert.equal(result.approvalRequired,true);
 assert.match(result.fingerprint??"",/^[0-9a-f]{64}$/);
 assert.match(result.change??"",/serverlevert HTML/);
 assert.ok(result.verification.length>=3);
 assert.match(result.rollback??"",/tilbakestilles/);
 assert.deepEqual(result,createVisibilityDesignProposal(work,evidence,now));
});
test("missing, stale, mutable, or mismatched evidence cannot open a repair design",()=>{
 const cases=[
 null, {...evidence,checked_at:"2026-10-15T08:30:00Z"},
 {...evidence,read_only:false},{...evidence,work_item_id:"something-else"},
 {...evidence,source_id:"visibility:another:123"},
 {...evidence,publication_authorized:true},{...evidence,resolution_verified:true},
 {...evidence,target_origin:"https://untrusted.example/"},
 {...evidence,target_origin:"http://remaster.freddybremseth.com"},
 {...evidence,target_origin:"https://remaster.freddybremseth.com/unsafe"},
 ];
 for(const input of cases)assert.equal(createVisibilityDesignProposal(work,input,now).canRequestDraft,false);
});
test("unknown or inconsistent observations never become proof of a fix",()=>{
 for(const e of [
  {...evidence,result:"INCONCLUSIVE"},
  {...evidence,result:"NOT_REPRODUCED"},
  {...evidence,result:"DATA_STILL_INCOMPLETE"},
  {...evidence,evidence:{homepageStatus:503,h1Count:null,incomplete:true}},
  {...evidence,evidence:{homepageStatus:200,h1Count:1,incomplete:false}},
  {...evidence,issue_code:"INDEXING_BLOCKED"}
 ])assert.equal(createVisibilityDesignProposal(work,e,now).canRequestDraft,false);
});
test("closed tasks, missing category and changed route target are blocked",()=>{
 assert.equal(createVisibilityDesignProposal({...work,status:"DONE"},evidence,now).canRequestDraft,false);
 assert.equal(createVisibilityDesignProposal({...work,metadata:{...work.metadata,category:"missing-data"}},evidence,now).canRequestDraft,false);
 assert.equal(createVisibilityDesignProposal({...work,metadata:{...work.metadata,target_url:"https://remaster.freddybremseth.com/private"}},evidence,now).canRequestDraft,false);
});
const file=(path:string)=>readFileSync(new URL("../../../"+path,import.meta.url),"utf8");
test("design request API requires actual owner, same origin, fingerprint and never publishes",()=>{
 const code=file("src/app/api/visibility/work-items/design-request/route.ts");
 assert.match(code,/ctx\?\.role!=="OWNER"/);
 assert.match(code,/ctx\.source!=="owner-session"/);
 assert.match(code,/sec-fetch-site/);
 assert.match(code,/createVisibilityDesignProposal\(task,evidence\)/);
 assert.match(code,/proposal\.fingerprint!==fingerprint/);
 assert.match(code,/approval_granted:false,publication_authorized:false/);
 assert.match(code,/execution_started:false,read_only:true/);
 assert.doesNotMatch(code,/fetch\(.+github|runPortfolioPublishers|\.from\("work_items"\)\.update/);
});
