import { NextRequest, NextResponse } from "next/server";
import { calculateBillingTotals } from "@/lib/billing/money";
import { billingDatabaseError, requireBillingOrganization, requireBillingRequest } from "@/lib/billing/request";
import type { BillingLineInput } from "@/lib/billing/types";
import { saveDocumentSchema, validationMessage } from "@/lib/billing/validation";
import { normalizeBillingLinesForSave } from "@/services/billing/document-service";

async function save(request: NextRequest) {
  const auth = await requireBillingRequest(request, "write");
  if (!auth.value) return auth.response;
  const parsed = saveDocumentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
  const input = parsed.data;
  const denied = await requireBillingOrganization(auth.value, input.organizationId, true);
  if (denied) return denied;
  try {
    const lines = await normalizeBillingLinesForSave({
      supabase: auth.value.supabase,
      organizationId: input.organizationId,
      customerId: input.customerId,
      lines: input.lines as BillingLineInput[],
    });
    calculateBillingTotals(lines);
    const { data, error } = await auth.value.supabase.rpc("billing_save_draft", {
      p_document_id: input.documentId || null,
      p_organization_id: input.organizationId,
      p_document_type: input.documentType,
      p_customer_id: input.customerId,
      p_payload: input.payload,
      p_lines: lines,
      p_actor_email: auth.value.context.email,
    });
    if (error) return billingDatabaseError(error);
    return NextResponse.json({ documentId: data }, { status: input.documentId ? 200 : 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Dokumentet kunne ikke lagres." }, { status: 400 });
  }
}

export async function POST(request: NextRequest) { return save(request); }
export async function PATCH(request: NextRequest) { return save(request); }
