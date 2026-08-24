import assert from "node:assert/strict";
import test from "node:test";
import { assertPublishableForStatus, auditPublications } from "@/services/publishing/publishability-guard";

const INCIDENT = "Jeg setter opp Marketing Agent til å generere denne selgende SoMe-posten for Zen Eco Homes-eiendommen i Calpe.";
const GOOD = "Nydelig moderne villa i Calpe med panoramautsikt over havet. Book en visning i dag.";

// ── Status transition guard (E) ─────────────────────────────────────────────
test("REGRESJON: meta-tekst kan ALDRI gå til scheduled", () => {
  const r = assertPublishableForStatus({ content: INCIDENT, targetStatus: "scheduled", platform: "instagram" });
  assert.equal(r.ok, false);
  assert.match(r.reason ?? "", /PUBLISHABILITY_FAILED/);
});

test("draft er alltid tillatt (kan eksistere internt)", () => {
  assert.equal(assertPublishableForStatus({ content: INCIDENT, targetStatus: "draft" }).ok, true);
});

test("gyldig Zen Eco Homes-caption kan planlegges/godkjennes", () => {
  assert.equal(assertPublishableForStatus({ content: GOOD, targetStatus: "scheduled", platform: "instagram" }).ok, true);
  assert.equal(assertPublishableForStatus({ content: GOOD, targetStatus: "approved", platform: "facebook" }).ok, true);
});

test("tom body → EMPTY_BODY (kan ikke ut)", () => {
  assert.equal(assertPublishableForStatus({ content: "   ", targetStatus: "scheduled" }).reason, "EMPTY_BODY");
});

test("ugyldig plattform → INVALID_PLATFORM", () => {
  assert.match(assertPublishableForStatus({ content: GOOD, targetStatus: "scheduled", platform: "myspace" }).reason ?? "", /INVALID_PLATFORM/);
});

test("media påkrevd men mangler → MEDIA_REQUIRED", () => {
  assert.equal(assertPublishableForStatus({ content: GOOD, targetStatus: "scheduled", platform: "instagram", mediaRequired: true, mediaOk: false }).reason, "MEDIA_REQUIRED");
});

// ── Audit (H) ───────────────────────────────────────────────────────────────
test("audit finner mistenkelige rader (published/scheduled med meta-tekst), lar gode være", () => {
  const hits = auditPublications([
    { id: "bad-published", brand_id: "zeneco", status: "published", platform: "instagram", description: INCIDENT },
    { id: "bad-scheduled", brand_id: "zeneco", status: "scheduled", platform: "facebook", content: "Here is your Instagram post: villa." },
    { id: "good", brand_id: "zeneco", status: "scheduled", description: GOOD },
    { id: "empty-draft", brand_id: "zeneco", status: "draft", description: "" },
  ]);
  const ids = hits.map((h) => h.id);
  assert.ok(ids.includes("bad-published"));
  assert.ok(ids.includes("bad-scheduled"));
  assert.ok(!ids.includes("good"));
  assert.equal(hits.find((h) => h.id === "bad-published")?.result, "NOT_PUBLISHABLE_META_TEXT");
});
