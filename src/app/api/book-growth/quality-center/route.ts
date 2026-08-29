import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { inferBookKind, qualityTaxonomyReadiness } from "@/lib/publishing/quality-taxonomy";
import { AI_QUALITY_CHECKS, reviewBookQuality, type AiQualityCheckType } from "@/services/ai/book-quality-reviewer";
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

function nextAction(input: { canonicalRevision: boolean; canImport: boolean; draftBibleIds: string[]; readiness: ReturnType<typeof qualityTaxonomyReadiness>; checks: any[] }) {
  if (!input.canonicalRevision) return { code: "select_revision", label: "Velg kanonisk manusrevisjon" };
  if (input.readiness.missingBibles.length) {
    if (input.draftBibleIds.length) return { code: "approve_bibles", label: "Godkjenn seriebibel og canon" };
    if (input.canImport) return { code: "import_bibles", label: "Importer eksisterende seriebibel og canon" };
    return { code: "build_bibles", label: "Bygg seriebibel og canon" };
  }
  if (input.readiness.missingChecks.length) {
    const checkType = input.readiness.missingChecks[0];
    const latest = input.checks.find((row) => row.check_type === checkType);
    if (latest?.result === "running") return { code: "quality_running", label: `Kontrollerer: ${checkType}`, checkType };
    if (latest?.decision === "pending" && ["pass", "warning"].includes(latest.result)) {
      return { code: "approve_quality", label: `Vurder kontroll: ${checkType}`, checkType, checkId: latest.id };
    }
    if (AI_QUALITY_CHECKS.includes(checkType as AiQualityCheckType)) return { code: "run_quality", label: `Kjør OpenAI-kontroll: ${checkType}`, checkType };
    return { code: "quality_check", label: `Kjør kvalitetskontroll: ${checkType}` };
  }
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
    supabase.from("publishing_revision_quality_checks").select("id,revision_id,check_type,attempt,result,decision,score,summary,evidence,decided_by,decided_at").order("attempt", { ascending: false }),
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
      checks: revisionChecks,
      readiness,
      nextAction: nextAction({ canonicalRevision: Boolean(canonicalRevision), canImport, draftBibleIds, readiness, checks: revisionChecks }),
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

  if (action === "run_quality_check") {
    const revisionId = typeof body?.revisionId === "string" ? body.revisionId.trim() : "";
    const checkType = String(body?.checkType ?? "") as AiQualityCheckType;
    if (!revisionId || !AI_QUALITY_CHECKS.includes(checkType)) return NextResponse.json({ error: "Ugyldig revisjon eller kontrolltype" }, { status: 400 });
    const { data: revision, error: revisionError } = await supabase.from("publishing_catalog_revisions").select("id,edition_id,project_id,is_canonical,content_fingerprint").eq("id", revisionId).maybeSingle();
    if (revisionError) return NextResponse.json({ error: revisionError.message }, { status: 500 });
    if (!revision?.is_canonical || !revision.project_id) return NextResponse.json({ error: "Kontrollen krever en kanonisk revisjon koblet til et manusprosjekt" }, { status: 409 });
    const [{ data: project, error: projectError }, { data: edition, error: editionError }] = await Promise.all([
      supabase.from("publishing_book_projects").select("id,title,chapter_drafts").eq("id", revision.project_id).maybeSingle(),
      supabase.from("publishing_catalog_editions").select("id,work_id,title").eq("id", revision.edition_id).maybeSingle(),
    ]);
    const lookupError = projectError || editionError;
    if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 });
    if (!project || !edition) return NextResponse.json({ error: "Fant ikke manusprosjekt eller utgave" }, { status: 404 });
    const { data: bibles, error: biblesError } = await supabase.from("publishing_work_bibles").select("bible_type,version,content").eq("work_id", edition.work_id).eq("status", "approved");
    if (biblesError) return NextResponse.json({ error: biblesError.message }, { status: 500 });
    const { data: attempts, error: attemptsError } = await supabase.from("publishing_revision_quality_checks").select("attempt").eq("revision_id", revisionId).eq("check_type", checkType).order("attempt", { ascending: false }).limit(1);
    if (attemptsError) return NextResponse.json({ error: attemptsError.message }, { status: 500 });
    const attempt = Number(attempts?.[0]?.attempt ?? 0) + 1;
    const model = process.env.OPENAI_BOOK_MODEL || "gpt-5.6";
    const { data: created, error: createError } = await supabase.from("publishing_revision_quality_checks").insert({
      revision_id: revisionId, check_type: checkType, attempt, result: "running", decision: "pending", automated: true,
      provider: "openai", model, started_at: new Date().toISOString(),
      evidence: { content_fingerprint: revision.content_fingerprint },
    }).select("id").single();
    if (createError) return NextResponse.json({ error: createError.message }, { status: 409 });
    try {
      const review = await reviewBookQuality({ type: checkType, title: project.title || edition.title, chapters: Array.isArray(project.chapter_drafts) ? project.chapter_drafts : [], canon: bibles ?? [] });
      const { error: updateError } = await supabase.from("publishing_revision_quality_checks").update({
        result: review.result, score: review.score, summary: review.summary,
        evidence: { content_fingerprint: revision.content_fingerprint, findings: review.findings, web_sources: review.webSources, coverage: review.coverage },
        completed_at: new Date().toISOString(),
      }).eq("id", created.id);
      if (updateError) throw updateError;
      return NextResponse.json({ ok: true, action, checkId: created.id, result: review.result, decision: "pending" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "OpenAI-kontrollen mislyktes";
      await supabase.from("publishing_revision_quality_checks").update({ result: "error", summary: message.slice(0, 1000), completed_at: new Date().toISOString() }).eq("id", created.id);
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  if (action === "decide_quality_check") {
    const checkId = typeof body?.checkId === "string" ? body.checkId.trim() : "";
    const decision = body?.decision === "approved" || body?.decision === "rejected" ? body.decision : "";
    if (!checkId || !decision) return NextResponse.json({ error: "Ugyldig kvalitetsbeslutning" }, { status: 400 });
    const { data: check, error: checkError } = await supabase.from("publishing_revision_quality_checks").select("id,result,decision").eq("id", checkId).maybeSingle();
    if (checkError) return NextResponse.json({ error: checkError.message }, { status: 500 });
    if (!check || check.decision !== "pending") return NextResponse.json({ error: "Kontrollen er allerede behandlet eller finnes ikke" }, { status: 409 });
    if (decision === "approved" && !["pass", "warning"].includes(check.result)) return NextResponse.json({ error: "En kontroll med feil kan ikke godkjennes" }, { status: 409 });
    const { data, error } = await supabase.from("publishing_revision_quality_checks").update({ decision, decided_by: "admin_ui", decided_at: new Date().toISOString(), decision_reason: typeof body?.reason === "string" ? body.reason.slice(0, 1000) : null }).eq("id", checkId).eq("decision", "pending").select("id,decision").maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 409 });
    if (!data) return NextResponse.json({ error: "Beslutningen ble endret av en annen prosess" }, { status: 409 });
    return NextResponse.json({ ok: true, action, check: data });
  }

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
