import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCorporateDecisionNoteReport,
  normalizeCorporateDecisionNoteTemplate,
} from "@/lib/corporate-decision-note";
import {
  corporateDecisionEmailHtml,
  corporateDecisionEmailSubject,
  corporateDecisionEmailText,
} from "@/lib/corporate-decision-email";

function report() {
  const template = normalizeCorporateDecisionNoteTemplate({
    email_subject_template: "{{company}} · styregrunnlag",
    email_intro: "Hei fra malen for {{company}}. {{pdf_status}}",
    email_value_message: "Tallene skal gjøre beslutningen enklere.",
    email_next_step: "La oss avklare modellen sammen.",
    email_reply_prompt: "Svar med det dere vil endre.",
    email_cta_label: "Book 20 minutter",
    signature_name: "Freddy Test",
    signature_title: "Rådgiver",
    signature_brand: "Zen Corporate Homes",
    corporate_label: "Corporate Homes",
    logo_url: "https://www.zenecohomes.com/assets/zeneco-header-dark.svg",
  });
  return buildCorporateDecisionNoteReport({
    companyName: "Eksempel AS",
    contactName: "Kari Nordmann",
    template,
    calculatorContext: {
      propertyPrice: 450000,
      users: 50,
      employeeWeeks: 30,
      annualOperating: 12000,
      acquisitionPct: 12,
      capitalPct: 4,
      valuePct: 3,
      holdingYears: 10,
      stays: [],
    },
  });
}

test("Corporate decision email is personalized and uses saved CTA/signature", () => {
  const value = report();
  assert.equal(corporateDecisionEmailSubject(value, true), "Eksempel AS · styregrunnlag");
  const text = corporateDecisionEmailText(value, true);
  assert.match(text, /PDF-en ligger vedlagt/);
  assert.match(text, /Book 20 minutter/);
  assert.match(text, /Freddy Test/);
  assert.match(text, /Tallene skal gjøre beslutningen enklere/);
});

test("Corporate decision email HTML carries brand identity without sending", () => {
  const html = corporateDecisionEmailHtml(report(), true);
  assert.match(html, /zeneco-header-dark\.svg/);
  assert.match(html, /Corporate Homes/);
  assert.match(html, /Book 20 minutter/);
  assert.match(html, /Beslutningsgrunnlag for Eksempel AS/);
});
