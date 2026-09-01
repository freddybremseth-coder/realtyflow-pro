import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { publicationPackageGateSummary, validatePublicationPackageManifest } from "@/lib/publishing/publication-package";
import { qualityCenterHref } from "@/lib/publishing/book-os-quality-center-link";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

function unavailable(message: string) {
  return /publishing_package_ingests|publishing_ingest_publication_package|schema cache|does not exist|relation/i.test(message);
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const { data, error } = await supabase
    .from("publishing_package_ingests")
    .select("id,ingest_key,work_id,edition_id,revision_id,package_fingerprint,source,status,actor,created_at,manifest")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    return NextResponse.json(
      { available: false, error: error.message },
      { status: unavailable(error.message) ? 503 : 500 },
    );
  }
  return NextResponse.json({ available: true, ingests: data ?? [] });
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const body = await request.json().catch(() => null);
  const action = body && typeof body === "object" && "action" in body ? String((body as any).action ?? "ingest") : "ingest";
  const input = body && typeof body === "object" && "manifest" in body ? (body as any).manifest : body;
  const validation = validatePublicationPackageManifest(input);
  if (!validation.ok) return NextResponse.json({ error: "Invalid publication package", details: validation.errors }, { status: 400 });

  const gateSummary = publicationPackageGateSummary(validation.manifest);
  if (action === "preview") {
    return NextResponse.json({ ok: true, action, manifest: validation.manifest, warnings: validation.warnings, gates: gateSummary });
  }
  if (action !== "ingest") return NextResponse.json({ error: "action must be preview or ingest" }, { status: 400 });

  const actor = typeof (body as any)?.actor === "string" && (body as any).actor.trim() ? (body as any).actor.trim() : "admin_ui";
  const { data, error } = await supabase.rpc("publishing_ingest_publication_package", {
    p_manifest: validation.manifest,
    p_actor: actor,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: unavailable(error.message) ? 503 : 409 });

  const result = Array.isArray(data) ? data[0] : data;
  const next = qualityCenterHref({
    editionId: result && typeof result === "object" ? String((result as any).edition_id || "") : "",
    revisionId: result && typeof result === "object" ? String((result as any).revision_id || "") : "",
  });

  return NextResponse.json({
    ok: true,
    action,
    result,
    warnings: validation.warnings,
    gates: gateSummary,
    downstream: {
      next,
      autoApproved: false,
      autoPublished: false,
      note: "Package ingest registers production output; all existing Book OS approval and release gates remain mandatory.",
    },
  });
}
