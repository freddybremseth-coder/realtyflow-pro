import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const sql = fs.readFileSync(path.join(process.cwd(),"supabase/migrations/20260831120000_book_os_controlled_experiments.sql"),"utf8");

test("experiments lock canon, baseline, one changed field and rollback",()=>{
  assert.match(sql,/create table public\.publishing_sales_experiments/);
  assert.match(sql,/revision_id uuid not null references public\.publishing_catalog_revisions/);
  assert.match(sql,/check \(proposed_value <> baseline_value\)/);
  assert.match(sql,/check \(rollback_value = baseline_value\)/);
  assert.match(sql,/publishing_sales_experiments_one_active_change/);
});

test("proposal, approval, application evidence and evaluation are separate",()=>{
  assert.match(sql,/publishing_stage_sales_experiment/);
  assert.match(sql,/publishing_decide_sales_experiment/);
  assert.match(sql,/publishing_start_sales_experiment/);
  assert.match(sql,/publishing_evaluate_sales_experiment/);
  assert.match(sql,/single_experiment_not_learning_rule/);
  assert.match(sql,/learning_rule_created',false/);
  assert.match(sql,/external_changes_created',false/g);
});

test("weak evidence is inconclusive and access is service-only",()=>{
  assert.match(sql,/baseline_days>=7 and test_days>=7/);
  assert.match(sql,/evidence='insufficient' then 'inconclusive'/);
  assert.match(sql,/enable row level security/);
  assert.match(sql,/revoke all on table public\.publishing_sales_experiments from public,anon,authenticated,service_role/);
  assert.match(sql,/grant select on table public\.publishing_sales_experiments to service_role/);
  assert.match(sql,/revoke all on function public\.publishing_stage_sales_experiment/);
});
