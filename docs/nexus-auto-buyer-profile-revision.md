# Nexus automatic Buyer Profile revision

When an inbound customer reply is classified as `update_preferences`, Nexus may create a new approved Buyer Profile version without manual review only when every supported changed criterion is explicitly evidenced in the customer's latest reply and has confidence >= 0.92.

Supported automatic revision dimensions are limited to concrete property-matching data: location, property type, budget, bedrooms, bathrooms, living area, and plot area. Ambiguous, partial, broad, or unsupported changes stay behind review.

The previous approved profile is never edited in place. Nexus creates a new version, copies unaffected active criteria, replaces only the explicitly changed keys, and marks the previous version `superseded`. The email message id is included in the revision actor marker to make retries idempotent.

No customer-facing email, viewing booking, or other external action is performed by this revision step. Property matching may continue only after the new profile version is approved by the automatic safety gate.