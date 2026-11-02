-- ============================================================
-- TEST LOT 2e (rien n'est conserve). A lancer APRES lot2e_release_stock_apply.sql.
-- Cree deux commandes par virement (create_transfer_order) sur un bijou normal au stock fixe a 1, annule la premiere
-- par la cliente (customer_cancel_transfer_order) et la seconde par l'admin (admin_cancel_transfer_order), et verifie
-- qu'a chaque fois la reservation de stock passe a « released » et que la bague redevient disponible.
-- Simule la connexion d'un compte administrateur proprietaire des commandes. Leve une erreur a la fin : TOUT est annule.
-- Attendu : « TEST_OK : N controles passes (rien n'est conserve) ».
-- ============================================================
create or replace function pg_temp.zen_as(p_uid uuid, p_email text) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'email', p_email)::text, true);
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
end
$f$;

do $zen$
declare
  v_uid uuid; v_email text; v_pid bigint; v_price numeric; v_promo numeric; v_unit numeric;
  v_oid bigint; v_res jsonb; v_n integer := 0; v_st text; v_av integer;
begin
  if pg_get_functiondef((select oid from pg_proc where pronamespace = 'public'::regnamespace and proname = 'customer_cancel_transfer_order'))
     not like '%ZENORIA_STOCK_RELEASE_V1%' then
    raise exception 'ABANDON : le lot 2e n''est pas applique';
  end if;
  select user_id into v_uid from public.admin_users limit 1;
  if v_uid is null then raise exception 'ABANDON : aucun compte administrateur'; end if;
  select email into v_email from auth.users where id = v_uid;
  update public.orders set status = 'cancelled', cancelled_by = 'admin', cancelled_at = now()
   where user_id = v_uid and status = 'pending_transfer';

  select id, price, promo_price into v_pid, v_price, v_promo
    from public.products where is_unique is not true and active is true order by id limit 1;
  if v_pid is null then raise exception 'ABANDON : aucun produit non unique actif'; end if;
  v_unit := case when v_promo is not null and v_promo < v_price then v_promo else v_price end;
  update public.products set stock = 1 where id = v_pid;
  update public.stock_holds set status = 'released', released_at = now(), release_reason = 'admin_cancelled'
   where product_id = v_pid and status = 'active';
  update public.site_settings set value = jsonb_set(value, '{transfer_enabled}', 'true'::jsonb) where key = 'payment_methods';
  perform pg_temp.zen_as(v_uid, v_email);

  -- 1. Annulation par la cliente
  v_res := public.create_transfer_order(v_uid, v_email,
    jsonb_build_array(jsonb_build_object('product_id', v_pid, 'qty', 1, 'unit_price', to_char(v_unit, 'FM999999990.00'))),
    v_unit, 0, 0, v_unit, null, 'Test 2e', '1 rue du Test', null, '75001', 'Paris', null, true);
  v_oid := (v_res ->> 'order_id')::bigint;
  select status into v_st from public.stock_holds where order_id = v_oid and product_id = v_pid;
  if v_st is distinct from 'active' then raise exception 'ECHEC : reservation absente a la creation (%)', v_st; end if;
  perform public.customer_cancel_transfer_order(v_oid, null);
  select status into v_st from public.stock_holds where order_id = v_oid and product_id = v_pid;
  if v_st is distinct from 'released' then raise exception 'ECHEC : annulation cliente : reservation de stock = % (released attendu)', v_st; end if;
  select available into v_av from public.public_stock_states() where product_id = v_pid;
  if v_av <> 1 then raise exception 'ECHEC : apres annulation cliente, disponible = % (1 attendu)', v_av; end if;
  v_n := v_n + 3;

  -- 2. Annulation par l'administration
  v_res := public.create_transfer_order(v_uid, v_email,
    jsonb_build_array(jsonb_build_object('product_id', v_pid, 'qty', 1, 'unit_price', to_char(v_unit, 'FM999999990.00'))),
    v_unit, 0, 0, v_unit, null, 'Test 2e', '1 rue du Test', null, '75001', 'Paris', null, true);
  v_oid := (v_res ->> 'order_id')::bigint;
  perform public.admin_cancel_transfer_order(v_oid, 'customer_request', null);
  select status into v_st from public.stock_holds where order_id = v_oid and product_id = v_pid;
  if v_st is distinct from 'released' then raise exception 'ECHEC : annulation admin : reservation de stock = % (released attendu)', v_st; end if;
  select available into v_av from public.public_stock_states() where product_id = v_pid;
  if v_av <> 1 then raise exception 'ECHEC : apres annulation admin, disponible = % (1 attendu)', v_av; end if;
  v_n := v_n + 2;

  raise exception 'TEST_OK : % controles passes (rien n''est conserve)', v_n;
end $zen$;
