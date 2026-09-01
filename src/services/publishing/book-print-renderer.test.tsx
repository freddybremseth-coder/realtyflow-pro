import assert from "node:assert/strict";
import test from "node:test";
import { getDocumentProxy } from "unpdf";
import { renderBookPrintInterior, renderKdpFullWrap } from "./book-print-renderer";

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

const project = {
  title: "Book OS Runtime Smoke",
  subtitle: "Verified Print Production",
  chapter_drafts: [
    {
      chapter_title: "Chapter One",
      draft: "This is the first paragraph of a controlled Book OS runtime smoke test.\n\nThis is the second paragraph. It exists to exercise real PDF layout and pagination.",
    },
    {
      chapter_title: "Chapter Two",
      draft: "A second chapter forces the print renderer through chapter-break behavior.\n\nThe resulting PDF must be a real six by nine interior with an even final page count.",
    },
  ],
  metadata_plan: {
    author: "Freddy Bremseth",
    kdp: {
      description: "A controlled runtime smoke fixture for Book OS print production.",
    },
  },
};

async function pageCount(bytes: Buffer) {
  const proxy = await getDocumentProxy(new Uint8Array(bytes));
  try { return proxy.numPages; }
  finally { await proxy.destroy?.(); }
}

test("renders a real 6x9 interior PDF with an even locked page count", async () => {
  const result = await renderBookPrintInterior(project);
  assert.equal(result.buffer.subarray(0, 4).toString("ascii"), "%PDF");
  assert.equal(result.widthPt, 432);
  assert.equal(result.heightPt, 648);
  assert.equal(result.pageCount % 2, 0);
  assert.equal(await pageCount(result.buffer), result.pageCount);
  assert.ok(result.buffer.byteLength > 1000);
});

test("renders a real KDP full-wrap PDF from the locked interior page count", async () => {
  const interior = await renderBookPrintInterior(project);
  const wrap = await renderKdpFullWrap(project, interior.pageCount, { buffer: ONE_PIXEL_PNG, type: "png" });
  assert.equal(wrap.buffer.subarray(0, 4).toString("ascii"), "%PDF");
  assert.equal(wrap.heightIn, 9.25);
  assert.equal(wrap.pageCount, interior.pageCount);
  assert.ok(wrap.spineWidthIn > 0);
  assert.ok(wrap.widthIn > 12.25);
  assert.equal(await pageCount(wrap.buffer), 1);
  assert.ok(wrap.buffer.byteLength > 1000);
});
