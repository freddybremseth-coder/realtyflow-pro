# Lead Intelligence Message Approval State

Adds an internal approval state for Lead Intelligence message drafts.

Endpoint:

```text
POST /api/lead-intelligence/message-drafts/:messageDraftId/approval
```

Scope:

- approve an existing internal draft
- store approved_by and approved_at
- require explicit admin approval
- keep missing customer links as blockers
- allow explicit waiver for remaining verification notes

Safety:

- no customer communication
- no provider call
- no publishing
- no contact change
- no lead change
- no task creation
- no automatic matching

Database boundary:

The migration grants runtime update only for status, approved_by and approved_at on message drafts.
