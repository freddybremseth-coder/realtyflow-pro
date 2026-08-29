# Pipeline Kanban

`/pipeline` is intentionally a thin CRM view.

Responsibilities:
- show the canonical active buyer lifecycle
- allow explicit human drag/drop status changes
- surface next-action priority and follow-up state
- link into Customer 360 for all detailed customer work

Non-responsibilities:
- email sending or drafting
- Gmail synchronization
- document/image import
- commission editing
- Buyer Intelligence history editing
- interaction/timeline editing
- portal invitation

Customer 360 (`/customers?contactId=...`) is the source of truth for detailed CRM work.
