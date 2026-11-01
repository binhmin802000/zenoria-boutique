-- ============================================================
-- LOT 2a : TEST (rien n'est conserve). A lancer APRES lot2a_apply.sql.
-- Reutilise DEUX commandes de test existantes (is_test = true), appartenant a un compte ADMINISTRATEUR
-- (necessaire pour appeler admin_relist_order, qui verifie is_admin() en interne), et UN produit non
-- unique actif, dont le stock est temporairement fixe a 2 pour un resultat previsible.
-- Teste reservation, idempotence, disponibilite publique, refus au-dela du stock, consommation (decompte
-- reel), idempotence de la consommation, remise en vente apres remboursement (avec simulation de connexion
-- admin, comme au lot 3a), refus pour un compte non administrateur, et les droits d'execution.
-- Leve volontairement une erreur a la fin : TOUT est annule (produit, commandes, order_items, reservations, statut).
-- Attendu : « TEST_OK : N controles passes (rien n'est conserve) ».
-- ============================================================
create or replace function pg_temp.zen_as(p_uid uuid, p_email text) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'email', p_email)::text, true);
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
end
$f$;

create or replace function pg_temp.zen_anon() returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end
$f$;

do $zen$
declare
  v_oid  bigint;
  v_oid2 bigint;
  v_pid  bigint;
  v_admin_uid uuid;
  v_admin_email text;
  v_other_uid uuid;
  v_other_email text;
  v_n    integer := 0;
  v_res  jsonb;
  v_cnt  integer;
  v_avail integer;
begin
  if to_regprocedure('public.hold_order_stock_internal(bigint,timestamp with time zone)') is null then
    raise exception 'ABANDON : le lot 2a n''est pas applique ; rien n''a ete modifie';
  end if;

  -- Deux commandes de test appartenant a un compte ADMINISTRATEUR (necessaire pour admin_relist_order)
  select o.id, o.user_id into v_oid, v_admin_uid
    from public.orders o join public.admin_users a on a.user_id = o.user_id
   where o.is_test is true
   order by o.id desc limit 1;
  if v_oid is null then raise exception 'ABANDON : aucune commande de test appartenant a un compte administrateur'; end if;
  select email into v_admin_email from auth.users where id = v_admin_uid;

  select o.id into v_oid2
    from public.orders o
   where o.is_test is true and o.user_id = v_admin_uid and o.id <> v_oid
   order by o.id desc limit 1;
  if v_oid2 is null then
    raise exception 'ABANDON : il faut au moins DEUX commandes de test appartenant au MEME compte administrateur pour ce test';
  end if;

  -- Un compte non administrateur, pour le controle 8 (refus de admin_relist_order)
  select id, email into v_other_uid, v_other_email
    from auth.users where id not in (select user_id from public.admin_users) order by created_at limit 1;

  select id into v_pid from public.products where is_unique is not true and active is true order by id limit 1;
  if v_pid is null then raise exception 'ABANDON : aucun produit non unique actif trouve'; end if;

  -- Stock connu et previsible pour la duree du test (annule a la fin avec tout le reste)
  update public.products set stock = 2 where id = v_pid;
  delete from public.order_items where product_id = v_pid and order_id in (v_oid, v_oid2);
  delete from public.stock_holds where product_id = v_pid and order_id in (v_oid, v_oid2);

  -- 1. Reservation de 1 sur 2 disponibles : acceptee
  insert into public.order_items (order_id, product_id, product_name, product_price, qty)
  values (v_oid, v_pid, 'Test stock 2a', 10, 1);
  perform public.hold_order_stock_internal(v_oid, now() + interval '30 minutes');
  select count(*) into v_cnt from public.stock_holds where order_id = v_oid and product_id = v_pid and status = 'active';
  if v_cnt <> 1 then raise exception 'ECHEC : reservation de 1/2 non creee (% ligne(s))', v_cnt; end if;
  v_n := v_n + 1;

  -- 2. Rappel idempotent : pas de deuxieme reservation
  perform public.hold_order_stock_internal(v_oid, now() + interval '30 minutes');
  select count(*) into v_cnt from public.stock_holds where order_id = v_oid and product_id = v_pid and status = 'active';
  if v_cnt <> 1 then raise exception 'ECHEC : appel repete a cree une reservation supplementaire (% ligne(s))', v_cnt; end if;
  v_n := v_n + 1;

  -- 3. Disponibilite publique : stock 2, reserve 1, disponible 1
  select available into v_avail from public.public_stock_states() where product_id = v_pid;
  if v_avail <> 1 then raise exception 'ECHEC : disponibilite attendue 1, obtenu %', v_avail; end if;
  v_n := v_n + 1;

  -- 4. Une deuxieme commande qui demande 2 (il n'en reste reellement que 1) : refusee, rien d'insere
  insert into public.order_items (order_id, product_id, product_name, product_price, qty)
  values (v_oid2, v_pid, 'Test stock 2a', 10, 2);
  begin
    perform public.hold_order_stock_internal(v_oid2, now() + interval '30 minutes');
    raise exception 'ECHEC : une reservation de 2 aurait du etre refusee (1 seul disponible)';
  exception when others then
    if sqlerrm not like '%STOCK_UNAVAILABLE%' then raise; end if;
  end;
  select count(*) into v_cnt from public.stock_holds where order_id = v_oid2 and product_id = v_pid;
  if v_cnt <> 0 then raise exception 'ECHEC : une reservation refusee a quand meme laisse % ligne(s)', v_cnt; end if;
  v_n := v_n + 1;

  -- 5. Consommation (paiement confirme) : decremente products.stock, passe en consumed
  v_res := public.consume_order_stock(v_oid);
  if (v_res ->> 'consumed')::integer <> 1 then raise exception 'ECHEC : consume_order_stock (consumed=%)', v_res ->> 'consumed'; end if;
  select stock into v_cnt from public.products where id = v_pid;
  if v_cnt <> 1 then raise exception 'ECHEC : stock apres consommation attendu 1, obtenu %', v_cnt; end if;
  v_n := v_n + 1;

  -- 6. Rappel idempotent de la consommation : pas de double decompte
  perform public.consume_order_stock(v_oid);
  select stock into v_cnt from public.products where id = v_pid;
  if v_cnt <> 1 then raise exception 'ECHEC : consommation rejouee a decremente a nouveau (stock=%)', v_cnt; end if;
  v_n := v_n + 1;

  -- 7. Remboursement puis remise en vente : simule la connexion du compte ADMINISTRATEUR proprietaire des commandes
  --    (admin_relist_order verifie is_admin() en interne : sans session simulee, le SQL Editor seul renvoie FORBIDDEN)
  perform pg_temp.zen_as(v_admin_uid, v_admin_email);

  update public.orders set status = 'refunded' where id = v_oid;
  v_res := public.admin_relist_order(v_oid);
  if (v_res ->> 'stock_qty_relisted')::integer <> 1 or (v_res ->> 'stock_rows_relisted')::integer <> 1 then
    raise exception 'ECHEC : admin_relist_order (%)', v_res;
  end if;
  select stock into v_cnt from public.products where id = v_pid;
  if v_cnt <> 2 then raise exception 'ECHEC : stock apres remise en vente attendu 2, obtenu %', v_cnt; end if;
  v_n := v_n + 1;

  -- 8. admin_relist_order refuse une commande qui n'est pas « remboursee » (toujours connecte en administrateur)
  update public.orders set status = 'paid' where id = v_oid2;
  begin
    perform public.admin_relist_order(v_oid2);
    raise exception 'ECHEC : admin_relist_order aurait du refuser une commande non remboursee';
  exception when others then
    if sqlerrm not like '%ORDER_STATE%' then raise; end if;
  end;
  v_n := v_n + 1;

  -- 9. Un compte NON administrateur ne peut pas remettre en vente (FORBIDDEN attendu)
  if v_other_uid is not null then
    update public.orders set status = 'refunded' where id = v_oid2;
    perform pg_temp.zen_as(v_other_uid, v_other_email);
    begin
      perform public.admin_relist_order(v_oid2);
      raise exception 'ECHEC : un compte non administrateur a pu remettre en vente';
    exception when others then
      if sqlerrm not like '%FORBIDDEN%' then raise; end if;
    end;
    v_n := v_n + 1;
  else
    raise notice 'Aucun compte non administrateur trouve : controle 9 ignore';
  end if;

  -- 10. Sans connexion du tout (anonyme) : egalement refuse
  perform pg_temp.zen_anon();
  begin
    perform public.admin_relist_order(v_oid2);
    raise exception 'ECHEC : un appel anonyme a pu remettre en vente';
  exception when others then
    if sqlerrm not like '%FORBIDDEN%' then raise; end if;
  end;
  v_n := v_n + 1;

  -- 11. Droits d'execution
  if has_function_privilege('anon', 'public.hold_order_stock_internal(bigint,timestamp with time zone)'::regprocedure, 'EXECUTE') then
    raise exception 'ECHEC : hold_order_stock_internal executable par anon';
  end if;
  if has_function_privilege('authenticated', 'public.consume_order_stock(bigint)'::regprocedure, 'EXECUTE') then
    raise exception 'ECHEC : consume_order_stock executable par authenticated';
  end if;
  if not has_function_privilege('authenticated', 'public.admin_relist_order(bigint)'::regprocedure, 'EXECUTE') then
    raise exception 'ECHEC : admin_relist_order non executable par authenticated';
  end if;
  if not has_function_privilege('anon', 'public.public_stock_states()'::regprocedure, 'EXECUTE') then
    raise exception 'ECHEC : public_stock_states non executable par anon';
  end if;
  v_n := v_n + 4;

  raise exception 'TEST_OK : % controles passes (rien n''est conserve)', v_n;
end $zen$;
