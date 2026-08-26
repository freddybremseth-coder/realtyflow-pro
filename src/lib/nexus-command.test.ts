import assert from "node:assert/strict";
import { test } from "node:test";
import { filterNexusCommands } from "@/lib/nexus-command";

test("property searches prioritize Property 360", () => {
  const results = filterNexusCommands("beste kjøpere");
  assert.equal(results[0]?.href, "/inventory/property-360");
});

test("plain social channel searches still prioritize Marketing Autopilot", () => {
  const results = filterNexusCommands("instagram");
  assert.equal(results[0]?.href, "/social-automation");
});

test("brand and channel strategy searches prioritize Brand Brain", () => {
  assert.equal(filterNexusCommands("brand brain")[0]?.href, "/nexus-os/brand-brain");
  assert.equal(filterNexusCommands("Freddy Publishing kanaler")[0]?.href, "/nexus-os/brand-brain");
  assert.equal(filterNexusCommands("hvilke brands mangler facebook")[0]?.href, "/nexus-os/brand-brain");
  assert.equal(filterNexusCommands("Freddy AI products")[0]?.href, "/nexus-os/brand-brain");
});

test("customer searches find CRM", () => {
  const results = filterNexusCommands("kunde");
  assert.equal(results[0]?.href, "/customers");
});

test("empty query returns a compact default set", () => {
  const results = filterNexusCommands("", 4);
  assert.equal(results.length, 4);
  assert.equal(results[0]?.href, "/nexus-os/today");
});
