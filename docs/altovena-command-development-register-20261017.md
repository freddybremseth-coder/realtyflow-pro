# Altovena Command – utviklingsoversikt 17.10.2026

**Arbeidslogg for å unngå dobbeltutvikling på tvers av samtaler.**
GitHub-kommitter og migrasjonshistorikk, ikke teksten i en enkelt chat, er kilde for hva som faktisk er implementert.

## Valgt arkitektur

- Utvikling: privat `altovena`-schema i Supabase-prosjektet **RealtyflowPRO**.
- Ferdig SaaS og egne installasjoner: eget Supabase/PostgreSQL-miljø per kunde, med portable migreringer.
- RealtyFlow er den interne innloggede brukerflaten. Nexus eier agenter og arbeidsmotor; Altovena Command eier oppdrag, plan, ansvar, budsjett og sporbarhet.
- Den aktive eierbaserte `/altovena/command`-funksjonen lagrer bare utkast. Den har ikke aktiv agentutførelse.

## Utviklingslinjer (ikke merge hver for seg til main)

| PR | Ansvar | Status og restriksjon |
| --- | --- | --- |
| #1427 | Persistente Nexus-agentforslag | Plan, aldri handling |
| #1428 | Command/Nexus integrasjon og analyseforberedelse | Kontrollert overlevering, ingen dispatch |
| #1429 | Verifisering av kildehenvisninger i AI-utkast | Offline evidensvalidering, ingen modellkjøring |
| #1430 | Real-model adapterkontrakt | Deaktivert, ingen leverandørkall |
| #1431 | Privat budsjett-/reservasjonsregnskap | Isolerte tester, ikke aktiv i produksjon |
| #1432 | Uavhengig to-personers godkjenning, kildeattestering | Ingen prod-migrering, ingen kildeinnhenting |
| #1434 | Autorisert kildeinnhenting og revokasjonskontroll | Denne grenen; kun offline kontrakt og tester |

`#1433` er en **egen Altovena Visibility**-utvikling, ikke del av Command-stack og skal ikke blandes inn utilsiktet.

## Dette leverer #1434

- Et enkelt, testbart grensesnitt som krever autorisasjon → versjonsbundet kildeutdrag → ny rettighetskontroll.
- Kildedata får eksakt SHA-256, stabil sortering og hashformat kompatibelt med den deaktivert modellen sin evidenskontroll.
- Revideringshash med kildeversjon og kildehenvisning til fremtidig kontroll.
- Ingen URL-henting eller nettverkstrafikk utenfor en senere eksplisitt serverintegrasjon.
- Ingen Supabase-migrering eller API/UI-åpning.
- Ingen kundeinfo, ingen oppdragskjøring og ingen AI-kostnad.

## Før neste release

1. Få grønne alle seneste GitHub Actions-jobber på endelig stack-head og dokumenter hvordan PR-ene integreres.
2. Implementer serverautorisert source connector med per-kilde tilgang, versjonslagring, returkode for tilbakekall og logg uten personopplysninger.
3. Etabler dokumentert og revidert tenant → brand mapping, og riktig autorisering av både operatør og reviewer.
4. Gjennomfør en isolert to-tenant, to-user staging-test, inkludert feilrettigheter og kostnadstak.
5. Først da vurderes en separat feature-flagget read-only AI-kjøring med manuell tillatelse. Ingen automatiske eksterne handlinger.

**Ingen av disse utviklings-PR-ene er en godkjenning til å aktivere AI-kjøring, masseutsendelser eller publisering i RealtyflowPRO.**
