# RealtyFlow platform architecture — locked 2026-10-03

## Decision

RealtyFlow is one platform with four primary work apps:

1. **Sales**
2. **Marketing**
3. **Content**
4. **Finance**

The platform is supported by **Shared Core + Nexus**. Technical and administrative capabilities live under **Platform / Operations** and should not dominate the normal user experience.

This replaces the old direction where RealtyFlow grew as one large menu of loosely grouped modules.

## Non-negotiable architecture rules

- Do **not** create four separate data silos.
- Customers, companies, brands, users, permissions, communication, files, activities, Nexus signals and audit history remain shared platform data.
- Existing routes and backend contracts stay valid during migration unless a later PR explicitly replaces them.
- New features must have one primary app owner: Sales, Marketing, Content or Finance.
- Cross-app workflows use shared IDs/events rather than copying entities.
- Nexus remains system-wide and may read signals across apps subject to current permissions and evidence gates.
- Platform / Operations is primarily for owner/admin users.
- External users should see only the apps and modules required by their assigned responsibilities.

## App ownership

### Sales

Owns CRM, leads, customers, pipeline, property catalog in sales context, viewings, closing, after-sales, recovery and Care customer operations.

### Marketing

Owns campaigns, distribution, email/Reach, social automation, SEO/AEO/GEO, ads, attribution, market visibility and marketing analytics.

### Content

Owns Content Studio, Content Hub, articles, images, media production, Reels/video production, YouTube and publishing/book production.

### Finance

Owns revenue, commission, cash, invoicing, costs, forecast, monthly close, ROI and business financial reporting.

### Platform / Operations

Owns Shared Core administration, Nexus controls, users, permissions, brands, integrations, data health, automation runtime and audit/control surfaces.

## Migration strategy

This is an incremental migration, not a rewrite.

### Phase 1 — app shell and navigation

- Add canonical app definitions.
- Add app landing routes.
- Regroup existing navigation under the four apps plus Platform / Operations.
- Keep existing module routes working.
- Keep existing API/auth/database boundaries unchanged.

### Phase 2 — module ownership

Move each module's UI ownership and entry points under its canonical app. Remove duplicated entry points only after redirects and permissions are verified.

### Phase 3 — shared contracts

Standardize shared customer, brand, activity, communication, file, task and economic event contracts. Reuse existing Supabase data rather than duplicating it.

### Phase 4 — cross-app learning loop

Make the end-to-end chain explicit:

Content -> Marketing -> Lead -> Sales -> Revenue/Finance -> Nexus learning

Attribution must preserve source evidence so Nexus can learn from actual qualified customers, sales and collected revenue rather than reach alone.

### Phase 5 — role-based product experience

A user should enter RealtyFlow and immediately understand the job to do. The four app surfaces and "Dette bør du gjøre i dag" should be filtered by brand, permissions and responsibility. Admin surfaces remain hidden unless required.

## Current implementation boundary

The first foundation PR changes information architecture only. It must not introduce a Supabase migration or split shared records. Existing Care, workspace security, Doña Anna, publishing and revenue flows continue on their current backend contracts.
