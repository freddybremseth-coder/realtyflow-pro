import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import {
  verifyAdminSession,
  verifyWorkspacePreviewSession,
  WORKSPACE_PREVIEW_COOKIE,
} from "@/lib/admin-auth";
import {
  ALTOVENA_HOSTING_MODEL,
  ALTOVENA_PRODUCT_REGISTER,
} from "@/lib/altovena/product-register";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Altovena – produktoversikt | RealtyFlow",
  description: "Intern oversikt over Altovena-produktene og deres utviklingsgrenser.",
  robots: { index: false, follow: false },
};

const checks = [
  {
    heading: "Kunde og tilgang",
    detail: "RealtyflowPRO er den interne verten. Eksterne kunder skal ha eget miljø og rettighetskontroll.",
  },
  {
    heading: "Kilder og godkjenning",
    detail: "Kildeinnhenting, dokumentasjon og menneskelig godkjenning må fungere med reelle roller før AI kan aktiveres.",
  },
  {
    heading: "Salg og kundehenvendelser",
    detail: "Altovenas offentlige kontaktskjema er ikke koblet til aktiv, ferdig testet CRM-innsending ennå.",
  },
] as const;

export default async function AltovenaPortfolioPage() {
  const jar = cookies();
  const session = await verifyAdminSession(jar.get("realtyflow_admin")?.value);
  if (session?.role !== "OWNER" ||
      await verifyWorkspacePreviewSession(
        jar.get(WORKSPACE_PREVIEW_COOKIE)?.value,
        session.email,
      )) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-7xl space-y-7 px-4 py-7 text-slate-100 sm:px-6">
      <header className="rounded-2xl border border-teal-900/60 bg-slate-900 p-5 sm:p-7">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-teal-300">
          Altovena / Platform & Operations
        </p>
        <h1 className="text-3xl font-semibold sm:text-4xl">Produktene våre</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
          Ett utviklingsprogram med egne produkter og RealtyFlow/Nexus som felles motor.
          Her finner du de faktiske interne arbeidsflatene og hva som må fullføres
          før hvert produkt kan tilbys som selvstendig SaaS.
        </p>
        <div className="mt-4 rounded-lg border border-amber-800/50 bg-amber-950/30 p-3 text-sm text-amber-100">
          Intern utviklingsoversikt, ikke live deploy-overvåking eller salgsstatus.
          Ingen av produktene nedenfor er godkjent for ekstern SaaS-lansering
          fra dette panelet.
        </div>
      </header>

      <section aria-labelledby="products-title" className="space-y-4">
        <h2 id="products-title" className="text-xl font-semibold">Produkter og arbeidsflater</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {ALTOVENA_PRODUCT_REGISTER.map(product => (
            <article key={product.id} className="flex flex-col rounded-2xl border border-slate-700 bg-slate-900 p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="text-xl font-semibold">Altovena {product.name}</h3>
                <span className="rounded-full border border-slate-600 bg-slate-800 px-3 py-1 text-xs text-slate-200">
                  {product.stageLabel}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-300">{product.summary}</p>
              <p className="mt-2 text-xs text-slate-400">Systemansvar: {product.ownerSystem}</p>
              <div className="mt-4 flex-1 rounded-xl bg-slate-950/70 p-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-teal-300">Neste krav</p>
                <p className="text-sm leading-5 text-slate-300">{product.nextRequirement}</p>
              </div>
              <div className="mt-4">
                {product.primaryHref ? (
                  <Link
                    href={product.primaryHref}
                    className="inline-flex items-center rounded-lg border border-teal-600 px-4 py-2 text-sm font-medium text-teal-200 hover:bg-teal-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300"
                  >
                    Åpne intern arbeidsflate →
                  </Link>
                ) : (
                  <span className="inline-flex rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-400">
                    Integrasjon ikke aktivert
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="architecture-title" className="rounded-2xl border border-slate-700 bg-slate-900 p-5 sm:p-6">
        <h2 id="architecture-title" className="text-xl font-semibold">Felles arkitektur – atskilte kundedata</h2>
        <dl className="mt-4 grid gap-4 text-sm md:grid-cols-2">
          <div><dt className="font-semibold text-teal-300">Utviklingsdatabase</dt><dd className="mt-1 text-slate-300">{ALTOVENA_HOSTING_MODEL.development}</dd></div>
          <div><dt className="font-semibold text-teal-300">Kundens egen SaaS-installasjon</dt><dd className="mt-1 text-slate-300">{ALTOVENA_HOSTING_MODEL.customerInstallation}</dd></div>
          <div><dt className="font-semibold text-teal-300">Nexus</dt><dd className="mt-1 text-slate-300">{ALTOVENA_HOSTING_MODEL.sharedNexus}</dd></div>
          <div><dt className="font-semibold text-teal-300">Kontaktskjema</dt><dd className="mt-1 text-slate-300">{ALTOVENA_HOSTING_MODEL.websiteIntake}</dd></div>
        </dl>
      </section>

      <section aria-labelledby="release-title" className="space-y-3">
        <h2 id="release-title" className="text-xl font-semibold">Felles krav før kommersiell aktivering</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {checks.map(check => (
            <div key={check.heading} className="rounded-xl border border-slate-700 bg-slate-900 p-4">
              <h3 className="font-semibold">{check.heading}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">{check.detail}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400">
          Denne listen er en kontrolliste, ikke en automatisk måling. Kode, migreringer,
          tilgangsregler og reelle kundeopplevelser må testes før status endres.
        </p>
      </section>
    </main>
  );
}
