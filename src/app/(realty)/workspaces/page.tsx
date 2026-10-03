"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Clapperboard, Banknote, LockKeyhole, Megaphone, Settings, Users } from "lucide-react";
import { REALTYFLOW_APPS, appVisibleForRole } from "@/lib/platform-apps";
import type { AccessRole } from "@/lib/access-control";

const iconMap = { Users, Megaphone, Clapperboard, Banknote, Settings };

type CurrentUser = {
  role: AccessRole;
  permissions: string[];
};

export default function WorkspacesPage() {
  const [user, setUser] = useState<CurrentUser | null | undefined>(undefined);

  useEffect(() => {
    let mounted = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => res.ok ? res.json() : null)
      .then((body) => {
        if (!mounted) return;
        setUser(body?.user ? { role: body.user.role, permissions: body.user.permissions || [] } : null);
      })
      .catch(() => { if (mounted) setUser(null); });
    return () => { mounted = false; };
  }, []);

  const visibleApps = useMemo(
    () => user ? REALTYFLOW_APPS.filter((app) => appVisibleForRole(app, user.role, user.permissions)) : [],
    [user],
  );

  if (user === undefined) return <p className="p-6 text-slate-400">Laster arbeidsområder…</p>;
  if (!user) return <div className="rounded-xl border border-slate-700 p-6">Kunne ikke lese brukertilgangen.</div>;

  return (
    <div className="mx-auto max-w-6xl space-y-7 text-slate-100">
      <header>
        <p className="mb-1 text-sm font-semibold uppercase tracking-wider text-cyan-400">RealtyFlow Platform</p>
        <h1 className="text-3xl font-bold">Hva skal du jobbe med?</h1>
        <p className="mt-2 max-w-3xl text-slate-400">
          RealtyFlow er én plattform med felles kunder, merkevarer, data og Nexus-signaler. Velg arbeidsområdet som passer oppgaven.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {visibleApps.map((app) => {
          const Icon = iconMap[app.icon];
          return (
            <Link key={app.id} href={app.href} className="group rounded-2xl border border-slate-700 bg-slate-900/80 p-5 transition hover:-translate-y-0.5 hover:border-cyan-500 hover:bg-slate-900">
              <Icon className="mb-4 text-cyan-400" size={27} />
              <h2 className="text-xl font-semibold">{app.label}</h2>
              <p className="mt-2 min-h-[48px] text-sm text-slate-400">{app.description}</p>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-cyan-300">Åpne {app.label} <ArrowRight size={16}/></span>
            </Link>
          );
        })}
      </div>

      {user.role === "OWNER" && (
        <>
          <div className="rounded-2xl border border-cyan-800/70 bg-slate-900/80 p-5">
            <h2 className="text-xl font-semibold">Pinoso EcoLife · fokusert arbeidsflate</h2>
            <p className="mt-2 text-sm text-slate-400">Brand-workspaces beholdes som et eget lag under plattformen. De bruker samme Shared Core, men viser bare merkevaren og modulene brukeren har tilgang til.</p>
            <Link href="/workspace/pinosoecolife" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-cyan-300 hover:underline">Åpne forhåndsvisning <ArrowRight size={16}/></Link>
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-5">
            <div className="flex items-start gap-3"><Users className="shrink-0 text-cyan-400" size={23}/><div>
              <h2 className="text-xl font-semibold">Brukere & tilgang</h2>
              <p className="mt-2 text-sm text-slate-400">Tilgang styres fortsatt sentralt. Eksterne brukere får bare arbeidsområder, merkevarer og handlinger de faktisk trenger.</p>
              <Link href="/workspace-users" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 font-medium text-white hover:bg-cyan-500">
                <LockKeyhole size={16}/> Administrer brukere & tilgang <ArrowRight size={16}/>
              </Link>
            </div></div>
          </div>
        </>
      )}
    </div>
  );
}
