import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/api-admin";
import { buildConnectorEnvelope } from "@/lib/publishing/connector-contract";
import {
  PUBLISHING_CHANNELS,
  PUBLISHING_CHANNEL_IDS,
  evaluateDistributionPreflight,
  type DistributionPackage,
  type PublishingChannelId,
} from "@/lib/publishing/distribution";
import { getServiceSupabase } from "@/services/marketing/campaign-production";
import { runApprovedDirectStoreJobs } from "@/services/publishing/connectors/direct-store";
import { isDistributionReady, publicationApproval, verifiedAmazonProjectIds } from "@/lib/publishing/book-workflow";

export const dynamic = "force-dynamic";

const prepareSchema = z.object({
  action: z.literal("prepare"),
  projectId: z.string().uuid(),
  channels: z.array(z.enum(PUBLISHING_CHANNEL_IDS)).min(1),
  rightsConfirmed: z.literal(true),
  aiDisclosureReviewed: z.literal(true),
  kdpSelectEnrollment: z.enum(["enrolled", "not_enrolled", "unknown"]),
});

const jobActionSchema = z.object({
  action: z.enum(["approve", "handoff", "complete"]),
  jobId: z.string().uuid(),
  externalId: z.string().trim().max(200).optional(),
  externalUrl: z.string().url().max(2000).optional(),
});

const requestSchema = z.union([prepareSchema, jobActionSchema]);

function asObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function projectPackage(
  project: Record<string, any>,
  input: z.infer<typeof prepareSchema>,
): DistributionPackage {
  const metadata = asObject(project.metadata_plan);
  const kdp = asObject(metadata.kdp);
  const imagePlan = asObject(metadata.image_plan);
  const cover = asObject(imagePlan.cover);
  const chapterDrafts = Array.isArray(project.chapter_drafts) ? project.chapter_drafts : [];
  const outline = asObject(project.outline_plan);
  const outlineChapters = Array.isArray(outline.toc) ? outline.toc : [];
  const keywords = Array.isArray(kdp.keywords) ? kdp.keywords : Array.isArray(metadata.keywords) ? metadata.keywords : [];
  const categories = Array.isArray(kdp.categories) ? kdp.categories : Array.isArray(metadata.categories) ? metadata.categories : [];

  return {
    title: String(project.title || "").trim(),
    language: String(project.language || "").trim(),
    chapterCount: chapterDrafts.length || outlineChapters.length,
    hasEpubSource: chapterDrafts.length > 0,
    hasCover: Boolean(String(cover.image_url || metadata.cover_image_url || "").trim()),
    hasDescription: Boolean(String(kdp.description_html || kdp.description || metadata.description_html || "").trim()),
    keywordCount: keywords.length,
    categoryCount: categories.length,
    rightsConfirmed: input.rightsConfirmed,
    aiDisclosureReviewed: input.aiDisclosureReviewed,
    kdpSelectEnrollment: input.kdpSelectEnrollment,
    selectedChannels: input.channels,
  };
}

function publicChannelDefinition(id: PublishingChannelId, connected: boolean) {
  const definition = PUBLISHING_CHANNELS[id];
  return { ...definition, connected };
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const sb = getServiceSupabase();
  if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const [projectsRes, booksRes, connectionsRes, publicationsRes, jobsRes] = await Promise.all([
    sb.from("publishing_book_projects")
      .select("id,title,subtitle,language,status,genre,series_name,source_book_id,metadata_plan,outline_plan,chapter_drafts,updated_at")
      .order("updated_at", { ascending: false })
      .limit(100),
    sb.from("publishing_books")
      .select("id,title,asin,source_project_id,published_at")
      .limit(500),
    sb.from("publishing_channel_connections")
      .select("id,brand_id,channel,external_account_id,account_label,connector_type,status,capabilities,last_health_check_at,last_error,updated_at")
      .order("channel"),
    sb.from("publishing_distribution_publications")
      .select("id,project_id,book_id,edition_id,revision_id,channel,marketplace,external_id,external_url,status,preflight,artifact_manifest,updated_at")
      .order("updated_at", { ascending: false })
      .limit(100),
    sb.from("publishing_distribution_jobs")
      .select("id,publication_id,action,status,requested_by,approved_by,approved_at,output,error,attempt_count,run_after,started_at,finished_at,created_at,updated_at")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const error = projectsRes.error || booksRes.error || connectionsRes.error || publicationsRes.error || jobsRes.error;
  if (error) {
    const tableNotReady = /publishing_(channel_connections|distribution_)|schema cache|does not exist|relation/i.test(error.message);
    return NextResponse.json({ error: error.message, tableNotReady }, { status: tableNotReady ? 503 : 500 });
  }

  const allProjects = projectsRes.data ?? [];
  const books = booksRes.data ?? [];
  const connections = connectionsRes.data ?? [];
  const publications = publicationsRes.data ?? [];
  const publicationById = new Map(publications.map((row: any) => [String(row.id), row]));
  const projectById = new Map(allProjects.map((row: any) => [String(row.id), row]));
  const amazonPublishedProjectIds = verifiedAmazonProjectIds(allProjects, books, publications);
  const projects = allProjects
    .filter((project: any) => isDistributionReady(project))
    .map((project: any) => ({
      ...project,
      approval: publicationApproval(project),
      amazonAlreadyPublished: amazonPublishedProjectIds.has(String(project.id)),
    }));
  const connectedChannels = new Set(
    connections.filter((row: any) => row.status === "connected").map((row: any) => String(row.channel)),
  );
  const channels = PUBLISHING_CHANNEL_IDS.map((id) => publicChannelDefinition(id, connectedChannels.has(id)));
  const jobs = (jobsRes.data ?? []).map((job: any) => {
    const publication = publicationById.get(String(job.publication_id));
    const project = publication ? projectById.get(String((publication as any).project_id)) : null;
    return {
      ...job,
      superseded: !project || !isDistributionReady(project as any),
      publication: publication ?? null,
      project: project ? { id: (project as any).id, title: (project as any).title } : null,
    };
  });
  const currentJobs = jobs.filter((row: any) => !row.superseded);

  return NextResponse.json({
    summary: {
      channels: channels.length,
      connected: connectedChannels.size,
      projects: projects.length,
      hiddenDrafts: allProjects.length - projects.length,
      awaitingApproval: currentJobs.filter((row: any) => row.status === "awaiting_approval").length,
      processing: currentJobs.filter((row: any) => ["approved", "running"].includes(row.status)).length,
      blocked: currentJobs.filter((row: any) => row.status === "blocked").length,
      published: publications.filter((row: any) => row.status === "published").length,
    },
    channels,
    connections,
    projects,
    publications,
    jobs,
  });
}

async function prepareDistribution(input: z.infer<typeof prepareSchema>) {
  const sb = getServiceSupabase();
  if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { data: project, error: projectError } = await sb.from("publishing_book_projects")
    .select("*")
    .eq("id", input.projectId)
    .maybeSingle();
  if (projectError) return NextResponse.json({ error: projectError.message }, { status: 500 });
  if (!project) return NextResponse.json({ error: "Book project not found" }, { status: 404 });
  if (!isDistributionReady(project)) {
    return NextResponse.json({
      error: "Denne manusrevisjonen er ikke endelig godkjent i Forfatterstudio. Godkjenn den der først.",
    }, { status: 409 });
  }

  if (input.channels.includes("amazon_kdp")) {
    const [booksRes, publicationsRes] = await Promise.all([
      sb.from("publishing_books").select("id,title,asin,source_project_id,published_at")
        .or(`id.eq.${project.source_book_id || "00000000-0000-0000-0000-000000000000"},source_project_id.eq.${project.id}`),
      sb.from("publishing_distribution_publications")
        .select("project_id,book_id,channel,status,external_id,external_url")
        .eq("channel", "amazon_kdp")
        .or(`project_id.eq.${project.id},book_id.eq.${project.source_book_id || "00000000-0000-0000-0000-000000000000"}`),
    ]);
    const lookupError = booksRes.error || publicationsRes.error;
    if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 });
    const amazonPublished = verifiedAmazonProjectIds([project], booksRes.data ?? [], publicationsRes.data ?? []).has(project.id);
    if (amazonPublished) {
      return NextResponse.json({
        error: "Boken er allerede bekreftet publisert på Amazon. Bruk oppdater eksisterende utgave i stedet for ny publisering.",
        code: "AMAZON_ALREADY_PUBLISHED",
      }, { status: 409 });
    }
  }

  const { data: connections, error: connectionError } = await sb.from("publishing_channel_connections")
    .select("channel,status")
    .in("channel", input.channels);
  if (connectionError) return NextResponse.json({ error: connectionError.message }, { status: 500 });
  const connected = new Set((connections ?? []).filter((row: any) => row.status === "connected").map((row: any) => row.channel));
  const bookPackage = projectPackage(project, input);
  const metadata = asObject(project.metadata_plan);
  const imagePlan = asObject(metadata.image_plan);
  const cover = asObject(imagePlan.cover);
  const artifactManifest = {
    epub: `/api/publishing/book-engine/export-file?id=${project.id}&format=epub`,
    metadata: `/api/publishing/book-engine/export?id=${project.id}`,
    cover: String(cover.image_url || metadata.cover_image_url || "") || null,
  };
  const catalogEditionId = typeof project.catalog_edition_id === "string" ? project.catalog_edition_id : null;
  let catalogRevisionId: string | null = null;
  if (catalogEditionId) {
    const { data: revision, error: revisionError } = await sb.from("publishing_catalog_revisions")
      .select("id").eq("edition_id", catalogEditionId).eq("is_canonical", true).maybeSingle();
    if (revisionError) return NextResponse.json({ error: revisionError.message }, { status: 500 });
    catalogRevisionId = revision?.id ?? null;
  }
  const results: any[] = [];

  for (const channel of input.channels) {
    const preflight = evaluateDistributionPreflight(channel, bookPackage, {
      phase: "prepare",
      connectionReady: connected.has(channel),
    });
    const publicationStatus = preflight.ready ? "awaiting_approval" : "blocked";
    const connectorEnvelope = buildConnectorEnvelope(channel, project, artifactManifest);
    const { data: publication, error: publicationError } = await sb.from("publishing_distribution_publications")
      .upsert({
        brand_id: String(project.brand_id || "freddypublishing"),
        project_id: project.id,
        book_id: project.source_book_id || null,
        edition_id: catalogEditionId,
        revision_id: catalogRevisionId,
        channel,
        marketplace: "global",
        status: publicationStatus,
        metadata_payload: metadata,
        artifact_manifest: artifactManifest,
        preflight,
        updated_at: new Date().toISOString(),
      }, { onConflict: "project_id,channel,marketplace" })
      .select("id,project_id,channel,status,preflight,artifact_manifest")
      .single();
    if (publicationError) return NextResponse.json({ error: publicationError.message }, { status: 500 });

    const fingerprint = createHash("sha256").update(JSON.stringify({
      projectId: project.id,
      projectUpdatedAt: project.updated_at,
      channel,
      rightsConfirmed: input.rightsConfirmed,
      aiDisclosureReviewed: input.aiDisclosureReviewed,
      kdpSelectEnrollment: input.kdpSelectEnrollment,
    })).digest("hex");
    const idempotencyKey = `book-distribution:prepare:v1:${fingerprint}`;
    const { data: job, error: jobError } = await sb.from("publishing_distribution_jobs")
      .upsert({
        publication_id: publication.id,
        action: "prepare",
        status: preflight.ready ? "awaiting_approval" : "blocked",
        idempotency_key: idempotencyKey,
        requested_by: "admin_ui",
        input: {
          package: bookPackage,
          channel,
          connection_ready: connected.has(channel),
          approval_required: PUBLISHING_CHANNELS[channel].approvalRequired,
        },
        output: { artifact_manifest: artifactManifest, preflight, connector_envelope: connectorEnvelope },
        error: preflight.ready ? null : { code: "PREFLIGHT_BLOCKED", findings: preflight.findings },
        updated_at: new Date().toISOString(),
      }, { onConflict: "idempotency_key" })
      .select("id,publication_id,status,output,error")
      .single();
    if (jobError) return NextResponse.json({ error: jobError.message }, { status: 500 });
    results.push({ channel, publication, job, preflight });
  }

  return NextResponse.json({ ok: true, results }, { status: 201 });
}

async function updateJob(input: z.infer<typeof jobActionSchema>) {
  const sb = getServiceSupabase();
  if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const { data: job, error } = await sb.from("publishing_distribution_jobs")
    .select("id,publication_id,status,output")
    .eq("id", input.jobId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!job) return NextResponse.json({ error: "Distribution job not found" }, { status: 404 });

  const { data: publication, error: publicationError } = await sb.from("publishing_distribution_publications")
    .select("id,project_id,channel,status,artifact_manifest")
    .eq("id", job.publication_id)
    .single();
  if (publicationError) return NextResponse.json({ error: publicationError.message }, { status: 500 });
  const channel = publication.channel as PublishingChannelId;
  const definition = PUBLISHING_CHANNELS[channel];
  if (!definition) return NextResponse.json({ error: "Unknown publishing channel" }, { status: 409 });

  const now = new Date().toISOString();
  if (input.action === "approve") {
    const { data: project, error: projectError } = await sb.from("publishing_book_projects")
      .select("id,status,updated_at,metadata_plan")
      .eq("id", publication.project_id)
      .maybeSingle();
    if (projectError) return NextResponse.json({ error: projectError.message }, { status: 500 });
    if (!project || !isDistributionReady(project)) {
      return NextResponse.json({ error: "Godkjenningen er utdatert. Sluttgodkjenn gjeldende manus i Forfatterstudio først." }, { status: 409 });
    }
  }
  if (input.action === "approve" && definition.requiresConnection) {
    const { data: connection, error: connectionError } = await sb.from("publishing_channel_connections")
      .select("status")
      .eq("brand_id", "freddypublishing")
      .eq("channel", channel)
      .eq("status", "connected")
      .limit(1)
      .maybeSingle();
    if (connectionError) return NextResponse.json({ error: connectionError.message }, { status: 500 });
    if (!connection) return NextResponse.json({ error: `${definition.name} må kobles til før publiseringsjobben kan godkjennes.` }, { status: 409 });
  }
  if (input.action === "approve" && job.status !== "awaiting_approval") {
    return NextResponse.json({ error: `Job is already ${job.status}` }, { status: 409 });
  }
  if (input.action === "handoff" && definition.automatedDelivery) {
    return NextResponse.json({ error: `${definition.name}-connectoren er ikke aktivert i denne leveransen.` }, { status: 409 });
  }
  const transitionOutput = input.action === "handoff"
    ? {
        handoff: {
          channel,
          destination: definition.documentationUrl,
          delivery_label: definition.deliveryLabel,
          artifacts: publication.artifact_manifest,
          prepared_at: now,
        },
      }
    : input.action === "complete"
      ? { completion: { confirmed_by: "admin_ui", confirmed_at: now, external_id: input.externalId || null, external_url: input.externalUrl || null } }
      : {};
  const { data: transition, error: transitionError } = await sb.rpc("publishing_distribution_transition_job", {
    p_job_id: job.id,
    p_action: input.action,
    p_actor: "admin_ui",
    p_external_id: input.externalId || null,
    p_external_url: input.externalUrl || null,
    p_output: transitionOutput,
  });
  if (transitionError) return NextResponse.json({ error: transitionError.message }, { status: 409 });
  const result = Array.isArray(transition) ? transition[0] : transition;
  let execution: Awaited<ReturnType<typeof runApprovedDirectStoreJobs>> | null = null;
  if (input.action === "approve" && channel === "direct_store") {
    execution = await runApprovedDirectStoreJobs(sb, { jobId: job.id, limit: 1, actor: "admin_ui" });
  }
  const { data: latest } = await sb.from("publishing_distribution_jobs")
    .select("status,error,attempt_count,run_after,finished_at")
    .eq("id", job.id)
    .maybeSingle();
  return NextResponse.json({
    ok: true,
    status: latest?.status || result?.job_status,
    publicationStatus: result?.publication_status,
    output: transitionOutput,
    execution,
    error: latest?.error || null,
  });
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid distribution request", issues: parsed.error.issues }, { status: 400 });
  return parsed.data.action === "prepare" ? prepareDistribution(parsed.data) : updateJob(parsed.data);
}
