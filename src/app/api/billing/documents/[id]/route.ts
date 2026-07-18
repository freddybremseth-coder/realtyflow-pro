import { NextRequest, NextResponse } from "next/server";
import { billingDatabaseError, requireBillingOrganization, requireBillingRequest } from "@/lib/billing/request";
import { loadBillingDocumentBundle } from "@/services/billing/document-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireBillingRequest(request, "read");
  if (!auth.value) return auth.response;
  try {
    const bundle = await loadBillingDocumentBundle(auth.value.supabase, params.id);
    const denied = await requireBillingOrganization(auth.value, bundle.document.organization_id);
    if (denied) return denied;
    return NextResponse.json(bundle);
  } catch (error) {
    return billingDatabaseError(error, "Dokumentet kunne ikke lastes.");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireBillingRequest(request, "write");
  if (!auth.value) return auth.response;
  const { data: document, error: loadError } = await auth.value.supabase.from("billing_documents").select("organization_id,locked_at").eq("id", params.id).single();
  if (loadError || !document) return billingDatabaseError(loadError || new Error("Dokumentet finnes ikke."));
  const denied = await requireBillingOrganization(auth.value, document.organization_id, true);
  if (denied) return denied;
  if (document.locked_at) return NextResponse.json({ error: "Utstedte dokumenter kan ikke slettes. Opprett en kreditnota." }, { status: 409 });
  const { error } = await auth.value.supabase.from("billing_documents").delete().eq("id", params.id).is("locked_at", null);
  if (error) return billingDatabaseError(error);
  return NextResponse.json({ ok: true });
}
