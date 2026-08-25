# Nexus Advisor Mail 2.0

## Goal

Turn the existing manual advisor-email concept into a Nexus-native sales workflow. The email is a presentation layer on top of Nexus Communications, Property Match, CRM/contact data, nurture, runtime controls and the existing brand SMTP sender.

The objective is not to send more email. It is to move qualified property leads toward a useful next action: reply, shortlist refinement, video call, viewing or purchase process.

## Core principle

**Advisor, not catalogue.**

Nexus should normally select 2–4 properties and explain why each property matches the buyer. A shortlist should contain both positive match reasons and relevant compromises. It must never manufacture urgency, scarcity, credentials, legal assurances or customer testimonials.

## Mail modes

`AdvisorMailMode` supports:

1. `first_response`
2. `qualification`
3. `shortlist`
4. `property_alert`
5. `viewing_push`
6. `post_viewing`
7. `follow_up`
8. `reactivation`

Nexus chooses mode from CRM/pipeline state, recent communication, AI intent/urgency/sentiment, property-interest completeness and previous nurture activity.

## Architecture

### Existing systems to reuse

- `email_messages`: inbound/outbound communication history
- `email_drafts`: AI draft review flow
- `contacts`: CRM identity, pipeline status, property interest and nurture state
- `lead_nurture_events`: nurture execution history
- Nexus Communications: prioritisation of unread/unreplied communication and AI intent/urgency
- `sendBrandEmail()`: canonical SMTP transport with `bodyText`, `bodyHtml` and outbound logging
- Runtime/Autonomy controls: sending remains separate from analysis/drafting

### New renderer

`src/lib/nexus/advisor-mail.ts`

This is a pure renderer. It receives verified facts and returns:

- `subject`
- `bodyText`
- `bodyHtml`
- metadata describing mode, property IDs, max match score and whether any real urgency signal exists

It does **not** decide who may be contacted and does **not** send email.

### Property-match payload

Each property should eventually be supplied with:

- stable property ID
- title/location/price/image/listing URL
- match score
- `matchReasons[]`
- `compromises[]`
- optional structured facts
- optional urgency facts such as new listing, days on market, real price reduction, off-market status or verified competing interest

The copy layer may explain those facts but should never invent them.

## Recommended lead facts

Property Match / CRM should progressively normalise:

- budget min/max
- preferred areas
- property type
- minimum bedrooms/bathrooms
- minimum size
- sea view
- walking distance
- terrace/outdoor space
- orientation/evening sun
- new build/resale
- permanent home/holiday/investment
- car/no car
- schools
- airport access
- quiet/lively preference
- must-haves
- nice-to-haves
- dealbreakers

## Recommended sales events

Create/normalise revenue events for at least:

- `advisor_mail_drafted`
- `advisor_mail_approved`
- `advisor_mail_sent`
- `property_viewed`
- `property_clicked`
- `property_rejected`
- `property_favorited`
- `video_clicked`
- `booking_clicked`
- `booking_completed`
- `email_replied`
- `whatsapp_clicked`
- `nurture_ignored`

Clicks, replies, bookings and repeated property interest should carry materially more lead-score weight than email opens.

## Proposed Nexus workflow

1. Nexus identifies a lead requiring progress.
2. Pull current contact/pipeline/property-preference state.
3. Pull recent communication and AI intent/urgency/sentiment.
4. Property Match ranks candidates.
5. Nexus selects 2–4 and generates evidence-bound match reasons and compromises.
6. Select mail mode.
7. Render with `renderAdvisorMail()`.
8. Save as an approval draft.
9. Human approves unless Runtime/Autonomy policy explicitly permits the message class.
10. Send through `sendBrandEmail()` using both HTML and text versions.
11. Log outbound message and revenue event.
12. Interaction/reply updates lead score and determines next action.
13. Any genuine reply or booking pauses conflicting nurture immediately.

## CTA model

Prefer a concrete next action over passive language.

Examples:

- choose one of 2–3 actual viewing slots
- book a 15-minute video call
- view property
- mark interesting / not for me

Future tracked action links should write an auditable event back to Nexus before redirecting to the final destination.

## Trust and legal wording

Avoid absolute or unverifiable claims.

Do not use `Registered advisor` / `Registrert rådgiver` unless a concrete registration exists and is stored as verified profile data.

Prefer process wording such as:

> I follow you through the process and make sure the necessary legal checks and contract review are handled before you proceed. Where legal advice is required, this is handled by a qualified lawyer.

Avoid claims equivalent to `buying here is as safe as at home`. Prefer transparent process language describing what is checked and when.

## Scarcity policy

No generic fake urgency.

Urgency may only be generated from stored facts, for example:

- listing is genuinely new
- verified off-market availability
- real documented price reduction
- very short days-on-market window
- verified competing buyer interest

The renderer exposes `hasTruthBasedUrgency` so later policy code can ensure urgency copy is fact-backed.

## Compliance / suppression

Before live nurture or promotional sending, a separate policy layer should evaluate fields such as:

- `marketing_consent_status`
- `consent_source`
- `consent_at`
- `legitimate_interest_basis`
- `do_not_contact`
- `unsubscribe_at`
- `email_suppressed`
- `bounce_status`

Suppression must be enforced server-side, not entrusted to generation prompts.

## Email-profile storage

Do not use `window.storage` for production agent identity. Move advisor profile fields to Supabase / brand configuration so they are consistent across devices and support multiple agents/brands.

Suggested profile data:

- name
- title
- company/brand
- phone
- WhatsApp
- email/from address
- photo URL
- booking URL
- language
- verified credentials line
- legal footer

## Deliverability dashboard (future Nexus Communications)

Surface domain/account health alongside sales performance:

- SPF
- DKIM
- DMARC
- SMTP/TLS health
- bounce rate
- unsubscribe rate
- complaint/spam indicators where available

## Implementation phases

### Phase 1 — renderer and architecture

- [x] Pure HTML/text Advisor Mail 2.0 renderer
- [x] 8-mode message contract
- [x] match reasons + compromises + match score
- [x] truth-based urgency metadata
- [x] optional compliance/unsubscribe footer

### Phase 2 — Nexus draft API

- [ ] API route that loads contact + recent communications + property candidates
- [ ] generate/save `advisor_mail` draft
- [ ] expose evidence used for every match statement
- [ ] reuse current approval policy

### Phase 3 — Communications UI

- [ ] `Nexus recommends next action` card
- [ ] shortlist/property match panel
- [ ] editable HTML/mobile preview
- [ ] Approve & send / schedule controls
- [ ] exact reason for recommendation

### Phase 4 — tracked interactions

- [ ] tracked property links
- [ ] interested / not-for-me actions
- [ ] viewing and booking actions
- [ ] event-based lead scoring
- [ ] pause/advance nurture from real engagement

### Phase 5 — optimisation

- [ ] subject/CTA experiments
- [ ] conversion attribution to viewing and sale
- [ ] per-segment learning
- [ ] deliverability health in Nexus

## Safety rule

Analysis/drafting and sending remain separate capabilities. Advisor Mail 2.0 must respect Nexus Runtime and Autonomy policy. A polished email is not itself permission to send it.
