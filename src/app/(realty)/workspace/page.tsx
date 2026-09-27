"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Building2, LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";

type Workspace = { brandKey: string; name: string; permissions: string[] };
export default function MyWorkspacesPage() {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    fetch("/api/workspaces/available", { cache: "no-store", signal: abort.signal })
      .then(async res => {
        const body = await res.json();
        if (!res.ok) throw new Error(res.status === 401
          ? "Logg inn for å åpne arbeidsområdene dine."
          : "Kunne ikke hente arbeidsområdene. Kontakt administrator.");
        return body;
      })
      .then(body => {
        if (abort.signal.aborted) return;
        if (body.owner) router.replace("/workspaces");
        else setWorkspaces(body.workspaces || []);
      })
      .catch(cause => { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "Kunne ikke laste arbeidsområdene."); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">RealtyFlow</p>
            <h1 className="mt-2 text-3xl font-bold">Mine arbeidsområder</h1>
            <p className="mt-2 text-sm text-slate-400">Her finner du kun virksomhetene og oppgavene du har tilgang til.</p></div>
          <button type="button" className="rounded-lg border border-slate-700 px-3 py-2 text-sm" onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            window.location.assign("/login");
          }}>Logg ut</button>
        </header>
        {loading && <p className="text-sm text-slate-400">Kontrollerer tilgang…</p>}
        {error && <p role="alert" className="rounded-xl border border-amber-700 bg-amber-950/30 p-4 text-amber-200">
          <LockKeyhole className="mr-2 inline" size={17}/>{error} <Link href="/login" className="underline">Logg inn</Link>
        </p>}
        {!loading && !error && workspaces.length === 0 && <p className="rounded-xl border border-slate-700 bg-slate-900 p-5 text-slate-300">
          Ingen aktive arbeidsområder er tildelt denne brukeren. Be administrator om tilgang.
        </p>}
        {!loading && !error && workspaces.map(workspace =>
          <Link key={workspace.brandKey} href={`/workspace/${encodeURIComponent(workspace.brandKey)}`}
            className="flex items-center justify-between gap-4 rounded-2xl border border-slate-700 bg-slate-900 p-5 hover:border-cyan-500">
            <span className="flex items-center gap-3"><Building2 className="text-cyan-400" size={25}/>
              <span><span className="block text-lg font-semibold">{workspace.name}</span>
                <span className="text-sm text-slate-400">{workspace.permissions.length} tildelte rettigheter</span></span></span>
            <ArrowRight size={19} className="text-cyan-300"/>
          </Link>)}
      </div>
    </div>
  );
}
