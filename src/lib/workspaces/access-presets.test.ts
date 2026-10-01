import assert from "node:assert/strict";
import test from "node:test";
import { workspaceAccessPresetChoice } from "./access-presets";

test("external agency preset can create but not publish Reels and has no CRM/email", () => {
  const zen = workspaceAccessPresetChoice("zeneco", "external-agency");
  assert.equal(zen.reelsRead, true);
  assert.equal(zen.reelsCreate, true);
  assert.equal(zen.reelsPublish, false);
  assert.equal(zen.youtubeRead, true);
  assert.equal(zen.youtubePublish, false);
  assert.equal(zen.marketingPublish, false);
  assert.equal(zen.contentPublish, false);
  assert.equal(zen.crmRead, false);
  assert.equal(zen.crmWrite, false);
  assert.equal(zen.emailRead, false);
  assert.equal(zen.emailSend, false);
  assert.equal(zen.nexusRead, true);
});

test("marketing preset only enables Reels on supported brands", () => {
  const zen = workspaceAccessPresetChoice("zeneco", "marketing");
  const pinoso = workspaceAccessPresetChoice("pinosoecolife", "marketing");
  const other = workspaceAccessPresetChoice("anotherbrand", "marketing");
  for (const choice of [zen, pinoso]) {
    assert.equal(choice.marketingPublish, true);
    assert.equal(choice.reelsRead, true);
    assert.equal(choice.reelsCreate, true);
    assert.equal(choice.reelsPublish, true);
  }
  assert.equal(zen.youtubeRead, true);
  assert.equal(zen.youtubePublish, true);
  assert.equal(pinoso.youtubeRead, false);
  assert.equal(pinoso.youtubePublish, false);
  assert.equal(other.marketingPublish, true);
  assert.equal(other.reelsRead, false);
  assert.equal(other.reelsCreate, false);
  assert.equal(other.reelsPublish, false);
  assert.equal(zen.nexusRead, true);
  assert.equal(pinoso.nexusRead, true);
  assert.equal(other.nexusRead, true);
});

test("sales preset follows Zen joint-task boundary", () => {
  const zen = workspaceAccessPresetChoice("zeneco", "sales-crm");
  const pinoso = workspaceAccessPresetChoice("pinosoecolife", "sales-crm");
  assert.equal(zen.crmRead, true);
  assert.equal(zen.crmWrite, true);
  assert.equal(zen.tasksRead, true);
  assert.equal(zen.tasksWrite, true);
  assert.equal(pinoso.crmRead, true);
  assert.equal(pinoso.crmWrite, true);
  assert.equal(pinoso.tasksRead, false);
  assert.equal(pinoso.tasksWrite, false);
});

test("read-only preset has no write or publish capabilities", () => {
  const choice = workspaceAccessPresetChoice("zeneco", "read-only");
  for (const value of [
    choice.crmWrite, choice.tasksWrite, choice.marketingDraft, choice.marketingPublish,
    choice.reelsCreate, choice.reelsPublish, choice.youtubePublish, choice.corporatePlan, choice.visibilityPlan,
    choice.adsDraft, choice.eventsPlan, choice.contentEdit, choice.contentPublish,
    choice.emailDraft, choice.emailSend,
  ]) assert.equal(value, false);
  assert.equal(choice.nexusRead, true);
});

test("SEO and content preset stays out of CRM and communications", () => {
  const choice = workspaceAccessPresetChoice("zeneco", "seo-content");
  assert.equal(choice.visibilityPlan, true);
  assert.equal(choice.contentEdit, true);
  assert.equal(choice.contentPublish, true);
  assert.equal(choice.marketingDraft, true);
  assert.equal(choice.marketingPublish, false);
  assert.equal(choice.crmRead, false);
  assert.equal(choice.emailRead, false);
  assert.equal(choice.reelsRead, false);
  assert.equal(choice.youtubeRead, false);
  assert.equal(choice.youtubePublish, false);
  assert.equal(choice.nexusRead, true);
});


test("partner preset is broad operational access without brand-incompatible capabilities", () => {
  const zen = workspaceAccessPresetChoice("zeneco", "partner");
  const pinoso = workspaceAccessPresetChoice("pinosoecolife", "partner");
  assert.equal(zen.crmRead, true);
  assert.equal(zen.crmWrite, true);
  assert.equal(zen.tasksWrite, true);
  assert.equal(zen.marketingPublish, true);
  assert.equal(zen.reelsPublish, true);
  assert.equal(zen.youtubePublish, true);
  assert.equal(zen.corporatePlan, true);
  assert.equal(zen.contentPublish, true);
  assert.equal(zen.emailSend, true);
  assert.equal(zen.nexusRead, true);

  assert.equal(pinoso.crmRead, true);
  assert.equal(pinoso.crmWrite, true);
  assert.equal(pinoso.tasksRead, false);
  assert.equal(pinoso.tasksWrite, false);
  assert.equal(pinoso.reelsPublish, true);
  assert.equal(pinoso.youtubeRead, false);
  assert.equal(pinoso.youtubePublish, false);
  assert.equal(pinoso.corporateRead, false);
  assert.equal(pinoso.corporatePlan, false);
  assert.equal(pinoso.emailSend, true);
});
