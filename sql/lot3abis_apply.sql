-- ============================================================
-- LOT 3a-bis (SQL) : la ligne de confirmation d'encaissement est VISIBLE par la cliente (avec sa note eventuelle).
-- Prerequis : lot 3a applique (colonne order_status_history.customer_visible).
-- Methode : la definition ACTUELLE de admin_confirm_transfer est lue dans la base, 2 reperes a occurrence unique sont remplaces :
--   1. l'INSERT dans le journal ajoute la colonne customer_visible ; 2. la valeur « true » est ajoutee.
-- Meme signature, memes droits (CREATE OR REPLACE). Tout ou rien : ABANDON sans rien modifier si un repere manque, est en double, ou si le lot est deja applique.
-- Aucune donnee existante modifiee : les confirmations deja enregistrees (commandes 106, 107, etc.) restent privees.
-- Retour arriere : lot3abis_rollback.sql
-- ============================================================
do $zen$
declare
  v_def text;
  v_o text[] := array[
    $q$insert into public.order_status_history (order_id, status, note, actor_email)$q$,
    $q$public.current_actor_email()$q$
  ];
  v_n text[] := array[
    $q$insert into public.order_status_history (order_id, status, note, actor_email, customer_visible) -- ZENORIA_CONFIRM_VISIBLE_V1$q$,
    $q$public.current_actor_email(),
    true$q$
  ];
  c integer;
  i integer;
begin
  if to_regprocedure('public.admin_confirm_transfer(bigint,numeric,date,text)') is null then
    raise exception 'ABANDON : admin_confirm_transfer introuvable ; rien n''a ete modifie';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'order_status_history' and column_name = 'customer_visible') then
    raise exception 'ABANDON : colonne customer_visible absente (appliquer d''abord le lot 3a) ; rien n''a ete modifie';
  end if;

  v_def := pg_get_functiondef('public.admin_confirm_transfer(bigint,numeric,date,text)'::regprocedure);
  if v_def like '%ZENORIA_CONFIRM_VISIBLE_V1%' then
    raise exception 'ABANDON : le lot 3a-bis est deja applique ; rien n''a ete modifie';
  end if;

  for i in 1 .. array_length(v_o, 1) loop
    c := (length(v_def) - length(replace(v_def, v_o[i], ''))) / length(v_o[i]);
    if c <> 1 then
      raise exception 'ABANDON : repere % trouve % fois (1 attendu) ; rien n''a ete modifie', i, c;
    end if;
    v_def := replace(v_def, v_o[i], v_n[i]);
  end loop;

  execute v_def;
end $zen$;

-- Verification (lecture seule) : attendu = patch_present true, anon false, authenticated true
select pg_get_functiondef(p.oid) like '%ZENORIA_CONFIRM_VISIBLE_V1%' as patch_present,
       has_function_privilege('anon', p.oid, 'EXECUTE')              as anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE')     as authenticated
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace and p.proname = 'admin_confirm_transfer';
