import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
const source = readFileSync(new URL("./route.ts",import.meta.url),"utf8");
test("evidence history endpoint requires direct owner session",()=>{
  assert.match(source,/ctx\?\.role !== "OWNER"/);
  assert.match(source,/ctx\.source !== "owner-session"/);
});
test("endpoint is read-only and never exposes internal document content",()=>{
  assert.match(source,/\.eq\("action",PROJECT_EVIDENCE_ACTION\)/);
  assert.doesNotMatch(source,/\.insert\(|\.update\(|\.delete\(/);
  assert.doesNotMatch(source,/document_id:\s*item\.details/);
  assert.match(source,/publicationEligible:false/);
});
