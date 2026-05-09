-- Add attendance tracking to work_items so booking admins can record outcomes
-- (attended / no-show / cancelled). Used by /api/booking-stats for KPI rollups.

ALTER TABLE work_items
  ADD COLUMN IF NOT EXISTS attendance text
    CHECK (attendance IS NULL OR attendance IN ('attended','no_show','cancelled'));

CREATE INDEX IF NOT EXISTS idx_work_items_attendance
  ON work_items (attendance)
  WHERE attendance IS NOT NULL;
