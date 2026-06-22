import { z } from "zod";
import { LEAD_INTELLIGENCE_LIMITS, ExtractedLeadSchema } from "./contracts";
import { LeadIntelligenceRealEstateBrandSchema } from "./brand-allowlist";
import {
  LeadContactCandidateMatchTypeSchema,
  maskEmail,
  maskPhone,
  type LeadContactCandidatePreview,
  type QueryClient,
} from "./persistence";

const UUIDSchema = z.string().uuid();
const PipelineStatusSchema = z.string().trim().min(1).max(64).nullable();
const SourceSchema = z.string().trim().max(LEAD_INTELLIGENCE_LIMITS.shortText).nullable();
const ContextTextSchema = z.string().trim().max(LEAD_INTELLIGENCE_LIMITS.mediumText).nullable();
const NotesExcerptSchema = z.string().max(500).nullable();
const DateTimeSchema = z.string().datetime().nullable();

export const LeadIntelligenceCrmContextRequestSchema = z
  .object({
    brand: LeadIntelligenceRealEstateBrandSchema,
    contact: ExtractedLeadSchema.shape.contact,
    contactIds: z.array(UUIDSchema).max(10).optional().default([]),
  })
  .strict();

export interface LeadIntelligenceCrmContextItem {
  contactId: string;
  name: string | null;
  maskedPhone: string | null;
  maskedEmail: string | null;
  matchType: z.infer<typeof LeadContactCandidateMatchTypeSchema>;
  confidence: number;
  reasons: string[];
  pipelineStatus: string | null;
  pipelineValue: number | null;
  propertyInterest: string | null;
  source: string | null;
  sentiment: string | null;
  notesExcerpt: string | null;
  interactionCount: number;
  lastContact: string | null;
  nextFollowup: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

function normalizeDate(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const text = String(value);
  return DateTimeSchema.catch(null).parse(text);
}

function intersectCandidateIds(candidates: LeadContactCandidatePreview[], contactIds: string[]) {
  const requested = new Set(contactIds);
  return candidates.filter((candidate) => requested.size === 0 || requested.has(candidate.contactId));
}

export async function loadLeadIntelligenceCrmContext(input: {
  db: QueryClient;
  candidates: LeadContactCandidatePreview[];
  contactIds?: string[];
}) {
  const candidates = intersectCandidateIds(input.candidates, input.contactIds || []);
  if (candidates.length === 0) return [];

  const ids = candidates.map((candidate) => candidate.contactId);
  const { rows } = await input.db.query<{
    contact_id: string;
    name: string | null;
    phone: string | null;
    email: string | null;
    pipeline_status: string | null;
    pipeline_value: string | number | null;
    property_interest: string | null;
    source: string | null;
    sentiment: string | null;
    notes_excerpt: string | null;
    interaction_count: string | number | null;
    last_contact: string | Date | null;
    next_followup: string | Date | null;
    created_at: string | Date | null;
    updated_at: string | Date | null;
  }>(
    `
      select
        id::text as contact_id,
        name,
        phone,
        email,
        pipeline_status,
        pipeline_value,
        property_interest,
        source,
        sentiment,
        notes_excerpt,
        interaction_count,
        last_contact,
        next_followup,
        created_at,
        updated_at
      from public.lead_intelligence_crm_context_lookup
      where id = any($1::uuid[])
      order by updated_at desc nulls last, created_at desc nulls last
    `,
    [ids],
  );

  const candidateById = new Map(candidates.map((candidate) => [candidate.contactId, candidate]));
  return rows
    .map((row): LeadIntelligenceCrmContextItem | null => {
      const candidate = candidateById.get(row.contact_id);
      if (!candidate) return null;
      return {
        contactId: UUIDSchema.parse(row.contact_id),
        name: z.string().trim().max(LEAD_INTELLIGENCE_LIMITS.personName).nullable().parse(row.name),
        maskedPhone: maskPhone(row.phone),
        maskedEmail: maskEmail(row.email),
        matchType: LeadContactCandidateMatchTypeSchema.parse(candidate.matchType),
        confidence: z.number().min(0).max(1).parse(candidate.confidence),
        reasons: z
          .array(z.string().trim().min(1).max(LEAD_INTELLIGENCE_LIMITS.mediumText))
          .max(LEAD_INTELLIGENCE_LIMITS.matchReasons)
          .parse(candidate.reasons),
        pipelineStatus: PipelineStatusSchema.parse(row.pipeline_status),
        pipelineValue: row.pipeline_value === null ? null : Number(row.pipeline_value),
        propertyInterest: ContextTextSchema.parse(row.property_interest),
        source: SourceSchema.parse(row.source),
        sentiment: SourceSchema.parse(row.sentiment),
        notesExcerpt: NotesExcerptSchema.parse(row.notes_excerpt || null),
        interactionCount: Number(row.interaction_count || 0),
        lastContact: normalizeDate(row.last_contact),
        nextFollowup: normalizeDate(row.next_followup),
        createdAt: normalizeDate(row.created_at),
        updatedAt: normalizeDate(row.updated_at),
      };
    })
    .filter((item): item is LeadIntelligenceCrmContextItem => Boolean(item));
}
