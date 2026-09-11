# Nexus Action Policy Registry v1

## Purpose

The Action Policy Registry is the explicit control plane for Nexus autonomy. A model score, confidence value or persuasive recommendation must never by itself grant permission to execute an action.

Every governed action maps to one of five policy classes:

- `AUTO_SAFE` — explicitly authorized, testable actions that Nexus may execute within the action-specific safety contract.
- `DRAFT_ONLY` — Nexus may prepare the work, but a separate approval or policy is required before the external side effect.
- `HUMAN_REQUIRED` — a human must make the decision.
- `WAIT` — the correct action is to wait for a new signal or scheduled point.
- `FORBIDDEN` — Nexus must not autonomously execute the action.

## V1 AUTO_SAFE set

The registry explicitly permits only the following classes of work:

- internal CRM note updates;
- versioned Buyer Profile updates from exact high-confidence customer evidence;
- internal property-match preparation;
- review-only shortlist draft preparation;
- presentation/message draft preparation;
- the already-authorized narrow missing-criteria clarification email, provided fresh brand, recipient and suppression safety checks pass.

`AUTO_SAFE` is not a blanket permission. Each implementation still has to satisfy its own validation, idempotency, brand, suppression, evidence and audit requirements.

## Customer-facing boundary

General customer communication is `DRAFT_ONLY`.

Property recommendation sends and viewing bookings are `HUMAN_REQUIRED` under V1. The new send-preflight can return READY, but READY remains a validation result rather than permission to send.

Ambiguous buyer criteria changes remain `HUMAN_REQUIRED`; Nexus must surface the reply rather than guess the customer's meaning.

## Forbidden autonomy

The registry explicitly marks autonomous legal/contract commitments and unverified price/availability guarantees as `FORBIDDEN`.

This prevents future agents from broadening autonomy merely because an LLM believes an action is likely correct.

## Revenue Brain integration

Revenue Brain no longer owns its own ad-hoc source policy. It receives its policy classification from this registry and exposes both the policy action type and the registry reason in its output.

Revenue Brain remains read-only in this phase. The registry is the prerequisite for a later execution layer that may run only actions whose policy is `AUTO_SAFE`, and only after action-specific checks pass.

## Next step

Add an outcome/event measurement layer so Nexus can learn which governed recommendations produced replies, viewings, offers and revenue without changing policy permissions based on performance alone.
