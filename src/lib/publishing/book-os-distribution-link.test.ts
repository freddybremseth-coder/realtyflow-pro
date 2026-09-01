import assert from "node:assert/strict";
import test from "node:test";
import { distributionHref } from "./book-os-distribution-link";

test("builds focused Distribution link", () => {
  assert.equal(
    distributionHref({ editionId: "edition-1", revisionId: "revision-2" }),
    "/book-growth/distribution?editionId=edition-1&revisionId=revision-2",
  );
});

test("falls back safely without context", () => {
  assert.equal(distributionHref({}), "/book-growth/distribution");
});
