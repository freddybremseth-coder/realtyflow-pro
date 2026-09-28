-- Freddy's adaptive 5-minute Spanish learning track.
-- Mapping creates learning topics only. Mastery remains unknown until real evidence arrives.

with owner as (
  select owner_user_id
  from personal_core.entities
  where entity_type = 'person'
    and canonical_name = 'freddy_bremseth'
  limit 1
)
insert into knowledge.domains (owner_user_id, name, description)
select owner_user_id,
       'Spanish Language',
       'Adaptive Spanish learning track for practical everyday use in Spain, connected to Spanish ChatGenius.'
from owner
where not exists (
  select 1
  from knowledge.domains d
  where d.owner_user_id = owner.owner_user_id
    and lower(d.name) = lower('Spanish Language')
);

with owner as (
  select owner_user_id
  from personal_core.entities
  where entity_type = 'person'
    and canonical_name = 'freddy_bremseth'
  limit 1
),
domain as (
  select d.id, d.owner_user_id
  from knowledge.domains d
  join owner o on o.owner_user_id = d.owner_user_id
  where lower(d.name) = lower('Spanish Language')
  limit 1
),
seed(name, description, difficulty_band) as (
  values
    ('Practical Conversation', 'Short real-world conversations for daily life in Spain, with active speaking and useful phrases.', 2),
    ('Listening Comprehension', 'Understand natural spoken Spanish, common reductions, everyday speed and context.', 2),
    ('Vocabulary & Active Recall', 'Build high-frequency vocabulary through retrieval practice and spaced review.', 2),
    ('Grammar Patterns', 'Learn grammar as reusable sentence patterns rather than isolated rules.', 2),
    ('Pronunciation & Speaking', 'Improve intelligibility, rhythm and confidence through short spoken production.', 2)
)
insert into knowledge.topics (owner_user_id, domain_id, name, description, difficulty_band, metadata)
select domain.owner_user_id,
       domain.id,
       seed.name,
       seed.description,
       seed.difficulty_band,
       jsonb_build_object(
         'origin', 'owner_requested_spanish_daily5',
         'external_app', 'https://spanish.chatgenius.pro/',
         'learning_contract', 'adaptive_daily_microlearning',
         'mastery_semantics', 'unknown until evidence exists'
       )
from domain
cross join seed
where not exists (
  select 1
  from knowledge.topics t
  where t.owner_user_id = domain.owner_user_id
    and t.domain_id = domain.id
    and lower(t.name) = lower(seed.name)
);
