import assert from "node:assert/strict";
import test from "node:test";
import { buildOpenAIBookResponsePayload, extractOpenAIResponseText, extractOpenAIWebSources } from "./book-author-client";

test("book production uses OpenAI Responses and high reasoning by default", () => {
  const payload = buildOpenAIBookResponsePayload("Write the outline", { model: "sonnet", maxTokens: 8000 });
  assert.equal(payload.model, "gpt-5.6");
  assert.deepEqual(payload.reasoning, { effort: "high" });
  assert.equal(payload.max_output_tokens, 25000);
  assert.match(payload.instructions, /seriebibel/i);
});

test("structured book plans use strict JSON schema", () => {
  const schema = { type: "object", properties: { title: { type: "string" } }, required: ["title"], additionalProperties: false };
  const payload = buildOpenAIBookResponsePayload("Plan", { responseMimeType: "application/json", responseSchema: schema });
  assert.deepEqual((payload as any).text.format, { type: "json_schema", name: "book_author_output", strict: true, schema });
});

test("response text is extracted from REST response items", () => {
  assert.equal(extractOpenAIResponseText({ output: [{ type: "message", content: [{ type: "output_text", text: "Chapter one" }] }] }), "Chapter one");
});

test("market discovery requires live OpenAI web search", () => {
  const payload = buildOpenAIBookResponsePayload("Find current reader demand", { webSearch: true });
  assert.deepEqual((payload as any).tools, [{ type: "web_search", external_web_access: true }]);
  assert.equal((payload as any).tool_choice, "required");
  assert.deepEqual((payload as any).include, ["web_search_call.action.sources"]);
});

test("market discovery keeps verified https sources for the UI", () => {
  const sources = extractOpenAIWebSources({
    output: [
      { type: "web_search_call", action: { sources: [{ title: "Market report", url: "https://example.com/report" }] } },
      { type: "message", content: [{ annotations: [{ title: "Unsafe", url: "javascript:alert(1)" }] }] },
    ],
  });
  assert.deepEqual(sources, [{ title: "Market report", url: "https://example.com/report" }]);
});
