import assert from "node:assert/strict";
import test from "node:test";
import {
  removeUnrelatedCompanionQuestion,
  socialCopyReview,
  socialEditorialFocus,
} from "./social-editorial-quality";

test("a cost article stays about costs even if the brief asks for a lifestyle story", () => {
  const focus = socialEditorialFocus({
    sourceType: "article",
    sourceTitle: "Kjøpskostnader i Spania: skatt, notar og avgifter",
    brief: "Gjør dette varmt og menneskelig, med noen som reiser sammen.",
  });
  assert.equal(focus.theme, "costs");
  assert.match(focus.recommendedCta, /Lagre/);
});

test("a customer case keeps its own theme, not a generic lifestyle question", () => {
  const focus = socialEditorialFocus({
    sourceType: "topic",
    sourceTitle: "Familien Johnsen sin kundereise",
  });
  assert.equal(focus.theme, "customer_case");
  assert.doesNotMatch(focus.recommendedCta, /Hvem ville du tatt med/);
});

test("an area post may ask who the reader would bring", () => {
  const focus = socialEditorialFocus({ sourceType: "area", sourceTitle: "Altea", socialCategory: "area_lifestyle" });
  assert.equal(focus.theme, "area");
  assert.match(removeUnrelatedCompanionQuestion("Hvem ville du tatt med deg hit?", focus), /Hvem ville/);
});

test("unrelated travel-companion CTA is removed from a cost caption", () => {
  const focus = socialEditorialFocus({ sourceType: "topic", sourceTitle: "Kjøpskostnader" });
  const caption = "Sett opp budsjett for skatt og omkostninger.\n\nHvem ville du tatt med deg hit?";
  const corrected = removeUnrelatedCompanionQuestion(caption, focus);
  assert.match(corrected, /budsjett/);
  assert.doesNotMatch(corrected, /Hvem ville du/);
});

test("editorial warnings flag mixed customer case and costs and weak detail", () => {
  const focus = socialEditorialFocus({ sourceType: "article", sourceTitle: "Kjøpskostnader i Spania" });
  const issues = socialCopyReview("Familien Johnsen var fornøyde. Hvem vil du ha med deg til Spania?", focus);
  assert.ok(issues.some((issue) => issue.includes("Captionen er kort")));
  assert.ok(issues.some((issue) => issue.includes("kundehistorie")));
  assert.ok(issues.some((issue) => issue.includes("Engasjementsspørsmålet")));
});
