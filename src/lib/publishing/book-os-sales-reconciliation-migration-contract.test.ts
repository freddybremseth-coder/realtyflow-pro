import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260831110000_book_os_sales_reconciliation.sql"), "utf8");

test("exception resolution separates proposal from approval", () => {
  assert.match(sql, /create table public\.publishing_sales_reconciliation_resolutions/);
  assert.match(sql, /status text not null default 'pending'/);
  assert.match(sql, /publishing_stage_sales_exception_resolution/);
  assert.match(sql, /sales_fact_created',false/);
  assert.match(sql, /publishing_decide_sales_exception_resolution/);
  assert.match(sql, /p_decision not in \('approve','reject'\)/);
});

test("approval applies one exact audited sales fact and resolves the exception", () => {
  assert.match(sql, /manual_exception_resolution/);
  assert.match(sql, /insert into public\.publishing_sales_facts/);
  assert.match(sql, /manual_resolution_id/);
  assert.match(sql, /update public\.publishing_sales_reconciliation_exceptions set resolved_at=now\(\)/);
  assert.match(sql, /sales_fact_id=result_fact_id/);
  assert.match(sql, /external_changes_created',false/);
  assert.doesNotMatch(sql, /(update|delete from) public\.book_growth_metrics/i);
});

test("resolution functions and records are service-only", () => {
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on table public\.publishing_sales_reconciliation_resolutions from public,anon,authenticated,service_role/);
  assert.match(sql, /revoke all on function public\.publishing_stage_sales_exception_resolution\(uuid,uuid,text\) from public,anon,authenticated/);
  assert.match(sql, /revoke all on function public\.publishing_decide_sales_exception_resolution\(uuid,text,text,text\) from public,anon,authenticated/);
  assert.match(sql, /grant execute on function public\.publishing_decide_sales_exception_resolution\(uuid,text,text,text\) to service_role/);
});
