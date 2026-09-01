import assert from "node:assert/strict";
import test from "node:test";
import { buildEmailHistoryReviewLinks } from "./history-backfill-review-links";

test("builds brand-scoped Email Link Health review links", () => {
  assert.deepEqual(buildEmailHistoryReviewLinks("soleada"), {
    emailLinkHealth: "/nexus-os/email-link-health?brand=soleada",
    highPriority: "/nexus-os/email-link-health?brand=soleada&priority=high",
  });
});

test("URL-encodes brand scope without changing review semantics", () => {
  assert.deepEqual(buildEmailHistoryReviewLinks(" brand/with space "), {
    emailLinkHealth: "/nexus-os/email-link-health?brand=brand%2Fwith%20space",
    highPriority: "/nexus-os/email-link-health?brand=brand%2Fwith%20space&priority=high",
  });
});
