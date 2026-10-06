import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const cardSource = fs.readFileSync(
  path.join(process.cwd(), "src/components/crm/crm-customer-card.tsx"),
  "utf8",
);
const routeSource = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/customers/[contactId]/sales-coach/route.ts"),
  "utf8",
);
const customer360Source = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/customers/[contactId]/360/route.ts"),
  "utf8",
);
const advisorSource = fs.readFileSync(
  path.join(process.cwd(), "src/lib/nexus/customer-sales-advisor.ts"),
  "utf8",
);
const coachSource = fs.readFileSync(
  path.join(process.cwd(), "src/lib/nexus/customer-sales-coach.ts"),
  "utf8",
);

test("Customer 360 exposes sales intelligence in the main payload", () => {
  assert.match(customer360Source, /buildCustomerSalesAdvice/);
  assert.match(customer360Source, /salesIntelligence/);
});

test("Customer 360 makes sales momentum and stage gate visible before detail work", () => {
  assert.match(cardSource, /Nexus · neste beste handling/);
  assert.match(cardSource, /Salgsmodenhet/);
  assert.match(cardSource, /Salgsfase & fasevakt/);
  assert.match(cardSource, /Hva holder salget igjen\?/);
  assert.match(cardSource, /Klar for neste fase/);
  assert.match(cardSource, /Beslutningsstige/);
  assert.match(cardSource, /Hva har kunden faktisk bekreftet\?/);
});

test("Customer 360 exposes an on-demand AI Sales Coach without auto-send", () => {
  assert.match(cardSource, /AI Sales Coach/);
  assert.match(cardSource, /Hjelp meg å dra salget fremover/);
  assert.match(cardSource, /runSalesCoach/);
  assert.match(cardSource, /Valgfri kundetekst å analysere/);
  assert.match(cardSource, /WhatsApp-melding/);
  assert.match(cardSource, /sourceText: salesCoachSourceText/);
  assert.match(routeSource, /emailSent:\s*false/);
  assert.match(routeSource, /autoSendAllowed:\s*false/);
  assert.match(routeSource, /externalAction:\s*false/);
});

test("sales advisor includes phase gate, scoring, risks and next action", () => {
  assert.match(advisorSource, /stageGuidance/);
  assert.match(advisorSource, /profile:/);
  assert.match(advisorSource, /engagement:/);
  assert.match(advisorSource, /timing:/);
  assert.match(advisorSource, /intent:/);
  assert.match(advisorSource, /risks:/);
  assert.match(advisorSource, /nextBestAction/);
  assert.match(advisorSource, /commitmentLadder/);
  assert.match(advisorSource, /mangler tydelig kundebekreftelse/);
});

test("sales coach is consultative and explicitly respects customer communication controls", () => {
  assert.match(coachSource, /DISCOVER_NEED/);
  assert.match(coachSource, /CONFIRM_CRITERIA/);
  assert.match(coachSource, /VALIDATE_OPTIONS/);
  assert.match(coachSource, /NEXT_COMMITMENT/);
  assert.match(coachSource, /Respekter STOPP, ON_HOLD, ventedato og manuell takeover/);
  assert.match(coachSource, /Ikke send e-post/);
});
