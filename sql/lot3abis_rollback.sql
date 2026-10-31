-- ============================================================
-- ROLLBACK LOT 3a-bis (SQL) : la ligne de confirmation d'encaissement redevient privee (comportement d'avant).
-- Aucune donnee modifiee : les lignes deja ecrites avec customer_visible = true restent telles quelles.
-- Tout ou rien : ABANDON sans rien modifier si le lot n'est pas applique ou si un repere manque.
-- ============================================================
do $zen$
declare
  v_def text;
  v_n text[] := array[
    $q$insert into public.order_status_history (order_id, status, note, actor_email, customer_visible) -- ZENORIA_CONFIRM_VISIBLE_V1$q$,
    $q$public.current_actor_email(),
    true$q$
  ];
  v_o text[] := array[
    $q$insert into public.order_status_history (order_id, status, note, actor_email)$q$,
    $q$public.current_actor_email()$q$
  ];
  c integer;
  i integer;
begin
  if to_regprocedure('public.admin_confirm_transfer(bigint,numeric,date,text)') is null then
    raise exception 'ABANDON : admin_confirm_transfer introuvable ; rien n''a ete modifie';
  end if;
  v_def := pg_get_functiondef('public.admin_confirm_transfer(bigint,numeric,date,text)'::regprocedure);
  if v_def not like '%ZENORIA_CONFIRM_VISIBLE_V1%' then
    raise exception 'ABANDON : le lot 3a-bis n''est pas applique ; rien n''a ete modifie';
  end if;
  for i in reverse array_length(v_n, 1) .. 1 loop
    c := (length(v_def) - length(replace(v_def, v_n[i], ''))) / length(v_n[i]);
    if c <> 1 then
      raise exception 'ABANDON : repere % trouve % fois (1 attendu) ; rien n''a ete modifie', i, c;
    end if;
    v_def := replace(v_def, v_n[i], v_o[i]);
  end loop;
  execute v_def;
end $zen$;

select pg_get_functiondef(p.oid) like '%ZENORIA_CONFIRM_VISIBLE_V1%' as patch_present   -- attendu : false
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace and p.proname = 'admin_confirm_transfer';
