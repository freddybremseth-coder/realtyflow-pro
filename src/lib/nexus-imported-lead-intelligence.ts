export interface ImportedLeadLike {
  type?: string | null;
  property_interest?: string | null;
  notes?: string | null;
  preferences?: {
    property_type?: string | null;
    location?: string | null;
    features?: unknown;
    other?: unknown;
  } | null;
}

export interface ImportedLifestyleCandidate {
  key: string;
  value: boolean | string;
  strength: "strong_preference" | "nice_to_have";
  evidence: "form_explicit";
  confidence: number;
  sourceText: string;
  customerConfirmed: boolean;
}

export interface ImportedPersonaCandidate {
  id: "retiree" | "family" | "investor" | "holiday_home" | "permanent_resident" | "nature_seeker" | "coastal_social";
  confidence: number;
  evidence: string[];
}

function textFromLead(lead: ImportedLeadLike) {
  const features = Array.isArray(lead.preferences?.features) ? lead.preferences?.features : [];
  const other = Array.isArray(lead.preferences?.other) ? lead.preferences?.other : [];
  return [
    lead.type,
    lead.property_interest,
    lead.notes,
    lead.preferences?.property_type,
    lead.preferences?.location,
    ...features,
    ...other,
  ]
    .filter(Boolean)
    .map(String)
    .join(" | ")
    .toLowerCase();
}

function candidate(
  key: string,
  text: string,
  matcher: RegExp,
  strength: ImportedLifestyleCandidate["strength"] = "strong_preference",
): ImportedLifestyleCandidate | null {
  const match = text.match(matcher);
  if (!match) return null;
  return {
    key,
    value: true,
    strength,
    evidence: "form_explicit",
    confidence: 0.92,
    sourceText: match[0],
    customerConfirmed: true,
  };
}

export function buildImportedLeadIntelligence(lead: ImportedLeadLike) {
  const text = textFromLead(lead);
  const lifestyleCandidates = [
    candidate("lifestyle:beach", text, /\b(strand|beach|playa|sjøen|sea)\b/i),
    candidate("lifestyle:restaurants_cafes", text, /\b(restauranter?|restaurant|kaf[eé]|cafe|cafés?|uteliv)\b/i),
    candidate("lifestyle:hiking_nature", text, /\b(tur(?:er)?|fjell|natur|hiking|walking trails?|senderismo)\b/i),
    candidate("environment:quiet", text, /\b(rolig|stille|fredelig|quiet|tranquil|tranquilo)\b/i),
    candidate("environment:lively", text, /\b(livlig|mye liv|vibrant|lively|nightlife|natteliv)\b/i),
    candidate("environment:local_spanish", text, /\b(spansk miljø|lokalt miljø|spanish environment|local spanish|autentisk spansk)\b/i),
    candidate("social:scandinavian", text, /\b(skandinavisk|scandinavian|norsk miljø|nordmenn|svensk miljø|dansker)\b/i),
    candidate("social:international_mix", text, /\b(internasjonalt miljø|international community|expat|multikulturelt)\b/i),
    candidate("mobility:walkable", text, /\b(gangavstand|gå til|walkable|walking distance|til fots)\b/i),
    candidate("mobility:flat_terrain", text, /\b(flatt terreng|flat terrain|uten bakker|no hills)\b/i),
    candidate("mobility:car_ok", text, /\b(bil ok|bil er greit|car is fine|car ok|har bil)\b/i, "nice_to_have"),
    candidate("daily_life:beach_walkability", text, /\b(gangavstand til (?:strand|sjø)|walk(?:ing)? distance to (?:beach|sea))\b/i),
    candidate("daily_life:restaurants_walkability", text, /\b(gangavstand til restauranter?|walk(?:ing)? distance to restaurants?)\b/i),
    candidate("residence:permanent", text, /\b(fastboende|fast bopel|permanent residence|helårsbolig)\b/i),
    candidate("residence:holiday_home", text, /\b(feriebolig|holiday home|vacation home)\b/i),
    candidate("residence:rental_use", text, /\b(utleie|rental|investering for utleie|airbnb)\b/i),
  ].filter((item): item is ImportedLifestyleCandidate => Boolean(item));

  const personaCandidates: ImportedPersonaCandidate[] = [];
  const addPersona = (id: ImportedPersonaCandidate["id"], matcher: RegExp, confidence = 0.9) => {
    const matches = [...text.matchAll(new RegExp(matcher.source, matcher.flags.includes("g") ? matcher.flags : `${matcher.flags}g`))];
    if (!matches.length) return;
    personaCandidates.push({ id, confidence, evidence: [...new Set(matches.map((match) => match[0]))].slice(0, 4) });
  };

  addPersona("retiree", /\b(pensjonist|retired|retiree|jubilado)\b/i);
  addPersona("family", /\b(familie|barn|children|kids|family)\b/i);
  addPersona("investor", /\b(investor|investering|investment|yield|utleie|rental)\b/i);
  addPersona("holiday_home", /\b(feriebolig|holiday home|vacation home)\b/i);
  addPersona("permanent_resident", /\b(fastboende|fast bopel|permanent residence|helårsbolig)\b/i);
  addPersona("nature_seeker", /\b(tur(?:er)?|fjell|natur|hiking|senderismo|rolig|quiet)\b/i, 0.82);
  addPersona("coastal_social", /\b(strand|beach|playa|restaurant|kaf[eé]|uteliv)\b/i, 0.82);

  return {
    lifestyleCandidates,
    personaCandidates,
    factsOnly: true,
    persistenceRecommended: false,
    note: "Candidates are derived from explicit form/import text. Review before persisting to a versioned Buyer Profile.",
  };
}
