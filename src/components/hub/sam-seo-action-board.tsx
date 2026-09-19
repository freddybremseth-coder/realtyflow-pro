"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, ExternalLink, Loader2, RefreshCw, SearchCheck } from "lucide-react";

type Action = {
  id: string; brandId: string | null; title: string; description: string; nextAction: string;
  priority: string; evidence: string; status: string; source: string; requiresApproval: boolean;
};
type Connection = {
  brandId: string; domain: string; connected: boolean; property: string | null;
  target: string; error: string | null; registered: boolean; savedProperty: string | null;
  temporary?: boolean; expiresAt?: string | null;
  lastFailure?: { code: string; at: string } | null;
};
type Metric = {
  brandId: string; property: string; collectedAt: string;
  period: { currentStart: string; currentEnd: string };
  totals: { currentClicks: number; currentImpressions: number; previousClicks: number; previousImpressions: number; currentCtr: number | null };
  quality: string;
};
type Payload = {
  actions: Action[]; observations: Array<{ id: string; brandId: string | null; description: string; evidence: string }>;
  connections: Connection[]; metrics: Metric[]; latestReviewAt: string | null;
  publisherChecks: Array<{
    brandId: "freddyb" | "zeneco"; repository: string; ready: boolean;
    canPush: boolean; canReadTarget: boolean; reason: string;
  }>;
  changeEvaluations: Array<{
    changeId: string; brandId: string; page: string; query: string; commitSha: string;
    status: "waiting" | "unavailable" | "incomplete" | "measured";
    baseline: { start: string; end: string; impressions: number; clicks: number; position: number };
    current: { start: string; end: string; impressions: number; clicks: number; position: number } | null;
    note: string;
  }>;
  lastGoogleReadAt: string | null;
  readingMode: "live" | "last_review" | "last_live_read"; readErrors: Array<{ brandId: string; error: string }>;
  connectionSummary: { registered: number; readable: number; measured: number };
  seoPilot: null | {
    at: string; status: string; websiteChangesPublished: number; writeStatus: string;
    assessments: Array<{ brandId: string; status: string; note: string;
      page: string | null; currentImpressions: number | null; currentClicks: number | null }>;
  };
};
const LABELS: Record<string, string> = {
  zeneco: "Zen Eco Homes", pinosoecolife: "Pinoso EcoLife",
  freddyb: "FreddyBremseth.com", freddypublishing: "Books · Freddy Bremseth",
  remasterfreddy: "Re-master Freddy", donaanna: "Doña Anna", chatgenius: "ChatGenius.pro",
};
const date = (value: string) => new Date(value).toLocaleDateString("nb-NO");
const GSC_FAILURES: Record<string, string> = {
  gsc_consent_declined: "Google-tillatelsen ble ikke godkjent. Velg en konto som har tilgang til nettstedet, og godkjenn lesetilgangen.",
  gsc_oauth_service_mismatch: "Tilkoblingsprosessen hadde feil tjenestetype. Start Search Console-tilkoblingen på nytt.",
  gsc_readonly_scope_not_granted: "Google gav ikke Search Console-lesetilgang. Godkjenn den særskilte Search Console-tillatelsen.",
  gsc_no_properties_in_google_account: "Google-kontoen du valgte har ingen tilgjengelige Search Console-nettsteder. Velg kontoen som har tilgang til de bekreftede nettstedene.",
  gsc_no_verified_property_for_brand: "Google-kontoen har ikke tilgang til Search Console-eiendommen for dette nettstedet. Kontroller riktig Google-konto og at domenet er bekreftet i Search Console.",
  gsc_api_disabled: "Search Console API er ikke aktivert for Google OAuth-prosjektet. Det må aktiveres i Google Cloud før Sam kan lese nettstedene.",
  gsc_property_list_forbidden: "Google avviste lesing av Search Console-nettstedene (403). Kontroller API-tilgang, OAuth-rettigheter og at Google-kontoen har tilgang til domenet.",
  gsc_property_list_failed: "RealtyFlow kunne ikke hente listen over nettsteder fra Google. Kontroller Search Console API og prøv tilkoblingen igjen.",
  gsc_no_usable_token: "Google ga ikke en brukbar tilgangsnøkkel. Start Google-tilkoblingen på nytt.",
  gsc_property_or_token_save_failed: "Google-tillatelsen ble gitt, men RealtyFlow klarte ikke å lagre tilkoblingen. Dette er en intern tilkoblingsfeil; kontroller loggene før nytt forsøk.",
};
function gscFailure(code: string) {
  return GSC_FAILURES[code] || "Google-tilkoblingen ble ikke fullført. Start tilkoblingen på nytt, og kontroller feilstatusen i RealtyFlow.";
}


export function SamSEOActionBoard() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [oauthReturn, setOauthReturn] = useState<{ brandId: string; errorCode: string | null; success: boolean } | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("oauth_error");
    const success = params.get("oauth_success") === "true" && params.get("platform") === "google_search_console";
    const brandId = params.get("brand") || "";
    if ((success || code?.startsWith("gsc_")) && brandId in LABELS) {
      setOauthReturn({ brandId, errorCode: code, success });
    }
  }, []);

  const read = useCallback(async (live: boolean) => {
    if (live) setRefreshing(true); else setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/agents/seo-priorities" + (live ? "?live=1" : ""), {
        cache: "no-store", credentials: "same-origin",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Kunne ikke lese Sams tiltak");
      setData(payload as Payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sams data er utilgjengelige");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  useEffect(() => { void read(false); }, [read]);

  const disconnected = data?.connections.filter(item => !item.registered) || [];
  const savedButUnreadable = data?.connections.filter(item => item.registered && !item.connected) || [];
  return (
    <section aria-label="Sam SEO anbefalinger og tiltak" className="rounded-3xl border-2 border-emerald-300 bg-white p-5 text-slate-950 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.15em] text-emerald-800">
            <SearchCheck size={18} /> Sam SEO · synlighet og leads
          </div>
          <h2 className="mt-2 text-2xl font-black text-slate-950">Anbefalinger og tiltak – synlige her</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
            Søkeord, landingssider og tekniske funn kobles til konkrete oppgaver. Her ser du hvorfor
            noe skal gjøres, hvilken måling som ligger bak, og hva neste steg er. Små, reversible
            SEO-justeringer kan gjennomføres innenfor den godkjente pilotrammen når publiseringskanal
            og tilbakeføring er kontrollert. Større endringer krever egen godkjenning.
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-600">
            {data?.latestReviewAt ? "Siste SEO-gjennomgang: " + date(data.latestReviewAt) : "Ingen samlet SEO-gjennomgang lagret"}
            {data?.lastGoogleReadAt ? " · Siste Google-innhenting: " + new Date(data.lastGoogleReadAt).toLocaleString("nb-NO") : " · Google-tall er ikke hentet ennå"}
            {data?.readingMode === "live" ? " · Direkte lesing forsøkt" : data?.readingMode === "last_live_read" ? " · Sist lagrede Google-data vises" : ""}
          </p>
        </div>
        <button type="button" onClick={() => void read(true)} disabled={loading || refreshing}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-emerald-800 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-900 disabled:opacity-60">
          {refreshing || loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          {refreshing ? "Leser Google-data…" : "Hent nye Google-tall"}
        </button>
      </div>
      {oauthReturn && (
        <div role="status" className={oauthReturn.errorCode
          ? "mt-4 rounded-xl border-2 border-rose-400 bg-rose-50 p-4 text-sm text-rose-950"
          : "mt-4 rounded-xl border-2 border-emerald-400 bg-emerald-50 p-4 text-sm text-emerald-950"}>
          <strong>{LABELS[oauthReturn.brandId]} · Google Search Console</strong>
          <p className="mt-1">
            {oauthReturn.errorCode
              ? gscFailure(oauthReturn.errorCode)
              : loading
                ? "Kontrollerer at Google-tilkoblingen faktisk er lagret…"
                : data?.connections.some(item => item.brandId === oauthReturn.brandId && item.connected)
                  ? "Google-tilkoblingen er bekreftet lagret i RealtyFlow. Sam kan nå lese Search Console-data for dette nettstedet."
                  : data?.connections.some(item => item.brandId === oauthReturn.brandId && item.registered)
                    ? "Google-tilkoblingen er lagret, men RealtyFlow klarer ikke å lese den. Se teknisk feilinformasjon nedenfor; ikke koble til Google på nytt."
                    : "Google sendte en bekreftelse, men RealtyFlow finner ingen aktiv, lagret tilkobling. Se feilinformasjonen nedenfor."}
          </p>
          {oauthReturn.errorCode && (
            <a className="mt-2 inline-flex rounded-lg bg-rose-900 px-3 py-2 font-bold text-white"
              href={"/api/oauth/google?brand_id=" + encodeURIComponent(oauthReturn.brandId) + "&service=search_console"}>
              Koble {LABELS[oauthReturn.brandId]} på nytt
            </a>
          )}
        </div>
      )}
      {error && <div role="alert" className="mt-4 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-950">
        <AlertTriangle size={16} className="mr-2 inline" />{error}
        {data ? " · Forrige dokumenterte oversikt vises fortsatt." : ""}
      </div>}
      {loading && <p className="mt-4 text-sm text-slate-700">Henter Sams dokumenterte oppgaver og målinger…</p>}
      {data && (
        <>
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
            <h3 className="font-black">Sam SEO · forhåndsgodkjent pilot</h3>
            <p className="mt-1 text-sm">Automatisk Google-måling og intern prioritering for Zen Eco Homes og FreddyBremseth.com. Små offentlige endringer kan bare gjennomføres når eksakt redigerbar side, publiseringskanal, tidligere versjon og reversering er kontrollert. Boligpriser, kundedata og større omskrivinger ligger utenfor piloten.</p>
            {data?.seoPilot ? (
              <>
                <p className="mt-2 text-xs font-semibold">Sist målt: {new Date(data.seoPilot.at).toLocaleString("nb-NO")} · Automatisk publisert i denne syklusen: {data.seoPilot.websiteChangesPublished}</p>
                <div className="mt-2 space-y-1">
                  {data.seoPilot.assessments.filter(item => ["zeneco", "freddyb"].includes(item.brandId)).map(item => (
                    <p key={item.brandId} className="text-xs leading-5">
                      <strong>{LABELS[item.brandId]} · {item.status === "candidate" ? "Målt mulighet" : item.status === "blocked" ? "Måling blokkert" : "Overvåkes"}:</strong> {item.note}
                    </p>
                  ))}
                </div>
                {!data.seoPilot.writeStatus.startsWith("verified") && (
                  <p className="mt-2 text-xs font-semibold text-amber-950">Automatisk nettsidepublisering er fortsatt begrenset: sikker publiseringskanal og tilbakeføring må være verifisert for den konkrete siden. Ingen oppgave erklæres utført uten faktisk publisering.</p>
                )}
              </>
            ) : <p className="mt-2 text-xs">Første planlagte automatiske målesyklus er ennå ikke lagret.</p>}
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {data.publisherChecks.map(check => (
              <div key={check.brandId}
                className={check.ready
                  ? "rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-950"
                  : "rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"}>
                <p className="font-black">{LABELS[check.brandId]} · publiseringskanal {check.ready ? "verifisert" : "ikke klar"}</p>
                <p className="mt-1 text-xs">{check.reason}</p>
                <p className="mt-1 text-xs">Målfil lesbar: {check.canReadTarget ? "ja" : "nei"} · push-rettighet: {check.canPush ? "ja" : "nei"}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-emerald-800">Åpne SEO-tiltak</p>
              <div className="mt-1 text-3xl font-black text-emerald-950">{data.actions.length}</div>
              <p className="text-xs text-emerald-900">Forslag og åpne oppgaver på denne oversikten</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-slate-700">Google-tilkoblinger lagret</p>
              <div className="mt-1 text-3xl font-black text-slate-950">{data.connectionSummary.registered}/{data.connections.length}</div>
              <p className="text-xs text-slate-700">RealtyFlow har lagret OAuth-tillatelser; Sam kan lese {data.connectionSummary.readable}/{data.connections.length}. Dette er ikke søkevisninger eller bekreftede API-kall.</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-slate-700">Nettsteder med målte søketall</p>
              <div className="mt-1 text-3xl font-black text-slate-950">{data.metrics.length}</div>
              <p className="text-xs text-slate-700">Google web-søk, ikke YouTube- eller Instagram-statistikk</p>
            </div>
          </div>
          {savedButUnreadable.length > 0 && (
            <div role="alert" className="mt-4 rounded-xl border-2 border-rose-400 bg-rose-50 p-4 text-rose-950">
              <h3 className="font-black">Google-tilkoblingene er lagret, men Sam får ikke lest dem</h3>
              <p className="mt-1 text-sm">Dette er en feil i RealtyFlows kontroll eller lesing av de lagrede tilkoblingene. Ikke godkjenn alle nettstedene på nytt. Se detaljer nedenfor.</p>
              <div className="mt-3 space-y-2">
                {savedButUnreadable.map(item => (
                  <p key={item.brandId} className="rounded-lg border border-rose-200 bg-white p-3 text-sm">
                    <strong>{LABELS[item.brandId] || item.domain}:</strong> {item.error || "Lagret Google-tilkobling kan foreløpig ikke leses."}
                  </p>
                ))}
              </div>
            </div>
          )}
          {disconnected.length > 0 && (
            <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
              <h3 className="font-black text-amber-950">Google Search Console må kobles til Sam separat</h3>
              <p className="mt-1 text-sm text-amber-950">Disse nettstedene mangler en lagret OAuth-tillatelse i RealtyFlow. Nettsteder som allerede er lagret, skal ikke kobles til på nytt.</p>
              {disconnected.some(item => item.lastFailure) && (
                <div role="alert" className="mt-3 space-y-2">
                  {disconnected.filter(item => item.lastFailure).map(item => (
                    <p key={item.brandId} className="rounded-lg border border-amber-300 bg-white p-3 text-sm text-amber-950">
                      <strong>{LABELS[item.brandId] || item.domain} · siste tilkoblingsfeil ({item.lastFailure?.at ? date(item.lastFailure.at) : "ukjent dato"}): </strong>
                      {gscFailure(item.lastFailure?.code || "")}
                    </p>
                  ))}
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {disconnected.map(connection => (
                  <a key={connection.brandId} href={"/api/oauth/google?brand_id=" + encodeURIComponent(connection.brandId) + "&service=search_console"}
                    className="inline-flex items-center gap-1 rounded-lg border border-amber-400 bg-white px-3 py-2 text-sm font-bold text-amber-950 hover:bg-amber-100">
                    Koble {LABELS[connection.brandId] || connection.domain} <ExternalLink size={13} />
                  </a>
                ))}
              </div>
            </div>
          )}
          {data.connections.filter(item => item.connected && item.temporary).map(item => (
            <div key={item.brandId} role="status" className="mt-3 rounded-xl border border-amber-400 bg-amber-50 p-4 text-sm text-amber-950">
              <strong>{LABELS[item.brandId] || item.domain} · bare midlertidig Google-tilgang</strong>
              <p className="mt-1">Google returnerte ingen fornyelsesnøkkel. Sam kan lese tall frem til
                {item.expiresAt ? " " + new Date(item.expiresAt).toLocaleString("nb-NO") : " Google-tilgangen utløper"},
                men kan ikke fornye denne tilgangen automatisk. Koble kontoen på nytt for varig tilgang.
              </p>
              <a className="mt-2 inline-flex font-bold text-amber-950 underline"
                href={"/api/oauth/google?brand_id=" + encodeURIComponent(item.brandId) + "&service=search_console"}>
                Gi varig lesetilgang
              </a>
            </div>
          ))}
          {data.readErrors.length > 0 && <p role="status" className="mt-3 text-sm text-amber-900">
            <strong>Google-data kunne ikke leses:</strong>
            {data.readErrors.map(item => (
              <span key={item.brandId} className="mt-1 block">
                {LABELS[item.brandId] || item.brandId}: {item.error}
              </span>
            ))}
            Ingen tall er estimert. En lagret Google-tilkobling trenger ikke ny godkjenning når feilen ligger i RealtyFlow.
          </p>}
          {data.metrics.length > 0 && (
            <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
              {data.metrics.map(metric => (
                <div key={metric.brandId} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <h3 className="font-black text-slate-950">{LABELS[metric.brandId] || metric.brandId}</h3>
                  <p className="mt-1 text-xs text-slate-600">{metric.period.currentStart}–{metric.period.currentEnd} · lest {date(metric.collectedAt)}</p>
                  <p className="mt-2 text-sm font-bold text-slate-950">
                    {metric.totals.currentClicks} Google-klikk · {metric.totals.currentImpressions} visninger
                  </p>
                  <p className="mt-1 text-xs text-slate-700">
                    CTR {metric.totals.currentCtr === null ? "ikke målt" : (metric.totals.currentCtr * 100).toFixed(1) + " %"} ·
                    forrige periode {metric.totals.previousClicks} klikk / {metric.totals.previousImpressions} visninger
                  </p>
                </div>
              ))}
            </div>
          )}
          {data.observations?.length > 0 && (
            <div className="mt-5 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sky-950">
              <h3 className="font-black">Måles videre uten godkjenningsoppgave · {data.observations.length} nettsteder</h3>
              <p className="mt-1 text-sm">Google har ikke returnert søkevisninger på disse målte sidene i perioden. Dette er en observasjon, ikke et publiseringsforslag eller bevis for manglende indeksering. Sam beholder målingen til neste gjennomgang; ingen nettsideendring utføres her.</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {data.observations.map(item => (
                  <span key={item.id} className="rounded-lg border border-sky-200 bg-white px-2 py-1 font-semibold">
                    {LABELS[item.brandId || ""] || item.brandId}
                  </span>
                ))}
              </div>
            </div>
          )}
          {data.changeEvaluations?.length > 0 && (
            <section aria-label="Automatisk måling av SEO-endringer"
              className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
              <h3 className="font-black">Sam måler gjennomførte SEO-forbedringer</h3>
              <p className="mt-1 text-sm">Avgrensede, dokumenterte endringer krever ikke en ny godkjenningsoppgave. Sam sammenligner samme Google-søk og side etter en hel 30-dagersperiode uten overlapp med tiden før endringen.</p>
              {data.changeEvaluations.map(change => (
                <article key={change.changeId} className="mt-3 rounded-lg border border-emerald-200 bg-white p-3 text-sm">
                  <p className="font-bold">{LABELS[change.brandId] || change.brandId} · {change.page} · «{change.query}»</p>
                  <p className="mt-1">Før endringen ({change.baseline.start}–{change.baseline.end}):
                    {" "}{change.baseline.impressions} Google-visninger og {change.baseline.clicks} klikk.</p>
                  {change.current && <p className="mt-1 font-semibold">
                    Etter endringen ({change.current.start}–{change.current.end}):
                    {" "}{change.current.impressions} Google-visninger og {change.current.clicks} klikk.
                  </p>}
                  <p className="mt-1 text-xs text-slate-700">{change.note}</p>
                </article>
              ))}
            </section>
          )}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-black text-slate-950">Dette bør Sam følge opp</h3>
            <Link href="/marketing-tasks" className="inline-flex items-center gap-1 text-sm font-bold text-emerald-800 underline">
              Åpne Oppgave-HUB <ArrowRight size={14} />
            </Link>
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {data.actions.map(action => (
              <article key={action.id} className="rounded-xl border border-slate-300 bg-white p-4 text-slate-950">
                <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                  <span className={action.priority === "HIGH" || action.priority === "CRITICAL"
                    ? "rounded-full bg-amber-100 px-2 py-1 text-amber-900"
                    : "rounded-full bg-cyan-100 px-2 py-1 text-cyan-900"}>{action.priority}</span>
                  <span className="text-slate-700">{LABELS[action.brandId || ""] || "Hele porteføljen"}</span>
                  <span className="text-slate-600">· {action.source}</span>
                </div>
                <h4 className="mt-2 text-base font-black text-slate-950">{action.title}</h4>
                <p className="mt-2 text-sm leading-6 text-slate-800"><strong>Funn:</strong> {action.description}</p>
                <p className="mt-2 text-sm leading-6 text-emerald-950"><strong>Tiltak:</strong> {action.nextAction}</p>
                <p className="mt-2 text-xs leading-5 text-slate-600"><strong>Dokumentasjon:</strong> {action.evidence}</p>
                <p className="mt-2 text-xs font-bold text-amber-900">Analyse og utkast kan gjøres internt. En eventuell publisering eller endring krever separat godkjent flyt.</p>
              </article>
            ))}
            {data.actions.length === 0 && (
              <div className="rounded-xl border border-slate-300 bg-slate-50 p-4 text-sm text-slate-800 lg:col-span-2">
                Ingen dokumenterte åpne SEO-oppgaver eller søkedatabaserte forslag er tilgjengelige fra sist gjennomgang.
                Bruk «Hent nye Google-tall» ovenfor; fravær av forslag betyr ikke at nettstedene er ferdig optimalisert.
              </div>
            )}
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-600">
            Google Search Console måler søkeytelse for nettsteder, også sider som eventuelt er indeksert på andre domener.
            For faktiske visninger, engasjement og følgere på YouTube og Instagram må Sam bruke kanalens egne tilkoblede analysedata.
            <Link href="/youtube-studio" className="ml-1 font-bold text-emerald-800 underline">YouTube</Link>
            {" · "}
            <Link href="/social-automation" className="font-bold text-emerald-800 underline">Instagram og øvrige sosiale medier</Link>
          </p>
        </>
      )}
    </section>
  );
}
