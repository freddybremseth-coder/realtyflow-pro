# Lead Intelligence extraction preview

This PR adds the first usable Lead Intelligence preview flow. It is intentionally temporary state only:

- no contacts are created
- no leads are created
- no buyer profile is persisted
- no property matching is run
- no shortlist or email draft is created
- no customer message is sent
- no database schema changes are included

## Feature flag

The preview is disabled by default.

```text
REALTYFLOW_LEAD_INTELLIGENCE_ENABLED=true
```

The flag is checked server-side in `POST /api/lead-intelligence/analyze`. The browser cannot enable it. When the flag is missing or false, the API returns a safe `LEAD_INTELLIGENCE_DISABLED` response.

Production should not enable this flag until Freddy has reviewed the UI, provider behavior, and test output.

Rollback: set `REALTYFLOW_LEAD_INTELLIGENCE_ENABLED=false` or remove the environment variable.

## Auth

The route uses the existing RealtyFlow admin session cookie and `verifyAdminSession`. Unauthenticated calls return `AUTH_REQUIRED`. The route is not added to public middleware paths.

## Provider and prompt version

The server-side service uses the existing AI provider abstraction (`askClaude`) with structured JSON instructions and final validation through `ExtractedLeadSchema`.

Prompt version:

```text
lead-intelligence-extraction-v1
```

The prompt states that customer text is data, not instruction, and tells the model to ignore prompt injection attempts inside the pasted customer message.

## Privacy and pseudonymization

Before the provider call, the server:

1. normalizes line endings
2. removes control characters
3. detects email and phone values
4. replaces them with placeholders such as `[PHONE_1]` and `[EMAIL_1]`
5. keeps the placeholder mapping only in request memory
6. restores placeholders after the validated structured result is returned

The service logs only safe metadata:

- correlation ID
- prompt version
- model label
- duration
- result status
- validation field names
- whether repair was used

It must not log raw customer text, full phone numbers, full email addresses, provider raw output, system prompts, API keys, OAuth tokens, service-role keys, or database connection strings.

## Request limits

The preview accepts text only. It rejects empty, too-short, and oversized messages. Attachments and HTML processing are not included in this phase.

Current limits:

- max raw text length: `LEAD_INTELLIGENCE_LIMITS.bodyText`
- max request body: `18 KiB`
- in-memory analyze rate limit: 8 requests per minute per admin identity

The in-memory rate limit is a minimum guard. A shared store can replace it later if the feature becomes multi-user or high-volume.

## Structured output

Flow:

1. The provider returns text.
2. The service parses a single JSON object.
3. Canonical normalizers run for property types, criterion keys, currency, language, and country.
4. Placeholder values are restored from request memory.
5. `ExtractedLeadSchema` validates the full object.
6. If validation fails, the service can make one bounded repair call with only validation summaries and the sanitized prompt.
7. If repair fails, the UI receives `AI_INVALID_OUTPUT`.

No partial output is persisted.

## API

```text
POST /api/lead-intelligence/analyze
```

Request:

```json
{
  "source": "phone_call",
  "brand": "soleada",
  "rawText": "customer note",
  "language": "no"
}
```

Response:

```json
{
  "ok": true,
  "correlationId": "rf_...",
  "result": {},
  "meta": {
    "model": "claude-sonnet-4-structured-json",
    "promptVersion": "lead-intelligence-extraction-v1",
    "durationMs": 1234,
    "repaired": false
  }
}
```

Errors use the existing safe error envelope.

Minimum error codes:

- `LEAD_INTELLIGENCE_DISABLED`
- `AUTH_REQUIRED`
- `ADMIN_FORBIDDEN`
- `INVALID_REQUEST`
- `INPUT_TOO_LONG`
- `RATE_LIMITED`
- `AI_TIMEOUT`
- `AI_INVALID_OUTPUT`
- `AI_PROVIDER_ERROR`
- `INTERNAL_ERROR`

## UI

The new module is available as:

```text
/lead-intelligence
```

Navigation label:

```text
AI Lead Inbox
```

The UI shows:

- source
- brand
- optional language
- raw text
- original request side by side with the AI proposal
- contact suggestion
- phone lookup status
- purchase readiness
- budget
- canonical property types
- locations
- hard requirements
- preferences
- exclusions
- missing questions
- editable local JSON

Available actions:

- `Analyser henvendelse`
- `Analyser på nytt`
- `Kopier JSON`
- `Start på nytt`

Not available in this PR:

- create lead
- update contact
- find properties
- create shortlist
- create email draft
- send customer message

## Acceptance fixture

The Emmadale fixture is stored in:

```text
src/services/lead-intelligence/fixtures.ts
```

Expected extraction:

- name: `Emmadale`
- phone: original value restored, with E.164 lookup `+4790174714`
- email: `null`
- readiness: `ready_to_buy`
- budget: `440000 EUR`
- includes costs: `true`
- approximate: `true`
- flexible location: `true`
- property types include `end_townhouse`, `apartment`, `penthouse`
- hard requirements include bedrooms, top floor, lift
- preferences include terrace, terrace access, view
- exclusions include future building risk and privacy/view risk

## Known limitations

- Provider calls use the existing `askClaude` abstraction, which can fall back between configured providers. All responses still pass the same structured validation boundary.
- The UI uses local editable JSON for full-field editing in this preview. PR 3 should introduce a dedicated review form before persistence.
- The current rate limiter is process-local and is only a first safety guard.
- No database persistence, duplicate-contact lookup, property matching, presentation builder, or email draft creation is included.

## Planned PR 3

The next PR should add Lead Review and buyer profile approval:

- explicit review form
- duplicate contact lookup
- approve/reject AI interpretations
- create or link contact only after Freddy approval
- create a structured buyer profile
- persist only approved data
