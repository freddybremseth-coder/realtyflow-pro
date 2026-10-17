import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const file=(path:string)=>readFileSync(new URL("../../../"+path,import.meta.url),"utf8");
test("independent cron requires secret, Nexus safe mode and server-side report only",()=>{
 const route=file("src/app/api/cron/visibility-investigations/route.ts");
 assert.match(route,/requireCronApi\(request\)/);
 assert.match(route,/evaluateCronSafeMode\(PATH\)/);
 assert.match(route,/seo_gsc_live_read/);
 assert.match(route,/investigateVisibilityTasks\(db, report, now\)/);
 assert.doesNotMatch(route,/request\.json\(/);
 assert.match(route,/resolutionVerified: false/);
});
test("owner control cannot work in a preview role or cross-site",()=>{
 const route=file("src/app/api/visibility/investigations/run/route.ts");
 assert.match(route,/ctx\?\.role\s*!==\s*"OWNER"/);
 assert.match(route,/ctx\.source\s*!==\s*"owner-session"/);
 assert.match(route,/sec-fetch-site/);
 assert.match(route,/investigateVisibilityTasks\(db, report, now\)/);
 assert.doesNotMatch(route,/request\.json\(/);
});
test("read-only evidence is separate from editable work item metadata",()=>{
 const worker=file("src/services/agents/visibility-investigation.ts");
 const api=file("src/app/api/visibility/work-items/route.ts");
 assert.match(worker,/MAX_INVESTIGATED_SITES = 2/);
 assert.match(worker,/MAX_INVESTIGATED_TASKS = 4/);
 assert.match(worker,/read_only: true/);
 assert.match(worker,/resolution_verified: false/);
 assert.doesNotMatch(worker,/\.from\("work_items"\)\.update\(/);
 assert.match(api,/visibility_independent_investigation/);
});
