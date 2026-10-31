-- ============================================================
-- LOT 3a-bis : TEST (rien n'est conserve). A lancer APRES lot3abis_apply.sql.
-- Reutilise une commande de TEST d'un compte administrateur (sans piece unique), la remet « en attente de virement », simule la connexion de ce compte,
-- confirme l'encaissement de plusieurs facons, puis leve volontairement une erreur : TOUT est annule (commande, journal, facture).
-- Attendu : « TEST_OK : N controles passes (rien n'est conserve) ». Toute autre erreur (ECHEC : ..., ABANDON : ..., erreur SQL) est a m'envoyer telle quelle.
-- ============================================================
create or replace function pg_temp.zen_as(p_uid uuid, p_email text) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'email', p_email)::text, true);
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
end
$f$;

create or replace function pg_temp.zen_reset(p_id bigint) returns void language plpgsql as $f$
begin
  update public.orders
     set status = 'pending_transfer', payment_method = 'transfer', transfer_due_at = now() + interval '3 days',
         cancelled_by = null, cancelled_at = null, paid_at = null
   where id = p_id;
end
$f$;

do $zen$
declare
  v_oid bigint;
  v_uid uuid;
  v_email text;
  v_other uuid;
  v_other_email text;
  v_total numeric;
  v_today date := (now() at time zone 'Europe/Paris')::date;
  v_note text;
  v_vis boolean;
  v_cnt integer;
  v_n integer := 0;
begin
  select o.id, o.user_id, o.total into v_oid, v_uid, v_total
    from public.orders o join public.admin_users a on a.user_id = o.user_id
   where o.is_test is true
     and not exists (select 1 from public.order_items oi join public.products p on p.id = oi.product_id
                      where oi.order_id = o.id and p.is_unique)
   order by o.id desc limit 1;
  if v_oid is null then raise exception 'ABANDON : aucune commande de test d''un compte administrateur sans piece unique'; end if;
  select email into v_email from auth.users where id = v_uid;

  -- Une commande par carte abandonnee n'a pas d'adresse de livraison : la facture exige un nom de cliente et une adresse.
  -- Le test complete donc l'adresse (annule a la fin du test, comme tout le reste).
  update public.orders
     set shipping_full_name     = coalesce(nullif(btrim(shipping_full_name), ''), 'Cliente Test'),
         shipping_address_line1 = coalesce(nullif(btrim(shipping_address_line1), ''), '1 rue du Test'),
         shipping_postal_code   = coalesce(nullif(btrim(shipping_postal_code), ''), '75001'),
         shipping_city          = coalesce(nullif(btrim(shipping_city), ''), 'Paris'),
         shipping_country       = coalesce(nullif(btrim(shipping_country), ''), 'France')
   where id = v_oid;
  select id, email into v_other, v_other_email from auth.users
   where id <> v_uid and id not in (select user_id from public.admin_users) order by created_at limit 1;

  -- 1. Droits inchanges
  if has_function_privilege('anon', 'public.admin_confirm_transfer(bigint,numeric,date,text)'::regprocedure, 'EXECUTE') then
    raise exception 'ECHEC : admin_confirm_transfer est executable par anon';
  end if;
  if not has_function_privilege('authenticated', 'public.admin_confirm_transfer(bigint,numeric,date,text)'::regprocedure, 'EXECUTE') then
    raise exception 'ECHEC : admin_confirm_transfer n''est plus executable par authenticated';
  end if;
  v_n := v_n + 2;

  -- 2. Un compte non administrateur ne peut pas confirmer
  if v_other is not null then
    perform pg_temp.zen_reset(v_oid);
    perform pg_temp.zen_as(v_other, v_other_email);
    begin
      perform public.admin_confirm_transfer(v_oid, v_total, v_today, null);
      raise exception 'ECHEC : un compte non administrateur a pu confirmer';
    exception when others then
      if sqlerrm not like '%FORBIDDEN%' then raise; end if;
    end;
    v_n := v_n + 1;
  end if;

  -- 3. Montant exact avec note : ligne visible, note incluse
  perform pg_temp.zen_reset(v_oid);
  perform pg_temp.zen_as(v_uid, v_email);
  perform public.admin_confirm_transfer(v_oid, v_total, v_today, '  Reçu sur le compte  ');
  select h.note, h.customer_visible into v_note, v_vis
    from public.order_status_history h where h.order_id = v_oid and h.status = 'paid' order by h.id desc limit 1;
  if v_vis is not true or v_note not like 'Paiement par virement confirmé : %' or v_note not like '%— Note : Reçu sur le compte.' then
    raise exception 'ECHEC : confirmation avec note : « % » visible=%', v_note, v_vis;
  end if;
  v_n := v_n + 2;

  -- 4. Montant exact sans note : ligne visible, sans note
  perform pg_temp.zen_reset(v_oid);
  perform public.admin_confirm_transfer(v_oid, v_total, v_today, null);
  select h.note, h.customer_visible into v_note, v_vis
    from public.order_status_history h where h.order_id = v_oid and h.status = 'paid' order by h.id desc limit 1;
  if v_vis is not true or v_note not like 'Paiement par virement confirmé : % reçu le %.' or v_note like '%Note%' then
    raise exception 'ECHEC : confirmation sans note : « % » visible=%', v_note, v_vis;
  end if;
  v_n := v_n + 2;

  -- 5. Ecart de montant avec note : ligne visible, ecart et note inclus
  perform pg_temp.zen_reset(v_oid);
  perform public.admin_confirm_transfer(v_oid, v_total + 1, v_today, 'Complément à venir');
  select h.note, h.customer_visible into v_note, v_vis
    from public.order_status_history h where h.order_id = v_oid and h.status = 'paid' order by h.id desc limit 1;
  if v_vis is not true or v_note not like '%écart avec le total%Complément à venir.' then
    raise exception 'ECHEC : confirmation avec écart : « % » visible=%', v_note, v_vis;
  end if;
  v_n := v_n + 2;

  -- 6. Ecart sans note : toujours refuse (regle inchangee)
  perform pg_temp.zen_reset(v_oid);
  begin
    perform public.admin_confirm_transfer(v_oid, v_total + 1, v_today, null);
    raise exception 'ECHEC : un ecart sans note a ete accepte';
  exception when others then
    if sqlerrm not like '%NOTE_REQUIRED%' then raise; end if;
  end;
  v_n := v_n + 1;

  -- 7. La cliente proprietaire voit la ligne de confirmation (message non vide), via la fonction du lot 3a
  select count(*) into v_cnt from public.customer_order_events(v_oid) e
   where e.event_status = 'paid' and e.message like 'Paiement par virement confirmé%';
  if v_cnt < 1 then raise exception 'ECHEC : la confirmation n''est pas renvoyee a la cliente par customer_order_events'; end if;
  v_n := v_n + 1;

  raise exception 'TEST_OK : % controles passes (rien n''est conserve)', v_n;
end $zen$;
