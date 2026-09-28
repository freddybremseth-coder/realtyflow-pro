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
  assert.match(page, /Lead → visning/);
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
  const attendance = fs.readFileSync("src/app/api/corporate-homes/events/attendance/route.ts", "utf8");
  const overview = fs.readFileSync("src/app/api/corporate-homes/overview/route.ts", "utf8");
  const page = fs.readFileSync("src/app/(business)/corporate-homes/page.tsx", "utf8");

  assert.match(publicLead, /isCorporateEventRegistration/);
  assert.match(publicLead, /requestType === "corporate-event-registration"/);
  assert.match(publicLead, /if \(!isCorporateEventRegistration\)/);
  assert.match(publicLead, /salesQualified: false/);
  assert.match(publicLead, /event_id and event_name are required/);

  assert.match(attendance, /ATTENDED/);
  assert.match(attendance, /NO_SHOW/);
  assert.match(attendance, /LEFT_EARLY/);
  assert.match(attendance, /automatic_pipeline_change: false/);
  assert.match(attendance, /pipelineChanged: false/);
  assert.match(attendance, /workItemCreated: false/);
  assert.match(attendance, /messageSent: false/);

  assert.match(overview, /isCorporateEventRegistrationOnly/);
  assert.match(overview, /const leadRows = rows\.filter/);
  assert.match(overview, /eventFunnel:/);
  assert.match(overview, /registrationIsLead: false/);
  assert.match(overview, /attendanceQualifiesAutomatically: false/);
  assert.match(overview, /"google", "linkedin", "meta", "event", "outbound"/);

  assert.match(page, /Påmelding og oppmøte er ikke salgskvalifisering/);
  assert.match(page, /holder registrering og oppmøte utenfor Corporate lead- og pipeline-tallene/);
});
