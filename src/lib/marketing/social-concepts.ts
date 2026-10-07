import type { CtaType, HookType, ContentGoal } from "@/lib/marketing/genome";
import type { SocialCategory } from "@/lib/workspaces/social-strategy";

export const SOCIAL_CONCEPT_BLUEPRINTS = [
  {
    id: "editorial_premium",
    label: "Editorial / Premium",
    creativeStyle: "minimal_premium",
    goal: "awareness",
    hookType: "other",
    ctaType: "learn_more",
  },
  {
    id: "lifestyle_story",
    label: "Story / Lifestyle",
    creativeStyle: "lifestyle",
    goal: "engagement",
    hookType: "lifestyle_first",
    ctaType: "dm",
  },
  {
    id: "advisor_insight",
    label: "Advisor / Insight",
    creativeStyle: "advisor",
    goal: "lead_generation",
    hookType: "education",
    ctaType: "contact",
  },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  creativeStyle: string;
  goal: ContentGoal;
  hookType: HookType;
  ctaType: CtaType;
}>;

export type SocialConceptId = (typeof SOCIAL_CONCEPT_BLUEPRINTS)[number]["id"];
export type SocialVisualFormat = "single_image" | "property_card" | "collage_3" | "carousel";

export function socialConceptById(id: string | null | undefined) {
  return SOCIAL_CONCEPT_BLUEPRINTS.find((item) => item.id === id) ?? SOCIAL_CONCEPT_BLUEPRINTS[0];
}

export function selectAutopilotSocialConcept(input: {
  weeklyCount: number;
  channel: string;
  socialCategory: SocialCategory;
  mediaCount: number;
}) {
  // Stable rotation keeps the three Studio concepts genuinely different instead
  // of letting the model choose the same voice every day.
  const blueprint = SOCIAL_CONCEPT_BLUEPRINTS[Math.abs(Math.trunc(input.weeklyCount)) % SOCIAL_CONCEPT_BLUEPRINTS.length];
  const isProperty = input.socialCategory === "property";
  const hasCarouselMedia = input.channel === "instagram" && input.mediaCount >= 3;

  let visualFormat: SocialVisualFormat = "single_image";
  if (isProperty && blueprint.id === "editorial_premium") visualFormat = "property_card";
  if (isProperty && blueprint.id === "lifestyle_story") visualFormat = "single_image";
  if (isProperty && blueprint.id === "advisor_insight") {
    visualFormat = hasCarouselMedia ? "carousel" : "property_card";
  } else if (!isProperty && blueprint.id === "advisor_insight" && hasCarouselMedia) {
    visualFormat = "carousel";
  }

  return {
    ...blueprint,
    visualFormat,
    format: visualFormat === "carousel" ? "carousel" as const : "image" as const,
  };
}

function asFiniteInteger(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

export function resolveAutopilotPostsPerWeek(input: {
  metadata?: Record<string, unknown> | null;
  postingStrategy?: Record<string, unknown> | null;
}) {
  // Five is the normal ceiling, not an algorithm myth. Brands can deliberately
  // run a lighter 3–4 post rhythm through Growth Plan metadata.
  const configured = asFiniteInteger(input.metadata?.autopilot_posts_per_week);
  let target = configured == null ? 5 : Math.max(3, Math.min(5, configured));

  const days = Array.isArray(input.postingStrategy?.days)
    ? Array.from(new Set(input.postingStrategy!.days.map(String).map((day) => day.trim().toLowerCase()).filter(Boolean)))
    : [];
  if (days.length) target = Math.min(target, days.length);

  return Math.max(1, target);
}
