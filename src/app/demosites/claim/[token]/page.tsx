import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { CheckCircle, Clock, ExternalLink, Globe, ShieldCheck } from "lucide-react";
import { ClaimDemoButton } from "@/components/demosites/claim-demo-button";
import { DEMO_SITE_PACKAGES, formatNok } from "@/lib/demosites";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ClaimPageProps = {
  params: Promise<{ token: string }> | { token: string };
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
  notes?: string | null;
};

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env[["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_")];
  if (!url || !key) return null;
  return createClient(url, key);
}

function formatDate(value?: string | null) {
  if (!value) return "Ikke satt";
  return new Intl.DateTimeFormat("nb-NO", { dateStyle: "medium" }).format(new Date(value));
}

function isExpired(order: DemoOrder) {
  if (order.status === "expired") return true;
  if (!order.expires_at) return false;
  return new Date(order.expires_at).getTime() < Date.now();
}

function getPackageLabel(packageId: string) {
  const pkg = DEMO_SITE_PACKAGES.find((item) => item.id === packageId);
  if (!pkg) return packageId;
  return `${pkg.shortName} — ${formatNok(pkg.setupFeeNok)} + ${formatNok(pkg.monthlyFeeNok)} / mnd`;
}

function getStatusLabel(order: DemoOrder, expired: boolean) {
  if (expired) return "Utløpt";
  if (order.claimed_at) return "Claimet av kunde";
  if (order.status === "approved") return "Godkjent";
  if (order.status === "deployed") return "Live";
  return "Midlertidig demo";
}

export default async function ClaimDemoSitePage({ params }: ClaimPageProps) {
  const resolvedParams = await params;
  const token = String(resolvedParams.token || "").trim();
  const supabase = getSupabase();

  if (!token || !supabase) {
    return <ClaimShell title="Demo ikke tilgjengelig" description="Lenken er ugyldig eller systemet mangler serverkonfigurasjon." />;
  }

  const { data, error } = await supabase
    .from("demo_site_orders")
    .select("id, status, billing_status, company_name, customer_email, customer_phone, industry, website_url, package_id, setup_fee_nok, monthly_fee_nok, preview_url, claim_url, claimed_at, expires_at, extracted_profile, notes")
    .eq("claim_token", token)
    .maybeSingle();

  if (error || !data) {
    return <ClaimShell title="Fant ikke demoen" description="Denne demo-lenken finnes ikke, eller den er ikke lenger aktiv." />;
  }

  const order = data as DemoOrder;
  const expired = isExpired(order);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-white">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-8 shadow-2xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="mb-4 inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-200">
                <ShieldCheck className="mr-2 h-3.5 w-3.5" /> ChatGenius DemoSites
              </div>
              <h1 className="text-3xl font-bold tracking-tight md:text-5xl">Gjør prøvesiden til den offisielle nettsiden for {order.company_name}</h1>
              <p className="mt-4 max-w-2xl text-base text-slate-300">
                Betal oppstart + første måned nå, så publiserer vi siden med hosting, SSL og drift — prøvesiden du allerede har sett blir din.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4 text-sm text-slate-300">
              <div className="flex items-center gap-2 text-white"><Clock className="h-4 w-4 text-amber-300" /> Utløper</div>
              <div className="mt-1 text-lg font-semibold text-amber-200">{formatDate(order.expires_at)}</div>
              {expired && <div className="mt-2 rounded-lg bg-red-500/10 p-2 text-xs text-red-200">Denne demoen er utløpt.</div>}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
          <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
            <h2 className="text-xl font-semibold">Demo-status</h2>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <Info label="Status" value={getStatusLabel(order, expired)} />
              <Info label="Pakke" value={getPackageLabel(order.package_id)} />
              <Info label="Bransje" value={order.industry || "Ikke satt"} />
              <Info label="Eksisterende nettside" value={order.website_url || "Ikke satt"} href={order.website_url || undefined} />
            </div>

            <div className="mt-6 rounded-2xl border border-slate-700 bg-slate-950/60 p-5">
              <h3 className="flex items-center gap-2 font-semibold"><Globe className="h-4 w-4 text-blue-300" /> Neste steg</h3>
              <div className="mt-4 space-y-3 text-sm text-slate-300">
                <Step text="Betal trygt med kort via Stripe — oppstart + første måned i én betaling." />
                <Step text="Vi klargjør og publiserer siden med hosting, SSL og eventuelle justeringer du ønsker." />
                <Step text="Månedlig drift fornyes automatisk. Ingen bindingstid utover inneværende måned." />
              </div>
            </div>
          </section>

          <aside className="rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-6">
            <h2 className="text-xl font-semibold">Vil du beholde siden?</h2>
            <p className="mt-3 text-sm text-emerald-50/80">
              {getPackageLabel(order.package_id)}. Du betaler nå og siden blir din — vi publiserer og drifter den for deg.
            </p>
            <div className="mt-5">
              <ClaimDemoButton token={token} alreadyClaimed={Boolean(order.claimed_at)} expired={expired} paid={order.billing_status === "paid"} />
            </div>
            {order.preview_url && (
              <a href={order.preview_url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-emerald-300/30 px-4 py-3 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/10">
                Se prøvesiden <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            )}
            <a href="https://appointment.chatgenius.pro/booking.html?brand=chat" target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-emerald-300/30 px-4 py-3 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/10">
              Book 30 min gratis analysesamtale
            </a>
            <div className="mt-4 rounded-xl border border-emerald-300/20 bg-emerald-500/5 p-4 text-xs text-emerald-100/90">
              <p className="font-semibold text-emerald-50">Inkludert som DemoSites-kunde:</p>
              <ul className="mt-2 space-y-1.5">
                <li>✓ 30 min gratis samtale — vi analyserer bedriften og foreslår tilpasninger</li>
                <li>✓ <span className="font-semibold">60 % rabatt</span> på utviklertimer: 596 kr/t (ordinært 1 490 kr/t)</li>
                <li>✓ SEO & Google-optimalisering kan legges til for 490 kr (engangsbeløp)</li>
              </ul>
            </div>
            <Link href="/demosites" className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-emerald-300/30 px-4 py-3 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/10">
              Les om DemoSites
            </Link>
            <p className="mt-4 text-xs text-emerald-100/70">
              Spørsmål før du bestiller? Send oss en e-post på post@chatgenius.pro, så svarer vi raskt.
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
