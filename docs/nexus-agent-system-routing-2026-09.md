# Nexus advisor system routing — September 2026

Nexus AI is the conversational orchestrator, not a parallel execution engine.

The advisor must first route work to existing RealtyFlow/Nexus owners:

- AgentOrchestrator specialist capabilities for analysis/preparation work.
- Automation Registry workers for scheduled operational work.
- Mission Operations / Revenue Command for durable governed missions.
- Communications Readiness for controlled historical mailbox import.
- Email Link Health for identity review before CRM linking.
- Nexus Inbox / Approval Center wherever human review is required.

For email-to-CRM work the canonical sequence is:

1. Email Readiness / historical backfill when history is missing.
2. Email Link Health / identity review.
3. Email CRM sync.
4. Buyer Profile sync.
5. Criteria confirmation.
6. Property match prep.
7. Shortlist prep.
8. Presentation prep.
9. Send preflight.
10. Property recommendation send.

The advisor must not create a separate bulk CRM mutation path, bypass evidence gates, mutate Buyer Profile criteria directly, or send customer communication directly.
