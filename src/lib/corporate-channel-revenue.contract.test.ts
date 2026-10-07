import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("Corporate channel results use confirmed Revenue OS outcomes", () => {
  const route = fs.readFileSync("src/app/api/corporate-homes/overview/route.ts", "utf8");
  const page = fs.readFileSync("src/app/(business)/corporate-homes/page.tsx", "utf8");

  assert.match(route, /outcomeByChannel/);
  assert.match(route, /viewingContactIds\.has\(contactId\)/);
  assert.match(route, /offerContactIds\.has\(contactId\)/);
  assert.match(route, /leadToViewingRate/);
  assert.match(route, /viewingToOfferRate/);
  assert.match(route, /channels: acquisitionChannelsWithRevenue/);

  assert.match(page, /Faktisk visning/);
  assert.match(page, /Faktisk tilbud/);
  assert.match(page, /Henvendelse → visning/);
  assert.match(page, /bekreftede Revenue OS-events/);
});


test("Corporate webinar event traffic has its own governed attribution channel", () => {
  const growth = fs.readFileSync("src/lib/corporate-homes-growth.ts", "utf8");
  const route = fs.readFileSync("src/app/api/corporate-homes/overview/route.ts", "utf8");
  const page = fs.readFileSync("src/app/(business)/corporate-homes/page.tsx", "utf8");

  assert.match(growth, /CORPORATE_EVENT_PLAYBOOK/);
  assert.match(growth, /medium: "webinar"/);
  assert.match(growth, /automaticInvitesAllowed: false/);
  assert.match(growth, /automaticFollowUpAllowed: false/);
  assert.match(route, /webinar\|event\|seminar/);
  assert.match(route, /key: "event", label: "Webinar \/ event"/);
  assert.match(page, /Bygg etterspørsel med faglig verdi/);
  assert.match(page, /Ingen automatisk invitasjon/);
  assert.match(page, /Test webinar-sporingslenke/);
});


test("Corporate event registration and attendance stay outside sales qualification", () => {
  const publicLead = fs.readFileSync("src/app/api/public/leads/route.ts", "utf8");
  const signal = fs.readFileSync("src/app/api/corporate-homes/events/participants/signal/route.ts", "utf8");
  const overview = fs.readFileSync("src/app/api/corporate-homes/overview/route.ts", "utf8");
  const page = fs.readFileSync("src/app/(business)/corporate-homes/page.tsx", "utf8");

  assert.match(publicLead, /isCorporateEventRegistration/);
  assert.match(publicLead, /requestType === "corporate-event-registration"/);
  assert.match(publicLead, /if \(!isCorporateEventRegistration\)/);
  assert.match(publicLead, /salesQualified: false/);
  assert.match(publicLead, /contactCreated: false/);
  assert.match(publicLead, /workItemCreated: false/);
  assert.match(publicLead, /revenueEventCreated: false/);
  assert.match(publicLead, /corporate_event_participants/);
  assert.match(publicLead, /queryParamFromUrl\(pageUrl, "event_id"\)/);
  assert.match(publicLead, /event_id and event_name are required/);

  assert.match(signal, /ATTENDED/);
  assert.match(signal, /NO_SHOW/);
  assert.match(signal, /CTA_CLICKED/);
  assert.match(signal, /applyCorporateEventSignal/);
  assert.match(signal, /automatic_pipeline_change: false/);
  assert.match(signal, /pipelineChanged: false/);
  assert.match(signal, /workItemCreated: false/);
  assert.match(signal, /messageSent: false/);

  assert.match(overview, /corporate_event_participants/);
  assert.match(overview, /eventParticipantRows/);
  assert.match(overview, /isCorporateEventRegistrationOnly/);
  assert.match(overview, /const leadRows = rows\.filter/);
  assert.match(overview, /eventFunnel:/);
  assert.match(overview, /registrationIsLead: false/);
  assert.match(overview, /attendanceQualifiesAutomatically: false/);
  assert.match(overview, /"google", "linkedin", "meta", "event", "outbound"/);

  assert.match(page, /Påmelding og oppmøte er ikke salgskvalifisering/);
  assert.match(page, /holder registrering og oppmøte utenfor bedrifts- og salgstrakttallene/);
});


test("Corporate Event Operations uses participant ledger and never writes attendance back to CRM", () => {
  const eventsApi = fs.readFileSync("src/app/api/corporate-homes/events/route.ts", "utf8");
  const signalApi = fs.readFileSync("src/app/api/corporate-homes/events/participants/signal/route.ts", "utf8");
  const attendanceCompat = fs.readFileSync("src/app/api/corporate-homes/events/attendance/route.ts", "utf8");
  const eventsPage = fs.readFileSync("src/app/(business)/corporate-homes/events/page.tsx", "utf8");
  const corporatePage = fs.readFileSync("src/app/(business)/corporate-homes/page.tsx", "utf8");

  assert.match(eventsApi, /corporate_event_participants/);
  assert.doesNotMatch(eventsApi, /\.from\("contacts"\)/);
  assert.match(eventsApi, /registrationIsLead: false/);
  assert.match(eventsApi, /CORPORATE_EVENT_SIGNAL_GUARDRAILS/);

  assert.match(signalApi, /applyCorporateEventSignal/);
  assert.match(signalApi, /pipelineChanged: false/);
  assert.match(signalApi, /messageSent: false/);

  assert.match(attendanceCompat, /corporate_event_participants/);
  assert.doesNotMatch(attendanceCompat, /\.from\("contacts"\)/);
  assert.match(attendanceCompat, /LEFT_EARLY/);
  assert.match(attendanceCompat, /status === "LEFT_EARLY" \? "ATTENDED"/);

  assert.match(eventsPage, /\/api\/corporate-homes\/events\/participants\/signal/);
  assert.match(eventsPage, /Påmelding og oppmøte endrer ikke salgsstatus/);
  assert.match(eventsPage, /Møtt/);
  assert.match(eventsPage, /No-show/);
  assert.match(eventsPage, /Avlyst/);
  assert.match(eventsPage, /Ingen salgsforespørsel/);
  assert.match(corporatePage, /href="\/corporate-homes\/events"/);
});
