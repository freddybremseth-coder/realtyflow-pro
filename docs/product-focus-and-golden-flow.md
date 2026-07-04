# Product Focus And Golden Flow

Status: working product direction for the next implementation phase.

This document turns the current RealtyFlow Pro codebase into a tighter execution plan. The goal is to reduce feature sprawl and make the strongest workflows reliable enough to use every day.

## Primary Bet

RealtyFlow Pro should first become an internal revenue and lead operating system before it becomes a broad external SaaS.

Two workflows matter most right now:

1. **Real estate lead-to-presentation**
2. **DemoSites lead-to-session**

Everything else should support those flows or wait.

## Golden Flow A: Real Estate Lead-To-Presentation

Target outcome: Freddy can take a messy customer message and turn it into a reviewed, useful customer follow-up package without losing control.

Flow:

1. Capture raw inquiry from call, WhatsApp, email, SMS, or meeting note.
2. Analyze it into a structured buyer profile.
3. Review every requirement, preference, exclusion, and missing-information question.
4. Save an approved buyer profile.
5. Link an existing CRM contact or explicitly continue without contact.
6. Match against inventory with location, budget, type, and risk guards.
7. Quality-review matched properties.
8. Save a shortlist draft.
9. Generate an internal presentation and email draft.
10. Later gates may create a CRM lead, approve a message, run send preflight, and send manually.

Hard boundary:

```text
No automatic customer communication. No automatic contact creation. No automatic lead creation.
```

## Golden Flow B: DemoSites Lead-To-Session

Target outcome: Freddy can find a local business, generate a private DemoSite, and know exactly who to contact next.

Flow:

1. Import or analyze a business website.
2. Detect industry, template, services, prices, trust signals, and contact hints.
3. Create or repair a private DemoSite preview and claim link.
4. Score the opportunity based on demo readiness, confidence, contactability, offer clarity, and risks.
5. Generate manual outreach drafts.
6. Recommend one next sales play: quality check, email, phone, DM, session, ops, or hold.
7. Track outreach status, follow-up date, session booked, won, or not-fit.
8. Keep the daily worklist small enough to act on.

Hard boundary:

```text
Outreach remains manual until deliverability, consent, sender identity, and audit state are explicitly designed.
```

## Smartest Implementation Order

1. **Stabilize the base**
   - Keep `main` current.
   - Install dependencies.
   - Run lead-intelligence, contacts, Revenue Engine, and DemoSites tests.

2. **Make product direction explicit**
   - Keep this document current.
   - Keep README aligned with the real app.
   - Prefer one golden-flow improvement over adding a new module.

3. **Tighten the real-estate flow**
   - Keep improving saved buyer profiles, revisions, lead previews, property quality review, and draft presentations.
   - Do not add real send behavior until the send gate sequence is complete.

4. **Tighten the revenue flow**
   - Improve Revenue Engine worklist quality.
   - Show one recommended play, channel, timing, and checklist for every opportunity.
   - Make follow-up state impossible to lose.
   - Prefer better prioritization and action tracking over more templates.

5. **Split large UI surfaces**
   - Break oversized pages into smaller components and hooks only when a feature needs editing.
   - Start with `lead-intelligence-client.tsx`, pipeline, CRM, and inventory.

6. **Standardize security**
   - Move older APIs toward the stricter admin/session/error-envelope style used by Lead Intelligence.
   - Avoid direct browser access to sensitive data.
   - Keep service-role usage server-only.

7. **Measure what matters**
   - Real estate: inquiry analyzed, profile approved, shortlist saved, presentation draft created, lead created later, message sent later.
   - DemoSites: site analyzed, demo ready, outreach ready, contacted, follow-up due, session booked, won.

## Non-Goals For Now

- Offline-first mobile architecture.
- 3D/GIS overlays.
- Automatic SMS, WhatsApp, or email sends.
- Full public multi-tenant SaaS.
- Broad marketplace or partner monetization.
- Predictive valuation models with unsupported accuracy claims.

Those may become valuable later, but they are not the fastest path to a sharper product now.
