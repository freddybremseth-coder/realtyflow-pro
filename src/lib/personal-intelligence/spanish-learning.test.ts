import assert from "node:assert/strict";
import test from "node:test";
import {
  createSpanishBridgeToken,
  rankSpanishFocus,
  verifySpanishBridgeToken,
} from "@/lib/personal-intelligence/spanish-learning";

test("Spanish daily focus prioritizes a due spaced review", () => {
  const now = new Date("2026-09-28T18:00:00Z");
  const focus = rankSpanishFocus({
    topics: [
      { id: "conversation", name: "Practical Conversation" },
      { id: "vocab", name: "Vocabulary & Active Recall" },
    ],
    mastery: [],
    reviews: [
      { topic_id: "vocab", due_at: "2026-09-27T18:00:00Z", priority: 5, status: "due", last_result: 0.55 },
    ],
    sessions: [],
    now,
  });

  assert.equal(focus?.topicId, "vocab");
  assert.equal(focus?.activityMode, "active_recall");
  assert.match(focus?.reason || "", /Repetisjon/);
});

test("Spanish daily focus starts with practical conversation when evidence is otherwise equal", () => {
  const focus = rankSpanishFocus({
    topics: [
      { id: "grammar", name: "Grammar Patterns" },
      { id: "conversation", name: "Practical Conversation" },
      { id: "listening", name: "Listening Comprehension" },
    ],
    mastery: [],
    reviews: [],
    sessions: [],
    now: new Date("2026-09-28T18:00:00Z"),
  });

  assert.equal(focus?.topicId, "conversation");
});

test("Spanish daily focus uses voice for practical conversation", () => {
  const focus = rankSpanishFocus({
    topics: [{ id: "conversation", name: "Practical Conversation" }],
    mastery: [],
    reviews: [],
    sessions: [],
    now: new Date("2026-09-28T18:00:00Z"),
  });

  assert.equal(focus?.activityMode, "conversation");
  assert.equal(focus?.inputMode, "voice_conversation");
});

test("Spanish bridge tokens are short-lived signed handoffs", () => {
  const previous = process.env.REALTYFLOW_SESSION_SECRET;
  process.env.REALTYFLOW_SESSION_SECRET = "spanish-bridge-contract-test-secret";
  try {
    const payload = {
      v: 1 as const,
      sessionId: "session-1",
      ownerUserId: "owner-1",
      subjectEntityId: "subject-1",
      topicId: "topic-1",
      exp: Date.now() + 60_000,
    };
    const token = createSpanishBridgeToken(payload);
    assert.deepEqual(verifySpanishBridgeToken(token), payload);
    assert.equal(verifySpanishBridgeToken(`${token}tampered`), null);
  } finally {
    if (previous == null) delete process.env.REALTYFLOW_SESSION_SECRET;
    else process.env.REALTYFLOW_SESSION_SECRET = previous;
  }
});
