-- ============================================================
-- ZENORIA : test de la contrainte « grid_order » (À EXÉCUTER APRÈS supabase_grid_order.sql)
--
-- Le test essaie d'enregistrer des valeurs fausses (elles doivent être refusées) puis des valeurs justes (elles doivent
-- être acceptées), le tout dans une transaction ANNULÉE à la fin : rien ne reste en base.
-- Résultat attendu : une ligne « TEST_OK ».
-- Si une erreur s'affiche, exécutez « rollback; » pour fermer la transaction, puis envoyez-moi le message d'erreur.
-- ============================================================

begin;

do $$
declare
  v text;
  refusees text[] := array[
    '{"mode":"random","everyDays":0,"shuffledAt":""}',
    '{"mode":"random","everyDays":31,"shuffledAt":""}',
    '{"mode":"random","everyDays":2.5,"shuffledAt":""}',
    '{"mode":"random","everyDays":"7","shuffledAt":""}',
    '{"mode":"aleatoire","everyDays":1,"shuffledAt":""}',
    '{"everyDays":1,"shuffledAt":""}',
    '{"mode":"random","shuffledAt":""}',
    '{"mode":"random","everyDays":1,"shuffledAt":5}',
    '{"mode":"random","everyDays":1,"shuffledAt":null}',
    '[1,2]',
    '"texte"'
  ];
  acceptees text[] := array[
    '{"mode":"random","everyDays":1,"shuffledAt":""}',
    '{"mode":"manual","everyDays":30,"shuffledAt":"2026-11-06T14:32:10.123Z"}',
    '{"mode":"random","everyDays":7}',
    '{"mode":"random","everyDays":1.0,"shuffledAt":""}'
  ];
begin
  -- Valeurs fausses : chacune doit être refusée par la contrainte
  foreach v in array refusees loop
    begin
      insert into public.site_settings (key, value) values ('grid_order', v::jsonb);
      raise exception 'ACCEPTEE A TORT : %', v;
    exception
      when check_violation then
        null; -- refus attendu
    end;
  end loop;

  -- Valeurs justes : chacune doit être acceptée (puis retirée aussitôt)
  foreach v in array acceptees loop
    insert into public.site_settings (key, value) values ('grid_order', v::jsonb);
    delete from public.site_settings where key = 'grid_order';
  end loop;

  -- Les autres réglages ne sont pas concernés par la contrainte
  if (select count(*) from public.site_settings where key = 'grid_order') <> 0 then
    raise exception 'Une ligne grid_order est restee en base.';
  end if;
end
$$;

rollback;

select 'TEST_OK : 11 valeurs refusees, 4 valeurs acceptees, rien enregistre' as resultat;
