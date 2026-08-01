import {
  KNOWLEDGE_CATEGORIES,
  PROFILE_VARIANT_TYPES,
  type BrandProfileInput,
  type KnowledgeCategory,
  type KnowledgeSourceType,
  type KnowledgeVerificationStatus,
  type KnowledgeVisibility,
  type ProfileFactType,
  type ProfileVariantType,
} from "./contracts";

export interface KnowledgeSourceContext {
  id?: string;
  sourceType: KnowledgeSourceType;
  sourceName: string;
  filename?: string | null;
  contentHash: string;
  visibility: KnowledgeVisibility;
  aiUseAllowed: boolean;
  publicUseAllowed: boolean;
}

export interface KnowledgeItemLike {
  id?: string;
  sourceId?: string | null;
  sourceType: KnowledgeSourceType;
  sourceName: string;
  sourceRef: string | null;
  sourceExcerpt: string | null;
  category: KnowledgeCategory;
  subcategory: string | null;
  title: string;
  content: string;
  summary: string | null;
  structuredData: Record<string, unknown>;
  tags: string[];
  visibility: KnowledgeVisibility;
  verificationStatus: KnowledgeVerificationStatus;
  confidence: number;
  relevanceScore: number;
  publicUseAllowed: boolean;
  sensitive: boolean;
  allowedProfileTypes: ProfileVariantType[];
  platforms: string[];
  factType: ProfileFactType;
  possibleDuplicateOf: string | null;
  conflictGroup: string | null;
  conflictReason: string | null;
  reviewNotes: string | null;
}

export interface ProfileVariantLike {
  id?: string;
  name: string;
  profileType: ProfileVariantType;
  primaryPlatform: string;
  goalName?: string | null;
  goalDescription?: string | null;
  audienceName?: string | null;
  audienceDescription?: string | null;
  tone: string[];
  focusTags: string[];
  instructions?: string | null;
}

export interface KnowledgeSourceLike {
  id: string;
  status: string;
  aiUseAllowed: boolean;
  publicUseAllowed: boolean;
}

export interface RelevantKnowledgeItem {
  item: KnowledgeItemLike;
  score: number;
  reasons: string[];
}

export interface ProfileSuggestionDraft {
  fieldKey: string;
  label: string;
  suggestedValue: unknown;
  currentValue: unknown;
  rationale: string;
  confidence: number;
  sourceKnowledgeIds: string[];
  safetyWarnings: string[];
}

const categorySet = new Set<string>(KNOWLEDGE_CATEGORIES);
const variantSet = new Set<string>(PROFILE_VARIANT_TYPES);

function stripMarkdown(value: string) {
  return value
    .replace(/`{1,3}/g, "")
    .replace(/\*\*/g, "")
    .replace(/__+/g, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(value: string, max = 1_200) {
  const text = stripMarkdown(value);
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function normalizeKey(value: string) {
  return stripMarkdown(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9æøå]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAny(value: string, patterns: Array<string | RegExp>) {
  return patterns.some((pattern) =>
    typeof pattern === "string" ? value.includes(pattern) : pattern.test(value),
  );
}

function unique(values: string[], max = 16) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, max);
}

function classifyKnowledge(title: string, content: string, headingPath: string[]): {
  category: KnowledgeCategory;
  subcategory: string | null;
  tags: string[];
  sensitive: boolean;
  factType: ProfileFactType;
  allowedProfileTypes: ProfileVariantType[];
  confidence: number;
} {
  const joined = normalizeKey([headingPath.join(" "), title, content].join(" "));
  let category: KnowledgeCategory = "other";
  let subcategory: string | null = null;
  const tags: string[] = [];
  let confidence = 0.58;

  if (hasAny(joined, ["skal ikke", "bør ikke", "unngå", "ikke brukes offentlig", "sensitiv", "privat", "offentlig bruk", "begrensning", "permission", "tillatelse"])) {
    category = "restriction";
    confidence = 0.84;
  } else if (hasAny(joined, ["fullt navn", "navn", "fødselsår", "fodselsar", "bosted", "nasjonalitet", "språk", "sprak", "nettside", "profilidentitet"])) {
    category = "identity";
    confidence = 0.76;
  } else if (hasAny(joined, ["tittel", "rolle", "overordnet profesjonell identitet", "posisjonering", "profesjonell identitet"])) {
    category = "role";
    confidence = 0.76;
  } else if (hasAny(joined, ["selskap", "brand", "merkevare", "virksomhet", "realtyflow", "chatgenius", "nordic sales", "soleada", "zen eco"])) {
    category = "company";
    confidence = 0.78;
  } else if (hasAny(joined, ["tjeneste", "rådgivning", "radgivning", "behovsanalyse", "salg", "markedsføring", "markedsforing", "crm", "ai", "digital", "system", "kurs"])) {
    category = "service";
    confidence = 0.72;
  } else if (hasAny(joined, ["kompetanse", "ekspertise", "erfaring", "bakgrunn", "ferdighet", "skill"])) {
    category = hasAny(joined, ["30 år", "30 ar", "års erfaring", "ars erfaring"]) ? "experience" : "expertise";
    confidence = 0.74;
  } else if (hasAny(joined, ["målgruppe", "malgruppe", "kundetype", "boligkjøpere", "boligkjopere", "investorer", "samarbeidspartnere"])) {
    category = "audience";
    confidence = 0.8;
  } else if (hasAny(joined, ["marked", "costa blanca", "spania", "norge", "internasjonal", "benidorm", "finestrat", "altea", "albir", "pinoso", "alicante"])) {
    category = hasAny(joined, ["benidorm", "alicante", "bosted", "lokasjon"]) ? "location" : "market";
    confidence = 0.76;
  } else if (hasAny(joined, ["bok", "forfatter", "publisering", "kdp", "manus", "forlag"])) {
    category = "publication";
    confidence = 0.75;
  } else if (hasAny(joined, ["foredrag", "speaker", "scene", "workshop", "seminar"])) {
    category = "speaking";
    confidence = 0.72;
  } else if (hasAny(joined, ["kurs", "opplæring", "opplaering", "masterclass", "undervisning"])) {
    category = "course";
    confidence = 0.72;
  } else if (hasAny(joined, ["verdi", "verdier", "prinsipp", "tone", "stemme", "ærlig", "aerlig", "tydelig"])) {
    category = "value";
    confidence = 0.68;
  } else if (hasAny(joined, ["oppnådd", "oppnadd", "resultat", "achievement", "milepæl", "milepael"])) {
    category = "achievement";
    confidence = 0.68;
  }

  if (hasAny(joined, ["posisjonering", "headline", "bio", "profilvariant", "forslag", "mulig"])) {
    tags.push("positioning");
    if (category === "role" || category === "other") category = "positioning";
  }
  if (hasAny(joined, ["eiendom", "bolig", "nybygg", "resale", "costa blanca", "spania"])) tags.push("real_estate");
  if (hasAny(joined, ["ai", "crm", "digital", "system", "automatisering"])) tags.push("ai_crm");
  if (hasAny(joined, ["forfatter", "bok", "publisering", "kdp"])) tags.push("author");
  if (hasAny(joined, ["foredrag", "kurs", "workshop", "seminar"])) tags.push("speaker");
  if (hasAny(joined, ["salg", "markedsføring", "business", "vekst", "rådgivning", "radgivning"])) tags.push("consultant");

  const sensitive = hasAny(joined, [
    "fødselsår",
    "fodselsar",
    "fødselsdato",
    "fodselsdato",
    "privat",
    "familie",
    "barn",
    "helse",
    "medisinsk",
    "gravid",
    "gjeld",
    "kreditt",
    "konkurs",
    "juridisk",
    "rettssak",
    "konflikt",
    "klientinformasjon",
    "kommisjon",
    "provisjon",
    "eierandel",
    "avtaledetaljer",
    "nav ",
    "stønad",
    "stonad",
    "personnummer",
    "bank",
  ]);

  const factType: ProfileFactType =
    category === "restriction"
      ? "restriction"
      : tags.includes("positioning")
        ? "positioning_suggestion"
        : "document_derived";

  const allowedProfileTypes = unique(tags.filter((tag) => variantSet.has(tag))).map((tag) => tag as ProfileVariantType);
  if (!allowedProfileTypes.length && category !== "restriction") allowedProfileTypes.push("general");

  if (categorySet.has(category)) {
    subcategory = tags[0] || null;
  }

  return {
    category,
    subcategory,
    tags: unique(tags),
    sensitive,
    factType,
    allowedProfileTypes,
    confidence,
  };
}

interface ParsedBlock {
  title: string;
  content: string;
  sourceRef: string;
  headingPath: string[];
}

function parseBlocks(text: string) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const headings: string[] = [];
  const blocks: ParsedBlock[] = [];
  let paragraph: string[] = [];
  let paragraphStart = 1;

  const flushParagraph = (lineNumber: number) => {
    const content = paragraph.join("\n").trim();
    paragraph = [];
    if (!content || content === "---") return;
    const cleanHeading = headings[headings.length - 1] || "Notat";
    blocks.push({
      title: cleanHeading,
      content,
      sourceRef: `linje ${paragraphStart}-${Math.max(paragraphStart, lineNumber - 1)}`,
      headingPath: [...headings],
    });
  };

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const headingMatch = /^(#{1,5})\s+(.+?)\s*$/.exec(line);
    if (headingMatch) {
      flushParagraph(lineNumber);
      const level = headingMatch[1].length;
      headings.splice(level - 1);
      headings[level - 1] = stripMarkdown(headingMatch[2]);
      return;
    }

    const bulletMatch = /^\s*(?:[-*]|\d+\.)\s+(.+?)\s*$/.exec(line);
    if (bulletMatch) {
      flushParagraph(lineNumber);
      const raw = bulletMatch[1].trim();
      const labelMatch = /^(?:\*\*)?([^:*]{2,90})(?:\*\*)?:\s*(.+)$/u.exec(raw);
      blocks.push({
        title: stripMarkdown(labelMatch?.[1] || headings[headings.length - 1] || "Kunnskapselement"),
        content: stripMarkdown(labelMatch?.[2] || raw),
        sourceRef: `linje ${lineNumber}`,
        headingPath: [...headings],
      });
      return;
    }

    if (!line.trim()) {
      flushParagraph(lineNumber);
      return;
    }

    if (!paragraph.length) paragraphStart = lineNumber;
    paragraph.push(line);
  });

  flushParagraph(lines.length + 1);
  return blocks;
}

export function extractKnowledgeItemsFromText(input: {
  text: string;
  source: KnowledgeSourceContext;
  maxItems?: number;
}): KnowledgeItemLike[] {
  const blocks = parseBlocks(input.text);
  const seen = new Set<string>();
  const items: KnowledgeItemLike[] = [];

  for (const block of blocks) {
    const content = compact(block.content, 4_000);
    const title = compact(block.title, 180);
    if (content.length < 3 && title.length < 8) continue;

    const key = normalizeKey(`${title}:${content}`);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const classified = classifyKnowledge(title, content, block.headingPath);
    const sourceExcerpt = compact(content, 500);

    items.push({
      sourceId: input.source.id || null,
      sourceType: input.source.sourceType,
      sourceName: input.source.sourceName,
      sourceRef: block.sourceRef,
      sourceExcerpt,
      category: classified.category,
      subcategory: classified.subcategory,
      title,
      content,
      summary: compact(content, 320),
      structuredData: {
        headingPath: block.headingPath,
        filename: input.source.filename || null,
        contentHash: input.source.contentHash,
      },
      tags: classified.tags,
      visibility: classified.sensitive ? "private" : input.source.visibility,
      verificationStatus: "needs_review",
      confidence: classified.confidence,
      relevanceScore: 0,
      publicUseAllowed: Boolean(input.source.publicUseAllowed && !classified.sensitive && classified.category !== "restriction"),
      sensitive: classified.sensitive,
      allowedProfileTypes: classified.allowedProfileTypes,
      platforms: ["linkedin"],
      factType: classified.factType,
      possibleDuplicateOf: null,
      conflictGroup: null,
      conflictReason: null,
      reviewNotes: null,
    });

    if (items.length >= (input.maxItems || 180)) break;
  }

  return annotateDuplicatesAndConflicts(items, []);
}

export function annotateDuplicatesAndConflicts(
  incoming: KnowledgeItemLike[],
  existing: KnowledgeItemLike[],
) {
  const existingByContent = new Map<string, KnowledgeItemLike>();
  const existingByClaim = new Map<string, KnowledgeItemLike[]>();

  for (const item of existing) {
    existingByContent.set(normalizeKey(`${item.category}:${item.content}`), item);
    const claimKey = normalizeKey(`${item.category}:${item.title}`);
    const list = existingByClaim.get(claimKey) || [];
    list.push(item);
    existingByClaim.set(claimKey, list);
  }

  const incomingByClaim = new Map<string, KnowledgeItemLike[]>();

  return incoming.map((item) => {
    const contentKey = normalizeKey(`${item.category}:${item.content}`);
    const claimKey = normalizeKey(`${item.category}:${item.title}`);
    const duplicate = existingByContent.get(contentKey);
    const conflicts = [
      ...(existingByClaim.get(claimKey) || []),
      ...(incomingByClaim.get(claimKey) || []),
    ].filter((candidate) => normalizeKey(candidate.content) !== normalizeKey(item.content));

    const updated: KnowledgeItemLike = {
      ...item,
      possibleDuplicateOf: duplicate?.id || item.possibleDuplicateOf || null,
      conflictGroup: conflicts.length ? `claim:${claimKey}` : item.conflictGroup,
      conflictReason: conflicts.length ? "Samme kategori og tittel finnes med annet innhold." : item.conflictReason,
      reviewNotes: duplicate
        ? `Mulig duplikat av et eksisterende kunnskapselement${duplicate.id ? ` (${duplicate.id})` : ""}.`
        : conflicts.length
          ? "Mulig konflikt: kontroller hvilket innhold som er korrekt før bruk."
          : item.reviewNotes,
    };

    const claimList = incomingByClaim.get(claimKey) || [];
    claimList.push(updated);
    incomingByClaim.set(claimKey, claimList);
    return updated;
  });
}

function wordsFrom(value: string | null | undefined) {
  return normalizeKey(value || "")
    .split(" ")
    .filter((word) => word.length > 2);
}

export function selectRelevantKnowledgeForProfile(input: {
  items: KnowledgeItemLike[];
  sources: KnowledgeSourceLike[];
  variant: ProfileVariantLike;
  limit?: number;
}) {
  const activeSources = new Map(input.sources.map((source) => [source.id, source]));
  const variantWords = [
    ...wordsFrom(input.variant.name),
    ...wordsFrom(input.variant.profileType),
    ...wordsFrom(input.variant.goalName),
    ...wordsFrom(input.variant.goalDescription),
    ...wordsFrom(input.variant.audienceName),
    ...wordsFrom(input.variant.audienceDescription),
    ...input.variant.focusTags.flatMap(wordsFrom),
    ...input.variant.tone.flatMap(wordsFrom),
    ...wordsFrom(input.variant.instructions),
  ];
  const variantWordSet = new Set(variantWords);

  const relevant: RelevantKnowledgeItem[] = [];
  for (const item of input.items) {
    const source = item.sourceId ? activeSources.get(item.sourceId) : null;
    if (source && (source.status !== "active" || !source.aiUseAllowed)) continue;
    if (!["user_confirmed", "document_verified"].includes(item.verificationStatus)) continue;
    if (["rejected", "deleted", "outdated", "conflict"].includes(item.verificationStatus)) continue;
    if (item.conflictGroup && item.verificationStatus !== "document_verified") continue;

    const isControlItem = item.category === "restriction";
    if (!isControlItem && (!item.publicUseAllowed || item.sensitive)) continue;

    let score = 35;
    const reasons: string[] = [];

    if (item.allowedProfileTypes.includes(input.variant.profileType)) {
      score += 22;
      reasons.push("matcher profilvariant");
    }
    if (item.allowedProfileTypes.includes("general")) score += 6;
    if (item.platforms.includes(input.variant.primaryPlatform)) {
      score += 8;
      reasons.push("matcher plattform");
    }
    if (["role", "positioning", "service", "expertise", "audience", "market", "location", "experience"].includes(item.category)) score += 10;
    if (isControlItem) score += 18;

    const itemWords = new Set([
      ...wordsFrom(item.title),
      ...wordsFrom(item.content),
      ...item.tags.flatMap(wordsFrom),
      ...wordsFrom(item.subcategory),
    ]);
    const overlap = Array.from(variantWordSet).filter((word) => itemWords.has(word)).length;
    if (overlap) {
      score += Math.min(24, overlap * 4);
      reasons.push("matcher mål, målgruppe eller fokus");
    }
    if (item.factType === "positioning_suggestion") score += 5;
    if (item.verificationStatus === "document_verified") score += 7;

    relevant.push({
      item,
      score: Math.min(100, score),
      reasons: reasons.length ? reasons : ["relevant godkjent fakta"],
    });
  }

  return relevant.sort((a, b) => b.score - a.score).slice(0, input.limit || 50);
}

function extractValue(item: KnowledgeItemLike) {
  const content = stripMarkdown(item.content);
  const labelPattern = new RegExp(`^${item.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:?\\s*`, "i");
  return compact(content.replace(labelPattern, ""), 700);
}

function splitFactList(items: KnowledgeItemLike[], max = 8) {
  const values: string[] = [];
  for (const item of items) {
    const value = extractValue(item);
    const parts = value
      .split(/\n|;|,(?=\s+[A-ZÆØÅa-zæøå])/)
      .map((part) => stripMarkdown(part))
      .filter((part) => part.length >= 3 && part.length <= 140);
    values.push(...(parts.length > 1 ? parts : [value]));
  }
  return unique(values, max);
}

function byCategory(relevant: RelevantKnowledgeItem[], categories: KnowledgeCategory[]) {
  return relevant.filter(({ item }) => categories.includes(item.category)).map(({ item }) => item);
}

function sourceIds(items: KnowledgeItemLike[]) {
  return unique(items.map((item) => item.id || "").filter(Boolean), 20);
}

function addSuggestion(
  suggestions: ProfileSuggestionDraft[],
  params: {
    fieldKey: string;
    label: string;
    suggestedValue: unknown;
    currentValue: unknown;
    rationale: string;
    items: KnowledgeItemLike[];
    confidence?: number;
    warnings?: string[];
  },
) {
  if (
    params.suggestedValue === null ||
    params.suggestedValue === undefined ||
    (typeof params.suggestedValue === "string" && !params.suggestedValue.trim()) ||
    (Array.isArray(params.suggestedValue) && params.suggestedValue.length === 0)
  ) {
    return;
  }

  suggestions.push({
    fieldKey: params.fieldKey,
    label: params.label,
    suggestedValue: params.suggestedValue,
    currentValue: params.currentValue,
    rationale: params.rationale,
    confidence: params.confidence ?? 0.76,
    sourceKnowledgeIds: sourceIds(params.items),
    safetyWarnings: params.warnings || [],
  });
}

export function generateProfileSuggestionsFromKnowledge(input: {
  relevant: RelevantKnowledgeItem[];
  variant: ProfileVariantLike;
  currentProfile: BrandProfileInput | null;
}) {
  const suggestions: ProfileSuggestionDraft[] = [];
  const current = input.currentProfile;
  const identity = byCategory(input.relevant, ["identity"]);
  const roles = byCategory(input.relevant, ["role", "positioning"]);
  const services = byCategory(input.relevant, ["service"]);
  const expertise = byCategory(input.relevant, ["expertise", "skill", "experience"]);
  const markets = byCategory(input.relevant, ["market", "location"]);
  const audiences = byCategory(input.relevant, ["audience"]);
  const companies = byCategory(input.relevant, ["company"]);
  const publications = byCategory(input.relevant, ["publication", "speaking", "course"]);
  const restrictions = byCategory(input.relevant, ["restriction"]);

  const publicItems = input.relevant.filter(({ item }) => item.category !== "restriction").map(({ item }) => item);
  const lowCoverageWarning = publicItems.length < 4
    ? ["Få godkjente offentlige fakta er tilgjengelig for denne varianten."]
    : [];
  const sensitiveOmittedWarning = input.relevant.some(({ item }) => item.sensitive)
    ? ["Sensitive opplysninger er utelatt fra offentlig profiltekst."]
    : [];

  const roleText = splitFactList(roles, 3)[0] || current?.currentPosition || "";
  const companyText = splitFactList(companies, 2)[0] || current?.companyName || "";
  const marketList = unique([...splitFactList(markets, 8), ...(current?.markets || []), ...(current?.geographicAreas || [])], 10);
  const serviceList = unique([...splitFactList(services, 8), ...(current?.services || [])], 10);
  const expertiseList = unique([...splitFactList(expertise, 8), ...(current?.expertise || [])], 10);
  const audienceList = unique([...splitFactList(audiences, 6), ...(current?.targetAudiences || [])], 8);
  const restrictionList = splitFactList(restrictions, 10);
  const positioning = splitFactList(roles, 2)[0] || roleText;
  const locationText = splitFactList(markets.filter((item) => item.category === "location"), 2)[0] || current?.location || "";

  const headlineParts = unique([
    roleText || positioning,
    serviceList.find((item) => /eiendom|ai|crm|salg|markeds/i.test(item)) || serviceList[0],
    marketList[0] || locationText,
  ], 3);

  addSuggestion(suggestions, {
    fieldKey: "currentPosition",
    label: "Tittel/posisjon",
    suggestedValue: roleText,
    currentValue: current?.currentPosition || null,
    rationale: "Bygget fra godkjente rolle- og posisjoneringskilder.",
    items: roles,
    warnings: lowCoverageWarning,
  });

  addSuggestion(suggestions, {
    fieldKey: "companyName",
    label: "Selskap/brand",
    suggestedValue: companyText,
    currentValue: current?.companyName || null,
    rationale: "Hentet fra godkjente selskap- og merkevarekilder.",
    items: companies,
  });

  addSuggestion(suggestions, {
    fieldKey: "location",
    label: "Profesjonell lokasjon",
    suggestedValue: locationText,
    currentValue: current?.location || null,
    rationale: "Bruker bare godkjent profesjonell lokasjon.",
    items: markets,
  });

  addSuggestion(suggestions, {
    fieldKey: "headline",
    label: "Profiloverskrift",
    suggestedValue: headlineParts.join(" | "),
    currentValue: null,
    rationale: "Kombinerer rolle, relevant fagområde og marked uten private detaljer.",
    items: [...roles, ...services, ...markets],
    warnings: [...lowCoverageWarning, ...sensitiveOmittedWarning],
  });

  const bioSentences = [
    positioning ? `${positioning}.` : "",
    serviceList.length && audienceList.length
      ? `Hjelper ${audienceList.slice(0, 2).join(" og ")} med ${serviceList.slice(0, 3).join(", ")}.`
      : serviceList.length
        ? `Arbeider med ${serviceList.slice(0, 3).join(", ")}.`
        : "",
    marketList.length ? `Fokusområder: ${marketList.slice(0, 4).join(", ")}.` : "",
  ].filter(Boolean).join(" ");

  addSuggestion(suggestions, {
    fieldKey: "shortBio",
    label: "Kort bio",
    suggestedValue: bioSentences,
    currentValue: null,
    rationale: "Kort offentlig bio basert på bekreftede fakta og valgte målgrupper.",
    items: [...roles, ...services, ...audiences, ...markets],
    warnings: [...lowCoverageWarning, ...sensitiveOmittedWarning],
  });

  const aboutText = [
    positioning || roleText,
    serviceList.length ? `Kjerneområder: ${serviceList.slice(0, 5).join(", ")}.` : "",
    expertiseList.length ? `Kompetanse: ${expertiseList.slice(0, 5).join(", ")}.` : "",
    audienceList.length ? `Målgrupper: ${audienceList.slice(0, 4).join(", ")}.` : "",
    publications.length ? `Tilleggsprofil: ${splitFactList(publications, 3).join(", ")}.` : "",
  ].filter(Boolean).join("\n\n");

  addSuggestion(suggestions, {
    fieldKey: "aboutSection",
    label: "Om-seksjon",
    suggestedValue: aboutText,
    currentValue: null,
    rationale: "Sammensatt fra godkjente fakta, med kildebevis for hver sentrale påstand.",
    items: [...roles, ...services, ...expertise, ...audiences, ...markets, ...publications],
    confidence: publicItems.length >= 8 ? 0.82 : 0.68,
    warnings: [...lowCoverageWarning, ...sensitiveOmittedWarning],
  });

  addSuggestion(suggestions, {
    fieldKey: "services",
    label: "Tjenester",
    suggestedValue: serviceList,
    currentValue: current?.services || [],
    rationale: "Prioritert etter variantens mål, målgruppe og godkjente kilder.",
    items: services,
  });

  addSuggestion(suggestions, {
    fieldKey: "expertise",
    label: "Ekspertise",
    suggestedValue: expertiseList,
    currentValue: current?.expertise || [],
    rationale: "Kun ekspertiseelementer som er godkjent for offentlig bruk tas med.",
    items: expertise,
  });

  addSuggestion(suggestions, {
    fieldKey: "targetAudiences",
    label: "Målgrupper",
    suggestedValue: audienceList,
    currentValue: current?.targetAudiences || [],
    rationale: "Velger målgrupper som matcher profilvarianten.",
    items: audiences,
  });

  addSuggestion(suggestions, {
    fieldKey: "markets",
    label: "Markeder",
    suggestedValue: marketList,
    currentValue: current?.markets || [],
    rationale: "Marked og geografi er hentet fra godkjente kilder.",
    items: markets,
  });

  addSuggestion(suggestions, {
    fieldKey: "contentThemes",
    label: "Innholdstemaer",
    suggestedValue: unique([
      ...serviceList.slice(0, 4),
      ...expertiseList.slice(0, 4),
      ...marketList.slice(0, 3),
    ], 10),
    currentValue: null,
    rationale: "Temaene er valgt for å støtte profilens mål og målgruppe.",
    items: [...services, ...expertise, ...markets],
  });

  addSuggestion(suggestions, {
    fieldKey: "excludedTopics",
    label: "Temaer som holdes utenfor offentlig profiltekst",
    suggestedValue: restrictionList,
    currentValue: current?.excludedTopics || [],
    rationale: "Kontrollfelt basert på godkjente begrensninger og personvernregler.",
    items: restrictions,
    confidence: 0.9,
  });

  const sourceCoverage = {
    selectedKnowledgeItems: input.relevant.length,
    publicFactItems: publicItems.length,
    controlItems: restrictions.length,
    categories: unique(input.relevant.map(({ item }) => item.category), 24),
    model: "deterministic-profile-builder-v1",
  };

  return {
    suggestions,
    sourceCoverage,
  };
}
