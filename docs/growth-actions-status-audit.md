# Growth actions status audit

Status: read-only audit and documentation only. No production data or schema was changed.

Supabase project: `ereapsfcsqtdmzosgnnn`

## Production values

Read-only production query on 2026-06-07:

```sql
select status, count(*)
from public.growth_actions
group by status
order by status;
```

Result:

| Status | Count |
| --- | ---: |
| `published` | 1 |

Additional aggregate checks:

| Check | Count |
| --- | ---: |
| Total rows | 1 |
| `status is null` | 0 |
| Unknown values outside current canonical set | 0 |

## Code paths that write status

Current canonical TypeScript model:

```text
planned | ready | published | completed | failed
```

Migration `supabase/migrations/009_growth_engine.sql` defines the same check constraint, but production currently has no visible `growth_actions.status` check constraint.

Observed writers:

| Writer | Values | Notes |
| --- | --- | --- |
| `src/services/growth/growth-engine.ts` | `planned`, `ready`, `completed` | Generated and prepared growth actions. `recordResult` marks non-B metrics as `completed`. |
| `src/app/api/growth/engine/route.ts` | `planned` | Saves A/B tests and growth-cycle output. |
| `src/app/api/cron/growth-engine/route.ts` | `ready` | Picks top generated actions and marks them ready. |
| `src/app/api/growth/actions/route.ts` | caller-provided `status`, plus timestamp side effects for `published` and `completed` | Allows status updates without an explicit enum guard today. |
| `src/app/(business)/growth-hub/page.tsx` | `published`, `completed` | Marks actions as sent to Content Hub or reviewed with metrics. |
| `src/services/growth/remaster-action-history.ts` | `planned`, `completed` | Safe Re-Master history writer using existing `growth_actions` fields and SHA-256 fingerprint in `hypothesis`. |
| `src/app/api/neural-beat/recommendations-safe/route.ts` | delegates to `remaster-action-history` | Non-destructive actions become `planned`; metadata execution becomes `completed`. |
| `src/app/api/neural-beat/autopilot-run/route.ts` | delegates to `remaster-action-history` | Preview writes nothing; `plan_non_destructive` can create only `planned` rows. |
| `src/app/api/neural-beat/recommendations/route.ts` | `planned` using old column names | Legacy unsafe writer still contains `source`, `title`, `description`, and `metadata` fields that are not part of the production `growth_actions` contract. This endpoint should stay blocked for writes or be retired/fixed separately. |

Read-only routes and UI-derived display values:

- `src/app/api/growth/ab-tests/route.ts` maps A/B tests to display status `running` when no winner exists, but this is not written back as `growth_actions.status`.
- Neural Beat cron result objects use `completed`, `failed`, and `skipped`, but these are local response statuses, not `growth_actions.status`.

## Recommended canonical enum

Recommended canonical database values:

```text
planned
ready
published
completed
failed
```

Meaning:

| Status | Meaning |
| --- | --- |
| `planned` | Saved as a proposal or future action; not prepared for publication/execution. |
| `ready` | Prepared and ready for manual review or execution. |
| `published` | Sent to a publication surface or converted into a Content Hub draft/published item. |
| `completed` | Execution has been reviewed or measured. |
| `failed` | Attempted execution failed and should be visible for follow-up. |

## Migration need

A future check constraint is technically compatible with current production data because the only row is `published`.

However, it should be a separate migration after review because:

- `/api/growth/actions` currently accepts caller-provided `status` without enum validation.
- legacy Neural Beat recommendation code still contains a stale write path that should not be relied on.
- future Re-Master/UI flows may need to align labels before the database rejects new states.

Recommended future steps:

1. Add shared server-side validation for `growth_actions.status`.
2. Retire or repair legacy `/api/neural-beat/recommendations` POST writes.
3. Add an idempotent `not valid` check constraint.
4. Validate the constraint after confirming no unknown production values.

Future migration shape:

```sql
alter table public.growth_actions
  add constraint growth_actions_status_check
  check (status in ('planned', 'ready', 'published', 'completed', 'failed'))
  not valid;

alter table public.growth_actions
  validate constraint growth_actions_status_check;
```

Use a guard around `pg_constraint` in the real migration because Postgres does not support `add constraint if not exists`.

## Rollback

For this documentation PR: git revert only.

For the future constraint migration:

```sql
alter table public.growth_actions
  drop constraint if exists growth_actions_status_check;
```

Dropping the constraint would not delete or modify any `growth_actions` rows.
