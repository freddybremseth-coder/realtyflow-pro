# RealtyFlow contact brand reconciliation — read-only audit (2026-09-24)

Status: **read-only discovery; no customer records changed**. Source: a direct SQL aggregate inspection of the connected RealtyflowPRO database. This is a dated snapshot, not a persistent guarantee. No personal/customer-level rows were extracted or copied into this document.

## Observed CRM tag pairs

| `contacts.brand_id` | `contacts.brand` | Contact count |
|---|---|---:|
| soleada | soleada | 292 |
| zeneco | zeneco | 20 |
| zeneco | soleada | 3 |
| pinosoecolife | pinosoecolife | 0 |

The canonical `core.brands.brand_key = 'pinosoecolife'` exists; however, no existing contact was assigned to Pinoso in either legacy field at the time of the read-only check. Thus a correct, exact-brand Pinoso employee view would initially display **no existing contacts**. Do not silently give Andrea the 292 Soleada or 23 Zen Eco Homes-tagged contacts to make the list look populated. Three Zen Eco-tagged contacts have inconsistent legacy branding and must be reviewed individually by the owner before any brand reconciling.

## Safe next steps, to be built before activation

1. Provide an **owner-only** CRM reconciliation screen with filters for customers whose `brand_id` and `brand` disagree, showing the owner the current verified brand and a proposed target brand. Never expose this list through an employee workspace or a shared duplicate checker.
2. Freddy explicitly selects any contacts which Pinoso EcoLife is authorised to work with. Distinguish **transfer** (remove from originating brand) from **explicit sharing** (retain origin and add a reviewed brand-to-contact association). Do not alter a source brand solely because a record matches a name, phone number, email, regional interest or website lead origin.
3. For existing records, prefer explicit `contact_brand_memberships` and per-brand private notes/tasks over an unreviewed bulk update of `brand_id`. Where a transfer is approved, log actor, previous and new brand, timestamp and reason, and enforce exact current-brand predicate transactionally. Perform preflight count and conflict checks and verify all related notes, communications, attachments and AI indexes are either correctly scoped or withheld.
4. Add an owner preview of affected counts and a reversible migration dry run in staging. **Do not run customer transfers automatically** from this branch and do not activate a Pinoso employee merely because the interface and tests build successfully.

The scoped CRM route intentionally requires `brand_id = selected brand AND brand = selected brand` at query, mutation and response boundaries. Inconsistent or unassigned contacts remain invisible to the employee until an approved reconciliation takes place.
