import test from "node:test";
import assert from "node:assert/strict";
import { applyFreddyHtmlMetaChange, supportedFreddySeoPage } from "./seo-github-publisher";

const html = `<!doctype html>
<html lang="es"><head>
<title>Old title</title>
<meta name="description" content="Old description" />
<meta property="og:title" content="Old title" />
<meta property="og:description" content="Old description" />
<link rel="canonical" href="https://www.freddybremseth.com/es/" />
</head><body><main><h1>Visible body stays exactly the same</h1></main></body></html>`;

test("Only preapproved Freddy home-language routes map to GitHub files", () => {
  assert.equal(supportedFreddySeoPage("/es/"), "es/index.html");
  assert.equal(supportedFreddySeoPage("/"), "index.html");
  assert.equal(supportedFreddySeoPage("/artikler/anything"), null);
  assert.equal(supportedFreddySeoPage("//evil"), null);
});

test("Bounded metadata transformer updates title/description and matching OG without body edits", () => {
  const next = applyFreddyHtmlMetaChange(html, {
    title: "Freddy Bremseth | Asesor inmobiliario en España",
    description: "Freddy Bremseth, asesor inmobiliario en España. Información sobre zonas y viviendas en Costa Blanca.",
  });
  assert.match(next, /<title>Freddy Bremseth \| Asesor inmobiliario en España<\/title>/);
  assert.match(next, /property="og:title" content="Freddy Bremseth \| Asesor inmobiliario en España"/);
  assert.match(next, /name="description" content="Freddy Bremseth, asesor inmobiliario en España/);
  assert.equal(next.slice(next.indexOf("<body")), html.slice(html.indexOf("<body")));
  assert.match(next, /canonical/);
});

test("Unsupported promotional claims are rejected before GitHub write", () => {
  assert.throws(() => applyFreddyHtmlMetaChange(html, { title: "#1 guaranteed property advisor" }),
    /unsupported promotional claim/);
  assert.throws(() => applyFreddyHtmlMetaChange(html, { description: "Best property advisor in Spain" }),
    /unsupported promotional claim/);
});

test("Empty and oversized metadata fail closed", () => {
  assert.throws(() => applyFreddyHtmlMetaChange(html, { title: " ".repeat(4) }), /empty or too long/);
  assert.throws(() => applyFreddyHtmlMetaChange(html, { description: "x".repeat(181) }), /empty or too long/);
});
