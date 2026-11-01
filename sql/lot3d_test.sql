-- ============================================================
-- LOT 3d : TEST (rien n'est conserve). A lancer APRES lot3d_apply.sql.
-- Verifie, pour une commande de test appartenant a un compte NON administrateur :
--   1. la lecture DIRECTE de order_status_history par la proprietaire est refusee (table vide renvoyee, RLS) ;
--   2. customer_order_events continue de fonctionner normalement pour cette meme commande ;
--   3. l'administration garde sa lecture directe (regle inchangee).
-- Leve volontairement une erreur a la fin : TOUT est annule.
-- Attendu : « TEST_OK : N controles passes (rien n'est conserve) ».
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

do $zen$
declare
  v_oid bigint;
  v_uid uuid;
  v_email text;
  v_admin_uid uuid;
  v_admin_email text;
  v_cnt integer;
  v_n integer := 0;
begin
  -- Garde-fou : le lot doit etre applique (plus de regle select_own)
  if exists (select 1 from pg_policy where polrelid = 'public.order_status_history'::regclass and polname = 'order_status_history_select_own') then
    raise exception 'ABANDON : le lot 3d n''est pas applique (regle order_status_history_select_own presente)';
  end if;

  -- Une commande de test appartenant a un compte NON administrateur, avec un historique
  select o.id, o.user_id into v_oid, v_uid
    from public.orders o
   where o.is_test is true
     and o.user_id is not null
     and o.user_id not in (select user_id from public.admin_users)
     and exists (select 1 from public.order_status_history h where h.order_id = o.id)
   order by o.id desc limit 1;
  if v_oid is null then raise exception 'ABANDON : aucune commande de test (compte non administrateur, avec historique) trouvee pour le test'; end if;
  select email into v_email from auth.users where id = v_uid;

  select user_id into v_admin_uid from public.admin_users limit 1;
  if v_admin_uid is null then raise exception 'ABANDON : aucun compte administrateur trouve pour le test'; end if;
  select email into v_admin_email from auth.users where id = v_admin_uid;

  -- 1. La proprietaire de la commande ne lit plus directement la table (RLS : 0 ligne, pas une erreur)
  perform pg_temp.zen_as(v_uid, v_email);
  select count(*) into v_cnt from public.order_status_history where order_id = v_oid;
  if v_cnt <> 0 then raise exception 'ECHEC : la proprietaire lit encore % ligne(s) directement dans order_status_history', v_cnt; end if;
  v_n := v_n + 1;

  -- 2. customer_order_events continue de fonctionner pour cette meme commande (au moins une ligne)
  select count(*) into v_cnt from public.customer_order_events(v_oid);
  if v_cnt < 1 then raise exception 'ECHEC : customer_order_events ne renvoie plus rien pour la commande %', v_oid; end if;
  v_n := v_n + 1;

  -- 3. Un compte anonyme (non connecte) : toujours 0 ligne
  perform pg_temp.zen_anon();
  select count(*) into v_cnt from public.order_status_history where order_id = v_oid;
  if v_cnt <> 0 then raise exception 'ECHEC : un visiteur non connecte lit % ligne(s)', v_cnt; end if;
  v_n := v_n + 1;

  -- 4. L'administration garde sa lecture directe (regle inchangee, non testee en ecriture ici)
  perform pg_temp.zen_as(v_admin_uid, v_admin_email);
  select count(*) into v_cnt from public.order_status_history where order_id = v_oid;
  if v_cnt < 1 then raise exception 'ECHEC : l''administration ne lit plus directement order_status_history (% ligne)', v_cnt; end if;
  v_n := v_n + 1;

  raise exception 'TEST_OK : % controles passes (rien n''est conserve)', v_n;
end $zen$;
