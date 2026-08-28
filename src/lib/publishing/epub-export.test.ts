import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { toEpubBuffer } from "./epub-export";

const project = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Canonical Test Book",
  subtitle: "A deterministic export",
  language: "en",
  updated_at: "2026-08-28T12:00:00Z",
  chapter_drafts: [{ chapter_title: "Opening", draft: "First paragraph.\n\nSecond paragraph." }],
  metadata_plan: { author: "Freddy Bremseth", description: "Test description" },
};

test("canonical EPUB is deterministic and contains required EPUB files", async () => {
  const first = await toEpubBuffer(project);
  const second = await toEpubBuffer(project);
  assert.deepEqual(first, second);

  const zip = await JSZip.loadAsync(first);
  assert.equal(await zip.file("mimetype")?.async("string"), "application/epub+zip");
  assert.ok(zip.file("META-INF/container.xml"));
  assert.ok(zip.file("OEBPS/content.opf"));
  assert.ok(zip.file("OEBPS/nav.xhtml"));
  assert.ok(zip.file("OEBPS/text/chap1.xhtml"));

  const opf = await zip.file("OEBPS/content.opf")?.async("string");
  assert.match(opf || "", /2026-08-28T12:00:00Z/);
});
