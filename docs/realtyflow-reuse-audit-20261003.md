# RealtyFlow reuse audit

Date: 2026-10-03

RealtyFlow must reuse proven first-party capabilities before creating new parallel implementations.

## Olivia -> Finance / Operations

Evaluate and generalize:
- ExpenseCapturePanel
- ProfitabilityDashboard
- AutoTasks
- CommerceHub
- order/document linking
- task and Kanban patterns
- document/archive flows

Farm-specific concepts such as parcels, harvest, irrigation and certification stay in Olivia. Generic transaction, receipt, document and task primitives should become shared services.

## Family -> Finance / Shared Core

Evaluate and generalize:
- TransactionManager
- BankStatementImporter
- BankManager
- BillsManager
- ReceiptScanner
- ReceiptMatchWidget
- DocumentScanHelper
- DocumentsManager
- LiquidityForecastCard
- AutoBudgetSuggestion
- GlobalSearch
- AITaskChief
- IntegrationsSettings

Finance should normalize these concepts around company, brand, project, customer, lead and revenue source rather than household-only dimensions.

## Re-Master Freddy -> Content

Evaluate and generalize:
- AdminReelsStudio
- AdminAssets / AssetCard / AssetUpload
- AdminJobs
- PipelineAssets
- PipelinePublishSettings
- YouTubeHealthCard
- AutopilotControl
- AdminRecommendations
- RecommendationHistory

Music-specific concepts stay in Re-Master. Generic asset, media-job, Reels, video, publishing and channel-health primitives should become shared Content services.

## Guardrails

1. One canonical service per reusable capability.
2. No copy/paste forks without a temporary migration note.
3. Shared Core owns identities, brands, customers, relationships and audit.
4. Work apps own user journeys, not isolated databases.
5. Existing production routes stay active until replacements are verified.
6. New features must declare their owning work app and shared data/service dependencies.

## Next extraction order

1. Finance transaction + receipt/document model.
2. Finance intake UI and bank import.
3. Profitability / cashflow views.
4. Shared media asset model.
5. Reels + YouTube production flow.
6. Shared tasks / automation primitives.
7. Global search and Nexus feedback loop.
