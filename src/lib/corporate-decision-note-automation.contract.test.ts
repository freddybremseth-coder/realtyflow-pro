import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const publicLead = fs.readFileSync("src/app/api/public/leads/route.ts", "utf8");
const followup = fs.readFileSync("src/services/corporate/decision-note-followup.ts", "utf8");
const policy = fs.readFileSync("src/lib/corporate-decision-note.ts", "utf8");
const delivery = fs.readFileSync("src/services/corporate/decision-note-delivery.ts", "utf8");
const cron = fs.readFileSync("src/app/api/cron/corporate-decision-note-followup/route.ts", "utf8");
const vercel = fs.readFileSync("vercel.json", "utf8");
const overview = fs.readFileSync("src/app/api/corporate-homes/overview/route.ts", "utf8");
const templateApi = fs.readFileSync("src/app/api/corporate-homes/decision-note-template/route.ts", "utf8");
const previewApi = fs.readFileSync("src/app/api/corporate-homes/decision-note-template/preview/route.ts", "utf8");
const emailPreviewApi = fs.readFileSync("src/app/api/corporate-homes/decision-note-template/preview-email/route.ts", "utf8");
const editor = fs.readFileSync("src/app/(business)/corporate-homes/decision-note/page.tsx", "utf8");

test("Public Corporate decision-note request creates report and does not send generic receipt", () => {
  assert.match(publicLead, /corporate-home-decision-note/);
  assert.match(publicLead, /buildCorporateDecisionNoteReport/);
  assert.match(publicLead, /sendCorporateDecisionNoteReport/);
  assert.match(publicLead, /if \(!isCorporateDecisionNote\)/);
  assert.match(publicLead, /nurture_status: "paused"/);
  assert.match(publicLead, /corporate_decision_note_request_id/);
});

test("Corporate decision-note automation has explicit safety boundaries", () => {
  assert.match(followup, /last_inbound_reply_at/);
  assert.match(policy, /meeting_booked/);
  assert.match(followup, /waiting_until/);
  assert.match(followup, /email_suppressed_or_manual_takeover/);
  assert.match(followup, /corporate_decision_note_no_reply/);
  assert.match(delivery, /check|sendBrandEmail/);
  assert.match(delivery, /crmContactId/);
  assert.match(delivery, /lead_nurture_events/);
});

test("Decision-note follow-up is authenticated, safe-mode controlled and scheduled", () => {
  assert.match(cron, /requireCronApi/);
  assert.match(cron, /evaluateCronSafeMode/);
  assert.match(vercel, /\/api\/cron\/corporate-decision-note-followup/);
  assert.match(vercel, /15 7 \* \* \*/);
});

test("Corporate Homes overview counts decision-note requests as Corporate sales activity", () => {
  assert.match(overview, /corporate-home-decision-note/);
  assert.match(overview, /isCorporateHomeRequestType/);
});


test("Corporate report editor previews safely and persists presentation copy", () => {
  assert.match(templateApi, /brand_settings/);
  assert.match(templateApi, /CORPORATE_DECISION_NOTE_TEMPLATE_KEY/);
  assert.match(previewApi, /renderCorporateDecisionNotePdf/);
  assert.doesNotMatch(previewApi, /sendBrandEmail|contacts.*insert|corporate_prospects.*insert/);
  assert.match(emailPreviewApi, /corporateDecisionEmailHtml/);
  assert.doesNotMatch(emailPreviewApi, /sendBrandEmail|contacts.*insert|corporate_prospects.*insert/);
  assert.match(editor, /Åpne test-PDF/);
  assert.match(editor, /Forhåndsvis e-post/);
  assert.match(editor, /Tallmotoren er låst/);
  assert.match(editor, /Lederverdi & marked/);
  assert.match(editor, /Prishistorikk/);
  assert.match(editor, /Neste lederbeslutning/);
});
