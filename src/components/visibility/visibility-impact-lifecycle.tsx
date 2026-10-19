"use client";

/** Displays the actual evidence boundaries; does not invent a release or impact. */
export function VisibilityImpactLifecycle() {
  const stages = [
    { title: "1. Google-måling", detail: "Søkeord, side og 90-dagershistorikk fra Search Console.", status: "Tilgjengelig gjennom GSC" },
    { title: "2. Nexus-undersøkelse", detail: "Registrer et konkret søkeord som foreslått undersøkelse.", status: "Eierstyrt handling" },
    { title: "3. Godkjent endring", detail: "Krever dokumentert godkjenning av eksakt endring og kodeversjon.", status: "Ikke automatisk" },
    { title: "4. Publiseringsbevis", detail: "Samme GitHub-commit, Vercel READY og uavhengig etterkontroll av URL.", status: "Bevis må innhentes" },
    { title: "5. Ettermåling", detail: "Lik søk/side, ikke-overlappende sammenlignbare perioder før og etter deploy.", status: "Beregning klar; datakobling gjenstår" },
  ];
  return <section className="rounded-2xl border border-slate-200 bg-white p-5" aria-label="SEO livssyklus">
    <h3 className="text-lg font-bold text-slate-950">Fra SEO-funn til dokumentert resultat</h3>
    <p className="mt-1 text-sm text-slate-600">Dette viser kravene til arbeidsflyten, ikke status for en bestemt gjennomført SEO-endring.</p>
    <ol className="mt-4 grid gap-3 lg:grid-cols-5">{stages.map(stage => <li key={stage.title} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <h4 className="text-sm font-bold text-slate-900">{stage.title}</h4>
      <p className="mt-2 text-xs text-slate-700">{stage.detail}</p>
      <p className="mt-3 text-xs font-semibold text-slate-500">{stage.status}</p>
    </li>)}</ol>
    <p className="mt-4 text-xs text-amber-800">Ingen SEO-effekt eller publisering markeres som verifisert ut fra en PR, en arbeidsoppgave eller en positiv rangering alene.</p>
  </section>;
}
