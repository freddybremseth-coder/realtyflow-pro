-- Extend HUB source types for publishing, KDP and brand-level work.
-- This keeps the operational task engine useful beyond real estate/content.

ALTER TABLE work_items DROP CONSTRAINT IF EXISTS work_items_source_type_check;

ALTER TABLE work_items
  ADD CONSTRAINT work_items_source_type_check
  CHECK (source_type IN (
    'manual',
    'crm',
    'content',
    'automation',
    'ai_agent',
    'website_lead',
    'chatbot',
    'saas',
    'publishing',
    'kdp',
    'brand',
    'property',
    'market_intelligence'
  ));
