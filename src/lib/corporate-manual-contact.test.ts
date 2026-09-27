import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { buildCorporateManualContactUpdate } from "@/lib/corporate-manual-contact";

test("manual generic-email contact produces a human-only CONTACTED transition and 7-day follow-up", () => {
  const now = new Date("2026-09-27T10:00:00.000Z");
  const result = buildCorporateManualContactUpdate({
    status: "CONTACT_READY",
    method: "generic_email",
    templateKey: "initial",
    evidence: {
      generic_company_contact: {
        generic_email: "post@example.no",
        contact_page_url: "https://example.no/kontakt",
      },
    },
  }, now);

  assert.equal(result.status, "CONTACTED");
  assert.equal(result.next_followup, "2026-10-04T10:00:00.000Z");
  assert.equal(result.entry.method, "generic_email");
  assert.equal(result.entry.channel, "post@example.no");
  assert.equal(result.entry.sent_by_human, true);
  assert.equal(result.entry.automated_send, false);
  assert.equal(result.entry.personal_data_collected, false);
});

test("manual contact refuses a channel that is not present on the company record", () => {
  assert.throws(() => buildCorporateManualContactUpdate({
    method: "generic_email",
    evidence: {
      generic_company_contact: {
        contact_page_url: "https://example.no/kontakt",
      },
    },
  }), /generell selskapsadresse/i);
});

test("manual contact log remains bounded", () => {
  const existing = Array.from({ length: 30 }, (_, index) => ({ contacted_at: `2026-09-${String(index + 1).padStart(2, "0")}T10:00:00.000Z` }));
  const result = buildCorporateManualContactUpdate({
    method: "contact_form",
    evidence: {
      generic_company_contact: {
        contact_page_url: "https://example.no/kontakt",
      },
      manual_company_contact_log: existing,
    },
  }, new Date("2026-09-27T10:00:00.000Z"));

  assert.equal((result.evidence.manual_company_contact_log as unknown[]).length, 20);
});

test("manual-contact API is explicit, admin-only and contains no send primitive", () => {
  const route = fs.readFileSync("src/app/api/corporate-homes/prospects/[id]/contact-log/route.ts", "utf8");
  assert.match(route, /requireAdminApi/);
  assert.match(route, /manualContactReady/);
  assert.match(route, /sent: false/);
  assert.match(route, /personal_enrichment: false/);
  assert.match(route, /auto_followup: false/);
  assert.doesNotMatch(route, /sendEmail\s*\(|sendMessage\s*\(|nodemailer|gmail/i);
});
