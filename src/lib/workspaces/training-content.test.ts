import assert from "node:assert/strict";
import test from "node:test";
import { trainingArticlesFor, WORKSPACE_TRAINING_ARTICLES } from "./training-content";
import { applyTrainingOverrides, editableTrainingContent, trainingBaseForBrand, validateTrainingContent } from "./training-overrides";

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


test("Nexus Insights guide appears only with nexus.read", () => {
  const withNexus = trainingArticlesFor({
    brandKey: "pinosoecolife",
    permissions: ["nexus.read"],
  });
  assert.equal(withNexus.some(article => article.id === "nexus-insights"), true);

  const withoutNexus = trainingArticlesFor({
    brandKey: "pinosoecolife",
    permissions: ["marketing.read"],
  });
  assert.equal(withoutNexus.some(article => article.id === "nexus-insights"), false);
});

test("YouTube guide is Zen-only and appears with YouTube access", () => {
  const zen = trainingArticlesFor({
    brandKey: "zeneco",
    permissions: ["youtube.read"],
  });
  assert.equal(zen.some(article => article.id === "youtube-studio"), true);

  const pinoso = trainingArticlesFor({
    brandKey: "pinosoecolife",
    permissions: ["youtube.read"] as any,
  });
  assert.equal(pinoso.some(article => article.id === "youtube-studio"), false);

  const noYoutube = trainingArticlesFor({
    brandKey: "zeneco",
    permissions: ["reels.read"],
  });
  assert.equal(noYoutube.some(article => article.id === "youtube-studio"), false);
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

test("owner edits training copy but can never broaden audience, scope or staff permissions", () => {
  const base = trainingArticlesFor({ brandKey: "zeneco", permissions: ["marketing.read"] });
  const first = base.find(article => article.id === "how-we-work");
  assert.ok(first);
  const edited = { ...editableTrainingContent(first), title: "Oppdatert arbeidsflyt",
    brands: ["soleada"], anyPermissions: [], id: "forged-article" } as any;
  assert.equal(validateTrainingContent(edited), true);
  const copy = applyTrainingOverrides(base, "zeneco", [{ article_id: "how-we-work", content: edited }]);
  assert.equal(copy.find(article => article.id === "how-we-work")?.title, "Oppdatert arbeidsflyt");
  assert.equal(first.title, WORKSPACE_TRAINING_ARTICLES.find(article => article.id === "how-we-work")?.title);
  assert.deepEqual(copy.find(article => article.id === "how-we-work")?.anyPermissions, first.anyPermissions);
  assert.deepEqual(copy.find(article => article.id === "how-we-work")?.brands, first.brands);

  const pinoso = trainingArticlesFor({ brandKey: "pinosoecolife", permissions: ["marketing.read"] });
  const pinosoCopy = applyTrainingOverrides(pinoso, "pinosoecolife", [{ article_id: "how-we-work", content: edited }]);
  assert.equal(pinosoCopy.find(article => article.id === "how-we-work")?.title, "Oppdatert arbeidsflyt");

  const otherBrand = applyTrainingOverrides(base, "soleada", [{ article_id: "how-we-work", content: edited }]);
  assert.equal(otherBrand.find(article => article.id === "how-we-work")?.title, first.title);
});

test("malformed overrides fall back to shipped text and do not change training policy", () => {
  const base = trainingBaseForBrand("zeneco");
  const first = base.find(article => article.id === "how-we-work");
  assert.ok(first);
  assert.equal(validateTrainingContent({ ...editableTrainingContent(first), sections: [] }), false);
  assert.equal(validateTrainingContent({ ...editableTrainingContent(first), readMinutes: "100" }), false);
  const bad = { ...editableTrainingContent(first), sections: [] } as any;
  const copy = applyTrainingOverrides(base, "zeneco", [{ article_id: "how-we-work", content: bad }]);
  assert.equal(copy.find(article => article.id === "how-we-work")?.title, first.title);
});
