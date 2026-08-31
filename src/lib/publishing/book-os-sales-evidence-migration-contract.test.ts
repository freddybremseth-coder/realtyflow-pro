import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260831100000_book_os_sales_evidence.sql"), "utf8");

test("sales evidence is canonically attributed and preserves its source", () => {
  assert.match(sql, /create table public\.publishing_sales_facts/);
  assert.match(sql, /source_metric_id uuid not null unique/);
  assert.match(sql, /work_id uuid not null references public\.publishing_catalog_works/);
  assert.match(sql, /edition_id uuid not null references public\.publishing_catalog_editions/);
  assert.match(sql, /revision_id uuid references public\.publishing_catalog_revisions/);
  assert.match(sql, /evidence_snapshot jsonb not null/);
  assert.match(sql, /exact_revision.*edition_only/);
});

test("legacy reconciliation is idempotent, non-destructive and exposes exceptions", () => {
  assert.match(sql, /publishing_reconcile_legacy_sales_metrics/);
  assert.match(sql, /not exists \(select 1 from public\.publishing_sales_facts f where f\.source_metric_id=m\.id\)/);
  assert.match(sql, /on conflict \(source_metric_id\) do nothing/);
  assert.match(sql, /publishing_sales_reconciliation_exceptions/);
  assert.match(sql, /book_missing.*canonical_edition_missing/);
  assert.doesNotMatch(sql, /(update|delete from) public\.book_growth_metrics/i);
  assert.match(sql, /external_changes_created',false/);
});

test("canonical facts are append-only and service-only", () => {
  assert.match(sql, /publishing_sales_facts_append_only/);
  assert.match(sql, /before update or delete on public\.publishing_sales_facts/);
  assert.match(sql, /enable row level security/g);
  assert.match(sql, /revoke all on table public\.publishing_sales_facts from public, anon, authenticated, service_role/);
  assert.match(sql, /grant select on table public\.publishing_sales_facts to service_role/);
  assert.match(sql, /revoke all on function public\.publishing_reconcile_legacy_sales_metrics\(text\) from public,anon,authenticated/);
});
