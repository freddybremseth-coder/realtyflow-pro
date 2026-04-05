-- Add commission tracking fields to contacts table
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS sale_price REAL;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS commission_amount REAL;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS commission_percent REAL;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS commission_paid_date TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS brand_id TEXT DEFAULT 'soleada';
