import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync(new URL("./route.ts", import.meta.url), "utf8");

test("quality center is admin-only and imports legacy bibles as review records", () => {
  assert.match(route, /requireAdminApi\(request\)/);
  assert.match(route, /action === "approve_bible_bundle"/);
  assert.match(route, /action !== "import_existing_bibles"/);
  assert.match(route, /status: "review"/);
  assert.doesNotMatch(route, /status: "approved"/);
  assert.match(route, /content_fingerprint/);
  assert.match(route, /readiness\.missingBibles\.includes\("series_bible"\) && hasSeriesBibleSource/);
});

test("quality center derives readiness from exact revision data", () => {
  assert.match(route, /row\.edition_id === edition\.id && row\.is_canonical/);
  assert.match(route, /row\.revision_id === canonicalRevision\.id/);
  assert.match(route, /qualityTaxonomyReadiness/);
});

test("OpenAI quality evidence stays pending until a separate human decision", () => {
  assert.match(route, /action === "run_quality_check"/);
  assert.match(route, /reviewBookQuality/);
  assert.match(route, /result: "running", decision: "pending", automated: true/);
  assert.match(route, /findings: review\.findings, web_sources: review\.webSources, coverage: review\.coverage/);
  assert.match(route, /action === "decide_quality_check"/);
  assert.match(route, /decision === "approved" && !\["pass", "warning"\]\.includes\(check\.result\)/);
  assert.match(route, /decided_by: "admin_ui"/);
});

test("deterministic gates retain structured evidence and do not impersonate editorial approval", () => {
  assert.match(route, /action === "run_technical_quality_check"/);
  assert.match(route, /runDeterministicQualityCheck/);
  assert.match(route, /provider: "realtyflow", model: null/);
  assert.match(route, /evidence_fingerprint: fingerprint\(evidence\)/);
  assert.match(route, /decision: "pending"/);
});

test("taxonomy generation is proposal-only and bundle approval is a separate admin action", () => {
  assert.match(route, /action === "generate_taxonomy"/);
  assert.match(route, /suggestBookTaxonomy/);
  assert.match(route, /publishing_stage_taxonomy_bundle/);
  assert.match(route, /action === "decide_taxonomy_bundle"/);
  assert.match(route, /publishing_decide_taxonomy_bundle/);
  assert.match(route, /p_actor: "admin_ui"/);
  assert.doesNotMatch(route, /book_growth_apply_channel_metadata_candidate/);
});

test("channel mapping produces four proposal packages and keeps submission separate", () => {
  assert.match(route, /action === "generate_channel_packages"/);
  assert.match(route, /buildChannelMetadataPackages/);
  assert.match(route, /publishing_stage_channel_metadata_bundle/);
  assert.match(route, /action === "decide_channel_metadata_bundle"/);
  assert.match(route, /publishing_decide_channel_metadata_bundle/);
  assert.doesNotMatch(route, /publishing_distribution_transition_job/);
});
