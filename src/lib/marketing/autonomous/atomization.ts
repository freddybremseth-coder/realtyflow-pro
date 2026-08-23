/**
 * Phase 7 — content atomization. Én god master-idé blir en hel kampanje på
 * tvers av kanaler. Alle deler får felles campaign_id + parent_content_id, men
 * eget content_id og eget (kanal-tilpasset) Content Genome.
 */

import type { ContentGenome } from "../genome";
import { adaptGenomeToChannel } from "./channel";
import { ContentBriefSchema, type CampaignPlan, type ContentBrief } from "./schemas";

export interface AtomizeOptions {
  baseGenome: ContentGenome;
  /** Lag et stabilt content_id for indeks i (idempotent per run/kampanje). */
  makeContentId: (index: number, channel: string) => string;
  angleFor?: (channel: string, master: string) => string;
  /** Kanaler der innholdet skal ha et konverteringslag (landing/lead-form). */
  leadCaptureChannels?: string[];
  learningNotes?: string[];
}

/**
 * Atomisér en kampanje til kanal-innhold. Første kanal er master (parent=null);
 * resten er avledninger (parent = master content_id).
 */
export function atomizeCampaign(campaign: CampaignPlan, opts: AtomizeOptions): ContentBrief[] {
  const leadCapture = new Set(opts.leadCaptureChannels ?? ["website"]);
  const briefs: ContentBrief[] = [];
  let masterContentId: string | null = null;

  campaign.channels.forEach((channel, i) => {
    const contentId = opts.makeContentId(i, channel);
    if (i === 0) masterContentId = contentId;
    const genome = adaptGenomeToChannel({ ...opts.baseGenome, brandId: campaign.brandId }, channel);
    const angle = opts.angleFor ? opts.angleFor(channel, campaign.masterIdea) : `${campaign.masterIdea} — ${channel}`;
    briefs.push(
      ContentBriefSchema.parse({
        contentId,
        campaignId: campaign.campaignId,
        parentContentId: i === 0 ? null : masterContentId,
        marketingRunId: campaign.marketingRunId,
        brandId: campaign.brandId,
        strategy: campaign.strategy,
        channel,
        genome,
        angle,
        goal: campaign.goal,
        wantsLeadCapture: leadCapture.has(channel),
        learningNotes: opts.learningNotes ?? [],
      }),
    );
  });
  return briefs;
}
