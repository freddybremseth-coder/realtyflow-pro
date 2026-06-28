-- DemoSites asset storage
-- Creates a public bucket for temporary demo logos and images.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'demosites-assets',
  'demosites-assets',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public read DemoSites assets" ON storage.objects;

CREATE POLICY "Public read DemoSites assets"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'demosites-assets');
