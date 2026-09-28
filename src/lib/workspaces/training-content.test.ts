import assert from "node:assert/strict";
import test from "node:test";
import { trainingArticlesFor } from "./training-content";

test("Corporate training is shown only for Zen users with Corporate access", () => {
  const zen = trainingArticlesFor({
    brandKey: "zeneco",
    permissions: ["corporate.read"],
  });
  assert.equal(zen.some(article => article.id === "corporate-value"), true);
  assert.equal(zen.some(article => article.id === "corporate-outreach"), false);

  const zenPlanner = trainingArticlesFor({
    brandKey: "zeneco",
    permissions: ["corporate.read", "corporate.plan"],
  });
  assert.equal(zenPlanner.some(article => article.id === "corporate-outreach"), true);

  const pinoso = trainingArticlesFor({
    brandKey: "pinosoecolife",
    permissions: ["corporate.read", "corporate.plan"] as any,
  });
  assert.equal(pinoso.some(article => article.id.startsWith("corporate-")), false);
});

test("brand and role training stays focused on the user's actual work", () => {
  const pinosoLead = trainingArticlesFor({
    brandKey: "pinosoecolife",
    permissions: ["crm.read", "crm.write"],
  });
  const ids = pinosoLead.map(article => article.id);
  assert.equal(ids.includes("how-we-work"), true);
  assert.equal(ids.includes("understand-realtyflow"), true);
  assert.equal(ids.includes("pinoso-focus"), true);
  assert.equal(ids.includes("leads-handoff"), true);
  assert.equal(ids.includes("zeneco-focus"), false);
  assert.equal(ids.includes("visibility-content"), false);
});

test("social publishing guide appears only with live publish permission", () => {
  const draftOnly = trainingArticlesFor({
    brandKey: "pinosoecolife",
    permissions: ["marketing.read", "marketing.draft"],
  });
  assert.equal(draftOnly.some(article => article.id === "social-publishing"), false);

  const publisher = trainingArticlesFor({
    brandKey: "pinosoecolife",
    permissions: ["marketing.read", "marketing.draft", "marketing.publish"],
  });
  assert.equal(publisher.some(article => article.id === "social-publishing"), true);
});

test("email Reach guide appears only when email work is assigned", () => {
  const withoutEmail = trainingArticlesFor({
    brandKey: "pinosoecolife",
    permissions: ["crm.read"],
  });
  assert.equal(withoutEmail.some(article => article.id === "email-reach"), false);

  const withEmail = trainingArticlesFor({
    brandKey: "pinosoecolife",
    permissions: ["email.read", "email.draft", "email.send"],
  });
  assert.equal(withEmail.some(article => article.id === "email-reach"), true);
});

test("visibility and campaigns guides appear when those tools are available", () => {
  const articles = trainingArticlesFor({
    brandKey: "zeneco",
    permissions: ["visibility.read", "ads.read", "events.plan"],
  });
  const ids = articles.map(article => article.id);
  assert.equal(ids.includes("visibility-content"), true);
  assert.equal(ids.includes("campaigns-events"), true);
});


test("Reels guide appears only for supported brands with Reel access", () => {
  const zen = trainingArticlesFor({
    brandKey: "zeneco",
    permissions: ["reels.read"],
  });
  assert.equal(zen.some(article => article.id === "reels-studio"), true);

  const pinoso = trainingArticlesFor({
    brandKey: "pinosoecolife",
    permissions: ["reels.create"],
  });
  assert.equal(pinoso.some(article => article.id === "reels-studio"), true);

  const withoutReels = trainingArticlesFor({
    brandKey: "zeneco",
    permissions: ["marketing.read"],
  });
  assert.equal(withoutReels.some(article => article.id === "reels-studio"), false);

  const otherBrand = trainingArticlesFor({
    brandKey: "otherbrand",
    permissions: ["reels.read"] as any,
  });
  assert.equal(otherBrand.some(article => article.id === "reels-studio"), false);
});
