-- Nexus AI governed actions must preserve the customer's brand all the way
-- from draft creation to the existing send_personal executor. Without this,
-- live execution falls back to AGENTIC_DEFAULT_BRAND_ID and can use the wrong
-- sender identity for cross-brand CRM work.

alter table public.agentic_drafts
  add column if not exists brand_id text;
