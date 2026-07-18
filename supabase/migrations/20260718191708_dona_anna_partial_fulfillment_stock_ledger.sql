-- Operational order fulfillment for Doña Anna. Inventory remains an immutable
-- movement ledger; this migration adds idempotent partial receipts/shipments,
-- lot release enforcement, reliable cost capture, and a server-only ledger RPC.

alter table inventory.movements
  add column if not exists external_reference text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists inventory_movements_correlation_idx
  on inventory.movements (workspace_id, correlation_id, occurred_at desc)
  where correlation_id is not null;

-- Quarantined, blocked, recalled, planned, and depleted lots remain physically
-- on hand, but cannot be promised or shipped until explicitly released.
create or replace view inventory.available_stock
with (security_invoker = true)
as
select
  balances.workspace_id,
  balances.owner_organization_id,
  balances.warehouse_id,
  balances.product_id,
  balances.lot_id,
  balances.on_hand,
  coalesce(reserved.reserved_quantity, 0)::numeric(18,4) as reserved,
  case
    when balances.lot_id is not null and coalesce(lot.status, 'blocked') <> 'released'
      then 0::numeric(18,4)
    else (balances.on_hand - coalesce(reserved.reserved_quantity, 0))::numeric(18,4)
  end as available,
  balances.average_receipt_cost,
  balances.last_movement_at
from inventory.stock_balances balances
left join inventory.lots lot on lot.id = balances.lot_id
left join (
  select workspace_id, warehouse_id, product_id, lot_id, sum(quantity) as reserved_quantity
  from inventory.reservations
  where status = 'active' and (expires_at is null or expires_at > now())
  group by workspace_id, warehouse_id, product_id, lot_id
) reserved
  on reserved.workspace_id = balances.workspace_id
 and reserved.warehouse_id = balances.warehouse_id
 and reserved.product_id = balances.product_id
 and reserved.lot_id is not distinct from balances.lot_id;

create or replace function commerce.ensure_order_commissions(p_order_id uuid)
returns void
language plpgsql
security invoker
set search_path = commerce, pg_temp
as $$
declare
  order_row commerce.orders%rowtype;
  line_row commerce.order_lines%rowtype;
  rule_row commerce.commission_rules%rowtype;
  paid_value numeric(18,2);
  basis_value numeric(18,2);
  commission_value numeric(18,2);
  earned_now boolean;
begin
  select * into order_row from commerce.orders where id = p_order_id;
  if not found or order_row.status <> 'fulfilled'
    or order_row.commission_rule_id is null or order_row.sales_rep_party_id is null then
    return;
  end if;

  select * into rule_row
  from commerce.commission_rules
  where id = order_row.commission_rule_id
    and workspace_id = order_row.workspace_id
    and active
    and (applies_to_channel = 'all' or applies_to_channel = order_row.sales_channel)
    and valid_from <= order_row.ordered_at::date
    and (valid_to is null or valid_to >= order_row.ordered_at::date);
  if not found then return; end if;

  select coalesce(sum(amount), 0) into paid_value
  from commerce.order_payments
  where order_id = order_row.id and status = 'captured';
  earned_now := rule_row.payable_event = 'fulfilled'
    or (rule_row.payable_event = 'paid' and paid_value >= order_row.total);

  if rule_row.rule_type = 'fixed' then
    insert into commerce.commission_entries (
      workspace_id, order_id, beneficiary_party_id, rule_id, basis_amount,
      amount, currency, status, earned_at
    ) values (
      order_row.workspace_id, order_row.id, order_row.sales_rep_party_id,
      rule_row.id, order_row.total, coalesce(rule_row.fixed_amount, 0),
      order_row.currency, case when earned_now then 'earned' else 'pending' end,
      case when earned_now then now() else null end
    ) on conflict (order_id, order_line_id, beneficiary_party_id) do nothing;
    return;
  end if;

  for line_row in
    select * from commerce.order_lines where order_id = order_row.id order by position
  loop
    basis_value := case when rule_row.rule_type = 'margin_percent'
      then greatest(line_row.line_net - round(line_row.quantity * line_row.unit_cost, 2), 0)
      else line_row.line_net end;
    commission_value := round(basis_value * coalesce(rule_row.percentage, 0) / 100, 2);
    insert into commerce.commission_entries (
      workspace_id, order_id, order_line_id, beneficiary_party_id, rule_id,
      basis_amount, amount, currency, status, earned_at
    ) values (
      order_row.workspace_id, order_row.id, line_row.id, order_row.sales_rep_party_id,
      rule_row.id, basis_value, commission_value, order_row.currency,
      case when earned_now then 'earned' else 'pending' end,
      case when earned_now then now() else null end
    ) on conflict (order_id, order_line_id, beneficiary_party_id) do nothing;
  end loop;
end;
$$;

create or replace function public.donaanna_fulfill_order(
  p_order_id uuid,
  p_payload jsonb,
  p_actor_email text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, commerce, inventory, integrations, pg_temp
as $$
declare
  order_row commerce.orders%rowtype;
  line_row commerce.order_lines%rowtype;
  product_row commerce.products%rowtype;
  requested_line jsonb;
  event_id uuid := nullif(p_payload->>'idempotencyKey', '')::uuid;
  occurred_value timestamptz := coalesce(nullif(p_payload->>'occurredAt', '')::timestamptz, now());
  lot_value uuid;
  quantity_value numeric(18,4);
  remaining_value numeric(18,4);
  on_hand_value numeric(18,4);
  available_value numeric(18,4);
  reserved_line_value numeric(18,4);
  stock_cost_value numeric(18,4);
  movement_cost_value numeric(18,4);
  weighted_line_cost numeric(18,4);
  movement_sign integer;
  movement_kind text;
  all_fulfilled boolean;
  processed_count integer := 0;
begin
  if event_id is null then raise exception 'Idempotency key is required'; end if;
  if jsonb_typeof(coalesce(p_payload->'lines', '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_payload->'lines', '[]'::jsonb)) = 0 then
    raise exception 'At least one fulfillment line is required';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_payload->'lines') item
    group by item->>'orderLineId' having count(*) > 1
  ) then
    raise exception 'Each order line can occur only once per fulfillment';
  end if;

  select * into order_row from commerce.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;

  if exists (
    select 1 from inventory.movements
    where workspace_id = order_row.workspace_id
      and source_type = 'order' and source_id = order_row.id
      and correlation_id = event_id
  ) then
    return jsonb_build_object(
      'order', to_jsonb(order_row), 'eventId', event_id, 'idempotent', true
    );
  end if;

  if order_row.warehouse_id is null then raise exception 'An order warehouse is required'; end if;
  perform 1 from inventory.warehouses
  where id = order_row.warehouse_id and workspace_id = order_row.workspace_id and status = 'active';
  if not found then raise exception 'Order warehouse must be active'; end if;

  if order_row.order_type in ('purchase', 'intercompany_purchase') then
    if order_row.status not in ('confirmed', 'partially_fulfilled') then
      raise exception 'Purchase order must be confirmed before receipt';
    end if;
    movement_sign := 1;
    movement_kind := 'receipt';
  elsif order_row.order_type in ('sale', 'intercompany_sale') then
    if order_row.status not in ('reserved', 'partially_fulfilled') then
      raise exception 'Outbound order must be reserved before shipment';
    end if;
    movement_sign := -1;
    movement_kind := 'shipment';
  elsif order_row.order_type = 'pos' then
    if order_row.status not in ('confirmed', 'reserved', 'partially_fulfilled') then
      raise exception 'POS order must be confirmed before shipment';
    end if;
    movement_sign := -1;
    movement_kind := 'shipment';
  else
    raise exception 'Unsupported order type';
  end if;

  -- Lock every order line once in deterministic order. The order lock serializes
  -- two operations on one order; advisory stock locks serialize different orders.
  perform 1 from commerce.order_lines
  where order_id = order_row.id order by id for update;

  for requested_line in
    select item.value
    from jsonb_array_elements(p_payload->'lines') item(value)
    left join commerce.order_lines candidate
      on candidate.id = nullif(item.value->>'orderLineId', '')::uuid
    order by candidate.product_id,
      coalesce(nullif(item.value->>'lotId', '')::uuid, candidate.lot_id), candidate.id
  loop
    select * into line_row
    from commerce.order_lines
    where id = nullif(requested_line->>'orderLineId', '')::uuid
      and order_id = order_row.id and workspace_id = order_row.workspace_id;
    if not found then raise exception 'Fulfillment line does not belong to order'; end if;

    quantity_value := nullif(requested_line->>'quantity', '')::numeric;
    remaining_value := line_row.quantity - line_row.fulfilled_quantity;
    if quantity_value is null or quantity_value <= 0 or quantity_value > remaining_value then
      raise exception 'Fulfillment quantity for line % must be between 0 and %', line_row.position, remaining_value;
    end if;

    select * into product_row from commerce.products
    where id = line_row.product_id and workspace_id = order_row.workspace_id and active;
    if not found then raise exception 'Product on line % is unavailable', line_row.position; end if;
    lot_value := coalesce(nullif(requested_line->>'lotId', '')::uuid, line_row.lot_id);
    if product_row.track_lots and lot_value is null then
      raise exception 'Lot is required for %', product_row.name;
    end if;
    if lot_value is not null then
      perform 1 from inventory.lots
      where id = lot_value and workspace_id = order_row.workspace_id
        and product_id = line_row.product_id
        and (
          (movement_sign = 1 and status in ('planned', 'quarantine', 'released'))
          or (movement_sign = -1 and status = 'released')
        );
      if not found then
        raise exception 'Lot for % is unavailable for this transaction', product_row.name;
      end if;
    end if;

    perform pg_advisory_xact_lock(hashtextextended(
      order_row.warehouse_id::text || ':' || line_row.product_id::text || ':' || coalesce(lot_value::text, ''), 0
    ));

    if movement_sign = -1 then
      select coalesce(sum(on_hand), 0), coalesce(sum(available), 0),
        coalesce(
          sum(on_hand * average_receipt_cost) / nullif(sum(on_hand), 0),
          0
        )::numeric(18,4)
      into on_hand_value, available_value, stock_cost_value
      from inventory.available_stock
      where workspace_id = order_row.workspace_id
        and owner_organization_id is not distinct from order_row.seller_organization_id
        and warehouse_id = order_row.warehouse_id
        and product_id = line_row.product_id
        and lot_id is not distinct from lot_value;
      if order_row.order_type in ('sale', 'intercompany_sale') then
        select coalesce(sum(quantity), 0) into reserved_line_value
        from inventory.reservations
        where order_line_id = line_row.id and warehouse_id = order_row.warehouse_id
          and lot_id is not distinct from lot_value and status = 'active'
          and quantity >= quantity_value;
        if reserved_line_value < quantity_value then
          raise exception 'Active reservation is missing for %', product_row.name;
        end if;
        if on_hand_value < quantity_value then
          raise exception 'Insufficient physical stock for %: on hand %, required %',
            product_row.name, on_hand_value, quantity_value;
        end if;
      elsif available_value < quantity_value then
        raise exception 'Insufficient available stock for %: available %, required %',
          product_row.name, available_value, quantity_value;
      end if;
      movement_cost_value := coalesce(nullif(stock_cost_value, 0), line_row.unit_cost, 0);
    else
      movement_cost_value := case when line_row.unit_cost > 0 then line_row.unit_cost else line_row.unit_price end;
    end if;

    insert into inventory.movements (
      workspace_id, owner_organization_id, product_id, lot_id, warehouse_id,
      movement_type, quantity, unit_cost, currency, source_type, source_id,
      correlation_id, idempotency_key, external_reference, reason, metadata,
      occurred_at, created_by_email
    ) values (
      order_row.workspace_id,
      case when movement_sign = 1 then order_row.buyer_organization_id else order_row.seller_organization_id end,
      line_row.product_id, lot_value, order_row.warehouse_id, movement_kind,
      movement_sign * quantity_value, movement_cost_value, order_row.currency,
      'order', order_row.id, event_id,
      'order-fulfillment:' || event_id::text || ':' || line_row.id::text,
      nullif(trim(p_payload->>'reference'), ''),
      case when movement_sign = 1 then 'Varemottak ' else 'Levering ' end || order_row.order_number,
      jsonb_build_object(
        'orderId', order_row.id,
        'orderLineId', line_row.id,
        'orderNumber', order_row.order_number,
        'notes', nullif(trim(p_payload->>'notes'), '')
      ),
      occurred_value, p_actor_email
    );

    weighted_line_cost := case
      when movement_sign = -1 and line_row.fulfilled_quantity + quantity_value > 0
        then round(
          ((line_row.fulfilled_quantity * line_row.unit_cost) + (quantity_value * movement_cost_value))
          / (line_row.fulfilled_quantity + quantity_value), 4
        )
      when movement_sign = 1 and line_row.unit_cost = 0 then movement_cost_value
      else line_row.unit_cost
    end;
    update commerce.order_lines
    set fulfilled_quantity = fulfilled_quantity + quantity_value,
        unit_cost = weighted_line_cost,
        updated_at = now()
    where id = line_row.id;

    if movement_sign = -1 then
      update inventory.reservations
      set quantity = case
            when quantity - quantity_value <= 0 then quantity
            else quantity - quantity_value
          end,
          status = case when quantity - quantity_value <= 0 then 'committed' else 'active' end,
          updated_at = now()
      where order_line_id = line_row.id and warehouse_id = order_row.warehouse_id
        and lot_id is not distinct from lot_value and status = 'active';
    end if;
    processed_count := processed_count + 1;
  end loop;

  if processed_count = 0 then raise exception 'No fulfillment lines were processed'; end if;
  select bool_and(fulfilled_quantity >= quantity) into all_fulfilled
  from commerce.order_lines where order_id = order_row.id;
  update commerce.orders
  set status = case when all_fulfilled then 'fulfilled' else 'partially_fulfilled' end,
      updated_at = now()
  where id = order_row.id returning * into order_row;

  if all_fulfilled then perform commerce.ensure_order_commissions(order_row.id); end if;

  insert into commerce.audit_events (
    workspace_id, actor_email, action, resource_type, resource_id, after_data, metadata
  ) values (
    order_row.workspace_id, p_actor_email,
    case when movement_sign = 1 then 'order_received' else 'order_shipped' end,
    'order', order_row.id, to_jsonb(order_row),
    jsonb_build_object('eventId', event_id, 'lineCount', processed_count,
      'reference', nullif(trim(p_payload->>'reference'), ''))
  );
  insert into integrations.outbox_events (
    workspace_id, aggregate_type, aggregate_id, event_type, payload
  ) values (
    order_row.workspace_id, 'order', order_row.id,
    case when movement_sign = 1 then 'order.received' else 'order.shipped' end,
    jsonb_build_object('orderId', order_row.id, 'orderNumber', order_row.order_number,
      'eventId', event_id, 'status', order_row.status)
  );
  return jsonb_build_object(
    'order', to_jsonb(order_row), 'eventId', event_id, 'idempotent', false
  );
end;
$$;

create or replace function public.donaanna_stock_activity(
  p_workspace_slug text default 'dona-anna',
  p_limit integer default 200
)
returns jsonb
language sql
stable
security invoker
set search_path = public, commerce, inventory, pg_temp
as $$
  select coalesce(jsonb_agg(to_jsonb(activity) order by activity.occurred_at desc, activity.created_at desc), '[]'::jsonb)
  from (
    select
      movement.id,
      movement.workspace_id,
      movement.owner_organization_id,
      movement.product_id,
      product.sku,
      product.name as product_name,
      movement.lot_id,
      lot.lot_number,
      movement.warehouse_id,
      warehouse.name as warehouse_name,
      movement.movement_type,
      movement.quantity,
      movement.unit_cost,
      movement.currency,
      movement.source_type,
      movement.source_id,
      orders.order_number,
      movement.correlation_id,
      movement.external_reference,
      movement.reason,
      movement.metadata,
      movement.occurred_at,
      movement.created_by_email,
      movement.created_at
    from inventory.movements movement
    join commerce.products product on product.id = movement.product_id
    join inventory.warehouses warehouse on warehouse.id = movement.warehouse_id
    left join inventory.lots lot on lot.id = movement.lot_id
    left join commerce.orders orders
      on movement.source_type = 'order' and orders.id = movement.source_id
    where movement.workspace_id = commerce.workspace_id(p_workspace_slug)
    order by movement.occurred_at desc, movement.created_at desc
    limit least(greatest(coalesce(p_limit, 200), 1), 500)
  ) activity;
$$;

revoke execute on function commerce.ensure_order_commissions(uuid) from public, anon, authenticated;
grant execute on function commerce.ensure_order_commissions(uuid) to service_role;

revoke execute on function public.donaanna_fulfill_order(uuid, jsonb, text) from public, anon, authenticated;
revoke execute on function public.donaanna_stock_activity(text, integer) from public, anon, authenticated;
grant execute on function public.donaanna_fulfill_order(uuid, jsonb, text) to service_role;
grant execute on function public.donaanna_stock_activity(text, integer) to service_role;

notify pgrst, 'reload schema';
