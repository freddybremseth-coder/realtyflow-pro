import assert from "node:assert/strict";
import test from "node:test";
import { extractLatestReplyText } from "./latest-reply-text";

test("keeps only the latest iPhone-style reply", () => {
  const body = `Hei\n\nBolig er ikke aktuelt med det første.\n\nTakk som spør.\n\n> 10. sep. 2026 kl. 09:02 skrev Advisor <advisor@example.com>:\n> Hvis bolig fortsatt er aktuelt...`;
  assert.equal(extractLatestReplyText(body), "Hei\n\nBolig er ikke aktuelt med det første.\n\nTakk som spør.");
});

test("keeps only the latest Outlook-style reply", () => {
  const body = `Ikke aktuelt lenger.\n\n________________________________\nFrom: Advisor <advisor@example.com>\nSent: Tuesday\nSubject: Er bolig fortsatt aktuelt?`;
  assert.equal(extractLatestReplyText(body), "Ikke aktuelt lenger.");
});

test("keeps only the latest Gmail-style reply", () => {
  const body = `Ja, jeg ser fortsatt etter leilighet i Altea rundt 400000 euro.\n\nOn Tue, Sep 8, 2026 Advisor wrote:\nPrevious offer`;
  assert.equal(extractLatestReplyText(body), "Ja, jeg ser fortsatt etter leilighet i Altea rundt 400000 euro.");
});
