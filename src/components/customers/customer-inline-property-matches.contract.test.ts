import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(path.join(process.cwd(), "src/components/customers/customer-inline-property-matches.tsx"), "utf8");

test("match cards show score, data quality, reasons and concerns", () => {
  assert.match(source, /Beste boligmatcher/);
  assert.match(source, /Match \{Math\.round\(match\.score\)\}\/100/);
  assert.match(source, /Datakvalitet \{Math\.round\(match\.dataQualityScore\)\}\/100/);
  assert.match(source, /Hvorfor den matcher/);
  assert.match(source, /Forbehold/);
  assert.match(source, /PropertyMatchThumbnail/);
});

test("properties are never auto-selected into a shortlist", () => {
  assert.match(source, /useState<Record<string, ShortlistDecision>>\(\{\}\)/);
  assert.match(source, /Aktuell/);
  assert.match(source, /Kanskje/);
  assert.match(source, /Må undersøkes/);
  assert.match(source, /Boolean\(decisions\[match\.propertyId\]\)/);
});

test("rejected best-effort matches cannot be shortlisted", () => {
  assert.match(source, /match\.eligibility !== "rejected"/);
  assert.match(source, /disabled=\{!selectable\}/);
  assert.match(source, /best-effort og kan ikke legges i shortlist/);
});

test("selected properties default conservatively to needs review, not client ready", () => {
  assert.match(source, /status: "needs_review"/);
  assert.match(source, /Standard er «Må sjekkes»/);
  assert.match(source, /Bare du kan gjøre boligen «Klar for kunde»/);
  assert.match(source, /value: "client_ready"/);
});

test("shortlist save uses the existing Lead Intelligence shortlist endpoint and preview correlation id", () => {
  assert.match(source, /fetch\("\/api\/lead-intelligence\/shortlists"/);
  assert.match(source, /"x-correlation-id": correlationId/);
  assert.match(source, /brand,/);
  assert.match(source, /buyerProfileId,/);
  assert.match(source, /idempotencySeed: correlationId/);
  assert.match(source, /qualityReview:/);
});

test("shortlist creation remains a draft and does not claim customer delivery", () => {
  assert.match(source, /Lag shortlist-utkast/);
  assert.match(source, /Shortlist-utkast lagret/);
  assert.match(source, /Ingen kundeinformasjon er sendt/);
  assert.doesNotMatch(source, /sendEmail|sendMail|email\.send/);
});

test("saved shortlist can create a presentation and email draft through the canonical Lead Intelligence endpoint", () => {
  assert.match(source, /fetch\("\/api\/lead-intelligence\/presentations"/);
  assert.match(source, /shortlistId: saveResult\.shortlistId/);
  assert.match(source, /language: "nb"/);
  assert.match(source, /crm-presentation-\$\{saveResult\.shortlistId\}/);
  assert.match(source, /Lag presentasjon og e-postutkast/);
});

test("presentation creation only proceeds when at least one selected property is explicitly client ready", () => {
  assert.match(source, /clientReadySelectedCount/);
  assert.match(source, /qualityReviews\[match\.propertyId\]\?\.status === "client_ready"/);
  assert.match(source, /clientReadySelectedCount === 0/);
  assert.match(source, /Bare disse tas med i presentasjonen/);
  assert.match(source, /Ingen valgte boliger er merket «Klar for kunde»/);
});

test("customer card previews the generated email draft but never approves or sends it", () => {
  assert.match(source, /Presentasjon og e-postutkast klart/);
  assert.match(source, /presentationResult\.messageDraft\.subject/);
  assert.match(source, /presentationResult\.messageDraft\.bodyText/);
  assert.match(source, /ingen e-post er sendt og presentasjonen er ikke publisert/);
  assert.match(source, /href="\/approvals"/);
  assert.match(source, /Åpne Approval Center/);
  assert.doesNotMatch(source, /message-drafts\/.*approval/);
  assert.doesNotMatch(source, /explicitApproval/);
});
