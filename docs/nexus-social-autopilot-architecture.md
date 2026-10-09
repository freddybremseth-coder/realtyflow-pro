# Nexus Social Autopilot — gjennomføringsplan

**Status:** Design/implementeringskontrakt. Ikke aktivert for autonom publisering.
**Eierskap:** Nexus orkestrerer; RealtyFlow Shared Core lagrer strategi, media, utkast, publiseringsjobb og statistikk. Eksisterende SoMe Studio, Content Hub, publiseringsmotor og `src/lib/workspaces/social-strategy.ts` skal gjenbrukes.

## Mål

Per brand skal eier kunne velge om vedkommende eller Nexus oppdaterer strategien. Nexus bruker den godkjente strategiversjonen til å velge **kategori**, **konkret innholdskilde**, **kanal**, **kreativt konsept**, **visuelt format**, **publiseringstid** og **oppfølging**. Ingen ukontrollert generering eller autopublisering.

### Kategorier og format

Eksisterende kategorier: `property`, `area_lifestyle`, `guide_competence`, `market_insight`, `people_advisor`, `proof_process`.

Formater: `single_image`, `collage`, `carousel`; videre fase: video/reels. Begrepene må være felles i SoMe Studio, Content Hub, Nexus og publiseringsmotoren. Styling velges separat fra bildeformat: editorial premium, lifestyle story, advisor insight, minimalistisk, faktakort m.fl.

ZenEcoHomes har allerede mål i strategimotoren: boliginnlegg 17,5 %, område/livsstil 25 %, guider 20 %, markedsinnsikt 15 %, rådgivning/mennesker 10 %, prosess/kundetrygghet 12,5 %. Dette er en redigerbar **strategiversjon**, ikke en hardkodet universell fordeling. For andre brands er mål og publiseringsgrenser egne.

## Nexus-kjeden

1. **Strategiversjon** — eier velger `manual`, `nexus_propose` eller `nexus_manage`, med tillatt kategori-/kanalmiks, budsjett, kanalvalg og publiseringstak. Nexus-foreslåtte endringer lagres med begrunnelse og versjonshistorikk.
2. **Planner** — leser siste publiseringshistorikk, målandeler, kategori-tak, kildeoppdateringer, ledige plasser og pauser; lager en begrunnet innholdskø. Unngå repetisjon av samme bolig, guide, bilde eller hovedbudskap over kort intervall.
3. **Source intelligence** — velger blant godkjente boliger, områder, guider, magasininnhold og eierdefinerte temaer. Verifiserer at bolig fortsatt er tilgjengelig, at artikkel-URL virker og at påstander kan støttes. Ukjent faktagrunnlag betyr utkast til kontroll, ikke oppdiktede tall.
4. **Creative selector** — produserer inntil tre reelt ulike konsepter og velger bildeformat etter kvalitet på kildemedia. Forsøk på karusell krever 2–10 godkjente bilder, collage krever egnede bilder, ellers enkeltbilde. Det skal være både utforsking og stabilitet; ingen unødvendige AI-kostnader.
5. **Content Hub** — lager et sporbart utkast med originalkilde, strategi-ID, brand, kategori, konsept, stil, format, bilde-ID-er, versjoner, begrunnelse, kostnadsestimat og godkjenningsstatus. All videre publisering må komme herfra.
6. **Admission gates** — eksisterende publiserbarhetssjekk, mediesjekk, brand-/kontoreierskap, linkregel, rettigheter, duplikatkontroll, salgs-/løftepolicy, frekvenstak og budsjett. `manual_approval` som standard; `auto_publish` kan bare aktiveres eksplisitt per brand og kanal med terskel og nødstopp.
7. **Publisher** — nyttiggjør eksisterende Meta-kanaloppløsing og én felles idempotent publiseringsjobb; behandler usikre svar som `needs_reconciliation`. Ingen automatisk retry når Meta kan ha publisert. Facebook og Instagram først, andre kanaler via adaptere.
8. **Learning** — lagrer plattform, post-ID, eksponering, rekkevidde, lagringer, kommentarer, lenkeklikk og kvalifiserte leads der måling faktisk er mulig. Sammenlign innen kanal, brand og tidsvindu; normaliser for rekkevidde/visninger. Skille mellom korrelasjon og kausal effekt. Nye forslag presenteres med datamengde og sikkerhet; aldri endre strategi på bakgrunn av ett innlegg.

## Viktige grenser

- **Shared Core** eier én kanonisk innholdspost, medier og status. Ikke separate Nexus-/Marketing-/SoMe-tabeller for samme sannhet.
- En **brand-skillevegg** verifiseres server-side på hver lesing og mutasjon; eierstyrt tilgang og separate plattformkontoer.
- Ett godkjent publiseringsoppdrag per innholdspost, kanal og kanal-ID; lås/idempotens før Meta-kall, og reconciliation etter usikre svar.
- Betalte annonser og personlige kontoer skal aldri åpnes av en publiseringsregel for organisk SoMe.
- Sjekk målpostens `published_at`, sentrale kampanjer og manuelt publisert innhold før en ny publisering.
- `scheduled` karuseller holdes deaktivert til cron/scheduler kan håndtere hele media-listen.
- Automatisk generering og bildebruk skal ha kostnadsgrenser. Budsjettoverskridelse = stopp og varsling.
- Lagring av kilde, variant, beslutningsbegrunnelse, KPI og menneskelig overstyring kreves for forklarbar læring.
- Eieren skal kunne **pause autopilot umiddelbart** for én kanal, ett brand eller globalt.

## UI som må bygges

Under **Nexus → SoMe Autopilot**:
- Strategi med eier/Nexus-kontroll, kategoriandeler, kanal-/formatmiks, stilpreferanser og frekvenstak.
- **Denne uken**: planlagte innlegg, kilde, format, valgt bildepakke, valgt konto og hvorfor.
- Godkjenn / Endre / Avvis / Sett på pause, med direkte redigering i Content Hub.
- **Resultater og læring**: per brand, kanal, kategori, format og stil. Sammenligningsgrunnlag, antall innlegg og begrunnede forslag.
- Logg over hvem/hva som godkjente strategi og publisering.

## Etappevis utrulling

**Fase A (nå):** fullfør PR #1387, test eksisterende publiserer og karusell på kontrollerte utkast, verifiser alle CI-kontroller, merge og deploy. Brukertest først når produksjon er bekreftet. Ingen automatikk.

**Fase B:** Nexus lager ukeplan og foreslår tre ulike konsepter fra godkjente kilder, med eksisterende strategi. Alt går til Content Hub for manuell godkjenning. Mål kvalitet, feil og kostnad.

**Fase C:** Eier kan velge automatisk publisering per brand/kanal med eksplisitt opt-in, grenseverdier, idempotens, rollback-/pauseprosess og revisjonsspor. Start med få innlegg og én merkevare.

**Fase D:** Læringssløyfe optimaliserer kilde/kategori/stil/format og foreslår dokumenterte strategijusteringer. Utvid kanaladaptere når datagrunnlag, API-tilgang og tester er på plass.

## Akseptansekriterier før autopublisering

1. Null dobbeltpublisering ved 2 samtidige forespørsler, nettverksavbrudd eller Meta-timeout.
2. Null krysspublisering mellom brands; tilganger verifiseres på serversiden.
3. Ikke publiser uten riktig medieformat, tilhørende bildepakke, gyldig kanal og publiserbar tekst.
4. All publisering logges med strategi, utkast, beslutning, godkjenning og kanalrespons.
5. Nødstopp og avvisning fungerer uten å slette utkast eller historikk.
6. Brukeren ser årsaken til at Nexus valgte innhold, stil og tidspunkt, og kan overstyre.
