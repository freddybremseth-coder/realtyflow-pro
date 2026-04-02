-- Add missing columns to songs table for full Neural Beat support
ALTER TABLE songs ADD COLUMN IF NOT EXISTS style TEXT;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS energy TEXT;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS visual_style TEXT;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS ai_metadata JSONB;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS youtube_video_id TEXT;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- Genre images table for storing AI-generated and curated images per genre
CREATE TABLE IF NOT EXISTS genre_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  genre TEXT NOT NULL,
  image_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_genre_images_genre ON genre_images(genre);
CREATE INDEX IF NOT EXISTS idx_songs_status ON songs(status);
CREATE INDEX IF NOT EXISTS idx_songs_youtube_url ON songs(youtube_url);

-- RLS for genre_images
ALTER TABLE genre_images ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'genre_images' AND policyname = 'genre_images_select_all') THEN
    CREATE POLICY "genre_images_select_all" ON genre_images FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'genre_images' AND policyname = 'genre_images_insert_all') THEN
    CREATE POLICY "genre_images_insert_all" ON genre_images FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'genre_images' AND policyname = 'genre_images_delete_all') THEN
    CREATE POLICY "genre_images_delete_all" ON genre_images FOR DELETE USING (true);
  END IF;
END $$;
