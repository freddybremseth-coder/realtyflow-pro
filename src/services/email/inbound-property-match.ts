import { applyLeadPropertyLocationGuard } from "@/services/lead-intelligence/location-guard";
import {
  loadApprovedLeadMatchProfileWithDb,
  loadCandidatePropertiesFromSupabase,
  previewLeadPropertyMatchesForProfile,
} from "@/services/lead-intelligence/property-match-preview";
import {
  isLeadIntelligenceEnabled,
  isLeadIntelligencePersistenceEnabled,
  isLeadIntelligencePropertyMatchingEnabled,
} from "@/services/lead-intelligence/feature-flags";
import { isLeadIntelligenceRealEstateBrand } from "@/services/lead-intelligence/brand-allowlist";
import { withLeadIntelligenceQuery } from "@/services/lead-intelligence/server-runtime";

export type InboundPreparedPropertyMatch = {
  prepared: boolean;
  reason: string;
  analyzed: number;
  matched: number;
  properties: Array<{
    id: string;
    reference: string | null;
    title: string | null;
    location: string | null;
    propertyType: string | null;
    price: number | null;
    publicUrl: string | null;
  }>;
};

const skipped = (reason: string): InboundPreparedPropertyMatch => ({
  prepared: false,
  reason,
  analyzed: 0,
  matched: 0,
  properties: [],
});

export async function prepareInboundPropertyMatches(input: {
  brandId: string;
  buyerProfileId: string | null;
  buyerProfileStatus: string | null;
}): Promise<InboundPreparedPropertyMatch> {
  if (!input.buyerProfileId || input.buyerProfileStatus !== "APPROVED") return skipped("BUYER_PROFILE_NOT_APPROVED");
  if (!isLeadIntelligenceRealEstateBrand(input.brandId)) return skipped("BRAND_NOT_SUPPORTED");
  if (!isLeadIntelligenceEnabled()) return skipped("LEAD_INTELLIGENCE_DISABLED");
  if (!isLeadIntelligencePersistenceEnabled()) return skipped("PERSISTENCE_DISABLED");
  if (!isLeadIntelligencePropertyMatchingEnabled()) return skipped("PROPERTY_MATCHING_DISABLED");

  try {
    const profile = await withLeadIntelligenceQuery(input.brandId, (client) =>
      loadApprovedLeadMatchProfileWithDb(client, {
        brand: input.brandId,
        buyerProfileId: input.buyerProfileId!,
      }),
    );
    if (!profile) return skipped("BUYER_PROFILE_NOT_FOUND");

    const result = await previewLeadPropertyMatchesForProfile(
      {
        brand: input.brandId,
        buyerProfileId: input.buyerProfileId,
        propertyReferences: [],
        autoDiscover: true,
        candidateLimit: 120,
        maxResults: 5,
      },
      profile,
      (brand, _refs) => loadCandidatePropertiesFromSupabase(brand, profile, 120),
    );
    const guarded = applyLeadPropertyLocationGuard(result, profile);

    return {
      prepared: true,
      reason: guarded.matches.length > 0 ? "MATCHES_READY" : "NO_MATCHES_FOUND",
      analyzed: guarded.analyzed,
      matched: guarded.matched,
      properties: guarded.matches.slice(0, 5).map((match) => ({
        id: match.property.id,
        reference: match.property.reference,
        title: match.property.title,
        location: match.property.location,
        propertyType: match.property.propertyType,
        price: match.property.price,
        publicUrl: match.property.publicUrl,
      })),
    };
  } catch (error) {
    console.warn("[email-crm-sync] property match preparation failed", {
      brandId: input.brandId,
      buyerProfileId: input.buyerProfileId,
      error: error instanceof Error ? error.message : String(error),
    });
    return skipped("MATCH_PREPARATION_FAILED");
  }
}
