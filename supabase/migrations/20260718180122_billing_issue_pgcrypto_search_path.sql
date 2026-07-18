-- Supabase installs pgcrypto in the `extensions` schema. The issuance function
-- calls digest() while keeping a fixed search path, so include that trusted
-- extension schema explicitly.
alter function public.billing_issue_document(uuid, text, date, integer)
  set search_path = public, extensions;
