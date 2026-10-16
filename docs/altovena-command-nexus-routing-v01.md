# Altovena Command → Nexus, planlegging v0.1

## Status (2026-10-16)

Altovena Command er en intern arbeidsflate i RealtyFlow (eier-sesjon), med dedikert database-schema `altovena`. Et oppdrag begynner som et vedvarende `draft`. Den første Nexus-integrasjonen **ruter oppdraget mot eksisterende agentkapasiteter og lagrer et forslag, uten å kjøre agentene**.

## Flyt

1. Eier oppretter et oppdragsutkast fra `/altovena/command` (eksisterende, testet).
2. Eier trykker «Foreslå Nexus-agenter».
3. Serveren verifiserer RealtyFlow owner-session, hentet oppdrag og oppretter plan fra den eksisterende `AGENT_FLEET_BINDINGS` og `buildNexusAdvisorSystemRouting`. Ingen klientspesifiserte agentnavn eller verktøy tillates.
4. Servergatede RPC-er lagrer planen i `altovena.mission_route_plans`; en logghendelse legges til samme transaksjon.
5. «Vis plan» leser det lagrede forslaget. Alle agenter står som `not_started`.

## Avgrensninger

- Dette er **routing**, ikke kjørte AI-agentanalyser, og ikke en autonom oppgavekø.
- Det finnes **ingen** utførelses- eller godkjennings-API for forslaget, og ingen sideeffekter ut mot e-post, sosiale medier, CRM eller publisering.
- Databasevalidering krever `ROUTING_PROPOSAL_ONLY`, `approvedForExecution=false`, `permittedExternalActions=false`, `allowedTools=[]` og menneskelig gjennomgang.
- Hvert oppdrag kan ha ett uforanderlig planforslag i denne første versjonen. Identisk gjentatt forespørsel blir idempotent; ulikt innhold blokkeres.
- `altovena`-schemaet er privat/RLS-beskyttet. Bare RealtyFlows verifiserte eier-session får bruke et lite sett `service_role`-only sikkerhetsfunksjoner, aldri fri databasetilgang fra klienten.
- Eksterne SaaS-kunder vil senere ha egne databaser og egne identitets-/medlemskapsregler; den innebygde eierbroen er **ikke** en allmenn SaaS-API.

## Testing og aktivering

Migreringen `20261016211500_altovena_command_routing_plans.sql` har en PostgreSQL17 integrasjonstest som sjekker tenant-/missionskop, RPC-rettigheter, idempotens, avslag på spoofet `approvedForExecution` og at null tasks kjøres.

Ikke aktiver reell utførelse før:
1. Agentadapter som er begrenset til tillatte read-only oppgaver, med verifisert identitet, tenant- og mission-binding.
2. Modell-/verktøykostgrenser, timeout, kansellering og idempotens.
3. Uavhengig resultatverifikator og dokumenterte kildehenvisninger.
4. Separat approval state machine som låser payload-digest og utløpstid og hindrer egen-godkjenning ved handlinger med risiko.
5. Transaksjonell kø/outbox og ekstern handling gateway med dobbel-utførelsesbeskyttelse.
6. Isolerte E2E-tester mot faktisk Nexus API; funksjonsflagg for aktivering og eksplisitt kundesamtykke.

## Prinsipp
Nexus eier spesialistkapasiteter og reelle automatiseringer. Command eier oppdragsbeskrivelse, koordinering, godkjenning, status og sporbarhet. Ikke opprett en parallell agentsystem- eller skrivebane.
