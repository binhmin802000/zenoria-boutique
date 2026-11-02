-- ============================================================
-- TEST LOT 2f (rien n'est conserve). A lancer APRES lot2f_transfer_hold_apply.sql.
-- Commande par virement sur un bijou normal (stock fixe a 1), puis echeance placee DANS LE PASSE. Verifie :
--   1. la reservation n'a pas de date de fin ; 2. la bague reste reservee (disponible = 0) malgre l'echeance depassee ;
--   3. une seconde commande est refusee (STOCK_UNAVAILABLE) ; 4. la confirmation tardive decompte bien le stock (1 -> 0).
-- Simule la connexion d'un compte administrateur. Leve une erreur a la fin : TOUT est annule.
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
  v_oid bigint; v_res jsonb; v_n integer := 0; v_exp timestamptz; v_av integer; v_stock integer; v_st text;
begin
  if pg_get_functiondef((select oid from pg_proc where pronamespace = 'public'::regnamespace and proname = 'create_transfer_order'))
     not like '%ZENORIA_TRANSFER_HOLD_V1%' then
    raise exception 'ABANDON : le lot 2f n''est pas applique';
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

  v_res := public.create_transfer_order(v_uid, v_email,
    jsonb_build_array(jsonb_build_object('product_id', v_pid, 'qty', 1, 'unit_price', to_char(v_unit, 'FM999999990.00'))),
    v_unit, 0, 0, v_unit, null, 'Test 2f', '1 rue du Test', null, '75001', 'Paris', null, true);
  v_oid := (v_res ->> 'order_id')::bigint;

  -- 1. Pas de date de fin
  select expires_at, status into v_exp, v_st from public.stock_holds where order_id = v_oid and product_id = v_pid;
  if v_st is distinct from 'active' or v_exp is not null then raise exception 'ECHEC : reservation % avec date de fin % (active sans date attendue)', v_st, v_exp; end if;
  v_n := v_n + 1;

  -- 2. Echeance depassee : la bague reste reservee
  update public.orders set transfer_due_at = now() - interval '10 days' where id = v_oid;
  select available into v_av from public.public_stock_states() where product_id = v_pid;
  if v_av <> 0 then raise exception 'ECHEC : echeance depassee, disponible = % (0 attendu)', v_av; end if;
  v_n := v_n + 1;

  -- 3. Une autre commande est refusee
  begin
    perform public.create_transfer_order(v_uid, v_email,
      jsonb_build_array(jsonb_build_object('product_id', v_pid, 'qty', 1, 'unit_price', to_char(v_unit, 'FM999999990.00'))),
      v_unit, 0, 0, v_unit, null, 'Test 2f', '1 rue du Test', null, '75001', 'Paris', null, true);
    raise exception 'ECHEC : une seconde commande a ete acceptee alors que la bague est reservee';
  exception when others then
    if sqlerrm not like '%STOCK_UNAVAILABLE%' then raise; end if;
  end;
  v_n := v_n + 1;

  -- 4. Confirmation tardive : decompte du stock
  perform public.admin_confirm_transfer(v_oid, v_unit, (now() at time zone 'Europe/Paris')::date, null);
  select stock into v_stock from public.products where id = v_pid;
  select status into v_st from public.stock_holds where order_id = v_oid and product_id = v_pid;
  if v_stock <> 0 or v_st is distinct from 'consumed' then raise exception 'ECHEC : confirmation tardive : stock %, reservation % (0 / consumed attendus)', v_stock, v_st; end if;
  v_n := v_n + 2;

  raise exception 'TEST_OK : % controles passes (rien n''est conserve)', v_n;
end $zen$;
