import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { ArrowRight, Bot, CheckCircle, ExternalLink, MessageCircle, ShieldCheck, Sparkles } from "lucide-react";
import { DEMO_SITE_PACKAGES, formatNok } from "@/lib/demosites";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PreviewPageProps = {
  params: Promise<{ token: string }> | { token: string };
};

type DemoOrder = {
  status: string;
  company_name: string;
  customer_email: string;
  customer_phone?: string | null;
  industry?: string | null;
  website_url?: string | null;
  package_id: string;
  setup_fee_nok: number;
  monthly_fee_nok: number;
  claim_url?: string | null;
  expires_at?: string | null;
  brand_color?: string | null;
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

function text(value: unknown, fallback = "") {
  const output = String(value || "").trim();
  return output || fallback;
}

function formatDate(value?: string | null) {
  if (!value) return "7 dager";
  return new Intl.DateTimeFormat("nb-NO", { dateStyle: "medium" }).format(new Date(value));
}

function getPackage(packageId: string) {
  return DEMO_SITE_PACKAGES.find((pkg) => pkg.id === packageId) || DEMO_SITE_PACKAGES[1];
}

function getServices(order: DemoOrder) {
  const fields = order.editable_fields || {};
  const services = Array.isArray(fields.services) ? fields.services : [];
  if (services.length > 0) return services.map((item) => String(item));
  return [
    "Profesjonell nettside på mobil og desktop",
    "Tydelig kontakt og lead-fangst",
    "ChatGenius AI-assistent kan kobles på",
  ];
}

export default async function DemoPreviewPage({ params }: PreviewPageProps) {
  const resolvedParams = await params;
  const token = String(resolvedParams.token || "").trim();
  const supabase = getSupabase();

  if (!token || !supabase) {
    return <NotFound title="Preview ikke tilgjengelig" description="Lenken er ugyldig eller systemet mangler serverkonfigurasjon." />;
  }

  const { data, error } = await supabase
    .from("demo_site_orders")
    .select("status, company_name, customer_email, customer_phone, industry, website_url, package_id, setup_fee_nok, monthly_fee_nok, claim_url, expires_at, brand_color, extracted_profile, editable_fields, notes")
    .eq("claim_token", token)
    .maybeSingle();

  if (error || !data) {
    return <NotFound title="Fant ikke preview" description="Denne preview-lenken finnes ikke, eller demoen er ikke lenger tilgjengelig." />;
  }

  const order = data as DemoOrder;
  const pkg = getPackage(order.package_id);
  const companyName = order.company_name;
  const industry = text(order.industry, "lokale tjenester");
  const services = getServices(order);
  const heroText = text((order.editable_fields || {}).hero_text, `${companyName} hjelper kunder med ${industry}.`);
  const aboutText = text((order.editable_fields || {}).about_text, order.notes || "Denne previewen viser hvordan en ny nettside kan presentere bedriften tydeligere og gjøre det enklere å ta kontakt.");

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="font-bold tracking-tight">{companyName}</div>
          <div className="hidden items-center gap-6 text-sm text-slate-600 md:flex">
            <a href="#tjenester" className="hover:text-slate-950">Tjenester</a>
            <a href="#om" className="hover:text-slate-950">Om oss</a>
            <a href="#kontakt" className="hover:text-slate-950">Kontakt</a>
          </div>
          <a href={`mailto:${order.customer_email}`} className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">Kontakt</a>
        </div>
      </div>

      <section className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 py-16 lg:grid-cols-[1.2fr_0.8fr] lg:py-24">
        <div>
          <div className="mb-5 inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            <Sparkles className="mr-2 h-3.5 w-3.5" /> Midlertidig DemoSites-preview
          </div>
          <h1 className="text-4xl font-black tracking-tight md:text-6xl">{heroText}</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">{aboutText}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a href={`mailto:${order.customer_email}`} className="inline-flex items-center justify-center rounded-2xl bg-emerald-600 px-6 py-4 text-sm font-bold text-white hover:bg-emerald-500">
              Be om tilbud <ArrowRight className="ml-2 h-4 w-4" />
            </a>
            {order.website_url && <a href={order.website_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center rounded-2xl border border-slate-300 px-6 py-4 text-sm font-bold text-slate-700 hover:bg-white">Eksisterende nettside <ExternalLink className="ml-2 h-4 w-4" /></a>}
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl">
          <div className="rounded-3xl bg-slate-950 p-5 text-white">
            <div className="flex items-center gap-2 text-sm text-emerald-200"><Bot className="h-4 w-4" /> ChatGenius AI-assistent</div>
            <div className="mt-6 rounded-2xl bg-white/10 p-4 text-sm">Hei! Jeg kan hjelpe deg med informasjon om {companyName}, tjenester og kontakt.</div>
            <div className="mt-3 rounded-2xl bg-emerald-500 p-4 text-sm font-medium text-slate-950">Hva ønsker du hjelp med i dag?</div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
            <Info label="Pakke" value={pkg.shortName} />
            <Info label="Utløper" value={formatDate(order.expires_at)} />
          </div>
        </div>
      </section>

      <section id="tjenester" className="bg-white py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-3xl font-bold">Hva kunden kan få hjelp med</h2>
          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
            {services.slice(0, 3).map((service) => (
              <div key={service} className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
                <CheckCircle className="h-6 w-6 text-emerald-600" />
                <h3 className="mt-4 font-semibold">{service}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">Denne delen kan senere byttes ut med ekte tekst, bilder, priser og produkter.</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="om" className="mx-auto max-w-6xl px-4 py-16">
        <div className="rounded-[2rem] bg-slate-950 p-8 text-white md:p-12">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-bold">Om {companyName}</h2>
              <p className="mt-4 leading-8 text-slate-300">{aboutText}</p>
            </div>
            <div className="rounded-3xl bg-white/10 p-6">
              <ShieldCheck className="h-7 w-7 text-emerald-300" />
              <h3 className="mt-4 font-semibold">Klar for profesjonell nettside</h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">Denne previewen er et første utkast. Når kunden godkjenner, kan vi bygge videre mot ferdig nettside, hosting, SSL og ChatGenius-assistent.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="kontakt" className="bg-emerald-600 py-16 text-white">
        <div className="mx-auto max-w-4xl px-4 text-center">
          <MessageCircle className="mx-auto h-8 w-8" />
          <h2 className="mt-4 text-3xl font-bold">Klar for flere henvendelser?</h2>
          <p className="mt-3 text-emerald-50">Denne delen blir senere koblet til skjema, e-post, CRM og eventuell AI-chat.</p>
          <a href={`mailto:${order.customer_email}`} className="mt-8 inline-flex rounded-2xl bg-white px-6 py-4 text-sm font-bold text-emerald-700 hover:bg-emerald-50">Kontakt {companyName}</a>
        </div>
      </section>

      <footer className="bg-slate-950 px-4 py-8 text-center text-xs text-slate-500">
        Demo laget med ChatGenius DemoSites. {order.claim_url && <Link href={order.claim_url} className="text-emerald-300 hover:text-emerald-200">Se claim-side</Link>}
      </footer>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-slate-100 p-4"><div className="text-xs uppercase tracking-wide text-slate-500">{label}</div><div className="mt-1 font-semibold text-slate-950">{value}</div></div>;
}

function NotFound({ title, description }: { title: string; description: string }) {
  return <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white"><div className="max-w-xl rounded-3xl border border-slate-800 bg-slate-900 p-8 text-center"><h1 className="text-3xl font-bold">{title}</h1><p className="mt-4 text-slate-300">{description}</p><Link href="/demosites" className="mt-6 inline-flex rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400">Gå til DemoSites</Link></div></main>;
}
