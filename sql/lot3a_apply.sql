-- ============================================================
-- LOT 3a (SQL) : etape 3 du virement - instructions de virement, annulation par la cliente avec note, suivi visible par la cliente
-- Contenu (tout ou rien : un seul bloc, rien n'est modifie si un controle echoue) :
--   1. colonne order_status_history.customer_visible (faux par defaut) : une ligne du journal n'est montree a la cliente que si elle est marquee
--   2. customer_transfer_instructions(order_id) : bénéficiaire, IBAN, BIC, échéance ; reservee a la cliente proprietaire, commande en attente de virement seulement
--   3. customer_order_events(order_id) : journal de SA commande ; la note n'est renvoyee que si la ligne est marquee visible ; jamais l'adresse e-mail de l'auteur
--   4. customer_cancel_transfer_order(order_id, note) : note facultative (500 car.) ; remplace l'ancienne version a un seul parametre
--   5. admin_extend_transfer(order_id, jours, note) : note facultative (500 car.), visible par la cliente ; remplace l'ancienne version a deux parametres
--   6. admin_cancel_transfer_order : la ligne d'annulation devient visible par la cliente (meme signature, memes droits)
-- Les fonctions 4 et 5 changent de signature : l'ancienne est supprimee APRES creation de la nouvelle. Aucun code du site n'appelle customer_cancel_transfer_order
-- (verifie dans compte.js et index.js) ; l'admin appelle admin_extend_transfer avec deux parametres : cela continue de fonctionner (note facultative).
-- Droits : retires a PUBLIC et anon, accordes aux comptes connectes (authenticated) ; chaque fonction verifie l'identite et le proprietaire en interne.
-- Aucune donnee existante modifiee. Sans effet visible tant que le code du lot 3b/3c n'est pas deploye.
-- Retour arriere : lot3a_rollback.sql
-- ============================================================
do $zen$
declare
  v_ext text;
  v_can text;
  v_p text[];
  v_n integer;
  i integer;
begin
  -- Controles prealables
  if to_regprocedure('public.customer_cancel_transfer_order(bigint)') is null then
    raise exception 'ABANDON : customer_cancel_transfer_order(bigint) introuvable ; rien n''a ete modifie';
  end if;
  if to_regprocedure('public.customer_transfer_instructions(bigint)') is not null
     or to_regprocedure('public.customer_cancel_transfer_order(bigint,text)') is not null
     or to_regprocedure('public.admin_extend_transfer(bigint,integer,text)') is not null then
    raise exception 'ABANDON : le lot 3a (SQL) est deja applique ; rien n''a ete modifie';
  end if;
  if to_regprocedure('public.admin_extend_transfer(bigint,integer)') is null
     or to_regprocedure('public.admin_cancel_transfer_order(bigint,text,text)') is null
     or to_regprocedure('public.release_order_pieces(bigint,text)') is null
     or to_regprocedure('public.current_actor_email()') is null then
    raise exception 'ABANDON : une fonction attendue est introuvable ; rien n''a ete modifie';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'order_status_history' and column_name = 'customer_visible') then
    raise exception 'ABANDON : la colonne customer_visible existe deja ; rien n''a ete modifie';
  end if;

  -- Preparation de admin_extend_transfer (definition ACTUELLE lue dans la base, 6 reperes a occurrence unique)
  v_ext := pg_get_functiondef('public.admin_extend_transfer(bigint,integer)'::regprocedure);
  v_p := array[
    $q$(p_order_id bigint, p_days integer)$q$, $q$(p_order_id bigint, p_days integer, p_note text DEFAULT NULL::text)$q$,
    $q$v_new timestamptz;$q$, $q$v_new timestamptz;
  v_note text := nullif(btrim(coalesce(p_note, '')), ''); -- ZENORIA_STEP3_V1$q$,
    $q$raise exception 'INVALID_DAYS'; end if;$q$, $q$raise exception 'INVALID_DAYS'; end if;
  if v_note is not null and char_length(v_note) > 500 then raise exception 'INVALID_NOTE'; end if;$q$,
    $q$'DD/MM/YYYY') || '.',$q$, $q$'DD/MM/YYYY') || '.' || case when v_note is not null then ' Note du vendeur : ' || v_note else '' end,$q$,
    $q$insert into public.order_status_history (order_id, status, note, actor_email)$q$, $q$insert into public.order_status_history (order_id, status, note, actor_email, customer_visible)$q$,
    $q$public.current_actor_email()$q$, $q$public.current_actor_email(),
    true$q$
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

  -- Preparation de admin_cancel_transfer_order (2 reperes a occurrence unique)
  v_can := pg_get_functiondef('public.admin_cancel_transfer_order(bigint,text,text)'::regprocedure);
  v_p := array[
    $q$insert into public.order_status_history (order_id, status, note, actor_email)$q$, $q$insert into public.order_status_history (order_id, status, note, actor_email, customer_visible) -- ZENORIA_STEP3_V1$q$,
    $q$public.current_actor_email()$q$, $q$public.current_actor_email(),
    true$q$
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

  -- 1. Colonne
  execute $ddl$ alter table public.order_status_history add column customer_visible boolean not null default false $ddl$;
  execute $ddl$ comment on column public.order_status_history.customer_visible is 'Vrai : la ligne (et sa note) peut etre montree a la cliente proprietaire de la commande, via customer_order_events' $ddl$;

  -- 2. Instructions de virement
  execute $ddl$
create or replace function public.customer_transfer_instructions(p_order_id bigint)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_o record;
  v_cfg jsonb;
  v_ben text;
  v_iban text;
  v_bic text;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;

  select id, status, total, created_at, transfer_due_at into v_o
    from public.orders where id = p_order_id and user_id = v_uid;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_o.status <> 'pending_transfer' then raise exception 'ORDER_STATE'; end if;

  select value into v_cfg from public.site_settings where key = 'bank_transfer';
  v_ben := btrim(coalesce(v_cfg ->> 'beneficiary', ''));
  v_iban := upper(regexp_replace(coalesce(v_cfg ->> 'iban', ''), '\s', '', 'g'));
  v_bic := upper(regexp_replace(coalesce(v_cfg ->> 'bic', ''), '\s', '', 'g'));

  -- Coordonnees incompletes (bénéficiaire ou IBAN vide ; le BIC est facultatif) : jamais d'IBAN vide a l'ecran
  if v_ben = '' or v_iban = '' then
    return jsonb_build_object('state', 'unavailable', 'order_id', v_o.id, 'total', v_o.total,
                              'created_at', v_o.created_at, 'due_at', v_o.transfer_due_at);
  end if;

  return jsonb_build_object('state', 'ok', 'order_id', v_o.id, 'total', v_o.total,
                            'created_at', v_o.created_at, 'due_at', v_o.transfer_due_at,
                            'beneficiary', v_ben, 'iban', v_iban, 'bic', nullif(v_bic, ''));
end
$function$
  $ddl$;

  -- 3. Journal visible par la cliente
  execute $ddl$
create or replace function public.customer_order_events(p_order_id bigint)
 returns table(event_at timestamptz, event_status text, message text)
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (select 1 from public.orders o where o.id = p_order_id and o.user_id = v_uid) then
    raise exception 'ORDER_NOT_FOUND';
  end if;
  return query
    select h.changed_at, h.status, case when h.customer_visible then h.note else null end
      from public.order_status_history h
     where h.order_id = p_order_id
     order by h.changed_at, h.id;
end
$function$
  $ddl$;

  -- 4. Annulation par la cliente, avec note facultative
  execute $ddl$
create or replace function public.customer_cancel_transfer_order(p_order_id bigint, p_note text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_status text;
  v_released integer;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_note is not null and char_length(v_note) > 500 then raise exception 'INVALID_NOTE'; end if;

  select status into v_status from public.orders where id = p_order_id and user_id = v_uid for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_status <> 'pending_transfer' then raise exception 'ORDER_STATE'; end if;

  update public.orders
     set status = 'cancelled', cancelled_by = 'customer', cancelled_at = now()
   where id = p_order_id;
  v_released := public.release_order_pieces(p_order_id, 'customer_cancelled');

  insert into public.order_status_history (order_id, status, note, actor_email, customer_visible)
  values (
    p_order_id, 'cancelled',
    'Annulée par la cliente depuis Mes commandes.' || case when v_note is not null then ' Raison indiquée : ' || v_note else '' end,
    public.current_actor_email(),
    true
  );

  return jsonb_build_object('order_id', p_order_id, 'released', v_released);
end
$function$
  $ddl$;
  execute 'drop function public.customer_cancel_transfer_order(bigint)';

  -- 5. Prolongation avec note (definition modifiee plus haut), puis suppression de l'ancienne signature
  execute v_ext;
  execute 'drop function public.admin_extend_transfer(bigint, integer)';

  -- 6. Annulation par l'administration : ligne visible (meme signature, droits conserves)
  execute v_can;

  -- Droits
  execute 'revoke all on function public.customer_transfer_instructions(bigint) from public, anon';
  execute 'grant execute on function public.customer_transfer_instructions(bigint) to authenticated';
  execute 'revoke all on function public.customer_order_events(bigint) from public, anon';
  execute 'grant execute on function public.customer_order_events(bigint) to authenticated';
  execute 'revoke all on function public.customer_cancel_transfer_order(bigint, text) from public, anon';
  execute 'grant execute on function public.customer_cancel_transfer_order(bigint, text) to authenticated';
  execute 'revoke all on function public.admin_extend_transfer(bigint, integer, text) from public, anon';
  execute 'grant execute on function public.admin_extend_transfer(bigint, integer, text) to authenticated';
end $zen$;

-- Verification (lecture seule) : attendu = anon false et authenticated true pour les 5 lignes ; aucune ancienne signature restante
select p.oid::regprocedure::text as fonction,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('customer_transfer_instructions', 'customer_order_events', 'customer_cancel_transfer_order', 'admin_extend_transfer', 'admin_cancel_transfer_order')
 order by 1;
