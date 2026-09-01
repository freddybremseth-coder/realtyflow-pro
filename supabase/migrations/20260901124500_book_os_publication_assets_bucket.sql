-- Book OS phase 6.1: private immutable publication artifact storage.
-- Files are uploaded through short-lived signed upload tokens issued only by
-- the admin API. Canonical catalogue rows are created only after checksum
-- verification in the package-ingest finalize step.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'publishing-assets',
  'publishing-assets',
  false,
  104857600,
  array[
    'application/epub+zip',
    'application/zip',
    'application/pdf',
    'application/json',
    'application/octet-stream',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/plain',
    'text/csv'
  ]::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- No broad storage.objects grants are changed here. The bucket remains private;
-- uploads are authorized per object with a short-lived server-generated token.
