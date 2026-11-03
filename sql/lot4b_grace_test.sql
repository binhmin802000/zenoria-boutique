-- ============================================================
-- TEST LOT 4b (rien n'est conservé) : la fonction suit le réglage, et revient à 2 pour une valeur absente.
-- Attendu : « TEST_OK : 4 controles passes (rien n'est conserve) ».
-- ============================================================
do $zen$
declare v integer;
begin
  update public.site_settings set value = jsonb_set(value, '{grace_days}', '5'::jsonb) where key = 'bank_transfer';
  v := public.transfer_grace_days();
  if v <> 5 then raise exception 'ECHEC : grace 5 attendue, obtenu %', v; end if;
  update public.site_settings set value = jsonb_set(value, '{grace_days}', '0'::jsonb) where key = 'bank_transfer';
  v := public.transfer_grace_days();
  if v <> 0 then raise exception 'ECHEC : grace 0 attendue, obtenu %', v; end if;
  update public.site_settings set value = value - 'grace_days' where key = 'bank_transfer';
  v := public.transfer_grace_days();
  if v <> 2 then raise exception 'ECHEC : grace absente -> 2 attendu, obtenu %', v; end if;
  if not has_function_privilege('authenticated', 'public.transfer_grace_days()'::regprocedure, 'EXECUTE') then
    raise exception 'ECHEC : non executable par authenticated';
  end if;
  raise exception 'TEST_OK : 4 controles passes (rien n''est conserve)';
end $zen$;
