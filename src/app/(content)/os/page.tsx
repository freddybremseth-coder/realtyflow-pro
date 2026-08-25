import Link from "next/link";

const primary = [
  { href: "/nexus", title: "Nexus OS", text: "Agentisk kommandosenter for dealflow, approvals, oppgaver og autonome arbeidsløp.", badge: "CORE OS" },
  { href: "/social-automation", title: "Social & Instagram Automation", text: "Instagram-intelligens, publisering, timing, innholdsproduksjon, analytics og readiness samlet.", badge: "GROWTH OS" },
  { href: "/book-growth", title: "Book Growth OS", text: "Amazon/ASIN, metadata, økonomi, serier, måling og læring for bokporteføljen.", badge: "PUBLISHING OS" },
  { href: "/automation", title: "Automation Center", text: "Automatiseringer, cron-flyter og systemrutiner samlet på ett sted.", badge: "AUTOMATION" },
];

const secondary = [
  { href: "/agents", title: "AI Agents", text: "Se og styr agentene som utfører arbeidsflyter." },
  { href: "/approvals", title: "Approval Center", text: "Menneskelig kontroll før viktige handlinger utføres." },
  { href: "/growth-hub", title: "Growth Hub", text: "Kampanjer, vekstsignal og markedsføringsarbeid." },
  { href: "/data-health", title: "Data Health", text: "Kontroller datakvalitet og integrasjonsstatus." },
  { href: "/audit-log", title: "Audit Log", text: "Spor endringer, beslutninger og systemhandlinger." },
  { href: "/today", title: "I dag", text: "Operativ prioritering og dagens viktigste arbeid." },
];

export default function RealtyFlowOsPage() {
  return <div className="mx-auto max-w-[1500px] space-y-6 p-6">
    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6 text-white shadow-xl">
      <div className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-400">RealtyFlow Operating System</div>
      <h1 className="mt-2 text-3xl font-black tracking-tight">OS & automatisering</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Ett inngangspunkt til de aktive operativsystemene i RealtyFlow Pro. Herfra skal du kunne gå direkte til Nexus, Instagram/social automation, Book Growth og øvrige automatiseringer uten å kjenne interne URL-er.</p>
    </div>

    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div><h2 className="text-xl font-black text-slate-900">Aktive operativsystemer</h2><p className="text-sm text-slate-500">De viktigste AI- og automasjonsflatene.</p></div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {primary.map((item) => <Link key={item.href} href={item.href} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-lg">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{item.badge}</div>
          <h3 className="mt-2 text-lg font-black text-slate-900 group-hover:text-cyan-700">{item.title}</h3>
          <p className="mt-2 text-sm leading-5 text-slate-600">{item.text}</p>
          <div className="mt-4 text-xs font-bold text-cyan-700">Åpne →</div>
        </Link>)}
      </div>
    </section>

    <section>
      <h2 className="text-lg font-black text-slate-900">Kontroll & støtte</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {secondary.map((item) => <Link key={item.href} href={item.href} className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-400 hover:bg-slate-50">
          <div className="font-bold text-slate-900">{item.title}</div>
          <div className="mt-1 text-sm text-slate-500">{item.text}</div>
        </Link>)}
      </div>
    </section>
  </div>;
}
