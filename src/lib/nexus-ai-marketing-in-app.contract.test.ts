import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const victoria = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/nexus/victoria/route.ts"),
  "utf8",
);
const widget = fs.readFileSync(
  path.join(process.cwd(), "src/components/chatbot/chat-widget.tsx"),
  "utf8",
);

test("Victoria keeps CRM v4 actions and adds isolated governed marketing proposals", () => {
  assert.match(victoria, /buildNexusActionProposals/);
  assert.match(victoria, /buildNexusMarketingActionProposals/);
  assert.match(victoria, /messageRequestsMarketingCampaign/);
  assert.match(victoria, /const crmProposedActions = buildNexusActionProposals/);
  assert.match(victoria, /const marketingProposedActions = buildNexusMarketingActionProposals/);
  assert.match(victoria, /marketingProposedActions\.length \? marketingProposedActions : crmProposedActions/);
});

test("marketing context can only be opened by the current explicit turn", () => {
  assert.match(victoria, /if \(!messageRequestsMarketingCampaign\(message\)\) return null/);
  assert.match(victoria, /conversation\s*\.slice\(-6\)/);
  assert.match(victoria, /\.filter\(\(item: any\) => item\?\.role === "user"\)/);
  assert.match(victoria, /\[\.\.\.recentUserTurns, message\]\.join\("\\n"\)/);
});

test("Nexus prompt states the marketing draft and truth boundaries", () => {
  assert.match(victoria, /prepare_marketing_campaign/);
  assert.match(victoria, /manual-review SoMe-utkast/);
  assert.match(victoria, /publiserer aldri direkte/);
  assert.match(victoria, /illustrativ designreferanse/);
  assert.match(victoria, /pris-, byggbarhets-, regulerings- eller tilgjengelighetspåstand/);
});

test("chat widget recognizes and executes only the governed marketing endpoint", () => {
  assert.match(widget, /"prepare_marketing_campaign"/);
  assert.match(widget, /"\/api\/nexus\/marketing-actions"/);
  assert.match(widget, /candidate\.endpoint !== "\/api\/nexus\/marketing-actions"/);
  assert.match(widget, /candidate\.requiresApproval !== true/);
  assert.match(widget, /typeof candidate\.brandId !== "string"/);
  assert.match(widget, /typeof candidate\.focus !== "string"/);
  assert.match(widget, /candidate\.channels\.every/);
  assert.match(widget, /brandId: action\.brandId/);
  assert.match(widget, /focus: action\.focus/);
  assert.match(widget, /channels: action\.channels/);
});

test("marketing action UI distinguishes approval before publishing from email sending", () => {
  assert.match(widget, /Krever godkjenning før publisering/);
  assert.match(widget, /Krever godkjenning før sending/);
  assert.match(widget, /Intern CRM-handling · sender ingenting/);
  assert.match(widget, /SoMe-utkastene er forberedt og venter på godkjenning/);
});

test("chat UI does not embed a direct marketing publisher", () => {
  assert.doesNotMatch(widget, /runApprovedPublication|makeConfiguredMetaPublisher|publishToInstagram|publishToFacebook/);
});
