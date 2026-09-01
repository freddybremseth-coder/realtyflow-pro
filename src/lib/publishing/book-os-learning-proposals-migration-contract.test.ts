import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const sql=fs.readFileSync(path.join(process.cwd(),"supabase/migrations/20260831144343_book_os_learning_proposals.sql"),"utf8");

test("learning outputs remain proposals with immutable evidence and decisions",()=>{
  assert.match(sql,/create table public\.publishing_learning_proposals/);
  assert.match(sql,/create table public\.publishing_learning_proposal_evidence/);
  assert.match(sql,/create table public\.publishing_learning_proposal_decisions/);
  assert.match(sql,/publishing_learning_evidence_append_only/);
  assert.match(sql,/publishing_learning_decisions_append_only/);
});

test("improvement proposals require repeated canonical controlled evidence",()=>{
  assert.match(sql,/publishing_generate_learning_proposals/);
  assert.match(sql,/join public\.publishing_catalog_revisions r on r\.id=e\.revision_id and r\.is_canonical/);
  assert.match(sql,/having count\(\*\)>=3/);
  assert.match(sql,/group by e\.work_id,e\.edition_id,e\.revision_id,e\.channel,e\.marketplace,e\.change_field,e\.success_metric,e\.proposed_value/);
  assert.match(sql,/one_experiment_never_generalized/);
  assert.match(sql,/learning_rules_created',false/);
});

test("next-book proposals require catalog gap, author fit and market evidence",()=>{
  assert.match(sql,/publishing_stage_next_book_proposal/);
  assert.match(sql,/catalog_gap','author_fit','market_evidence/);
  assert.match(sql,/production_started',false/);
  assert.match(sql,/metadata_changed',false/);
});

test("decisions are service-only and never apply proposals",()=>{
  assert.match(sql,/publishing_decide_learning_proposal/);
  assert.match(sql,/revoke all on table public\.publishing_learning_proposals from public,anon,authenticated,service_role/);
  assert.match(sql,/grant select on table public\.publishing_learning_proposals to service_role/);
  assert.match(sql,/revoke all on function public\.publishing_decide_learning_proposal/);
  assert.match(sql,/external_changes_created',false/);
  assert.doesNotMatch(sql,/insert into public\.publishing_book_projects/i);
  assert.doesNotMatch(sql,/update public\.book_growth_learning_rules/i);
});
