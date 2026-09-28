import assert from "node:assert/strict";
import test from "node:test";
import { getIllustrativePlotPriceEur } from "./plot-price-evidence";

test("CCB Pinoso: an explicitly illustrated plot is in the advertised price basis", () => {
  const source = "Det er flere tomter, hver med sin pris (i denne annonsen er en tomt til 50 000 euro brukt som eksempel; hvis en annen tomt velges, blir prisen beregnet på nytt).";
  assert.equal(getIllustrativePlotPriceEur("redsp", source), 50000);
});

test("CCB Aspe: explicit advertised price basis is an example, not assigned land", () => {
  assert.equal(getIllustrativePlotPriceEur("redsp", "Den oppgitte prisen er basert på en tomt verdsatt til 85 000 euro. Dersom en annen tomt velges, blir den endelige prisen justert."), 85000);
});

test("A plot merely considered in a listing is not sufficient price inclusion proof", () => {
  assert.equal(getIllustrativePlotPriceEur("redsp", "For denne annonsen er en tomt til en pris av 55 000 euro vurdert; dersom en annen tomtpris velges blir prisen beregnet på nytt."), null);
});

test("No evidence can be inferred from a plot area, builder or a source other than RedSP", () => {
  assert.equal(getIllustrativePlotPriceEur("redsp", "Villa på 10 000 m² tomt. Pris 365 000 euro."), null);
  assert.equal(getIllustrativePlotPriceEur("manual", "i denne annonsen er en tomt til 50 000 euro brukt som eksempel"), null);
  assert.equal(getIllustrativePlotPriceEur("redsp", ""), null);
});

test("Price basis must be in the original, explicit wording and within plausible bounds", () => {
  assert.equal(getIllustrativePlotPriceEur("redsp", "I denne annonsen er en tomt til 0 euro brukt som eksempel."), null);
  assert.equal(getIllustrativePlotPriceEur("redsp", "Det finnes en tomt til 50 000 euro, med pris som avtales separat."), null);
  assert.equal(getIllustrativePlotPriceEur("redsp", "The advertised price is based on a plot valued at € 75,000."), 75000);
});
