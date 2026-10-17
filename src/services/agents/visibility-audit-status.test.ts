import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
const read = (path:string) => readFileSync(new URL("../../../"+path,import.meta.url),"utf8");

test("owner work queue displays scheduled versus observed investigation separately",()=>{
 const api=read("src/app/api/visibility/work-items/route.ts");
 const ui=read("src/components/visibility/visibility-work-queue.tsx");
 assert.match(api,/ctx\?\.role!=="OWNER"/);
 assert.match(api,/ctx\.source!=="owner-session"/);
 assert.match(api,/latestSourceAuditAt/);
 assert.match(api,/latestIndependentAt/);
 assert.match(api,/cronOutcome:lastCronRun\?\.outcome\?\?"NOT_PROVEN"/);
 assert.match(ui,/Ingen kontrollbevis registrert/);
 assert.match(ui,/En planlagt kjøring er ikke bevis på gjennomføring/);
 assert.match(ui,/Eventuelle reparasjonsforslag er fortsatt sperret/);
});
test("only durable independent read-only logs are treated as evidence",()=>{
 const api=read("src/app/api/visibility/work-items/route.ts");
 assert.match(api,/d\.read_only!==true/);
 assert.match(api,/d\.publication_authorized!==false/);
 assert.match(api,/d\.resolution_verified!==false/);
 assert.doesNotMatch(api,/\.from\("work_items"\)\.update\(/);
});
