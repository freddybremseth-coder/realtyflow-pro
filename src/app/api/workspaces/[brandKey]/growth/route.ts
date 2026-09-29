import { NextRequest, NextResponse } from "next/server";
import { requireBrandWorkspace } from "@/lib/workspaces/require-brand-workspace";
import type { WorkspacePermission } from "@/lib/workspaces/brand-policy";
import { evaluateCorporateProspectReadiness } from "@/lib/corporate-prospect-readiness";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const noStore = { "Cache-Control": "private, no-store" };

const KIND_PERMISSION: Record<string, WorkspacePermission> = {
  corporate: "corporate.plan",
  seo: "visibility.plan",
  geo: "visibility.plan",
  aeo: "visibility.plan",
  keywords: "visibility.plan",
  content: "visibility.plan",
  ads: "ads.draft",
  video: "events.plan",
  info_meeting: "events.plan",
};

function fail(status: number, code: string) {
  return NextResponse.json({ ok: false, error: { code } }, { status, headers: noStore });
}

function safeWrite(request: NextRequest) {
  const origin = request.headers.get("origin");
  return request.headers.get("content-type")?.toLowerCase().startsWith("application/json") &&
    (!origin || origin === new URL(request.url).origin) &&
    request.headers.get("sec-fetch-site") !== "cross-site";
}

async function growthReadAccess(request: NextRequest, brandKey: string) {
  for (const permission of ["corporate.read", "visibility.read", "ads.read", "events.plan"] as WorkspacePermission[]) {
    const access = await requireBrandWorkspace(request, brandKey, permission);
    if (access.value) return access;
    if (access.response.status === 401 || access.response.status === 503) return access;
  }
  return { value: null, response: fail(403, "ACCESS_DENIED") };
}

export async function GET(
  request: NextRequest,
  { params }: { params: { brandKey: string } },
) {
  const access = await growthReadAccess(request, params.brandKey);
  if (!access.value) return access.response;
  if (!access.value.verifiedUserId) return fail(403, "STAFF_ONLY");

  const { data, error } = await access.value.supabase.rpc("workspace_brand_growth_snapshot", {
    p_brand_key: params.brandKey,
    p_user_id: access.value.verifiedUserId,
    p_email: access.value.verifiedEmail,
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    return fail(503, "GROWTH_WORKSPACE_UNAVAILABLE");
  }

  let payload = data as Record<string, any>;
  if (params.brandKey === "zeneco" && payload.corporate && typeof payload.corporate === "object") {
    const prospects = Array.isArray(payload.corporate.prospects) ? payload.corporate.prospects : [];
    const partners = Array.isArray(payload.corporate.partners) ? payload.corporate.partners : [];
    const prospectIds = prospects.map((row: any) => String(row?.id || "")).filter(Boolean);
    const partnerIds = partners.map((row: any) => String(row?.id || "")).filter(Boolean);

    const [prospectDetails, partnerDetails] = await Promise.all([
      prospectIds.length
        ? access.value.supabase
            .from("corporate_prospects")
            .select("id,organization_number,domain,website_url,industry,employee_count,employee_band,member_count,organization_type,status,fit_tier,fit_score,source_url,decision_roles,evidence_gaps,evidence")
            .eq("brand_id", "zeneco")
            .in("id", prospectIds)
        : Promise.resolve({ data: [], error: null }),
      partnerIds.length
        ? access.value.supabase
            .from("corporate_partner_prospects")
            .select("id,evidence")
            .eq("brand_id", "zeneco")
            .in("id", partnerIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (prospectDetails.error || partnerDetails.error) return fail(503, "GROWTH_WORKSPACE_UNAVAILABLE");

    const readinessById = new Map(
      (prospectDetails.data || []).map((row: any) => [
        String(row.id),
        evaluateCorporateProspectReadiness(row),
      ]),
    );
    const partnerChannelById = new Map(
      (partnerDetails.data || []).map((row: any) => {
        const evidence = row?.evidence && typeof row.evidence === "object" ? row.evidence : {};
        const companyContact = evidence.generic_company_contact && typeof evidence.generic_company_contact === "object"
          ? evidence.generic_company_contact as Record<string, unknown>
          : {};
        return [String(row.id), Boolean(
          String(companyContact.generic_email || "").trim() ||
          String(companyContact.contact_page_url || "").trim(),
        )];
      }),
    );

    payload = {
      ...payload,
      corporate: {
        ...payload.corporate,
        prospects: prospects.map((row: any) => ({
          ...row,
          readiness: readinessById.get(String(row.id)) || null,
        })),
        partners: partners.map((row: any) => ({
          ...row,
          companyChannelReady: partnerChannelById.get(String(row.id)) || false,
        })),
      },
    };
  }

  return NextResponse.json({ ok: true, brand: params.brandKey, ...payload }, { headers: noStore });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { brandKey: string } },
) {
  if (!safeWrite(request)) return fail(403, "INVALID_REQUEST_ORIGIN");
  const input: unknown = await request.json().catch(() => null);
  if (!input || typeof input !== "object" || Array.isArray(input)) return fail(400, "INVALID_WORK_ITEM");
  const body = input as Record<string, unknown>;
  const kind = typeof body.kind === "string" ? body.kind.trim() : "";
  const permission = KIND_PERMISSION[kind];
  if (!permission) return fail(400, "INVALID_WORK_KIND");

  const access = await requireBrandWorkspace(request, params.brandKey, permission);
  if (!access.value) return access.response;
  if (!access.value.verifiedUserId) return fail(403, "STAFF_ONLY");

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const nextAction = typeof body.nextAction === "string" ? body.nextAction.trim() : "";
  const sourceId = typeof body.sourceId === "string" ? body.sourceId.trim() : "";
  const priority = typeof body.priority === "string" ? body.priority.trim().toUpperCase() : "MEDIUM";
  const dueDate = typeof body.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.dueDate)
    ? body.dueDate : null;

  if (title.length < 2 || title.length > 180 || description.length > 4000 ||
      nextAction.length > 1000 || sourceId.length > 200 ||
      !["CRITICAL","HIGH","MEDIUM","LOW"].includes(priority) ||
      (body.dueDate != null && dueDate === null)) {
    return fail(400, "INVALID_WORK_ITEM");
  }

  const { data, error } = await access.value.supabase.rpc("workspace_brand_growth_work_create", {
    p_brand_key: params.brandKey,
    p_user_id: access.value.verifiedUserId,
    p_email: access.value.verifiedEmail,
    p_kind: kind,
    p_title: title,
    p_description: description,
    p_next_action: nextAction,
    p_due_date: dueDate,
    p_priority: priority,
    p_source_id: sourceId,
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    return fail(503, "GROWTH_WORK_CREATE_FAILED");
  }

  return NextResponse.json({
    ok: true,
    brand: params.brandKey,
    workItem: data,
    externalAction: false,
    published: false,
    adSpendStarted: false,
    invitationSent: false,
  }, { status: 201, headers: noStore });
}
