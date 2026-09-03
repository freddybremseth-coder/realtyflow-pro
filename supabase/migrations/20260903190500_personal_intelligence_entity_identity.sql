-- Personal Intelligence OS — stable canonical entity identity for private alpha.

create unique index if not exists personal_core_entities_owner_type_canonical_uidx
on personal_core.entities(owner_user_id, entity_type, canonical_name)
where canonical_name is not null;

comment on index personal_core.personal_core_entities_owner_type_canonical_uidx
is 'Prevents duplicate canonical entity identities per owner and entity type.';

notify pgrst, 'reload schema';
