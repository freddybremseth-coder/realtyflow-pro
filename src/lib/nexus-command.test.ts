import assert from "node:assert/strict";
import { test } from "node:test";
import { filterNexusCommands } from "@/lib/nexus-command";

test("property searches prioritize Property 360", () => {
  const results = filterNexusCommands("beste kjøpere");
  assert.equal(results[0]?.href, "/inventory/property-360");
});

test("brand and channel terms find social automation", () => {
  const results = filterNexusCommands("instagram");
  assert.equal(results[0]?.href, "/social-automation");
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
