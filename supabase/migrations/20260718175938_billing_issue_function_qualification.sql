-- The function returns a column named `document_id`. Qualify the line-table
-- reference so PL/pgSQL does not confuse that OUT parameter with the column.
create or replace function public.billing_issue_document(
  p_document_id uuid,
  p_actor_email text,
  p_issue_date date default current_date,
  p_expected_version integer default null
)
returns table (document_id uuid, document_number text, content_hash text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  document_row public.billing_documents%rowtype;
  organization_row public.billing_organizations%rowtype;
  customer_row public.billing_customers%rowtype;
  settings_row public.billing_organization_settings%rowtype;
  series_row public.billing_invoice_series%rowtype;
  snapshot_value jsonb;
  hash_value text;
  number_value text;
  prefix_value text;
  previous_record_hash text;
  verifactu_payload jsonb;
  verifactu_hash text;
  default_prefix text;
  line_count integer;
begin
  select * into document_row from public.billing_documents where id = p_document_id for update;
  if not found then raise exception 'Billing document not found'; end if;
  if document_row.locked_at is not null then raise exception 'Billing document is already issued'; end if;
  if p_expected_version is not null and document_row.version <> p_expected_version then
    raise exception 'Billing document was changed by another user';
  end if;
  select count(*) into line_count
  from public.billing_document_lines
  where billing_document_lines.document_id = p_document_id;
  if line_count = 0 then raise exception 'A billing document requires at least one line'; end if;
  if document_row.total <= 0 then raise exception 'A billing document total must be greater than zero'; end if;

  select * into organization_row from public.billing_organizations
  where id = document_row.organization_id and active for update;
  if not found then raise exception 'Billing organization is not active'; end if;
  select * into customer_row from public.billing_customers where id = document_row.customer_id;
  if not found then raise exception 'Billing customer not found'; end if;
  select * into settings_row from public.billing_organization_settings
  where organization_id = document_row.organization_id;

  if document_row.document_type = 'credit_note' then
    if document_row.original_document_id is null or nullif(document_row.rectification_reason, '') is null then
      raise exception 'A credit note requires an original document and rectification reason';
    end if;
  end if;

  default_prefix := case document_row.document_type
    when 'quote' then 'QUO-' || extract(year from p_issue_date)::integer || '-'
    when 'proforma' then 'PRO-' || extract(year from p_issue_date)::integer || '-'
    when 'credit_note' then organization_row.country_code || '-R-' || extract(year from p_issue_date)::integer || '-'
    else organization_row.country_code || '-' || extract(year from p_issue_date)::integer || '-'
  end;

  insert into public.billing_invoice_series (
    organization_id, document_type, fiscal_year, prefix, padding, next_number
  ) values (
    document_row.organization_id, document_row.document_type,
    extract(year from p_issue_date)::integer, default_prefix, 5, 1
  ) on conflict (organization_id, document_type, fiscal_year) do nothing;

  select * into series_row from public.billing_invoice_series
  where organization_id = document_row.organization_id
    and document_type = document_row.document_type
    and fiscal_year = extract(year from p_issue_date)::integer
    and active
  for update;
  if not found then raise exception 'No active number series is configured'; end if;

  prefix_value := replace(series_row.prefix, '{YYYY}', extract(year from p_issue_date)::integer::text);
  number_value := prefix_value || lpad(series_row.next_number::text, series_row.padding, '0');
  update public.billing_invoice_series
  set next_number = next_number + 1, updated_at = now()
  where id = series_row.id;

  snapshot_value := jsonb_build_object(
    'schemaVersion', 1,
    'document', to_jsonb(document_row) || jsonb_build_object(
      'document_number', number_value,
      'issue_date', p_issue_date,
      'due_date', coalesce(document_row.due_date, p_issue_date + organization_row.payment_terms_days),
      'status', 'issued',
      'balance', document_row.total
    ),
    'seller', to_jsonb(organization_row),
    'customer', to_jsonb(customer_row),
    'settings', coalesce(to_jsonb(settings_row), '{}'::jsonb),
    'lines', coalesce((
      select jsonb_agg(to_jsonb(line_row) order by line_row.position)
      from public.billing_document_lines line_row where line_row.document_id = p_document_id
    ), '[]'::jsonb),
    'issuedAt', now(),
    'issuedBy', p_actor_email
  );
  hash_value := encode(digest(convert_to(snapshot_value::text, 'UTF8'), 'sha256'), 'hex');

  insert into public.billing_document_snapshots (
    organization_id, document_id, snapshot, content_hash, template_version
  ) values (
    document_row.organization_id, p_document_id, snapshot_value, hash_value,
    coalesce(settings_row.template_version, 1)
  );

  update public.billing_documents set
    document_number = number_value,
    series_id = series_row.id,
    issue_date = p_issue_date,
    due_date = coalesce(due_date, p_issue_date + organization_row.payment_terms_days),
    valid_until = case when document_type = 'quote' then coalesce(valid_until, p_issue_date + coalesce(settings_row.quote_validity_days, 30)) else valid_until end,
    status = 'issued',
    balance = total,
    snapshot_hash = hash_value,
    locked_at = now(),
    updated_at = now()
  where id = p_document_id;

  insert into public.billing_audit_events (
    organization_id, actor_email, action, resource_type, resource_id, after_data, metadata
  ) values (
    document_row.organization_id, p_actor_email, 'document_issued', 'billing_document',
    p_document_id, jsonb_build_object('status', 'issued', 'documentNumber', number_value),
    jsonb_build_object('snapshotHash', hash_value, 'seriesId', series_row.id)
  );

  insert into public.billing_delivery_jobs (organization_id, document_id, job_type)
  values (document_row.organization_id, p_document_id, 'generate_pdf');

  if organization_row.country_code = 'ES' and document_row.document_type in ('invoice', 'credit_note') then
    perform pg_advisory_xact_lock(hashtextextended(document_row.organization_id::text || ':verifactu', 0));
    select record_hash into previous_record_hash
    from public.billing_verifactu_records
    where organization_id = document_row.organization_id
    order by created_at desc, id desc limit 1;
    verifactu_payload := jsonb_build_object(
      'documentId', p_document_id,
      'documentNumber', number_value,
      'issueDate', p_issue_date,
      'sellerVatNumber', organization_row.vat_number,
      'customerVatNumber', customer_row.vat_number,
      'total', document_row.total,
      'taxTotal', document_row.tax_total,
      'currency', document_row.currency,
      'snapshotHash', hash_value,
      'previousHash', previous_record_hash,
      'software', jsonb_build_object('name', 'RealtyFlow Pro', 'schemaVersion', 1)
    );
    verifactu_hash := encode(digest(convert_to(coalesce(previous_record_hash, '') || verifactu_payload::text, 'UTF8'), 'sha256'), 'hex');
    insert into public.billing_verifactu_records (
      organization_id, document_id, event_type, previous_hash, record_hash, payload
    ) values (
      document_row.organization_id, p_document_id,
      case when document_row.document_type = 'credit_note' then 'rectification' else 'registration' end,
      previous_record_hash, verifactu_hash, verifactu_payload
    );
    insert into public.billing_delivery_jobs (organization_id, document_id, job_type)
    values (document_row.organization_id, p_document_id, 'submit_verifactu');
  end if;

  if document_row.document_type = 'credit_note' then
    update public.billing_documents set status = 'credited', updated_at = now()
    where id = document_row.original_document_id and locked_at is not null;
  end if;

  return query select p_document_id, number_value, hash_value;
end;
$$;

revoke all on function public.billing_issue_document(uuid, text, date, integer)
from public, anon, authenticated;
grant execute on function public.billing_issue_document(uuid, text, date, integer)
to service_role;
