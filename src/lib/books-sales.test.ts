import assert from "node:assert/strict";
import test from "node:test";
import { availableBookFormats, resolveBookDownload, safeBookPrice } from "./books-sales";

test("direct-store prices are bounded and rounded", () => {
  assert.equal(safeBookPrice(4.995), 5);
  assert.equal(safeBookPrice(0), 1.99);
  assert.equal(safeBookPrice(100), 49.99);
  assert.equal(safeBookPrice("invalid", 5), 5);
});

test("available formats and download grants fail closed", () => {
  const book = { title: "Book", pdf_path: "pdf/book.pdf", epub_path: "epub/book.epub" };
  assert.deepEqual(availableBookFormats(book), ["pdf", "epub"]);
  assert.deepEqual(resolveBookDownload(book, "epub", "epub"), {
    format: "epub", path: "epub/book.epub", bucket: "book-epubs", filename: "Book.epub",
  });
  assert.equal(resolveBookDownload(book, "pdf", "epub"), null);
  assert.equal(resolveBookDownload({ title: "Book", epub_path: "epub/book.epub" }, null, null)?.format, "epub");
});
