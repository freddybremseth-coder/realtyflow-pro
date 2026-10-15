import test from "node:test";
import assert from "node:assert/strict";
import { visibilityPublishingInvestigations } from "./visibility-publishing-investigations";
import type { BrandPublicationStatus } from "./seo-brand-publisher";

const asStatuses = (items: unknown[]) => items as BrandPublicationStatus[];
test("only real blocked status creates investigation, never publication permission", () => {
  const rows = visibilityPublishingInvestigations(asStatuses([
    { brandId: "donaanna", status: "blocked", reason: "Kildens metadata samsvarer ikke med offentlig hovedside.", page: "/" },
    { brandId: "pinosoecolife", status: "monitor", reason: "Venter på søkesignal.", page: "/" },
    { brandId: "chatgenius", status: "verified", reason: "Publisert", page: "/" },
  ]));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].brandId, "donaanna");
  assert.match(rows[0].evidence, /metadata samsvarer ikke/);
  assert.match(rows[0].nextStep, /canonical/);
  assert.equal(rows[0].publicationEligible, false);
  assert.equal(rows[0].requiresApproval, false);
});
test("does not turn absent data into invented publisher blockers", () => {
  assert.deepEqual(visibilityPublishingInvestigations(null), []);
  assert.deepEqual(visibilityPublishingInvestigations([]), []);
});
test("publisher blockers are deduplicated per brand without mixing brands", () => {
  const rows = visibilityPublishingInvestigations(asStatuses([
    { brandId: "donaanna", status: "blocked", reason: "reason one", page: "/" },
    { brandId: "donaanna", status: "blocked", reason: "reason two", page: "/" },
    { brandId: "remasterfreddy", status: "blocked", reason: "other", page: "/" },
  ]));
  assert.deepEqual(rows.map(row => row.key), ["visibility:publishing:donaanna", "visibility:publishing:remasterfreddy"]);
  assert.equal(rows[0].evidence, "reason one");
});
