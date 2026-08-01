-- Enable the production Voice Studio formats in the existing Media Studio bucket.
-- Additive migration; safe to run after 20260801133000_ai_media_studio.sql.

update storage.buckets
set
  public = true,
  file_size_limit = 524288000,
  allowed_mime_types = array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'audio/mpeg',
    'audio/wav',
    'audio/mp4',
    'audio/aac',
    'audio/flac',
    'audio/ogg',
    'audio/L16'
  ]
where id = 'media-studio';

insert into public.media_templates (
  organization_id,
  name,
  category,
  media_type,
  default_prompt_blocks,
  default_aspect_ratio,
  default_quality_tier,
  default_provider_preference,
  required_inputs,
  optional_inputs,
  is_system,
  metadata_json
)
values (
  null,
  'Profesjonell voice-over',
  'voice',
  'voice',
  '{"PURPOSE":"professional voice-over","STYLE":"natural, warm, credible and easy to understand"}'::jsonb,
  null,
  'balanced',
  'openai',
  array['script'],
  array['language','voice','tone','speed','outputFormat','brand'],
  true,
  '{"slug":"professional-voice-over"}'::jsonb
)
on conflict (organization_id, name) do update set
  active = true,
  default_provider_preference = excluded.default_provider_preference,
  default_prompt_blocks = excluded.default_prompt_blocks,
  required_inputs = excluded.required_inputs,
  optional_inputs = excluded.optional_inputs,
  updated_at = now();

notify pgrst, 'reload schema';
