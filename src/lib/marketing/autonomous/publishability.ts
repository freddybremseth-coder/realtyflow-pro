/**
 * Phase 7.1F — Publishability Gate. Blokkerer at intern agent-/workflow-tekst,
 * placeholders eller tomt innhold noen gang blir en kundevendt post.
 *
 * Bakgrunn: en intern tekst («Jeg setter opp Marketing Agent til å generere denne
 * selgende SoMe-posten …») ble publisert på Instagram. Denne porten kjøres på ALT
 * innhold (AI-generert, Content Hub, Ad Builder, derived) FØR approval, og igjen i
 * executor rett før Meta-call. Ikke bare blacklist — også strukturelle signaler om
 * at teksten beskriver ARBEIDSPROSESSEN i stedet for å være selve innholdet.
 */

export const PUBLISHABILITY_RESULTS = [
  "PUBLISHABLE",
  "NOT_PUBLISHABLE_EMPTY",
  "NOT_PUBLISHABLE_PLACEHOLDER",
  "NOT_PUBLISHABLE_META_TEXT",
  "NOT_PUBLISHABLE_INTERNAL_INSTRUCTION",
] as const;
export type PublishabilityResult = (typeof PUBLISHABILITY_RESULTS)[number];

export interface PublishabilityCheck {
  result: PublishabilityResult;
  publishable: boolean;
  reason: string;
  matched?: string;
}

/** Ord/uttrykk som avslører at teksten handler om selve produksjonsapparatet. */
const META_MARKERS = [
  "marketing agent", "marketing director", "content generator", "content-generator",
  "some-post", "some post", "social media agent", "ai-agent", "ai agent",
  "prompt", "workflow", "orchestrator", "language model", "llm",
  "generere denne", "generere en post", "lage denne posten", "selgende some",
  "as an ai", "as a language model", "i am an ai", "jeg er en ai",
];

/** Første-person prosess-/instruksjonsåpninger (jeg gjør X / here is Y). */
const INTERNAL_OPENERS: RegExp[] = [
  /^\s*jeg\s+(setter\s+opp|skal\s+(generere|lage|skrive|sette)|genererer|lager|har\s+(laget|generert|forberedt|satt))/i,
  /^\s*(la\s+meg|nå\s+skal\s+jeg)\b/i,
  /^\s*(i\s+(will|'ll|am\s+going\s+to|have)\s+(create|generate|prepare|make|written|set))/i,
  /^\s*(let\s+me\s+(generate|create|write|prepare))/i,
  /^\s*(here\s+is|here's)\b.*(post|caption|content|instagram|copy)/i,
  /^\s*(sure|certainly|of\s+course)[,!.]/i,
  /^\s*(as\s+requested|as\s+an\s+ai|as\s+a\s+language\s+model)\b/i,
];

/** Placeholder-/utfyllingsmarkører. */
const PLACEHOLDER_MARKERS = ["lorem ipsum", "todo", "tbd", "placeholder", "insert ", "xxxx", "{{", "}}"];

export function contentPublishabilityGate(text: string | null | undefined): PublishabilityCheck {
  const raw = (text ?? "").trim();
  if (raw.length === 0) return { result: "NOT_PUBLISHABLE_EMPTY", publishable: false, reason: "Tom tekst." };
  const lower = raw.toLowerCase();

  // Placeholder / ufullstendig.
  const ph = PLACEHOLDER_MARKERS.find((p) => lower.includes(p));
  if (ph) return { result: "NOT_PUBLISHABLE_PLACEHOLDER", publishable: false, reason: `Placeholder-tekst («${ph}»).`, matched: ph };
  if (/^\s*[\[<]/.test(raw)) return { result: "NOT_PUBLISHABLE_PLACEHOLDER", publishable: false, reason: "Ser ut som template/placeholder." };

  // Meta-tekst om selve apparatet.
  const meta = META_MARKERS.find((m) => lower.includes(m));
  if (meta) return { result: "NOT_PUBLISHABLE_META_TEXT", publishable: false, reason: `Intern/meta-tekst om produksjonsapparatet («${meta}»).`, matched: meta };

  // Strukturell: teksten beskriver arbeidsprosessen i stedet for innholdet.
  const opener = INTERNAL_OPENERS.find((re) => re.test(raw));
  if (opener) return { result: "NOT_PUBLISHABLE_INTERNAL_INSTRUCTION", publishable: false, reason: "Teksten beskriver arbeidsprosessen (intern instruksjon), ikke kundevendt innhold.", matched: opener.source };

  return { result: "PUBLISHABLE", publishable: true, reason: "OK." };
}
