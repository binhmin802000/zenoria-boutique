-- ============================================================
-- TEST CORRECTIF LOT 2a (rien n'est conserve). A lancer APRES lot2a_correctif_apply_hold.sql
-- ET lot2a_correctif_apply_states.sql.
-- Rejoue le scenario qui a revele le defaut : une PREMIERE commande reserve puis consomme 1 unite
-- (le stock physique est decremente, la reservation reste en base en statut 'consumed' pour l'historique),
-- puis l'admin REMONTE le stock a la main (reassort), et une SECONDE commande (differente, comme dans la
-- realite : une nouvelle cliente) verifie que la disponibilite calculee est desormais CORRECTE (ne compte
-- plus la reservation 'consumed' de la premiere commande) et peut reserver le stock reapprovisionne.
-- Leve volontairement une erreur a la fin : TOUT est annule.
-- Attendu : « TEST_OK : N controles passes (rien n'est conserve) ».
-- ============================================================
do $zen$
declare
  v_pid bigint;
  v_oid bigint;
  v_oid2 bigint;
  v_n integer := 0;
  v_avail integer;
begin
  if pg_get_functiondef('public.hold_order_stock_internal(bigint,timestamp with time zone)'::regprocedure)
     not like '%ZENORIA_STOCK_FIX_V1%'
     or pg_get_functiondef('public.public_stock_states()'::regprocedure) not like '%ZENORIA_STOCK_FIX_V1%' then
    raise exception 'ABANDON : le correctif n''est pas applique (les deux fonctions) ; rien n''a ete modifie';
  end if;

  select o.id into v_oid from public.orders o where o.is_test is true order by o.id desc limit 1;
  if v_oid is null then raise exception 'ABANDON : aucune commande de test trouvee'; end if;
  select o.id into v_oid2 from public.orders o where o.is_test is true and o.id <> v_oid order by o.id desc limit 1;
  if v_oid2 is null then raise exception 'ABANDON : il faut au moins DEUX commandes de test distinctes'; end if;

  select id into v_pid from public.products where is_unique is not true and active is true order by id limit 1;
  if v_pid is null then raise exception 'ABANDON : aucun produit non unique actif trouve'; end if;

  update public.products set stock = 1 where id = v_pid;
  delete from public.order_items where product_id = v_pid and order_id in (v_oid, v_oid2);
  delete from public.stock_holds where product_id = v_pid;

  -- 1. Premiere commande : reserver puis consommer 1 unite (stock 1 -> 0, ligne 'consumed' qty=1 restante)
  insert into public.order_items (order_id, product_id, product_name, product_price, qty)
  values (v_oid, v_pid, 'Test correctif 2a', 10, 1);
  perform public.hold_order_stock_internal(v_oid, now() + interval '30 minutes');
  perform public.consume_order_stock(v_oid);
  select stock into v_avail from public.products where id = v_pid;
  if v_avail <> 0 then raise exception 'ECHEC : stock apres consommation attendu 0, obtenu %', v_avail; end if;
  v_n := v_n + 1;

  -- 2. L'admin reapprovisionne : stock remonte a 2 (sans toucher aux reservations historiques)
  update public.products set stock = 2 where id = v_pid;

  -- 3. Disponibilite publique : AVANT le correctif, cela donnait 2-1=1 (double decompte) ; desormais 2
  select available into v_avail from public.public_stock_states() where product_id = v_pid;
  if v_avail <> 2 then raise exception 'ECHEC : disponibilite apres reapprovisionnement attendue 2, obtenu % (double decompte toujours present ?)', v_avail; end if;
  v_n := v_n + 1;

  -- 4. SECONDE commande (nouvelle cliente) : une reservation de 2 (tout le stock reapprovisionne) doit reussir
  insert into public.order_items (order_id, product_id, product_name, product_price, qty)
  values (v_oid2, v_pid, 'Test correctif 2a', 10, 2);
  perform public.hold_order_stock_internal(v_oid2, now() + interval '30 minutes');
  if not exists (select 1 from public.stock_holds where order_id = v_oid2 and product_id = v_pid and status = 'active' and qty = 2) then
    raise exception 'ECHEC : la reservation de 2 par une seconde commande (stock reapprovisionne) a echoue alors qu''elle aurait du reussir';
  end if;
  v_n := v_n + 1;

  raise exception 'TEST_OK : % controles passes (rien n''est conserve)', v_n;
end $zen$;
