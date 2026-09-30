import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { CheckCircle, Clock, ExternalLink, Globe, ShieldCheck } from "lucide-react";
import { ClaimDemoButton } from "@/components/demosites/claim-demo-button";
import { DEMO_SITE_PACKAGES } from "@/lib/demosites";
import { formatDemoSiteDate, getDemoSiteClaimCopy, getDemoSiteLanguageConfig, normalizeDemoSiteLanguage, type DemoSiteClaimCopy } from "@/lib/demosites-language";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ClaimPageProps = {
  params: Promise<{ token: string }> | { token: string };
  searchParams?: Promise<{ paid?: string; payment?: string; cancelled?: string; session_id?: string }> | { paid?: string; payment?: string; cancelled?: string; session_id?: string };
};

type DemoOrder = {
  id: string;
  status: string;
  billing_status: string;
  company_name: string;
  customer_email: string;
  customer_phone?: string | null;
  industry?: string | null;
  website_url?: string | null;
  package_id: string;
  setup_fee_nok: number;
  monthly_fee_nok: number;
  preview_url?: string | null;
  claim_url?: string | null;
  claimed_at?: string | null;
  expires_at?: string | null;
  extracted_profile?: Record<string, unknown> | null;
  editable_fields?: Record<string, unknown> | null;
  notes?: string | null;
};

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env[["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_")];
  if (!url || !key) return null;
  return createClient(url, key);
}

function isExpired(order: DemoOrder) {
  if (order.status === "expired") return true;
  if (!order.expires_at) return false;
  return new Date(order.expires_at).getTime() < Date.now();
}

function getPackageLabel(packageId: string, language: unknown) {
  const pkg = DEMO_SITE_PACKAGES.find((item) => item.id === packageId);
  if (!pkg) return packageId;
  const config = getDemoSiteLanguageConfig(language);
  const money = (value: number) => new Intl.NumberFormat(config.locale, { style: "currency", currency: "NOK", maximumFractionDigits: 0 }).format(value);
  const perMonth = config.id === "nb" ? "mnd" : config.id === "es" ? "mes" : config.id === "de" ? "Monat" : config.id === "fr" ? "mois" : config.id === "sv" ? "mån" : config.id === "da" ? "md." : "month";
  return `${pkg.shortName} — ${money(pkg.setupFeeNok)} + ${money(pkg.monthlyFeeNok)} / ${perMonth}`;
}

function getPaymentLabel(status: string, copy: DemoSiteClaimCopy) {
  if (status === "paid") return copy.paid;
  if (status === "pending") return copy.pending;
  return copy.unpaid;
}

function getStatusLabel(order: DemoOrder, expired: boolean, copy: DemoSiteClaimCopy) {
  if (expired) return copy.expired;
  if (order.claimed_at) return copy.claimed;
  if (order.status === "approved") return copy.approved;
  if (order.status === "deployed") return copy.live;
  return copy.temporaryDemo;
}

export default async function ClaimDemoSitePage({ params, searchParams }: ClaimPageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const token = String(resolvedParams.token || "").trim();
  const supabase = getSupabase();

  if (!token || !supabase) {
    return <ClaimShell title="Demo ikke tilgjengelig" description="Lenken er ugyldig eller systemet mangler serverkonfigurasjon." />;
  }

  const { data, error } = await supabase
    .from("demo_site_orders")
    .select("id, status, billing_status, company_name, customer_email, customer_phone, industry, website_url, package_id, setup_fee_nok, monthly_fee_nok, preview_url, claim_url, claimed_at, expires_at, extracted_profile, editable_fields, notes")
    .eq("claim_token", token)
    .maybeSingle();

  if (error || !data) {
    return <ClaimShell title="Fant ikke demoen" description="Denne demo-lenken finnes ikke, eller den er ikke lenger aktiv." />;
  }

  const order = data as DemoOrder;
  const language = normalizeDemoSiteLanguage(order.editable_fields?.site_language);
  const copy = getDemoSiteClaimCopy(language);
  const expired = isExpired(order);
  const paymentSuccess = resolvedSearchParams.paid === "1" || resolvedSearchParams.payment === "success";
  const paymentCancelled = resolvedSearchParams.cancelled === "1" || resolvedSearchParams.payment === "cancelled";

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-white">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-8 shadow-2xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="mb-4 inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-200">
                <ShieldCheck className="mr-2 h-3.5 w-3.5" /> ChatGenius DemoSites
              </div>
              <h1 className="text-3xl font-bold tracking-tight md:text-5xl">{copy.title(order.company_name)}</h1>
              <p className="mt-4 max-w-2xl text-base text-slate-300">
                {copy.intro}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4 text-sm text-slate-300">
              <div className="flex items-center gap-2 text-white"><Clock className="h-4 w-4 text-amber-300" /> {copy.expires}</div>
              <div className="mt-1 text-lg font-semibold text-amber-200">{formatDemoSiteDate(order.expires_at, language)}</div>
              {expired && <div className="mt-2 rounded-lg bg-red-500/10 p-2 text-xs text-red-200">{copy.expired}</div>}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
          <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
            <h2 className="text-xl font-semibold">{copy.statusTitle}</h2>
            {paymentSuccess && (
              <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                {copy.paymentSuccess}
              </div>
            )}
            {paymentCancelled && (
              <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                {copy.paymentCancelled}
              </div>
            )}
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <Info label={copy.status} value={getStatusLabel(order, expired, copy)} />
              <Info label={copy.payment} value={getPaymentLabel(order.billing_status, copy)} />
              <Info label={copy.package} value={getPackageLabel(order.package_id, language)} />
              <Info label={copy.industry} value={order.industry || copy.notSet} />
              <Info label={copy.website} value={order.website_url || copy.notSet} href={order.website_url || undefined} />
            </div>

            <div className="mt-6 rounded-2xl border border-slate-700 bg-slate-950/60 p-5">
              <h3 className="flex items-center gap-2 font-semibold"><Globe className="h-4 w-4 text-blue-300" /> {copy.nextStep}</h3>
              <div className="mt-4 space-y-3 text-sm text-slate-300">
                {copy.steps.map((step) => <Step key={step} text={step} />)}
              </div>
            </div>
          </section>

          <aside className="rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-6">
            <h2 className="text-xl font-semibold">{copy.keepTitle}</h2>
            <p className="mt-3 text-sm text-emerald-50/80">
              {copy.keepBody(getPackageLabel(order.package_id, language))}
            </p>
            <div className="mt-5">
              <ClaimDemoButton token={token} alreadyClaimed={Boolean(order.claimed_at)} expired={expired} paid={order.billing_status === "paid"} language={language} />
            </div>
            {order.preview_url && (
              <a href={order.preview_url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-emerald-300/30 px-4 py-3 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/10">
                {copy.viewDemo} <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            )}
            <a href="https://appointment.chatgenius.pro/booking.html?brand=chat" target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-emerald-300/30 px-4 py-3 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/10">
              {copy.bookCall}
            </a>
            <div className="mt-4 rounded-xl border border-emerald-300/20 bg-emerald-500/5 p-4 text-xs text-emerald-100/90">
              <p className="font-semibold text-emerald-50">{copy.includedTitle}</p>
              <ul className="mt-2 space-y-1.5">{copy.includedItems.map((item) => <li key={item}>✓ {item}</li>)}</ul>
            </div>
            <Link href="/demosites" className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-emerald-300/30 px-4 py-3 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/10">
              {copy.goToDemoSites}
            </Link>
            <p className="mt-4 text-xs text-emerald-100/70">
              {copy.questionText}
            </p>
          </aside>
        </div>
      </div>
    </main>
  );
}

function ClaimShell({ title, description }: { title: string; description: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
      <div className="max-w-xl rounded-3xl border border-slate-800 bg-slate-900 p-8 text-center">
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="mt-4 text-slate-300">{description}</p>
        <Link href="/demosites" className="mt-6 inline-flex rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400">
          Gå til DemoSites
        </Link>
      </div>
    </main>
  );
}

function Info({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="rounded-xl bg-slate-950/70 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      {href ? <a href={href} target="_blank" rel="noopener noreferrer" className="mt-1 flex items-center gap-1 truncate text-sm text-emerald-300 hover:text-emerald-200">{value}<ExternalLink className="h-3 w-3" /></a> : <div className="mt-1 text-sm text-slate-200">{value}</div>}
    </div>
  );
}

function Step({ text }: { text: string }) {
  return <div className="flex gap-3"><CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" /><span>{text}</span></div>;
}
