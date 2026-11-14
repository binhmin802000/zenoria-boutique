-- ZENORIA_AUTH_ADMIN_ACTIONS_3A_V1
-- Lot 3A : journal, limites atomiques et purge des actions administratives d'authentification.
-- Idempotent : peut etre rejoue sans supprimer les donnees existantes.

begin;

create table if not exists public.auth_admin_actions (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null,
  target_email text not null,
  action text not null,
  status text not null,
  requested_at timestamptz not null default now(),
  requested_by uuid not null,
  requested_by_email text not null,
  completed_at timestamptz,
  error_code text,
  incident_reference text,
  constraint auth_admin_actions_action_valid
    check (action in ('password_reset')),
  constraint auth_admin_actions_status_valid
    check (status in (
      'pending',
      'sent',
      'failed',
      'blocked_cooldown',
      'blocked_daily_limit',
      'blocked_global_limit',
      'account_not_found',
      'email_missing',
      'not_available'
    )),
  constraint auth_admin_actions_target_email_nonempty
    check (length(btrim(target_email)) between 3 and 320),
  constraint auth_admin_actions_requested_by_email_nonempty
    check (length(btrim(requested_by_email)) between 3 and 320),
  constraint auth_admin_actions_completed_consistent
    check (
      (status = 'pending' and completed_at is null)
      or
      (status <> 'pending' and completed_at is not null)
    ),
  constraint auth_admin_actions_error_code_safe
    check (
      error_code is null
      or error_code ~ '^[a-z][a-z0-9_]{0,63}$'
    ),
  constraint auth_admin_actions_incident_reference_safe
    check (
      incident_reference is null
      or incident_reference ~ '^AUTH-[0-9]{8}-[A-Z0-9]{4,12}$'
    )
);

comment on table public.auth_admin_actions is
  'Journal administratif Zenoria des actions d authentification. Ne doit jamais contenir de mot de passe, hash, token, JWT, cookie, cle ou URL de recuperation.';
comment on column public.auth_admin_actions.target_email is
  'Photographie historique de l adresse du compte au moment de l action. L adresse doit etre relue cote serveur depuis Supabase Auth.';
comment on column public.auth_admin_actions.error_code is
  'Code fonctionnel controle uniquement. Ne jamais stocker le message brut du fournisseur.';

create index if not exists auth_admin_actions_target_requested_idx
  on public.auth_admin_actions (target_user_id, requested_at desc);
create index if not exists auth_admin_actions_action_status_requested_idx
  on public.auth_admin_actions (action, status, requested_at desc);
create index if not exists auth_admin_actions_requested_at_idx
  on public.auth_admin_actions (requested_at);
create index if not exists auth_admin_actions_actor_requested_idx
  on public.auth_admin_actions (requested_by, requested_at desc);

alter table public.auth_admin_actions enable row level security;

-- Aucun acces direct depuis anon/authenticated. La lecture admin passe par RPC.
revoke all on table public.auth_admin_actions from public, anon, authenticated;
grant select, insert, update, delete on table public.auth_admin_actions to service_role;

create or replace function public.admin_list_auth_admin_actions(
  p_target_user_id uuid,
  p_limit integer default 10
)
returns table (
  id uuid,
  target_user_id uuid,
  target_email text,
  action text,
  status text,
  requested_at timestamptz,
  requested_by uuid,
  requested_by_email text,
  completed_at timestamptz,
  error_code text,
  incident_reference text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not public.is_admin() then
    raise exception 'administrator access required' using errcode = '42501';
  end if;
  if p_target_user_id is null then
    raise exception 'target user id is required' using errcode = '22004';
  end if;
  return query
  select
    a.id, a.target_user_id, a.target_email, a.action, a.status,
    a.requested_at, a.requested_by, a.requested_by_email,
    a.completed_at, a.error_code, a.incident_reference
  from public.auth_admin_actions a
  where a.target_user_id = p_target_user_id
  order by a.requested_at desc, a.id desc
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
end;
$function$;

revoke all on function public.admin_list_auth_admin_actions(uuid, integer) from public, anon;
grant execute on function public.admin_list_auth_admin_actions(uuid, integer) to authenticated, service_role;

-- Reservation atomique d une demande. Cette fonction sera utilisee par la future route serveur.
-- Elle journalise egalement les refus de limite. Seuls pending/sent consomment les quotas.
create or replace function public.reserve_password_reset_action(
  p_target_user_id uuid,
  p_target_email text,
  p_requested_by uuid,
  p_requested_by_email text
)
returns table (
  action_id uuid,
  allowed boolean,
  status text,
  next_allowed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_status text;
  v_next timestamptz;
  v_id uuid;
  v_daily_count integer;
  v_global_count integer;
begin
  if p_target_user_id is null or p_requested_by is null then
    raise exception 'target and actor ids are required' using errcode = '22004';
  end if;
  if length(btrim(coalesce(p_target_email, ''))) not between 3 and 320
     or length(btrim(coalesce(p_requested_by_email, ''))) not between 3 and 320 then
    raise exception 'valid target and actor emails are required' using errcode = '22023';
  end if;

  -- Un verrou global serialise le controle des 20/h. Le verrou par cible renforce la lisibilite du protocole.
  perform pg_advisory_xact_lock(hashtextextended('zenoria:auth-admin-actions:global', 0));
  perform pg_advisory_xact_lock(hashtextextended('zenoria:auth-admin-actions:target:' || p_target_user_id::text, 0));

  select max(a.requested_at + interval '5 minutes')
    into v_next
  from public.auth_admin_actions a
  where a.target_user_id = p_target_user_id
    and a.action = 'password_reset'
    and a.status in ('pending', 'sent')
    and a.requested_at > v_now - interval '5 minutes';

  if v_next is not null and v_next > v_now then
    v_status := 'blocked_cooldown';
  else
    select count(*)::integer, min(a.requested_at + interval '24 hours')
      into v_daily_count, v_next
    from public.auth_admin_actions a
    where a.target_user_id = p_target_user_id
      and a.action = 'password_reset'
      and a.status in ('pending', 'sent')
      and a.requested_at > v_now - interval '24 hours';

    if v_daily_count >= 3 then
      v_status := 'blocked_daily_limit';
    else
      select count(*)::integer, min(a.requested_at + interval '1 hour')
        into v_global_count, v_next
      from public.auth_admin_actions a
      where a.action = 'password_reset'
        and a.status in ('pending', 'sent')
        and a.requested_at > v_now - interval '1 hour';

      if v_global_count >= 20 then
        v_status := 'blocked_global_limit';
      else
        v_status := 'pending';
        v_next := v_now + interval '5 minutes';
      end if;
    end if;
  end if;

  insert into public.auth_admin_actions (
    target_user_id, target_email, action, status, requested_at,
    requested_by, requested_by_email, completed_at
  ) values (
    p_target_user_id, btrim(p_target_email), 'password_reset', v_status, v_now,
    p_requested_by, btrim(p_requested_by_email),
    case when v_status = 'pending' then null else v_now end
  ) returning id into v_id;

  return query select v_id, (v_status = 'pending'), v_status, v_next;
end;
$function$;

revoke all on function public.reserve_password_reset_action(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.reserve_password_reset_action(uuid, text, uuid, text) to service_role;

create or replace function public.complete_password_reset_action(
  p_action_id uuid,
  p_status text,
  p_error_code text default null,
  p_incident_reference text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_status not in ('sent', 'failed', 'account_not_found', 'email_missing', 'not_available') then
    raise exception 'invalid completion status' using errcode = '22023';
  end if;
  update public.auth_admin_actions
  set status = p_status,
      completed_at = clock_timestamp(),
      error_code = p_error_code,
      incident_reference = p_incident_reference
  where id = p_action_id
    and status = 'pending';
  if not found then
    raise exception 'pending action not found' using errcode = 'P0002';
  end if;
end;
$function$;

revoke all on function public.complete_password_reset_action(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.complete_password_reset_action(uuid, text, text, text) to service_role;

create or replace function public.purge_old_auth_admin_actions()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_deleted integer;
begin
  delete from public.auth_admin_actions
  where requested_at < clock_timestamp() - interval '12 months';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$function$;

revoke all on function public.purge_old_auth_admin_actions() from public, anon, authenticated;
grant execute on function public.purge_old_auth_admin_actions() to service_role;

-- Purge quotidienne a 03:27 UTC. Le nom rend la planification rejouable sans doublon.
do $cron_setup$
declare
  v_job_id bigint;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception 'pg_cron extension is required for the 12-month purge';
  end if;
  for v_job_id in
    select jobid from cron.job where jobname = 'zenoria-purge-auth-admin-actions'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
  perform cron.schedule(
    'zenoria-purge-auth-admin-actions',
    '27 3 * * *',
    'select public.purge_old_auth_admin_actions();'
  );
end;
$cron_setup$;

commit;
