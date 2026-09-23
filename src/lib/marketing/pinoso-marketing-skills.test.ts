import assert from "node:assert/strict";
import test from "node:test";
import {
  PINOSO_MARKETING_SKILLS,
  pinosoAutopilotIdea,
  pinosoEditorialPillar,
  type PinosoPillar,
} from "./pinoso-marketing-skills";

test("Pinoso five-week plan matches the preapproved 35/30/25/10 mix", () => {
  const counts: Record<PinosoPillar, number> = { plots: 0, villas: 0, lifestyle: 0, process: 0 };
  const anchor = Date.UTC(2026, 8, 21);
  for (let week = 0; week < 5; week += 1) {
    for (const [offset, weekday] of [[0, 1], [2, 3], [4, 5], [6, 0]] as const) {
      const localDate = new Date(anchor + (week * 7 + offset) * 86_400_000).toISOString().slice(0, 10);
      counts[pinosoEditorialPillar(localDate, weekday)] += 1;
    }
  }
  assert.deepEqual(counts, { plots: 7, villas: 6, lifestyle: 5, process: 2 });
});

test("Pinoso editorial selection is repeatable across retries and five-week cycles", () => {
  assert.equal(pinosoEditorialPillar("2026-09-21", 1), "plots");
  assert.equal(pinosoEditorialPillar("2026-09-23", 3), "villas");
  assert.equal(pinosoEditorialPillar("2026-09-25", 5), "process");
  assert.equal(pinosoEditorialPillar("2026-09-27", 0), "lifestyle");
  assert.equal(pinosoEditorialPillar("2026-10-26", 1), "plots");
  assert.equal(pinosoEditorialPillar("2026-09-22", 2), "plots"); // safe manual-run fallback
  assert.equal(pinosoEditorialPillar("invalid", 3), "plots");
});

test("real content skills are explicit about evidence and boundaries", () => {
  assert.equal(new Set(PINOSO_MARKETING_SKILLS.map((skill) => skill.id)).size, PINOSO_MARKETING_SKILLS.length);
  for (const skill of PINOSO_MARKETING_SKILLS) {
    assert.ok(skill.purpose.length > 15);
    assert.ok(skill.evidence.length > 15);
    assert.ok(skill.rule.length > 15);
  }
  const fb = pinosoAutopilotIdea({ localDate: "2026-09-25", dayIndex: 5, channel: "facebook" });
  assert.match(fb, /vann, strøm, regulering/);
  assert.match(fb, /én aktuell og verifisert eiendom/i);
  assert.match(fb, /pinosoecolife.com/);
  assert.match(fb, /Ingen annonsering eller automatiske DM/);
  const ig = pinosoAutopilotIdea({ localDate: "2026-09-27", dayIndex: 0, channel: "instagram" });
  assert.match(ig, /LIVET I INNLANDET/);
  assert.match(ig, /Ingen oppdiktet «lenke i bio»/);
  assert.match(ig, /godkjente ekte eiendomsbilde/);
});
