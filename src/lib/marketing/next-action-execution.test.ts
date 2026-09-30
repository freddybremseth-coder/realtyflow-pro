import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isSystemNextActionRequest,
  nextActionPublicationMode,
  nextActionRequestIdentity,
  resolveAutopilotRunChannels,
} from "@/lib/marketing/next-action-execution";

test("system next-action identity is explicit and namespaced", () => {
  const value = nextActionRequestIdentity("prepare-canary:zeneco:facebook");
  assert.equal(value, "growth-autopilot:prepare-canary:zeneco:facebook");
  assert.equal(isSystemNextActionRequest(value), true);
  assert.equal(isSystemNextActionRequest("manual:zeneco:facebook"), false);
});

test("ordinary run requests cannot widen configured autopilot channels", () => {
  assert.deepEqual(resolveAutopilotRunChannels({
    brandId: "zeneco",
    configuredChannels: ["instagram"],
    requestedChannels: ["facebook"],
    systemNextAction: false,
  }), []);
});

test("system next-action can prepare an explicit pilot channel outside live preapproval", () => {
  assert.deepEqual(resolveAutopilotRunChannels({
    brandId: "zeneco",
    configuredChannels: ["instagram"],
    requestedChannels: ["facebook"],
    systemNextAction: true,
  }), ["facebook"]);
  assert.equal(nextActionPublicationMode({
    configuredChannels: ["instagram"],
    targetChannel: "facebook",
  }), "REVIEW_ONLY");
});

test("configured target remains live-eligible, but only downstream guards can publish it", () => {
  assert.deepEqual(resolveAutopilotRunChannels({
    brandId: "pinosoecolife",
    configuredChannels: ["facebook", "instagram"],
    requestedChannels: ["facebook"],
    systemNextAction: true,
  }), ["facebook"]);
  assert.equal(nextActionPublicationMode({
    configuredChannels: ["facebook", "instagram"],
    targetChannel: "facebook",
  }), "LIVE_ELIGIBLE");
});

test("system request still fails closed for unsupported or non-pilot channels", () => {
  assert.deepEqual(resolveAutopilotRunChannels({
    brandId: "zeneco",
    configuredChannels: ["instagram"],
    requestedChannels: ["youtube"],
    systemNextAction: true,
  }), []);
  assert.deepEqual(resolveAutopilotRunChannels({
    brandId: "freddyart",
    configuredChannels: ["instagram"],
    requestedChannels: ["youtube"],
    systemNextAction: true,
  }), []);
});

test("shared Freddy Art Facebook remains review-only when not in a run's live config", () => {
  assert.deepEqual(resolveAutopilotRunChannels({
    brandId: "freddyart",
    configuredChannels: ["instagram"],
    requestedChannels: ["facebook"],
    systemNextAction: true,
  }), ["facebook"]);
  assert.equal(nextActionPublicationMode({
    configuredChannels: ["instagram"],
    targetChannel: "facebook",
  }), "REVIEW_ONLY");
});
