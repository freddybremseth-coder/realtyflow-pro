import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { bookProjectCoverUrl, fetchBookImage } from "@/lib/publishing/book-project-docx-export";
import { bookProductionHandoffIdentity } from "@/lib/publishing/book-production-handoff";
import { productionHandoffPreflight } from "@/lib/publishing/book-production-handoff-preflight";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const id = String(request.nextUrl.searchParams.get("id") || "").trim();
  const revisionNumber = Math.max(1, Math.trunc(Number(request.nextUrl.searchParams.get("revisionNumber") || 1)));
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { data, error } = await supabase.from("publishing_book_projects").select("*").eq("id", id).single();
  if (error || !data) return NextResponse.json({ error: error?.message || "Book project not found" }, { status: 404 });
  const project = data as Record<string, any>;
  const coverUrl = bookProjectCoverUrl(project);
  const cover = coverUrl ? await fetchBookImage(coverUrl) : null;
  const preflight = productionHandoffPreflight(project, Boolean(cover));
  if (cover && cover.type !== "jpg" && cover.type !== "png") {
    preflight.blocking.push(`Print production requires a JPG or PNG canonical cover; received ${cover.type}.`);
    preflight.ok = false;
    preflight.productionStatus = "incomplete";
  }

  const identity = bookProductionHandoffIdentity(project, revisionNumber);
  const { data: existing, error: existingError } = await supabase
    .from("publishing_package_ingests")
    .select("id,ingest_key,status,created_at,package_fingerprint")
    .eq("ingest_key", identity.ingestKey)
    .maybeSingle();

  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  if (existing) {
    preflight.blocking.push(`Revision ${revisionNumber} already has a Book OS package ingest. Use a new revision number for changed content.`);
    preflight.ok = false;
    preflight.productionStatus = "incomplete";
  }

  return NextResponse.json({
    ok: true,
    project: {
      id: project.id,
      title: project.title,
      subtitle: project.subtitle,
      seriesName: project.series_name,
      language: project.language || "en",
      status: project.status,
      updatedAt: project.updated_at,
    },
    identity,
    preflight,
    cover: cover ? { retrievable: true, type: cover.type, url: coverUrl } : { retrievable: false, type: null, url: coverUrl },
    existingIngest: existing || null,
    writesPerformed: false,
  });
}
