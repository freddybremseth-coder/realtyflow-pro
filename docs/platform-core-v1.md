# Platform Core v1

Platform Core gjør eksisterende RealtyFlow-funksjoner salgbare som separate SaaS- og white-label-produkter uten å kopiere forretningsdata.

## Arkitektur

- `core` er kontrollplanet: tenants, app-pakker, moduler, planer, abonnement, entitlements, medlemskap, branding, domener, bruksmåling og audit.
- Domene-skjemaene er dataplanet: blant annet `commerce`, `inventory`, `publishing`, `growth` og eksisterende RealtyFlow-tabeller.
- `public.billing_organizations` er juridiske fakturaavsendere. De kobles til tenants gjennom `core.tenant_billing_organizations`; en tenant og et juridisk selskap er ikke samme ting.
- `saas_apps` fortsetter som intern produkt-/porteføljeoversikt. `core.apps` og `core.modules` styrer hva en kunde faktisk kjøper og får tilgang til.

## Første produktpakker

Følgende salgbare app-pakker er registrert uten å finne på priser:

- Fakturering
- CRM
- Forfatterstudio
- Re-Master Studio
- Commerce Operations
- DemoSites

Pakkene peker på en felles modulkatalog. RealtyFlow, Olivia, ChatGenius og Publishing er beholdt som eksisterende suiter.

## Sikkerhetsmodell

- Plattformadministrasjon er bare tilgjengelig for RealtyFlow-rollen `OWNER`.
- Nettleseren får ikke skrive direkte til plattformtabellene.
- Serveren bruker service-role og eksplisitt avgrensede RPC-er.
- Tenantdata har RLS basert på aktive medlemskap.
- Audit- og brukshendelser er append-only.
- Fremmednøkler og RLS-oppslag er indeksert.

## Utrulling

1. Kjør migrasjonen `20260718154346_platform_core_tenancy_modules_entitlements.sql`.
2. Deploy appen.
3. Åpne `/platform` som eier og kontroller interne tenants og modulpakker.
4. Opprett prisplaner først når kommersiell pakking er bestemt.
5. Koble Stripe-webhooks, automatisk DNS-verifikasjon og self-service onboarding i neste fase.

Migrasjonen er additiv og backfiller eksisterende brand-tenants og modultilgang. Den flytter eller sletter ikke eksisterende forretningsdata.
