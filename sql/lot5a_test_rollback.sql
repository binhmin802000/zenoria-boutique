-- ============================================================
-- LOT 5a - TEST AUTOMATIQUE, ANNULE TOUT SEUL (aucune donnee conservee)
-- ============================================================
-- A lancer dans l'editeur SQL de Supabase, en un seul bloc.
-- Le bloc cree 2 fausses commandes, teste la fonction, puis termine VOLONTAIREMENT par une erreur :
--   * "TEST_OK ..."  = tous les controles sont passes (c'est le resultat attendu)
--   * "KO ..."       = un controle a echoue (envoyez-moi le message)
-- Comme le bloc se termine par une erreur, TOUT est annule : aucune commande de test ne reste.
-- ============================================================
do $t$
declare
  v_admin uuid;
  v_id bigint;
  v_paid bigint;
  v_res jsonb;
  v_msg text;
  v_failed boolean;
  v_row record;
  v_hist text;
begin
  select user_id into v_admin from public.admin_users limit 1;
  if v_admin is null then raise exception 'KO : aucun administrateur dans admin_users'; end if;

  insert into public.orders (user_id, guest_email, status, payment_method, transfer_due_at, is_test, subtotal, discount, shipping, total)
  values (v_admin, 'test-lot5a@exemple.fr', 'pending_transfer', 'transfer', now() + interval '3 days', true, 49.99, 0, 4.90, 54.89)
  returning id into v_id;
  insert into public.orders (user_id, guest_email, status, payment_method, transfer_due_at, is_test, subtotal, discount, shipping, total, paid_at)
  values (v_admin, 'test-lot5a@exemple.fr', 'paid', 'transfer', now() - interval '1 day', true, 49.99, 0, 4.90, 54.89, now())
  returning id into v_paid;

  -- 1. une personne qui n'est pas administratrice est refusee
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid()::text, 'role', 'authenticated')::text, true);
  v_failed := false;
  begin perform public.admin_cancel_transfer_order(v_id, 'not_received', null);
  exception when others then v_failed := true; v_msg := sqlerrm; end;
  if not v_failed or v_msg <> 'FORBIDDEN' then raise exception 'KO 1 (non-admin) : %', coalesce(v_msg, 'aucune erreur'); end if;

  -- on passe administratrice
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);

  -- 2. motif invalide
  v_failed := false; v_msg := null;
  begin perform public.admin_cancel_transfer_order(v_id, 'nimporte', null);
  exception when others then v_failed := true; v_msg := sqlerrm; end;
  if not v_failed or v_msg <> 'INVALID_REASON' then raise exception 'KO 2 (motif invalide) : %', coalesce(v_msg, 'aucune erreur'); end if;

  -- 3. "autre" sans note
  v_failed := false; v_msg := null;
  begin perform public.admin_cancel_transfer_order(v_id, 'other', '   ');
  exception when others then v_failed := true; v_msg := sqlerrm; end;
  if not v_failed or v_msg <> 'NOTE_REQUIRED' then raise exception 'KO 3 (note obligatoire) : %', coalesce(v_msg, 'aucune erreur'); end if;

  -- 4. note trop longue
  v_failed := false; v_msg := null;
  begin perform public.admin_cancel_transfer_order(v_id, 'not_received', repeat('x', 501));
  exception when others then v_failed := true; v_msg := sqlerrm; end;
  if not v_failed or v_msg <> 'INVALID_NOTE' then raise exception 'KO 4 (note trop longue) : %', coalesce(v_msg, 'aucune erreur'); end if;

  -- 5. commande introuvable
  v_failed := false; v_msg := null;
  begin perform public.admin_cancel_transfer_order(-1, 'not_received', null);
  exception when others then v_failed := true; v_msg := sqlerrm; end;
  if not v_failed or v_msg <> 'ORDER_NOT_FOUND' then raise exception 'KO 5 (introuvable) : %', coalesce(v_msg, 'aucune erreur'); end if;

  -- 6. une commande deja payee ne s'annule pas ici
  v_failed := false; v_msg := null;
  begin perform public.admin_cancel_transfer_order(v_paid, 'not_received', null);
  exception when others then v_failed := true; v_msg := sqlerrm; end;
  if not v_failed or v_msg <> 'ORDER_STATE' then raise exception 'KO 6 (commande payee) : %', coalesce(v_msg, 'aucune erreur'); end if;
  select status into v_msg from public.orders where id = v_paid;
  if v_msg <> 'paid' then raise exception 'KO 6b : la commande payee a ete modifiee (%)', v_msg; end if;

  -- 7. annulation reussie
  v_res := public.admin_cancel_transfer_order(v_id, 'customer_request', 'Demande par e-mail');
  select status, cancelled_by, cancelled_at into v_row from public.orders where id = v_id;
  if v_row.status <> 'cancelled' or v_row.cancelled_by <> 'admin' or v_row.cancelled_at is null then
    raise exception 'KO 7 (etat final) : % / % / %', v_row.status, v_row.cancelled_by, v_row.cancelled_at;
  end if;
  if (v_res ->> 'order_id')::bigint <> v_id or v_res ->> 'reason' <> 'customer_request' then raise exception 'KO 7b (retour) : %', v_res; end if;
  select note into v_hist from public.order_status_history where order_id = v_id and status = 'cancelled' order by changed_at desc limit 1;
  if v_hist is null or v_hist not like '%Demande de la cliente%' or v_hist not like '%Demande par e-mail%' then raise exception 'KO 7c (historique) : %', coalesce(v_hist, 'aucune ligne'); end if;

  -- 8. une deuxieme annulation est refusee (pas de double traitement)
  v_failed := false; v_msg := null;
  begin perform public.admin_cancel_transfer_order(v_id, 'not_received', null);
  exception when others then v_failed := true; v_msg := sqlerrm; end;
  if not v_failed or v_msg <> 'ORDER_STATE' then raise exception 'KO 8 (double annulation) : %', coalesce(v_msg, 'aucune erreur'); end if;

  -- 9. droits : pas d'acces anonyme
  if has_function_privilege('anon', 'public.admin_cancel_transfer_order(bigint,text,text)', 'EXECUTE') then raise exception 'KO 9 : anon peut executer la fonction'; end if;
  if not has_function_privilege('authenticated', 'public.admin_cancel_transfer_order(bigint,text,text)', 'EXECUTE') then raise exception 'KO 9b : authenticated ne peut pas executer la fonction'; end if;

  raise exception 'TEST_OK : 9 controles passes (rien n''est conserve)';
end
$t$;
