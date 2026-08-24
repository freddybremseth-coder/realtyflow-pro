import assert from "node:assert/strict";
import test from "node:test";
import {
  assembleAsset,
  buildCreativePrompt,
  checkClaims,
  generateLeadForm,
  leadFormToInquiry,
  parseBrandContext,
  type ContentBrief,
  type CreativeRequest,
} from "@/lib/marketing/autonomous";
import { makeCreativeGenerator } from "@/services/marketing/creative-generator";
import type { ContentGenome } from "@/lib/marketing/genome";

const g = (over: Partial<ContentGenome>): ContentGenome => ({ brandId: "b1", channel: "instagram", format: "reel", ...over });
const brand = parseBrandContext({
  brandId: "b1", brandName: "Zen Eco Homes", voice: "varm, ekspert", audience: "norske kjøpere 45–65",
  valueProposition: "bærekraftige villaer på Costa Blanca", preferredCta: "Book visning",
  allowedClaims: ["A+ energiklasse"], forbiddenClaims: ["garantert avkastning"], locations: ["Finestrat"],
});
const brief: ContentBrief = {
  contentId: "c1", campaignId: "camp1", parentContentId: null, marketingRunId: "mr1", brandId: "b1",
  strategy: "exploit", channel: "instagram", genome: g({ hookType: "price_first", ctaType: "book_viewing", goal: "lead_generation", area: "finestrat" }),
  angle: "Ny villa i Finestrat", goal: { kind: "leads", target: 5, horizonDays: 30 }, wantsLeadCapture: true, learningNotes: [],
};

// ── Brand Brain ─────────────────────────────────────────────────────────────
test("checkClaims flagger forbudt påstand", () => {
  assert.equal(checkClaims("Kjøp med garantert avkastning", brand).ok, false);
  assert.equal(checkClaims("Vakker villa i Finestrat", brand).ok, true);
});

// ── Creative prompt (brand-aware) ───────────────────────────────────────────
test("prompt er brand-aware og krever kilde på sensitive tall", () => {
  const { system, user } = buildCreativePrompt({ brief, brand });
  assert.match(system, /Zen Eco Homes/);
  assert.match(system, /FORBUDTE påstander/);
  assert.match(system, /kilde/i);
  assert.match(user, /Finestrat/);
});

test("assembleAsset lagrer provenance (learning-regler, promptversjon)", () => {
  const req: CreativeRequest = { brief, brand, recommendation: { favor: { hookType: { value: "price_first", lift: 2, evidence: "reliable" } }, avoid: [], notes: [] } };
  const { asset, provenance } = assembleAsset(req, { headline: "H", body: "B", cta: "Book" }, { model: "sonnet" });
  assert.equal(asset.contentId, "c1");
  assert.equal(provenance.promptVersion, "cg-1.0");
  assert.ok(provenance.learningRulesUsed.includes("hookType=price_first"));
});

// ── Creative generator (DI) ─────────────────────────────────────────────────
test("creative generator bruker DI-generering og returnerer typed asset", async () => {
  const gen = makeCreativeGenerator(async () => JSON.stringify({ headline: "Villa i Finestrat", body: "Moderne bærekraftig hjem med havutsikt.", cta: "Book visning", publishable: true }));
  const res = await gen.generate({ brief, brand });
  assert.equal(res.asset.headline, "Villa i Finestrat");
  assert.equal(res.asset.cta, "Book visning");
  assert.equal(res.provenance.generatedBy, "creative-generator");
});

test("REGRESJON: rå ikke-JSON AI-svar → CREATIVE_OUTPUT_INVALID (ingen raw fallback)", async () => {
  const gen = makeCreativeGenerator(async () => "Jeg setter opp Marketing Agent til å generere denne posten.");
  await assert.rejects(() => gen.generate({ brief, brand }), /CREATIVE_OUTPUT_INVALID/);
});

test("malformed JSON fra Claude → CREATIVE_OUTPUT_INVALID (ingen fallback til body)", async () => {
  const gen = makeCreativeGenerator(async () => '{ "body": "Villa", '); // avkuttet JSON
  await assert.rejects(() => gen.generate({ brief, brand }), /CREATIVE_OUTPUT_INVALID/);
});

test("publishable=false fra modellen → CREATIVE_OUTPUT_INVALID", async () => {
  const gen = makeCreativeGenerator(async () => JSON.stringify({ body: "utkast", publishable: false }));
  await assert.rejects(() => gen.generate({ brief, brand }), /CREATIVE_OUTPUT_INVALID/);
});

test("gyldig JSON men meta-tekst i body → CREATIVE_OUTPUT_INVALID (publishability)", async () => {
  const gen = makeCreativeGenerator(async () => JSON.stringify({ body: "Jeg genererer denne posten via Marketing Agent.", publishable: true }));
  await assert.rejects(() => gen.generate({ brief, brand }), /CREATIVE_OUTPUT_INVALID/);
});

// ── Lead form ───────────────────────────────────────────────────────────────
test("lead form er adaptivt og bærer UTM med content_id", () => {
  const form = generateLeadForm(brief, brand);
  assert.ok(form.fields.some((f) => f.key === "budget"));
  assert.ok(form.fields.some((f) => f.key === "email" && f.required));
  assert.equal(form.utm.utm_content, "c1");
  assert.match(form.title, /finestrat/i);
});

test("leadFormToInquiry bærer attribusjon og bygger melding for intake", () => {
  const inq = leadFormToInquiry({
    formId: "form_c1", contentId: "c1", campaignId: "camp1", brandId: "b1", channel: "instagram",
    publicationId: "pub1", answers: { budget: "€500–750k", timeline: "0–3 mnd", property_type: "Villa" },
    contact: { name: "Kari", email: "kari@example.com" },
  });
  assert.match(inq.externalId, /leadform:form_c1:kari@example.com/);
  assert.match(inq.message, /Budsjett: €500–750k/);
  assert.equal(inq.contactEmail, "kari@example.com");
  assert.equal(inq.brandId, "b1");
});

// (MetaPublisher-tester ligger i campaign-production.test.ts med full DB-fake.)
