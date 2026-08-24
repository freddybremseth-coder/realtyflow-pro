import assert from "node:assert/strict";
import test from "node:test";
import { buildAnthropicMessageParams } from "@/services/ai/claude-client";

const SCHEMA = { type: "object", properties: { body: { type: "string" }, publishable: { type: "boolean" } }, required: ["body", "publishable"], additionalProperties: false };

test("1: JSON-modus + schema → output_config.format.type = json_schema", () => {
  const p: any = buildAnthropicMessageParams("claude-sonnet-5", "prompt", { responseMimeType: "application/json", responseSchema: SCHEMA, systemPrompt: "sys" });
  assert.equal(p.output_config.format.type, "json_schema");
  assert.deepEqual(p.output_config.format.schema, SCHEMA);
  assert.equal(p.system, "sys");
  assert.deepEqual(p.messages, [{ role: "user", content: "prompt" }]);
});

test("uten schema → ingen output_config (fri tekst)", () => {
  const p: any = buildAnthropicMessageParams("claude-sonnet-5", "prompt", {});
  assert.equal(p.output_config, undefined);
});

test("responseMimeType uten schema → ingen output_config", () => {
  const p: any = buildAnthropicMessageParams("claude-sonnet-5", "prompt", { responseMimeType: "application/json" });
  assert.equal(p.output_config, undefined);
});

test("Sonnet 5 sender ikke temperature; Haiku 4.5 gjør det", () => {
  const sonnet: any = buildAnthropicMessageParams("claude-sonnet-5", "p", { temperature: 0.7 });
  assert.equal(sonnet.temperature, undefined);
  const haiku: any = buildAnthropicMessageParams("claude-haiku-4-5-20251001", "p", { temperature: 0.7 });
  assert.equal(haiku.temperature, 0.7);
});
