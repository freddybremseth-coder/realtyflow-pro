import assert from "node:assert/strict";
import test from "node:test";
import { qualityCenterHref } from "./book-os-quality-center-link";

test("builds focused Quality Center link from ingest result", () => {
  assert.equal(
    qualityCenterHref({ editionId: "edition-1", revisionId: "revision-2" }),
    "/book-growth/quality-center?editionId=edition-1&revisionId=revision-2",
  );
});

test("falls back safely when ingest ids are unavailable", () => {
  assert.equal(qualityCenterHref({}), "/book-growth/quality-center");
});
