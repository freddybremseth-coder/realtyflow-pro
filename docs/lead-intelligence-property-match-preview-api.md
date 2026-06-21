# Lead Intelligence Property Match Preview API

This is the first server-side preview surface for deterministic Lead Intelligence
property matching.

## Scope

`POST /api/lead-intelligence/property-matches/preview` ranks an explicit,
bounded set of existing `properties` rows against one approved
`buyer_profiles` row.

It does not:

- search the inventory automatically
- create leads or contacts
- persist property matches
- create shortlists or presentations
- send email
- start any external workflow

## Feature Flags

The route is server-gated and remains unavailable unless all of these are true:

- `REALTYFLOW_LEAD_INTELLIGENCE_ENABLED=true`
- `REALTYFLOW_LEAD_INTELLIGENCE_PERSISTENCE_ENABLED=true`
- `REALTYFLOW_PROPERTY_MATCHING_ENABLED=true`

`REALTYFLOW_PROPERTY_MATCHING_ENABLED` is the dedicated gate for this endpoint.
The browser cannot enable it.

## Request

```json
{
  "brand": "soleada",
  "buyerProfileId": "11111111-1111-4111-8111-111111111111",
  "propertyIds": ["22222222-2222-4222-8222-222222222222"],
  "maxResults": 10
}
```

Constraints:

- `brand` must be an allowed real-estate brand
- `buyerProfileId` must refer to an approved buyer profile for the same brand
- `propertyIds` must be unique UUIDs
- at most 20 properties can be evaluated per request

## Response

The response contains only safe match DTOs from the deterministic matching
engine. It does not include raw property rows, raw buyer-profile rows, database
connection details, service-role credentials, or private customer data.

The response always reports side effects as false in this phase:

```json
{
  "sideEffects": {
    "leadsCreated": false,
    "contactsCreated": false,
    "emailsSent": false,
    "matchesPersisted": false,
    "shortlistCreated": false
  }
}
```

## Data Access

Buyer profile data is read through the dedicated Lead Intelligence runtime
database connection in a short read-only transaction with server-set brand
context.

Inventory rows are read server-side by explicit property ID only. The service
role key is never sent to the browser.

## Production Notes

Do not enable `REALTYFLOW_PROPERTY_MATCHING_ENABLED` in production until the
preview API has been reviewed, the UI flow is intentionally designed, and Freddy
has approved the next property-matching smoke test.
