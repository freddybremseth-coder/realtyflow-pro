import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isAdminEmail, verifyAdminSession, verifyWorkspacePreviewSession, WORKSPACE_PREVIEW_COOKIE } from "@/lib/admin-auth";
import { AltovenaLaunchReadiness } from "@/components/workspaces/altovena-launch-readiness";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AltovenaLaunchPage() {
  const jar = cookies();
  const token = jar.get("realtyflow_admin")?.value;
  const session = await verifyAdminSession(token);
  if (!session) redirect("/login");
  if (session.role !== "OWNER" || !isAdminEmail(session.email)) redirect("/workspaces");
  // Never show owner activation context through a borrowed staff preview.
  if (await verifyWorkspacePreviewSession(jar.get(WORKSPACE_PREVIEW_COOKIE)?.value, session.email))
    redirect("/workspaces");

  return <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-2">
        <Link href="/workspaces" className="text-sm text-teal-300 hover:underline">← RealtyFlow arbeidsområder</Link>
        <p className="pt-3 text-xs font-semibold uppercase tracking-wider text-teal-300">ALTOVENA · EIERKONTROLL</p>
        <h1 className="text-3xl font-bold">Aktivering og kvalitetssikring</h1>
        <p className="max-w-3xl text-sm text-slate-300">
          Kontrollér tilgangen for Freddy og Andrea, sikkert skjemamottak, personvern og siste tekniske sperrer.
          Dette er kun en skrivebeskyttet kontrollside. Altovena trenger ikke være opprettet
          i databasen for å vise hvorfor oppstarten fortsatt er blokkert.
        </p>
      </header>
      <AltovenaLaunchReadiness />
      <p className="text-sm text-slate-400">
        Når teknisk oppsett er verifisert, skal en reell testhenvendelse i et godkjent miljø
        bekrefte kontaktkort, oppgave og varsling før offentlig innsending aktiveres.
      </p>
    </div>
  </main>;
}
