# Nexus AI — In-App Advisor v1

Status: locked product direction for RealtyFlow Pro / Nexus OS.

## Purpose

Nexus AI is the persistent system-wide advisor inside RealtyFlow. RealtyFlow remains the daily workspace; the assistant sits across the application and lets the owner ask natural-language questions about customers, leads, CRM, pipeline, sales, priorities, marketing, system status and navigation.

The product goal is not another module to manage. The assistant should reduce the need to remember where data or controls live and convert live system data into concrete next actions.

## Core user experience

From any authenticated RealtyFlow page, the user can open Nexus AI and ask questions such as:

- What should I focus on today?
- Which leads are closest to a sale?
- Which active customers have not been followed up recently?
- What should I do with this customer?
- Where do I find buyer intake / CRM / Growth OS / approvals?
- How many active opportunities do we have and what is their pipeline value?
- Why is this customer still in this stage?
- How can I make RealtyFlow perform a certain workflow?

If the user is currently on `/customers/{contactId}` or a customer-filtered CRM URL, Nexus AI treats that customer as current page context without requiring the user to repeat the name.

## V1 capability boundary

V1 is read-only.

Nexus AI may:

- read live CRM and Nexus state,
- use current page context,
- name concrete customers/leads when the data supports it,
- rank next-best actions using the existing pipeline movement model,
- explain pipeline and opportunity values,
- explain existing system capabilities and configuration,
- recommend what should be done next,
- provide deterministic navigation shortcuts into existing RealtyFlow modules.

Nexus AI may not in v1:

- send email or messages,
- mutate CRM fields,
- move pipeline stages,
- approve gated actions,
- change buyer requirements,
- publish content,
- create legal/commercial commitments,
- claim that an action was executed unless Nexus execution/audit data proves it.

Those side effects belong to a later governed action layer and must use the existing policy/approval architecture.

## Data sources in v1

The advisor may use existing RealtyFlow sources including:

- `contacts` for CRM and pipeline state,
- existing `assessPipelineMovement` logic for ranked next actions,
- `nexus_business_opportunities` for Opportunity Store context,
- `marketing_source_queue`,
- `social_channels`,
- `agentic_approvals`,
- `brand_email_configs`,
- `marketing_learning_rules`,
- `nexus_autonomy_policies`,
- `nexus_owner_focus`,
- `nexus_runtime_controls`,
- existing Nexus command registry for deterministic navigation.

The assistant must reuse those truth sources instead of inventing a separate CRM, pipeline or navigation model.

## Priority behavior

When asked what to do today, Nexus AI should prefer a small, explainable list of concrete actions rather than dashboard dumping.

Priority should combine:

1. pipeline movement score / stage urgency,
2. customer intent and recent activity,
3. pipeline or opportunity value,
4. overdue follow-up,
5. explicit owner focus,
6. approvals or blockers requiring human judgment,
7. runtime/autonomy constraints.

Customer-level recommendations should include why the customer is prioritized and what the recommended next step is.

## Navigation behavior

Navigation answers are deterministic, based on the existing `NEXUS_COMMANDS` registry.

For questions such as “where do I find X?” or “where should I click?”, Nexus AI should:

1. identify the best matching existing module,
2. explain what is found there,
3. expose a clickable route shortcut,
4. avoid inventing menu names or URLs.

## Conversation behavior

The assistant keeps recent conversation state and locally persists the chat history so normal navigation/reload does not immediately destroy context.

Conversation history is supporting context only. Current live system data outranks old chat content when they conflict.

## Sales number semantics

CRM `pipeline_value` and Opportunity Store `value` are decision-support metrics. They must not automatically be described as booked revenue, recognized revenue, commission received or cash collected.

If the user asks for actual booked/paid sales numbers and the snapshot does not contain an authoritative finance source, Nexus AI must say that the exact figure is not available from the current source rather than relabeling pipeline value.

## Safety principles

- Customer-confirmed facts outrank inference.
- Runtime controls and autonomy policy cannot be bypassed by chat.
- Current page context is a convenience, not authorization to mutate data.
- Read warnings must be surfaced when a source failed.
- Missing data should be named explicitly; never filled with invented facts.
- Legal, contractual, price and availability guarantees are never invented.
- Cross-brand identity or sender changes remain governed by Nexus policy.

## V1 acceptance criteria

V1 is acceptable when:

1. Nexus AI is available globally on authenticated app pages.
2. A question asked on a customer page can use that customer as active context.
3. “Who should I contact?” can return named, live CRM customers with reasons and next actions.
4. “What should I do today?” can use existing movement logic and opportunity context.
5. “Where do I find X?” returns a deterministic RealtyFlow destination and clickable shortcut.
6. Chat history survives a normal reload in the same browser.
7. The assistant does not claim to perform write actions.
8. Pipeline/opportunity value is not mislabeled as booked revenue.

## Next phase

V2 can add governed actions behind explicit policies and approvals, for example:

- prepare an email draft,
- create a follow-up work item,
- prepare a property shortlist,
- propose a pipeline move,
- request approval for a gated action.

Actual side effects must remain idempotent, auditable and policy-controlled.
