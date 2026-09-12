# Communication Learning v1 rollout

This change extends the existing communication learning loop with timing and message-length dimensions. It does not add any autonomous send path.

Rollout remains fail-safe:
- no timing rule is actionable below moderate evidence
- timing is recommendation-only
- customer send, suppression, preflight and Action Policy Registry remain unchanged
- learning API exposes timing recommendations separately from content recommendations
