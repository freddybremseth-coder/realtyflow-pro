"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Building2, Coins, Clapperboard, LockKeyhole, Megaphone, ShieldCheck, Users } from "lucide-react";

const modules = [
  { title: "Eiendom & kunder", detail: "Eiendomskatalog, CRM, visninger og salgsarbeid.", icon: Building2, href: "/inventory", cta: "Åpne eiendom" },
  { title: "Markedsføring", detail: "Reels, innhold, kampanjer, SEO og sosiale medier.", icon: Megaphone, href: "/growth-hub", cta: "Åpne markedsføring" },
  { title: "Re-Master Studio", detail: "Musikk, mikser, lydarkiv og spesialisert videoproduksjon.", icon: Clapperboard, href: "/remaster-freddy", cta: "Åpne studio" },
  { title: "Økonomi", detail: "Provisjon, fakturering, drift og regnskap.", icon: Coins, href: "/billing", cta: "Åpne økonomi" },
  { title: "AI & automatisering", detail: "Oppgaver, agenter, regler og kontroll av arbeidsflyter.", icon: ShieldCheck, href: "/nexus-os", cta: "Åpne automatisering" },
];

export default function WorkspacesPage() {
  const [owner, setOwner] = useState<boolean | null>(null);
  useEffect(() => {
    let mounted = true;
    fetch("/api/auth/me", { cache: "no-store" }).then((res) => res.ok ? res.json() : null)
      .then((body) => { if (mounted) setOwner(body?.user?.role === "OWNER"); })
      .catch(() => { if (mounted) setOwner(false); });
    return () => { mounted = false; };
  }, []);
  if (owner === null) return <p className="p-6 text-slate-400">Laster arbeidsområder…</p>;
  if (!owner) return <div className="rounded-xl border border-slate-700 p-6">Dette arbeidsområdet er foreløpig bare tilgjengelig for eier.</div>;
  return (
    <div className="mx-auto max-w-6xl space-y-7 text-slate-100">
      <header>
        <p className="mb-1 text-sm font-semibold uppercase tracking-wider text-cyan-400">RealtyFlow OS</p>
        <h1 className="text-3xl font-bold">Arbeidsområder</h1>
        <p className="mt-2 max-w-3xl text-slate-400">Én plattform, færre valg om gangen. Velg området du skal jobbe i. De eksisterende modulene er foreløpig koblet til dagens funksjoner, og blir skilt ut trinnvis.</p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        {modules.map(({ title, detail, icon: Icon, href, cta }) => (
          <Link key={title} href={href} className="group rounded-2xl border border-slate-700 bg-slate-900/80 p-5 transition-colors hover:border-cyan-500 hover:bg-slate-900">
            <Icon className="mb-4 text-cyan-400" size={27} />
            <h2 className="text-xl font-semibold">{title}</h2>
            <p className="mt-2 min-h-[48px] text-sm text-slate-400">{detail}</p>
            <span className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-cyan-300">{cta}<ArrowRight size={16}/></span>
          </Link>
        ))}
      </div>
      <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-5">
        <div className="flex items-start gap-3"><Users className="shrink-0 text-cyan-400" size={23}/><div>
          <h2 className="text-xl font-semibold">Medarbeidere og tilganger</h2>
          <p className="mt-2 text-sm text-slate-400">Planlegg egne arbeidsområder og rettigheter per person og merkevare. Dette er foreløpig en sikker utkastmodus; ingen ny bruker aktiveres.</p>
          <Link href="/workspace-access" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 font-medium text-white hover:bg-cyan-500">
            <LockKeyhole size={16}/> Administrer tilgangsutkast <ArrowRight size={16}/>
          </Link>
        </div></div>
      </div>
    </div>
  );
}
