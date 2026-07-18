-- Supabase default privileges may grant service_role every table privilege.
-- Settlement events are append-only even for the application server: trusted
-- writes can select and insert, while corrections require compensating events.
revoke all on
  public.billing_credit_allocations,
  public.billing_refunds,
  public.billing_refund_allocations
from service_role;

grant select, insert on
  public.billing_credit_allocations,
  public.billing_refunds,
  public.billing_refund_allocations
to service_role;
