# Altovena Visibility — én utviklingslinje i RealtyFlow Pro

**Kanonisk status:** GitHub-koden i `freddybremseth-coder/realtyflow-pro`; `main` er produksjonsgrunnlaget. ChatGPT-samtaler er ikke kjøretid, oppgavelogg eller en selvstendig utviklingsgren. Bruk PR-numrene og `work_items`/audit-logger som faktiske kilder.

## Leverte trinn

| Trinn | GitHub | Leveranse | Viktig begrensning |
|---|---|---|---|
| P0 | #1424 | Eierbeskyttet Altovena Visibility arbeidskø; idempotent RPC i Nexus `work_items` | Oppgaver er undersøkelsesforslag |
| P1 | #1433 | Sam kan registrere ferske SEO-kontrollfunn som arbeidsoppgaver etter daglig kontroll | Ingen endringer/publisering |
| P1.5 | #1438 | Ny offentlig read-only etterkontroll, logg i `automation_logs`, eierknapp «Kontroller nå» | OBSERVED_AGAIN er **ikke** en publiseringsgodkjenning |
| P2 planutkast | #1440 | Dokumentert og omfangsbundet forslag til kodeutkast ved ny H1-observasjon; eier kan etterspørre utkast | Ingen automatisk koding, kodegodkjenning, publisering eller lukking |

> Oppdater tabellen med faktisk sammenslåings- og produksjonsstatus ved hver release. En PR er ikke produksjon før eksakt Vercel-commit er READY.

## Felles arkitektur

**Sam SEO** (server-generert `SEOControlReport`) → **Nexus arbeidskø** (`work_items`, `source_type=ai_agent`, SHA-256-basert `source_id`) → **uavhengig offentlig måling** (fast allowlist, service-only `automation_logs`) → **bevisbundet designforslag** (ingen sideendring) → senere **eksplisitt godkjent implementering** med kontroll, før/etter-sammenligning og tilbakeføring.

Oppgaver og mål-URL fra klienten er aldri egne SEO-bevis. Et redigerbart `work_items.metadata.execution_state` med `VERIFIED` er aldri en verifikasjonskvittering. Manglende auditresultat må vises som ukjent/ikke utført, ikke friskmeldt.

## Operative kontroller

- `/api/cron/seo-autopilot`: daglig lagring av målinger og høyst 30 inerte oppgaveforslag.
- `/api/cron/visibility-investigations`: daglig offentlig nykontroll; maks 2 nettsteder / 4 oppgaver, 20 t cooldown, ferske målinger, ingen vilkårlige mål.
- `/api/visibility/work-items`: eierbegrenset visning av oppgaver og uavhengige revisjonsbevis.
- `/api/visibility/work-items/design-request` (#1440): eierbegrenset forespørsel om et *utkast*, bundet til hash av ferskt bevis. `approval_granted=false` og `publication_authorized=false` forblir harde invarianter.

## Gjennomgått kildekode og reell kode-PR (17. oktober 2026)

**Re-Master / H1:** Den faktiske nettkoden ligger i `freddybremseth-coder/remasterfreddy` (Vite + React), ikke i RealtyFlow. I `src/App.tsx` finnes allerede `<h1>RE-MASTER FREDDY</h1>` i den synlige helteseksjonen, mens `index.html` på `main` leverer en tom `<div id="root"></div>` før React starter. Dette forklarer et server-HTML-funn, men erstatter **ikke** en fersk offentlig kontroll etter utgivelse.

- **Kandidatrettelse:** [Re-Master PR #48](https://github.com/freddybremseth-coder/remasterfreddy/pull/48), egen gren. Den legger inn eksisterende H1 og eksisterende beskrivelse i den statiske HTML-fallbacken, og tester `index.html` samt generert Vite-`dist/index.html`. Kode-PR er **ikke slått sammen** og **ikke publisert**.
- **Kontroll før sammenslåing:** GitHub + eksakt Vercel-preview grønt, mobil/skrivebordskontroll for layout og flicker, /admin-oppførsel, ett H1 etter React-mount, og at eventuell spesialruting ikke får en misvisende offentlig H1.
- **Etter eventuell publisering:** kjør en ny uavhengig offentlig kontroll på eksakt mål-URL og sammenlign kildeversjon, server-HTML og visuell H1. Ikke sett `DONE` eller `VERIFIED` ut fra at PR-en finnes.

**SaaS-viktig:** Altovena Visibility kan samle funn og bevis i RealtyFlow, mens kodeendringer skjer i den enkelte merkevarens faktiske repository. Tilgang til kildekode og publiseringsrettigheter er separate tillatelser og må ikke implisitt arves fra en SEO-observasjon.

## Kjøringsjournal og cron-observasjon (17. oktober 2026)

- Den uavhengige kontrollen er planlagt til **08:15 UTC**. Deploy av #1440 ble opprettet **08:51 UTC** den 17. oktober; den første mulige planlagte kjøringen av denne versjonen er derfor senere. Det var **0** loggførte `visibility_independent_investigation` da dette ble undersøkt. Manglende bevis er ikke automatisk en cron-feil.
- Ny `visibility_investigation_run`-journal skiller operativt `COMPLETED`, `SKIPPED` og `FAILED` og om starten kom fra `cron` eller `owner`. Den lagrer *ikke* bevis på vellykket SEO-rettelse.
- Nexus-kontroll og sikkerhetsmodus gjelder også for manuell «Kontroller nå». Hvis Nexus har deaktivert undersøkelsen, skal ikke eierknappen omgå sperren.
- Eierens arbeidskø viser **siste registrerte kjøring** og **siste bekreftede SEO-bevis** hver for seg, med egne tidspunkter. Hvis journalen mangler, vises «Ingen registrerte kjøringer».
- **Re-Master:** [PR #48](https://github.com/freddybremseth-coder/remasterfreddy/pull/48) er klar for gjennomgang med grønt CI/preview, men er verken sammenslått eller publisert. Ikke marker oppgaven som løst på grunnlag av denne PR-en.

## Kodeforslag knyttet til faktisk eierforespørsel

17. oktober ble det registrert en reell `visibility_remediation_design_request` for Re-Master fra eier, knyttet til en uavhengig H1-observasjon. Det finnes allerede en separat [Re-Master PR #48](https://github.com/freddybremseth-coder/remasterfreddy/pull/48), med den opprinnelige H1-teksten og noindex for administrasjonssidene. PR er ennå ikke sammenslått.

Nexus bruker nå en særskilt, reviderbar `visibility_code_review_candidate`-logg for **lesbar referanse** fra én tidligere journalført eierforespørsel til én kontrollert GitHub-PR og eksakt kode-commit. Kontroll kontrakten for første pilot tillater kun Re-Master-repoet, krever matchende oppgave, merkevare, kilde-ID, SHA-256-fingeravtrykk og en journalhendelse etter eierforespørselen. Alle rettigheter til utførelse, godkjenning, sammenslåing og publisering forblir **false**.

Det finnes **ikke** en generell kodegenereringsagent, GitHub-installasjon per tenant eller en ferdig reparasjonspipeline. Koblingen er et lesbart spor for vurdering, ikke bevis for publisert eller kontrollert rettelse.

## PR-status fra faktisk GitHub (lesemodus)

Det registrerte Re-Master-utkastet er nå lenket til `remasterfreddy#48` med eksakt commit. Nexus kan lese **gjeldende** pull request-status fra GitHub API når eier åpner arbeidskøen eller bruker «Oppdater GitHub-status». Endringen gjør ikke GitHub-koden til et godkjent eller publisert nettsted.

Pilotens begrensninger: bare det forhåndsgodkjente offentlige `freddybremseth-coder/remasterfreddy`-repoet, høyst to statuskall per køvisning, GET-only og ingen nye tokens eller innsendte URL-er. Avvik mellom lagret commit og GitHub-head blir `COMMIT_CHANGED`, ikke `READY`. Lukket eller sammenslått PR er egne statuser og gir aldri auto-merging, produktion-release eller verifisert reparasjon. GitHub-feil/rate limit vises som `UNAVAILABLE` uten godkjenning.

**Viktig:** GitHub-status og uavhengig SEO-etterkontroll er to adskilte bevis. En PR som er «open / same commit» kan fortsatt ha feilet tester eller mangle visuell godkjenning. En merged PR beviser ikke at Vercel har publisert den eller at feilen er borte.

## Gjenstående arbeid (ikke lov å tolke som ferdig)

1. **Drift:** Verifiser første faktiske `visibility_independent_investigation`-journal fra planlagt/mannuell kjøring. Ved status null er ikke arbeid utført. Logg hvorfor cron kjøres, hoppes over eller feiler.
2. **P2 kodeutkast:** Finn *eksakt* kildefil og synlig tekst; lag isolert PR, forhåndsvisning og test. Ingen LLM-oppdiktet H1.
3. **P3 autorisasjon:** Fersk, konkret eiergodkjenning av en *eksakt diff/commit*, ikke generell brand-tillatelse. Streng rolle-/brand-grense.
4. **P4 verifikasjon:** Publisering bare via eksisterende avgrensede godkjente skrivere med før-versjon, rollback og uavhengig offentlig bevis; avvik må kunne stanses.
5. **SaaS-ekstraksjon:** Når dette virker i RealtyFlow, skill tenant-scoped skjema/data/tilganger og kundeinstallerte skrivere fra dagens interne owner-operasjoner. Ingen offentlig SaaS har automatisk RealtyFlow production/DB-tilgang.

## Sikkerhet som aldri skal omgås

- `publication_authorized` og `execution_started` er alltid **false** i målinger, arbeidskø og designforespørsler.
- Ingen nettsideendring på grunnlag av én SEO-observasjon, ufullstendige data eller ikke-gjenskapt feil.
- Kontroll av offentlig URL har hardkodet tillatt domene og begrenset antall sider; private ruter/kontakter skal ikke skannes.
- En oppgave skal ikke merkes «løst» uten separat uavhengig attestering av faktisk publisert versjon.
