import { BRANDS } from "@/lib/constants";
import type {
  LeadIntelligenceSourceOption,
} from "@/components/lead-intelligence/lead-intelligence-request-card";
import type {
  MatchReviewDecision,
  SelectedShortlistDecision,
} from "@/components/lead-intelligence/property-match-display";
import type {
  SavedPropertyQualityReviewStatus,
} from "@/components/lead-intelligence/property-quality-review-controls";

export const sourceOptions: LeadIntelligenceSourceOption[] = [
  { value: "phone_call", label: "Telefonsamtale" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "E-post" },
  { value: "sms", label: "SMS" },
  { value: "meeting_note", label: "Møtenotat" },
  { value: "other", label: "Annet" },
];

export const realEstateBrands = BRANDS.filter((brand) => brand.type === "real_estate");

export function leadIntelligenceDraftReturnUrl({
  buyerProfileId,
  presentationId,
  messageDraftId,
}: {
  buyerProfileId?: string | null;
  presentationId?: string | null;
  messageDraftId?: string | null;
}) {
  const params = new URLSearchParams();
  if (buyerProfileId) params.set("buyerProfileId", buyerProfileId);
  if (presentationId) params.set("presentationId", presentationId);
  if (messageDraftId) params.set("messageDraftId", messageDraftId);
  const query = params.toString();
  return query ? `/lead-intelligence?${query}` : "/lead-intelligence";
}

export function savedPropertyQualityDecision(
  status: SavedPropertyQualityReviewStatus,
  reviewDecision: MatchReviewDecision,
): SelectedShortlistDecision {
  if (status === "client_ready") {
    return reviewDecision === "maybe" ? "maybe" : "current";
  }
  if (reviewDecision === "current" || reviewDecision === "maybe" || reviewDecision === "needs_research") {
    return reviewDecision;
  }
  return "needs_research";
}
