create or replace function public.sync_email_admission_review_work_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_id text := 'email-admission:' || new.account_id::text || ':' || new.external_message_id;
  v_priority text;
  v_score integer;
begin
  if new.admission_status = 'review' and not new.is_historical then
    v_priority := case
      when coalesce(new.subject,'') ~* '(visning|viewing|bolig|property|kjøp|buy|reservation|verdivurdering)' then 'HIGH'
      else 'MEDIUM'
    end;
    v_score := case when v_priority = 'HIGH' then 85 else 70 end;

    if not exists (
      select 1 from public.work_items
      where source_type = 'ai_agent' and source_id = v_source_id
    ) then
      insert into public.work_items(
        title,description,status,priority,due_date,brand_id,source_type,source_id,
        assigned_agent,next_action,ai_score,metadata,created_at,updated_at
      ) values (
        'Review mulig kunde-e-post: ' || coalesce(nullif(new.from_name,''), new.from_address),
        left('Fra: ' || new.from_address || E'\nEmne: ' || coalesce(new.subject,'(uten emne)'),1600),
        'TO_DO',v_priority,current_date,new.brand_id,'ai_agent',v_source_id,
        'nexus_communications',
        'Avklar om avsenderen er en kunde. Koble eller opprett riktig kontakt; Nexus promoterer deretter e-posten automatisk.',
        v_score,
        jsonb_build_object(
          'kind','email_admission_review',
          'account_id',new.account_id,
          'brand_id',new.brand_id,
          'external_message_id',new.external_message_id,
          'from_address',new.from_address,
          'from_name',new.from_name,
          'subject',new.subject,
          'admission_reason',new.admission_reason,
          'received_at',new.received_at,
          'performed_by','Nexus Customer Email Admission'
        ),now(),now()
      );
    end if;
  elsif new.admission_status = 'promoted' then
    update public.work_items
      set status='DONE',
          next_action='Avsenderen er identifisert og e-posten er promotert til kundekommunikasjon. Nexus fortsetter automatisk.',
          metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
            'admission_promoted_at',now(),
            'crm_contact_id',new.crm_contact_id,
            'promoted_email_message_id',new.promoted_email_message_id
          ),
          updated_at=now()
    where source_type='ai_agent'
      and source_id=v_source_id
      and status in ('TO_DO','IN_PROGRESS','REVIEW');
  elsif new.admission_status = 'filtered' then
    update public.work_items
      set status='CANCELLED',
          next_action='Meldingen er klassifisert som ikke-kunde og er filtrert ut av kundekommunikasjonen.',
          updated_at=now()
    where source_type='ai_agent'
      and source_id=v_source_id
      and status in ('TO_DO','IN_PROGRESS','REVIEW');
  end if;
  return new;
end;
$$;

revoke all on function public.sync_email_admission_review_work_item() from public;

drop trigger if exists trg_email_admission_review_work_item on public.email_admission_queue;
create trigger trg_email_admission_review_work_item
after insert or update of admission_status,crm_contact_id,promoted_email_message_id
on public.email_admission_queue
for each row execute function public.sync_email_admission_review_work_item();

insert into public.work_items(
  title,description,status,priority,due_date,brand_id,source_type,source_id,
  assigned_agent,next_action,ai_score,metadata,created_at,updated_at
)
select
  'Review mulig kunde-e-post: ' || coalesce(nullif(q.from_name,''),q.from_address),
  left('Fra: ' || q.from_address || E'\nEmne: ' || coalesce(q.subject,'(uten emne)'),1600),
  'TO_DO',
  case when coalesce(q.subject,'') ~* '(visning|viewing|bolig|property|kjøp|buy|reservation|verdivurdering)' then 'HIGH' else 'MEDIUM' end,
  current_date,q.brand_id,'ai_agent','email-admission:' || q.account_id::text || ':' || q.external_message_id,
  'nexus_communications',
  'Avklar om avsenderen er en kunde. Koble eller opprett riktig kontakt; Nexus promoterer deretter e-posten automatisk.',
  case when coalesce(q.subject,'') ~* '(visning|viewing|bolig|property|kjøp|buy|reservation|verdivurdering)' then 85 else 70 end,
  jsonb_build_object('kind','email_admission_review','account_id',q.account_id,'brand_id',q.brand_id,'external_message_id',q.external_message_id,'from_address',q.from_address,'from_name',q.from_name,'subject',q.subject,'admission_reason',q.admission_reason,'received_at',q.received_at,'performed_by','Nexus Customer Email Admission'),
  now(),now()
from public.email_admission_queue q
where q.admission_status='review' and not q.is_historical
  and not exists (
    select 1 from public.work_items w
    where w.source_type='ai_agent'
      and w.source_id='email-admission:' || q.account_id::text || ':' || q.external_message_id
  );
