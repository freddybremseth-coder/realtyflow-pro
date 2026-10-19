import assert from "node:assert/strict";
import test from "node:test";
import { inspectProjectClaimSignals } from "./visibility-project-claim-signals";
test("signals derive from visible HTML, never scripts or schema", () => {
 const r=inspectProjectClaimSignals('<script type="application/ld+json">{"price":"€ 349000"}</script><h1>Villa</h1><p>Leveringstid må bekreftes.</p>');
 assert.equal(r.priceMention,false);
 assert.equal(r.deliveryMention,true);
 assert.equal(r.verified,false);
});
test("visible phrases indicate topics, never source verification", () => {
 const r=inspectProjectClaimSignals("<p>Pris € 300000. Energiklasse A. IVA må kontrolleres.</p>");
 assert.equal(r.priceMention,true);
 assert.equal(r.energyMention,true);
 assert.equal(r.taxMention,true);
 assert.equal(r.verified,false);
});
