/**
 * Marketing Growth OS — Phase 7: Autonomous Loop 1.0 — schemas.
 *
 * Maskinlesbare (Zod) artefakter for hele den kontrollerte sløyfen:
 *   Learning → Marketing Director → Campaign Plan → Content Brief →
 *   Generated Asset → Publication Plan → (Analytics → Attribution → Learning →
 *   Experiment) → Strategy Update ↺
 *
 * Planen er data, ikke prosa. Hver artefakt bærer separate identiteter
 * (correlation/run/campaign/content/publication/experiment) — ikke én ID til alt.
 */

import { z } from "zod";
import { MARKETING_CHANNELS, ContentGenomeSchema } from "../genome";

/** Autonomi-nivåer. Systemet STARTER på copilot (mennesket godkjenner publisering). */
export const AUTONOMY_LEVELS = ["observe", "copilot", "guarded", "optimized"] as const;
export type AutonomyLevel = (typeof AUTONOMY_LEVELS)[number];

/** Sløyfens tilstander — alle idempotente og resumable (checkpoints). */
export const RUN_STAGES = ["plan", "brief", "generate", "validate", "approval", "schedule", "publish", "measure", "learn", "strategy", "done"] as const;
export type RunStage = (typeof RUN_STAGES)[number];

export const PUBLICATION_STATES = ["draft", "scheduled", "approved", "publishing", "published", "failed", "paused"] as const;
export type PublicationState = (typeof PUBLICATION_STATES)[number];

/** Budsjett-typer bygges inn nå (paid ads kommer senere). Director kan aldri øke pengebruk uten policy/approval. */
export const BudgetSchema = z.object({
  contentBudgetEur: z.number().min(0).default(0),
  productionBudgetEur: z.number().min(0).default(0),
  paidMediaBudgetEur: z.number().min(0).default(0),
  experimentBudgetEur: z.number().min(0).default(0),
});
export type Budget = z.infer<typeof BudgetSchema>;

/** Kommersielle mål Director styrer mot. */
export const CommercialGoalSchema = z.object({
  kind: z.enum(["qualified_leads", "leads", "viewings", "sales", "awareness"]),
  target: z.number().positive(),
  horizonDays: z.number().positive().default(30),
});
export type CommercialGoal = z.infer<typeof CommercialGoalSchema>;

/** Alt Marketing Director tar inn for å lage en plan. */
export const DirectorInputSchema = z.object({
  brandId: z.string().min(1),
  brandName: z.string().optional(),
  goals: z.array(CommercialGoalSchema).min(1),
  pipelineGaps: z.array(z.string()).default([]),
  inventoryFocus: z.array(z.string()).default([]),
  activeCampaignIds: z.array(z.string()).default([]),
  channels: z.array(z.enum(MARKETING_CHANNELS)).min(1),
  budget: BudgetSchema.default({ contentBudgetEur: 0, productionBudgetEur: 0, paidMediaBudgetEur: 0, experimentBudgetEur: 0 }),
  publishingCapacityPerWeek: z.number().int().positive().default(7),
});
export type DirectorInput = z.infer<typeof DirectorInputSchema>;

export const ExplorationMixSchema = z.object({
  exploit: z.number().min(0).max(1).default(0.7),
  adjacent: z.number().min(0).max(1).default(0.2),
  experiment: z.number().min(0).max(1).default(0.1),
});
export type ExplorationMix = z.infer<typeof ExplorationMixSchema>;

/** Produsert av Director. Maskinlesbar strategi — ikke fritekst. */
export const MarketingPlanSchema = z.object({
  marketingRunId: z.string().min(1),
  correlationId: z.string().min(1),
  brandId: z.string().min(1),
  goals: z.array(CommercialGoalSchema),
  focus: z.array(z.string()).default([]),
  channels: z.array(z.enum(MARKETING_CHANNELS)),
  explorationMix: ExplorationMixSchema,
  /** Hvor mange innhold hver strategi-bucket skal produsere. */
  production: z.object({ exploit: z.number().int().min(0), adjacent: z.number().int().min(0), experiment: z.number().int().min(0) }),
  favoredDimensions: z.record(z.string(), z.string()).default({}),
  avoidedDimensions: z.array(z.object({ dimension: z.string(), value: z.string() })).default([]),
  plannedExperiments: z.array(z.object({ hypothesis: z.string(), primaryVariable: z.string() })).default([]),
  budget: BudgetSchema,
  notes: z.array(z.string()).default([]),
});
export type MarketingPlan = z.infer<typeof MarketingPlanSchema>;

export const CAMPAIGN_STRATEGIES = ["exploit", "adjacent", "experiment"] as const;
export type CampaignStrategy = (typeof CAMPAIGN_STRATEGIES)[number];

export const CampaignPlanSchema = z.object({
  campaignId: z.string().min(1),
  marketingRunId: z.string().min(1),
  brandId: z.string().min(1),
  strategy: z.enum(CAMPAIGN_STRATEGIES),
  goal: CommercialGoalSchema,
  focus: z.string().optional(),
  channels: z.array(z.enum(MARKETING_CHANNELS)),
  /** Master-idé som skal atomiseres til flere kanal-innhold. */
  masterIdea: z.string().min(1),
});
export type CampaignPlan = z.infer<typeof CampaignPlanSchema>;

export const ContentBriefSchema = z.object({
  contentId: z.string().min(1),
  campaignId: z.string().min(1),
  parentContentId: z.string().nullable().default(null),
  marketingRunId: z.string().min(1),
  brandId: z.string().min(1),
  strategy: z.enum(CAMPAIGN_STRATEGIES),
  channel: z.enum(MARKETING_CHANNELS),
  /** Genome bestemt FØR generering (fra learning + exploration). */
  genome: ContentGenomeSchema,
  angle: z.string().min(1),
  goal: CommercialGoalSchema,
  /** Skal briefen også lage et konverteringslag (landing/lead-form)? */
  wantsLeadCapture: z.boolean().default(false),
  learningNotes: z.array(z.string()).default([]),
});
export type ContentBrief = z.infer<typeof ContentBriefSchema>;

export const GeneratedAssetSchema = z.object({
  contentId: z.string().min(1),
  creativeVariantId: z.string().min(1),
  campaignId: z.string().min(1),
  channel: z.enum(MARKETING_CHANNELS),
  genome: ContentGenomeSchema,
  headline: z.string().optional(),
  body: z.string().optional(),
  cta: z.string().optional(),
  /** Kilde/provenance for sensitive fakta (pris/skatt/jus/marked). Uten kilde → approval. */
  factSources: z.array(z.object({ claim: z.string(), source: z.string() })).default([]),
  /** Publiseringsmedia. Instagram krever gyldig image/video URL (fail closed uten). */
  media: z.object({
    imageUrl: z.string().optional(),
    videoUrl: z.string().optional(),
    linkUrl: z.string().optional(),
    mediaType: z.enum(["image", "video", "reel"]).optional(),
    altText: z.string().optional(),
  }).optional(),
  /** Genererings-metadata (modell, kostnad). */
  generator: z.object({ model: z.string().optional(), costEur: z.number().min(0).optional() }).default({}),
});
export type GeneratedAsset = z.infer<typeof GeneratedAssetSchema>;

export const PublicationPlanSchema = z.object({
  publicationId: z.string().min(1),
  contentId: z.string().min(1),
  campaignId: z.string().min(1),
  channel: z.enum(MARKETING_CHANNELS),
  state: z.enum(PUBLICATION_STATES),
  scheduledFor: z.string().nullable().default(null),
  /** Idempotens per publisering — ingen dobbel-posting ved retry. */
  idempotencyKey: z.string().min(1),
  approvalId: z.string().nullable().default(null),
});
export type PublicationPlan = z.infer<typeof PublicationPlanSchema>;

/** Endring av strategi må være eksplisitt, evidens-basert og gå gjennom Policy Engine. */
export const StrategyChangeSchema = z.object({
  brandId: z.string().min(1),
  dimension: z.string().min(1),
  reason: z.string().min(1),
  oldValue: z.string().nullable(),
  newValue: z.string(),
  supportingEvidence: z.string().min(1),
  evidenceLevel: z.enum(["insufficient", "directional", "promising", "reliable", "strong"]),
  experimentBacked: z.boolean().default(false),
  expectedEffect: z.string().optional(),
  reversibility: z.enum(["reversible", "partial", "irreversible"]).default("reversible"),
});
export type StrategyChange = z.infer<typeof StrategyChangeSchema>;

export function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  return schema.parse(input);
}
