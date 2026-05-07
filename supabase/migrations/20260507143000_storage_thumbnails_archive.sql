-- Storage thumbnails + Google Drive archive tracking

ALTER TABLE user_image_bank ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE content_publications ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE plot_assets ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE ad_creatives ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS archive_status TEXT DEFAULT 'active';
ALTER TABLE songs ADD COLUMN IF NOT EXISTS archive_destination TEXT;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE user_image_bank ADD COLUMN IF NOT EXISTS archive_status TEXT DEFAULT 'active';
ALTER TABLE user_image_bank ADD COLUMN IF NOT EXISTS archive_destination TEXT;
ALTER TABLE user_image_bank ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE content_publications ADD COLUMN IF NOT EXISTS archive_status TEXT DEFAULT 'active';
ALTER TABLE content_publications ADD COLUMN IF NOT EXISTS archive_destination TEXT;
ALTER TABLE content_publications ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE plot_assets ADD COLUMN IF NOT EXISTS archive_status TEXT DEFAULT 'active';
ALTER TABLE plot_assets ADD COLUMN IF NOT EXISTS archive_destination TEXT;
ALTER TABLE plot_assets ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE ad_creatives ADD COLUMN IF NOT EXISTS archive_status TEXT DEFAULT 'active';
ALTER TABLE ad_creatives ADD COLUMN IF NOT EXISTS archive_destination TEXT;
ALTER TABLE ad_creatives ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

INSERT INTO storage.buckets (id, name, public)
VALUES ('thumbnails', 'thumbnails', true)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public read thumbnails') THEN
    CREATE POLICY "Public read thumbnails" ON storage.objects FOR SELECT USING (bucket_id = 'thumbnails');
  END IF;
END $$;
