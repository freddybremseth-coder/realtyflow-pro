import assert from "node:assert/strict";
import test from "node:test";
import { publishToMultiplePlatforms } from "@/services/integrations/social-publisher";

const INCIDENT = "Jeg setter opp Marketing Agent til å generere denne selgende SoMe-posten for Zen Eco Homes-eiendommen i Calpe.";

// REGRESJON: den nøyaktige klassen feil som ble publisert på Instagram.
// Gaten returnerer FØR plattform-switchen → publishToInstagram/Facebook/LinkedIn
// (som ville truffet Meta Graph) kalles aldri. Null Meta-kall.
test("REGRESJON: publishToMultiplePlatforms blokkerer meta-tekst — 0 Meta-kall", async () => {
  const res = await publishToMultiplePlatforms({
    brandId: "zeneco",
    platforms: ["instagram", "facebook", "linkedin"] as any,
    title: "SoMe",
    content: INCIDENT,
  } as any);
  assert.equal(res.length, 3);
  assert.ok(res.every((r) => r.success === false));
  assert.ok(res.every((r) => /PUBLISHABILITY_FAILED/.test(r.error ?? "")));
});

test("placeholder-innhold blokkeres også (0 Meta-kall)", async () => {
  const res = await publishToMultiplePlatforms({ brandId: "zeneco", platforms: ["instagram"] as any, title: "x", content: "TODO: skriv caption" } as any);
  assert.equal(res[0].success, false);
  assert.match(res[0].error ?? "", /PUBLISHABILITY_FAILED/);
});
