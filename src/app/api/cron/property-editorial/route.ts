export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCronApi } from "@/lib/api-cron";
import {
  buildPropertyEditorialSeo,
  existingEditorialHasSameSource,
  propertyEditorialSource,
} from "@/lib/realty/property-editorial-no";
import { generatePropertyEditorialNoDiagnosed } from "@/lib/realty/property-editorial-ai-diagnostics";
import {
  evaluatePropertyEditorialApproval,
  normalizePropertyForEditorial,
} from "@/lib/realty/property-editorial-quality";

export const maxDuration = 120;

const JOB_LIMIT = 6;
const MAX_ATTEMPTS = 5;
const STALE_PROCESSING_MINUTES = 15;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function editorialDescription(editorial: { intro_no: string; bullets_no: string[] }) {
  const bullets = editorial.bullets_no.map((item) => `• ${item}`).join("\n");
  return [editorial.intro_no, bullets].filter(Boolean).join("\n");
}

function retryAt(attempts: number) {
  const delayMinutes = Math.min(2 ** Math.max(attempts - 1, 0) * 5, 60);
  return new Date(Date.now() + delayMinutes * 60_000).toISOString();
}

function configuredAiProviders() {
  return [
    process.env.ANTHROPIC_API_KEY ? "anthropic" : null,
    process.env.GEMINI_API_KEY ? "gemini" : null,
    process.env.OPENAI_API_KEY ? "openai" : null,
  ].filter((provider): provider is string => Boolean(provider));
}

export async function GET(request: NextRequest) {
  const unauthorized = requireCronApi(request);
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const nowDate = new Date();
  const now = nowDate.toISOString();
  const staleBefore = new Date(nowDate.getTime() - STALE_PROCESSING_MINUTES * 60_000).toISOString();

  await supabase
    .from("property_editorial_jobs")
    .update({
      status: "retry",
      available_at: now,
      last_error: "Recovered stale processing job",
      updated_at: now,
    })
    .eq("status", "processing")
    .lt("updated_at", staleBefore);

  await supabase
    .from("property_feed_source_cache")
    .delete()
    .lt("expires_at", new Date(nowDate.getTime() - 24 * 60 * 60 * 1000).toISOString());

  const { data: jobs, error: jobsError } = await supabase
    .from("property_editorial_jobs")
    .select("id,property_id,status,attempts")
    .in("status", ["queued", "retry"])
    .lte("available_at", now)
    .order("available_at", { ascending: true })
    .limit(JOB_LIMIT);

  if (jobsError) {
    return NextResponse.json({ error: jobsError.message }, { status: 500 });
  }

  if (!jobs || jobs.length === 0) {
    return NextResponse.json({ success: true, processed: 0, generated: 0, reused: 0, fallbacks: 0, failed: 0 });
  }

  const results = await Promise.all(
    jobs.map(async (job) => {
      const { data: claimed, error: claimError } = await supabase
        .from("property_editorial_jobs")
        .update({ status: "processing", updated_at: new Date().toISOString() })
        .eq("id", job.id)
        .in("status", ["queued", "retry"])
        .select("id,property_id,attempts")
        .maybeSingle();

      if (claimError || !claimed) {
        return { status: "skipped" as const };
      }

      try {
        const { data: property, error: propertyError } = await supabase
          .from("properties")
          .select(
            "id,ref,property_type,type,bedrooms,bathrooms,location,built_area,floor_label,amenities_no,energy_rating,price,source_description,description,description_no,facing_source,usage_source,pool,garage,editorial_no,editorial_no_approved",
          )
          .eq("id", claimed.property_id)
          .maybeSingle();

        if (propertyError) throw propertyError;
        if (!property) {
          await supabase.from("property_editorial_jobs").delete().eq("id", claimed.id);
          return { status: "removed" as const };
        }

        const editorialProperty = normalizePropertyForEditorial(property);

        if (existingEditorialHasSameSource(editorialProperty, property.editorial_no)) {
          // Existing editorial can predate the SEO columns. Reuse the copy/source but
          // always backfill deterministic SEO so source-hash reuse cannot leave holes.
          const seo = buildPropertyEditorialSeo(propertyEditorialSource(editorialProperty));
          const existingEditorial = property.editorial_no;
          const { error: reuseUpdateError } = await supabase
            .from("properties")
            .update({
              editorial_no: { ...existingEditorial, ...seo },
              meta_title_no: seo.meta_title_no,
              meta_description_no: seo.meta_description_no,
            })
            .eq("id", property.id);
          if (reuseUpdateError) throw reuseUpdateError;
          await supabase.from("property_editorial_jobs").delete().eq("id", claimed.id);
          return { status: "reused" as const };
        }

        const providers = configuredAiProviders();
        const { editorial, usedFallback, fallbackReason, outputDiagnostics } =
          await generatePropertyEditorialNoDiagnosed(editorialProperty);
        const approval = evaluatePropertyEditorialApproval(property, editorial);
        const editorialWithProvenance = {
          ...editorial,
          generation_mode: usedFallback ? "template" : "ai",
          configured_ai_providers: providers,
          approval_status: approval.status,
          approval_reasons: approval.reasons,
          ...(usedFallback && fallbackReason ? { fallback_reason: fallbackReason } : {}),
          ...(usedFallback && outputDiagnostics
            ? { ai_output_diagnostics: outputDiagnostics }
            : {}),
        };

        const { error: updateError } = await supabase
          .from("properties")
          .update({
            editorial_no: editorialWithProvenance,
            editorial_no_approved: approval.approved,
            title_no: editorial.headline_no,
            description_no: editorialDescription(editorial),
            meta_title_no: editorial.meta_title_no,
            meta_description_no: editorial.meta_description_no,
          })
          .eq("id", property.id);

        if (updateError) throw updateError;
        await supabase.from("property_editorial_jobs").delete().eq("id", claimed.id);
        return {
          status: usedFallback ? ("fallback" as const) : ("generated" as const),
          approval: approval.status,
        };
      } catch (error) {
        const attempts = Number(claimed.attempts || 0) + 1;
        const exhausted = attempts >= MAX_ATTEMPTS;
        const message = error instanceof Error ? error.message : String(error);
        await supabase
          .from("property_editorial_jobs")
          .update({
            status: exhausted ? "failed" : "retry",
            attempts,
            available_at: exhausted ? new Date().toISOString() : retryAt(attempts),
            last_error: message.slice(0, 2000),
            updated_at: new Date().toISOString(),
          })
          .eq("id", claimed.id);
        return { status: "failed" as const };
      }
    }),
  );

  const count = (status: string) => results.filter((result) => result.status === status).length;
  return NextResponse.json({
    success: true,
    processed: results.length,
    generated: count("generated"),
    reused: count("reused"),
    fallbacks: count("fallback"),
    failed: count("failed"),
    skipped: count("skipped"),
    autoApproved: results.filter((result) => "approval" in result && result.approval === "auto_approved").length,
    needsReview: results.filter((result) => "approval" in result && result.approval === "needs_review").length,
  });
}
