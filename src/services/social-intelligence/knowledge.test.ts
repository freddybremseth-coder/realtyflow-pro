import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  annotateDuplicatesAndConflicts,
  extractKnowledgeItemsFromText,
  generateProfileSuggestionsFromKnowledge,
  selectRelevantKnowledgeForProfile,
  type KnowledgeItemLike,
} from "./knowledge";

const source = {
  id: "source-1",
  sourceType: "master_profile" as const,
  sourceName: "Lokal importtest",
  filename: "profile.md",
  contentHash: `sha256:v1:${"a".repeat(64)}`,
  visibility: "internal" as const,
  aiUseAllowed: true,
  publicUseAllowed: false,
};

function baseItem(overrides: Partial<KnowledgeItemLike>): KnowledgeItemLike {
  return {
    id: "item-1",
    sourceId: source.id,
    sourceType: "master_profile",
    sourceName: source.sourceName,
    sourceRef: "linje 1",
    sourceExcerpt: null,
    category: "other",
    subcategory: null,
    title: "Element",
    content: "Innhold",
    summary: null,
    structuredData: {},
    tags: [],
    visibility: "internal",
    verificationStatus: "needs_review",
    confidence: 0.6,
    relevanceScore: 0,
    publicUseAllowed: false,
    sensitive: false,
    allowedProfileTypes: ["general"],
    platforms: ["linkedin"],
    factType: "document_derived",
    possibleDuplicateOf: null,
    conflictGroup: null,
    conflictReason: null,
    reviewNotes: null,
    ...overrides,
  };
}

test("knowledge import extracts separate reviewable items with provenance and safe defaults", () => {
  const text = `
# Testprofil

## Profilidentitet

- **Fullt navn:** Test Person
- **Fødselsår:** 1980
- **Profesjonell lokasjon:** Alicante

## Tjenester

- Behovsanalyse for boligkjøpere
- CRM og AI-støttet salgsoppfølging

## Begrensninger

- Private helseopplysninger skal ikke brukes offentlig.
`;

  const items = extractKnowledgeItemsFromText({ text, source });

  assert.ok(items.length >= 6);
  assert.ok(items.every((item) => item.verificationStatus === "needs_review"));
  assert.ok(items.every((item) => item.sourceName === source.sourceName));
  assert.ok(items.some((item) => item.category === "identity"));
  assert.ok(items.some((item) => item.category === "service"));
  assert.ok(items.some((item) => item.category === "restriction"));
  assert.ok(items.some((item) => item.sensitive));
  assert.ok(items.every((item) => !item.publicUseAllowed));
});

test("duplicate and conflict detection flags review risks", () => {
  const existing = [
    baseItem({ id: "existing-1", category: "identity", title: "Profesjonell lokasjon", content: "Alicante" }),
    baseItem({ id: "existing-2", category: "role", title: "Tittel", content: "Eiendomsrådgiver" }),
  ];
  const incoming = [
    baseItem({ id: "new-1", category: "identity", title: "Profesjonell lokasjon", content: "Alicante" }),
    baseItem({ id: "new-2", category: "role", title: "Tittel", content: "AI-rådgiver" }),
  ];

  const annotated = annotateDuplicatesAndConflicts(incoming, existing);

  assert.equal(annotated[0].possibleDuplicateOf, "existing-1");
  assert.equal(annotated[1].conflictGroup, "claim:role tittel");
  assert.match(annotated[1].reviewNotes || "", /konflikt/i);
});

test("profile builder handles an empty profile and empty knowledge base without throwing", () => {
  const generated = generateProfileSuggestionsFromKnowledge({
    relevant: [],
    variant: {
      name: "Tom LinkedIn-profil",
      profileType: "linkedin",
      primaryPlatform: "linkedin",
      tone: ["professional"],
      focusTags: [],
    },
    currentProfile: null,
  });

  assert.deepEqual(generated.suggestions, []);
  assert.equal(generated.sourceCoverage.selectedKnowledgeItems, 0);
  assert.equal(generated.sourceCoverage.publicFactItems, 0);
});

test("profile builder only uses approved public facts and keeps control restrictions as safeguards", () => {
  const items = [
    baseItem({
      id: "role-1",
      category: "role",
      title: "Rolle",
      content: "Eiendomsrådgiver og digital rådgiver",
      tags: ["real_estate", "ai_crm"],
      verificationStatus: "user_confirmed",
      publicUseAllowed: true,
      allowedProfileTypes: ["linkedin", "real_estate"],
    }),
    baseItem({
      id: "service-1",
      category: "service",
      title: "Tjenester",
      content: "Behovsanalyse, nybyggsrådgivning og CRM-systemer",
      tags: ["real_estate", "ai_crm"],
      verificationStatus: "user_confirmed",
      publicUseAllowed: true,
      allowedProfileTypes: ["linkedin", "real_estate"],
    }),
    baseItem({
      id: "audience-1",
      category: "audience",
      title: "Målgruppe",
      content: "Skandinaviske boligkjøpere i Spania",
      tags: ["real_estate"],
      verificationStatus: "document_verified",
      publicUseAllowed: true,
      allowedProfileTypes: ["linkedin", "real_estate"],
    }),
    baseItem({
      id: "private-1",
      category: "identity",
      title: "Fødselsår",
      content: "1980",
      sensitive: true,
      verificationStatus: "user_confirmed",
      publicUseAllowed: false,
    }),
    baseItem({
      id: "restriction-1",
      category: "restriction",
      title: "Privat bruk",
      content: "Private helseopplysninger skal ikke brukes offentlig.",
      sensitive: true,
      verificationStatus: "user_confirmed",
      publicUseAllowed: false,
      factType: "restriction",
    }),
  ];

  const relevant = selectRelevantKnowledgeForProfile({
    items,
    sources: [{ id: source.id, status: "active", aiUseAllowed: true, publicUseAllowed: false }],
    variant: {
      name: "LinkedIn eiendomsprofil",
      profileType: "linkedin",
      primaryPlatform: "linkedin",
      goalName: "Bygge tillit",
      goalDescription: "Skape relevant offentlig profil",
      audienceName: "Boligkjøpere",
      audienceDescription: "Skandinaviske boligkjøpere i Spania",
      tone: ["professional", "warm"],
      focusTags: ["real_estate", "ai_crm"],
      instructions: "Ikke bruk private detaljer.",
    },
  });

  assert.ok(relevant.some(({ item }) => item.id === "role-1"));
  assert.ok(relevant.some(({ item }) => item.id === "restriction-1"));
  assert.ok(!relevant.some(({ item }) => item.id === "private-1"));

  const generated = generateProfileSuggestionsFromKnowledge({
    relevant,
    variant: {
      name: "LinkedIn eiendomsprofil",
      profileType: "linkedin",
      primaryPlatform: "linkedin",
      tone: ["professional"],
      focusTags: ["real_estate"],
    },
    currentProfile: null,
  });

  assert.ok(generated.suggestions.length >= 3);
  assert.ok(generated.suggestions.every((suggestion) => suggestion.sourceKnowledgeIds.length > 0));
  assert.doesNotMatch(JSON.stringify(generated.suggestions), /1980/);
  assert.match(JSON.stringify(generated.suggestions), /Private helseopplysninger/);
});

const freddyFixturePath = process.env.FREDDY_MASTER_PROFILE_FIXTURE || "/Users/freddyogannabremseth/Downloads/FREDDY_MASTER_PROFILE.md";

test("local Freddy master profile fixture imports as reviewable user data when available", { skip: !existsSync(freddyFixturePath) }, () => {
  const text = readFileSync(freddyFixturePath, "utf8");
  const imported = extractKnowledgeItemsFromText({
    text,
    source: {
      ...source,
      sourceName: "Freddy master profile local fixture",
      filename: "FREDDY_MASTER_PROFILE.md",
    },
    maxItems: 220,
  });

  assert.ok(imported.length > 40);
  assert.ok(imported.every((item) => item.verificationStatus === "needs_review"));
  assert.ok(imported.every((item) => item.sourceName === "Freddy master profile local fixture"));
  assert.ok(imported.some((item) => item.category === "restriction"));
  assert.ok(imported.some((item) => item.sensitive));

  const approved = imported.map((item, index) => ({
    ...item,
    id: `freddy-${index}`,
    verificationStatus: item.category === "restriction" || (!item.sensitive && ["role", "service", "expertise", "market", "audience", "positioning", "location"].includes(item.category))
      ? "user_confirmed" as const
      : item.verificationStatus,
    publicUseAllowed: !item.sensitive && item.category !== "restriction" && ["role", "service", "expertise", "market", "audience", "positioning", "location"].includes(item.category),
  }));

  const relevant = selectRelevantKnowledgeForProfile({
    items: approved,
    sources: [{ id: source.id, status: "active", aiUseAllowed: true, publicUseAllowed: false }],
    variant: {
      name: "LinkedIn eiendom og AI",
      profileType: "linkedin",
      primaryPlatform: "linkedin",
      audienceName: "Skandinaviske boligkjøpere",
      audienceDescription: "Kjøpere og investorer i Spania",
      goalName: "Bygge tillit",
      goalDescription: "Profesjonell profil for eiendom, rådgivning og AI",
      tone: ["professional", "warm", "grounded"],
      focusTags: ["real_estate", "ai_crm", "consultant"],
      instructions: "Ikke bruk private eller sensitive opplysninger.",
    },
  });
  const generated = generateProfileSuggestionsFromKnowledge({
    relevant,
    variant: {
      name: "LinkedIn eiendom og AI",
      profileType: "linkedin",
      primaryPlatform: "linkedin",
      tone: ["professional"],
      focusTags: ["real_estate", "ai_crm"],
    },
    currentProfile: null,
  });

  assert.ok(relevant.length >= 10);
  assert.ok(generated.suggestions.some((suggestion) => suggestion.fieldKey === "headline"));
  assert.ok(generated.suggestions.every((suggestion) => suggestion.sourceKnowledgeIds.length > 0));
  assert.doesNotMatch(JSON.stringify(generated.suggestions), /Fødselsår|fødselsår|\b19\d{2}\b/);
});
