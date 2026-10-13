/**
 * Editorial guardrails shared by SoMe Studio generation and human review.
 * The source title/brief defines ONE subject for each post; concept style only
 * changes the presentation, never the subject or the call to action.
 */
export type SocialEditorialTheme = "costs" | "customer_case" | "area" | "property" | "guide" | "general";

export type SocialEditorialFocus = {
  theme: SocialEditorialTheme;
  label: string;
  recommendedCta: string;
};

const COSTS = /\b(kjøpskostnad\w*|omkostning\w*|kostnad\w*|avgift\w*|skatt\w*|mva|iva|itp|ajd|notar\w*|dokumentavgift\w*|finansiering\w*|boliglån\w*|budsjett\w*)\b/i;
const CASE = /\b(kundecase|kundehistorie|kundeerfaring|familien\s+[\p{L}][\p{L}'’-]+|kundereise)\b/iu;
const AREA = /\b(område\w*|livsstil|nabolag|strand\w*|bydel|hverdagsliv|lokalliv)\b/i;
const WRONG_COMPANION_QUESTION = /\b(?:Hvem (?:ville|vil|ønsker|kunne) du (?:ta|tatt|ha|hatt) med(?: deg)?(?: (?:hit|til Spania|på tur|dit))?|Hvem vil du dele (?:livet|opplevelsen) med(?: i Spania)?)\s*[?!.]?/gim;

export function socialEditorialFocus(input: {
  sourceType: string;
  sourceTitle: string;
  brief?: string;
  socialCategory?: string;
}): SocialEditorialFocus {
  const title = input.sourceTitle.trim();
  const brief = (input.brief || "").trim();
  // A specific source headline outranks a looser user brief and long source text.
  const source = title || brief;
  const firstCost = source.search(COSTS);
  const firstCase = source.search(CASE);
  const theme: SocialEditorialTheme =
    firstCase >= 0 && (firstCost < 0 || firstCase < firstCost) ? "customer_case"
    : firstCost >= 0 ? "costs"
    : input.sourceType === "area" || AREA.test(source) && input.socialCategory === "area_lifestyle" ? "area"
    : input.sourceType === "property" ? "property"
    : input.sourceType === "article" ? "guide"
    : input.socialCategory === "area_lifestyle" ? "area"
    : "general";
  switch (theme) {
    case "costs":
      return { theme, label: "Kjøpskostnader og konkrete råd", recommendedCta: "Lagre denne oversikten til du skal sette opp boligbudsjettet ditt." };
    case "customer_case":
      return { theme, label: "Én dokumentert kundehistorie", recommendedCta: "Hvilket spørsmål ville du stilt før du startet din egen kjøpsprosess?" };
    case "area":
      return { theme, label: "Område og hverdagsliv", recommendedCta: "Hvem ville du tatt med deg hit?" };
    case "property":
      return { theme, label: "Denne konkrete boligen", recommendedCta: "Vil du vite om denne boligen passer dine behov? Send oss en melding." };
    case "guide":
      return { theme, label: "Ett faglig råd fra guiden", recommendedCta: "Lagre guiden hvis du vil bruke rådene senere." };
    default:
      return { theme, label: "Ett tydelig hovedpoeng", recommendedCta: "Lagre dette hvis det er relevant for boligplanene dine." };
  }
}

export function removeUnrelatedCompanionQuestion(text: string, focus: SocialEditorialFocus): string {
  if (focus.theme === "area") return text.trim();
  return text
    .replace(WRONG_COMPANION_QUESTION, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function socialCopyReview(text: string, focus: SocialEditorialFocus): string[] {
  const issues: string[] = [];
  const copy = text.trim();
  const words = copy.split(/\s+/).filter(Boolean).length;
  if (words < 35) issues.push("Captionen er kort. Utdyp med et konkret, dokumentert poeng fra kilden.");
  if (focus.theme !== "area" && /\bHvem (?:ville|vil|ønsker|kunne) du (?:ta|tatt|ha|hatt) med\b/i.test(copy)) {
    issues.push("Engasjementsspørsmålet passer til område/livsstil, ikke dette temaet.");
  }
  if (focus.theme === "costs" && CASE.test(copy)) {
    issues.push("Kostnadsinnlegget nevner også en kundehistorie. Vurder å lage et eget innlegg om kunden.");
  }
  if (focus.theme === "customer_case" && COSTS.test(copy)) {
    issues.push("Kundehistorien dreier også over mot kostnader. Pass på at kundecaset er hovedtema.");
  }
  return issues;
}
