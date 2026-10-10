/**
 * Only specially generated advisor composites require a recorded human sign-off.
 * Ordinary listing/brand assets retain the existing media admission rules.
 */
export async function advisorCompositeApprovalStatus(
  supabase: any,
  imageUrl: string,
  brandKey?: string,
  propertyId?: string,
  expectedAssetId?: string,
): Promise<{ allowed: boolean; advisorFound: boolean }> {
  if (!imageUrl) return { allowed: true, advisorFound: false };
  const lookups = await Promise.all([
    supabase.from("media_assets")
      .select("id,brand_id,property_id,job_id,metadata_json,deleted_at")
      .eq("public_url", imageUrl).limit(8),
    supabase.from("media_assets")
      .select("id,brand_id,property_id,job_id,metadata_json,deleted_at")
      .eq("thumbnail_url", imageUrl).limit(8),
  ]);
  if (lookups.some(result => result.error)) return { allowed: false, advisorFound: false };
  const assets = [...(lookups[0].data || []), ...(lookups[1].data || [])];
  if (!assets.length) return { allowed: !expectedAssetId, advisorFound: false };
  if (expectedAssetId && !assets.some(asset => asset.id === expectedAssetId)) {
    return { allowed: false, advisorFound: false };
  }
  let advisorFound = false;
  for (const asset of assets) {
    if (!asset.job_id) continue;
    const { data: job, error } = await supabase.from("media_generation_jobs")
      .select("id,idempotency_key,status,brand_id,property_id")
      .eq("id", asset.job_id).maybeSingle();
    if (error || !job) return { allowed: false, advisorFound };
    if (!String(job.idempotency_key || "").startsWith("advisor-composite:")) continue;
    advisorFound = true;
    const approval = asset.metadata_json?.advisorManualApproval;
    if (asset.deleted_at || job.status !== "completed" || approval?.approved !== true ||
        !approval?.approvedAt || !approval?.approvedBy ||
        !approval?.checks?.identity || !approval?.checks?.property || !approval?.checks?.perspective ||
        approval.propertyId !== asset.property_id ||
        job.property_id !== asset.property_id ||
        job.brand_id !== asset.brand_id ||
        (brandKey && asset.brand_id !== brandKey) ||
        (propertyId && asset.property_id !== propertyId)) return { allowed: false, advisorFound };
  }
  return { allowed: !expectedAssetId || advisorFound, advisorFound };
}

export async function advisorCompositeHasManualApproval(
  supabase: any, imageUrl: string, brandKey?: string, propertyId?: string, expectedAssetId?: string,
): Promise<boolean> {
  return (await advisorCompositeApprovalStatus(supabase, imageUrl, brandKey, propertyId, expectedAssetId)).allowed;
}
