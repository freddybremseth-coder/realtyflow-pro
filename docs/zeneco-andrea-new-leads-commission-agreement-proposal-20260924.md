# Zen Eco Homes × Andrea — joint new-lead cooperation (owner proposal)

Status: **proposal/draft, not signed, not deployed, no live permissions or payments**.
Effective new-lead intake cut-off: **24 September 2026, 00:00 Europe/Madrid** (the local calendar day specified by Freddy as "fra d.d."). The cut-off refers to when a NEW, independently attributable Zen Eco Homes enquiry is first received and recorded, **not** the purchase contract date or the day a historical lead is contacted again.

## Parties and scope

- Freddy leads the business, day-to-day operations, customer process, RealtyFlow administration, developer/builder relationship and legal-professional coordination. Andrea participates in sourcing, nurturing, viewings, sales, marketing and professional development as mutually agreed.
- Separate the Pinoso EcoLife collaboration from Zen Eco Homes. This Zen agreement is **commission/profit sharing on eligible new leads and their subsequent property transactions only**. It does not transfer any Zen Eco Homes company or brand equity, brand administration or legacy customers. Any arrangements between Andrea and Erlend, or a third person, should be explicitly settled by Andrea from her allocation unless Freddy separately approves another structure in writing.
- Eligible cohort: all genuinely new Zen Eco Homes enquiries first received from 2026-09-24 at 00:00 Europe/Madrid, from website, advertising, referrals, direct contact, viewings or other documented sources, whether initially handled by Freddy or Andrea. Record immutable receipt timestamp, originating channel, initial brand and assigned collaborators. It is the **first genuine enquiry**, not reassignment or re-import into RealtyFlow, that determines the cohort.
- Older Zen Eco Homes leads, existing Soleada/private customers, pre-existing buyer relationships, existing contracts and already advanced transactions do **not** become 50/50 merely because a sale, follow-up or CRM import occurs after the start date. For an existing customer to enter the joint cohort, the two parties must explicitly agree on the exact contact/deal beforehand and record owner approval and the reason. Do not automatically share or transfer across brands.
- If a person is in multiple brand CRMs, first verify the relationship and explicitly assign ONE selling brand and ONE shared deal ledger. Any other-brand private notes, customer files and finance remain private. Listing availability can be shared without customer-list sharing.

## Commission formula, per eligible completed sale

1. Take only the developer/builder's **actual commission cash received** for that sale, excluding VAT or taxes collected on behalf of tax authorities. Use the rate confirmed by the developer for the specific transaction; **7% is an indicative average, not a guaranteed rate**. Use a separate ledger for partial receipts and later adjustments.
2. Set aside **10% of that received developer commission** for a ring-fenced, reported marketing budget. It is NOT 10% of the property price and is allocated BEFORE deducting trips or other costs. Confirm which brand/account holds the reserve, spending authority, statements and treatment of unused funds on termination.
3. Deduct only necessary, documented and approved **direct deal expenses** such as fuel/transport, parking, tolls, coffee/customer meetings and reasonable client visits. Record date, transaction, amount (excluding recoverable VAT), receipt, business purpose and person who paid. Agree up-front spending limits and explicit approval for exceptional costs. Do not charge personal expenditure, duplicated fuel/mileage, standing overhead, subscriptions or unrelated leads without a separate written agreement.
4. **Reimburse actual eligible expenses to whoever originally paid them** from the deal before the remaining commission is divided. If the business already paid a cost directly, mark it paid and do not reimburse an individual a second time. Cost reimbursement is distinct from the two 50/50 profit shares.
5. Divide the remaining amount **50% Freddy / 50% Andrea**. Carry any single-cent rounding remainder transparently to the next settlement. No unilateral third-party deduction from the other's half.
6. Make settlement when the developer's corresponding commission funds have **cleared**, and share the dated statement, developer invoice/remittance and receipts with both parties. Reconcile partial developer payments proportionally with approved costs and the reserve; retain enough funds to cover chargebacks/cancellations. Define how reversals/returned commission are recovered after a prior distribution.
7. The 50/50 is a **commercial allocation before each party's own tax and invoicing obligations**, not a promise of net take-home pay. Have an accountant/lawyer determine the correct invoicing relationship and VAT/withholding treatment for the actual contracting entities before the first payout.

Formula, all amounts exclusive of relevant VAT:

`Marketing reserve = developer commission actually received × 10%`

`Pool = developer commission actually received − marketing reserve − approved direct deal expenses`

`Freddy's share = pool × 50%; Andrea's share = pool × 50%`

Illustration: a €500,000 home at an actual developer commission rate of 7% produces €35,000 in commission. Marketing reserve: €3,500. Approved direct expenses: €1,500. Distributable pool: €30,000. Freddy: €15,000. Andrea: €15,000. The €1,500 of direct expenses is separately reimbursed to its payer(s), **not** split again.

## CRM/RealtyFlow acceptance and access

- User receives at most separately verified **Pinoso EcoLife** and **Zen Eco Homes** workspaces. Do not use broad SALES/MARKETING roles or a brand-wide Zen CRM grant.
- Current Zen CRM remains closed to staff. Before activation build an audited per-contact/lead-cohort association (brand UUID + contact UUID + user membership + approved cohort, recorded first receipt + status), and enforce it in EVERY read, edit, notes, tasks, email, calendar, attachment, export, AI lookup and queue worker. Existing Zen customers are excluded unless individually owner-approved; a current Zen brand membership alone never opens old clients.
- New Zen leads must be stamped by a trusted server-side lead intake (never a client-supplied created_at, imported date or self-selected cohort). The brand/cohort association should be immutable or have a fully audited owner-only correction. A sale ledger references exactly one verified contact/deal, immutable co-operation eligibility, developer commission rate as contracted, actual receipts, approved expenses and marketing reserve.
- Only Freddy can view brand-wide Zen customer/financial history, grant or revoke access, reconcile old leads, approve cost exceptions and settle payouts. Andrea may view her own cohort and the limited joint deal statement, not Zen's general finance or unrelated commissions.
- Both sides should define: lead/attribution disputes, who may approve spend (and thresholds), treatment of cancellations, refund/chargeback, the status of eligible deals already in the pipeline when the partnership ends, continued access vs earned commission rights, unspent marketing funds and dispute-resolution procedure.
- No owner/staff brand grant, legacy customer relabel, invoice or automatic transfer is created by this document, draft calculator or current PR. Review the individual-lead cohort and ledger implementation in staging before inviting a user or making the agreement operative in software.


## Implementation update: reviewed cohort read boundary (draft PR only)

The feature branch includes an owner-only Zen Eco review screen and service-role-only database RPCs to list CRM records created since the local agreement date, verify the documented **first actual** enquiry, record source/evidence/reviewer/reason and approve, exclude or revoke eligibility with an append-only audit row. A new CRM creation date alone does not make a buyer eligible. Review writes are confined to the cohort registry and never change `public.contacts`, customer ownership, legal entities, source brand labels, existing customer notes, finances or permissions.

A separate narrow `crm.joint.read` brand grant and `GET /api/workspaces/zeneco/joint-contacts` path are implemented. They require current verified employee identity, an independently verified active Zen membership with the dedicated permission, an owner-approved post-cutoff cohort entry and two consistent Zen CRM brand tags. The SQL rechecks membership and verified user ID for each page/search; only safe contact fields are returned. Broad employee `crm.read` and `crm.write` remain explicitly blocked for Zen, even when owner enters them in a legacy grant. No joint-contact write, status change, notes, attachments, AI search or communication is enabled yet.

**This is NOT an active employee rollout.** The database migrations remain unapplied, the workspace-member feature flag remains OFF, no account/invitation/grant is created, and there are no automatically approved contacts. Only the owner can manually approve a genuinely new lead after verifying independent evidence. Before activation test the RPCs, constraints, audit and revocation in an isolated staging database, lock down all related customer routes/files/background jobs, validate first-enquiry provenance and apply an owner-confirmed account invitation plan. The commercial commission allocation calculator remains a draft and does not create an enforceable deal ledger or execute payouts.
