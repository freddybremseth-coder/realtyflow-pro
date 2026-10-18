import type { SEOControlReport } from "@/services/agents/seo-control-report";

type Props = { report: SEOControlReport | null | undefined; brand: string; demo: boolean };
function safePropertyUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !["zenecohomes.com", "www.zenecohomes.com"].includes(url.hostname)
      || url.username || url.password || url.port
      || !new RegExp("^/(?:eiendommer|properties|immobilien|propiedades)/[^/]+/?$", "i").test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}
/** Read-only signals already present in Sam's limited sample: NEVER source verification. */
export function VisibilityProjectReviewPanel({ report, brand, demo }: Props) {
  const site = report?.sites?.find(item => item.brandId === "zeneco");
  const candidates = brand !== "all" && brand !== "zeneco" ? [] : (site?.projectReviewCandidates ?? []);
  const checked = site?.checkedAt && !Number.isNaN(Date.parse(site.checkedAt))
    ? new Date(site.checkedAt).toLocaleDateString("nb-NO") : "ukjent";
  return <section aria-label="Altovena Visibility – prosjektfakta" className="space-y-5">
    <header>
      <h2 className="text-2xl font-extrabold">Prosjektfakta og kildekontroll</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
        Dette er kun kandidater fra Sams avgrensede offentlige sideutvalg. Pris, leveringstid,
        energiklasse og skatter er ikke kontrollert mot primærkilder. Ingen side er godkjent for publisering.
      </p>
      <p className="mt-2 text-xs text-slate-500">Sist lagrede tekniske utvalg: {checked} · Skrivebeskyttet · Ingen automatisk publisering</p>
    </header>
    {brand !== "all" && brand !== "zeneco"
      ? <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
          Prosjektfaktakontrollen er foreløpig avgrenset til Zen Eco Homes. Velg «Alle nettsteder» eller «Zen Eco Homes».
        </div>
      : !report
      ? <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
          Ingen lagret SEO-rapport tilgjengelig. Fravær av målinger betyr ikke at prosjektfakta er kontrollert.
        </div>
      : candidates.length === 0
      ? <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
          Ingen prosjektsider er registrert som kandidater i dette begrensede utvalget.
          Det betyr ikke at øvrige prosjektsider er kontrollert eller feilfrie.
          {demo ? " Dette er illustrative demonstrasjonsdata." : ""}
        </div>
      : <div className="space-y-3">
          {candidates.map((candidate, index) => {
            const url = safePropertyUrl(candidate.url);
            const mentions = candidate.claimMentions;
            const signals = [
              mentions?.priceMention && "Pris omtalt",
              mentions?.deliveryMention && "Levering omtalt",
              mentions?.energyMention && "Energiklasse omtalt",
              mentions?.taxMention && "Avgifter omtalt",
            ].filter(Boolean);
            return <article key={candidate.url + index} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-bold">Prosjektside {index + 1}</h3>
                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
                  Ikke faktakontrollert
                </span>
              </div>
              <p className="mt-2 break-all text-sm text-slate-700">{candidate.url}</p>
              <p className="mt-2 text-xs text-slate-600">
                HTTP-observasjon: {candidate.hasHttpEvidence ? "Side hentet" : "Ikke bekreftet"} · Publisering: sperret
              </p>
              <p className="mt-3 text-sm font-semibold text-slate-800">Omtalt i offentlig HTML – ikke verifisert:</p>
              <p className="mt-1 text-sm text-slate-600">{signals.length ? signals.join(" · ") : "Ingen lesbare faktasignaler i utvalget"}</p>
              <p className="mt-3 text-sm text-slate-700"><strong>Neste steg:</strong> Hent den konkrete prosjektopplysningen og en datert, autoritativ kilde. Registrer ansvarlig menneskelig gjennomgang før endringsforslag.</p>
              {url && <a href={url} target="_blank" rel="noopener noreferrer"
                className="mt-3 inline-block text-sm font-semibold text-teal-800 underline">
                  Åpne offentlig prosjektside
                </a>}
            </article>;
          })}
        </div>}
    <p className="text-xs text-slate-500">
      Registrering, attestering, tilbakekalling og publisering er ikke tilgjengelig fra denne visningen.
    </p>
  </section>;
}
