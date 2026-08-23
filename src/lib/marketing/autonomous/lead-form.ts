/**
 * Phase 7.1 — Lead Form Generator. Hvert lead-gen-innhold kan få et
 * konverteringslag: adaptivt skjema + UTM + identiteter. En innsending mappes
 * til en RawInquiry og rutes inn i eksisterende Agentic Lead Intake — det er den
 * fysiske broen mellom Marketing OS og Revenue OS.
 */

import { z } from "zod";
import { buildContentUtm } from "../attribution";
import type { ContentBrief } from "./schemas";
import type { BrandContext } from "./brand-brain";

export const LeadFormFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(["select", "text", "email", "tel"]),
  options: z.array(z.string()).optional(),
  required: z.boolean().default(false),
});
export type LeadFormField = z.infer<typeof LeadFormFieldSchema>;

export const LeadFormSchema = z.object({
  formId: z.string(),
  contentId: z.string(),
  campaignId: z.string(),
  brandId: z.string(),
  channel: z.string(),
  title: z.string(),
  fields: z.array(LeadFormFieldSchema),
  cta: z.string(),
  utm: z.object({ utm_source: z.string(), utm_medium: z.string(), utm_campaign: z.string().optional(), utm_content: z.string().optional() }),
});
export type LeadForm = z.infer<typeof LeadFormSchema>;

/** Bygg et adaptivt skjema fra brief + merke. Tilpasser felt etter mål/eiendomstype/område. */
export function generateLeadForm(brief: ContentBrief, brand: BrandContext, opts: { formId?: string } = {}): LeadForm {
  const area = brief.genome.area ?? brand.locations[0];
  const fields: LeadFormField[] = [
    { key: "budget", label: "Budsjett", type: "select", options: ["€300–500k", "€500–750k", "€750k+"], required: true },
    { key: "property_type", label: "Boligtype", type: "select", options: ["Villa", "Leilighet", "Rekkehus"], required: false },
    { key: "bedrooms", label: "Soverom", type: "select", options: ["2", "3", "4+"], required: false },
    { key: "area_flexibility", label: "Områdefleksibilitet", type: "select", options: ["Kun " + (area ?? "valgt område"), "Fleksibel"], required: false },
    { key: "timeline", label: "Tidshorisont", type: "select", options: ["Nå", "0–3 mnd", "3–6 mnd", "Undersøker"], required: true },
    { key: "purpose", label: "Formål", type: "select", options: ["Bolig", "Ferie", "Investering"], required: false },
    { key: "name", label: "Navn", type: "text", required: true },
    { key: "email", label: "E-post", type: "email", required: true },
    { key: "phone", label: "Telefon", type: "tel", required: false },
  ];
  const utm = buildContentUtm({ channel: brief.channel, contentId: brief.contentId, campaign: brief.campaignId });
  return LeadFormSchema.parse({
    formId: opts.formId ?? `form_${brief.contentId}`,
    contentId: brief.contentId,
    campaignId: brief.campaignId,
    brandId: brief.brandId,
    channel: brief.channel,
    title: area ? `Finn boliger i ${area} som passer deg` : "Finn boliger som passer deg",
    fields,
    cta: brand.preferredCta || "Send meg treff",
    utm,
  });
}

export const LeadFormSubmissionSchema = z.object({
  formId: z.string(),
  contentId: z.string(),
  campaignId: z.string(),
  brandId: z.string(),
  channel: z.string().optional(),
  publicationId: z.string().optional(),
  answers: z.record(z.string(), z.string()).default({}),
  contact: z.object({ name: z.string().optional(), email: z.string().optional(), phone: z.string().optional() }).default({}),
  visitorId: z.string().optional(),
  submittedAt: z.string().optional(),
});
export type LeadFormSubmission = z.infer<typeof LeadFormSubmissionSchema>;

export interface MappedInquiry {
  externalId: string;
  source: string;
  brandId: string;
  message: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  receivedAt: string;
}

/**
 * Map en skjema-innsending til en RawInquiry for Agentic Lead Intake. Attribusjon
 * (campaign/content/publication) bæres i externalId + meldingsteksten, slik at
 * ekstraksjon og attribution kan koble leadet til innholdet som startet reisen.
 */
export function leadFormToInquiry(sub: LeadFormSubmission): MappedInquiry {
  const s = LeadFormSubmissionSchema.parse(sub);
  const a = s.answers;
  const parts = [
    a.budget && `Budsjett: ${a.budget}`,
    a.property_type && `Boligtype: ${a.property_type}`,
    a.bedrooms && `Soverom: ${a.bedrooms}`,
    a.area_flexibility && `Område: ${a.area_flexibility}`,
    a.timeline && `Tidshorisont: ${a.timeline}`,
    a.purpose && `Formål: ${a.purpose}`,
  ].filter(Boolean);
  const message = `Lead fra skjema (${s.channel ?? "web"}).\n${parts.join("\n")}`;
  return {
    externalId: `leadform:${s.formId}:${s.contact.email ?? s.contact.phone ?? s.visitorId ?? s.submittedAt ?? "anon"}`,
    source: `marketing_lead_form:${s.channel ?? "web"}`,
    brandId: s.brandId,
    message,
    contactName: s.contact.name,
    contactEmail: s.contact.email,
    contactPhone: s.contact.phone,
    receivedAt: s.submittedAt ?? new Date().toISOString(),
  };
}
