import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(path.join(process.cwd(), "src/components/customers/customer-sales-assistant-note.tsx"), "utf8");

test("sales assistant UI shows Nexus conversation brief", () => {
  assert.match(source, /Samtalegrunnlag i Nexus Today/);
  assert.match(source, /result\.followupBrief/);
});

test("sales assistant UI accepts pasted correspondence plus image or PDF context", () => {
  assert.match(source, /AI kundeinformasjon/);
  assert.match(source, /Bilde \/ PDF/);
  assert.match(source, /accept="application\/pdf,image\/\*"/);
  assert.match(source, /onPaste=\{onSourcePaste\}/);
  assert.match(source, /\/api\/contacts\/import-document/);
  assert.match(source, /customer_context/);
});

test("attachment intake remains review-first before CRM analysis is saved", () => {
  assert.match(source, /Kontroller teksten og trykk «Tolk og lagre»/);
  assert.match(source, /Originalteksten beholdes i kundehistorikken/);
  assert.match(source, /note\.trim\(\)\.length < 3/);
});

test("inline Buyer Profile facts are individually selectable and safe facts are selected by default", () => {
  assert.match(source, /AI fant Buyer Profile-fakta/);
  assert.match(source, /type="checkbox"/);
  assert.match(source, /checked=\{selected\}/);
  assert.match(source, /!candidate\.conflict/);
  assert.match(source, /Velg alle uten konflikt/);
  assert.match(source, /Fjern alle/);
});

test("conflicting Buyer Profile evidence requires explicit selection and explains replacement", () => {
  assert.match(source, /Konflikt med aktiv profil/);
  assert.match(source, /erstatter den gammel verdi/);
  assert.match(source, /Konflikter er ikke valgt som standard/);
});

test("human approval calls source-verified CRM evidence route", () => {
  assert.match(source, /Godkjenn valgte og match/);
  assert.match(source, /\/api\/customers\/\$\{encodeURIComponent\(contactId\)\}\/buyer-profile-evidence/);
  assert.match(source, /interactionId/);
  assert.match(source, /criteria: selected\.map\(criterionPayload\)/);
});

test("successful approval runs preview-only auto-discovery matching and retains the returned match DTOs", () => {
  assert.match(source, /\/api\/lead-intelligence\/property-matches\/preview/);
  assert.match(source, /autoDiscover: true/);
  assert.match(source, /candidateLimit: 120/);
  assert.match(source, /maxResults: 10/);
  assert.match(source, /matchBody\.result\?\.matches/);
  assert.match(source, /setMatchPreview/);
  assert.match(source, /CustomerInlinePropertyMatches/);
  assert.match(source, /matches=\{matchPreview\.matches\}/);
});

test("matching request happens only after the approved Buyer Profile response is handled", () => {
  const profileIdIndex = source.indexOf('const buyerProfileId = String(applyBody.result?.buyerProfileId');
  const profileMessageIndex = source.indexOf('setEvidenceMessage(`');
  const matchRequestIndex = source.indexOf('/api/lead-intelligence/property-matches/preview');
  assert.ok(profileIdIndex > 0);
  assert.ok(profileMessageIndex > profileIdIndex);
  assert.ok(matchRequestIndex > profileMessageIndex);
  assert.match(source, /Buyer Profile er oppdatert, men/);
});

test("inline property matches receive the verified brand, approved Buyer Profile and preview correlation id", () => {
  assert.match(source, /brand=\{matchPreview\.brand\}/);
  assert.match(source, /buyerProfileId=\{matchPreview\.buyerProfileId\}/);
  assert.match(source, /correlationId=\{matchPreview\.correlationId\}/);
  assert.match(source, /bestEffort=\{matchPreview\.bestEffort\}/);
});
