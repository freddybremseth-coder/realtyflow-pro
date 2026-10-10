/**
 * Only specially generated advisor composites require a recorded human sign-off.
 * Ordinary listing/brand assets retain the existing media admission rules.
 */
export async function advisorCompositeHasManualApproval(
  supabase: any,
  imageUrl: string,
  brandKey?: string,
  propertyId?: string,
): Promise<boolean> {
  if (!imageUrl) return true;
  const lookups = await Promise.all([
    supabase.from("media_assets")
      .select("id,brand_id,property_id,job_id,metadata_json")
      .eq("public_url", imageUrl).is("deleted_at", null).limit(2),
    supabase.from("media_assets")
      .select("id,brand_id,property_id,job_id,metadata_json")
      .eq("thumbnail_url", imageUrl).is("deleted_at", null).limit(2),
  ]);
  if (lookups.some(result => result.error)) return false;
  const assets = [...(lookups[0].data || []), ...(lookups[1].data || [])];
  if (!assets.length) return true;
  for (const asset of assets) {
    if (!asset.job_id) continue;
    const { data: job, error } = await supabase.from("media_generation_jobs")
      .select("id,idempotency_key,status,brand_id,property_id")
      .eq("id", asset.job_id).maybeSingle();
    if (error || !job) return false;
    if (!String(job.idempotency_key || "").startsWith("advisor-composite:")) continue;
    const approval = asset.metadata_json?.advisorManualApproval;
    if (job.status !== "completed" || approval?.approved !== true ||
        !approval?.approvedAt || !approval?.approvedBy ||
        !approval?.checks?.identity || !approval?.checks?.property || !approval?.checks?.perspective ||
        approval.propertyId !== asset.property_id ||
        job.property_id !== asset.property_id ||
        job.brand_id !== asset.brand_id ||
        (brandKey && asset.brand_id !== brandKey) ||
        (propertyId && asset.property_id !== propertyId)) return false;
  }
  return true;
}
