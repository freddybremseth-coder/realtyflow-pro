import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { askClaude } from "./claude-client";

test("Elena's Claude -> OpenAI fallback never calls Gemini even if Gemini is configured", async () => {
  const originals = {
    anthropic: process.env.ANTHROPIC_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    fetch: globalThis.fetch,
  };
  try {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.GEMINI_API_KEY = "never-use-gemini-test-key";
    process.env.OPENAI_API_KEY = "openai-test-key";
    const urls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return new Response(JSON.stringify({
        choices: [{ message: { content: "OpenAI generated draft" } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const selected: Array<{ provider: string; model: string }> = [];
    const answer = await askClaude("Draft a polite reply", {
      fallbackProviders: ["openai"],
      onProviderSelected: (provider, model) => selected.push({ provider, model }),
    });
    assert.equal(answer, "OpenAI generated draft");
    assert.deepEqual(urls, ["https://api.openai.com/v1/chat/completions"]);
    assert.deepEqual(selected, [{ provider: "openai", model: "gpt-4o-mini" }]);
  } finally {
    if (originals.anthropic === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originals.anthropic;
    if (originals.gemini === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originals.gemini;
    if (originals.openai === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originals.openai;
    globalThis.fetch = originals.fetch;
  }
});

test("No configured Claude or OpenAI returns a scoped error without trying Gemini", async () => {
  const originals = {
    anthropic: process.env.ANTHROPIC_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    fetch: globalThis.fetch,
  };
  try {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    process.env.GEMINI_API_KEY = "gemini-present-but-not-allowed";
    globalThis.fetch = (async () => { throw new Error("unexpected network access"); }) as typeof fetch;
    await assert.rejects(
      askClaude("Test", { fallbackProviders: ["openai"] }),
      (error: unknown) => error instanceof Error
        && error.message.includes("Anthropic eller OpenAI")
        && !error.message.includes("Gemini"),
    );
  } finally {
    if (originals.anthropic === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originals.anthropic;
    if (originals.gemini === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originals.gemini;
    if (originals.openai === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originals.openai;
    globalThis.fetch = originals.fetch;
  }
});

test("Elena's route and persisted email draft use only the explicitly selected model", () => {
  const agent = readFileSync("src/services/agents/email-agent.ts", "utf8");
  const base = readFileSync("src/services/agents/base-agent.ts", "utf8");
  const workflow = readFileSync("src/services/email/process-email-message.ts", "utf8");
  assert.match(agent, /return \['openai'\];/);
  assert.match(base, /fallbackProviders: this\.getAIFallbackProviders\(\)/);
  assert.match(workflow, /ai_model: result\.aiModel/);
  assert.doesNotMatch(workflow, /ai_model: "claude-sonnet-4"/);
});
