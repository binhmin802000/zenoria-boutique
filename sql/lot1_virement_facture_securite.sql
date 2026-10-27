-- ============================================================
-- LOT 1 — Paiement par virement : facture figee + securite des prix
-- ============================================================

begin;

-- ------------------------------------------------------------
-- A. Colonnes de paiement figees sur la facture
-- ------------------------------------------------------------
alter table public.invoices
  add column if not exists payment_method text,
  add column if not exists paid_at timestamptz;

alter table public.invoices
  drop constraint if exists invoices_payment_method_valid;

alter table public.invoices
  add constraint invoices_payment_method_valid
  check (payment_method is null or payment_method in ('card', 'transfer'));

-- ------------------------------------------------------------
-- B. issue_invoice_for_order : remplit desormais payment_method et
--    paid_at a l'insertion, depuis la commande.
-- ------------------------------------------------------------
create or replace function public.issue_invoice_for_order(p_order_id bigint)
returns public.invoices
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_order public.orders%rowtype;
  v_billing jsonb;
  v_enabled boolean;
  v_rate numeric;
  v_year int;
  v_seq int;
  v_ttc numeric;
  v_vat numeric;
  v_ht numeric;
  v_inv public.invoices;
  v_admin boolean;
  v_confirmed_at timestamptz;
  v_issued_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  v_admin := coalesce(public.is_admin(), false);

  select * into v_order from public.orders where id = p_order_id;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if not v_admin and v_order.user_id is distinct from auth.uid() then
    raise exception 'NOT_ALLOWED';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if not v_admin and v_order.user_id is distinct from auth.uid() then
    raise exception 'NOT_ALLOWED';
  end if;

  select * into v_inv from public.invoices where order_id = p_order_id;
  if found then return v_inv; end if;

  if v_order.status is null or v_order.status not in ('paid', 'shipped', 'delivered') then
    raise exception 'ORDER_NOT_INVOICEABLE';
  end if;

  v_issued_at := clock_timestamp();
  v_confirmed_at := null;

  if v_order.status = 'delivered' then
    select max(h.changed_at) into v_confirmed_at
    from public.order_status_history h
    where h.order_id = p_order_id and h.status = 'delivered' and h.changed_at <= v_issued_at;
  end if;

  select value into v_billing from public.site_settings where key = 'billing';
  v_enabled := coalesce((v_billing ->> 'vat_enabled')::boolean, false);
  v_rate := case when v_enabled then coalesce((v_billing ->> 'vat_rate')::numeric, 20) else null end;
  v_ttc := coalesce(v_order.total, 0);

  if v_enabled and v_rate > 0 then
    v_vat := round(v_ttc - v_ttc / (1 + v_rate / 100), 2);
  else
    v_vat := 0;
  end if;
  v_ht := round(v_ttc - v_vat, 2);

  v_year := extract(year from v_issued_at at time zone 'Europe/Paris')::int;

  insert into public.invoice_counters (year, last_seq) values (v_year, 0) on conflict (year) do nothing;
  update public.invoice_counters set last_seq = last_seq + 1 where year = v_year returning last_seq into v_seq;

  insert into public.invoices (
    order_id, number, year, seq, issued_at, vat_applicable, vat_rate,
    subtotal_ht, vat_amount, shipping, discount, total_ttc,
    seller_name, seller_address, seller_siret, seller_vat_number,
    customer_name, customer_address_line1, customer_address_line2,
    customer_postal_code, customer_city, customer_country, is_test,
    delivery_carrier, delivery_tracking_number, delivery_shipped_at, delivery_confirmed_at,
    payment_method, paid_at
  )
  values (
    p_order_id,
    'FA-' || v_year || '-' || to_char(v_issued_at at time zone 'Europe/Paris', 'MM') || '-' || lpad(v_seq::text, 5, '0'),
    v_year, v_seq, v_issued_at, v_enabled, v_rate, v_ht, v_vat,
    coalesce(v_order.shipping, 0), coalesce(v_order.discount, 0), v_ttc,
    nullif(v_billing ->> 'seller_name', ''), nullif(v_billing ->> 'seller_address', ''),
    nullif(v_billing ->> 'seller_siret', ''), nullif(v_billing ->> 'seller_vat_number', ''),
    v_order.shipping_full_name, v_order.shipping_address_line1, v_order.shipping_address_line2,
    v_order.shipping_postal_code, v_order.shipping_city, v_order.shipping_country,
    coalesce(v_order.is_test, false),
    nullif(v_order.carrier, ''), nullif(v_order.tracking_number, ''),
    case when v_order.shipped_at <= v_issued_at then v_order.shipped_at else null end,
    v_confirmed_at,
    v_order.payment_method, v_order.paid_at
  )
  returning * into v_inv;

  return v_inv;
end;
$function$;

-- ------------------------------------------------------------
-- C. admin_confirm_transfer : emet la facture dans la MEME transaction
--    que la confirmation du paiement. search_path corrige en ''.
-- ------------------------------------------------------------
create or replace function public.admin_confirm_transfer(p_order_id bigint, p_amount numeric, p_received_on date, p_note text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_o record;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_today date := (now() at time zone 'Europe/Paris')::date;
  v_paid_at timestamptz;
  v_gap boolean;
  v_res jsonb;
  v_inv public.invoices;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;

  select id, status, total, created_at into v_o from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_o.status <> 'pending_transfer' then raise exception 'ORDER_STATE'; end if;

  if p_received_on is null or p_received_on > v_today or p_received_on < (v_o.created_at at time zone 'Europe/Paris')::date then
    raise exception 'INVALID_DATE';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000 then raise exception 'INVALID_AMOUNT'; end if;
  if v_note is not null and char_length(v_note) > 500 then raise exception 'INVALID_NOTE'; end if;

  v_gap := abs(p_amount - v_o.total) >= 0.01;
  if v_gap and v_note is null then raise exception 'NOTE_REQUIRED'; end if;

  v_res := public.consume_order_pieces(p_order_id);
  if jsonb_array_length(v_res -> 'conflicts') > 0 then
    raise exception 'PIECE_CONFLICT:%', (v_res -> 'conflicts')::text;
  end if;

  v_paid_at := least(((p_received_on::timestamp + interval '12 hours') at time zone 'Europe/Paris'), now());

  update public.orders
     set status = 'paid', paid_at = v_paid_at, transfer_received_amount = p_amount, transfer_received_at = v_paid_at
   where id = p_order_id;

  insert into public.order_status_history (order_id, status, note, actor_email)
  values (
    p_order_id, 'paid',
    'Paiement par virement confirmé : ' || replace(to_char(p_amount, 'FM999999990.00'), '.', ',') || ' € reçu le ' || to_char(p_received_on, 'DD/MM/YYYY')
      || case when v_gap then ' — écart avec le total (' || replace(to_char(v_o.total, 'FM999999990.00'), '.', ',') || ' €) : ' || v_note else '' end || '.',
    public.current_actor_email()
  );

  select * into v_inv from public.invoices where order_id = p_order_id;
  if not found then
    v_inv := public.issue_invoice_for_order(p_order_id);
  end if;

  return jsonb_build_object('order_id', p_order_id, 'paid_at', v_paid_at, 'amount', p_amount, 'gap', v_gap, 'invoice_number', v_inv.number);
end
$function$;

-- ------------------------------------------------------------
-- D. admin_extend_transfer : uniquement correction du search_path
-- ------------------------------------------------------------
create or replace function public.admin_extend_transfer(p_order_id bigint, p_days integer)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_o record;
  v_new timestamptz;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_days is null or p_days < 1 or p_days > 60 then raise exception 'INVALID_DAYS'; end if;

  select id, status, transfer_due_at into v_o from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_o.status <> 'pending_transfer' then raise exception 'ORDER_STATE'; end if;

  v_new := greatest(coalesce(v_o.transfer_due_at, now()), now()) + make_interval(days => p_days);
  update public.orders set transfer_due_at = v_new where id = p_order_id;

  insert into public.order_status_history (order_id, status, note, actor_email)
  values (
    p_order_id, 'pending_transfer',
    'Échéance prolongée de ' || p_days || ' jour(s). Nouvelle date limite indicative : ' || to_char(v_new at time zone 'Europe/Paris', 'DD/MM/YYYY') || '.',
    public.current_actor_email()
  );

  return jsonb_build_object('order_id', p_order_id, 'due_at', v_new);
end
$function$;

-- ------------------------------------------------------------
-- E. customer_cancel_transfer_order : uniquement correction du search_path
-- ------------------------------------------------------------
create or replace function public.customer_cancel_transfer_order(p_order_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_status text;
  v_released integer;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;

  select status into v_status from public.orders where id = p_order_id and user_id = v_uid for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_status <> 'pending_transfer' then raise exception 'ORDER_STATE'; end if;

  update public.orders
     set status = 'cancelled', cancelled_by = 'customer', cancelled_at = now()
   where id = p_order_id;
  v_released := public.release_order_pieces(p_order_id, 'customer_cancelled');

  insert into public.order_status_history (order_id, status, note, actor_email)
  values (p_order_id, 'cancelled', 'Annulée par la cliente depuis Mes commandes.', public.current_actor_email());

  return jsonb_build_object('order_id', p_order_id, 'released', v_released);
end
$function$;

-- ------------------------------------------------------------
-- F. create_transfer_order : controle des unit_price contre le prix
--    reel en base. search_path corrige en ''.
-- ------------------------------------------------------------
create or replace function public.create_transfer_order(p_user_id uuid, p_email text, p_items jsonb, p_subtotal numeric, p_discount numeric, p_shipping numeric, p_total numeric, p_promo_code text, p_ship_name text, p_ship_line1 text, p_ship_line2 text, p_ship_postal text, p_ship_city text, p_ship_phone text, p_is_test boolean)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  c_cap constant integer := 2;
  v_email text := btrim(coalesce(p_email, ''));
  v_name text := btrim(coalesce(p_ship_name, ''));
  v_line1 text := btrim(coalesce(p_ship_line1, ''));
  v_line2 text := nullif(btrim(coalesce(p_ship_line2, '')), '');
  v_postal text := btrim(coalesce(p_ship_postal, ''));
  v_city text := btrim(coalesce(p_ship_city, ''));
  v_phone text := nullif(btrim(coalesce(p_ship_phone, '')), '');
  v_settings jsonb;
  v_delay integer := 3;
  v_due timestamptz;
  v_order_id bigint;
  e jsonb;
  v_pid bigint;
  v_qty integer;
  v_price numeric;
  v_prod record;
  v_seen bigint[] := '{}';
  v_total_qty integer := 0;
  v_existing integer;
  v_calc_subtotal numeric := 0;
begin
  if p_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_email = '' or char_length(v_email) > 255 then raise exception 'INVALID_EMAIL'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    raise exception 'INVALID_ITEMS';
  end if;
  if p_subtotal is null or p_discount is null or p_shipping is null or p_total is null
     or p_subtotal < 0 or p_discount < 0 or p_shipping < 0 or p_total < 0
     or abs(p_total - (p_subtotal - p_discount + p_shipping)) > 0.011 then
    raise exception 'INVALID_TOTALS';
  end if;
  if v_name = '' or char_length(v_name) > 120
     or v_line1 = '' or char_length(v_line1) > 200
     or (v_line2 is not null and char_length(v_line2) > 200)
     or v_postal !~ '^[0-9]{5}$'
     or v_city = '' or char_length(v_city) > 100
     or (v_phone is not null and char_length(v_phone) > 25) then
    raise exception 'INVALID_ADDRESS';
  end if;
  if p_is_test is null then raise exception 'INVALID_ITEMS'; end if;

  select value into v_settings from public.site_settings where key = 'payment_methods';
  if coalesce(v_settings ->> 'transfer_enabled', 'false') <> 'true' then
    raise exception 'TRANSFER_DISABLED';
  end if;

  select value into v_settings from public.site_settings where key = 'bank_transfer';
  if v_settings is not null
     and jsonb_typeof(v_settings -> 'delay_days') = 'number'
     and (v_settings ->> 'delay_days')::numeric between 1 and 60
     and (v_settings ->> 'delay_days')::numeric = trunc((v_settings ->> 'delay_days')::numeric) then
    v_delay := (v_settings ->> 'delay_days')::integer;
  end if;
  v_due := now() + make_interval(days => v_delay);

  v_calc_subtotal := 0;
  for e in select x from jsonb_array_elements(p_items) as x loop
    if jsonb_typeof(e) <> 'object'
       or coalesce(e ->> 'product_id', '') !~ '^[0-9]{1,18}$'
       or coalesce(e ->> 'qty', '') !~ '^[0-9]{1,3}$'
       or coalesce(e ->> 'unit_price', '') !~ '^[0-9]{1,6}(\.[0-9]{1,2})?$' then
      raise exception 'INVALID_ITEMS';
    end if;
    v_pid := (e ->> 'product_id')::bigint;
    v_qty := (e ->> 'qty')::integer;
    v_price := (e ->> 'unit_price')::numeric;
    if v_qty < 1 or v_qty > 10 then raise exception 'INVALID_QTY'; end if;
    if v_pid = any (v_seen) then raise exception 'INVALID_ITEMS'; end if;
    v_seen := v_seen || v_pid;

    select id, is_unique, active, price, promo_price into v_prod from public.products where id = v_pid;
    if not found or v_prod.active is not true then
      raise exception 'PRODUCT_UNAVAILABLE:%', v_pid;
    end if;
    if v_prod.is_unique and v_qty <> 1 then
      raise exception 'UNIQUE_QTY:%', v_pid;
    end if;

    if abs(v_price - (case when v_prod.promo_price is not null and v_prod.promo_price < v_prod.price then v_prod.promo_price else v_prod.price end)) > 0.011 then
      raise exception 'PRICE_MISMATCH:%', v_pid;
    end if;

    v_total_qty := v_total_qty + v_qty;
    v_calc_subtotal := v_calc_subtotal + (v_price * v_qty);
  end loop;

  if abs(p_subtotal - v_calc_subtotal) > 0.011 then
    raise exception 'SUBTOTAL_MISMATCH';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('transfer_cap:' || p_user_id::text, 0));
  select coalesce(sum(oi.qty), 0) into v_existing
  from public.orders o
  join public.order_items oi on oi.order_id = o.id
  where o.user_id = p_user_id and o.status = 'pending_transfer';
  if v_existing + v_total_qty > c_cap then
    raise exception 'TRANSFER_CAP:%', v_existing;
  end if;

  insert into public.orders (
    user_id, guest_email, status, payment_method, transfer_due_at, is_test,
    subtotal, discount, shipping, total, promo_code,
    shipping_full_name, shipping_address_line1, shipping_address_line2,
    shipping_postal_code, shipping_city, shipping_country, shipping_phone
  ) values (
    p_user_id, v_email, 'pending_transfer', 'transfer', v_due, p_is_test,
    p_subtotal, p_discount, p_shipping, p_total, nullif(btrim(coalesce(p_promo_code, '')), ''),
    v_name, v_line1, v_line2,
    v_postal, v_city, 'FR', v_phone
  ) returning id into v_order_id;

  for e in select x from jsonb_array_elements(p_items) as x loop
    v_pid := (e ->> 'product_id')::bigint;
    v_qty := (e ->> 'qty')::integer;
    v_price := (e ->> 'unit_price')::numeric;
    insert into public.order_items (order_id, product_id, product_name, product_price, qty)
    select v_order_id, p.id, p.name, v_price, v_qty from public.products p where p.id = v_pid;
  end loop;

  perform public.hold_order_pieces_internal(v_order_id, null);

  insert into public.order_status_history (order_id, status, note, actor_email)
  values (
    v_order_id, 'pending_transfer',
    'Commande créée (virement). Date limite de paiement indicative : ' || to_char(v_due at time zone 'Europe/Paris', 'DD/MM/YYYY') || '.',
    v_email
  );

  return jsonb_build_object('order_id', v_order_id, 'total', p_total, 'due_at', v_due);
end
$function$;

commit;