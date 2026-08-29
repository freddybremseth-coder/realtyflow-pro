import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { inferBookKind, qualityTaxonomyReadiness } from "@/lib/publishing/quality-taxonomy";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

function unavailable(message: string) {
  return /publishing_(work_bibles|revision_quality|taxonomy|edition_taxonomy)|schema cache|does not exist|relation/i.test(message);
}

function objectValue(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(stable(value)).digest("hex");
}

function nextAction(input: { canonicalRevision: boolean; canImport: boolean; draftBibleIds: string[]; readiness: ReturnType<typeof qualityTaxonomyReadiness> }) {
  if (!input.canonicalRevision) return { code: "select_revision", label: "Velg kanonisk manusrevisjon" };
  if (input.readiness.missingBibles.length) {
    if (input.draftBibleIds.length) return { code: "approve_bibles", label: "Godkjenn seriebibel og canon" };
    if (input.canImport) return { code: "import_bibles", label: "Importer eksisterende seriebibel og canon" };
    return { code: "build_bibles", label: "Bygg seriebibel og canon" };
  }
  if (input.readiness.missingChecks.length) return { code: "quality_check", label: `Kjør kvalitetskontroll: ${input.readiness.missingChecks[0]}` };
  if (input.readiness.taxonomyIssues.length) return { code: "taxonomy", label: "Fullfør kategorier og 5–7 søkeord" };
  return { code: "ready", label: "Kvalitet og metadata er klare" };
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const [worksRes, editionsRes, revisionsRes, biblesRes, checksRes, taxonomyRes, projectsRes] = await Promise.all([
    supabase.from("publishing_catalog_works").select("id,canonical_title,series_name,status").neq("status", "archived").order("canonical_title"),
    supabase.from("publishing_catalog_editions").select("id,work_id,title,language,format,status,canonical_project_id").neq("status", "retired"),
    supabase.from("publishing_catalog_revisions").select("id,edition_id,revision_number,status,is_canonical").order("revision_number", { ascending: false }),
    supabase.from("publishing_work_bibles").select("id,work_id,source_project_id,bible_type,version,status,change_summary,approved_by,approved_at,created_at").order("version", { ascending: false }),
    supabase.from("publishing_revision_quality_checks").select("id,revision_id,check_type,attempt,result,decision,score,summary,decided_by,decided_at").order("attempt", { ascending: false }),
    supabase.from("publishing_edition_taxonomy_assignments").select("id,edition_id,revision_id,assignment_type,status,scheme,channel,code,label,rank"),
    supabase.from("publishing_book_projects").select("id,title,niche,series_name,metadata_plan,status,updated_at"),
  ]);
  const error = worksRes.error || editionsRes.error || revisionsRes.error || biblesRes.error || checksRes.error || taxonomyRes.error || projectsRes.error;
  if (error) return NextResponse.json({ available: false, error: unavailable(error.message) ? "Quality Center-migreringen er ikke installert ennå." : error.message }, { status: unavailable(error.message) ? 503 : 500 });

  const works = worksRes.data ?? [];
  const editions = editionsRes.data ?? [];
  const revisions = revisionsRes.data ?? [];
  const bibles = biblesRes.data ?? [];
  const checks = checksRes.data ?? [];
  const taxonomy = taxonomyRes.data ?? [];
  const projects = projectsRes.data ?? [];
  const projectById = new Map(projects.map((row: any) => [String(row.id), row]));
  const workById = new Map(works.map((row: any) => [String(row.id), row]));

  const rows = editions.map((edition: any) => {
    const work: any = workById.get(String(edition.work_id)) ?? {};
    const project: any = projectById.get(String(edition.canonical_project_id)) ?? null;
    const metadata = objectValue(project?.metadata_plan);
    const canonicalRevision: any = revisions.find((row: any) => row.edition_id === edition.id && row.is_canonical) ?? null;
    const workBibles = bibles.filter((row: any) => row.work_id === edition.work_id);
    const revisionChecks = canonicalRevision ? checks.filter((row: any) => row.revision_id === canonicalRevision.id) : [];
    const editionTaxonomy = taxonomy.filter((row: any) => row.edition_id === edition.id && (!row.revision_id || row.revision_id === canonicalRevision?.id));
    const kind = inferBookKind(project?.niche, metadata.genre, metadata.book_type, metadata.format);
    const seriesBook = Boolean(work.series_name || project?.series_name);
    const readiness = qualityTaxonomyReadiness({ kind, seriesBook, bibles: workBibles as any, checks: revisionChecks as any, taxonomy: editionTaxonomy as any });
    const draftBibleIds = workBibles
      .filter((row: any) => readiness.missingBibles.includes(row.bible_type) && ["draft", "review"].includes(row.status))
      .filter((row: any, index: number, all: any[]) => all.findIndex((candidate: any) => candidate.bible_type === row.bible_type) === index)
      .map((row: any) => String(row.id));
    const productionBible = objectValue(metadata.production_bible);
    const hasWorkCanonSource = Object.keys(productionBible).length > 0 || Object.keys(objectValue(metadata.book_bible)).length > 0;
    const hasSeriesBibleSource = Boolean(project?.series_name && Object.keys(objectValue(productionBible.series_canon)).length > 0);
    const canImport = (readiness.missingBibles.includes("work_canon") && hasWorkCanonSource)
      || (readiness.missingBibles.includes("series_bible") && hasSeriesBibleSource);
    return {
      editionId: edition.id,
      workId: edition.work_id,
      title: work.canonical_title || edition.title,
      seriesName: work.series_name || project?.series_name || null,
      language: edition.language,
      format: edition.format,
      kind,
      canonicalRevision,
      canImport,
      bibles: workBibles,
      draftBibleIds,
      readiness,
      nextAction: nextAction({ canonicalRevision: Boolean(canonicalRevision), canImport, draftBibleIds, readiness }),
    };
  }).sort((a: any, b: any) => Number(a.readiness.ready) - Number(b.readiness.ready) || a.title.localeCompare(b.title));

  return NextResponse.json({
    available: true,
    summary: {
      editions: rows.length,
      ready: rows.filter((row: any) => row.readiness.ready).length,
      needsBible: rows.filter((row: any) => row.readiness.missingBibles.length).length,
      needsQuality: rows.filter((row: any) => row.readiness.missingChecks.length).length,
      needsTaxonomy: rows.filter((row: any) => row.readiness.taxonomyIssues.length).length,
    },
    editions: rows,
  });
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const action = String(body?.action ?? "");

  if (action === "approve_bible_bundle") {
    const bibleIds = Array.isArray(body?.bibleIds) ? [...new Set(body.bibleIds.map(String).map((id: string) => id.trim()).filter(Boolean))].slice(0, 4) : [];
    if (!bibleIds.length) return NextResponse.json({ error: "Velg seriebibel/canon som skal godkjennes" }, { status: 400 });
    const { data, error } = await supabase.rpc("publishing_approve_work_bible_bundle", { bible_ids: bibleIds, actor: "admin_ui" });
    if (error) return NextResponse.json({ error: error.message }, { status: unavailable(error.message) ? 503 : 409 });
    return NextResponse.json({ ok: true, action, result: data });
  }

  if (action !== "import_existing_bibles") return NextResponse.json({ error: "Ugyldig handling" }, { status: 400 });
  const editionId = typeof body?.editionId === "string" ? body.editionId.trim() : "";
  if (!editionId) return NextResponse.json({ error: "editionId er påkrevd" }, { status: 400 });

  const { data: edition, error: editionError } = await supabase.from("publishing_catalog_editions").select("id,work_id,canonical_project_id").eq("id", editionId).maybeSingle();
  if (editionError) return NextResponse.json({ error: editionError.message }, { status: 500 });
  if (!edition?.canonical_project_id) return NextResponse.json({ error: "Utgaven er ikke koblet til et manusprosjekt" }, { status: 409 });
  const { data: project, error: projectError } = await supabase.from("publishing_book_projects").select("id,series_name,metadata_plan").eq("id", edition.canonical_project_id).maybeSingle();
  if (projectError) return NextResponse.json({ error: projectError.message }, { status: 500 });
  if (!project) return NextResponse.json({ error: "Manusprosjektet finnes ikke" }, { status: 404 });

  const metadata = objectValue(project.metadata_plan);
  const productionBible = objectValue(metadata.production_bible);
  const bookBible = objectValue(metadata.book_bible);
  const candidates: Array<{ bible_type: "series_bible" | "work_canon"; content: Record<string, any> }> = [];
  const workCanon = { production_bible: productionBible, book_bible: bookBible };
  if (Object.keys(productionBible).length || Object.keys(bookBible).length) candidates.push({ bible_type: "work_canon", content: workCanon });
  const seriesCanon = objectValue(productionBible.series_canon);
  if (project.series_name && Object.keys(seriesCanon).length) candidates.push({ bible_type: "series_bible", content: { series_name: project.series_name, series_canon: seriesCanon, editorial_line: objectValue(productionBible.editorial_line) } });
  if (!candidates.length) return NextResponse.json({ error: "Fant ingen eksisterende seriebibel eller canon i prosjektet" }, { status: 409 });

  const { data: existing, error: existingError } = await supabase.from("publishing_work_bibles").select("id,bible_type,version,content_fingerprint").eq("work_id", edition.work_id);
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: unavailable(existingError.message) ? 503 : 500 });
  const inserts = candidates.flatMap((candidate) => {
    const contentFingerprint = fingerprint(candidate.content);
    const same = (existing ?? []).some((row: any) => row.bible_type === candidate.bible_type && row.content_fingerprint === contentFingerprint);
    if (same) return [];
    const version = Math.max(0, ...(existing ?? []).filter((row: any) => row.bible_type === candidate.bible_type).map((row: any) => Number(row.version) || 0)) + 1;
    return [{ work_id: edition.work_id, source_project_id: project.id, bible_type: candidate.bible_type, version, status: "review", content: candidate.content, content_fingerprint: contentFingerprint, change_summary: "Importert fra eksisterende produksjonsbibel; krever eksplisitt godkjenning." }];
  });
  if (!inserts.length) return NextResponse.json({ ok: true, action, created: 0, message: "Samme versjon er allerede importert." });
  const { data, error } = await supabase.from("publishing_work_bibles").insert(inserts).select("id,bible_type,version,status");
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  return NextResponse.json({ ok: true, action, created: data?.length ?? 0, bibles: data });
}
