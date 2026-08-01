import assert from "node:assert/strict";
import test from "node:test";
import { BrandProfileInputSchema, QUALITY_SCORE_CATEGORIES } from "./contracts";
import { buildOverviewScores, calculatePerformanceMetrics, scoreSocialPost } from "./scoring";

test("post quality score explains platform fit without promising reach", () => {
  const quality = scoreSocialPost({
    content: [
      "Hva skjer med boligselgere i Costa Blanca når markedet flytter seg raskt?",
      "",
      "Jeg ser ofte at gode eiendommer taper fart fordi strategien blir for generell.",
      "En bedre start er å avklare målgruppe, prislogikk og hvilke innvendinger kjøperne faktisk har.",
      "",
      "Kommenter dersom du vil se sjekklisten jeg bruker før en salgsprosess.",
    ].join("\n"),
    targetAudience: "boligselgere",
    goal: "bygge tillit",
    tone: ["professional", "warm"],
    platform: "linkedin",
    brandKeywords: ["Costa Blanca", "boligselgere"],
  });

  assert.equal(quality.total > 0, true);
  assert.deepEqual(Object.keys(quality.categories).sort(), [...QUALITY_SCORE_CATEGORIES].sort());
  assert.match(quality.disclaimer, /garanterer ikke/i);
  assert.doesNotMatch(JSON.stringify(quality).toLowerCase(), /viral|virality/);
  assert.equal(quality.categories.platformFit.dataAvailable, true);
});

test("performance metrics use transparent formulas and warn on limited data", () => {
  const metrics = calculatePerformanceMetrics([
    {
      impressions: 1000,
      reach: 800,
      reactions: 30,
      comments: 5,
      shares: 3,
      saves: 2,
      clicks: 40,
      followers_gained: 8,
      leads: 2,
    },
    {
      impressions: 500,
      reach: 350,
      reactions: 10,
      comments: 0,
      shares: 1,
      saves: 0,
      clicks: 10,
      followers_gained: 2,
      leads: 1,
    },
  ]);

  assert.equal(metrics.engagementRate, 0.034);
  assert.equal(metrics.commentsPerThousand, 3.33);
  assert.equal(metrics.sharesPerThousand, 2.67);
  assert.equal(metrics.clickRate, 0.0333);
  assert.equal(metrics.leadConversionRate, 0.06);
  assert.equal(metrics.followerConversionRate, 0.0067);
  assert.equal(metrics.formulas.engagementRate, "(reactions + comments + shares + saves) / impressions");
  assert.match(metrics.dataWarning || "", /begrenset til 2 innlegg/i);
});

test("overview keeps missing dimensions explicit instead of inventing scores", () => {
  const empty = buildOverviewScores({});

  assert.equal(empty.personalBrandScore.score, null);
  assert.equal(empty.personalBrandScore.dataAvailable, false);
  assert.equal(empty.engagementScore.score, null);
  assert.equal(empty.networkScore.score, null);
  assert.match(empty.networkScore.explanation, /senere fase/i);

  const profile = BrandProfileInputSchema.parse({
    professionalName: "Freddy Bremseth",
    currentPosition: "Founder",
    companyName: "RealtyFlow",
    location: "Costa Blanca",
    targetAudiences: ["boligselgere"],
    services: ["AI CRM", "eiendomsrådgivning"],
    expertise: ["LinkedIn", "salgsprosess"],
    positioningGoal: "Bli kjent for praktisk AI i eiendom.",
    preferredTones: ["professional", "warm"],
  });
  const populated = buildOverviewScores({
    profile,
    sections: [{ section_type: "headline", optimized_content: "AI CRM for real estate", score: 82 }],
    skillCount: 7,
    pillarCount: 3,
    ideaCount: 8,
    posts: [{ status: "published", published_at: new Date().toISOString(), quality_score: 78 }],
    metrics: [{ impressions: 1000, reactions: 25, comments: 4, shares: 2, saves: 3, clicks: 24, leads: 2 }],
    crmLinkCount: 1,
  });

  assert.equal(populated.profileScore.dataAvailable, true);
  assert.equal(populated.authorityScore.dataAvailable, true);
  assert.equal(populated.networkScore.dataAvailable, false);
  assert.equal((populated.personalBrandScore.score || 0) > 0, true);
});
