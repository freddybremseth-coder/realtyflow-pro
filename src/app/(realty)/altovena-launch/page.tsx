import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isAdminEmail, verifyAdminSession, verifyWorkspacePreviewSession, WORKSPACE_PREVIEW_COOKIE } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Altovena – lanseringsoversikt", robots: { index: false, follow: false } };

const blockers = [
  { id: "staging", title: "Bekreft isolert testdatabase", owner: "Teknisk ansvarlig", kind: "Teknisk og manuell kontroll", detail: "Verifiser egen Supabase-prosjektidentitet, tilgang og testdata. En Vercel Preview alene dokumenterer ikke isolasjon." },
  { id: "privacy", title: "Godkjenn personvern og kontaktskjema", owner: "Nettside- og personvernansvarlig", kind: "Manuell godkjenning", detail: "Bekreft behandlingsansvarlig, lagringstid, informasjonstekst, domene og Turnstile før offentlig innsending." },
  { id: "acceptance", title: "Test hele kundehenvendelsen med to godkjente brukere", owner: "Eier og teknisk ansvarlig", kind: "Manuell aksepttest", detail: "Test i isolert staging: innsendt skjema, kontakt, menneskelig oppgave og tilgang for begge operatører, inkludert tilbakekalling av rettigheter." },
  { id: "release", title: "Gi egen tillatelse til produksjonslansering", owner: "Eier", kind: "Manuell godkjenning", detail: "Kontroller CI, rollback, domene og produksjonsmiljø. Lanseringen aktiveres ikke av denne oversikten." },
] as const;

export default async function AltovenaLaunchPage() {
  const jar = cookies();
  const session = await verifyAdminSession(jar.get("realtyflow_admin")?.value);
  if (!session) redirect("/login");
  if (session.role !== "OWNER" || !isAdminEmail(session.email)) redirect("/workspaces");
  if (await verifyWorkspacePreviewSession(jar.get(WORKSPACE_PREVIEW_COOKIE)?.value, session.email))
    redirect("/workspaces");

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link href="/workspaces" className="text-sm text-cyan-300 hover:underline">← RealtyFlow arbeidsområder</Link>
        <header className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-cyan-300">Altovena · kun for eier</p>
          <h1 className="text-3xl font-bold">Lansering og kvalitetssikring</h1>
          <p className="max-w-3xl text-slate-300">Dette er en skrivebeskyttet oversikt over kjente lanseringskrav. Det er <strong>ikke en sanntidstest</strong> av database, brukere, CI eller eksterne tjenester. Ingen kontroller eller lanseringer utføres fra denne siden.</p>
        </header>
        <section aria-labelledby="control-center" className="rounded-xl border border-slate-700 bg-slate-900 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="control-center" className="text-2xl font-semibold">Altovena Control Center</h2>
              <p className="mt-2 max-w-3xl text-sm text-slate-300">Felles leveranseregister på tvers av produktspor. Dette er et datert, manuelt dokumentert øyeblikksbilde fra 19.10.2026 – ikke live GitHub-, Vercel- eller Supabase-status.</p>
            </div>
            <a href="https://github.com/freddybremseth-coder/Altovena/pull/7" target="_blank" rel="noopener noreferrer" className="rounded-lg border border-cyan-700 px-3 py-2 text-sm font-semibold text-cyan-300 hover:bg-slate-800">Åpne hovedregister PR #7 ↗</a>
          </div>
          <p className="mt-4 text-sm text-amber-200">Ingen produktlinje nedenfor er her bekreftet som komplett SaaS-leveranse. For å heve status kreves verifisert commit, CI, faktisk produksjonsdeploy og funksjonell aksept hver for seg.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {[
              { id: "AV-006", name: "Offer Intelligence", status: "Pilotavgrensning gjenstår", next: "Bekreft faktisk Corporate-funksjonalitet, separate scoretyper og én sluttført salgsflyt", url: "https://github.com/freddybremseth-coder/realtyflow-pro/pull/1323" },
              { id: "AV-007", name: "Visibility", status: "Utførelseskjede ikke sluttverifisert", next: "Én tillatt feil → godkjent retting → publisering → ny uavhengig kontroll", url: "https://github.com/freddybremseth-coder/realtyflow-pro/pull/1463" },
              { id: "AV-008", name: "Command / Nexus", status: "Uferdig agentkjede", next: "Én sikker analyse med evidens, kontroll, budsjettgrense og godkjent intern oppgave", url: "https://github.com/freddybremseth-coder/realtyflow-pro/pull/1437" },
              { id: "AV-002", name: "Nettside", status: "Forhåndsvisning – lanseringskontroll gjenstår", next: "Godkjenn innhold, juridiske forhold og faktisk produksjonsrevisjon", url: "https://github.com/freddybremseth-coder/Altovena/pull/2" },
              { id: "AV-003", name: "CRM og kundehenvendelser", status: "Staging og aksept blokkert", next: "Isolert staging, to operatører og test av skjema → lead → oppgave → varsel", url: "https://github.com/freddybremseth-coder/realtyflow-pro/pull/1400" },
              { id: "AV-010", name: "Olivia OS", status: "Separat SaaS-kandidat", next: "Kontroller gårdsmeny, gjentatt analyse og kundeseparasjon", url: "https://github.com/freddybremseth-coder/Altovena/pull/6" }
            ].map((product) => (
              <article key={product.id} className="rounded-lg border border-slate-700 bg-slate-950 p-4">
                <p className="text-xs font-semibold tracking-wider text-cyan-300">{product.id} · Uavklart leveranse</p>
                <h3 className="mt-1 text-lg font-semibold">{product.name}</h3>
                <p className="mt-1 text-sm text-amber-200">{product.status}</p>
                <p className="mt-2 text-sm text-slate-300"><strong>Neste handling:</strong> {product.next}</p>
                <a className="mt-3 inline-block text-sm text-cyan-300 hover:underline" href={product.url} target="_blank" rel="noopener noreferrer">Se relevant GitHub-arbeid ↗</a>
              </article>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <a className="text-cyan-300 hover:underline" href="https://github.com/freddybremseth-coder/Altovena/pull/7" target="_blank" rel="noopener noreferrer">Alle 17 registrerte arbeidsområder ↗</a>
            <a className="text-cyan-300 hover:underline" href="https://github.com/freddybremseth-coder/Altovena/pull/6" target="_blank" rel="noopener noreferrer">Arkitektur og samlet roadmap ↗</a>
          </div>
        </section>
        <section aria-label="Lanseringsstatus" className="rounded-xl border border-amber-700 bg-slate-900 p-5">
          <h2 className="text-xl font-semibold">Ikke klar for offentlig aktivering</h2>
          <p className="mt-2 text-sm text-slate-300">Alle punktene nedenfor vises som uavklarte til de er kontrollert separat. Eksisterende RealtyFlow-funksjoner påvirkes ikke.</p>
        </section>
        <section aria-labelledby="next-actions" className="space-y-4">
          <h2 id="next-actions" className="text-2xl font-semibold">De tre første oppgavene</h2>
          <div className="grid gap-4">
            {blockers.slice(0, 3).map((item, index) => (
              <article key={item.id} className="rounded-xl border border-slate-700 bg-slate-900 p-5">
                <p className="text-xs uppercase tracking-wide text-amber-300">Uavklart · steg {index + 1}</p>
                <h3 className="mt-2 text-lg font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm text-slate-300">{item.detail}</p>
                <p className="mt-3 text-sm"><strong>Ansvar:</strong> {item.owner}</p>
                <p className="text-sm"><strong>Verifikasjon:</strong> {item.kind}</p>
              </article>
            ))}
          </div>
        </section>
        <section aria-labelledby="other-actions" className="rounded-xl border border-slate-700 p-5">
          <h2 id="other-actions" className="text-xl font-semibold">Andre uavklarte krav</h2>
          <ul className="mt-3 space-y-3">
            {blockers.slice(3).map((item) => <li key={item.id}><strong>{item.title}</strong><p className="text-sm text-slate-300">{item.detail} Ansvar: {item.owner}.</p></li>)}
          </ul>
        </section>
        <p className="text-xs text-slate-400">Denne uavhengige visningen har ingen database- eller API-kall og inneholder ingen knapper som endrer data. Den dynamiske kontrollmotoren i Altovena CRM-utviklingsgrenen erstatter ikke disse manuelle lanseringskravene.</p>
      </div>
    </main>
  );
}
