import Link from "next/link";

const FLOW = [
  { step: "1", title: "Readiness & connections", href: "/marketing-readiness", text: "Sjekk Meta/Instagram-tilkobling, readiness og nødvendige forutsetninger." },
  { step: "2", title: "Content Studio", href: "/content-studio", text: "Produser og klargjør innhold før publisering." },
  { step: "3", title: "AI Media Studio", href: "/media-studio", text: "Lag bilde/video-assets og kampanjemateriell." },
  { step: "4", title: "Growth Hub", href: "/growth-hub", text: "Styr vekstarbeid og kampanjer på tvers av kanaler." },
  { step: "5", title: "Posts & publishing", href: "/posts", text: "Se publiseringsarbeid og kanalinnhold." },
  { step: "6", title: "Analytics", href: "/analytics", text: "Mål views, reach, engasjement og utvikling over tid." },
];

const AUTOMATION = [
  { href: "/automation", title: "Automation Center", text: "Systemets automatiske arbeidsflyter og cron-jobber." },
  { href: "/agents", title: "AI Agents", text: "Agentene som kan drive research, innhold og oppfølging." },
  { href: "/approvals", title: "Approval Center", text: "Kontroller handlinger som krever menneskelig godkjenning." },
  { href: "/ad-campaigns", title: "Ad Campaigns", text: "Betalt distribusjon og kampanjestyring." },
  { href: "/reach", title: "Reach", text: "Nyhetsbrev og eid distribusjon rundt sosial aktivitet." },
  { href: "/attribution", title: "Attribution", text: "Se hvilke kilder og kampanjer som skaper leads og verdi." },
];

export default function SocialAutomationPage() {
  return <div className="mx-auto max-w-[1500px] space-y-6 p-6">
    <header className="rounded-2xl border border-fuchsia-900/30 bg-gradient-to-br from-slate-950 via-slate-900 to-fuchsia-950 p-6 text-white shadow-xl">
      <div className="text-xs font-black uppercase tracking-[0.2em] text-fuchsia-300">Social Growth OS</div>
      <h1 className="mt-2 text-3xl font-black">Instagram & Social Automation</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Samlet inngang til arbeidet med Instagram-intelligens, automatisert timing/publisering, innholdsproduksjon, kampanjer og måling. Denne siden gjør de tidligere spredte funksjonene synlige fra ett sted.</p>
    </header>

    <section>
      <h2 className="text-xl font-black text-slate-900">Arbeidsflyt</h2>
      <p className="mt-1 text-sm text-slate-500">Fra tilkobling til publisering og læring.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {FLOW.map((item) => <Link key={item.href} href={item.href} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-fuchsia-300 hover:shadow-md">
          <div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-fuchsia-100 text-xs font-black text-fuchsia-800">{item.step}</span><h3 className="font-black text-slate-900 group-hover:text-fuchsia-800">{item.title}</h3></div>
          <p className="mt-3 text-sm leading-5 text-slate-600">{item.text}</p>
        </Link>)}
      </div>
    </section>

    <section>
      <h2 className="text-lg font-black text-slate-900">Automatisering & kontroll</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {AUTOMATION.map((item) => <Link key={item.href} href={item.href} className="rounded-xl border border-slate-200 bg-white p-4 transition hover:bg-slate-50">
          <div className="font-bold text-slate-900">{item.title}</div><div className="mt-1 text-sm text-slate-500">{item.text}</div>
        </Link>)}
      </div>
    </section>

    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><b>Kontrollregel:</b> sosial automasjon skal bruke faktiske tilkoblinger, readiness og godkjenningsregler. UI-et skal ikke gi inntrykk av at en post er publisert eller en konto er koblet hvis systemet ikke har bekreftet det.</div>
  </div>;
}
