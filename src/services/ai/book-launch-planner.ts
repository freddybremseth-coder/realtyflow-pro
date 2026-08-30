import { askBookAuthor } from "@/services/ai/book-author-client";

export const BOOK_LAUNCH_FREQUENCY_POLICY = {
  durationDays: 30,
  maxTotalPerWeek: 4,
  maxPerChannelPerWeek: 2,
  minHoursBetweenSameChannel: 24,
} as const;

export type BookLaunchItem = {
  offsetDay: number;
  channel: "facebook" | "instagram" | "email" | "website";
  contentType: "announcement" | "idea" | "sample" | "series" | "author_note" | "social_proof";
  purpose: string;
  headline: string;
  body: string;
  cta: "view_book" | "read_sample" | "buy_book" | "browse_series";
  sourceClaim: string;
};

export type BookLaunchPlan = {
  campaignName: string;
  objective: string;
  audiencePromise: string;
  positioning: string;
  items: BookLaunchItem[];
};

const ITEM_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    offsetDay: { type: "integer", minimum: 0, maximum: 29 },
    channel: { type: "string", enum: ["facebook", "instagram", "email", "website"] },
    contentType: { type: "string", enum: ["announcement", "idea", "sample", "series", "author_note", "social_proof"] },
    purpose: { type: "string" }, headline: { type: "string" }, body: { type: "string" },
    cta: { type: "string", enum: ["view_book", "read_sample", "buy_book", "browse_series"] },
    sourceClaim: { type: "string" },
  },
  required: ["offsetDay", "channel", "contentType", "purpose", "headline", "body", "cta", "sourceClaim"],
};

const PLAN_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    campaignName: { type: "string" }, objective: { type: "string" }, audiencePromise: { type: "string" }, positioning: { type: "string" },
    items: { type: "array", minItems: 10, maxItems: 16, items: ITEM_SCHEMA },
  },
  required: ["campaignName", "objective", "audiencePromise", "positioning", "items"],
};

export function validateBookLaunchPlan(plan: BookLaunchPlan) {
  if (!plan.campaignName?.trim() || !plan.objective?.trim() || plan.items.length < 10 || plan.items.length > 16) throw new Error("Lanseringsplanen er ufullstendig");
  const sorted = [...plan.items].sort((a, b) => a.offsetDay - b.offsetDay);
  const weekly = new Map<number, number>();
  const weeklyChannel = new Map<string, number>();
  const latestByChannel = new Map<string, number>();
  for (const item of sorted) {
    if (!Number.isInteger(item.offsetDay) || item.offsetDay < 0 || item.offsetDay >= BOOK_LAUNCH_FREQUENCY_POLICY.durationDays) throw new Error("Publiseringsdag må være mellom 0 og 29");
    const week = Math.floor(item.offsetDay / 7);
    weekly.set(week, (weekly.get(week) ?? 0) + 1);
    const key = `${week}:${item.channel}`;
    weeklyChannel.set(key, (weeklyChannel.get(key) ?? 0) + 1);
    const previous = latestByChannel.get(item.channel);
    if (previous !== undefined && item.offsetDay === previous) throw new Error(`For kort avstand mellom ${item.channel}-innlegg`);
    latestByChannel.set(item.channel, item.offsetDay);
    if (!item.headline.trim() || !item.body.trim() || !item.sourceClaim.trim()) throw new Error("Alle kampanjeinnslag må ha tekst og kildegrunnlag");
  }
  if ([...weekly.values()].some((count) => count > BOOK_LAUNCH_FREQUENCY_POLICY.maxTotalPerWeek)) throw new Error("Kampanjen overskrider fire publiseringer per uke");
  if ([...weeklyChannel.values()].some((count) => count > BOOK_LAUNCH_FREQUENCY_POLICY.maxPerChannelPerWeek)) throw new Error("Kampanjen overskrider to publiseringer per kanal per uke");
  return plan;
}

export function buildBookLaunchPrompt(input: { title: string; subtitle?: string; author: string; language: string; description: string; audiences: string[]; themes: string[]; keywords: string[]; seriesName?: string | null }) {
  return `BOOK LAUNCH CAMPAIGN PROPOSAL\nTITLE: ${input.title}\nSUBTITLE: ${input.subtitle || "—"}\nAUTHOR: ${input.author}\nSERIES: ${input.seriesName || "—"}\nLANGUAGE: ${input.language}\nDESCRIPTION: ${input.description}\nAUDIENCES: ${input.audiences.join(", ")}\nTHEMES: ${input.themes.join(", ")}\nAPPROVED SEARCH PHRASES: ${input.keywords.join(", ")}\n\nCreate a 30-day launch proposal for Freddy Publishing. Produce 10–16 attributable content items across Facebook, Instagram, email and website. Never invent reviews, rankings, sales, awards, availability, price or factual claims. sourceClaim must identify which supplied title, description, audience, theme or search phrase supports the item. Use at most four items in any seven-day week, at most two per channel per week, and never two items on the same channel on the same day. This is a proposal only: do not claim anything is scheduled, approved or published.`;
}

export async function proposeBookLaunch(input: Parameters<typeof buildBookLaunchPrompt>[0]) {
  const model = process.env.OPENAI_BOOK_MODEL || "gpt-5.6";
  const raw = await askBookAuthor(buildBookLaunchPrompt(input), { requireOpenAI: true, responseMimeType: "application/json", responseSchema: PLAN_SCHEMA, maxTokens: 7000 });
  return { plan: validateBookLaunchPlan(JSON.parse(raw) as BookLaunchPlan), model };
}
