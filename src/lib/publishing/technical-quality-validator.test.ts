import assert from "node:assert/strict";
import test from "node:test";
import { toEpubBuffer } from "./epub-export";
import { validateEpubAccessibility, validateEpubStructure, validatePublishingMetadata } from "./technical-quality-validator";

const project = {
  title: "Accessible Book", subtitle: "A complete test edition", language: "en", updated_at: "2026-08-29T12:00:00Z",
  chapter_drafts: [{ chapter_title: "Opening", draft: "First paragraph.\n\nSecond paragraph." }],
  metadata_plan: { author: "Freddy Bremseth", description: "A sufficiently detailed publication description that explains the book, its reader promise, subject and practical value clearly." },
};

test("canonical export passes deterministic EPUB and accessibility gates", async () => {
  const epub = await toEpubBuffer(project);
  assert.equal((await validateEpubStructure(epub)).result, "pass");
  assert.equal((await validateEpubAccessibility(epub)).result, "pass");
});

test("metadata gate retains concrete evidence instead of an opaque score", () => {
  const result = validatePublishingMetadata({ title: "Incomplete", language: "en", metadata_plan: {} });
  assert.equal(result.result, "fail");
  assert.ok(result.evidence.findings.some((row) => row.code === "META_AUTHOR"));
  assert.ok(result.evidence.findings.some((row) => row.code === "META_DESCRIPTION"));
});
