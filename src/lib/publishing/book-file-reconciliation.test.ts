import assert from "node:assert/strict";
import test from "node:test";
import { buildFileReconciliationCandidates, canonicalFileKey, scoreBookFileMatch } from "./book-file-reconciliation";

test("canonical keys remove delivery noise and duplicate suffixes", () => {
  assert.equal(canonicalFileKey("Mannen_som_dode_to_ganger_Freddy_Bremseth_Publisher_Edition(1).epub"), "mannen som dode to ganger");
});

test("matching is conservative and language-aware", () => {
  const book = { id: "1", title: "The Last Exhibition", language: "en" };
  assert.deepEqual(scoreBookFileMatch(book, { name: "The_Last_Exhibition_Freddy_Bremseth_Publisher_Edition.epub" }), { confidence: 1, matchType: "exact" });
  assert.equal(scoreBookFileMatch({ ...book, language: "no" }, { name: "The_Last_Exhibition_English_FINAL.epub" }), null);
  assert.equal(scoreBookFileMatch(book, { name: "A_Completely_Different_Book.epub" }), null);
});

test("scanner emits only the best file link and reports duplicate uploads", () => {
  const result = buildFileReconciliationCandidates(
    [{ id: "1", title: "Red Revolution", language: "en", ebook_file_path: null }],
    [{ name: "Red_Revolution_English_FINAL.epub" }, { name: "Red_Revolution_English_FINAL (1).epub" }],
  );
  assert.equal(result.links.length, 1);
  assert.equal(result.links[0].bookId, "1");
  assert.equal(result.duplicates.length, 1);
});

test("scanner never reuses a file already assigned to another catalog edition", () => {
  const result = buildFileReconciliationCandidates(
    [
      { id: "1", title: "Shared Title", language: "en", ebook_file_path: "Shared_Title.epub" },
      { id: "2", title: "Shared Title", language: "en", ebook_file_path: null },
    ],
    [{ name: "Shared_Title.epub" }],
  );
  assert.equal(result.links.length, 0);
});
