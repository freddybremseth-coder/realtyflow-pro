# Nexus Advisor Mail — property feedback loop

## Customer experience
Every property card in Advisor Mail can expose two low-friction actions:
- **Interessant**
- **Ikke for meg**

The customer should be able to give useful preference feedback with one tap, without composing a reply.

## Signal semantics
`interested` is a positive property preference signal. Nexus should increase relevance for the clicked property's characteristics and prioritize human follow-up when the lead is otherwise warm.

`not_for_me` is a negative preference signal. Nexus should reduce similar recommendations, but must not infer *why* without evidence. A later feedback page may ask for an optional reason such as price, area, property type, size, distance, view, condition, or other.

## Storage and analytics
The feedback route writes to `property_feedback_events` and also emits a revenue event. This allows the signal to feed:
- lead scoring
- property recommendation ranking
- next-best-action
- shortlist generation
- Advisor Mail performance reporting

## Safety / automation
A click is a signal, not autonomous permission to buy, book, or contact through another channel. Any outbound follow-up remains subject to Nexus Runtime/Autonomy and communication consent/suppression controls.

## Next stage
1. Add signed/expiring feedback tokens instead of raw identifiers in public links.
2. Add an optional reason page after `not_for_me`.
3. Feed feedback aggregates into Property Match.
4. Surface feedback history on the Nexus lead page.
5. Add configurable lead-score weights for `property_interested` and `property_not_for_me`.
