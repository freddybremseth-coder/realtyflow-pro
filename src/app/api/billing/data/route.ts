import { NextRequest, NextResponse } from "next/server";
import { requireBillingOrganization, requireBillingRequest, billingDatabaseError } from "@/lib/billing/request";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireBillingRequest(request, "read");
  if (!auth.value) return auth.response;
  const organizationId = request.nextUrl.searchParams.get("organizationId") || "";
  if (!organizationId) return NextResponse.json({ error: "organizationId mangler." }, { status: 400 });
  const denied = await requireBillingOrganization(auth.value, organizationId);
  if (denied) return denied;
  const { supabase } = auth.value;

  const [organizationResult, settingsResult, customersResult, productsResult, taxRulesResult, documentsResult, paymentsResult, seriesResult, jobsResult] = await Promise.all([
    supabase.from("billing_organizations").select("*").eq("id", organizationId).single(),
    supabase.from("billing_organization_settings").select("*").eq("organization_id", organizationId).maybeSingle(),
    supabase.from("billing_customers").select("*").eq("organization_id", organizationId).eq("active", true).order("name"),
    supabase.from("billing_products").select("*").eq("organization_id", organizationId).eq("active", true).order("name"),
    supabase.from("billing_tax_rules").select("*").eq("organization_id", organizationId).eq("active", true).order("priority").order("name"),
    supabase.from("billing_documents").select("*,billing_customers(id,name,email,country_code,vat_number)").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(250),
    supabase.from("billing_payments").select("*").eq("organization_id", organizationId).order("payment_date", { ascending: false }).limit(100),
    supabase.from("billing_invoice_series").select("*").eq("organization_id", organizationId).order("fiscal_year", { ascending: false }),
    supabase.from("billing_delivery_jobs").select("id,document_id,job_type,status,attempts,last_error,created_at").eq("organization_id", organizationId).in("status", ["pending", "retry", "failed"]).order("created_at", { ascending: false }).limit(50),
  ]);
  const failed = [organizationResult, settingsResult, customersResult, productsResult, taxRulesResult, documentsResult, paymentsResult, seriesResult, jobsResult].find((result) => result.error);
  if (failed?.error) return billingDatabaseError(failed.error);

  return NextResponse.json({
    organization: organizationResult.data,
    settings: settingsResult.data,
    customers: customersResult.data || [],
    products: productsResult.data || [],
    taxRules: taxRulesResult.data || [],
    documents: documentsResult.data || [],
    payments: paymentsResult.data || [],
    series: seriesResult.data || [],
    jobs: jobsResult.data || [],
    generatedAt: new Date().toISOString(),
  });
}
