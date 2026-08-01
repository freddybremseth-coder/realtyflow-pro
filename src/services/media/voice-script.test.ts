import assert from "node:assert/strict";
import test from "node:test";
import {
  buildVoiceScriptPrompt,
  cleanVoiceScriptOutput,
  countVoiceWords,
  estimateVoiceDurationSeconds,
  voiceScriptRequestSchema,
} from "./voice-script";

test("voice script request requires source text for rewrite actions", () => {
  const result = voiceScriptRequestSchema.safeParse({
    action: "rewrite",
    script: "",
    language: "Norwegian",
    tone: "Professional",
    useCase: "business",
  });
  assert.equal(result.success, false);
});

test("voice script prompt preserves brand context and forbids invented facts", () => {
  const input = voiceScriptRequestSchema.parse({
    action: "rewrite",
    script: "Velkommen til denne boligen.",
    language: "Norwegian",
    tone: "Varm og profesjonell",
    useCase: "property",
    brandId: "soleada",
    targetDurationSeconds: 60,
    pronunciationGuide: "Altea uttales Al-te-a",
  });
  const prompt = buildVoiceScriptPrompt(input);

  assert.match(prompt, /Soleada\.no/);
  assert.match(prompt, /Norwegian/);
  assert.match(prompt, /approximately 145 spoken words/);
  assert.match(prompt, /Do not invent property facts/);
  assert.match(prompt, /Altea uttales Al-te-a/);
});

test("voice duration responds to speed", () => {
  const script = Array.from({ length: 145 }, () => "ord").join(" ");
  assert.equal(countVoiceWords(script), 145);
  assert.equal(estimateVoiceDurationSeconds(script, 1), 60);
  assert.equal(estimateVoiceDurationSeconds(script, 2), 30);
});

test("voice script output removes wrappers and truncates at a safe boundary", () => {
  const wrapped = cleanVoiceScriptOutput("```text\nManus: Dette er et ferdig manus.\n```", 4_000);
  assert.equal(wrapped.text, "Dette er et ferdig manus.");
  assert.equal(wrapped.truncated, false);

  const long = cleanVoiceScriptOutput(`${"En god setning. ".repeat(400)}Avslutning.`, 500);
  assert.equal(long.truncated, true);
  assert.ok(long.text.length <= 500);
  assert.match(long.text, /\.$/);
});
