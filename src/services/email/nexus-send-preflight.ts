import type { SupabaseClient } from "@supabase/supabase-js";
import { buildLeadCustomerPresentationPreview } from "@/services/lead-intelligence/presentation-preview";
import { checkCrmEmailSuppression } from "@/services/email/email-suppression";

export type NexusSendPreflightStatus = "READY" | "BLOCKED";

export interface NexusSendPreflightAssessment {
  status: NexusSendPreflightStatus;
  ready: boolean;
  blockers: string[];
  warnings: string[];
  checks: {
    profileApproved: boolean;
    shortlistApproved: boolean;
    presentationApproved: boolean;
    draftApproved: boolean;
    draftUnsent: boolean;
    contactLinked: boolean;
    sameBrand: boolean;
    recipientValid: boolean;
    suppressionClear: boolean;
    senderConfigured: boolean;
    subjectPresent: boolean;
    bodyPresent: boolean;
    clientReadyPropertyCount: number;
    propertyCount: number;
    verifiedPropertyLinkCount: number;
  };
}

function text(value: unknown) { return String(value || "").trim(); }
function normalizedBrand(value: unknown) {
  const token = text(value).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "");
  if (token === "zeneco" || token === "zenecohomes") return "zeneco";
  if (token === "soleada" || token === "soleadano") return "soleada";
  if (token === "pinosoecolife" || token === "pinosoeco") return "pinosoecolife";
  return token;
}
function isApproved(value: unknown) { return text(value).toLowerCase() === "approved"; }
function validEmail(value: unknown) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(value).toLowerCase()); }
function unique(values: Array<string | null | undefined>) { return [...new Set(values.map((value) => text(value)).filter(Boolean))]; }

export function assessNexusSendPreflight(input: { brandId: string; profile: any; shortlist: any; presentation: any; draft: any; contact: any; shortlistItems: any[]; senderConfigured: boolean; suppressionBlocked: boolean; suppressionError?: string | null; }): NexusSendPreflightAssessment {
  const preview = buildLeadCustomerPresentationPreview(input.presentation?.presentation_json);
  const propertyCount = preview.properties.length;
  const verifiedPropertyLinkCount = preview.properties.filter((property) => Boolean(property.publicUrl)).length;
  const clientReadyPropertyCount = input.shortlistItems.filter((item) => text(item?.quality_review_status) === "client_ready").length;
  const sameBrand = Boolean(normalizedBrand(input.contact?.brand_id || input.contact?.brand)) && normalizedBrand(input.contact?.brand_id || input.contact?.brand) === normalizedBrand(input.brandId);
  const recipientValid = validEmail(input.contact?.email);
  const suppressionClear = !input.suppressionError && !input.suppressionBlocked;
  const draftUnsent = !input.draft?.sent_at && !input.draft?.cancelled_at && text(input.draft?.status).toLowerCase() !== "cancelled";
  const checks = { profileApproved: isApproved(input.profile?.status), shortlistApproved: isApproved(input.shortlist?.status), presentationApproved: isApproved(input.presentation?.status), draftApproved: isApproved(input.draft?.status), draftUnsent, contactLinked: Boolean(input.contact?.id), sameBrand, recipientValid, suppressionClear, senderConfigured: input.senderConfigured, subjectPresent: Boolean(text(input.draft?.subject)), bodyPresent: Boolean(text(input.draft?.body_text)), clientReadyPropertyCount, propertyCount, verifiedPropertyLinkCount };
  const blockers = unique([
    checks.profileApproved ? null : "Buyer Profile is not approved.", checks.shortlistApproved ? null : "Shortlist is not approved.", checks.presentationApproved ? null : "Presentation is not approved.", checks.draftApproved ? null : "Message draft is not approved.", checks.draftUnsent ? null : "Message draft is already sent, cancelled or otherwise closed.", checks.contactLinked ? null : "Buyer Profile has no linked CRM contact.", checks.sameBrand ? null : "CRM contact does not belong to the same brand.", checks.recipientValid ? null : "Recipient email is missing or invalid.", input.suppressionError ? "CRM suppression could not be verified; preflight fails closed." : null, input.suppressionBlocked ? "Recipient is suppressed or marked do-not-contact in CRM." : null, checks.senderConfigured ? null : "No active sender account is configured for this brand.", checks.subjectPresent ? null : "Approved message has no subject.", checks.bodyPresent ? null : "Approved message has no body text.", checks.clientReadyPropertyCount > 0 ? null : "No client-ready property remains in the approved shortlist.", checks.propertyCount > 0 ? null : "Presentation contains no properties.", checks.propertyCount > 0 && checks.verifiedPropertyLinkCount === checks.propertyCount ? null : "One or more presentation properties lack a verified public link."
  ]);
  const warnings = unique([...preview.verification, ...preview.properties.flatMap((property) => property.questionsToVerify), ...preview.properties.flatMap((property) => property.concerns), "Send permission is not granted by preflight. The same safety checks must run again immediately before any provider send."]);
  return { status: blockers.length ? "BLOCKED" : "READY", ready: blockers.length === 0, blockers, warnings, checks };
}

export async function runNexusSendPreflight(input: { supabase: SupabaseClient; brandId: string; buyerProfileId: string; shortlistId: string; presentationId: string; messageDraftId: string; }): Promise<NexusSendPreflightAssessment> {
  const { supabase, brandId, buyerProfileId, shortlistId, presentationId, messageDraftId } = input;
  const [profileResult, shortlistResult, presentationResult, draftResult, shortlistItemsResult, senderResult] = await Promise.all([
    supabase.from("buyer_profiles").select("id,brand,status,contact_id").eq("id", buyerProfileId).eq("brand", brandId).maybeSingle(),
    supabase.from("lead_property_shortlists").select("id,brand,buyer_profile_id,status").eq("id", shortlistId).eq("brand", brandId).maybeSingle(),
    supabase.from("lead_customer_presentations").select("id,brand,buyer_profile_id,shortlist_id,status,presentation_json").eq("id", presentationId).eq("brand", brandId).maybeSingle(),
    supabase.from("lead_customer_message_drafts").select("id,brand,presentation_id,buyer_profile_id,shortlist_id,status,subject,body_text,sent_at,cancelled_at").eq("id", messageDraftId).eq("brand", brandId).maybeSingle(),
    supabase.from("lead_property_shortlist_items").select("id,quality_review_status").eq("shortlist_id", shortlistId).eq("brand", brandId),
    supabase.from("brand_email_configs").select("id,email_address,is_active").eq("brand_id", brandId).eq("is_active", true).order("updated_at", { ascending: false }).limit(1),
  ]);
  const firstError = profileResult.error || shortlistResult.error || presentationResult.error || draftResult.error || shortlistItemsResult.error || senderResult.error;
  if (firstError) throw new Error(firstError.message);
  const profile = profileResult.data; const shortlist = shortlistResult.data; const presentation = presentationResult.data; const draft = draftResult.data;
  if (!profile || !shortlist || !presentation || !draft) return assessNexusSendPreflight({ brandId, profile, shortlist, presentation, draft, contact: null, shortlistItems: shortlistItemsResult.data || [], senderConfigured: Boolean(senderResult.data?.length), suppressionBlocked: false, suppressionError: "Required send-preflight dependency is missing." });
  const dependencyMismatch = String(shortlist.buyer_profile_id) !== buyerProfileId || String(presentation.buyer_profile_id) !== buyerProfileId || String(presentation.shortlist_id) !== shortlistId || String(draft.buyer_profile_id) !== buyerProfileId || String(draft.shortlist_id) !== shortlistId || String(draft.presentation_id) !== presentationId;
  if (dependencyMismatch) return assessNexusSendPreflight({ brandId, profile, shortlist: { ...shortlist, status: "mismatch" }, presentation, draft, contact: null, shortlistItems: shortlistItemsResult.data || [], senderConfigured: Boolean(senderResult.data?.length), suppressionBlocked: false, suppressionError: "Send-preflight dependency mismatch." });
  let contact: any = null;
  if (profile.contact_id) {
    const contactResult = await supabase.from("contacts").select("id,name,email,brand,brand_id,do_not_contact,email_suppressed").eq("id", profile.contact_id).maybeSingle();
    if (contactResult.error) throw new Error(contactResult.error.message);
    contact = contactResult.data;
  }
  const recipient = text(contact?.email);
  const suppression = recipient ? await checkCrmEmailSuppression(supabase, [recipient]) : { blocked: false, blockedEmails: [] as string[] };
  return assessNexusSendPreflight({ brandId, profile, shortlist, presentation, draft, contact, shortlistItems: shortlistItemsResult.data || [], senderConfigured: Boolean(senderResult.data?.length), suppressionBlocked: suppression.blocked, suppressionError: suppression.error || null });
}
