import test from "node:test";
import assert from "node:assert/strict";
import { SAM_SITE_STRATEGY } from "./seo-site-strategy";
import { SEO_AUDIT_TARGETS, SEO_SUPPLEMENTAL_AUDIT_TARGETS } from "./seo-audit";

test("Sam has a unique, host-exact, factual brief for every searchable public site", () => {
  assert.equal(SAM_SITE_STRATEGY.length, SEO_AUDIT_TARGETS.length);
  assert.equal(new Set(SAM_SITE_STRATEGY.map(site => site.brandId)).size, SAM_SITE_STRATEGY.length);
  for (const target of SEO_AUDIT_TARGETS) {
    const site = SAM_SITE_STRATEGY.find(item => item.brandId === target.brandId);
    assert.ok(site, target.brandId + " needs its own brief");
    assert.equal(site.host, new URL(target.base).hostname);
    assert.ok(site.intent.length > 30);
    assert.ok(site.qualityGate.length > 45);
  }
  for (const target of SEO_SUPPLEMENTAL_AUDIT_TARGETS) {
    assert.equal(SAM_SITE_STRATEGY.some(site => site.brandId === target.brandId), false);
  }
});
