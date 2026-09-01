import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route=fs.readFileSync(new URL("./route.ts",import.meta.url),"utf8");

test("learning proposal center is admin-only and reads canonical evidence",()=>{
  assert.match(route,/requireAdminApi\(request\)/g);
  assert.match(route,/publishing_learning_proposals/);
  assert.match(route,/publishing_learning_proposal_evidence/);
  assert.match(route,/publishing_learning_proposal_decisions/);
});

test("generation, next-book staging and decisions never apply changes",()=>{
  assert.match(route,/publishing_generate_learning_proposals/);
  assert.match(route,/publishing_stage_next_book_proposal/);
  assert.match(route,/publishing_decide_learning_proposal/);
  assert.doesNotMatch(route,/\.from\("book_growth_learning_rules"\)\.update/);
  assert.doesNotMatch(route,/\.from\("book_growth_learning_rules"\)\.insert/);
  assert.doesNotMatch(route,/publishing_book_projects/);
  assert.doesNotMatch(route,/runApprovedPublication/);
});
