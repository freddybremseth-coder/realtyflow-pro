import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCorporatePartnerOutreach,
  CORPORATE_PARTNER_OUTREACH_RULES,
} from "@/lib/corporate-partner-outreach";

test("Partner outreach is Norwegian, company-specific and tracked", () => {
  const drafts = buildCorporatePartnerOutreach({
    company_name: "Eksempel Rådgivning AS",
    partner_type: "accounting_tax",
    referral_angle: "Introdusere relevante bedriftskunder",
  });

  assert.equal(drafts.length, 3);
  assert.deepEqual(drafts.map((draft) => draft.dayOffset), [0, 7, 21]);
  assert.match(drafts[0].body, /Eksempel Rådgivning AS/);
  assert.match(drafts[0].body, /regnskap, revisjon eller skatterådgivning/);
  assert.match(drafts[0].body, /utm_medium=partner_outreach/);
  assert.match(drafts[1].body, /eventuell honorering avtales skriftlig/);
});

test("Partner outreach rules never authorize automatic sending or person enrichment", () => {
  assert.equal(CORPORATE_PARTNER_OUTREACH_RULES.automaticSendingAllowed, false);
  assert.equal(CORPORATE_PARTNER_OUTREACH_RULES.personalEnrichmentAllowed, false);
  assert.equal(CORPORATE_PARTNER_OUTREACH_RULES.approvalRequiredBeforeRecipientLookup, true);
});
