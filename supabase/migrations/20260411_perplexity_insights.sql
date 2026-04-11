-- Add perplexity_insights column to market_data_snapshots
ALTER TABLE market_data_snapshots
  ADD COLUMN IF NOT EXISTS perplexity_insights JSONB DEFAULT '[]';
