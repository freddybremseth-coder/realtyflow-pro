-- Refine outbound autonomy: automate research/preparation while keeping cold outreach and mass engagement blocked.

insert into public.nexus_autonomy_policies
  (action_class, mode, min_confidence, daily_limit, conditions, rationale, updated_at)
values
  ('company_research', 'auto', 0.00, 100, '{"company_level_only":true,"personal_data":false}'::jsonb,
   'Public company-level research is read-only and can run autonomously.', now()),
  ('official_channel_discovery', 'auto', 0.00, 100, '{"official_company_channels_only":true,"personal_contact_enrichment":false}'::jsonb,
   'Nexus may discover official role-based company channels and contact pages without starting outreach.', now()),
  ('outreach_draft', 'auto', 0.70, 50, '{"send":false,"verified_evidence_required":true}'::jsonb,
   'Drafting a tailored outbound message is internal preparation and may run automatically when evidence is verified.', now()),
  ('existing_lead_followup', 'guarded_auto', 0.85, 50, '{"existing_relationship_required":true,"suppression_check":true}'::jsonb,
   'Follow-up to an existing lead can be automated when relationship, sender and suppression state are verified.', now()),
  ('requested_information_send', 'guarded_auto', 0.90, 50, '{"recipient_requested_material":true,"verified_asset":true}'::jsonb,
   'Requested information may be sent autonomously when the recipient request and asset are verified.', now()),
  ('inbound_social_reply', 'guarded_auto', 0.92, 20, '{"inbound_message_required":true,"verified_capability":true,"low_risk_only":true}'::jsonb,
   'Low-risk replies to inbound social messages may be automated only when the platform capability and conversation context are verified.', now()),
  ('warm_signal_dm', 'approval', 0.85, 20, '{"documented_warm_signal_required":true,"no_bulk_send":true}'::jsonb,
   'A documented warm signal can justify a prepared DM, but a person must approve the first outbound message.', now()),
  ('external_engagement_recommendation', 'auto', 0.00, 50, '{"recommendation_only":true}'::jsonb,
   'Nexus may rank external posts and suggest meaningful engagement opportunities without interacting with the platform.', now()),
  ('external_comment_post', 'approval', 0.90, 20, '{"human_review_required":true,"no_generic_comment":true}'::jsonb,
   'Posting a comment on another account remains human-approved so brand voice and platform context are reviewed.', now()),
  ('mass_engagement', 'blocked', 1.00, 0, '{}'::jsonb,
   'Bulk likes, repetitive comments and bot-like engagement remain blocked.', now()),
  ('cold_promotional_email', 'blocked', 1.00, 0, '{}'::jsonb,
   'Unsolicited promotional email remains blocked; Nexus may research and draft but must not send it autonomously.', now())
on conflict (action_class) do update
set mode = excluded.mode,
    min_confidence = excluded.min_confidence,
    daily_limit = excluded.daily_limit,
    conditions = excluded.conditions,
    rationale = excluded.rationale,
    updated_at = now();
