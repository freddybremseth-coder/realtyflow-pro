import assert from "node:assert/strict";
import test from "node:test";
import {
  buildNexusMarketingActionProposals,
  messageRequestsMarketingCampaign,
  resolveNexusMarketingBrand,
  resolveNexusMarketingChannels,
  resolveNexusMarketingFocus,
} from "@/lib/nexus-ai-marketing-actions";

test("advice questions do not silently become marketing write actions", () => {
  assert.equal(messageRequestsMarketingCampaign("Hvordan bør jeg markedsføre Biar i SoMe?"), false);
  assert.equal(buildNexusMarketingActionProposals({ message: "Hvordan bør jeg markedsføre Biar i SoMe?" }).length, 0);
});

test("direct SoMe request resolves Zen Eco Homes, Biar and both Meta channels", () => {
  const message = "kan du markedsføre Biar i SoME for Zen Eco Homes";
  assert.equal(messageRequestsMarketingCampaign(message), true);
  assert.deepEqual(resolveNexusMarketingBrand(message), { id: "zeneco", name: "Zen Eco Homes" });
  assert.equal(resolveNexusMarketingFocus(message), "Biar");
  assert.deepEqual(resolveNexusMarketingChannels(message), ["instagram", "facebook"]);

  const proposals = buildNexusMarketingActionProposals({ message });
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].type, "prepare_marketing_campaign");
  assert.equal(proposals[0].endpoint, "/api/nexus/marketing-actions");
  assert.equal(proposals[0].brandId, "zeneco");
  assert.equal(proposals[0].focus, "Biar");
  assert.deepEqual(proposals[0].channels, ["instagram", "facebook"]);
  assert.equal(proposals[0].requiresApproval, true);
  assert.match(proposals[0].description, /Ingenting publiseres/);
});

test("operator's broad inland Spain prompt creates a governed Zen Eco Homes campaign action", () => {
  const message = "Start SoMe kampanje med å fortelle om innlandet i Spania og om mulighetene for å bygge bolig der. Legg ved eksempel v boliger som kan leveres der på store tomter. Zenecohomes";
  assert.equal(messageRequestsMarketingCampaign(message), true);
  assert.deepEqual(resolveNexusMarketingBrand(message), { id: "zeneco", name: "Zen Eco Homes" });
  assert.equal(resolveNexusMarketingFocus(message), "innlandet i Spania");
  assert.deepEqual(resolveNexusMarketingChannels(message), ["instagram", "facebook"]);

  const proposals = buildNexusMarketingActionProposals({ message });
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].type, "prepare_marketing_campaign");
  assert.equal(proposals[0].brandId, "zeneco");
  assert.equal(proposals[0].focus, "innlandet i Spania");
  assert.match(proposals[0].label, /innlandet i Spania/);
  assert.match(proposals[0].requestText, /store tomter/);
});

test("broad inland aliases remain geographic focuses", () => {
  assert.equal(resolveNexusMarketingFocus("Lag SoMe-kampanje om Costa Blanca inland for Zen Eco Homes"), "Costa Blanca inland");
  assert.equal(resolveNexusMarketingFocus("Start kampanje om Alicante innland for Zen Eco Homes"), "Alicante innland");
});

test("multi-turn marketing continuation combines earlier request with operator detail", () => {
  const current = "zen eco homes, og sett inn bolig som kan bygges der, men fokuser på livet i Biar, hva det kan bygges, hvem det passer for";
  const context = ["kan du markedsføre Biar i SoME", current].join("\n");
  assert.equal(messageRequestsMarketingCampaign(current), true);
  assert.equal(resolveNexusMarketingFocus(current), "Biar");

  const proposals = buildNexusMarketingActionProposals({ message: current, marketingContext: context });
  assert.equal(proposals.length, 1);
  const proposal = proposals[0];
  assert.equal(proposal.type, "prepare_marketing_campaign");
  assert.equal(proposal.brandId, "zeneco");
  assert.equal(proposal.focus, "Biar");
  assert.deepEqual(proposal.channels, ["instagram", "facebook"]);
  assert.match(proposal.requestText, /markedsføre Biar i SoME/);
  assert.match(proposal.requestText, /sett inn bolig/);
});

test("marketing campaign fails closed until both brand and focus are resolved", () => {
  assert.equal(buildNexusMarketingActionProposals({ message: "markedsfør Biar i SoME" }).length, 0);
  assert.equal(buildNexusMarketingActionProposals({ message: "lag SoMe-kampanje for Zen Eco Homes" }).length, 0);
});

test("brand label can never be misread as geographic focus", () => {
  assert.equal(resolveNexusMarketingFocus("lag SoMe-kampanje for Zen Eco Homes"), null);
});
