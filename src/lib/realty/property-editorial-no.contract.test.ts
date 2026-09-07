import assert from "node:assert/strict";
import test from "node:test";
import { PROPERTY_EDITORIAL_NO_SYSTEM_PROMPT } from "./property-editorial-no";

test("Norwegian property editorial prompt forbids invented facts and superlatives", () => {
  assert.match(PROPERTY_EDITORIAL_NO_SYSTEM_PROMPT, /Ikke finn på fakta/i);
  assert.match(PROPERTY_EDITORIAL_NO_SYSTEM_PROMPT, /drømmebolig/);
  assert.match(PROPERTY_EDITORIAL_NO_SYSTEM_PROMPT, /unik/);
  assert.match(PROPERTY_EDITORIAL_NO_SYSTEM_PROMPT, /fantastisk/);
  assert.match(PROPERTY_EDITORIAL_NO_SYSTEM_PROMPT, /Returner KUN gyldig JSON/i);
});

test("prompt refuses to infer use orientation and room count", () => {
  assert.match(PROPERTY_EDITORIAL_NO_SYSTEM_PROMPT, /Ikke konverter antall soverom til et antall "rom"/i);
  assert.match(PROPERTY_EDITORIAL_NO_SYSTEM_PROMPT, /orientation_no skal være "Ikke angitt"/i);
});
