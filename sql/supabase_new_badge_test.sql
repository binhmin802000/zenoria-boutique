-- ============================================================
-- ZENORIA_NEW_BADGE_V2 : TEST du réglage « new_badge » — à lancer APRÈS supabase_new_badge.sql
-- Tout se passe dans une transaction ANNULÉE à la fin (rollback) : rien n'est conservé en base.
-- Résultat attendu : une série de NOTICE « OK : ... », puis le dernier SELECT qui renvoie « TEST_OK ».
-- Si un contrôle échoue, un message « ÉCHEC DU TEST : ... » s'affiche et la transaction s'arrête.
-- ============================================================
begin;

-- 1) Valeurs VALIDES : doivent être acceptées
do $$
declare v text; good text[] := array[
  '{"enabled": true, "days": 14}', '{"enabled": false, "days": 1}', '{"enabled": true, "days": 90}',
  '{"enabled": false, "days": 30}', '{"days": 7, "enabled": true}'];
begin
  foreach v in array good loop
    delete from public.site_settings where key = 'new_badge';
    insert into public.site_settings (key, value) values ('new_badge', v::jsonb);
    raise notice 'OK : valeur valide acceptée : %', v;
  end loop;
end $$;

-- 2) Valeurs INVALIDES : doivent TOUTES être rejetées par la contrainte (check_violation), sans autre erreur
do $$
declare v text; bad text[] := array[
  '{}', '{"enabled": true}', '{"days": 14}',
  '{"enabled": true, "days": 0}', '{"enabled": true, "days": 91}', '{"enabled": true, "days": -1}', '{"enabled": true, "days": 1000}',
  '{"enabled": true, "days": 14.5}', '{"enabled": true, "days": 14.0}', '{"enabled": true, "days": "14"}',
  '{"enabled": true, "days": null}', '{"enabled": true, "days": true}', '{"enabled": true, "days": [14]}',
  '{"enabled": "true", "days": 14}', '{"enabled": null, "days": 14}', '{"enabled": 1, "days": 14}',
  '{"enabled": true, "days": 14, "mode": "x"}',
  'true', '"texte"', '[1,2]', '5', 'null'];
begin
  foreach v in array bad loop
    begin
      delete from public.site_settings where key = 'new_badge';
      insert into public.site_settings (key, value) values ('new_badge', v::jsonb);
      raise exception 'ÉCHEC DU TEST : la valeur invalide % a été acceptée.', v;
    exception
      when check_violation then
        raise notice 'OK : valeur invalide rejetée proprement : %', v;
    end;
  end loop;
end $$;

-- 3) La contrainte ne touche JAMAIS les autres clés
do $$
begin
  insert into public.site_settings (key, value) values ('zz_autre_reglage', '{"nimporte": "quoi"}'::jsonb);
  raise notice 'OK : une autre clé n''est pas affectée par la contrainte.';
end $$;

-- 4) Lecture par un visiteur ANONYME (le cas réel du site) : la clé « new_badge » est lisible, les autres non
delete from public.site_settings where key = 'new_badge';
insert into public.site_settings (key, value) values ('new_badge', '{"enabled": true, "days": 21}'::jsonb);

set local role anon;
do $$
declare n_badge int; n_autre int;
begin
  select count(*) into n_badge from public.site_settings where key = 'new_badge';
  select count(*) into n_autre from public.site_settings where key = 'zz_autre_reglage';
  if n_badge <> 1 then raise exception 'ÉCHEC DU TEST : un visiteur anonyme ne peut pas lire new_badge (% ligne(s) au lieu de 1). Le site ne verrait pas le réglage.', n_badge; end if;
  if n_autre <> 0 then raise exception 'ÉCHEC DU TEST : un visiteur anonyme peut lire une autre clé non publique (% ligne(s)). La politique est trop large.', n_autre; end if;
  raise notice 'OK : visiteur anonyme : new_badge lisible (1 ligne), autre clé non publique invisible (0 ligne).';
end $$;
reset role;

-- 5) Résultat final (visible dans le tableau de résultats), puis annulation de tout
select 'TEST_OK' as resultat, value from public.site_settings where key = 'new_badge';
rollback;
