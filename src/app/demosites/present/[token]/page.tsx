import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import { ArrowRight, ExternalLink, Sparkles } from "lucide-react";
import { DemoBeforeAfter } from "@/components/demosites/demo-before-after";
import { buildBeforeScreenshotUrl } from "@/lib/demosites-enrichment";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BASE_URL = process.env.NEXT_PUBLIC_REALTYFLOW_URL || "https://realtyflow.chatgenius.pro";

type PresentPageProps = {
  params: Promise<{ token: string }> | { token: string };
};

type DemoOrder = {
  company_name: string;
  website_url?: string | null;
  logo_url?: string | null;
  brand_color?: string | null;
  claim_url?: string | null;
  expires_at?: string | null;
  editable_fields?: Record<string, unknown> | null;
};

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env[["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_")];
  if (!url || !key) return null;
  return createClient(url, key);
}

export const metadata: Metadata = {
  title: "DemoSites presentasjon",
  robots: { index: false },
};

/**
 * /demosites/present/[token] — presentation mode for physical sales
 * meetings. Dark stage, logo intro, before/after slider, live demo in a
 * laptop frame and a QR code so the customer opens the demo on their own
 * phone while the seller talks.
 */
export default async function DemoPresentPage({ params }: PresentPageProps) {
  const resolvedParams = await params;
  const token = String(resolvedParams.token || "").trim();
  const supabase = getSupabase();

  if (!token || !supabase) {
    return <PresentError message="Ugyldig presentasjonslenke." />;
  }

  const { data } = await supabase
    .from("demo_site_orders")
    .select("company_name, website_url, logo_url, brand_color, claim_url, expires_at, editable_fields")
    .eq("claim_token", token)
    .maybeSingle();

  if (!data) {
    return <PresentError message="Fant ikke demoen. Sjekk lenken og prøv igjen." />;
  }

  const order = data as DemoOrder;
  const fields = order.editable_fields || {};
  const previewPath = `/demosites/preview/${token}?present=1`;
  const previewUrl = `${BASE_URL}${previewPath}`;
  const brandColor = /^#[0-9A-Fa-f]{6}$/.test(String(order.brand_color || "")) ? String(order.brand_color) : "#34d399";

  const beforeUrl =
    (typeof fields.before_screenshot_url === "string" && fields.before_screenshot_url) ||
    buildBeforeScreenshotUrl(order.website_url) ||
    null;
  const afterUrl = `https://image.thum.io/get/width/1200/noanimate/${previewUrl}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=440x440&margin=12&data=${encodeURIComponent(previewUrl)}`;

  return (
    <main className="min-h-screen bg-[#05070f] text-white">
      <style>{`
        @keyframes present-logo-in { 0% { opacity: 0; transform: scale(0.7) translateY(20px); } 60% { opacity: 1; transform: scale(1.05) translateY(0); } 100% { opacity: 1; transform: scale(1); } }
        @keyframes present-rise { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: none; } }
        .present-logo { animation: present-logo-in 1.1s cubic-bezier(0.16, 1, 0.3, 1) both; }
        .present-rise { animation: present-rise 0.9s cubic-bezier(0.16, 1, 0.3, 1) both; }
        .present-rise-2 { animation: present-rise 0.9s 0.35s cubic-bezier(0.16, 1, 0.3, 1) both; }
        .present-rise-3 { animation: present-rise 0.9s 0.65s cubic-bezier(0.16, 1, 0.3, 1) both; }
        @media (prefers-reduced-motion: reduce) { .present-logo, .present-rise, .present-rise-2, .present-rise-3 { animation: none; } }
      `}</style>

      {/* ── Intro stage ── */}
      <section className="relative flex min-h-[52vh] flex-col items-center justify-center overflow-hidden px-4 text-center">
        <div className="absolute inset-0 opacity-40" style={{ background: `radial-gradient(60% 55% at 50% 42%, ${brandColor}33, transparent 70%)` }} />
        <div className="present-logo relative z-10">
          {order.logo_url ? (
            <span className="inline-flex items-center rounded-2xl bg-white px-8 py-5 shadow-2xl">
              <img src={order.logo_url} alt={`${order.company_name} logo`} className="max-h-20 w-auto max-w-[16rem] object-contain" />
            </span>
          ) : (
            <span className="inline-flex h-24 w-24 items-center justify-center rounded-2xl text-4xl font-black text-slate-950 shadow-2xl" style={{ backgroundColor: brandColor }}>
              {order.company_name.slice(0, 1).toUpperCase()}
            </span>
          )}
        </div>
        <h1 className="present-rise-2 relative z-10 mt-8 max-w-3xl text-4xl font-black leading-tight md:text-6xl">
          Den nye nettsiden til<br />
          <span style={{ color: brandColor }}>{order.company_name}</span>
        </h1>
        <p className="present-rise-3 relative z-10 mt-5 max-w-xl text-base text-slate-400 md:text-lg">
          <Sparkles className="mr-1.5 inline h-4 w-4" style={{ color: brandColor }} />
          Bygget og klar. Dette er ikke en skisse — siden er live nå.
        </p>
      </section>

      {/* ── Before / after ── */}
      {beforeUrl && (
        <section className="mx-auto max-w-5xl px-4 pb-16">
          <h2 className="mb-2 text-center text-2xl font-bold md:text-3xl">Fra dagens side til ny side</h2>
          <p className="mb-6 text-center text-sm text-slate-400">Dra i midten for å sammenligne.</p>
          <DemoBeforeAfter beforeUrl={beforeUrl} afterUrl={afterUrl} />
        </section>
      )}

      {/* ── Live demo in device frames + QR ── */}
      <section className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 pb-16 lg:grid-cols-[1.5fr_1fr]">
        <div>
          <h2 className="mb-4 text-2xl font-bold md:text-3xl">Live akkurat nå</h2>
          <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex items-center gap-1.5 border-b border-slate-800 bg-slate-950 px-4 py-2.5">
              <span className="h-3 w-3 rounded-full bg-red-500/80" />
              <span className="h-3 w-3 rounded-full bg-amber-500/80" />
              <span className="h-3 w-3 rounded-full bg-emerald-500/80" />
              <span className="ml-3 truncate rounded-md bg-slate-800 px-3 py-1 text-xs text-slate-400">{previewUrl.replace(/^https?:\/\//, "").split("?")[0]}</span>
            </div>
            <iframe src={previewPath} title={`Demo av ${order.company_name}`} className="h-[540px] w-full bg-white" loading="lazy" />
          </div>
        </div>
        <div className="flex flex-col items-center text-center">
          <h3 className="text-xl font-bold">Åpne på din egen mobil</h3>
          <p className="mt-2 max-w-xs text-sm text-slate-400">Skann QR-koden — så holder du den nye nettsiden din i hånden om tre sekunder.</p>
          <span className="mt-5 rounded-2xl bg-white p-4 shadow-2xl">
            <img src={qrUrl} alt="QR-kode til demoen" className="h-52 w-52" />
          </span>
          <div className="mt-8 flex flex-col gap-3">
            <a href={previewPath.replace("?present=1", "")} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-600 px-6 py-3 text-sm font-semibold text-white hover:border-slate-400">
              Åpne i fullskjerm <ExternalLink className="h-4 w-4" />
            </a>
            {order.claim_url && (
              <a href={order.claim_url} className="inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-bold text-slate-950 transition-transform hover:scale-[1.02]" style={{ backgroundColor: brandColor }}>
                Bestill siden nå <ArrowRight className="h-4 w-4" />
              </a>
            )}
          </div>
          {order.expires_at && (
            <p className="mt-4 text-xs text-slate-500">
              Demoen er aktiv til {new Intl.DateTimeFormat("nb-NO", { dateStyle: "long" }).format(new Date(order.expires_at))}.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}

function PresentError({ message }: { message: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
      <div className="max-w-md rounded-lg border border-slate-800 bg-slate-900 p-8 text-center">
        <h1 className="text-2xl font-bold">Presentasjon utilgjengelig</h1>
        <p className="mt-3 text-slate-300">{message}</p>
        <Link href="/demosites" className="mt-6 inline-flex rounded-lg bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400">
          Gå til DemoSites
        </Link>
      </div>
    </main>
  );
}
