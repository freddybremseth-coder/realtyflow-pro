import test from "node:test";
import assert from "node:assert/strict";
import { SEO_SKILLS, seoSkillsByAvailability, SEO_SENIOR_OPERATING_RULES } from "./seo-skills";
import { SEO_AUDIT_TARGETS } from "./seo-audit";

test("Sam SEO identifies only real measured tooling and explicitly gated external tools", () => {
  assert.equal(SEO_SKILLS.length, new Set(SEO_SKILLS.map(skill => skill.id)).size);
  const grouped = seoSkillsByAvailability();
  assert.ok(grouped.measured.some(skill => skill.id === "referral_analytics"));
  assert.ok(grouped.measured.some(skill => skill.id === "homepage_audit"));
  assert.ok(grouped.needsConnection.some(skill => skill.id === "google_search_console"));
  assert.ok(grouped.needsConnection.some(skill => skill.id === "bing_webmaster"));
  assert.ok(grouped.needsConnection.some(skill => skill.id === "core_web_vitals"));
  assert.ok(SEO_SENIOR_OPERATING_RULES.includes("Ikke rediger produksjon"));
  assert.equal(SEO_AUDIT_TARGETS.length, 8);
  assert.equal(SEO_AUDIT_TARGETS.find(item => item.brandId === "chatgenius")?.base, "https://www.chatgenius.pro");
});
