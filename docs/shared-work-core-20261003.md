# Shared Work Core · task and automation contract

Date: 2026-10-03

## Decision

`public.work_items` is the canonical RealtyFlow store for internal human and operational work.

Automations are a separate execution plane:
- `public.automation_rules` defines configured automation;
- `public.automation_runs` records executions;
- `public.automation_logs` records operational evidence;
- an automation creates a `work_item` only when explicit human action is required.

This prevents thousands of normal automation executions from becoming user-facing tasks.

## Canonical RealtyFlow lifecycle

Database statuses:
- `TO_DO`
- `IN_PROGRESS`
- `REVIEW`
- `DONE`
- `CANCELLED`

Active statuses are exactly `TO_DO`, `IN_PROGRESS`, and `REVIEW`.

Historical/UI aliases such as `TODO`, `OPEN`, `PENDING`, `COMPLETED`, and `CANCELED` are normalized only at boundaries. They are not new database states.

## Source ownership

### RealtyFlow

System of record: `public.work_items`.

Used by CRM, Sales, Marketing, Content, Publishing, Nexus and operational follow-up. Existing RLS/server-side write boundaries remain unchanged.

### Joint workspace tasks

System of record: `core.zeneco_joint_work_items`.

These tasks were intentionally isolated from legacy/global customer work. They must not be bulk-copied or automatically mirrored into `public.work_items`.

### Olivia

System of record: `olivia.tasks`.

Olivia task concepts include farm-specific category and parcel context. Olivia currently uses the simpler `TODO/DONE` lifecycle. Shared Core maps those states for cross-app read views but does not move or duplicate the rows.

### Automation

System of record: `automation_rules/runs/logs`.

Automation run history remains evidence, not user work. Human escalation must be an explicit, idempotent `work_items` creation policy.

## Production observations

At the time of this extraction:
- RealtyFlow `work_items` uses only the five canonical statuses.
- Olivia has its own task rows and lifecycle.
- the automation runtime contains materially more execution records than human tasks, reinforcing that the two concepts must remain separate.

No customer task rows or farm task rows are moved by this phase.

## Migration rule

Consumers should import lifecycle/source normalization from `src/lib/shared-core/tasks.ts` instead of declaring private status sets. This phase changes code contracts only; it does not alter the production schema, RLS, or existing task ownership boundaries.
