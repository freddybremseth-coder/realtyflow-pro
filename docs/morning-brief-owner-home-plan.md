# Morning Brief owner-home promotion gate

Morning Brief may become the OWNER home route only after the Unified Attention PR is green and merged.

Promotion invariants:

- OWNER lands on `/nexus-os/morning-brief`.
- Non-owner operational roles continue to land on `/today`.
- `HOME_ROUTE_FALLBACK` remains a safe owner-oriented route and moves with the owner home.
- Morning Brief remains read-only and delegates writes to canonical Nexus or Personal Intelligence surfaces.
- Nexus Today remains available as the canonical business execution surface.

This separates the new attention layer from its promotion to default entry, so a failed or incomplete Unified Attention build never changes the production home route.