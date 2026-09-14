create or replace function public.normalize_marketing_metrics_snapshot_engagement()
returns trigger
language plpgsql
as $$
begin
  if new.event_type = 'metrics_snapshot' and lower(coalesce(new.channel, '')) = 'instagram' then
    new.metrics := coalesce(new.metrics, '{}'::jsonb)
      || case
           when jsonb_typeof(new.metadata #> '{observed,likes}') = 'number'
           then jsonb_build_object('reactions', new.metadata #> '{observed,likes}')
           else '{}'::jsonb
         end
      || case
           when jsonb_typeof(new.metadata #> '{observed,comments}') = 'number'
           then jsonb_build_object('comments', new.metadata #> '{observed,comments}')
           else '{}'::jsonb
         end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_normalize_marketing_metrics_snapshot_engagement on public.marketing_events;
create trigger trg_normalize_marketing_metrics_snapshot_engagement
before insert or update of metrics, metadata, event_type, channel
on public.marketing_events
for each row
execute function public.normalize_marketing_metrics_snapshot_engagement();

update public.marketing_events
set metrics = coalesce(metrics, '{}'::jsonb)
  || case
       when jsonb_typeof(metadata #> '{observed,likes}') = 'number'
       then jsonb_build_object('reactions', metadata #> '{observed,likes}')
       else '{}'::jsonb
     end
  || case
       when jsonb_typeof(metadata #> '{observed,comments}') = 'number'
       then jsonb_build_object('comments', metadata #> '{observed,comments}')
       else '{}'::jsonb
     end
where event_type = 'metrics_snapshot'
  and lower(coalesce(channel, '')) = 'instagram';
