-- ============================================================
-- LOT 3a : TEST des fonctions (rien n'est conserve).
-- A lancer APRES lot3a_apply.sql. Le script reutilise une commande de TEST appartenant a un compte administrateur, la remet temporairement
-- « en attente de virement », simule la connexion de ce compte, et teste les fonctions. A la fin, il leve volontairement une erreur : TOUT est annule
-- (commande, journal, reglage bank_transfer modifie le temps du test).
-- Attendu : « TEST_OK : N controles passes (rien n'est conserve) ». Toute autre erreur (ECHEC : ..., ABANDON : ..., ou une erreur SQL) est a m'envoyer telle quelle :
-- elle peut venir du script de test lui-meme (par exemple la simulation de connexion) autant que des fonctions.
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
  v_r jsonb;
  v_n integer := 0;
  v_msg text;
  v_note text;
  v_vis boolean;
  v_cnt integer;
  v_status text;
  v_by text;
  v_fn text;
begin
  -- Commande de test appartenant a un administrateur
  select o.id, o.user_id into v_oid, v_uid
    from public.orders o join public.admin_users a on a.user_id = o.user_id
   where o.is_test is true order by o.id desc limit 1;
  if v_oid is null then raise exception 'ABANDON : aucune commande de test appartenant a un compte administrateur'; end if;
  select email into v_email from auth.users where id = v_uid;
  select id, email into v_other, v_other_email from auth.users where id <> v_uid order by created_at limit 1;

  perform pg_temp.zen_reset(v_oid);

  -- Reglage bancaire temporaire (annule a la fin)
  insert into public.site_settings (key, value)
  values ('bank_transfer', '{"beneficiary":"","iban":"","bic":"","delay_days":3}'::jsonb)
  on conflict (key) do update set value = excluded.value;

  -- 1. Droits
  for v_fn in select unnest(array['public.customer_transfer_instructions(bigint)', 'public.customer_order_events(bigint)',
                                  'public.customer_cancel_transfer_order(bigint,text)', 'public.admin_extend_transfer(bigint,integer,text)']) loop
    if has_function_privilege('anon', v_fn::regprocedure, 'EXECUTE') then raise exception 'ECHEC : % est executable par anon', v_fn; end if;
    if not has_function_privilege('authenticated', v_fn::regprocedure, 'EXECUTE') then raise exception 'ECHEC : % n''est pas executable par authenticated', v_fn; end if;
    v_n := v_n + 2;
  end loop;
  if to_regprocedure('public.customer_cancel_transfer_order(bigint)') is not null or to_regprocedure('public.admin_extend_transfer(bigint,integer)') is not null then
    raise exception 'ECHEC : une ancienne signature existe encore';
  end if;
  v_n := v_n + 1;

  -- 2. Instructions : coordonnees incompletes => « unavailable », jamais d'IBAN vide
  perform pg_temp.zen_as(v_uid, v_email);
  v_r := public.customer_transfer_instructions(v_oid);
  if v_r ->> 'state' <> 'unavailable' or v_r ? 'iban' then raise exception 'ECHEC : coordonnees incompletes : etat « % » au lieu de unavailable', v_r ->> 'state'; end if;
  v_n := v_n + 1;

  -- 3. Instructions : coordonnees completes, BIC facultatif
  update public.site_settings set value = '{"beneficiary":"Test Beneficiaire","iban":"fr76 3000 6000 0112 3456 7890 189","bic":"","delay_days":3}'::jsonb where key = 'bank_transfer';
  v_r := public.customer_transfer_instructions(v_oid);
  if v_r ->> 'state' <> 'ok' then raise exception 'ECHEC : coordonnees completes : etat « % »', v_r ->> 'state'; end if;
  if v_r ->> 'iban' <> 'FR7630006000011234567890189' then raise exception 'ECHEC : IBAN non normalise : %', v_r ->> 'iban'; end if;
  if v_r ->> 'bic' is not null then raise exception 'ECHEC : le BIC vide devrait etre null'; end if;
  if v_r ->> 'beneficiary' <> 'Test Beneficiaire' or (v_r ->> 'order_id')::bigint <> v_oid then raise exception 'ECHEC : contenu des instructions'; end if;
  v_n := v_n + 4;

  -- 4. Une autre cliente ne voit rien ; sans connexion non plus
  if v_other is not null then
    perform pg_temp.zen_as(v_other, v_other_email);
    begin
      perform public.customer_transfer_instructions(v_oid);
      raise exception 'ECHEC : une autre cliente a pu lire les instructions';
    exception when others then
      if sqlerrm not like '%ORDER_NOT_FOUND%' then raise; end if;
    end;
    begin
      perform public.customer_order_events(v_oid);
      raise exception 'ECHEC : une autre cliente a pu lire le journal';
    exception when others then
      if sqlerrm not like '%ORDER_NOT_FOUND%' then raise; end if;
    end;
    begin
      perform public.customer_cancel_transfer_order(v_oid, 'intrus');
      raise exception 'ECHEC : une autre cliente a pu annuler la commande';
    exception when others then
      if sqlerrm not like '%ORDER_NOT_FOUND%' then raise; end if;
    end;
    v_n := v_n + 3;
  else
    raise notice 'Un seul compte dans auth.users : controles « autre cliente » ignores';
  end if;
  perform pg_temp.zen_anon();
  begin
    perform public.customer_transfer_instructions(v_oid);
    raise exception 'ECHEC : lecture possible sans connexion';
  exception when others then
    if sqlerrm not like '%AUTH_REQUIRED%' then raise; end if;
  end;
  v_n := v_n + 1;

  -- 5. Prolongation (compte administrateur) : sans note, puis avec note
  perform pg_temp.zen_as(v_uid, v_email);
  perform public.admin_extend_transfer(v_oid, 2);
  select h.note, h.customer_visible into v_note, v_vis from public.order_status_history h where h.order_id = v_oid order by h.id desc limit 1;
  if v_vis is not true or v_note like '%Note du vendeur%' or v_note not like 'Échéance prolongée de 2 jour(s)%' then raise exception 'ECHEC : prolongation sans note : « % » visible=%', v_note, v_vis; end if;
  perform public.admin_extend_transfer(v_oid, 3, '  Prolongation accordée, merci de votre patience  ');
  select h.note, h.customer_visible into v_note, v_vis from public.order_status_history h where h.order_id = v_oid order by h.id desc limit 1;
  if v_vis is not true or v_note not like '%Note du vendeur : Prolongation accordée, merci de votre patience' then raise exception 'ECHEC : prolongation avec note : « % » visible=%', v_note, v_vis; end if;
  begin
    perform public.admin_extend_transfer(v_oid, 1, repeat('x', 501));
    raise exception 'ECHEC : une note de 501 caracteres a ete acceptee';
  exception when others then
    if sqlerrm not like '%INVALID_NOTE%' then raise; end if;
  end;
  v_n := v_n + 3;

  -- 6. Journal vu par la cliente : la note interne n'est jamais renvoyee ; pas d'adresse e-mail
  insert into public.order_status_history (order_id, status, note, actor_email, customer_visible)
  values (v_oid, 'pending_transfer', 'NOTE INTERNE A NE JAMAIS MONTRER', 'interne@exemple.fr', false);
  select count(*) into v_cnt from public.customer_order_events(v_oid) e where e.message like '%INTERNE%';
  if v_cnt <> 0 then raise exception 'ECHEC : une note non visible est renvoyee a la cliente'; end if;
  select count(*) into v_cnt from public.customer_order_events(v_oid) e where e.message like '%Note du vendeur : Prolongation accordée%';
  if v_cnt <> 1 then raise exception 'ECHEC : la note de prolongation visible n''est pas renvoyee (% ligne(s))', v_cnt; end if;
  select count(*) into v_cnt from public.customer_order_events(v_oid) e where e.event_status = 'pending_transfer' and e.message is null;
  if v_cnt < 1 then raise exception 'ECHEC : les lignes non visibles doivent rester presentes, sans note'; end if;
  v_n := v_n + 3;

  -- 7. Annulation par la cliente avec note, puis masquage de l'IBAN
  v_r := public.customer_cancel_transfer_order(v_oid, '  Je me suis trompee de bague  ');
  select status, cancelled_by into v_status, v_by from public.orders where id = v_oid;
  if v_status <> 'cancelled' or v_by <> 'customer' then raise exception 'ECHEC : annulation cliente : statut %, par %', v_status, v_by; end if;
  select h.note, h.customer_visible into v_note, v_vis from public.order_status_history h where h.order_id = v_oid order by h.id desc limit 1;
  if v_vis is not true or v_note <> 'Annulée par la cliente depuis Mes commandes. Raison indiquée : Je me suis trompee de bague' then raise exception 'ECHEC : note d''annulation cliente : « % »', v_note; end if;
  begin
    perform public.customer_transfer_instructions(v_oid);
    raise exception 'ECHEC : l''IBAN reste lisible apres annulation';
  exception when others then
    if sqlerrm not like '%ORDER_STATE%' then raise; end if;
  end;
  begin
    perform public.customer_cancel_transfer_order(v_oid, null);
    raise exception 'ECHEC : seconde annulation acceptee';
  exception when others then
    if sqlerrm not like '%ORDER_STATE%' then raise; end if;
  end;
  v_n := v_n + 5;

  -- 8. Annulation sans note, note trop longue
  perform pg_temp.zen_reset(v_oid);
  begin
    perform public.customer_cancel_transfer_order(v_oid, repeat('x', 501));
    raise exception 'ECHEC : note d''annulation de 501 caracteres acceptee';
  exception when others then
    if sqlerrm not like '%INVALID_NOTE%' then raise; end if;
  end;
  perform public.customer_cancel_transfer_order(v_oid);
  select h.note into v_note from public.order_status_history h where h.order_id = v_oid order by h.id desc limit 1;
  if v_note <> 'Annulée par la cliente depuis Mes commandes.' then raise exception 'ECHEC : annulation sans note : « % »', v_note; end if;
  v_n := v_n + 2;

  -- 9. Annulation par l'administration : ligne visible
  perform pg_temp.zen_reset(v_oid);
  perform public.admin_cancel_transfer_order(v_oid, 'customer_request', 'Note du test');
  select h.note, h.customer_visible into v_note, v_vis from public.order_status_history h where h.order_id = v_oid order by h.id desc limit 1;
  if v_vis is not true or v_note not like 'Annulée par l''administration%Note du test%' then raise exception 'ECHEC : annulation admin : « % » visible=%', v_note, v_vis; end if;
  v_n := v_n + 1;

  -- 10. Commande payee : l'IBAN n'est plus servi
  perform pg_temp.zen_reset(v_oid);
  update public.orders set status = 'paid', paid_at = now() where id = v_oid;
  begin
    perform public.customer_transfer_instructions(v_oid);
    raise exception 'ECHEC : l''IBAN reste lisible apres paiement';
  exception when others then
    if sqlerrm not like '%ORDER_STATE%' then raise; end if;
  end;
  v_n := v_n + 1;

  raise exception 'TEST_OK : % controles passes (rien n''est conserve)', v_n;
end $zen$;
