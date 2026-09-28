# Spanish ChatGenius ↔ RealtyFlow learning bridge

Status: owner-only integration contract for Freddy's 5-minute Spanish micro-learning.

## Product behavior

- RealtyFlow always exposes a compact **5 minutt for litt spansk** button on authenticated owner surfaces.
- The button is a nudge, not a streak mechanic and not a blocking modal.
- RealtyFlow chooses the next focus from the canonical Personal Intelligence learning data:
  1. due spaced reviews,
  2. weak previous review evidence,
  3. topics with unknown or limited evidence,
  4. least-recently practiced topics.
- The five canonical Spanish learning dimensions are:
  - Practical Conversation
  - Listening Comprehension
  - Vocabulary & Active Recall
  - Grammar Patterns
  - Pronunciation & Speaking
- Starting the button creates a real `learning.sessions` row with teaching mode
  `spanish_chatgenius_daily5`.

## Handoff to spanish.chatgenius.pro

RealtyFlow opens Spanish with these query parameters:

- `source=realtyflow`
- `mode=daily5`
- `duration=5`
- `focus=<conversation|listening|active_recall|pattern_drill|shadowing>`
- `topic=<human-readable topic>`
- `rf_session=<learning session uuid>`
- `rf_bridge=<short-lived signed token>`
- `rf_callback=https://realtyflow.chatgenius.pro/api/integrations/spanish/progress`
- `rf_return=<safe RealtyFlow URL>`

The bridge token is signed server-side and contains only the owner, subject, session,
topic and expiry needed to bind one learning result to one session. It contains no
database key and no RealtyFlow session cookie.

## Spanish app hook

When `mode=daily5` and `rf_bridge` are present, Spanish should:

1. Build a roughly five-minute session around `topic` and `focus`.
2. Prefer active retrieval/production over passive reading.
3. Use any Spanish-native progress already available in the app as additional context.
4. When the micro-session ends, POST to `rf_callback`:

```json
{
  "token": "<rf_bridge>",
  "completed": true,
  "activityType": "conversation",
  "score": 0.78,
  "difficulty": 0.62,
  "engagement": 0.85,
  "friction": 0.2,
  "learnerResponse": "Optional short learner answer/transcript",
  "feedback": "Optional concise app feedback"
}
```

All numeric learning signals are optional and normalized to 0..1. A score from 0..100
is also accepted and normalized by the RealtyFlow bridge.

The callback records:

- session completion,
- one idempotent assessment per session,
- cautious mastery/evidence updates,
- the next spaced-review date.

It does **not** infer mastery merely because a session was opened or completed.

## Current deployment boundary

The RealtyFlow side of this bridge is in this repository. The Spanish app source is
not currently registered with a writable repository in RealtyFlow/GitHub. Until the
Spanish-side hook above is installed, the button can start and hand off the adaptive
session, but completed exercise evidence cannot automatically flow back from the
Spanish app.
