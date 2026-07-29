-- Enable RLS on exposed public tables that previously bypassed row protection.

alter table if exists public.engagement_snapshots enable row level security;
alter table if exists public.scheduling_insights enable row level security;
alter table if exists public.chatbot_sessions enable row level security;

drop policy if exists "Public can read engagement snapshots" on public.engagement_snapshots;
create policy "Public can read engagement snapshots"
on public.engagement_snapshots
for select
to anon, authenticated
using (true);

drop policy if exists "Public can read scheduling insights" on public.scheduling_insights;
create policy "Public can read scheduling insights"
on public.scheduling_insights
for select
to anon, authenticated
using (true);

drop policy if exists "Deny direct API access to chatbot sessions" on public.chatbot_sessions;
create policy "Deny direct API access to chatbot sessions"
on public.chatbot_sessions
for all
to anon, authenticated
using (false)
with check (false);
