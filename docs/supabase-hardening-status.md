# Supabase hardening status

Dato: 2026-05-31

## Mål

RealtyFlow Pro skal være master-prosjektet for business-data. Doña Anna / Olivia
skal lese og skrive gårdsdata i `olivia` schema, og FamilyHub skal lese sine
egne data i `family` schema og samle resultater fra RealtyFlow/Olivia.

Riktig Supabase project ref er:

```txt
ereapsfcsqtdmzosgnnn
```

Den gamle gratis-refen skal ikke brukes:

```txt
jvcdkclfcaccogmvvkrs
```

## Utført

- Lagt til Data Health-side i RealtyFlow Pro på `/data-health`.
- Lagt til JSON-endepunkt på `/api/business/data-health`.
- Data Health sjekker `public`, `olivia` og `family` schema og viser manglende tabeller, feil schema og gammel Supabase-ref.
- Finance sync leter etter Olivia-tabeller i konfigurert schema, deretter `olivia`, deretter `public` som fallback.
- `.env.example` er lagt til med riktig project-ref og schema-konfig.
- Vercel production/development er satt med:
  - `OLIVIA_SCHEMA=olivia`
  - `FAMILY_SCHEMA=family`
- `npm audit fix` er kjørt uten breaking changes.

## Miljøstatus

| Miljø | RealtyFlow host | Olivia schema | Family schema | Status |
| --- | --- | --- | --- | --- |
| Local | `ereapsfcsqtdmzosgnnn.supabase.co` | `olivia` | `family` | Oppdatert |
| Vercel production | `ereapsfcsqtdmzosgnnn.supabase.co` | `olivia` | `family` | Oppdatert |
| Vercel development | `ereapsfcsqtdmzosgnnn.supabase.co` | `olivia` | `family` | Oppdatert |
| Vercel preview | Branch-spesifikk | Ikke satt ennå | Ikke satt ennå | Må settes etter branch push |

Vercel nekter preview-env uten en konkret preview-branch. Etter branch er pushet,
sett de samme schema-variablene for branchens preview environment.

## Resterende risiko

- `npm audit` i RealtyFlow Pro har fortsatt Next.js-funn som krever større valg:
  - audit anbefaler breaking oppgradering til Next 16.
  - `epub-gen` ble fjernet fordi appen allerede har egen EPUB-eksport med `jszip`.
- Supabase-connectoren i Codex har ikke rettigheter til project ref
  `ereapsfcsqtdmzosgnnn`, så RLS ble auditet fra repo/migrasjoner, ikke live
  `pg_policies`.
- Data Health viser at Olivia/B2B-tabeller må finnes i `olivia` schema. Hvis de
  fortsatt ligger i `public`, må de flyttes eller migrasjonene kjøres på nytt med
  schema-kvalifiserte tabellnavn.
- Data Health kan rapportere `42501 permission denied for schema family` hvis
  `family` ikke er eksponert/grantet for PostgREST i RealtyFlow Supabase.

## Kontrollspørringer

Kjør disse i Supabase SQL Editor på RealtyFlow-prosjektet:

```sql
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname in ('public', 'olivia', 'family')
order by schemaname, tablename;
```

```sql
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname in ('public', 'olivia', 'family')
order by schemaname, tablename, policyname;
```

```sql
select n.nspname as schema_name, c.relname as table_name, c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r'
  and n.nspname in ('public', 'olivia', 'family')
order by n.nspname, c.relname;
```

Alle eksponerte tabeller skal ha RLS på. Ingen B2B-, Family- eller Olivia-tabell
skal ha `using (true) with check (true)` som permanent policy.
