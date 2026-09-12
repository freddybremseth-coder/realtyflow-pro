-- Pin every remaining public function reported by Supabase lint 0011 to an
-- empty search path. Built-in pg_catalog functions remain resolvable, while
-- all project-owned function calls in these bodies are already schema-qualified.

alter function public.set_social_intelligence_updated_at()
  set search_path = '';

alter function public.set_chatgenius_services_updated_at()
  set search_path = '';

alter function public.normalize_property_place_text(text)
  set search_path = '';

alter function public.derive_property_town(text, text, text, text, text, text)
  set search_path = '';

alter function public.set_canonical_property_town()
  set search_path = '';

alter function public.invalidate_property_conversion_editorial()
  set search_path = '';
