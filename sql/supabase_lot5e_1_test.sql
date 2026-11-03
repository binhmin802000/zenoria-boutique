-- ============================================================
-- LOT 5e-1 : TEST de admin_flagged_accounts() (rien n'est conserve)
-- À exécuter APRÈS supabase_lot5e_1_flagged_accounts.sql, en exécutant tout sans sélectionner.
-- Résultat attendu : une erreur « TEST_OK : ... » (c'est voulu : elle annule tout).
-- ============================================================
do $$
declare
  v_secdef boolean;
  v_cfg text[];
  v_anon boolean;
  v_auth boolean;
  v_rows integer;
  v_ref_accounts integer;
  v_ref_max integer;
begin
  -- 1. La fonction existe, en SECURITY DEFINER, avec un search_path fixé
  select p.prosecdef, p.proconfig into v_secdef, v_cfg
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'admin_flagged_accounts';
  if v_secdef is null then raise exception 'ECHEC 1 : fonction absente (exécutez d''abord supabase_lot5e_1_flagged_accounts.sql)'; end if;
  if not v_secdef then raise exception 'ECHEC 1 : la fonction n''est pas SECURITY DEFINER'; end if;
  if v_cfg is null or not exists (select 1 from unnest(v_cfg) c where c like 'search_path=%') then
    raise exception 'ECHEC 1 : search_path non fixé';
  end if;

  -- 2. Droits : anon NON, authenticated OUI
  v_anon := has_function_privilege('anon', 'public.admin_flagged_accounts()', 'EXECUTE');
  v_auth := has_function_privilege('authenticated', 'public.admin_flagged_accounts()', 'EXECUTE');
  if v_anon then raise exception 'ECHEC 2 : anon peut exécuter la fonction'; end if;
  if not v_auth then raise exception 'ECHEC 2 : authenticated ne peut pas exécuter la fonction'; end if;

  -- 3. Sans contexte administrateur (SQL Editor, pas de session), la fonction renvoie 0 ligne
  select count(*) into v_rows from public.admin_flagged_accounts();
  if v_rows <> 0 then raise exception 'ECHEC 3 : % ligne(s) renvoyée(s) hors contexte administrateur', v_rows; end if;

  -- 4. Règle de référence (même requête, sans le contrôle administrateur) : cohérence du seuil
  select count(*), coalesce(max(c), 0) into v_ref_accounts, v_ref_max
  from (
    select o.user_id, count(*) as c
    from public.orders o
    where o.user_id is not null and o.cancelled_by = 'customer'
      and o.cancelled_at >= now() - interval '30 days'
    group by o.user_id
    having count(*) >= 3
  ) t;

  raise exception 'TEST_OK : 3 controles passes (rien n''est conserve). Règle de référence : % compte(s) signalé(s), maximum % annulation(s) pour un compte. Cette règle doit être retrouvée dans l''admin (Preview).', v_ref_accounts, v_ref_max;
end $$;
