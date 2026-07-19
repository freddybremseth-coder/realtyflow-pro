import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { POST as legacyProfileImportPost } from "@/lib/demosites-profile-import";
import { upgradeProfileImportResult, type LocalIndustryProfile } from "@/lib/demosites-local-industries";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env[["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_")];
  if (!url || !key) return null;
  return createClient(url, key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value: unknown, max = 160) {
  return String(value || "").trim().slice(0, max);
}

function optionalColumnError(error: unknown) {
  const message = `${(error as { code?: string; message?: string })?.code || ""} ${(error as { message?: string })?.message || ""}`.toLowerCase();
  return message.includes("schema cache") || message.includes("recommended_template_slug") || message.includes("profile_import_status");
}

async function persistQualityCheckedResult(input: {
  orderId: string;
  importId: string;
  profile: LocalIndustryProfile;
  editableFields: Record<string, unknown>;
  warnings: string[];
}) {
  const supabase = getSupabase();
  if (!supabase) return;

  if (input.importId) {
    await supabase
      .from("demo_site_imports")
      .update({
        detected_industry: input.profile.detected_industry || null,
        recommended_template_slug: input.profile.recommended_template_slug || null,
        confidence_score: input.profile.confidence_score || null,
        profile: input.profile,
        editable_fields: input.editableFields,
        warnings: input.warnings,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.importId);
  }

  if (!input.orderId) return;
  const existing = await supabase
    .from("demo_site_orders")
    .select("id, editable_fields")
    .eq("id", input.orderId)
    .maybeSingle();
  if (existing.error || !existing.data?.id) return;

  const currentFields = isRecord(existing.data.editable_fields) ? existing.data.editable_fields : {};
  const currentContact = isRecord(currentFields.contact_info) ? currentFields.contact_info : {};
  const nextContact = isRecord(input.editableFields.contact_info) ? input.editableFields.contact_info : {};
  const mergedFields = {
    ...currentFields,
    ...input.editableFields,
    contact_info: { ...currentContact, ...nextContact },
  };
  const basePatch = {
    extracted_profile: input.profile,
    editable_fields: mergedFields,
    updated_at: new Date().toISOString(),
  };
  const enhancedPatch = {
    ...basePatch,
    recommended_template_slug: input.profile.recommended_template_slug || null,
    profile_import_status: "needs_review",
    import_confidence_score: input.profile.confidence_score || null,
  };

  const first = await supabase.from("demo_site_orders").update(enhancedPatch).eq("id", input.orderId);
  if (first.error && optionalColumnError(first.error)) {
    await supabase.from("demo_site_orders").update(basePatch).eq("id", input.orderId);
  }
}

/**
 * V2 wrapper around the existing crawler. The crawler still owns safe fetching,
 * extraction and import history; this layer quality-checks the selected industry
 * using weighted source zones before the result reaches the user or an order.
 */
export async function POST(request: NextRequest) {
  const bodyPromise = request
    .clone()
    .json()
    .catch(() => ({} as Record<string, unknown>));
  const legacyResponse = await legacyProfileImportPost(request);
  if (!legacyResponse.ok) return legacyResponse;

  const [body, raw] = await Promise.all([
    bodyPromise,
    legacyResponse.clone().json().catch(() => null),
  ]);
  if (!isRecord(raw) || !isRecord(raw.profile) || !isRecord(raw.editable_fields)) return legacyResponse;

  const upgraded = upgradeProfileImportResult({
    profile: raw.profile as LocalIndustryProfile,
    editable_fields: raw.editable_fields,
    warnings: Array.isArray(raw.warnings) ? raw.warnings.map(String) : [],
  });
  if (!upgraded.changed) return legacyResponse;

  const normalizedWarnings = Array.isArray(upgraded.warnings) ? upgraded.warnings : [];
  const orderId = text(body.order_id ?? body.orderId, 120);
  const importId = text(raw.import_id, 120);
  await persistQualityCheckedResult({
    orderId,
    importId,
    profile: upgraded.profile,
    editableFields: upgraded.editable_fields,
    warnings: normalizedWarnings,
  }).catch((error) => {
    console.warn("[DemoSites profile import v2] Could not persist upgraded classification:", error);
  });

  return NextResponse.json({
    ...raw,
    profile: upgraded.profile,
    editable_fields: upgraded.editable_fields,
    warnings: normalizedWarnings,
    classification_upgraded: true,
  });
}
