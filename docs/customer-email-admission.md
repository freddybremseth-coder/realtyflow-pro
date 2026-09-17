# Customer-only email admission

Nexus treats the mailbox as the communication brand and CRM contacts as person-level identities that may be used across brands.

Admission rules:

- one globally unique CRM email identity: accept automatically
- customer thread resolving to one CRM identity: accept automatically
- duplicate CRM identities: review
- unknown human sender: review, never automatic CRM mutation or reply
- owned mailboxes, same-domain internal mail, system notifications, bounces, newsletters and obvious vendor outreach: filtered
- filtered/review messages are kept outside `email_messages` in the service-only `email_admission_queue`
- review content is retained so it can be promoted later when identity evidence becomes sufficient
- historical Inbox/Sent backfill uses the same admission boundary as live ingest
- historical customer messages are stored read + archived and never trigger outbound sending

This keeps Nexus Communications customer-focused without silently discarding possible new leads.
