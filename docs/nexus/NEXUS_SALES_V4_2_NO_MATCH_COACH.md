# Nexus Sales v4.2 — No-Match Coach

## Goal

When a Buyer Profile is approved but matching produces no good property candidates, Nexus should do useful sales work without silently relaxing the customer's criteria or contacting the customer autonomously.

## Behavior

- Analyze the approved Buyer Profile and active approved criteria.
- Identify one likely constraint or one missing fact.
- Prepare exactly one primary clarification question.
- Prepare a customer-facing email draft using the current confirmed criteria.
- Surface the case in the existing Nexus Inbox / No-Match Review flow.
- Require human review before any customer contact.

## Prepare, Don't Spam

No-Match Coach is prepare-only.

It does not:

- send email or any other customer communication;
- mutate Buyer Profile criteria;
- relax hard requirements;
- move pipeline stage;
- commit price, offer, contract, reservation or closing terms.

The review API explicitly reports `customerMessageSent: false` and `reviewRequiredBeforeCustomerContact: true`.

## One-question rule

The coach chooses one question, not a questionnaire. Missing data is prioritized in this order: location specificity, budget, property type, bedrooms. If the profile is already specific, Nexus proposes one carefully bounded flexibility question based on the current criteria. The question remains a proposal until reviewed by a person.

## Nexus Inbox

No-Match cases stay inside the existing Nexus Inbox. The card shows:

- how many properties were analyzed;
- current criteria context;
- the likely constraint;
- the one proposed clarification question;
- a `Review spørsmål` action.

This keeps Nexus AI as the single visible assistant while the specialist sales logic remains internal.