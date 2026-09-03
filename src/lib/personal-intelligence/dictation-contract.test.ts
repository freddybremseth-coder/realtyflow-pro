import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/personal-intelligence/transcribe/route.ts"), "utf8");
const button = fs.readFileSync(path.join(process.cwd(), "src/components/personal-intelligence/dictation-button.tsx"), "utf8");
const page = fs.readFileSync(path.join(process.cwd(), "src/app/(content)/personal-intelligence/page.tsx"), "utf8");

test("dictation endpoint is owner-only and accepts bounded audio only", () => {
  assert.match(route, /getRequestAccessContext/);
  assert.match(route, /access\.role !== "OWNER"/);
  assert.match(route, /MAX_AUDIO_BYTES = 10 \* 1024 \* 1024/);
  assert.match(route, /audio\.type\.startsWith\(ALLOWED_AUDIO_PREFIX\)/);
});

test("dictation uses server-side OpenAI transcription without exposing the API key", () => {
  assert.match(route, /process\.env\.OPENAI_API_KEY/);
  assert.match(route, /https:\/\/api\.openai\.com\/v1\/audio\/transcriptions/);
  assert.match(route, /gpt-4o-mini-transcribe/);
  assert.doesNotMatch(button, /OPENAI_API_KEY/);
  assert.doesNotMatch(page, /OPENAI_API_KEY/);
});

test("Personal Intelligence does not persist raw dictation audio or transcript in the transcription route", () => {
  assert.match(route, /rawAudioStoredByRealtyFlow: false/);
  assert.match(route, /transcriptPersistedByThisRoute: false/);
  assert.doesNotMatch(route, /\.insert\(/);
  assert.doesNotMatch(route, /\.update\(/);
  assert.doesNotMatch(route, /\.upsert\(/);
});

test("browser records locally and returns transcript to the editable composer", () => {
  assert.match(button, /MediaRecorder/);
  assert.match(button, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(button, /\/api\/personal-intelligence\/transcribe/);
  assert.match(button, /onTranscript\(body\.text\.trim\(\)\)/);
  assert.match(page, /<DictationButton/);
  assert.match(page, /onTranscript=\{appendTranscript\}/);
  assert.match(page, /setMessage\(\(current\)/);
});

test("dictation never auto-submits a mentor turn", () => {
  assert.doesNotMatch(button, /\/api\/personal-intelligence\/mentor/);
  assert.match(page, /Mikrofonen transkriberer til redigerbar tekst/);
});
