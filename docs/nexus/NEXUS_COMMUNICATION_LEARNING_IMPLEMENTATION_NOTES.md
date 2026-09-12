# Nexus Communication Learning implementation notes

Communication Learning v1 extends the existing email learning loop rather than creating a parallel communication system.

It derives six dimensions from sent email drafts: tone, language, intent, UTC send-hour bucket, UTC weekday, and message-length bucket. Existing reply matching and user-edit observations remain the outcome sources.

Rules remain stored in `nexus_communication_learning_rules`. Prefer/avoid verdicts require at least moderate evidence (10 observations). Limited and insufficient samples stay observation-only.

The admin learning endpoint separates timing recommendations from content recommendations. Timing recommendations are recommendation-only: they do not schedule, send, approve, mutate CRM state, or change Action Policy Registry permissions.
