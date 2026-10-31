-- ============================================================
-- ROLLBACK LOT 3a (SQL) : remet les fonctions dans leur forme d'avant le lot 3a (tout ou rien).
--   - supprime customer_transfer_instructions et customer_order_events ;
--   - customer_cancel_transfer_order revient a un seul parametre (note fixe) ;
--   - admin_extend_transfer revient a deux parametres (sans note) ; admin_cancel_transfer_order redevient sans ligne visible.
-- La colonne order_status_history.customer_visible est CONSERVEE (inoffensive, aucune donnee perdue). Pour la retirer ensuite :
--   alter table public.order_status_history drop column customer_visible;
-- ============================================================
do $zen$
declare
  v_ext text;
  v_can text;
  v_p text[];
  v_n integer;
  i integer;
begin
  if to_regprocedure('public.customer_transfer_instructions(bigint)') is null
     or to_regprocedure('public.customer_cancel_transfer_order(bigint,text)') is null
     or to_regprocedure('public.admin_extend_transfer(bigint,integer,text)') is null then
    raise exception 'ABANDON : le lot 3a (SQL) n''est pas applique ; rien n''a ete modifie';
  end if;

  v_ext := pg_get_functiondef('public.admin_extend_transfer(bigint,integer,text)'::regprocedure);
  v_p := array[
    $q$public.current_actor_email(),
    true$q$, $q$public.current_actor_email()$q$,
    $q$insert into public.order_status_history (order_id, status, note, actor_email, customer_visible)$q$, $q$insert into public.order_status_history (order_id, status, note, actor_email)$q$,
    $q$'DD/MM/YYYY') || '.' || case when v_note is not null then ' Note du vendeur : ' || v_note else '' end,$q$, $q$'DD/MM/YYYY') || '.',$q$,
    $q$raise exception 'INVALID_DAYS'; end if;
  if v_note is not null and char_length(v_note) > 500 then raise exception 'INVALID_NOTE'; end if;$q$, $q$raise exception 'INVALID_DAYS'; end if;$q$,
    $q$v_new timestamptz;
  v_note text := nullif(btrim(coalesce(p_note, '')), ''); -- ZENORIA_STEP3_V1$q$, $q$v_new timestamptz;$q$,
    $q$(p_order_id bigint, p_days integer, p_note text DEFAULT NULL::text)$q$, $q$(p_order_id bigint, p_days integer)$q$
  ];
  i := 1;
  while i <= array_length(v_p, 1) loop
    v_n := (length(v_ext) - length(replace(v_ext, v_p[i], ''))) / length(v_p[i]);
    if v_n <> 1 then
      raise exception 'ABANDON : admin_extend_transfer : repere « % » trouve % fois (1 attendu) ; rien n''a ete modifie', left(v_p[i], 60), v_n;
    end if;
    v_ext := replace(v_ext, v_p[i], v_p[i + 1]);
    i := i + 2;
  end loop;

  v_can := pg_get_functiondef('public.admin_cancel_transfer_order(bigint,text,text)'::regprocedure);
  v_p := array[
    $q$public.current_actor_email(),
    true$q$, $q$public.current_actor_email()$q$,
    $q$insert into public.order_status_history (order_id, status, note, actor_email, customer_visible) -- ZENORIA_STEP3_V1$q$, $q$insert into public.order_status_history (order_id, status, note, actor_email)$q$
  ];
  i := 1;
  while i <= array_length(v_p, 1) loop
    v_n := (length(v_can) - length(replace(v_can, v_p[i], ''))) / length(v_p[i]);
    if v_n <> 1 then
      raise exception 'ABANDON : admin_cancel_transfer_order : repere « % » trouve % fois (1 attendu) ; rien n''a ete modifie', left(v_p[i], 60), v_n;
    end if;
    v_can := replace(v_can, v_p[i], v_p[i + 1]);
    i := i + 2;
  end loop;

  execute $ddl$
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
$function$
  $ddl$;
  execute 'drop function public.customer_cancel_transfer_order(bigint, text)';
  execute v_ext;
  execute 'drop function public.admin_extend_transfer(bigint, integer, text)';
  execute v_can;
  execute 'drop function public.customer_transfer_instructions(bigint)';
  execute 'drop function public.customer_order_events(bigint)';

  execute 'revoke all on function public.customer_cancel_transfer_order(bigint) from public, anon';
  execute 'grant execute on function public.customer_cancel_transfer_order(bigint) to authenticated';
  execute 'revoke all on function public.admin_extend_transfer(bigint, integer) from public, anon';
  execute 'grant execute on function public.admin_extend_transfer(bigint, integer) to authenticated';
end $zen$;

select p.oid::regprocedure::text as fonction,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('customer_transfer_instructions', 'customer_order_events', 'customer_cancel_transfer_order', 'admin_extend_transfer', 'admin_cancel_transfer_order')
 order by 1;   -- attendu : customer_cancel_transfer_order(bigint), admin_extend_transfer(bigint,integer), admin_cancel_transfer_order(bigint,text,text) ; plus de customer_transfer_instructions ni customer_order_events
