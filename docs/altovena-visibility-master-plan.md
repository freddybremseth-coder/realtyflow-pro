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
