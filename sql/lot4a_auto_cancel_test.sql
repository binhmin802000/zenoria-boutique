-- ============================================================
-- TEST LOT 4a (rien n'est conservé). À lancer APRÈS lot4a_auto_cancel_apply.sql.
-- Crée deux commandes par virement (deux bijoux normaux, stock fixé à 1) puis appelle directement la fonction :
--   A : échéance il y a 3 jours, délai de grâce 2 jours  -> annulée (system), stock libéré, message visible
--   B : échéance il y a 1 jour,  délai de grâce 2 jours  -> intacte
--   puis délai de grâce 0 jour (dès l'échéance)          -> B annulée à son tour
-- Vérifie aussi la tâche pg_cron et les droits. Lève une erreur à la fin : TOUT est annulé.
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
  v_uid uuid; v_email text;
  v_p1 bigint; v_p2 bigint; v_u1 numeric; v_u2 numeric;
  v_a bigint; v_b bigint; v_res jsonb; v_cnt integer; v_n integer := 0;
  v_st text; v_by text; v_note text; v_vis boolean;
begin
  if to_regprocedure('public.auto_cancel_overdue_transfers()') is null then
    raise exception 'ABANDON : le lot 4a n''est pas applique';
  end if;
  select user_id into v_uid from public.admin_users limit 1;
  if v_uid is null then raise exception 'ABANDON : aucun compte administrateur'; end if;
  select email into v_email from auth.users where id = v_uid;
  update public.orders set status = 'cancelled', cancelled_by = 'admin', cancelled_at = now()
   where user_id = v_uid and status = 'pending_transfer';

  select id, case when promo_price is not null and promo_price < price then promo_price else price end into v_p1, v_u1
    from public.products where is_unique is not true and active is true order by id limit 1;
  select id, case when promo_price is not null and promo_price < price then promo_price else price end into v_p2, v_u2
    from public.products where is_unique is not true and active is true and id <> v_p1 order by id limit 1;
  if v_p1 is null or v_p2 is null then raise exception 'ABANDON : il faut deux bijoux normaux actifs'; end if;
  update public.products set stock = 1 where id in (v_p1, v_p2);
  update public.stock_holds set status = 'released', released_at = now(), release_reason = 'admin_cancelled'
   where product_id in (v_p1, v_p2) and status = 'active';
  update public.site_settings set value = jsonb_set(value, '{transfer_enabled}', 'true'::jsonb) where key = 'payment_methods';
  update public.site_settings set value = jsonb_set(value, '{grace_days}', '2'::jsonb) where key = 'bank_transfer';
  perform pg_temp.zen_as(v_uid, v_email);

  v_res := public.create_transfer_order(v_uid, v_email,
    jsonb_build_array(jsonb_build_object('product_id', v_p1, 'qty', 1, 'unit_price', to_char(v_u1, 'FM999999990.00'))),
    v_u1, 0, 0, v_u1, null, 'Test 4a', '1 rue du Test', null, '75001', 'Paris', null, true);
  v_a := (v_res ->> 'order_id')::bigint;
  v_res := public.create_transfer_order(v_uid, v_email,
    jsonb_build_array(jsonb_build_object('product_id', v_p2, 'qty', 1, 'unit_price', to_char(v_u2, 'FM999999990.00'))),
    v_u2, 0, 0, v_u2, null, 'Test 4a', '1 rue du Test', null, '75001', 'Paris', null, true);
  v_b := (v_res ->> 'order_id')::bigint;
  update public.orders set transfer_due_at = now() - interval '3 days' where id = v_a;
  update public.orders set transfer_due_at = now() - interval '1 day' where id = v_b;

  -- Délai de grâce 2 jours
  perform public.auto_cancel_overdue_transfers();
  select status, cancelled_by into v_st, v_by from public.orders where id = v_a;
  if v_st <> 'cancelled' or v_by is distinct from 'system' then raise exception 'ECHEC : A non annulee automatiquement (%, %)', v_st, v_by; end if;
  v_n := v_n + 1;
  select status into v_st from public.stock_holds where order_id = v_a and product_id = v_p1;
  if v_st is distinct from 'released' then raise exception 'ECHEC : stock de A non libere (%)', v_st; end if;
  v_n := v_n + 1;
  select note, customer_visible into v_note, v_vis from public.order_status_history where order_id = v_a order by id desc limit 1;
  if v_vis is not true or v_note <> 'Annulée automatiquement : virement non reçu dans le délai. Votre bijou a été remis en vente.' then
    raise exception 'ECHEC : journal de A (« % », visible=%)', v_note, v_vis;
  end if;
  v_n := v_n + 1;
  select status into v_st from public.orders where id = v_b;
  if v_st <> 'pending_transfer' then raise exception 'ECHEC : B annulee alors qu''elle est dans le delai de grace (%)', v_st; end if;
  v_n := v_n + 1;

  -- Délai de grâce 0 jour : annulation dès l'échéance
  update public.site_settings set value = jsonb_set(value, '{grace_days}', '0'::jsonb) where key = 'bank_transfer';
  perform public.auto_cancel_overdue_transfers();
  select status, cancelled_by into v_st, v_by from public.orders where id = v_b;
  if v_st <> 'cancelled' or v_by is distinct from 'system' then raise exception 'ECHEC : grace 0 : B non annulee (%, %)', v_st, v_by; end if;
  v_n := v_n + 1;

  -- Valeur refusée par la contrainte
  begin
    update public.site_settings set value = jsonb_set(value, '{grace_days}', '31'::jsonb) where key = 'bank_transfer';
    raise exception 'ECHEC : grace_days = 31 accepte';
  exception when check_violation then null;
  end;
  v_n := v_n + 1;

  -- Tâche horaire et droits
  select count(*) into v_cnt from cron.job where jobname = 'zenoria-auto-cancel-transfers' and schedule = '7 * * * *' and active;
  if v_cnt <> 1 then raise exception 'ECHEC : tache pg_cron absente ou inactive'; end if;
  if has_function_privilege('authenticated', 'public.auto_cancel_overdue_transfers()'::regprocedure, 'EXECUTE')
     or has_function_privilege('anon', 'public.auto_cancel_overdue_transfers()'::regprocedure, 'EXECUTE') then
    raise exception 'ECHEC : fonction executable par anon ou authenticated';
  end if;
  v_n := v_n + 2;

  raise exception 'TEST_OK : % controles passes (rien n''est conserve)', v_n;
end $zen$;
