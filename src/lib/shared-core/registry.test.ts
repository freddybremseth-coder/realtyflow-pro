import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SHARED_CORE_DOMAINS,
  SHARED_CORE_DOMAIN_BY_ID,
  sharedCoreProgress,
} from "@/lib/shared-core/registry";

test("Shared Core domains are unique and expose the locked cross-app architecture", () => {
  const ids = SHARED_CORE_DOMAINS.map((domain) => domain.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(SHARED_CORE_DOMAIN_BY_ID.finance.systemOfRecord, "business_financial_events");
  assert.match(SHARED_CORE_DOMAIN_BY_ID.media.systemOfRecord, /media_assets/);
  assert.equal(SHARED_CORE_DOMAIN_BY_ID.tasks.status, "extracting");
  assert.equal(SHARED_CORE_DOMAIN_BY_ID["nexus-feedback"].status, "extracting");
});

test("Shared Core progress is derived from the registry", () => {
  const progress = sharedCoreProgress();
  assert.equal(progress.total, SHARED_CORE_DOMAINS.length);
  assert.equal(progress.canonical + progress.extracting + progress.planned, progress.total);
  assert.ok(progress.canonical >= 3);
});
