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
