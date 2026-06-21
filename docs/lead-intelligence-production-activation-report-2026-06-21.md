# Lead Intelligence Production Activation Report - 2026-06-21

Status: production smoke-test report. This document records what was activated, tested, and then disabled again after the controlled Lead Intelligence review-flow smoke test.

No SQL, schema change, migration-history change, secret change, property matching, email sending, lead creation, or contact creation was performed while writing this report.

## Summary

Production Supabase project:

```text
ereapsfcsqtdmzosgnnn / RealtyflowPRO
```

Production app:

```text
https://realtyflow.chatgenius.pro/lead-intelligence
```

Result:

- Lead Intelligence PR 3A persistence schema had already been applied and verified before this smoke test.
- Runtime RLS had already been applied and verified before this smoke test.
- Runtime database credential and HMAC secret were configured server-side by Freddy before this smoke test.
- Production analysis and persistence were temporarily enabled for a controlled smoke test.
- A `continue_without_contact` review save succeeded without external side effects.
- A changed-payload conflict test returned `REVIEW_CONFLICT` as expected.
- Read-only contact candidate lookup succeeded and returned a masked candidate.
- Contact linking was not tested and must remain gated.
- Production persistence was disabled again after the smoke test.

## Source And Runtime State

Relevant implementation commits already on `main` during/after the smoke test:

```text
95f7e1fc26bf34a748c84efc6d8b1cd44e1338c6  Lead Intelligence confidence normalization
8259e575bd01cfd52c0d2ffdf1d9c860b41fcc0a  Lead Intelligence runtime DB SSL config
f62c366f8bc9cd7265f7603a26606463bdeefe9f  Contact candidate lookup UX and hash redaction
```

Runtime-RLS activation had previously been resumed from the reviewed runtime migration correction:

```text
af7f0a7ff540ab483eab486d9425c28e7ba6e4f9
```

Final production deployment after disabling persistence again:

```text
Deployment URL: https://realtyflow-2vdgyerth-freddy-bremseths-projects.vercel.app
Alias: https://realtyflow.chatgenius.pro
Status: Ready
Created: 2026-06-21 12:29 Europe/Madrid
```

## Feature Flags And Secrets

Production was temporarily configured to allow the smoke test:

```text
REALTYFLOW_LEAD_INTELLIGENCE_ENABLED=true
REALTYFLOW_LEAD_INTELLIGENCE_PERSISTENCE_ENABLED=true
REALTYFLOW_PROPERTY_MATCHING_ENABLED=false
REALTYFLOW_AUTO_SEND_ENABLED=false
```

After the smoke test, production persistence was disabled again and redeployed:

```text
REALTYFLOW_LEAD_INTELLIGENCE_ENABLED=true
REALTYFLOW_LEAD_INTELLIGENCE_PERSISTENCE_ENABLED=false
REALTYFLOW_PROPERTY_MATCHING_ENABLED=false
REALTYFLOW_AUTO_SEND_ENABLED=false
```

Server-only production secrets were not printed, copied into this report, committed, or exposed to browser code:

- `REALTYFLOW_LEAD_INTELLIGENCE_DATABASE_URL`
- `REALTYFLOW_LEAD_CONTACT_LOOKUP_HMAC_SECRET`

Preview still has its own `REALTYFLOW_LEAD_INTELLIGENCE_PERSISTENCE_ENABLED` value. Production has a separate `false` value.

## Smoke Test 1 - Review Save

Input: Emmadale fixture from the Lead Intelligence acceptance test.

Contact decision:

```text
continue_without_contact
```

Observed result from UI:

```text
Review lagret uten eksterne sideeffekter.
Intake ff1b9002-ae63-4752-a89b-a9653206d4db
Buyer profile 05f7403d-70c4-4011-a371-88b77882581e
kriterier 5
Ny lagring: ja
Duplicate: nei
Conflict: nei
E-post sendt: nei
Property matching: nei
Kontakt opprettet: nei
```

Assessment: pass.

Verified:

- Intake was created.
- Buyer profile was created.
- Criteria were created.
- `continue_without_contact` was used.
- No email was sent.
- Property matching was not started.
- No contact was created.

Not independently re-queried in this report:

- `raw_text_restricted` value.
- Exact table row counts after the test.

Those should be checked with a read-only SQL report if a formal audit record is needed.

## Additional Save Attempt

Observed result from UI:

```text
Review lagret uten eksterne sideeffekter.
Intake 2d8139d2-e0e9-4b85-9ae7-f68d2e4481b5
Buyer profile 9d140e29-d8b0-41d0-81b6-9b21fa97f460
kriterier 6
Ny lagring: ja
Duplicate: nei
Conflict: nei
E-post sendt: nei
Property matching: nei
Kontakt opprettet: nei
```

Assessment: pass for safe save/no side effects, but not a valid duplicate replay.

Reason:

- The UI generated or used a different effective review payload/idempotency context.
- It created a separate intake/profile instead of returning `duplicate=true`.

Follow-up:

- A true identical duplicate replay remains unverified through the UI.
- Before PR4, test an identical review request with the same idempotency seed and unchanged payload, expecting same IDs and `duplicate=true`.

## Smoke Test 2 - Conflict

Observed result from UI:

```text
REVIEW_CONFLICT
This review idempotency seed was already used for a different reviewed payload
{
  "conflict": true
}
Correlation ID: rf_mqnmclt9_2ec49070acb8de4a504a8a4d
```

Assessment: pass.

Verified:

- Reusing an idempotency seed with materially changed review payload is rejected.
- The API returns stable error code `REVIEW_CONFLICT`.
- The error envelope includes a correlation ID.
- Existing profile was not intentionally overwritten through the UI flow.

## Smoke Test 3 - Contact Candidates

Initial UX issue:

- The contact-candidates API returned HTTP 200, but the UI showed the same message before and after an empty lookup.
- PR `#63` clarified the post-lookup empty state and removed `matchValueHash` from the browser response.

After PR `#63`, observed result from UI:

```text
1 kontaktkandidat funnet.
Freddy Bremseth
960***65 · f***y@zenecohomes.com
exact_phone · 86%
```

Assessment: pass for read-only candidate lookup.

Verified:

- Contact candidate lookup works.
- Candidate data is masked in the UI.
- No full phone number or full email address was shown.
- No HMAC lookup hash is sent to the browser after PR `#63`.
- No contact was linked.
- No contact was created.
- No email was sent.
- Property matching was not started.

Not tested:

- `connect_existing`.

Gate:

- Do not test `connect_existing` until a specific test contact and approval criteria are prepared.

## Side-Effect Controls

Confirmed through UI smoke results:

```text
Email sent: no
Property matching: no
Contact created: no
```

No evidence was observed that the smoke test wrote to:

- `public.leads`
- email tables
- property matching / shortlist / presentation flows

This report did not run an additional production SQL count query. If required, run a separate read-only verification before enabling persistence for real use.

## Production Persistence Disabled Again

After the contact-candidate read-only test, production persistence was disabled:

```text
REALTYFLOW_LEAD_INTELLIGENCE_PERSISTENCE_ENABLED=false
```

Vercel production was redeployed after this environment change.

Final deployment:

```text
https://realtyflow-2vdgyerth-freddy-bremseths-projects.vercel.app
Alias: https://realtyflow.chatgenius.pro
Status: Ready
```

Expected behavior now:

- Analysis preview can remain available.
- Review saves should be blocked by the server-side persistence flag.
- No further production Lead Intelligence persistence writes should occur unless the flag is explicitly re-enabled.

## Security Notes

No secrets were included in:

- chat output
- Git commits
- documentation
- runtime logs inspected for this report

Browser must never receive:

- `REALTYFLOW_LEAD_INTELLIGENCE_DATABASE_URL`
- `REALTYFLOW_LEAD_CONTACT_LOOKUP_HMAC_SECRET`
- HMAC lookup hashes
- database connection details
- service-role credentials

PR `#63` removed the server-only `matchValueHash` from the contact-candidate browser DTO.

## Known Gaps Before PR4

Do not start property matching until these are resolved or explicitly accepted:

1. Run a true duplicate replay with identical idempotency seed and unchanged payload.
2. Optionally run a read-only SQL count/report confirming current row counts and no writes to leads/email/matching tables.
3. Keep `connect_existing` gated until a controlled test contact is approved.
4. Decide whether production persistence should stay disabled until PR4 is ready for preview/staging, or whether Freddy wants controlled real usage before PR4.

## Recommendation

Next safe step:

1. Review and approve this activation report.
2. Run the remaining duplicate replay and optional read-only row-count audit.
3. Only then start PR4: property normalization and deterministic match engine.

PR4 must not send email, create shortlists for customers, or automatically communicate with leads.
