import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import {
  careItemLabel,
  careReportReference,
  careWorkOrderReference,
  isUuid,
  nextCareVisitAt,
  type CareChecklistStatus,
} from "@/lib/care/visit-workflow";
import { renderCareVisitReport } from "@/services/care/visit-report";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ITEM_STATUSES = new Set<CareChecklistStatus>(["ok", "deviation", "not_applicable", "not_checked"]);
const SEVERITIES = new Set(["info", "low", "medium", "high", "urgent"]);

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) as any;
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function text(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

async function signedUrl(supabase: any, bucket: string, path: string | null) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  return error ? null : data?.signedUrl || null;
}

async function loadInspection(supabase: any, inspectionId: string) {
  const care = supabase.schema("care");
  const { data: inspection, error } = await care.from("kh_inspections").select("*").eq("id", inspectionId).maybeSingle();
  if (error) throw error;
  if (!inspection) return null;

  const [propertyResult, itemsResult, photosResult, issuesResult, reportsResult, eventResult, workOrdersResult] = await Promise.all([
    care.from("kh_properties").select("*").eq("id", inspection.property_id).maybeSingle(),
    care.from("kh_inspection_items").select("*").eq("inspection_id", inspectionId).order("recorded_at", { ascending: true }),
    care.from("kh_photos").select("*").eq("inspection_id", inspectionId).order("sort_order", { ascending: true }),
    care.from("kh_issues").select("*").eq("inspection_id", inspectionId).order("opened_at", { ascending: false }),
    care.from("kh_reports").select("*").eq("inspection_id", inspectionId).order("version", { ascending: false }),
    care.from("kh_calendar_events").select("*").eq("inspection_id", inspectionId).limit(1).maybeSingle(),
    care.from("kh_work_orders").select("*").eq("property_id", inspection.property_id).order("created_at", { ascending: false }).limit(100),
  ]);
  for (const result of [propertyResult, itemsResult, photosResult, issuesResult, reportsResult, eventResult, workOrdersResult]) {
    if (result.error) throw result.error;
  }

  const defs = Array.isArray(record(inspection.template_snapshot).items) ? record(inspection.template_snapshot).items : [];
  const defsByCode = new Map(defs.map((item: any) => [String(item.code), item]));
  const items = (itemsResult.data || []).map((item: any) => ({ ...defsByCode.get(String(item.item_code)), ...item }));
  const photos = await Promise.all((photosResult.data || []).map(async (photo: any) => ({
    ...photo,
    signed_url: await signedUrl(supabase, "kh-photos", photo.storage_path),
  })));
  const reports = await Promise.all((reportsResult.data || []).map(async (report: any) => ({
    ...report,
    signed_url: await signedUrl(supabase, "property-documents", report.storage_path),
  })));
  const issueIds = new Set((issuesResult.data || []).map((issue: any) => String(issue.id)));

  return {
    inspection,
    property: propertyResult.data,
    event: eventResult.data,
    items,
    photos,
    issues: issuesResult.data || [],
    reports,
    workOrders: (workOrdersResult.data || []).filter((order: any) => issueIds.has(String(order.issue_id))),
    progress: {
      total: items.length,
      checked: items.filter((item: any) => item.status !== "not_checked").length,
      deviations: items.filter((item: any) => item.status === "deviation").length,
      requiredPhotos: items.filter((item: any) => item.requires_photo).length,
      photoCount: photos.length,
      minPhotos: Number(record(inspection.template_snapshot).min_photos || 0),
    },
  };
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const inspectionId = String(params.id || "");
  if (!isUuid(inspectionId)) return NextResponse.json({ error: "Ugyldig inspeksjon." }, { status: 400 });
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase er ikke konfigurert." }, { status: 503 });

  try {
    const visit = await loadInspection(supabase, inspectionId);
    if (!visit) return NextResponse.json({ error: "Inspeksjonen ble ikke funnet." }, { status: 404 });
    return NextResponse.json({ visit });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Kunne ikke hente inspeksjonen." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const inspectionId = String(params.id || "");
  if (!isUuid(inspectionId)) return NextResponse.json({ error: "Ugyldig inspeksjon." }, { status: 400 });
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase er ikke konfigurert." }, { status: 503 });
  const care = supabase.schema("care");
  const body = await request.json().catch(() => ({}));
  const action = text(body.action, 40).toLowerCase();

  try {
    const visit = await loadInspection(supabase, inspectionId);
    if (!visit) return NextResponse.json({ error: "Inspeksjonen ble ikke funnet." }, { status: 404 });
    if (action === "item") {
      if (visit.inspection.status !== "draft") {
        return NextResponse.json({ error: "Sjekkpunkter kan ikke endres etter at tilsynet er avsluttet." }, { status: 409 });
      }
      const itemCode = text(body.itemCode, 120);
      const status = text(body.status, 40) as CareChecklistStatus;
      const valueNumeric = body.valueNumeric === null || body.valueNumeric === "" || body.valueNumeric === undefined
        ? null
        : Number(body.valueNumeric);
      const note = text(body.note, 1000);
      const severity = SEVERITIES.has(text(body.severity, 20)) ? text(body.severity, 20) : "medium";
      const definition = visit.items.find((item: any) => item.item_code === itemCode);
      if (!definition || !ITEM_STATUSES.has(status)) return NextResponse.json({ error: "Ugyldig sjekkpunkt eller status." }, { status: 400 });
      if (definition.requires_value && status === "ok" && (valueNumeric === null || !Number.isFinite(valueNumeric))) {
        return NextResponse.json({ error: "Dette sjekkpunktet krever en måleverdi." }, { status: 400 });
      }

      const { error: updateError } = await care.from("kh_inspection_items").update({
        status,
        value_numeric: valueNumeric,
        value_unit: definition.value_unit || null,
        note: note ? { text: note } : null,
        recorded_at: new Date().toISOString(),
      }).eq("inspection_id", inspectionId).eq("item_code", itemCode);
      if (updateError) throw updateError;

      if (status === "deviation") {
        const { data: existingIssue } = await care.from("kh_issues")
          .select("id")
          .eq("inspection_id", inspectionId)
          .eq("item_code", itemCode)
          .neq("status", "closed")
          .limit(1)
          .maybeSingle();
        const issuePayload = {
          severity,
          title: { nb: `Avvik: ${careItemLabel(itemCode)}` },
          description: { nb: note || "Avvik registrert under Care-tilsyn." },
          status: "open",
        };
        if (existingIssue) {
          const { error } = await care.from("kh_issues").update(issuePayload).eq("id", existingIssue.id);
          if (error) throw error;
        } else {
          const { error } = await care.from("kh_issues").insert({
            id: randomUUID(),
            org_id: visit.inspection.org_id,
            property_id: visit.inspection.property_id,
            inspection_id: inspectionId,
            item_code: itemCode,
            ...issuePayload,
          });
          if (error) throw error;
        }
      }

      return NextResponse.json({ success: true, visit: await loadInspection(supabase, inspectionId) });
    }

    if (action === "work_order") {
      const issueId = text(body.issueId, 80);
      if (!isUuid(issueId)) return NextResponse.json({ error: "Gyldig avvik kreves." }, { status: 400 });
      const issue = visit.issues.find((row: any) => row.id === issueId);
      if (!issue) return NextResponse.json({ error: "Avviket tilhører ikke denne inspeksjonen." }, { status: 404 });
      const description = text(body.description, 1000) || `Følg opp ${careItemLabel(String(issue.item_code || ""))}`;
      const scheduledFor = /^\d{4}-\d{2}-\d{2}$/.test(text(body.scheduledFor, 10)) ? text(body.scheduledFor, 10) : null;
      const { data: existing } = await care.from("kh_work_orders").select("id").eq("issue_id", issueId).neq("status", "cancelled").limit(1).maybeSingle();
      if (existing) return NextResponse.json({ success: true, workOrderId: existing.id, reused: true });

      const id = randomUUID();
      const { error } = await care.from("kh_work_orders").insert({
        id,
        org_id: visit.inspection.org_id,
        property_id: visit.inspection.property_id,
        issue_id: issueId,
        reference: careWorkOrderReference(),
        status: "draft",
        vendor_locale: "es",
        description: { nb: description },
        scheduled_for: scheduledFor,
        currency: "EUR",
      });
      if (error) throw error;
      await care.from("kh_issues").update({ status: "in_progress" }).eq("id", issueId);
      return NextResponse.json({ success: true, workOrderId: id, visit: await loadInspection(supabase, inspectionId) }, { status: 201 });
    }

    if (action === "complete") {
      if (visit.inspection.status !== "draft") {
        const existingReport = visit.reports[0];
        if (existingReport) return NextResponse.json({ success: true, report: existingReport, reused: true, visit });
        return NextResponse.json({ error: "Inspeksjonen er allerede avsluttet." }, { status: 409 });
      }
      const items = visit.items;
      const unchecked = items.filter((item: any) => item.status === "not_checked");
      if (unchecked.length) {
        return NextResponse.json({ error: `${unchecked.length} sjekkpunkter er ikke ferdigstilt.` }, { status: 409 });
      }
      const missingValues = items.filter((item: any) => item.requires_value && item.status === "ok" && item.value_numeric == null);
      if (missingValues.length) {
        return NextResponse.json({ error: `${missingValues.length} sjekkpunkter mangler måleverdi.` }, { status: 409 });
      }
      const photoCodes = new Set(visit.photos.map((photo: any) => String(photo.item_code || "")));
      const missingRequiredPhotos = items.filter((item: any) => item.requires_photo && item.status !== "not_applicable" && !photoCodes.has(String(item.item_code)));
      if (missingRequiredPhotos.length) {
        return NextResponse.json({ error: `${missingRequiredPhotos.length} obligatoriske sjekkpunkter mangler bilde.` }, { status: 409 });
      }
      const minPhotos = Number(record(visit.inspection.template_snapshot).min_photos || 0);
      if (visit.photos.length < minPhotos) {
        return NextResponse.json({ error: `Tilsynet krever minst ${minPhotos} bilder. Nå er ${visit.photos.length} registrert.` }, { status: 409 });
      }

      const existingReport = visit.reports[0];
      if (existingReport) {
        return NextResponse.json({ success: true, report: existingReport, reused: true, visit });
      }

      const completedAt = new Date();
      const reference = careReportReference(completedAt);
      const reportId = randomUUID();
      const inspectionForReport = { ...visit.inspection, completed_at: completedAt.toISOString() };
      const reportItems = items.map((item: any) => ({
        ...item,
        category: item.category || "other",
      }));
      const snapshot = {
        reference,
        property: visit.property,
        inspection: inspectionForReport,
        checklist: reportItems,
        issues: visit.issues,
        photos: visit.photos.map((photo: any) => ({ id: photo.id, item_code: photo.item_code, storage_path: photo.storage_path, caption: photo.caption })),
        generated_at: completedAt.toISOString(),
      };
      const pdf = await renderCareVisitReport({
        reference,
        property: visit.property,
        inspection: inspectionForReport,
        items: reportItems,
        issues: visit.issues,
        photoCount: visit.photos.length,
      });
      const contentHash = createHash("sha256").update(pdf).digest("hex");
      const storagePath = `care-reports/${visit.inspection.property_id}/${reportId}.pdf`;
      const { error: uploadError } = await supabase.storage.from("property-documents").upload(storagePath, pdf, {
        contentType: "application/pdf",
        upsert: false,
      });
      if (uploadError) throw new Error(`Rapportopplasting: ${uploadError.message}`);

      const { data: report, error: reportError } = await care.from("kh_reports").insert({
        id: reportId,
        org_id: visit.inspection.org_id,
        inspection_id: inspectionId,
        property_id: visit.inspection.property_id,
        reference,
        locale: "nb",
        storage_path: storagePath,
        bytes: pdf.byteLength,
        content_hash: contentHash,
        version: 1,
        status: "draft",
        data_snapshot: snapshot,
      }).select("*").single();
      if (reportError) {
        await supabase.storage.from("property-documents").remove([storagePath]);
        throw reportError;
      }

      const { error: inspectionError } = await care.from("kh_inspections").update({
        status: "completed",
        completed_at: completedAt.toISOString(),
        device_completed_at: completedAt.toISOString(),
        synced_at: completedAt.toISOString(),
        photo_count: visit.photos.length,
      }).eq("id", inspectionId);
      if (inspectionError) throw inspectionError;
      if (visit.event?.id) {
        const { error: eventError } = await care.from("kh_calendar_events").update({ status: "done" }).eq("id", visit.event.id);
        if (eventError) throw eventError;
      }

      const { data: contract } = await care.from("kh_contracts").select("*")
        .eq("property_id", visit.inspection.property_id)
        .in("status", ["active", "renewal_due"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      let nextEvent = null;
      if (contract) {
        const { data: future } = await care.from("kh_calendar_events").select("id")
          .eq("property_id", visit.inspection.property_id)
          .eq("event_type", "inspection")
          .eq("status", "planned")
          .gt("starts_at", completedAt.toISOString())
          .limit(1)
          .maybeSingle();
        if (!future) {
          const plan = record(contract.plan_snapshot);
          const nextStart = nextCareVisitAt(completedAt, Number(plan.visits_per_month || 1));
          const nextEnd = new Date(nextStart.getTime() + 60 * 60 * 1000);
          const result = await care.from("kh_calendar_events").insert({
            id: randomUUID(),
            org_id: visit.inspection.org_id,
            property_id: visit.inspection.property_id,
            event_type: "inspection",
            title: "Neste Care-besøk",
            starts_at: nextStart.toISOString(),
            ends_at: nextEnd.toISOString(),
            is_billable: true,
            status: "planned",
            source: "auto",
            notes: { previous_inspection_id: inspectionId, cadence: "contract_plan" },
          }).select("*").single();
          if (result.error) throw result.error;
          nextEvent = result.data;
        }
      }

      return NextResponse.json({
        success: true,
        report: { ...report, signed_url: await signedUrl(supabase, "property-documents", storagePath) },
        nextEvent,
        visit: await loadInspection(supabase, inspectionId),
      });
    }

    return NextResponse.json({ error: "Ukjent inspeksjonshandling." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Care-inspeksjonen kunne ikke oppdateres." }, { status: 500 });
  }
}
