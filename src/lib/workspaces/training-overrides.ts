import {
  WORKSPACE_TRAINING_ARTICLES,
  type TrainingArticle,
  type TrainingSection,
} from "@/lib/workspaces/training-content";

export type TrainingEditableContent = Pick<
  TrainingArticle, "title" | "shortTitle" | "summary" | "readMinutes" | "sections"
>;
export type TrainingOverride = { article_id: string; content: TrainingEditableContent };
export const TRAINING_BRANDS = ["zeneco", "pinosoecolife"] as const;

export function trainingBrandAllowed(article: TrainingArticle, brandKey: string) {
  return article.brands === "all" || article.brands.includes(brandKey);
}

function validLine(value: unknown, maxLength: number) {
  return typeof value === "string" && value.trim().length > 0 &&
    value.length <= maxLength && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
}

function validList(value: unknown, limit: number, itemLength: number) {
  return value === undefined || (Array.isArray(value) &&
    value.length <= limit && value.every(item => validLine(item, itemLength)));
}

export function validateTrainingContent(value: unknown): value is TrainingEditableContent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  if (!validLine(data.title, 200) || !validLine(data.shortTitle, 100) ||
      !validLine(data.summary, 700) ||
      (typeof data.readMinutes !== "number" || !Number.isInteger(data.readMinutes) || data.readMinutes < 1 || data.readMinutes > 90) ||
      !Array.isArray(data.sections) || data.sections.length < 1 || data.sections.length > 30) return false;
  return data.sections.every((raw: unknown) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
    const section = raw as Record<string, unknown>;
    return validLine(section.heading, 220) &&
      validList(section.paragraphs, 16, 2200) &&
      validList(section.bullets, 20, 1200) &&
      (section.emphasis === undefined || section.emphasis === "" || validLine(section.emphasis, 900)) &&
      ((Array.isArray(section.paragraphs) && section.paragraphs.length > 0) ||
       (Array.isArray(section.bullets) && section.bullets.length > 0) ||
       Boolean(section.emphasis));
  });
}

export function editableTrainingContent(article: TrainingArticle): TrainingEditableContent {
  return {
    title: article.title, shortTitle: article.shortTitle, summary: article.summary,
    readMinutes: article.readMinutes,
    sections: article.sections.map(section => ({
      heading: section.heading, paragraphs: [...(section.paragraphs || [])],
      bullets: [...(section.bullets || [])], emphasis: section.emphasis || "",
    })),
  };
}

/** Overrides may change the words, never brand visibility or permission requirements. */
export function applyTrainingOverrides(
  articles: TrainingArticle[],
  brandKey: string,
  overrides: TrainingOverride[],
): TrainingArticle[] {
  // No other brand may consume the editable staff training store.
  if (!TRAINING_BRANDS.some(item => item === brandKey)) return articles;
  const byId = new Map(overrides.filter(row =>
    row && typeof row.article_id === "string" && validateTrainingContent(row.content),
  ).map(row => [row.article_id, row.content]));
  return articles.map(article => {
    if (!trainingBrandAllowed(article, brandKey)) return article;
    const editable = byId.get(article.id);
    return editable
      ? { ...article,
        title: editable.title, shortTitle: editable.shortTitle, summary: editable.summary,
        readMinutes: editable.readMinutes,
        sections: editable.sections.map(
          (section: TrainingSection) => ({
            heading: section.heading, paragraphs: section.paragraphs || [],
            bullets: section.bullets || [], emphasis: section.emphasis || "",
          }),
        ) }
      : article;
  });
}

export function trainingBaseForBrand(brandKey: string) {
  return WORKSPACE_TRAINING_ARTICLES.filter(article => trainingBrandAllowed(article, brandKey));
}
