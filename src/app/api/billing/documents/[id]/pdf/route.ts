import { NextRequest, NextResponse } from "next/server";
import { billingDatabaseError, requireBillingOrganization, requireBillingRequest } from "@/lib/billing/request";
import { loadBillingDocumentBundle } from "@/services/billing/document-service";
import { renderBillingInvoicePdf } from "@/services/billing/invoice-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireBillingRequest(request, "read");
  if (!auth.value) return auth.response;
  try {
    const bundle = await loadBillingDocumentBundle(auth.value.supabase, params.id);
    const denied = await requireBillingOrganization(auth.value, bundle.document.organization_id);
    if (denied) return denied;
    const snapshot = bundle.snapshot?.snapshot || {
      schemaVersion: 1,
      document: bundle.document,
      seller: bundle.organization,
      customer: bundle.customer,
      settings: bundle.settings || {},
      lines: bundle.lines,
      preview: true,
    };
    let body: Uint8Array;
    if (bundle.snapshot?.pdf_storage_path) {
      const { data, error } = await auth.value.supabase.storage.from("billing-documents").download(bundle.snapshot.pdf_storage_path);
      if (error || !data) throw new Error(error?.message || "PDF-kopien finnes ikke i lagring.");
      body = new Uint8Array(await data.arrayBuffer());
    } else {
      body = new Uint8Array(await renderBillingInvoicePdf(snapshot, bundle.snapshot?.content_hash || null));
    }
    const fileNumber = String(bundle.document.document_number || `utkast-${bundle.document.id}`).replace(/[^a-zA-Z0-9_.-]+/g, "-");
    return new NextResponse(body as unknown as BodyInit, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="${fileNumber}.pdf"`,
        "cache-control": bundle.document.locked_at ? "private, max-age=3600" : "no-store",
      },
    });
  } catch (error) {
    return billingDatabaseError(error, "PDF-en kunne ikke genereres.");
  }
}
