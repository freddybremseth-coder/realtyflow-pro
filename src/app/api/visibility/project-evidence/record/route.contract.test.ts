import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
const route=readFileSync(new URL("./route.ts",import.meta.url),"utf8");
test("write endpoint is disabled by default and owner-only",()=>{
 assert.match(route,/ALTOVENA_PROJECT_EVIDENCE_WRITES !== "enabled"/);
 assert.match(route,/ctx\?\.role!=="OWNER"/);
 assert.match(route,/ctx\.source!=="owner-session"/);
 assert.match(route,/sec-fetch-site/);
});
test("server controls actor and recorded time and excludes attestations",()=>{
 assert.match(route,/actorId:ctx\.email/);
 assert.match(route,/recordedAt:new Date\(\)\.toISOString/);
 assert.match(route,/\["SOURCE_RECORDED","REVIEW_REQUESTED"\]/);
 assert.doesNotMatch(route,/publicationAuthorized:true/);
});
