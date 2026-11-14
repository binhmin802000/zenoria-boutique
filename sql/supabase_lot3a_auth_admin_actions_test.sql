-- ZENORIA_AUTH_ADMIN_ACTIONS_3A_TEST_V1
-- Tests transactionnels. Toutes les donnees de test sont annulees par ROLLBACK.
begin;

do $test$
declare
  v_target uuid := gen_random_uuid();
  v_actor uuid := gen_random_uuid();
  v_id uuid;
  v_allowed boolean;
  v_status text;
  v_next timestamptz;
  v_count integer;
  v_deleted integer;
  i integer;
begin
  if to_regclass('public.auth_admin_actions') is null then
    raise exception 'table auth_admin_actions absente';
  end if;

  -- Droits directs : jamais anon/authenticated ; service_role uniquement.
  if has_table_privilege('anon', 'public.auth_admin_actions', 'SELECT')
     or has_table_privilege('authenticated', 'public.auth_admin_actions', 'SELECT')
     or has_table_privilege('authenticated', 'public.auth_admin_actions', 'INSERT') then
    raise exception 'droits directs trop larges sur auth_admin_actions';
  end if;
  if not has_table_privilege('service_role', 'public.auth_admin_actions', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'droits service_role incomplets';
  end if;

  if not exists (
    select 1 from cron.job
    where jobname = 'zenoria-purge-auth-admin-actions'
      and schedule = '27 3 * * *'
      and command = 'select public.purge_old_auth_admin_actions();'
      and active
  ) then
    raise exception 'tache pg_cron de purge absente ou incorrecte';
  end if;

  -- Les fonctions sensibles ne sont pas executables par authenticated.
  if has_function_privilege('authenticated', 'public.reserve_password_reset_action(uuid,text,uuid,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.complete_password_reset_action(uuid,text,text,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.purge_old_auth_admin_actions()', 'EXECUTE') then
    raise exception 'fonction sensible executable par authenticated';
  end if;

  -- Premiere reservation autorisee.
  select action_id, allowed, status, next_allowed_at
    into v_id, v_allowed, v_status, v_next
  from public.reserve_password_reset_action(v_target, 'cliente@example.fr', v_actor, 'admin@example.fr');
  if not v_allowed or v_status <> 'pending' or v_next <= now() then
    raise exception 'premiere reservation invalide: %, %, %', v_allowed, v_status, v_next;
  end if;

  -- Deuxieme reservation immediate refusee par le cooldown et journalisee.
  select action_id, allowed, status, next_allowed_at
    into v_id, v_allowed, v_status, v_next
  from public.reserve_password_reset_action(v_target, 'cliente@example.fr', v_actor, 'admin@example.fr');
  if v_allowed or v_status <> 'blocked_cooldown' then
    raise exception 'cooldown non applique: %, %', v_allowed, v_status;
  end if;

  -- Terminer l action pending initiale.
  select id into v_id
  from public.auth_admin_actions
  where target_user_id = v_target and status = 'pending'
  order by requested_at
  limit 1;
  perform public.complete_password_reset_action(v_id, 'sent', null, null);
  if not exists (select 1 from public.auth_admin_actions where id = v_id and status = 'sent' and completed_at is not null) then
    raise exception 'completion sent non appliquee';
  end if;

  -- Limite 3/24 h : donnees espacees de plus de 5 min pour ne pas declencher le cooldown.
  delete from public.auth_admin_actions where target_user_id = v_target;
  insert into public.auth_admin_actions(target_user_id,target_email,action,status,requested_at,requested_by,requested_by_email,completed_at)
  values
    (v_target,'cliente@example.fr','password_reset','sent',clock_timestamp()-interval '23 hours',v_actor,'admin@example.fr',clock_timestamp()-interval '23 hours'),
    (v_target,'cliente@example.fr','password_reset','sent',clock_timestamp()-interval '12 hours',v_actor,'admin@example.fr',clock_timestamp()-interval '12 hours'),
    (v_target,'cliente@example.fr','password_reset','sent',clock_timestamp()-interval '6 minutes',v_actor,'admin@example.fr',clock_timestamp()-interval '6 minutes');
  select action_id, allowed, status, next_allowed_at into v_id,v_allowed,v_status,v_next
  from public.reserve_password_reset_action(v_target,'cliente@example.fr',v_actor,'admin@example.fr');
  if v_allowed or v_status <> 'blocked_daily_limit' then
    raise exception 'limite quotidienne non appliquee: %, %',v_allowed,v_status;
  end if;

  -- Limite globale 20/h sur des cibles distinctes, espacees de plus de 5 minutes pour la cible testee.
  delete from public.auth_admin_actions;
  for i in 1..20 loop
    insert into public.auth_admin_actions(target_user_id,target_email,action,status,requested_at,requested_by,requested_by_email,completed_at)
    values (gen_random_uuid(),'cliente'||i||'@example.fr','password_reset','sent',clock_timestamp()-interval '6 minutes',v_actor,'admin@example.fr',clock_timestamp()-interval '6 minutes');
  end loop;
  select action_id, allowed, status, next_allowed_at into v_id,v_allowed,v_status,v_next
  from public.reserve_password_reset_action(v_target,'cliente@example.fr',v_actor,'admin@example.fr');
  if v_allowed or v_status <> 'blocked_global_limit' then
    raise exception 'limite globale non appliquee: %, %',v_allowed,v_status;
  end if;

  -- Les echecs et refus ne consomment pas les quotas.
  delete from public.auth_admin_actions;
  for i in 1..25 loop
    insert into public.auth_admin_actions(target_user_id,target_email,action,status,requested_at,requested_by,requested_by_email,completed_at,error_code)
    values (gen_random_uuid(),'echec'||i||'@example.fr','password_reset','failed',clock_timestamp()-interval '1 minute',v_actor,'admin@example.fr',clock_timestamp()-interval '1 minute','provider_rejected');
  end loop;
  select action_id, allowed, status, next_allowed_at into v_id,v_allowed,v_status,v_next
  from public.reserve_password_reset_action(v_target,'cliente@example.fr',v_actor,'admin@example.fr');
  if not v_allowed or v_status <> 'pending' then
    raise exception 'les echecs consomment a tort le quota: %, %',v_allowed,v_status;
  end if;

  -- Contraintes : une action non pending doit etre terminee.
  begin
    insert into public.auth_admin_actions(target_user_id,target_email,action,status,requested_by,requested_by_email)
    values (gen_random_uuid(),'x@example.fr','password_reset','sent',v_actor,'admin@example.fr');
    raise exception 'contrainte completed_at non appliquee';
  exception when check_violation then null;
  end;

  -- Aucune colonne libre de type metadata/payload permettant de stocker des secrets.
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='auth_admin_actions'
      and column_name in ('metadata','payload','token','password','recovery_url','refresh_token','access_token')
  ) then
    raise exception 'colonne sensible ou libre detectee';
  end if;

  -- Purge : >12 mois supprime ; <12 mois conserve.
  delete from public.auth_admin_actions;
  insert into public.auth_admin_actions(target_user_id,target_email,action,status,requested_at,requested_by,requested_by_email,completed_at)
  values
    (gen_random_uuid(),'ancien@example.fr','password_reset','sent',clock_timestamp()-interval '13 months',v_actor,'admin@example.fr',clock_timestamp()-interval '13 months'),
    (gen_random_uuid(),'recent@example.fr','password_reset','sent',clock_timestamp()-interval '11 months',v_actor,'admin@example.fr',clock_timestamp()-interval '11 months');
  v_deleted := public.purge_old_auth_admin_actions();
  if v_deleted <> 1 then raise exception 'purge: % ligne(s), attendu 1', v_deleted; end if;
  select count(*) into v_count from public.auth_admin_actions;
  if v_count <> 1 then raise exception 'purge a conserve % ligne(s), attendu 1', v_count; end if;

  raise notice 'TEST_OK lot 3A : table, droits, contraintes, cooldown, limites 24h/1h, completion et purge valides.';
end;
$test$;

rollback;
