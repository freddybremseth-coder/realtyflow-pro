export interface LocationLearningQuality {
  learningEligible: boolean;
  reason: string | null;
}

function normalizePlace(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9æøå]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const BROAD_REGION_ONLY = /^(?:costa blanca(?: north| south)?(?: inland)?|costa calida(?: inland)?|alicante(?: province)?|murcia(?: region)?)$/;

export function assessLocationLearningQuality(
  historicalAssetLocation: string | null | undefined,
  verifiedSubjectLocation: string | null | undefined,
): LocationLearningQuality {
  const historical = normalizePlace(historicalAssetLocation);
  const verified = normalizePlace(verifiedSubjectLocation);

  if (!historical || !verified || BROAD_REGION_ONLY.test(historical) || BROAD_REGION_ONLY.test(verified)) {
    return { learningEligible: true, reason: null };
  }

  if (historical === verified) {
    return { learningEligible: true, reason: null };
  }

  return { learningEligible: false, reason: "historical_asset_location_conflict" };
}
