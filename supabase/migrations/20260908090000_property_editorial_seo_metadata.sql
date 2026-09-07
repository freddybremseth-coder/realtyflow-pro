-- SEO-metadata for den norske property-editorial-pipelinen.
-- Additive felter på properties. Genereres deterministisk i samme editorial-jobb
-- (samme source hash, ingen eget AI-kall). Uten branding – Next-appen legger på
-- "| Zen Eco Homes". Disse er OUTPUT-felter og står bevisst UTENFOR trigger-
-- listen queue_property_editorial_job, slik at workerens egne skriv ikke looper.

alter table public.properties
  add column if not exists meta_title_no text,
  add column if not exists meta_description_no text;

comment on column public.properties.meta_title_no is
  'Deterministisk, faktabasert norsk SEO-tittel (uten branding). Kilde: property-editorial-pipeline.';
comment on column public.properties.meta_description_no is
  'Deterministisk, faktabasert norsk SEO meta-description (ca. 130-160 tegn). Kilde: property-editorial-pipeline.';
