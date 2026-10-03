"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Banknote,
  Clapperboard,
  LockKeyhole,
  Megaphone,
  Settings,
  Users,
} from "lucide-react";
import { REALTYFLOW_APPS, REALTYFLOW_PLATFORM } from "@/lib/realtyflow-apps";

const iconMap = {
  Users,
  Megaphone,
  Clapperboard,
  Banknote,
  Settings,
} as const;

export default function WorkspacesPage() {
  const [owner, setOwner] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (mounted) setOwner(body?.user?.role === "OWNER");
      })
      .catch(() => {
        if (mounted) setOwner(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (owner === null) return <p className="p-6 text-slate-400">Laster arbeidsområder…</p>;

  if (!owner) {
    return (
      <div className="rounded-xl border border-slate-700 p-6">
        Dette arbeidsområdet er foreløpig bare tilgjengelig for eier.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-7 text-slate-100">
      <header>
        <p className="mb-1 text-sm font-semibold uppercase tracking-wider text-cyan-400">RealtyFlow Platform</p>
        <h1 className="text-3xl font-bold">Hva skal du jobbe med?</h1>
        <p className="mt-2 max-w-3xl text-slate-400">
          RealtyFlow er én plattform med fire arbeidsapper. Data, kunder, merkevarer, rettigheter og Nexus
          deles i Shared Core, mens hver app gir et tydelig arbeidsområde.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {REALTYFLOW_APPS.map((app) => {
          const Icon = iconMap[app.icon as keyof typeof iconMap];
          return (
            <Link
              key={app.id}
              href={app.href}
              className="group rounded-2xl border border-slate-700 bg-slate-900/80 p-5 transition-colors hover:border-cyan-500 hover:bg-slate-900"
            >
              {Icon && <Icon className="mb-4 text-cyan-400" size={27} />}
              <h2 className="text-xl font-semibold">{app.label}</h2>
              <p className="mt-2 min-h-[48px] text-sm text-slate-400">{app.description}</p>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-cyan-300">
                Åpne {app.label}
                <ArrowRight size={16} />
              </span>
            </Link>
          );
        })}
      </div>

      <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-5">
        <div className="flex items-start gap-3">
          <Settings className="shrink-0 text-slate-400" size={23} />
          <div className="min-w-0">
            <h2 className="text-xl font-semibold">{REALTYFLOW_PLATFORM.label}</h2>
            <p className="mt-2 text-sm text-slate-400">{REALTYFLOW_PLATFORM.description}</p>
            <Link
              href={REALTYFLOW_PLATFORM.href}
              className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-cyan-300 hover:underline"
            >
              Åpne adminområdet <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-cyan-800/70 bg-slate-900/80 p-5">
        <h2 className="text-xl font-semibold">Merkevarebaserte arbeidsflater fortsetter</h2>
        <p className="mt-2 text-sm text-slate-400">
          Eksterne brukere får fortsatt tilgang per merkevare og rettighet. Neste migreringssteg kobler deres
          daglige arbeidsflate til samme Sales, Marketing, Content og Finance-modell uten å åpne globale data.
        </p>
        <Link
          href="/workspace/pinosoecolife"
          className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-cyan-300 hover:underline"
        >
          Åpne Pinoso EcoLife-forhåndsvisning <ArrowRight size={16} />
        </Link>
      </div>

      <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-5">
        <h2 className="text-xl font-semibold">Brukere & tilgang</h2>
        <p className="mt-2 text-sm text-slate-400">
          Roller og modulrettigheter forblir en del av Shared Core. Ingen tilgangsgrenser endres av denne
          første arkitekturmigreringen.
        </p>
        <Link
          href="/workspace-users"
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 font-medium text-white hover:bg-cyan-500"
        >
          <LockKeyhole size={16} /> Administrer brukere & tilgang <ArrowRight size={16} />
        </Link>
      </div>
    </div>
  );
}
