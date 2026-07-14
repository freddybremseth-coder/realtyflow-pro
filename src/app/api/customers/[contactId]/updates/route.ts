import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestAccessContext } from "@/lib/api-admin";
import { hasPermission } from "@/lib/access-control";
import { getContactsSupabase } from "@/app/api/contacts/supabase-client";
import {
  CustomerUpdateRequestSchema,
  appendCustomerInteraction,
  buildCustomerTimelineInteraction,
  changedCustomerDetailFields,
  contactDetailPatch,
} from "@/lib/customer-updates";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ContactIdSchema = z.string().uuid();

function missingColumnFromError(message = "") {
  const match = message.match(/'([^']+)' column|column "([^"]+)"|Could not find the '([^']+)' column/i);
  return match?.[1] || match?.[2] || match?.[3] || "";
}

async function updateContactWithFallbacks(supabase: any, id: string, updates: Record<string, unknown>) {
  let payload = { ...updates };
  const removed: string[] = [];
  const tried = new Set<string>();

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { data, error } = await supabase.from("contacts").update(payload).eq("id", id).select().single();
    if (!error) return { data, error: null, appliedPayload: payload, removed };

    const missingColumn = missingColumnFromError(error.message || "");
    if (missingColumn && !tried.has(missingColumn)) {
      tried.add(missingColumn);
      if (missingColumn === "interactions") return { data: null, error, appliedPayload: payload, removed };

      if (missingColumn === "next_followup" && Object.prototype.hasOwnProperty.call(payload, "next_followup")) {
        const value = payload.next_followup;
        delete payload.next_followup;
        payload.next_follow_up = value;
        removed.push("next_followup");
        continue;
      }
      if (missingColumn === "next_follow_up" && Object.prototype.hasOwnProperty.call(payload, "next_follow_up")) {
        const value = payload.next_follow_up;
        delete payload.next_follow_up;
        payload.follow_up_date = value;
        removed.push("next_follow_up");
        continue;
      }

      delete payload[missingColumn];
      removed.push(missingColumn);
      continue;
    }

    return { data: null, error, appliedPayload: payload, removed };
  }

  return {
    data: null,
    error: { message: "Kunne ikke oppdatere kunden etter schema-fallbacks" },
    appliedPayload: payload,
    removed,
  };
}

function detailsAuditInteraction(params: { fields: string[]; actorEmail: string; date: string }) {
  return {
    id: crypto.randomUUID(),
    type: "customer_details_updated",
    date: params.date,
    direction: "internal",
    content: `Kundedetaljer oppdatert: ${params.fields.join(", ")}`,
    metadata: {
      source: "customer-360",
      update_type: "customer_details",
      title: "Kundedetaljer oppdatert",
      fields_changed: params.fields,
      actor_email: params.actorEmail.toLowerCase(),
      no_customer_contact: true,
    },
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: { contactId: string } },
) {
  const context = await getRequestAccessContext(request);
  if (!context) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  if (context.role !== "OWNER" && !hasPermission(context.role, "customers.write")) {
    return NextResponse.json({ ok: false, error: "Access permission required", requiredPermission: "customers.write" }, { status: 403 });
  }

  const parsedContactId = ContactIdSchema.safeParse(params.contactId);
  if (!parsedContactId.success) return NextResponse.json({ ok: false, error: "Invalid contact id" }, { status: 400 });

  const body = await request.json().catch(() => null);
  const parsed = CustomerUpdateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({
      ok: false,
      error: "Ugyldige kundedata",
      issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    }, { status: 400 });
  }

  const supabase = getContactsSupabase();
  if (!supabase) return NextResponse.json({ ok: false, error: "Contacts database is not configured" }, { status: 500 });

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", parsedContactId.data)
    .single();

  if (contactError || !contact) {
    return NextResponse.json({ ok: false, error: contactError?.message || "Customer not found" }, { status: 404 });
  }

  const now = new Date().toISOString();
  let updates: Record<string, unknown>;
  let changedFields: string[] = [];

  if (parsed.data.action === "ADD_UPDATE") {
    const interaction = buildCustomerTimelineInteraction({
      update: parsed.data.update,
      actorEmail: context.email,
    });
    updates = {
      interactions: appendCustomerInteraction(contact.interactions, interaction),
      updated_at: now,
      ...(parsed.data.update.nextFollowup ? { next_followup: parsed.data.update.nextFollowup } : {}),
    };
  } else {
    const detailPatch = contactDetailPatch(parsed.data.details);
    changedFields = changedCustomerDetailFields(contact, detailPatch);
    if (changedFields.length === 0) {
      return NextResponse.json({ ok: true, contact, changedFields: [], message: "Ingen endringer å lagre." });
    }
    const auditInteraction = detailsAuditInteraction({ fields: changedFields, actorEmail: context.email, date: now });
    updates = {
      ...detailPatch,
      interactions: appendCustomerInteraction(contact.interactions, auditInteraction),
      updated_at: now,
    };
  }

  const result = await updateContactWithFallbacks(supabase, parsedContactId.data, updates);
  if (result.error) {
    return NextResponse.json({
      ok: false,
      error: result.error.message || "Kunne ikke oppdatere kunden",
      code: missingColumnFromError(result.error.message || "") === "interactions" ? "CUSTOMER_TIMELINE_NOT_AVAILABLE" : "CUSTOMER_UPDATE_FAILED",
    }, { status: 500 });
  }

  const appliedFields = Object.keys(result.appliedPayload).filter((field) => !["interactions", "updated_at"].includes(field));
  return NextResponse.json({
    ok: true,
    contact: result.data,
    action: parsed.data.action,
    changedFields,
    appliedFields,
    skippedFields: result.removed,
    noCustomerContact: true,
  });
}
