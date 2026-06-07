# Growth actions Re-Master fingerprint index

Status: repository migration only. No production database change was applied from this branch.

## Read-only production audit

Supabase project: `ereapsfcsqtdmzosgnnn`

Metadata and aggregate checks on 2026-06-07 showed:

| Check | Result |
| --- | --- |
| `public.growth_actions` total rows | 1 |
| `brand is null` | 0 |
| `platform is null` | 0 |
| `hypothesis is null` | 0 |
| `brand = 'remasterfreddy' and platform = 'youtube' and hypothesis is not null` | 0 |
| Duplicate Re-Master YouTube fingerprints | 0 |
| Existing indexes | primary key only |

The audit supports adding a narrow performance index. It does not justify a unique constraint.

## Migration

Migration:

```text
supabase/migrations/20260607145900_growth_actions_remaster_fingerprint_index.sql
```

Index:

```sql
create index if not exists idx_growth_actions_remaster_fingerprint
  on public.growth_actions (brand, platform, hypothesis)
  where brand = 'remasterfreddy'
    and platform = 'youtube'
    and hypothesis is not null;
```

## Locking note

This migration uses normal `create index if not exists`. The production table currently has one row, so the expected lock window is very small.

For a future large `growth_actions` table, use a separately reviewed rollout plan for `create index concurrently`, because concurrent index creation has different transaction and failure semantics and may not be safe in every migration runner mode.

## Rollback

```sql
drop index if exists public.idx_growth_actions_remaster_fingerprint;
```

No data rollback is required.
