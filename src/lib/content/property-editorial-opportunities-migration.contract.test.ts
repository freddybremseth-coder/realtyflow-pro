import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync(
  "supabase/migrations/20260929220656_nexus_property_content_opportunities.sql",
  "utf8",
);
const coverage = readFileSync(
  "supabase/migrations/20260929221132_nexus_property_content_coverage_bootstrap.sql",
  "utf8",
);
const learning = readFileSync(
  "supabase/migrations/20260929222605_nexus_property_content_learning_snapshots.sql",
  "utf8",
);

test("editorial opportunity queue remains server-only", () => {
  assert.match(schema, /enable row level security/i);
  assert.match(schema, /revoke all on public\.property_content_opportunities from public, anon, authenticated/i);
  assert.match(schema, /grant select, insert, update on public\.property_content_opportunities to service_role/i);
  assert.doesNotMatch(schema, /create policy/i);
});

test("editorial opportunity status never implies external publication", () => {
  assert.match(schema, /suggested','drafted','dismissed','expired/);
  assert.doesNotMatch(schema, /published/);
  assert.match(schema, /draft_id uuid references core\.brand_workspace_content_drafts/i);
});

test("existing Zen market comparisons are bootstrapped as dismissed coverage", () => {
  assert.match(coverage, /covered_existing_magazine/);
  assert.match(coverage, /'dismissed'/);
  assert.match(coverage, /on conflict \(brand_id,signature\) do nothing/i);
});

test("property content learning storage remains service-only and observe-first", () => {
  assert.match(learning, /enable row level security/i);
  assert.match(learning, /revoke all on public\.property_content_learning_snapshots from public, anon, authenticated/i);
  assert.match(learning, /grant all on public\.property_content_learning_snapshots to service_role/i);
  assert.match(learning, /insufficient','emerging','measured/);
  assert.match(learning, /does not authorize automatic strategy or scoring changes/i);
  assert.doesNotMatch(learning, /create policy/i);
});
