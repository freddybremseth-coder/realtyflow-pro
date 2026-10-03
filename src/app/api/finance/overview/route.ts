import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireAdminApi } from "@/lib/api-admin";
import { buildFinanceOverview } from "@/lib/finance/overview";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const supabase = createServerClient();
  const [events, documents, payments] = await Promise.all([
    supabase
      .from("business_financial_events")
      .select("id,brand_id,source_type,source_id,stream,direction,status,amount,currency,event_date,description")
      .order("event_date", { ascending: false })
      .limit(5000),
    supabase
      .from("billing_documents")
      .select("id,status,document_type,currency,total,amount_paid,balance,due_date")
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase
      .from("billing_payments")
      .select("id,currency,amount,payment_date")
      .order("payment_date", { ascending: false })
      .limit(2000),
  ]);

  const errors = [events.error, documents.error, payments.error]
    .filter(Boolean)
    .map((error) => error?.message || String(error));

  if (events.error) {
    return NextResponse.json({ error: events.error.message, warnings: errors.slice(1) }, { status: 500 });
  }

  const overview = buildFinanceOverview({
    events: events.data || [],
    documents: documents.data || [],
    payments: payments.data || [],
  });

  return NextResponse.json({
    overview,
    warnings: errors,
    sources: {
      canonicalLedger: "business_financial_events",
      billingDocuments: "billing_documents",
      billingPayments: "billing_payments",
      note: "Family and Olivia are source systems. Only explicitly synchronized business events belong in the canonical ledger.",
    },
  });
}
