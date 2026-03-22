-- ============================================================================
-- 012_saas_build_queue.sql
-- Add build_prompt column and queued_for_build status to saas_opportunities
-- ============================================================================

-- Add build_prompt column to store the generated build prompt
ALTER TABLE saas_opportunities ADD COLUMN IF NOT EXISTS build_prompt TEXT;

-- Drop the existing status check constraint and recreate with queued_for_build
ALTER TABLE saas_opportunities DROP CONSTRAINT IF EXISTS saas_opportunities_status_check;
ALTER TABLE saas_opportunities ADD CONSTRAINT saas_opportunities_status_check
  CHECK (status IN (
    'discovered',
    'investigating',
    'refining',
    'approved',
    'queued_for_build',
    'building',
    'deployed',
    'testing',
    'live',
    'rejected',
    'archived'
  ));
