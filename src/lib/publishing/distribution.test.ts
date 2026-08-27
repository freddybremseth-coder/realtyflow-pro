import assert from "node:assert/strict";
import test from "node:test";
import {
  PUBLISHING_CHANNELS,
  PUBLISHING_CHANNEL_IDS,
  evaluateDistributionPreflight,
  type DistributionPackage,
} from "./distribution";

const readyPackage: DistributionPackage = {
  title: "A Useful Book",
  language: "en",
  chapterCount: 10,
  hasEpubSource: true,
  hasCover: true,
  hasDescription: true,
  keywordCount: 7,
  categoryCount: 3,
  rightsConfirmed: true,
  aiDisclosureReviewed: true,
  kdpSelectEnrollment: "not_enrolled",
  selectedChannels: ["amazon_kdp", "apple_books"],
};

test("channel registry never claims an undocumented automated KDP publisher", () => {
  assert.equal(PUBLISHING_CHANNELS.amazon_kdp.automatedDelivery, false);
  assert.equal(PUBLISHING_CHANNELS.amazon_kdp.deliveryMode, "manual_portal");
  assert.equal(PUBLISHING_CHANNELS.amazon_kdp.capabilities.publish, "manual");
  assert.equal(PUBLISHING_CHANNELS.apple_books.deliveryMode, "vendor_cli");
  assert.equal(PUBLISHING_CHANNELS.direct_store.deliveryMode, "internal_api");
  assert.equal(PUBLISHING_CHANNELS.direct_store.automatedDelivery, false);
  assert.deepEqual(Object.keys(PUBLISHING_CHANNELS), [...PUBLISHING_CHANNEL_IDS]);
});

test("complete package can be prepared for KDP with an explicit manual handoff", () => {
  const result = evaluateDistributionPreflight("amazon_kdp", readyPackage);
  assert.equal(result.ready, true);
  assert.ok(result.findings.some((item) => item.code === "MANUAL_HANDOFF_REQUIRED" && item.severity === "info"));
});

test("KDP Select blocks wide ebook distribution", () => {
  const book = { ...readyPackage, kdpSelectEnrollment: "enrolled" as const };
  const amazon = evaluateDistributionPreflight("amazon_kdp", book);
  const apple = evaluateDistributionPreflight("apple_books", book);
  assert.equal(amazon.ready, false);
  assert.equal(apple.ready, false);
  assert.ok(amazon.findings.some((item) => item.code === "KDP_SELECT_EXCLUSIVITY_CONFLICT"));
});

test("KDP Select also blocks simultaneous ebook delivery to the owned store", () => {
  const book = {
    ...readyPackage,
    selectedChannels: ["amazon_kdp", "direct_store"] as const,
    kdpSelectEnrollment: "enrolled" as const,
  };
  const result = evaluateDistributionPreflight("direct_store", { ...book, selectedChannels: [...book.selectedChannels] });
  assert.equal(result.ready, false);
  assert.ok(result.findings.some((item) => item.code === "KDP_SELECT_EXCLUSIVITY_CONFLICT"));
});

test("submission fails closed when a connector-backed channel is not connected", () => {
  const prepare = evaluateDistributionPreflight("apple_books", readyPackage, { phase: "prepare", connectionReady: false });
  const submit = evaluateDistributionPreflight("apple_books", readyPackage, { phase: "submit", connectionReady: false });
  assert.equal(prepare.ready, true);
  assert.equal(submit.ready, false);
  assert.ok(submit.findings.some((item) => item.code === "CHANNEL_NOT_CONNECTED"));
});

test("missing rights and disclosure review block every channel", () => {
  const book = { ...readyPackage, rightsConfirmed: false, aiDisclosureReviewed: false };
  const result = evaluateDistributionPreflight("direct_store", book);
  assert.equal(result.ready, false);
  assert.ok(result.findings.some((item) => item.code === "RIGHTS_NOT_CONFIRMED"));
  assert.ok(result.findings.some((item) => item.code === "AI_DISCLOSURE_NOT_REVIEWED"));
});
