import assert from "node:assert/strict";
import test from "node:test";
import { launchFactoryHref } from "./book-os-launch-factory-link";

test("builds focused Launch Factory link", () => {
  assert.equal(
    launchFactoryHref({ editionId: "edition-1", revisionId: "revision-2" }),
    "/book-growth/launch-factory?editionId=edition-1&revisionId=revision-2",
  );
});

test("falls back safely without context", () => {
  assert.equal(launchFactoryHref({}), "/book-growth/launch-factory");
});
