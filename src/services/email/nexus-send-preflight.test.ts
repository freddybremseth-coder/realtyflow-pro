import test from "node:test";
import assert from "node:assert/strict";
import { assessNexusSendPreflight } from "./nexus-send-preflight";

function baseInput(): any {
  return {
    brandId: "zeneco",
    profile: { status: "approved" },
    shortlist: { status: "approved" },
    presentation: { status: "approved", presentation_json: { summary: "Relevant homes", properties: [{ propertyId: "p1", title: "Villa A", publicUrl: "https://zenecohomes.com/property/a", concerns: [], questionsToVerify: [] }] } },
    draft: { status: "approved", subject: "Boliger som passer søket ditt", body_text: "Hei, her er boligene vi har valgt ut.", sent_at: null, cancelled_at: null },
    contact: { id: "c1", email: "customer@example.com", brand_id: "zeneco" },
    shortlistItems: [{ quality_review_status: "client_ready" }], senderConfigured: true, suppressionBlocked: false, suppressionError: null,
  };
}

test("marks a fully validated approved draft READY without granting send permission", () => {
  const result = assessNexusSendPreflight(baseInput());
  assert.equal(result.status, "READY"); assert.equal(result.ready, true); assert.deepEqual(result.blockers, []); assert.equal(result.checks.clientReadyPropertyCount, 1); assert.equal(result.checks.verifiedPropertyLinkCount, 1); assert.match(result.warnings.at(-1) || "", /same safety checks must run again/i);
});
test("fails closed when CRM suppression blocks the recipient", () => { const input = baseInput(); input.suppressionBlocked = true; const result = assessNexusSendPreflight(input); assert.equal(result.status, "BLOCKED"); assert.ok(result.blockers.some((value) => /suppressed|do-not-contact/i.test(value))); });
test("blocks missing property links, sender configuration and invalid recipient", () => { const input = baseInput(); input.senderConfigured = false; input.contact.email = "invalid"; input.presentation.presentation_json.properties[0].publicUrl = ""; const result = assessNexusSendPreflight(input); assert.equal(result.ready, false); assert.ok(result.blockers.some((value) => /sender account/i.test(value))); assert.ok(result.blockers.some((value) => /recipient email/i.test(value))); assert.ok(result.blockers.some((value) => /public link/i.test(value))); });
test("blocks already-sent or cancelled drafts and requires at least one client-ready property", () => { const input = baseInput(); input.draft.sent_at = "2026-09-11T10:00:00.000Z"; input.shortlistItems = [{ quality_review_status: "rejected" }]; const result = assessNexusSendPreflight(input); assert.equal(result.ready, false); assert.ok(result.blockers.some((value) => /already sent|cancelled|closed/i.test(value))); assert.ok(result.blockers.some((value) => /client-ready/i.test(value))); });
