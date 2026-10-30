-- ============================================================
-- ROLLBACK LOT 5-BIS-C (SQL) : remet create_transfer_order et admin_extend_transfer dans leur forme d'origine
-- (echeance = maintenant + N jours). Aucune donnee modifiee ; les echeances deja ecrites en fin de journee restent en place.
-- Tout ou rien : s'arrete sans rien modifier si le lot n'est pas applique ou si une ligne attendue est absente.
-- ============================================================
do $$
declare
  c_old_create constant text := 'v_due := now() + make_interval(days => v_delay);';
  c_new_create constant text := 'v_due := (((now() at time zone ''Europe/Paris'')::date + v_delay)::timestamp + interval ''23 hours 59 minutes 59 seconds'') at time zone ''Europe/Paris''; -- ZENORIA_DUE_EOD_V1';
  c_old_extend constant text := 'v_new := greatest(coalesce(v_o.transfer_due_at, now()), now()) + make_interval(days => p_days);';
  c_new_extend constant text := 'v_new := ((greatest((coalesce(v_o.transfer_due_at, now()) at time zone ''Europe/Paris'')::date, (now() at time zone ''Europe/Paris'')::date) + p_days)::timestamp + interval ''23 hours 59 minutes 59 seconds'') at time zone ''Europe/Paris''; -- ZENORIA_DUE_EOD_V1';
  v_create text;
  v_extend text;
begin
  select pg_get_functiondef(p.oid) into v_create from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'create_transfer_order';
  select pg_get_functiondef(p.oid) into v_extend from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'admin_extend_transfer';

  if v_create is null or v_extend is null then raise exception 'ABANDON : fonction introuvable'; end if;
  if (length(v_create) - length(replace(v_create, c_new_create, ''))) / length(c_new_create) <> 1
     or (length(v_extend) - length(replace(v_extend, c_new_extend, ''))) / length(c_new_extend) <> 1 then
    raise exception 'ABANDON : le lot 5-bis-C (SQL) n''est pas applique (ou a ete modifie) ; rien n''a ete modifie';
  end if;

  execute replace(v_create, c_new_create, c_old_create);
  execute replace(v_extend, c_new_extend, c_old_extend);
end $$;

select p.proname, pg_get_functiondef(p.oid) like '%ZENORIA_DUE_EOD_V1%' as patch_present   -- attendu : false, false
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace and p.proname in ('create_transfer_order', 'admin_extend_transfer')
 order by p.proname;
