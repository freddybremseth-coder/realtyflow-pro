-- Keep public trace reads open for published QR pages, but owner-lock writes.

do $$
declare
  owner_user_id uuid;
begin
  if to_regclass('public.public_trace_batches') is not null then
    alter table public.public_trace_batches
      add column if not exists created_by uuid references auth.users(id) on delete set null;

    alter table public.public_trace_batches
      alter column created_by set default auth.uid();

    select id into owner_user_id
    from auth.users
    where lower(email) = 'freddy.bremseth@gmail.com'
    order by created_at
    limit 1;

    if owner_user_id is not null then
      update public.public_trace_batches
      set created_by = owner_user_id
      where created_by is null;
    end if;

    alter table public.public_trace_batches enable row level security;

    drop policy if exists "Authenticated can insert trace batches" on public.public_trace_batches;
    drop policy if exists "Authenticated can update trace batches" on public.public_trace_batches;
    drop policy if exists "Authenticated can delete trace batches" on public.public_trace_batches;
    drop policy if exists "Public can read published trace batches" on public.public_trace_batches;

    create policy "Public can read published trace batches"
      on public.public_trace_batches
      for select
      to anon, authenticated
      using (status = 'published');

    create policy "Authenticated can insert own trace batches"
      on public.public_trace_batches
      for insert
      to authenticated
      with check (created_by = auth.uid());

    create policy "Authenticated can update own trace batches"
      on public.public_trace_batches
      for update
      to authenticated
      using (created_by = auth.uid())
      with check (created_by = auth.uid());

    create policy "Authenticated can delete own trace batches"
      on public.public_trace_batches
      for delete
      to authenticated
      using (created_by = auth.uid());
  end if;
end $$;
