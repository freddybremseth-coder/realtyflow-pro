"use client";

const services = [
  {name:"ChatGPT Search",detail:"Omtale eller kildehenvisning i dokumentert AI-svar"},
  {name:"Google AI",detail:"Kildehenvisning eller omtale i observert AI-søkeresultat"},
  {name:"Perplexity",detail:"Kilder og merkevareomtale i observert AI-svar"},
  {name:"Microsoft Copilot",detail:"Kilder og merkevareomtale i observert AI-svar"},
];
export function VisibilityAiMonitor() {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5" aria-label="AI Visibility Monitor">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="text-lg font-bold text-slate-950">AI Visibility Monitor</h3>
        <p className="mt-1 text-sm text-slate-600">Dokumenterbare omtaler og kildehenvisninger i AI-svar. Separate data fra Google Search Console.</p></div>
      <span className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">Innsamling ikke koblet til</span>
    </div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {services.map(service=><div key={service.name} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h4 className="font-semibold text-slate-900">{service.name}</h4>
        <p className="mt-1 text-xs text-slate-600">{service.detail}</p>
        <div className="mt-3 text-xs font-semibold text-amber-800">Ingen verifiserte observasjoner hentet</div>
      </div>)}
    </div>
    <p className="mt-4 text-xs leading-5 text-slate-600">Ingen målt omtale betyr ikke at AI-tjenesten aldri nevner nettstedet. Klassifisering av enkeltobservasjoner er kodet; automatisert innhenting, lagring, tilgangskontroll og kildebevis må ferdigstilles før vi kan vise reelle AI-resultater.</p>
  </section>;
}
